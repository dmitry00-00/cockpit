/**
 * Fixed, replayable P22 scenarios for the isolated lab.
 * Each case uses a detached fixture and a version-pinned pure evaluator; none receives a campaign store.
 */
import { abilityMod } from '../campaign/derive';
import { sceneOf } from '../campaign/scene';
import { emptyState, type Actor, type State } from '../engine/state';
import { attunementRequirement } from '../engine/inventory';
import { buildCrMonster } from '../rules/generation/crMonster';
import { travelDaysOver, type TravelPaceId } from '../rules/srd/travel';
import {
  runIsolatedLab,
  type LabAssumption,
  type LabDataBlock,
  type LabExecutionContext,
  type LabInputSnapshot,
  type LabKernel,
  type LabKernelOutput,
  type LabNumericFact,
  type LabRulesetRef,
  type LabRunDefinition,
  type LabRunReport,
  type LabScenarioRef,
} from './contract';

export type P22EntityFamily = 'character' | 'monster-npc' | 'item' | 'scene' | 'place';
export type P22EvidenceClass = 'known-rule' | 'homebrew-hypothesis' | 'application-invariant';

export interface P22SourceDigests {
  kernel: string;
  dndSrd: string;
  a5eSrd: string;
  scene: string;
  homebrew: string;
}

export interface P22VariantResult {
  id: string;
  title: string;
  evidenceClass: P22EvidenceClass;
  report: LabRunReport;
  replay: { runFingerprint: string; outputFingerprint: string; identical: boolean };
}

export interface P22ScenarioResult {
  id: string;
  family: P22EntityFamily;
  title: string;
  sourceRef: string;
  coverageGaps: readonly string[];
  unsupportedInteractions: readonly string[];
  variants: readonly P22VariantResult[];
  comparisons: readonly {
    baselineVariantId: string;
    comparedVariantId: string;
    sameInputs: boolean;
    changedResultPaths: readonly string[];
  }[];
}

export interface P22ScenarioSuiteReport {
  format: 'dm-cockpit.p22-scenario-suite';
  version: '1.0.0';
  sourceTask: 'П22';
  scenarios: readonly P22ScenarioResult[];
  acceptance: {
    allFamiliesCovered: boolean;
    allVariantsRepeatable: boolean;
    allComparisonsUseSameInputs: boolean;
    campaignEventWrites: 0;
    activeCampaignWrites: 0;
  };
}

interface VariantSpec {
  id: string;
  title: string;
  evidenceClass: P22EvidenceClass;
  parameters: { readonly [key: string]: unknown };
  parameterFacts?: readonly LabNumericFact[];
}

interface ScenarioSpec {
  id: string;
  family: P22EntityFamily;
  title: string;
  kind: LabScenarioRef['kind'];
  sourceRef: string;
  input: LabInputSnapshot;
  rulesets: readonly LabRulesetRef[];
  assumptions: readonly LabAssumption[];
  variants: readonly VariantSpec[];
  coverageGaps: readonly string[];
  unsupportedInteractions: readonly string[];
  evaluate: (context: LabExecutionContext) => LabKernelOutput;
}

const fixtureSource = 'research/simulation/P22_SCENARIO_SUITE_2026-11-19.md#fixed-fixtures';

function ruleset(
  id: string,
  system: string,
  edition: string,
  version: string,
  layer: string,
  sourceRef: string,
  contentDigest: string,
  license: string,
): LabRulesetRef {
  return { id, system, edition, version, layer, sourceRef, contentDigest, license };
}

function numericInputFacts(
  payload: unknown,
  sourceRef = fixtureSource,
  path = '',
): LabNumericFact[] {
  if (typeof payload === 'number') {
    const pointer = path || '/value';
    const id = `fixture:${pointer.slice(1).replaceAll('/', '-') || 'value'}`;
    return [{ id, path: pointer, value: payload, origin: { kind: 'input', sourceRef, note: 'Закреплённое значение сценарной фикстуры; не утверждение о правиле.' } }];
  }
  if (Array.isArray(payload)) return payload.flatMap((item, index) => numericInputFacts(item, sourceRef, `${path}/${index}`));
  if (payload && typeof payload === 'object') {
    return Object.entries(payload).flatMap(([key, value]) => numericInputFacts(value, sourceRef, `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`));
  }
  return [];
}

