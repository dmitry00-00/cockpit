import type { ImportedContent } from '../../engine/state';
import { MONSTER_BENCHMARKS, MONSTER_BENCHMARK_SOURCE, type MonsterBenchmark } from '../convert/a5eMonsterBenchmark';
import { ABILITY_IDS, type AbilityId } from '../srd/abilities';
import type { Monster, MonsterAction } from '../srd/monsters';
import { containsNumericNarrative, CR_MONSTER_NARRATIVE_PROMPT_VERSION, parseMonsterNarrativeOutput, type LocalMonsterNarrativeResult, type MonsterNarrative } from './localMonsterNarrative';

export const GENERATED_CR_MONSTER_FORMAT = 'cockpit.generated-cr-monster/1' as const;
export const GENERATED_CR_MONSTER_VERSION = 'p7-a5e-cr-monster-v1' as const;

const HIT_DIE_BY_SIZE: Readonly<Record<string, { sides: number; average: number }>> = {
  Tiny: { sides: 4, average: 2.5 }, Small: { sides: 6, average: 3.5 }, Medium: { sides: 8, average: 4.5 },
  Large: { sides: 10, average: 5.5 }, Huge: { sides: 12, average: 6.5 }, Gargantuan: { sides: 20, average: 10.5 },
};
const DAMAGE_TYPES = ['bludgeoning', 'piercing', 'slashing', 'acid', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'poison', 'psychic', 'radiant', 'thunder'] as const;
export interface CrMonsterInput {
  targetCr: string;
  size: keyof typeof HIT_DIE_BY_SIZE;
  creatureType: string;
  alignment: string;
  speed: number;
  abilities: Readonly<Record<AbilityId, number>>;
  primaryAbility: AbilityId;
  attackName: string;
  damageType: (typeof DAMAGE_TYPES)[number];
  reach: number;
  languages: string;
}

export interface CrMonsterNumericAttribution {
  path: string;
  value: number | string;
  attribution: 'author-input' | 'a5e-benchmark' | 'derived-by-profile';
  sourceRef: string;
  ruleSourceRefs: readonly string[];
}

export interface CrMonsterEstimate {
  defensiveCr: string;
  offensiveCr: string;
  estimatedCr: string;
  distanceFromTargetInCrSteps: number;
  status: 'within-one-step' | 'warning-two-steps' | 'rejected-over-two-steps';
}

export interface GeneratedCrMonsterData {
  format: typeof GENERATED_CR_MONSTER_FORMAT;
  version: typeof GENERATED_CR_MONSTER_VERSION;
  rulesSource: {
    system: 'D&D 5e / 2014 candidate';
    benchmark: typeof MONSTER_BENCHMARK_SOURCE;
    license: 'CC BY 4.0';
    layer: 'HB';
  };
  input: CrMonsterInput;
  benchmarkRef: string;
  block: Monster;
  estimate: CrMonsterEstimate;
  numericAttributions: readonly CrMonsterNumericAttribution[];
  narrative: MonsterNarrative;
  model: string;
  promptVersion: string;
  generatedAt: string;
  parameters: Readonly<Record<string, string | number | boolean>>;
  rawOutput: string;
  status: 'pending-review';
}

