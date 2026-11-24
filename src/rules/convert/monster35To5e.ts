import { MONSTER_BENCHMARKS, MONSTER_BENCHMARK_SOURCE, type MonsterBenchmark } from './a5eMonsterBenchmark';
import {
  classifyDerivedTarget,
  classifyConversionSource,
  type ConversionJudgment,
  type ConversionLedgerEntry,
  type ConversionLoss,
  type ConversionSourceClassification,
  type ConversionTargetClassification,
} from './conversionAudit';

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type ThreeFiveSave = 'fort' | 'ref' | 'will';
export type FiveESave = 'con' | 'dex' | 'wis';

export interface Dnd35MonsterInput {
  id: string;
  name: string;
  size: string;
  type: string;
  alignment: string;
  cr: string;
  ac: number;
  naturalArmorBonus: number;
  hp: { average: number; hitDice: number; formula: string };
  speedFt: number;
  languages: string;
  abilities: Readonly<Record<Ability, number>>;
  saves: Readonly<Record<ThreeFiveSave, number>>;
  skills: readonly { name: string; ability: Ability; bonus: number; mapsTo?: string }[];
  senses: { lowLightVision?: boolean; scent?: boolean };
  conditionalSkillBonuses?: readonly { skill: string; bonus: number; condition: string }[];
  feats: readonly string[];
  attacks: readonly {
    name: string;
    attackBonus: number;
    ability: Ability;
    damageFormula: string;
    damageType?: string;
    effect?: 'trip';
  }[];
  source: {
    title: string;
    url: string;
    license: string;
    attribution: string;
  };
}

export interface ConvertedMonsterCandidate {
  id: string;
  name: string;
  size: string;
  type: string;
  alignment: string;
  ac: { value: number; source: string };
  hp: { average: number; formula: string };
  speed: { walk: number };
  abilities: Readonly<Record<Ability, number>>;
  savingThrows: Partial<Record<FiveESave, number>>;
  skills: Readonly<Record<string, number>>;
  senses: string;
  languages: string;
  cr: string;
  xp: number;
  proficiencyBonus: number;
  actions: readonly {
    name: string;
    attack: {
      toHit: number;
      damage: string;
      average: number;
      damageType: string;
    };
    onHitEffect?: { save: { ability: 'str'; dc: number }; onFailure: 'prone' };
  }[];
}

export interface MonsterConversionResult {
  status: 'converted';
  reviewStatus: 'pending-manual-review';
  profile: {
    id: 'dnd35-srd-to-dnd5e-2014-a5e-baseline-v0';
    status: 'draft-owner-policy-not-approved';
    sourceEdition: 'D&D 3.5 SRD';
    targetEdition: 'D&D 5e / 2014';
    combatConstruction: typeof MONSTER_BENCHMARK_SOURCE;
  };
  source: Dnd35MonsterInput['source'] & { edition: 'D&D 3.5 SRD' };
  sourceClassification: ConversionSourceClassification;
  targetClassification: ConversionTargetClassification;
  sourceRecord: Dnd35MonsterInput;
  distribution: 'internal-review';
  targetCrWasSelectedByCaller: true;
  target: ConvertedMonsterCandidate;
  estimate: {
    defensiveCr: string;
    offensiveCr: string;
    estimatedCr: string;
    distanceFromTargetInCrSteps: number;
    withinOneCrStep: boolean;
  };
  ledger: readonly ConversionLedgerEntry[];
  losses: readonly ConversionLoss[];
  judgments: readonly ConversionJudgment[];
}

const SIZE_HIT_DIE: Readonly<Record<string, number>> = {
  Tiny: 4,
  Small: 6,
  Medium: 8,
  Large: 10,
  Huge: 12,
  Gargantuan: 20,
};

const TYPE_MAP: Readonly<Record<string, string>> = { animal: 'beast' };

const SKILL_MAP: Readonly<Record<string, string>> = {
  hide: 'Stealth',
  'move silently': 'Stealth',
  listen: 'Perception',
  spot: 'Perception',
  search: 'Investigation',
  climb: 'Athletics',
  jump: 'Athletics',
  swim: 'Athletics',
  balance: 'Acrobatics',
  tumble: 'Acrobatics',
  'escape artist': 'Acrobatics',
  survival: 'Survival',
};

