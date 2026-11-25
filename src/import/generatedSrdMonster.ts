import type { ImportedContent } from '../engine/state';
import { MONSTERS_SOURCE, monsterOrigin, type Monster } from '../rules/srd/monsters';
import { MONSTER_NARRATIVE_PROMPT_VERSION, type LocalMonsterNarrativeResult, type MonsterNarrative } from '../rules/generation/localMonsterNarrative';

export const GENERATED_SRD_MONSTER_FORMAT = 'cockpit.generated-srd-monster/1' as const;
export const GENERATED_SRD_MONSTER_VERSION = 'p7-srd-reskin-v1' as const;

export interface NumericAttribution {
  path: string;
  value: number | string;
  sourceRef: string;
}

export interface GeneratedRulesSource {
  system: 'D&D 5e';
  version: 'SRD 5.1';
  license: 'CC BY 4.0';
  catalogSource: string;
  catalogFetchedAt: string;
}

export interface GeneratedSrdMonsterData {
  format: typeof GENERATED_SRD_MONSTER_FORMAT;
  version: typeof GENERATED_SRD_MONSTER_VERSION;
  baseMonsterId: string;
  rulesSource: GeneratedRulesSource;
  sourceRef: string;
  cr: string;
  crSourceRef: string;
  numericAttributions: readonly NumericAttribution[];
  narrative: MonsterNarrative;
  model: string;
  promptVersion: string;
  generatedAt: string;
  parameters: Readonly<Record<string, string | number | boolean>>;
  rawOutput: string;
}

const escapePointer = (part: string | number) => String(part).replace(/~/g, '~0').replace(/\//g, '~1');

function numericFields(value: unknown, path = ''): Array<{ path: string; value: number | string }> {
  if (typeof value === 'number' && Number.isFinite(value)) return [{ path, value }];
  if (typeof value === 'string' && /\d/.test(value)) return [{ path, value }];
  if (Array.isArray(value)) return value.flatMap((child, index) => numericFields(child, `${path}/${index}`));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => numericFields(child, `${path}/${escapePointer(key)}`));
}

export function generatedSrdMonsterData(content: ImportedContent): GeneratedSrdMonsterData | undefined {
  const data = content.data.generatedSrdMonster;
  return data && typeof data === 'object' && !Array.isArray(data) ? data as GeneratedSrdMonsterData : undefined;
}

/** Every numeric stat is copied from a pinned local SRD record and carries its exact JSON Pointer. */
export function makeGeneratedSrdMonsterContent(base: Monster, result: LocalMonsterNarrativeResult, id: string): ImportedContent {
  if (monsterOrigin(base) !== 'srd') throw new Error('Генератор П7 сейчас допускает только базовый блок SRD 5.1.');
  const sourceRef = `content/srd/monsters.json#/monsters/${escapePointer(base.id)}`;
  const numericAttributions = numericFields(base).map(field => ({ ...field, sourceRef: `${sourceRef}${field.path}` }));
  const generatedSrdMonster: GeneratedSrdMonsterData = {
    format: GENERATED_SRD_MONSTER_FORMAT,
    version: GENERATED_SRD_MONSTER_VERSION,
    baseMonsterId: base.id,
    rulesSource: {
      system: 'D&D 5e',
      version: 'SRD 5.1',
      license: 'CC BY 4.0',
      catalogSource: MONSTERS_SOURCE.source,
      catalogFetchedAt: MONSTERS_SOURCE.fetchedAt,
    },
    sourceRef,
    cr: base.cr,
    crSourceRef: `${sourceRef}/cr`,
    numericAttributions,
    narrative: result.narrative,
    model: result.model,
    promptVersion: MONSTER_NARRATIVE_PROMPT_VERSION,
    generatedAt: result.generatedAt,
    parameters: { ...result.parameters },
    rawOutput: result.rawOutput,
  };
  const content: ImportedContent = {
    id,
    kind: 'monster',
    name: result.narrative.name,
    sourceFormat: 'json',
    sourceFile: `generated/${base.id}`,
    rights: { status: 'unverified', license: 'Блок-основа: SRD 5.1, CC BY 4.0; производное описание и распространение требуют отдельной проверки' },
    data: { generatedSrdMonster },
  };
  const error = validateGeneratedSrdMonster(content, base);
  if (error) throw new Error(error);
  return content;
}

/** Rejects a changed CR, any altered stat, missing numeric source, or model-generated digits in the prose. */
export function validateGeneratedSrdMonster(content: ImportedContent, base: Monster): string | null {
  const generated = generatedSrdMonsterData(content);
  if (content.kind !== 'monster' || !generated || generated.format !== GENERATED_SRD_MONSTER_FORMAT || generated.version !== GENERATED_SRD_MONSTER_VERSION) return 'Неизвестный формат генерации монстра.';
  if (monsterOrigin(base) !== 'srd' || generated.baseMonsterId !== base.id) return 'Источник генерации не совпадает с SRD-блоком.';
  const sourceRef = `content/srd/monsters.json#/monsters/${escapePointer(base.id)}`;
  const rulesSource = generated.rulesSource;
  if (!rulesSource || rulesSource.system !== 'D&D 5e' || rulesSource.version !== 'SRD 5.1' || rulesSource.license !== 'CC BY 4.0' ||
      rulesSource.catalogSource !== MONSTERS_SOURCE.source || rulesSource.catalogFetchedAt !== MONSTERS_SOURCE.fetchedAt) return 'Не совпадают редакция правил или версия каталога SRD.';
  if (generated.sourceRef !== sourceRef || generated.cr !== base.cr || generated.crSourceRef !== `${sourceRef}/cr` || content.name !== generated.narrative?.name) return 'CR или ссылка на базовый SRD-блок не совпадают с источником.';
  if (!generated.narrative || typeof generated.narrative !== 'object' ||
      ['name', 'appearance', 'behavior', 'habitat'].some(key => typeof generated.narrative[key as keyof MonsterNarrative] !== 'string' || !generated.narrative[key as keyof MonsterNarrative].trim() || /\d/.test(generated.narrative[key as keyof MonsterNarrative]))) return 'Описание содержит неподтверждённые цифры или пустой текст.';
  if (generated.promptVersion !== MONSTER_NARRATIVE_PROMPT_VERSION || typeof generated.model !== 'string' || !generated.model.trim() ||
      typeof generated.generatedAt !== 'string' || !Number.isFinite(Date.parse(generated.generatedAt)) || typeof generated.rawOutput !== 'string') return 'Отсутствуют корректные метаданные модели и prompt.';
  if (!Array.isArray(generated.numericAttributions) || generated.numericAttributions.length !== numericFields(base).length) return 'Не для каждого числового поля указан источник.';
  const expected = numericFields(base).map(field => ({ ...field, sourceRef: `${generated.sourceRef}${field.path}` }));
  if (generated.numericAttributions.some(item => !item || typeof item.path !== 'string' ||
      (typeof item.value !== 'number' && typeof item.value !== 'string') || typeof item.sourceRef !== 'string')) return 'Неверная форма атрибуции чисел.';
  const actual = new Map(generated.numericAttributions.map(item => [item.path, item]));
  for (const field of expected) {
    const claim = actual.get(field.path);
    if (!claim || claim.value !== field.value || claim.sourceRef !== field.sourceRef) return `Число ${field.path} не совпадает с точным значением источника.`;
  }
  return null;
}