function inputBlock(id: string, kind: LabInputSnapshot['kind'], payload: Record<string, unknown>): LabInputSnapshot {
  return {
    id,
    version: '1.0.0',
    kind,
    sourceRef: fixtureSource,
    payload: payload as LabInputSnapshot['payload'],
    numericFacts: numericInputFacts(payload),
  };
}

function dataBlock(id: string, sourceRef: string, payload: Record<string, unknown>, numericFacts: readonly LabNumericFact[] = []): LabDataBlock {
  return { id, version: '1.0.0', sourceRef, payload: payload as LabDataBlock['payload'], numericFacts };
}

function noChanges(): Pick<LabKernelOutput, 'findings' | 'changes' | 'uncertainty' | 'proposalCandidates'> {
  return { findings: [], changes: [], uncertainty: [], proposalCandidates: [] };
}

function dndRules(digest: string): LabRulesetRef {
  return ruleset('dnd5e-2014-srd-5.1', 'D&D 5e', '2014', 'SRD 5.1', 'srd', 'src/rules/srd/ · CC BY 4.0', digest, 'CC BY 4.0');
}

function hbRules(digest: string): LabRulesetRef {
  return ruleset('cockpit-p22-hypotheses', 'DM Cockpit', 'local hypothesis', 'P22-1.0.0', 'HB', 'src/lab/scenarios.ts#homebrew-variants', digest, 'internal project material');
}

function outputFact(
  id: string,
  path: string,
  value: number,
  origin: LabNumericFact['origin'],
): LabNumericFact {
  return { id, path, value, origin };
}

function characterScenario(digests: P22SourceDigests): ScenarioSpec {
  const inputId = 'p22-character-fixture';
  return {
    id: 'p22.character.ability-modifier',
    family: 'character',
    title: 'Модификатор характеристики персонажа',
    kind: 'mechanic',
    sourceRef: 'src/campaign/derive.ts#abilityMod',
    input: inputBlock(inputId, 'character', { characterId: 'fixture-wizard', ability: 'intelligence', abilityScore: 15 }),
    rulesets: [dndRules(digests.dndSrd), hbRules(digests.homebrew)],
    assumptions: [
      { id: 'character-scope', status: 'confirmed', statement: 'Проверяется только базовый модификатор характеристики, без временных эффектов и особенностей.' },
      { id: 'rounding-is-hypothesis', status: 'assumed', statement: 'Округление к ближайшему целому — намеренно заданная гипотеза для сравнения, не правило D&D.' },
    ],
    variants: [
      { id: 'srd-floor', title: 'SRD: округление вниз', evidenceClass: 'known-rule', parameters: { method: 'srd-floor' } },
      { id: 'hb-nearest', title: 'Гипотеза: округление к ближайшему', evidenceClass: 'homebrew-hypothesis', parameters: { method: 'nearest' } },
    ],
    coverageGaps: ['Не проверяются владения, спасброски, преимущества/помехи, временные бонусы и особенности класса/расы.'],
    unsupportedInteractions: ['Сложение нескольких эффектов, меняющих характеристику, в этом сценарии не моделируется.'],
    evaluate(context) {
      const score = Number(context.inputs[0].payload.abilityScore);
      const method = String(context.parameters.payload.method);
      const modifier = method === 'srd-floor' ? abilityMod(score) : Math.round((score - 10) / 2);
      const rulesetId = method === 'srd-floor' ? 'dnd5e-2014-srd-5.1' : 'cockpit-p22-hypotheses';
      const resultFact = outputFact('ability-modifier', '/modifier', modifier, {
        kind: method === 'srd-floor' ? 'derived' : 'homebrew',
        rulesetId,
        ...(method === 'srd-floor'
          ? { formula: 'floor((score - 10) / 2)', sourceFactIds: ['fixture:abilityScore'] }
          : { note: 'Гипотеза округления к ближайшему целому; кодом SRD не подтверждена.' }),
      } as LabNumericFact['origin']);
      return {
        result: dataBlock('character-modifier-result', 'src/lab/scenarios.ts#characterScenario', { modifier, method }, [resultFact]),
        ...noChanges(),
      };
    },
  };
}

