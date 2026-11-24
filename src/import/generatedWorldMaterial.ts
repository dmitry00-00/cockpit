import type { ImportedContent } from '../engine';
import { layoutWorldMaterial, validateWorldMaterialGeometry, type WorldMaterialGeometry } from '../map/worldMaterialGeometry';
import {
  generateDungeonTacticalGeometry,
  validateDungeonTacticalGeometry,
  type DungeonTacticalGeometry,
} from '../map/dungeonTactical';
import {
  WORLD_MATERIAL_PROMPT_VERSION,
  type LocalWorldMaterialResult,
  type WorldMaterialEdition,
  type WorldMaterialKind,
} from '../rules/generation/localWorldMaterialDraft';

export const GENERATED_WORLD_MATERIAL_FORMAT = 'dm-cockpit-world-material-draft' as const;
export const GENERATED_WORLD_MATERIAL_VERSION = 1 as const;

export interface GeneratedWorldMaterialData {
  format: typeof GENERATED_WORLD_MATERIAL_FORMAT;
  version: typeof GENERATED_WORLD_MATERIAL_VERSION;
  kind: WorldMaterialKind;
  edition: `D&D 5e / ${WorldMaterialEdition}`;
  layer: 'HB';
  concept: string;
  draft: LocalWorldMaterialResult['draft'];
  geometry: WorldMaterialGeometry;
  /** Optional for compatibility with dungeon drafts created before the tactical plan vertical. */
  tacticalGeometry?: DungeonTacticalGeometry;
  numericPolicy: { status: 'no-rules-or-values-generated' };
  activation: { status: 'catalog-only'; mapGeometryCreated: false; worldLocationCreated: false };
  provenance: {
    kind: 'local-model-generated-proposal';
    model: string;
    promptVersion: typeof WORLD_MATERIAL_PROMPT_VERSION;
    generatedAt: string;
    parameters: Readonly<Record<string, string | number | boolean>>;
    rawOutput: string;
  };
}

function rawGeneratedWorldMaterialData(content: ImportedContent): GeneratedWorldMaterialData | undefined {
  if ((content.kind !== 'dungeon' && content.kind !== 'location') || !content.data || typeof content.data !== 'object') return undefined;
  const data = content.data as Partial<GeneratedWorldMaterialData>;
  return data.format === GENERATED_WORLD_MATERIAL_FORMAT && data.geometry ? data as GeneratedWorldMaterialData : undefined;
}

export function generatedWorldMaterialData(content: ImportedContent): GeneratedWorldMaterialData | undefined {
  const data = rawGeneratedWorldMaterialData(content);
  return data && !validateGeneratedWorldMaterial(content) ? data : undefined;
}

export function makeGeneratedWorldMaterialContent(
  concept: string,
  edition: WorldMaterialEdition,
  result: LocalWorldMaterialResult,
  id: string,
): ImportedContent {
  const kind = result.draft.kind;
  const content: ImportedContent = {
    id,
    kind,
    name: result.draft.name,
    sourceFormat: 'json',
    sourceFile: `generated/${kind}/${id}.json`,
    rights: { status: 'unverified', license: 'Внутренний HB-черновик, созданный локальной моделью; права распространения не проверены' },
    data: {
      format: GENERATED_WORLD_MATERIAL_FORMAT,
      version: GENERATED_WORLD_MATERIAL_VERSION,
      kind,
      edition: `D&D 5e / ${edition}`,
      layer: 'HB',
      concept: concept.trim(),
      draft: result.draft,
      geometry: layoutWorldMaterial(result.draft),
      ...(kind === 'dungeon' ? { tacticalGeometry: generateDungeonTacticalGeometry(result.draft) } : {}),
      numericPolicy: { status: 'no-rules-or-values-generated' },
      activation: { status: 'catalog-only', mapGeometryCreated: false, worldLocationCreated: false },
      provenance: {
        kind: 'local-model-generated-proposal',
        model: result.model,
        promptVersion: WORLD_MATERIAL_PROMPT_VERSION,
        generatedAt: result.generatedAt,
        parameters: { ...result.parameters },
        rawOutput: result.rawOutput,
      },
    },
  };
  const error = validateGeneratedWorldMaterial(content, edition);
  if (error) throw new Error(error);
  return content;
}

export function validateGeneratedWorldMaterial(content: ImportedContent, edition?: WorldMaterialEdition): string | null {
  const data = rawGeneratedWorldMaterialData(content);
  if (!data || data.version !== GENERATED_WORLD_MATERIAL_VERSION || data.kind !== content.kind || content.name !== data.draft?.name) return 'Неизвестный формат черновика места или подземелья.';
  if (data.layer !== 'HB' || !['2014', '2024'].some(version => data.edition === `D&D 5e / ${version}`) || (edition && data.edition !== `D&D 5e / ${edition}`)) return 'Не указаны версия правил или слой HB.';
  if (!data.concept?.trim() || data.concept.length > 500 || data.numericPolicy?.status !== 'no-rules-or-values-generated') return 'Нет концепта или нарушена политика чисел.';
  if (data.activation?.status !== 'catalog-only' || data.activation.mapGeometryCreated !== false || data.activation.worldLocationCreated !== false) return 'Генерация не может автоматически создавать карту или место мира.';
  const provenance = data.provenance;
  if (provenance?.kind !== 'local-model-generated-proposal' || provenance.promptVersion !== WORLD_MATERIAL_PROMPT_VERSION || !provenance.model?.trim() || !Number.isFinite(Date.parse(provenance.generatedAt)) || typeof provenance.rawOutput !== 'string') return 'Не хватает provenance модели и prompt.';
  if (data.kind === 'dungeon' && data.draft.kind !== 'dungeon' || data.kind === 'location' && data.draft.kind !== 'location') return 'Тип графа не совпадает с типом записи.';
  try { validateWorldMaterialGeometry(data.geometry, data.draft); } catch (error) { return error instanceof Error ? error.message : String(error); }
  if (data.tacticalGeometry !== undefined) {
    if (data.kind !== 'dungeon' || data.draft.kind !== 'dungeon') return 'Тактический план может принадлежать только подземелью.';
    try { validateDungeonTacticalGeometry(data.tacticalGeometry, data.draft); } catch (error) { return error instanceof Error ? error.message : String(error); }
  }
  return null;
}
