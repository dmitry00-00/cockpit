import type { ImportedContent } from '../engine/state';
import { backgroundById, classById, COMPENDIUM_META, featById, raceById } from '../rules/compendium';
import { EQUIPMENT_SOURCE, ITEMS } from '../rules/srd/equipment';
import { SPELLS, SPELLS_SOURCE } from '../rules/srd/spells';
import { CHARACTER_NARRATIVE_PROMPT_VERSION, type CharacterNarrative, type LocalCharacterNarrativeResult } from '../rules/generation/localCharacterNarrative';
import { PARTY } from '../campaign/party';
import { DEITIES } from '../cosmos/deities';
import type { PcSpec } from '../campaign/derive';
import { pcActor } from '../campaign/seed';

export const GENERATED_SRD_CHARACTER_FORMAT = 'cockpit.generated-srd-character/1' as const;
export const GENERATED_SRD_CHARACTER_VERSION = 'p7-srd-character-reskin-v1' as const;
export const GENERATED_CUSTOM_SRD_CHARACTER_VERSION = 'p7-srd-character-build-v1' as const;

const TEMPLATE_ANCHORS: Readonly<Record<string, string>> = { bo: 'BO', korrin: 'KORRIN', lyra: 'LYRA', aldric: 'ALDRIC' };
const RULE_SOURCE_REFS = ['src/campaign/derive.ts#deriveWith', 'src/campaign/seed.ts#pcActor'] as const;
const CUSTOM_MECHANIC_RULE_SOURCE_REFS = [...RULE_SOURCE_REFS, 'src/campaign/build.ts#classChoicesOf', 'src/campaign/build.ts#spellcastingOf'] as const;

export interface CharacterNumericAttribution {
  path: string;
  value: number | string;
  sourceRef: string;
  ruleSourceRefs: readonly string[];
}

export interface GeneratedSrdCharacterData {
  format: typeof GENERATED_SRD_CHARACTER_FORMAT;
  version: typeof GENERATED_SRD_CHARACTER_VERSION | typeof GENERATED_CUSTOM_SRD_CHARACTER_VERSION;
  buildKind?: 'party-template' | 'custom-srd-build';
  templateId: string;
  templateRef: string;
  templateSnapshot: PcSpec;
  classRef: string;
  raceRef: string;
  ruleset: {
    system: 'D&D 5e'; version: 'SRD 5.1'; license: 'CC BY 4.0';
    compendiumImportedAt: string; spellsFetchedAt: string; equipmentFetchedAt: string;
    recordRefs: readonly string[];
  };
  mechanics: ReturnType<typeof characterMechanics>;
  numericAttributions: readonly CharacterNumericAttribution[];
  narrative: CharacterNarrative;
  model: string;
  promptVersion: string;
  generatedAt: string;
  parameters: Readonly<Record<string, string | number | boolean>>;
  rawOutput: string;
}