function monsterScenario(digests: P22SourceDigests): ScenarioSpec {
  const input = inputBlock('p22-monster-fixture', 'monster', {
    name: 'Roadside Raider',
    size: 'Medium',
    creatureType: 'humanoid',
    alignment: 'neutral',
    speed: 30,
    abilities: { str: 14, dex: 12, con: 12, int: 10, wis: 10, cha: 10 },
    primaryAbility: 'str',
    attackName: 'Rusty Blade',
    damageType: 'slashing',
    reach: 5,
    languages: 'Common',
  });
  return {
    id: 'p22.monster-npc.cr-profile-candidate',
    family: 'monster-npc',
    title: 'Кандидат блока монстра по целевой ступени CR',
    kind: 'entity',
    sourceRef: 'src/rules/generation/crMonster.ts#buildCrMonster',
    input,
    rulesets: [
      ruleset('a5e-srd-19.1', 'Level Up: Advanced 5th Edition', 'A5E', 'SRD 19.1', 'a5e-srd', 'src/rules/convert/a5eMonsterBenchmark.ts#MONSTER_BENCHMARKS · CC BY 4.0', digests.a5eSrd, 'CC BY 4.0'),
      hbRules(digests.homebrew),
    ],
    assumptions: [
      { id: 'monster-candidate-only', status: 'assumed', statement: 'Генератор строит проверяемый черновик по таблице A5E; его CR-оценка не считается официальной процедурой D&D 5e.', sourceRef: 'src/rules/generation/crMonster.ts#estimateCr' },
    ],
    variants: [
      { id: 'target-cr-quarter', title: 'Целевая ступень CR 1/4', evidenceClass: 'homebrew-hypothesis', parameters: { targetCr: '1/4' } },
      { id: 'target-cr-half', title: 'Целевая ступень CR 1/2', evidenceClass: 'homebrew-hypothesis', parameters: { targetCr: '1/2' } },
    ],
    coverageGaps: ['Сохраняется только часть полей блока; не проверены полный баланс, спасброски, навыки, сопротивления, особые действия, легендарные действия и экономика действий группы.', 'Не проверены социальное состояние NPC, отношения и реакции на действия персонажей.'],
    unsupportedInteractions: ['Не оцениваются сценарные роли NPC, тактика, окружение и взаимодействие нескольких особых способностей.'],
    evaluate(context) {
      const fixture = context.inputs[0].payload;
      const targetCr = String(context.parameters.payload.targetCr);
      const abilities = fixture.abilities as Record<string, number>;
      const built = buildCrMonster({
        targetCr,
        size: String(fixture.size) as 'Medium',
        creatureType: String(fixture.creatureType),
        alignment: String(fixture.alignment),
        speed: Number(fixture.speed),
        abilities: abilities as never,
        primaryAbility: String(fixture.primaryAbility) as never,
        attackName: String(fixture.attackName),
        damageType: String(fixture.damageType) as never,
        reach: Number(fixture.reach),
        languages: String(fixture.languages),
      }, String(fixture.name), `p22-${targetCr}`);
      const resultFacts: LabNumericFact[] = [
        outputFact('monster-ac', '/ac', built.block.ac.value, { kind: 'rules', rulesetId: 'a5e-srd-19.1', locator: built.benchmarkRef }),
        outputFact('monster-hp', '/hpAverage', built.block.hp.average, {
          kind: 'derived', rulesetId: 'cockpit-p22-hypotheses', formula: 'round(hitDice × (средняя кость размера + модификатор CON))', sourceFactIds: ['fixture:abilities-con'],
        }),
        outputFact('monster-attack-bonus', '/attackBonus', built.block.actions[0].attack!.toHit, {
          kind: 'derived', rulesetId: 'cockpit-p22-hypotheses', formula: 'бонус мастерства из benchmark + модификатор выбранной характеристики', sourceFactIds: ['fixture:abilities-str'],
        }),
      ];
      return {
        result: dataBlock('monster-candidate-result', 'src/rules/generation/crMonster.ts#buildCrMonster', {
          name: built.block.name,
          targetCr,
          ac: built.block.ac.value,
          hpAverage: built.block.hp.average,
          attackBonus: built.block.actions[0].attack!.toHit,
          diagnosticCr: built.estimate.estimatedCr,
          diagnosticStatus: built.estimate.status,
        }, resultFacts),
        findings: [{ id: 'cr-is-diagnostic', severity: 'warning', message: 'CR-оценка — диагностический профиль генератора, а не официальное правило D&D 5e.', relatedFactIds: ['monster-ac', 'monster-hp', 'monster-attack-bonus'] }],
        changes: [],
        uncertainty: [{ id: 'full-statblock-coverage', level: 'unknown', description: 'Баланс остальных полей полного блока монстра не проверен этим срезом.', affectedFactIds: ['monster-ac', 'monster-hp', 'monster-attack-bonus'], assumptionIds: ['monster-candidate-only'] }],
        proposalCandidates: [],
      };
    },
  };
}