const SAVE_MAP: Readonly<Record<ThreeFiveSave, FiveESave>> = {
  fort: 'con',
  ref: 'dex',
  will: 'wis',
};

const mod = (score: number): number => Math.floor((score - 10) / 2);

function tableRow(cr: string): MonsterBenchmark {
  const row = MONSTER_BENCHMARKS.find(candidate => candidate.cr === cr);
  if (!row) throw new Error(`Unsupported target CR for the current benchmark: ${cr}`);
  return row;
}

function parseDice(formula: string): { count: number; sides: number; modifier: number } | null {
  const match = formula.match(/^\s*(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?\s*$/i);
  if (!match) return null;
  const [, countText, sidesText, sign, modifierText] = match;
  const modifier = Number(modifierText ?? 0) * (sign === '-' ? -1 : 1);
  return { count: Number(countText), sides: Number(sidesText), modifier };
}

function damageAverage(formula: string): number {
  const parsed = parseDice(formula);
  if (!parsed) throw new Error(`Unsupported damage formula: ${formula}`);
  return parsed.count * (parsed.sides + 1) / 2 + parsed.modifier;
}

function estimateCr(target: ConvertedMonsterCandidate): MonsterConversionResult['estimate'] {
  const bestAttack = target.actions.reduce((best, action) => Math.max(best, action.attack.average), 0);
  const bestToHit = target.actions.reduce((best, action) => Math.max(best, action.attack.toHit), 0);

  const defensive = [...MONSTER_BENCHMARKS].sort((a, b) => {
    const adjustedA = Math.max(1, a.hp * (1 - 0.05 * (target.ac.value - a.ac)));
    const adjustedB = Math.max(1, b.hp * (1 - 0.05 * (target.ac.value - b.ac)));
    return Math.abs(Math.log(target.hp.average / adjustedA)) - Math.abs(Math.log(target.hp.average / adjustedB));
  })[0];

  const offensive = [...MONSTER_BENCHMARKS].sort((a, b) => {
    const score = (row: MonsterBenchmark) =>
      Math.abs(bestAttack - row.damagePerRound) / Math.max(row.damagePerRound, 1) +
      Math.abs(bestToHit - row.proficiencyBonus - row.abilityBonus) / 10;
    return score(a) - score(b);
  })[0];

  const estimateIndex = (MONSTER_BENCHMARKS.findIndex(row => row.cr === defensive.cr) +
    MONSTER_BENCHMARKS.findIndex(row => row.cr === offensive.cr)) / 2;
  const estimated = MONSTER_BENCHMARKS[Math.round(estimateIndex)].cr;
  const targetIndex = MONSTER_BENCHMARKS.findIndex(row => row.cr === target.cr);
  const estimatedIndex = MONSTER_BENCHMARKS.findIndex(row => row.cr === estimated);
  return {
    defensiveCr: defensive.cr,
    offensiveCr: offensive.cr,
    estimatedCr: estimated,
    distanceFromTargetInCrSteps: Math.abs(targetIndex - estimatedIndex),
    withinOneCrStep: Math.abs(targetIndex - estimatedIndex) <= 1,
  };
}

/**
 * Draft 3.5 SRD → 5e/2014 monster conversion. The caller must choose target CR;
 * this profile is intentionally stamped as provisional and never accepts the result.
 */
export function convert35MonsterTo5e2014(source: Dnd35MonsterInput, targetCr: string): MonsterConversionResult {
  const row = tableRow(targetCr);
  const targetType = TYPE_MAP[source.type.toLowerCase()];
  if (!targetType) throw new Error(`No approved type mapping for D&D 3.5 type: ${source.type}`);

  const ledger: ConversionLedgerEntry[] = [];
  const losses: ConversionLoss[] = [];
  const judgments: ConversionJudgment[] = [];
  const putLedger = (entry: ConversionLedgerEntry) => ledger.push(entry);
  const lose = (sourceField: string, sourceValue: string | number, reason: string) => losses.push({ sourceField, sourceValue, reason });
  const judge = (sourceField: string, proposedHandling: string, reason: string) =>
    judgments.push({ sourceField, proposedHandling, reason, approval: 'pending' });

  const abilities = {} as Record<Ability, number>;
  for (const ability of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const) {
    const value = Math.min(30, source.abilities[ability]);
    abilities[ability] = value;
    putLedger({ sourceField: `abilities.${ability}`, targetField: `abilities.${ability}`, treatment: 'copied', sourceValue: source.abilities[ability], targetValue: value, ruleSource: 'Ability scores use the same six-score scale; cap at 30 for 5e.' });
    if (value !== source.abilities[ability]) lose(`abilities.${ability}`, source.abilities[ability], '5e ability-score maximum is 30; excess is not represented.');
  }

  const dieSides = SIZE_HIT_DIE[source.size];
  if (!dieSides) throw new Error(`No target Hit Die for size: ${source.size}`);
  const sourceHitDice = parseDice(source.hp.formula);
  if (!sourceHitDice || sourceHitDice.count !== source.hp.hitDice) {
    throw new Error(`Unsupported source Hit Dice formula: ${source.hp.formula}`);
  }
  const hitDiceCount = Math.max(1, source.hp.hitDice);
  const conPerDie = mod(abilities.con);
  const hpModifier = conPerDie * hitDiceCount;
  const hpFormula = `${hitDiceCount}d${dieSides}${hpModifier > 0 ? ` + ${hpModifier}` : hpModifier < 0 ? ` - ${Math.abs(hpModifier)}` : ''}`;
  const hpAverage = Math.max(1, Math.floor(hitDiceCount * ((dieSides + 1) / 2 + conPerDie)));

  const acAdjustment = Math.max(-2, Math.min(2, source.naturalArmorBonus));
  const acValue = row.ac + acAdjustment;
  if (Math.abs(source.naturalArmorBonus) > 2) {
    lose('naturalArmorBonus', source.naturalArmorBonus, 'The draft construction table permits an unadjusted AC shift of at most 2; the excess is dropped.');
  }

  const savingThrows: Partial<Record<FiveESave, number>> = {};
  for (const oldSave of ['fort', 'ref', 'will'] as const) {
    const ability = SAVE_MAP[oldSave];
    const abilityModifier = mod(abilities[ability]);
    const goodSave = 2 + Math.floor(source.hp.hitDice / 2) + abilityModifier;
    const poorSave = Math.floor(source.hp.hitDice / 3) + abilityModifier;
    if (source.saves[oldSave] === goodSave) {
      savingThrows[ability] = abilityModifier + row.proficiencyBonus;
      putLedger({ sourceField: `saves.${oldSave}`, targetField: `savingThrows.${ability}`, treatment: 'mapped', sourceValue: source.saves[oldSave], targetValue: savingThrows[ability], ruleSource: 'D&D 3.5 good save → proficiency in the mapped 5e save; rebuilt using target PB.' });
    } else if (source.saves[oldSave] === poorSave) {
      putLedger({ sourceField: `saves.${oldSave}`, targetField: `savingThrows.${ability}`, treatment: 'mapped', sourceValue: source.saves[oldSave], targetValue: abilityModifier, ruleSource: 'D&D 3.5 poor save → unproficient 5e save; bonus is the target ability modifier.' });
    } else {
      judge(`saves.${oldSave}`, 'Manual save mapping', 'The printed bonus does not uniquely match the source good/poor progression; no target proficiency was invented.');
    }
  }

  const skillParts = new Map<string, { ability: Ability; proficient: boolean; source: string[] }>();
  for (const skill of source.skills) {
    const mappedName = skill.mapsTo ?? SKILL_MAP[skill.name.toLowerCase()];
    if (!mappedName) {
      lose(`skills.${skill.name}`, skill.bonus, 'No explicit 3.5-to-5e skill mapping exists in this draft profile.');
      continue;
    }
    const proficient = skill.bonus > mod(source.abilities[skill.ability]);
    const current = skillParts.get(mappedName);
    skillParts.set(mappedName, {
      ability: current?.ability ?? skill.ability,
      proficient: Boolean(current?.proficient || proficient),
      source: [...(current?.source ?? []), skill.name],
    });
  }
  const targetSkills: Record<string, number> = {};
  for (const [name, group] of skillParts) {
    const value = mod(abilities[group.ability]) + (group.proficient ? row.proficiencyBonus : 0);
    if (group.proficient) targetSkills[name] = value;
    putLedger({ sourceField: `skills.${group.source.join('+')}`, targetField: `skills.${name}`, treatment: 'mapped', targetValue: group.proficient ? value : undefined, ruleSource: 'Name mapping plus proficiency re-derived from source ranks; target bonus uses target ability modifier and PB.', note: group.proficient ? undefined : 'No target proficiency; the skill is omitted from the stat block.' });
  }

  if (source.senses.lowLightVision) lose('senses.lowLightVision', 'present', '3.5 low-light vision has no direct 2014 SRD sense equivalent.');
  if (source.senses.scent) judge('senses.scent', 'Do not carry a new sense automatically; review whether a Keen Smell trait is warranted.', '5e has no direct scent-sense field, and a smell-based Perception trait is not mechanically identical.');
  if (source.languages) lose('languages', source.languages, 'Language names are preserved only when they match the target vocabulary; this profile has no language dictionary yet.');
  else putLedger({ sourceField: 'languages', targetField: 'languages', treatment: 'copied', sourceValue: '', targetValue: '', ruleSource: 'Empty language field remains empty.' });
  for (const feat of source.feats) lose(`feats.${feat}`, feat, 'Feats are not transferred by name; their actual effect needs a separate rule mapping.');
  for (const conditional of source.conditionalSkillBonuses ?? []) {
    judge(`conditionalSkillBonuses.${conditional.skill}`, 'Omit pending review of the triggering sense and target skill rule.', `${conditional.bonus >= 0 ? '+' : ''}${conditional.bonus} is conditional on ${conditional.condition}.`);
  }

  const actions = source.attacks.map(attack => {
    const average = damageAverage(attack.damageFormula);
    if (!attack.damageType) judge(`attacks.${attack.name}.damageType`, 'Treat the bite as piercing in the candidate.', 'The source stat block does not print a damage-type field; this is a semantic interpretation.');
    if (attack.effect === 'trip') {
      judge(`attacks.${attack.name}.effect`, `On hit, use DC ${row.easyDc} Strength save; failure applies prone.`, 'Replaces the 3.5 trip check/free-action procedure with a 5e saving throw and condition.');
    }
    putLedger({ sourceField: `attacks.${attack.name}.damageFormula`, targetField: `actions.${attack.name}.attack.damage`, treatment: 'rebuilt', sourceValue: attack.damageFormula, targetValue: attack.damageFormula, ruleSource: 'Dice expression retained; attack bonus and CR budget are recalculated from the target profile.' });
    const result: ConvertedMonsterCandidate['actions'][number] = {
      name: attack.name,
      attack: {
        toHit: mod(abilities[attack.ability]) + row.proficiencyBonus,
        damage: attack.damageFormula,
        average: Math.round(average),
        damageType: attack.damageType ?? 'piercing',
      },
    };
    putLedger({ sourceField: `attacks.${attack.name}.attackBonus`, targetField: `actions.${attack.name}.attack.toHit`, treatment: 'rebuilt', sourceValue: attack.attackBonus, targetValue: result.attack.toHit, ruleSource: 'Target attack bonus = selected target ability modifier + target proficiency bonus.' });
    if (attack.effect === 'trip') result.onHitEffect = { save: { ability: 'str', dc: row.easyDc }, onFailure: 'prone' };
    return result;
  });

  if (actions.length !== row.attacks) {
    judge('attacks-per-turn', `Candidate has ${actions.length} attack action(s); target benchmark expects ${row.attacks}.`, 'Multiattack and alternative-action semantics require a human decision.');
  }
  if (actions.length === 0) throw new Error('At least one supported attack is required for this monster-conversion pilot.');

  const target: ConvertedMonsterCandidate = {
    id: `converted-35-${source.id}-to-5e2014`,
    name: source.name,
    size: source.size,
    type: targetType,
    alignment: source.alignment,
    ac: { value: acValue, source: acAdjustment ? 'target CR baseline + natural armor adjustment (review)' : 'target CR baseline' },
    hp: { average: hpAverage, formula: hpFormula },
    speed: { walk: source.speedFt },
    abilities,
    savingThrows,
    skills: targetSkills,
    senses: `passive Perception ${10 + mod(abilities.wis) + (targetSkills.Perception ? row.proficiencyBonus : 0)}`,
    languages: source.languages ? '' : source.languages,
    cr: targetCr,
    xp: row.xp,
    proficiencyBonus: row.proficiencyBonus,
    actions,
  };

  const estimate = estimateCr(target);
  const targetClassification = classifyDerivedTarget({
    type: 'monster',
    bookSection: 'Monsters',
    source: 'Derived candidate from D&D 3.5 SRD input using an A5E SRD benchmark',
    edition: 'D&D 5e / 2014 candidate format',
    license: 'Unresolved composite; retain source and benchmark licenses separately.',
    layer: 'rules',
    sourceRef: 'src/rules/convert/monster35To5e.ts#dnd35-srd-to-dnd5e-2014-a5e-baseline-v0',
  });
  if (!estimate.withinOneCrStep) {
    judge('challenge-rating', `The two-axis estimate is ${estimate.estimatedCr}, more than one CR step from selected ${targetCr}.`, 'The output is retained for review; this profile does not silently retune CR.');
  }

  putLedger({ sourceField: 'size/type', targetField: 'size/type', treatment: 'mapped', sourceValue: `${source.size} ${source.type}`, targetValue: `${target.size} ${target.type}`, ruleSource: '3.5 animal → 5e beast; size unchanged.' });
  putLedger({ sourceField: 'speed', targetField: 'speed.walk', treatment: 'copied', sourceValue: source.speedFt, targetValue: target.speed.walk, ruleSource: 'Both blocks express walking speed in feet.' });
  putLedger({ sourceField: 'ac/naturalArmorBonus', targetField: 'ac.value', treatment: 'rebuilt', sourceValue: source.ac, targetValue: target.ac.value, ruleSource: `${MONSTER_BENCHMARK_SOURCE.name}; at most ±2 AC adjustment applied.`, note: `Target benchmark AC ${row.ac}; adjustment ${acAdjustment >= 0 ? '+' : ''}${acAdjustment}.` });
  putLedger({ sourceField: 'hp.hitDice + CON', targetField: 'hp', treatment: 'rebuilt', sourceValue: source.hp.formula, targetValue: target.hp.formula, ruleSource: `Target Hit Die by size and target Constitution modifier; benchmark HP ${row.hp}.` });
  putLedger({ sourceField: 'cr', targetField: 'cr', treatment: 'rebuilt', sourceValue: source.cr, targetValue: target.cr, ruleSource: `Caller-selected target CR; ${MONSTER_BENCHMARK_SOURCE.name}.` });
  putLedger({ sourceField: 'alignment', targetField: 'alignment', treatment: 'copied', sourceValue: source.alignment, targetValue: target.alignment, ruleSource: 'Alignment label retained; setting meaning is not converted.' });

  return {
    status: 'converted',
    reviewStatus: 'pending-manual-review',
    profile: {
      id: 'dnd35-srd-to-dnd5e-2014-a5e-baseline-v0',
      status: 'draft-owner-policy-not-approved',
      sourceEdition: 'D&D 3.5 SRD',
      targetEdition: 'D&D 5e / 2014',
      combatConstruction: MONSTER_BENCHMARK_SOURCE,
    },
    source: { ...source.source, edition: 'D&D 3.5 SRD' },
    sourceClassification: classifyConversionSource('monster', 'Monsters', 'D&D 3.5 SRD', source.source),
    targetClassification,
    sourceRecord: structuredClone(source),
    distribution: 'internal-review',
    targetCrWasSelectedByCaller: true,
    target,
    estimate,
    ledger,
    losses,
    judgments,
  };
}