function escapePointer(part: string | number) { return String(part).replace(/~/g, '~0').replace(/\//g, '~1'); }

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function numericFields(value: unknown, path = ''): Array<{ path: string; value: number | string }> {
  if (typeof value === 'number' && Number.isFinite(value)) return [{ path, value }];
  if (typeof value === 'string' && /\p{N}/u.test(value)) return [{ path, value }];
  if (Array.isArray(value)) return value.flatMap((child, index) => numericFields(child, `${path}/${index}`));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => numericFields(child, `${path}/${escapePointer(key)}`));
}

/** Mechanics are always recalculated from the selected local character template by the same engine used for PCs. */
function characterMechanics(spec: PcSpec, displayName = spec.name) {
  const actor = pcActor(generatedSrdCharacterSpec(spec, `p7-preview-${spec.id}`, displayName));
  if (!actor.sheet) throw new Error('Для сборки отсутствует лист персонажа.');
  return {
    level: actor.sheet.level,
    classId: actor.sheet.classId,
    raceId: actor.sheet.raceId,
    subraceId: actor.sheet.subraceId,
    abilities: actor.sheet.abilities,
    proficiencyBonus: actor.sheet.proficiencyBonus,
    speed: actor.sheet.speed,
    hitPoints: actor.hp.max,
    armorClass: actor.ac,
    passivePerception: actor.passivePerception,
    features: actor.sheet.features,
    traits: actor.sheet.traits,
    skills: actor.sheet.skills,
    choices: actor.sheet.choices ?? [],
    spellcasting: actor.sheet.spellcasting ?? null,
    equipment: actor.sheet.equipment,
    attacks: actor.sheet.attacks,
  };
}

function templateById(id: string): PcSpec | undefined { return PARTY.find(spec => spec.id === id); }

export function generatedSrdCharacterSpec(spec: PcSpec, id: string, name: string, preserveUserDetails = false): PcSpec {
  return {
    ...structuredClone(spec), id, name, portrait: undefined,
    ...(preserveUserDetails ? {} : { alignment: undefined, bio: undefined }),
  };
}

function templateSourceRef(id: string): string {
  const anchor = TEMPLATE_ANCHORS[id];
  if (!anchor) throw new Error('Неизвестный шаблон персонажа.');
  return `src/campaign/party.ts#${anchor}`;
}

function customBuildSourceRef(contentId: string): string {
  return `generated/${escapePointer(contentId)}#/data/generatedSrdCharacter/templateSnapshot`;
}

function sourceRefs(spec: PcSpec, customBuild = false) {
  const cls = classById(spec.classId), race = raceById(spec.raceId);
  if (!cls || cls.source !== 'srd' || !race || race.source !== 'srd') throw new Error('Сборка должна использовать класс и расу SRD.');
  const subrace = spec.subraceId ? race.subraces.find(item => item.id === spec.subraceId) : undefined;
  if (spec.subraceId && (!subrace || subrace.source !== 'srd')) throw new Error('Подраса сборки не подтверждена SRD.');
  const subclass = spec.subclassId ? cls.subclasses.find(item => item.id === spec.subclassId) : undefined;
  if (spec.subclassId && (!subclass || subclass.source !== 'srd')) throw new Error('Подкласс сборки не подтверждён SRD.');
  const spellRefs = (spec.spells ?? []).map(id => {
    if (!SPELLS[id] || SPELLS[id].source !== 'srd') throw new Error(`Заклинание сборки ${id} не подтверждено SRD.`);
    return `content/srd/spells.json#/spells/${escapePointer(id)}`;
  });
  const equipmentRefs = (spec.equipment ?? []).map(item => {
    if (!ITEMS[item.id]) throw new Error(`Предмет сборки ${item.id} не найден в SRD.`);
    return `content/srd/equipment.json#/items/${escapePointer(item.id)}`;
  });
  const background = customBuild && spec.backgroundId ? backgroundById(spec.backgroundId) : undefined;
  if (customBuild && spec.backgroundId && (!background || background.source !== 'srd')) throw new Error('Предыстория персонажа не подтверждена SRD.');
  const backgroundRefs = background ? [`src/rules/compendium/backgrounds.ts#BACKGROUNDS[id=${escapePointer(background.id)}]`] : [];
  const featRefs = customBuild ? (spec.feats ?? []).map(pick => {
    const feat = featById(pick.id);
    if (!feat || feat.source !== 'srd') throw new Error(`Черта персонажа ${pick.id} не подтверждена SRD.`);
    return `content/compendium/feats.json#/feats/${escapePointer(feat.id)}`;
  }) : [];
  const mechanics = customBuild ? characterMechanics(spec) : undefined;
  const nonSrdChoice = mechanics?.choices.flatMap(choice => choice.values).find(value => value.source !== 'srd');
  if (nonSrdChoice) throw new Error(`Выбор «${nonSrdChoice.name}» не подтверждён SRD.`);
  const deity = customBuild && spec.deity ? DEITIES.find(item => item.id === spec.deity?.id) : undefined;
  if (customBuild && spec.deity && (!deity || deity.name !== spec.deity.name)) throw new Error('Божество не найдено в локальном справочнике.');
  const classRef = `content/compendium/classes.json#classes[id=${escapePointer(cls.id)}]`;
  const raceRef = `content/compendium/races.json#races[id=${escapePointer(race.id)}]`;
  const subclassRef = subclass ? `${classRef}/subclasses[id=${escapePointer(subclass.id)}]` : undefined;
  const detailedRefs = customBuild ? [
    `${classRef}/levels[level=${spec.level}]`,
    ...(mechanics?.choices.map(choice => choice.id.startsWith('race-') ? `${raceRef}/traits` : `${classRef}/choices[id=${escapePointer(choice.id)}]`) ?? []),
    ...(deity ? [`src/cosmos/deities.ts#DEITIES[id=${escapePointer(deity.id)}]`] : []),
    ...(spec.armor ? [`src/rules/srd/armor.ts#ARMOR[id=${escapePointer(spec.armor)}]`] : []),
    ...(spec.shield ? ['src/rules/srd/armor.ts#SHIELD'] : []),
    ...(spec.mageArmor ? ['src/rules/srd/armor.ts#MAGE_ARMOR'] : []),
  ] : [];
  return {
    classRef,
    raceRef,
    recordRefs: [classRef, raceRef, ...(subrace ? [`${raceRef}/subraces[id=${escapePointer(subrace.id)}]`] : []), ...(subclassRef ? [subclassRef] : []), ...backgroundRefs, ...featRefs, ...spellRefs, ...equipmentRefs, ...detailedRefs],
  };
}

function makeData(spec: PcSpec, result: LocalCharacterNarrativeResult, contentId: string, customBuild: boolean): GeneratedSrdCharacterData {
  const refs = sourceRefs(spec, customBuild);
  const templateRef = customBuild ? customBuildSourceRef(contentId) : templateSourceRef(spec.id);
  const mechanics = characterMechanics(spec, result.narrative.name);
  const numericAttributions = customBuild
    ? [
      ...numericFields(spec, 'templateSnapshot').map(field => ({ ...field, sourceRef: templateRef, ruleSourceRefs: ['user-authored-build-input'] })),
      ...numericFields(mechanics, 'mechanics').map(field => ({ ...field, sourceRef: templateRef, ruleSourceRefs: CUSTOM_MECHANIC_RULE_SOURCE_REFS })),
    ]
    : numericFields(mechanics).map(field => ({ ...field, sourceRef: templateRef, ruleSourceRefs: RULE_SOURCE_REFS }));
  return {
    format: GENERATED_SRD_CHARACTER_FORMAT,
    version: customBuild ? GENERATED_CUSTOM_SRD_CHARACTER_VERSION : GENERATED_SRD_CHARACTER_VERSION,
    buildKind: customBuild ? 'custom-srd-build' : 'party-template',
    templateId: customBuild ? 'custom-build' : spec.id,
    templateRef,
    templateSnapshot: structuredClone(spec),
    ...refs,
    ruleset: {
      system: 'D&D 5e', version: 'SRD 5.1', license: 'CC BY 4.0', compendiumImportedAt: COMPENDIUM_META.importedAt,
      spellsFetchedAt: SPELLS_SOURCE.fetchedAt, equipmentFetchedAt: EQUIPMENT_SOURCE.fetchedAt, recordRefs: refs.recordRefs,
    },
    mechanics,
    numericAttributions,
    narrative: result.narrative,
    model: result.model,
    promptVersion: CHARACTER_NARRATIVE_PROMPT_VERSION,
    generatedAt: result.generatedAt,
    parameters: { ...result.parameters },
    rawOutput: result.rawOutput,
  };
}

export function generatedSrdCharacterData(content: ImportedContent): GeneratedSrdCharacterData | undefined {
  const data = content.data.generatedSrdCharacter;
  return isRecord(data) ? data as unknown as GeneratedSrdCharacterData : undefined;
}

export function makeGeneratedSrdCharacterContent(spec: PcSpec, result: LocalCharacterNarrativeResult, id: string, customBuild = false): ImportedContent {
  const generatedSrdCharacter = makeData(spec, result, id, customBuild);
  const content: ImportedContent = {
    id,
    kind: 'character',
    name: result.narrative.name,
    sourceFormat: 'json',
    sourceFile: `generated/character/${customBuild ? 'custom' : spec.id}`,
    rights: { status: 'unverified', license: customBuild
      ? 'Механика — локальные записи SRD 5.1 (CC BY 4.0); числовые вводы произвольной сборки принадлежат автору листа. Биографию и распространение нужно проверить отдельно; источник божества указан в записи.'
      : 'Механика — локальный шаблон SRD 5.1 (CC BY 4.0); сгенерированную биографию и распространение нужно проверить отдельно' },
    data: { generatedSrdCharacter },
  };
  const error = validateGeneratedSrdCharacter(content, spec);
  if (error) throw new Error(error);
  return content;
}

export function validateGeneratedSrdCharacter(content: ImportedContent, spec?: PcSpec): string | null {
  const generated = generatedSrdCharacterData(content);
  if (content.kind !== 'character' || !generated || generated.format !== GENERATED_SRD_CHARACTER_FORMAT ||
      ![GENERATED_SRD_CHARACTER_VERSION, GENERATED_CUSTOM_SRD_CHARACTER_VERSION].includes(generated.version)) return 'Неизвестный формат генерации персонажа.';
  const customBuild = generated.version === GENERATED_CUSTOM_SRD_CHARACTER_VERSION;
  if ((customBuild && (generated.buildKind !== 'custom-srd-build' || generated.templateId !== 'custom-build')) ||
      (!customBuild && generated.buildKind !== undefined && generated.buildKind !== 'party-template')) return 'Тип сборки персонажа не совпадает с версией записи.';
  const base = customBuild ? spec ?? generated.templateSnapshot : spec ?? templateById(generated.templateId);
  if (!base || (!customBuild && base.id !== generated.templateId) || JSON.stringify(generated.templateSnapshot) !== JSON.stringify(base)) return 'Снимок персонажа не совпадает с исходной сборкой.';
  try {
    const refs = sourceRefs(base, customBuild);
    const expectedTemplateRef = customBuild ? customBuildSourceRef(content.id) : templateSourceRef(base.id);
    const expectedMechanics = characterMechanics(base, generated.narrative?.name);
    if (generated.templateRef !== expectedTemplateRef || generated.classRef !== refs.classRef || generated.raceRef !== refs.raceRef ||
        generated.ruleset?.system !== 'D&D 5e' || generated.ruleset.version !== 'SRD 5.1' || generated.ruleset.license !== 'CC BY 4.0' ||
        generated.ruleset.spellsFetchedAt !== SPELLS_SOURCE.fetchedAt || generated.ruleset.equipmentFetchedAt !== EQUIPMENT_SOURCE.fetchedAt ||
        JSON.stringify(generated.ruleset.recordRefs) !== JSON.stringify(refs.recordRefs)) return 'Редакция или ссылки источников персонажа не подтверждены.';
    if (JSON.stringify(generated.ruleset.compendiumImportedAt) !== JSON.stringify(COMPENDIUM_META.importedAt)) return 'Снимок компендиума персонажа изменился.';
    if (JSON.stringify(generated.mechanics) !== JSON.stringify(expectedMechanics)) return 'Числа персонажа не совпадают с пересчётом SRD-шаблона.';
    const expected = customBuild
      ? [
        ...numericFields(base, 'templateSnapshot').map(field => ({ ...field, sourceRef: expectedTemplateRef, ruleSourceRefs: ['user-authored-build-input'] })),
        ...numericFields(expectedMechanics, 'mechanics').map(field => ({ ...field, sourceRef: expectedTemplateRef, ruleSourceRefs: CUSTOM_MECHANIC_RULE_SOURCE_REFS })),
      ]
      : numericFields(expectedMechanics).map(field => ({ ...field, sourceRef: expectedTemplateRef, ruleSourceRefs: RULE_SOURCE_REFS }));
    if (!Array.isArray(generated.numericAttributions) || JSON.stringify(generated.numericAttributions) !== JSON.stringify(expected)) return 'Не для каждого числа указан верный источник и расчётное правило.';
    if (!generated.narrative || ['name', 'appearance', 'personality', 'motivation'].some(key => typeof generated.narrative[key as keyof CharacterNarrative] !== 'string' || !generated.narrative[key as keyof CharacterNarrative].trim() || /\p{N}/u.test(generated.narrative[key as keyof CharacterNarrative]))) return 'Описание персонажа содержит пустое поле или неподтверждённые числа.';
    if (content.name !== generated.narrative.name || generated.promptVersion !== CHARACTER_NARRATIVE_PROMPT_VERSION ||
        typeof generated.model !== 'string' || !generated.model.trim() || !Number.isFinite(Date.parse(generated.generatedAt)) ||
        typeof generated.rawOutput !== 'string' || !isRecord(generated.parameters)) return 'Отсутствуют корректные метаданные генерации персонажа.';
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function generatedSrdCharacterTemplate(content: ImportedContent): PcSpec | undefined {
  const generated = generatedSrdCharacterData(content);
  const base = generated?.version === GENERATED_CUSTOM_SRD_CHARACTER_VERSION
    ? generated.templateSnapshot
    : generated ? templateById(generated.templateId) : undefined;
  return base && !validateGeneratedSrdCharacter(content, base) ? base : undefined;
}