function itemScenario(digests: P22SourceDigests): ScenarioSpec {
  return {
    id: 'p22.item.attunement-restrictions',
    family: 'item',
    title: 'Допуск персонажа к настройке предмета',
    kind: 'entity',
    sourceRef: 'src/engine/inventory.ts#attunementRequirement',
    input: inputBlock('p22-item-fixture', 'item', {
      actor: { id: 'fixture-wizard', classId: 'volsebnik', raceId: 'el-f', alignment: 'neutral' },
      item: { id: 'moonlit-signet', name: 'Moonlit Signet' },
    }),
    rulesets: [dndRules(digests.dndSrd), hbRules(digests.homebrew)],
    assumptions: [
      { id: 'item-restrictions-are-authored', status: 'assumed', statement: 'Moonlit Signet — сценарная выдумка; строки ограничений проверяют обработчик, а не утверждают существование канонического предмета.' },
      { id: 'attunement-scope', status: 'confirmed', statement: 'Текущая функция поддерживает только записанные классы, расу, мировоззрение и заклинателя; условие времени/места остаётся unsupported.' },
    ],
    variants: [
      { id: 'spellcaster-restriction', title: 'Ограничение «заклинатель»', evidenceClass: 'homebrew-hypothesis', parameters: { by: 'a spellcaster' } },
      { id: 'dwarf-restriction', title: 'Ограничение «дварф»', evidenceClass: 'homebrew-hypothesis', parameters: { by: 'a dwarf' } },
      { id: 'moonlight-clause', title: 'Неразобранное условие лунного света', evidenceClass: 'homebrew-hypothesis', parameters: { when: 'only while under moonlight' } },
    ],
    coverageGaps: ['Не проверяется фактическая настройка, число слотов настройки, совместимость предметов и любые условия, не сохранённые в карточке персонажа.'],
    unsupportedInteractions: ['Условия времени и места не поддержаны; результат обязан остаться `unsupported`, без догадки об eligibility.'],
    evaluate(context) {
      const fixture = context.inputs[0].payload;
      const actorData = fixture.actor as Record<string, string>;
      const actor = {
        id: actorData.id,
        name: 'Fixture Wizard',
        kind: 'pc',
        hp: { current: 1, max: 1, temp: 0 },
        ac: 10,
        passivePerception: 10,
        conditions: {},
        sheet: {
          level: 1, classId: actorData.classId, raceId: actorData.raceId, alignment: actorData.alignment,
          abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
          proficiencyBonus: 2, skills: [], features: [], traits: [],
        },
      } as unknown as Actor;
      const requirement = context.parameters.payload;
      const status = attunementRequirement(actor, typeof requirement.by === 'string' ? requirement.by : undefined, typeof requirement.when === 'string' ? requirement.when : undefined);
      const unsupported = status === 'unsupported';
      return {
        result: dataBlock('item-eligibility-result', 'src/engine/inventory.ts#attunementRequirement', {
          itemId: String((fixture.item as Record<string, unknown>).id),
          status,
          reason: unsupported ? 'Условие не представлено в доступном контексте; нужна проверка мастера.' : 'Проверено только поддерживаемое ограничение из этого сценария.',
        }),
        findings: unsupported ? [{ id: 'unsupported-attunement-clause', severity: 'warning', message: 'Условие настройки не поддерживается; правило не выведено автоматически.', relatedFactIds: [] }] : [],
        changes: [],
        uncertainty: unsupported ? [{ id: 'situational-attunement', level: 'unknown', description: 'Не хватает контекста времени/места для решения условия настройки.', affectedFactIds: [], assumptionIds: ['attunement-scope'] }] : [],
        proposalCandidates: [],
      };
    },
  };
}