function escapePointer(part: string | number) { return String(part).replace(/~/g, '~0').replace(/\//g, '~1'); }
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function abilityMod(score: number) { return Math.floor((score - 10) / 2); }

function numericFields(value: unknown, path = ''): Array<{ path: string; value: number | string }> {
  if (typeof value === 'number' && Number.isFinite(value)) return [{ path, value }];
  if (typeof value === 'string' && /\p{N}/u.test(value)) return [{ path, value }];
  if (Array.isArray(value)) return value.flatMap((child, index) => numericFields(child, `${path}/${index}`));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => numericFields(child, `${path}/${escapePointer(key)}`));
}

function benchmarkFor(cr: string) {
  const index = MONSTER_BENCHMARKS.findIndex(row => row.cr === cr);
  if (index < 0) throw new Error(`CR ${cr} отсутствует в открытой таблице A5E 19.1.`);
  return { row: MONSTER_BENCHMARKS[index], index };
}

function damageExpression(targetAverage: number) {
  const candidates: Array<{ dice: number; sides: number; bonus: number; average: number }> = [];
  for (const sides of [4, 6, 8, 10, 12, 20]) for (let dice = 1; dice <= 24; dice++) {
    const rawBonus = Math.round(targetAverage - dice * (sides + 1) / 2);
    for (const bonus of [rawBonus - 1, rawBonus, rawBonus + 1]) {
      if (dice + bonus < 0) continue;
      candidates.push({ dice, sides, bonus, average: dice * (sides + 1) / 2 + bonus });
    }
  }
  candidates.sort((a, b) => Math.abs(a.average - targetAverage) - Math.abs(b.average - targetAverage) ||
    Math.abs(a.bonus) - Math.abs(b.bonus) || a.dice - b.dice || a.sides - b.sides);
  const best = candidates[0];
  if (!best) throw new Error('Не удалось подобрать формулу урона из таблицы DPR.');
  return {
    formula: `${best.dice}d${best.sides}${best.bonus > 0 ? ` + ${best.bonus}` : best.bonus < 0 ? ` - ${Math.abs(best.bonus)}` : ''}`,
    average: best.average,
  };
}

function estimateCr(ac: number, hp: number, dpr: number, toHit: number, target: string): CrMonsterEstimate {
  const defensive = [...MONSTER_BENCHMARKS].sort((a, b) => {
    const hpA = Math.max(1, a.hp * (1 - 0.05 * (ac - a.ac)));
    const hpB = Math.max(1, b.hp * (1 - 0.05 * (ac - b.ac)));
    return Math.abs(Math.log(hp / hpA)) - Math.abs(Math.log(hp / hpB));
  })[0];
  const offensive = [...MONSTER_BENCHMARKS].sort((a, b) => {
    const score = (row: MonsterBenchmark) => Math.abs(dpr - row.damagePerRound) / Math.max(row.damagePerRound, 1) + Math.abs(toHit - row.proficiencyBonus - row.abilityBonus) / 10;
    return score(a) - score(b);
  })[0];
  const estimatedIndex = Math.round((MONSTER_BENCHMARKS.indexOf(defensive) + MONSTER_BENCHMARKS.indexOf(offensive)) / 2);
  const estimatedCr = MONSTER_BENCHMARKS[estimatedIndex].cr;
  const distance = Math.abs(MONSTER_BENCHMARKS.findIndex(row => row.cr === target) - estimatedIndex);
  return {
    defensiveCr: defensive.cr,
    offensiveCr: offensive.cr,
    estimatedCr,
    distanceFromTargetInCrSteps: distance,
    status: distance <= 1 ? 'within-one-step' : distance === 2 ? 'warning-two-steps' : 'rejected-over-two-steps',
  };
}

function numericAttributions(input: CrMonsterInput, block: Monster, estimate: CrMonsterEstimate, benchmarkRef: string, hitDice: number, contentId: string): CrMonsterNumericAttribution[] {
  const abilities = new Set<string>(ABILITY_IDS.map(id => `/abilities/${id}`));
  const userInputRef = (path: string) => `generated/${escapePointer(contentId)}#/data/generatedCrMonster/input${path}`;
  const inputClaims = numericFields(input).map(field => ({
    ...field,
    path: `/input${field.path}`,
    attribution: 'author-input' as const,
    sourceRef: userInputRef(field.path),
    ruleSourceRefs: ['generatedCrMonster.input snapshot; UI default or author edit'],
  }));
  const estimateClaims = numericFields(estimate).map(field => ({
    ...field,
    path: `/estimate${field.path}`,
    attribution: 'derived-by-profile' as const,
    sourceRef: 'src/rules/generation/crMonster.ts#estimateCr',
    ruleSourceRefs: ['diagnostic two-axis estimate; not an official CR rule', 'src/rules/convert/a5eMonsterBenchmark.ts#MONSTER_BENCHMARKS'],
  }));
  const blockClaims = numericFields(block).map((field): CrMonsterNumericAttribution => {
    if (abilities.has(field.path)) {
      const ability = field.path.split('/').pop() as AbilityId;
      return { ...field, attribution: 'author-input', sourceRef: userInputRef(`/abilities/${ability}`), ruleSourceRefs: ['user-selected ability score'] };
    }
    if (field.path === '/speed' || field.path === '/speedText') {
      return { ...field, attribution: 'author-input', sourceRef: userInputRef('/speed'), ruleSourceRefs: ['author-selected walking speed'] };
    }
    if (field.path === '/languages') {
      return { ...field, attribution: 'author-input', sourceRef: userInputRef('/languages'), ruleSourceRefs: ['author-entered language text'] };
    }
    if (field.path === '/ac/value' || field.path === '/cr' || field.path === '/xp' || field.path === '/proficiencyBonus' || field.path === '/traits/0/text') {
      return { ...field, attribution: 'a5e-benchmark', sourceRef: benchmarkRef, ruleSourceRefs: [MONSTER_BENCHMARK_SOURCE.name] };
    }
    if (field.path.startsWith('/hp/')) {
      return { ...field, attribution: 'derived-by-profile', sourceRef: `${benchmarkRef}/hp`, ruleSourceRefs: [...CR_MONSTER_RULE_SOURCE_REFS, `hitDice=${hitDice}`, `CON=${input.abilities.con}`] };
    }
    if (field.path === '/actions/0/attack/toHit') {
      return { ...field, attribution: 'derived-by-profile', sourceRef: `${benchmarkRef}/proficiencyBonus`, ruleSourceRefs: [`${userInputRef(`/abilities/${input.primaryAbility}`)}`, 'src/campaign/derive.ts#abilityMod', 'attack bonus = PB + selected ability modifier'] };
    }
    if (field.path === '/actions/0/attack/reach') {
      return { ...field, attribution: 'author-input', sourceRef: userInputRef('/reach'), ruleSourceRefs: ['author-selected melee reach'] };
    }
    if (field.path === '/actions/0/attack/damageType') {
      return { ...field, attribution: 'author-input', sourceRef: userInputRef('/damageType'), ruleSourceRefs: ['author-selected damage type'] };
    }
    if (field.path === '/actions/0/text') {
      return { ...field, attribution: 'derived-by-profile', sourceRef: `${benchmarkRef}/damagePerRound`, ruleSourceRefs: [
        'src/rules/generation/crMonster.ts#buildCrMonster', `${benchmarkRef}/proficiencyBonus`, `${userInputRef(`/abilities/${input.primaryAbility}`)}`,
        `${userInputRef('/reach')}`, `${benchmarkRef}/damagePerRound`, `benchmark attacks=${MONSTER_BENCHMARKS.find(row => row.cr === input.targetCr)?.attacks}`,
      ] };
    }
    if (field.path.startsWith('/actions/0/attack/')) {
      return { ...field, attribution: 'derived-by-profile', sourceRef: `${benchmarkRef}/damagePerRound`, ruleSourceRefs: ['src/rules/generation/crMonster.ts#damageExpression', `benchmark attacks=${MONSTER_BENCHMARKS.find(row => row.cr === input.targetCr)?.attacks}`] };
    }
    if (field.path === '/senses') {
      return { ...field, attribution: 'derived-by-profile', sourceRef: userInputRef('/abilities/wis'), ruleSourceRefs: ['src/campaign/derive.ts#passivePerception'] };
    }
    return { ...field, attribution: 'derived-by-profile', sourceRef: benchmarkRef, ruleSourceRefs: CR_MONSTER_RULE_SOURCE_REFS };
  });
  return [...inputClaims, ...estimateClaims, ...blockClaims];
}

const CR_MONSTER_RULE_SOURCE_REFS = ['src/rules/generation/crMonster.ts#buildCrMonster', 'src/rules/convert/a5eMonsterBenchmark.ts#MONSTER_BENCHMARKS'] as const;

export function buildCrMonster(input: CrMonsterInput, name: string, contentId = 'preview'): { block: Monster; benchmark: MonsterBenchmark; benchmarkRef: string; estimate: CrMonsterEstimate; numericAttributions: readonly CrMonsterNumericAttribution[] } {
  const { row, index } = benchmarkFor(input.targetCr);
  const sizeDie = HIT_DIE_BY_SIZE[input.size];
  if (!sizeDie) throw new Error('Размер не поддержан таблицей костей хитов SRD 5.1.');
  if (!name.trim() || containsNumericNarrative(name) || !input.attackName.trim() || input.attackName.length > 80 || containsNumericNarrative(input.attackName)) throw new Error('Имя монстра и атаки должны быть заполнены без чисел.');
  if (!input.creatureType.trim() || input.creatureType.length > 80 || containsNumericNarrative(input.creatureType) || !input.alignment.trim() || input.alignment.length > 80 || containsNumericNarrative(input.alignment)) throw new Error('Тип существа и мировоззрение должны быть заполнены текстом без чисел.');
  if (!Number.isInteger(input.speed) || input.speed < 0 || input.speed > 300) throw new Error('Скорость должна быть целым числом от 0 до 300 футов.');
  if (!Number.isInteger(input.reach) || input.reach < 5 || input.reach > 30 || input.reach % 5 !== 0) throw new Error('Досягаемость должна быть 5–30 футов с шагом 5.');
  if (typeof input.languages !== 'string' || input.languages.length > 160 || containsNumericNarrative(input.languages)) throw new Error('Языки должны быть текстом без чисел (не более 160 символов).');
  if (!ABILITY_IDS.includes(input.primaryAbility)) throw new Error('Основная характеристика атаки не распознана.');
  for (const ability of ABILITY_IDS) if (!Number.isInteger(input.abilities[ability]) || input.abilities[ability] < 1 || input.abilities[ability] > 30) throw new Error(`${ability.toUpperCase()}: характеристика должна быть целым числом 1–30.`);
  if (!DAMAGE_TYPES.includes(input.damageType)) throw new Error('Неизвестный тип урона.');

  const conMod = abilityMod(input.abilities.con);
  const hpPerDie = sizeDie.average + conMod;
  if (hpPerDie <= 0) throw new Error('При этой кости хитов и Телосложении среднее здоровье не положительно.');
  const hitDice = Math.max(1, Math.round(row.hp / hpPerDie));
  const hpAverage = Math.max(1, Math.round(hitDice * hpPerDie));
  const hpBonus = conMod * hitDice;
  const hpFormula = `${hitDice}d${sizeDie.sides}${hpBonus > 0 ? ` + ${hpBonus}` : hpBonus < 0 ? ` - ${Math.abs(hpBonus)}` : ''}`;
  const toHit = row.proficiencyBonus + abilityMod(input.abilities[input.primaryAbility]);
  const damage = damageExpression(row.damagePerRound / row.attacks);
  const displayedDamage = Math.round(damage.average);
  const multiattack: MonsterAction = { name: 'Multiattack', text: `The monster makes ${row.attacks} attacks when it takes the Attack action.` };
  const attack: MonsterAction = {
    name: input.attackName.trim(),
    text: `Melee Weapon Attack: ${toHit >= 0 ? `+${toHit}` : toHit} to hit, reach ${input.reach} ft., one target. Hit: ${displayedDamage} (${damage.formula}) ${input.damageType} damage.`,
    attack: { toHit, reach: input.reach, damage: damage.formula, average: displayedDamage, damageType: input.damageType },
  };
  const block: Monster = {
    id: 'generated-cr-monster', name: name.trim(), size: input.size, type: input.creatureType.trim(), alignment: input.alignment.trim(),
    ac: { value: row.ac, source: `A5E SRD benchmark · CR ${row.cr}` },
    hp: { average: hpAverage, formula: hpFormula }, speed: input.speed, speedText: `${input.speed} ft.`, abilities: { ...input.abilities },
    savingThrows: {}, skills: {}, damageVulnerabilities: [], damageResistances: [], damageImmunities: [], conditionImmunities: [],
    senses: `passive Perception ${10 + abilityMod(input.abilities.wis)}`, languages: input.languages.trim() || '—', cr: row.cr, xp: row.xp,
    proficiencyBonus: row.proficiencyBonus, traits: [multiattack], actions: [attack], reactions: [],
    source: 'Generated CR candidate; mechanics derived from an attributed A5E SRD table and author inputs',
  };
  const expectedDpr = damage.average * row.attacks;
  const estimate = estimateCr(block.ac.value, block.hp.average, expectedDpr, toHit, row.cr);
  const benchmarkRef = `src/rules/convert/a5eMonsterBenchmark.ts#MONSTER_BENCHMARKS[${index}]`;
  return { block, benchmark: row, benchmarkRef, estimate, numericAttributions: numericAttributions(input, block, estimate, benchmarkRef, hitDice, contentId) };
}

export function generatedCrMonsterData(content: ImportedContent): GeneratedCrMonsterData | undefined {
  const value = content.data.generatedCrMonster;
  return isRecord(value) ? value as unknown as GeneratedCrMonsterData : undefined;
}

export function makeGeneratedCrMonsterContent(input: CrMonsterInput, result: LocalMonsterNarrativeResult, id: string): ImportedContent {
  const built = buildCrMonster(input, result.narrative.name, id);
  const generatedCrMonster: GeneratedCrMonsterData = {
    format: GENERATED_CR_MONSTER_FORMAT,
    version: GENERATED_CR_MONSTER_VERSION,
    rulesSource: { system: 'D&D 5e / 2014 candidate', benchmark: MONSTER_BENCHMARK_SOURCE, license: 'CC BY 4.0', layer: 'HB' },
    input: structuredClone(input),
    benchmarkRef: built.benchmarkRef,
    block: built.block,
    estimate: built.estimate,
    numericAttributions: built.numericAttributions,
    narrative: result.narrative,
    model: result.model,
    promptVersion: result.promptVersion,
    generatedAt: result.generatedAt,
    parameters: { ...result.parameters },
    rawOutput: result.rawOutput,
    status: 'pending-review',
  };
  const content: ImportedContent = {
    id,
    kind: 'monster',
    name: result.narrative.name,
    sourceFormat: 'json',
    sourceFile: `generated/a5e-cr/${input.targetCr}`,
    rights: { status: 'unverified', license: 'Статистическая таблица: A5E SRD 19.1, CC BY 4.0 с атрибуцией. Выборы автора и локально созданная биография; результат — проверяемый черновик слоя HB, права на дальнейшее распространение не подтверждены.' },
    data: { generatedCrMonster },
  };
  const error = validateGeneratedCrMonster(content);
  if (error) throw new Error(error);
  return content;
}

export function validateGeneratedCrMonster(content: ImportedContent): string | null {
  const generated = generatedCrMonsterData(content);
  if (content.kind !== 'monster' || !generated || generated.format !== GENERATED_CR_MONSTER_FORMAT || generated.version !== GENERATED_CR_MONSTER_VERSION || generated.status !== 'pending-review') return 'Неизвестный формат CR-генерации монстра.';
  try {
    const rebuilt = buildCrMonster(generated.input, generated.narrative?.name, content.id);
    if (generated.rulesSource?.system !== 'D&D 5e / 2014 candidate' || generated.rulesSource.license !== 'CC BY 4.0' || generated.rulesSource.layer !== 'HB' ||
        JSON.stringify(generated.rulesSource.benchmark) !== JSON.stringify(MONSTER_BENCHMARK_SOURCE) || generated.benchmarkRef !== rebuilt.benchmarkRef ||
        content.name !== generated.narrative?.name || JSON.stringify(generated.block) !== JSON.stringify(rebuilt.block) ||
        JSON.stringify(generated.estimate) !== JSON.stringify(rebuilt.estimate) || JSON.stringify(generated.numericAttributions) !== JSON.stringify(rebuilt.numericAttributions)) return 'CR-кандидат, формулы или ссылки на benchmark изменились.';
    if (!generated.narrative || ['name', 'appearance', 'behavior', 'habitat'].some(key => typeof generated.narrative[key as keyof MonsterNarrative] !== 'string' || !generated.narrative[key as keyof MonsterNarrative].trim() || containsNumericNarrative(generated.narrative[key as keyof MonsterNarrative]))) return 'Текст модели пуст или содержит неподтверждённые числа.';
    if (JSON.stringify(parseMonsterNarrativeOutput(generated.rawOutput)) !== JSON.stringify(generated.narrative)) return 'Сохранённое описание не совпадает с исходным ответом модели.';
    if (content.sourceFile !== `generated/a5e-cr/${generated.input.targetCr}`) return 'Путь происхождения CR-черновика изменился.';
    if (generated.estimate.status === 'rejected-over-two-steps') return 'Оценка CR расходится с целевым значением более чем на две ступени.';
    if (generated.promptVersion !== CR_MONSTER_NARRATIVE_PROMPT_VERSION || typeof generated.model !== 'string' || !generated.model.trim() || !Number.isFinite(Date.parse(generated.generatedAt)) ||
        typeof generated.rawOutput !== 'string' || !isRecord(generated.parameters)) return 'Отсутствуют корректные метаданные генерации.';
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