function sceneScenario(digests: P22SourceDigests): ScenarioSpec {
  return {
    id: 'p22.scene.player-and-gm-projections',
    family: 'scene',
    title: 'Игровая сцена: проекция игрока и мастера',
    kind: 'other',
    sourceRef: 'src/campaign/scene.ts#sceneOf',
    input: inputBlock('p22-scene-fixture', 'scene', {
      locationId: 'loc-p22-fixture',
      sec: 0,
      threadOpenedSec: 0,
      threadTouchedSec: 0,
      publicRumor: 'На тракте видели погасший фонарь.',
      dmSecret: 'DM_ONLY: гонец работает на заговорщиков.',
      threadId: 'thread-p22-fixture',
    }),
    rulesets: [ruleset('dm-cockpit-scene-projection', 'DM Cockpit', 'application', 'scene-projection-v1', 'application', 'src/campaign/scene.ts#sceneOf', digests.scene, 'internal project code')],
    assumptions: [
      { id: 'scene-projection-fixture', status: 'confirmed', statement: 'Это проверка видимости секрета в проекции интерфейса; канон места и содержимое кампании не загружаются.' },
    ],
    variants: [
      { id: 'gm-view', title: 'Сцена мастера', evidenceClass: 'application-invariant', parameters: { audience: 'gm' } },
      { id: 'player-view', title: 'Сцена игрока', evidenceClass: 'application-invariant', parameters: { audience: 'players' } },
    ],
    coverageGaps: ['Не проверены канонические данные вики, религиозные/фракционные секции, календарные эффекты, цены и встречи.'],
    unsupportedInteractions: ['Не проверяется право конкретного игрока на частично раскрытую информацию; проверяется только общий режим players.'],
    evaluate(context) {
      const fixture = context.inputs[0].payload;
      const locationId = String(fixture.locationId);
      const publicRumor = String(fixture.publicRumor);
      const dmSecret = String(fixture.dmSecret);
      const threadId = String(fixture.threadId);
      const state = emptyState() as State;
      const sec = Number(fixture.sec);
      state.time = { sec, tempo: 'hour' };
      state.world.locations[locationId] = { id: locationId, name: 'Fixture Crossroads', scale: 'settlement' };
      state.world.threads[threadId] = {
        id: threadId, name: 'Гонец у переправы', status: 'open',
        openedSec: Number(fixture.threadOpenedSec), lastTouchedSec: Number(fixture.threadTouchedSec),
      };
      state.facts = {
        'p22-public-rumor': { id: 'p22-public-rumor', text: publicRumor, visibility: 'players', category: 'rumor', subjectId: locationId },
        'p22-dm-secret': { id: 'p22-dm-secret', text: dmSecret, visibility: 'dm', subjectId: locationId, threadIds: [threadId] },
      };
      const audience = String(context.parameters.payload.audience);
      const scene = sceneOf(state, { location: locationId }, sec, undefined, { players: audience === 'players' });
      const serialized = JSON.stringify(scene);
      const rumorRows = scene.sections.find(section => section.id === 'rumors')?.rows ?? [];
      return {
        result: dataBlock('scene-projection-result', 'src/campaign/scene.ts#sceneOf', {
          audience,
          sectionIds: scene.sections.map(section => section.id),
          publicRumorVisible: serialized.includes(publicRumor),
          dmSecretVisible: serialized.includes(dmSecret),
          visibleRumors: rumorRows.map(row => row.label),
        }),
        ...noChanges(),
      };
    },
  };
}

function placeScenario(digests: P22SourceDigests): ScenarioSpec {
  const input = inputBlock('p22-place-route-fixture', 'location', { routeMiles: 72, difficultMiles: 12 });
  return {
    id: 'p22.place.travel-time',
    family: 'place',
    title: 'Путь по месту: обычный и быстрый темп, трудный участок и задержка',
    kind: 'mechanic',
    sourceRef: 'src/rules/srd/travel.ts#travelDaysOver',
    input,
    rulesets: [dndRules(digests.dndSrd), hbRules(digests.homebrew)],
    assumptions: [
      { id: 'route-fixture', status: 'confirmed', statement: 'Длина маршрута и протяжённость трудного участка заданы фикстурой; маршрут не активируется в мире.' },
      { id: 'forced-stop-hypothesis', status: 'assumed', statement: 'Дополнительный день задержки — авторская гипотеза, не правило длительности путешествия из SRD.' },
    ],
    variants: [
      { id: 'normal-pace', title: 'Обычный темп', evidenceClass: 'known-rule', parameters: { pace: 'normal' } },
      { id: 'fast-pace', title: 'Быстрый темп', evidenceClass: 'known-rule', parameters: { pace: 'fast' } },
      {
        id: 'normal-plus-stop', title: 'Обычный темп + сценарная задержка', evidenceClass: 'homebrew-hypothesis',
        parameters: { pace: 'normal', delayDays: 1 },
        parameterFacts: [{ id: 'forced-stop-days', path: '/delayDays', value: 1, origin: { kind: 'homebrew', rulesetId: 'cockpit-p22-hypotheses', note: 'Один дополнительный день — принятая только для сравнения гипотеза.' } }],
      },
    ],
    coverageGaps: ['Не моделируются отдых, истощение, погода, навигация, встречи, транспорт и отдельные правила регионов A5E.'],
    unsupportedInteractions: ['Случайные задержки и расход ресурсов путешествия не представлены в этом чистом расчёте расстояния.'],
    evaluate(context) {
      const route = context.inputs[0].payload;
      const parameters = context.parameters.payload;
      const pace = String(parameters.pace) as TravelPaceId;
      const days = travelDaysOver(Number(route.routeMiles), Number(route.difficultMiles), pace);
      const delayDays = Number(parameters.delayDays ?? 0);
      const resultDays = days + delayDays;
      const origin: LabNumericFact['origin'] = delayDays
        ? { kind: 'homebrew', rulesetId: 'cockpit-p22-hypotheses', note: 'Результат включает авторскую сценарную задержку.' }
        : { kind: 'derived', rulesetId: 'dnd5e-2014-srd-5.1', formula: '(мили + трудные мили) / мили за день выбранного темпа', sourceFactIds: ['fixture:routeMiles', 'fixture:difficultMiles'] };
      const facts = [outputFact('travel-days', '/days', resultDays, origin)];
      return {
        result: dataBlock('place-travel-result', 'src/rules/srd/travel.ts#travelDaysOver', { pace, days: resultDays }, facts),
        findings: delayDays ? [{ id: 'forced-stop-is-hypothesis', severity: 'info', message: 'Дополнительный день задержки добавлен только в варианте HB.', relatedFactIds: ['travel-days'] }] : [],
        changes: [],
        uncertainty: [],
        proposalCandidates: [],
      };
    },
  };
}

function scenarioDefinitions(digests: P22SourceDigests): readonly ScenarioSpec[] {
  return [characterScenario(digests), monsterScenario(digests), itemScenario(digests), sceneScenario(digests), placeScenario(digests)];
}

function variantDefinition(spec: ScenarioSpec, variant: VariantSpec, digests: P22SourceDigests): LabRunDefinition {
  const scenario: LabScenarioRef = { id: spec.id, version: '1.0.0', kind: spec.kind, title: spec.title, sourceRef: spec.sourceRef };
  const engine = { id: 'p22-fixed-scenario-kernel', version: '1.0.0', sourceRef: 'src/lab/scenarios.ts', contentDigest: digests.kernel };
  return {
    format: 'dm-cockpit.isolated-lab-run',
    schemaVersion: 1,
    scenario,
    engine,
    rulesets: spec.rulesets,
    packages: [],
    inputs: [spec.input],
    parameters: dataBlock(`parameters:${variant.id}`, 'src/lab/scenarios.ts#variant-spec', { ...variant.parameters, evidenceClass: variant.evidenceClass }, variant.parameterFacts ?? []),
    assumptions: spec.assumptions,
    randomness: { mode: 'none' },
  };
}

function leafMap(value: unknown, path = ''): Map<string, unknown> {
  if (Array.isArray(value)) {
    const out = new Map<string, unknown>();
    value.forEach((item, index) => leafMap(item, `${path}/${index}`).forEach((leaf, key) => out.set(key, leaf)));
    return out;
  }
  if (value && typeof value === 'object') {
    const out = new Map<string, unknown>();
    Object.entries(value).forEach(([key, child]) => leafMap(child, `${path}/${key}`).forEach((leaf, pointer) => out.set(pointer, leaf)));
    return out;
  }
  return new Map([[path || '/', value]]);
}

function changedResultPaths(left: LabRunReport, right: LabRunReport): string[] {
  const a = leafMap(left.result.payload);
  const b = leafMap(right.result.payload);
  return [...new Set([...a.keys(), ...b.keys()])].filter(path => JSON.stringify(a.get(path)) !== JSON.stringify(b.get(path))).sort();
}

export async function runP22ScenarioSuite(digests: P22SourceDigests): Promise<P22ScenarioSuiteReport> {
  const scenarios: P22ScenarioResult[] = [];
  const kernelCache = new Map<string, LabKernel>();
  for (const spec of scenarioDefinitions(digests)) {
    const kernel: LabKernel = kernelCache.get(spec.id) ?? {
      id: 'p22-fixed-scenario-kernel',
      version: '1.0.0',
      sourceRef: 'src/lab/scenarios.ts',
      contentDigest: digests.kernel,
      run: spec.evaluate,
    };
    kernelCache.set(spec.id, kernel);
    const variants: P22VariantResult[] = [];
    for (const variant of spec.variants) {
      const definition = variantDefinition(spec, variant, digests);
      const report = await runIsolatedLab(definition, kernel);
      const replay = await runIsolatedLab(definition, kernel);
      variants.push({
        id: variant.id,
        title: variant.title,
        evidenceClass: variant.evidenceClass,
        report,
        replay: {
          runFingerprint: replay.runFingerprint,
          outputFingerprint: replay.outputFingerprint,
          identical: replay.runFingerprint === report.runFingerprint && replay.outputFingerprint === report.outputFingerprint,
        },
      });
    }
    const baseline = variants[0];
    const comparisons = variants.slice(1).map(variant => ({
      baselineVariantId: baseline.id,
      comparedVariantId: variant.id,
      sameInputs: JSON.stringify(baseline.report.inputFingerprints) === JSON.stringify(variant.report.inputFingerprints),
      changedResultPaths: changedResultPaths(baseline.report, variant.report),
    }));
    scenarios.push({
      id: spec.id,
      family: spec.family,
      title: spec.title,
      sourceRef: spec.sourceRef,
      coverageGaps: spec.coverageGaps,
      unsupportedInteractions: spec.unsupportedInteractions,
      variants,
      comparisons,
    });
  }
  const requiredFamilies: readonly P22EntityFamily[] = ['character', 'monster-npc', 'item', 'scene', 'place'];
  const allFamiliesCovered = requiredFamilies.every(family => scenarios.some(scenario => scenario.family === family));
  const allVariantsRepeatable = scenarios.every(scenario => scenario.variants.every(variant =>
    variant.replay.identical && variant.report.executionBoundary.campaignEventWrites === 0 && variant.report.executionBoundary.activeCampaignWrites === 0));
  const allComparisonsUseSameInputs = scenarios.every(scenario => scenario.comparisons.every(comparison => comparison.sameInputs));
  return {
    format: 'dm-cockpit.p22-scenario-suite',
    version: '1.0.0',
    sourceTask: 'П22',
    scenarios,
    acceptance: {
      allFamiliesCovered,
      allVariantsRepeatable,
      allComparisonsUseSameInputs,
      campaignEventWrites: 0,
      activeCampaignWrites: 0,
    },
  };
}
