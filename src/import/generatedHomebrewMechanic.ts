import type { ImportedContent } from '../engine';
import {
  containsMechanicNumberToken,
  HOMEBREW_MECHANIC_PROMPT_VERSION,
  type LocalMechanicDraftResult,
  type MechanicTargetEdition,
} from '../rules/generation/localMechanicDraft';

export const GENERATED_HOMEBREW_MECHANIC_FORMAT = 'dm-cockpit-homebrew-mechanic-draft' as const;
export const GENERATED_HOMEBREW_MECHANIC_VERSION = 1 as const;
const PROPOSAL_FIELDS = ['name', 'purpose', 'trigger', 'effect', 'costOrLimit', 'recoveryOrDuration'] as const;
export const HOMEBREW_NUMERIC_FIELDS = ['trigger', 'effect', 'costOrLimit', 'recoveryOrDuration'] as const;
export type HomebrewNumericField = typeof HOMEBREW_NUMERIC_FIELDS[number];

type HomebrewNumericOriginInput =
  | { kind: 'author-input'; note?: string }
  | { kind: 'source'; title: string; system: string; version: string; layer: string; locator: string; excerpt?: string }
  | { kind: 'derived'; formula: string; sourceRefs: readonly string[] };

export interface ManualHomebrewNumberInput {
  field: HomebrewNumericField;
  label: string;
  value: string;
  origin: HomebrewNumericOriginInput;
}

export type HomebrewNumericOrigin =
  | { kind: 'author-input'; ruleset: { system: 'D&D 5e'; version: MechanicTargetEdition; layer: 'HB' }; note?: string }
  | Exclude<HomebrewNumericOriginInput, { kind: 'author-input' }>;

export interface HomebrewNumericAttribution {
  id: string;
  field: HomebrewNumericField;
  label: string;
  value: string;
  origin: HomebrewNumericOrigin;
}

export interface GeneratedHomebrewMechanicData {
  format: typeof GENERATED_HOMEBREW_MECHANIC_FORMAT;
  version: typeof GENERATED_HOMEBREW_MECHANIC_VERSION;
  edition: `D&D 5e / ${MechanicTargetEdition}`;
  ruleset: { system: 'D&D 5e'; version: MechanicTargetEdition; layer: 'HB' };
  proposal: LocalMechanicDraftResult['proposal'];
  numericPolicy: { status: 'not-generated' | 'manual-input'; numericAttributions: readonly HomebrewNumericAttribution[] };
  execution: { executable: false; reviewStatus: 'pending-review' };
  concept: string;
  promptVersion: typeof HOMEBREW_MECHANIC_PROMPT_VERSION;
  model: string;
  parameters: Readonly<Record<string, string | number | boolean>>;
  generatedAt: string;
  rawOutput: string;
}

export function generatedHomebrewMechanicData(content: ImportedContent): GeneratedHomebrewMechanicData | undefined {
  if (content.kind !== 'mechanic' || !content.data || typeof content.data !== 'object') return undefined;
  const data = content.data as Partial<GeneratedHomebrewMechanicData>;
  return data.format === GENERATED_HOMEBREW_MECHANIC_FORMAT ? data as GeneratedHomebrewMechanicData : undefined;
}

export function makeGeneratedHomebrewMechanicContent(
  concept: string,
  edition: MechanicTargetEdition,
  result: LocalMechanicDraftResult,
  id: string,
  numericInputs: readonly ManualHomebrewNumberInput[] = [],
): ImportedContent {
  const numericAttributions: HomebrewNumericAttribution[] = numericInputs.map((input, index) => ({
    ...input,
    id: `${id}:numeric:${index + 1}`,
    origin: input.origin.kind === 'author-input'
      ? { kind: 'author-input', ruleset: { system: 'D&D 5e', version: edition, layer: 'HB' }, ...(input.origin.note?.trim() ? { note: input.origin.note.trim() } : {}) }
      : input.origin.kind === 'source'
        ? { ...input.origin }
        : { ...input.origin, sourceRefs: [...input.origin.sourceRefs] },
  }));
  const content: ImportedContent = {
    id,
    kind: 'mechanic',
    name: result.proposal.name,
    sourceFormat: 'json',
    sourceFile: `generated/homebrew-mechanics/${id}.json`,
    rights: { status: 'unverified', license: 'Внутренний черновик, созданный локальной моделью; права распространения не проверены' },
    data: {
      format: GENERATED_HOMEBREW_MECHANIC_FORMAT,
      version: GENERATED_HOMEBREW_MECHANIC_VERSION,
      edition: `D&D 5e / ${edition}`,
      ruleset: { system: 'D&D 5e', version: edition, layer: 'HB' },
      proposal: result.proposal,
      numericPolicy: { status: numericAttributions.length ? 'manual-input' : 'not-generated', numericAttributions },
      execution: { executable: false, reviewStatus: 'pending-review' },
      concept: concept.trim(),
      promptVersion: HOMEBREW_MECHANIC_PROMPT_VERSION,
      model: result.model,
      parameters: { ...result.parameters },
      generatedAt: result.generatedAt,
      rawOutput: result.rawOutput,
    },
  };
  const error = validateGeneratedHomebrewMechanic(content);
  if (error) throw new Error(error);
  return content;
}

/** Model text stays qualitative; separately entered numbers carry their own source attribution and remain non-executable. */
export function validateGeneratedHomebrewMechanic(content: ImportedContent): string | null {
  const data = generatedHomebrewMechanicData(content);
  if (content.kind !== 'mechanic' || !data || data.version !== GENERATED_HOMEBREW_MECHANIC_VERSION) return 'Неизвестный формат черновика механики.';
  if (!['2014', '2024'].includes(data.ruleset?.version) || data.ruleset?.system !== 'D&D 5e' || data.ruleset?.layer !== 'HB' || data.edition !== `D&D 5e / ${data.ruleset.version}`) return 'Не указаны система, версия правил или слой HB.';
  if (!data.concept?.trim() || data.concept.length > 500 || content.name !== data.proposal?.name || !data.proposal) return 'Не совпадают концепт или название черновика.';
  const proposalKeys = Object.keys(data.proposal);
  const values = PROPOSAL_FIELDS.map(field => data.proposal[field]);
  if (proposalKeys.length !== PROPOSAL_FIELDS.length || proposalKeys.some(key => !(PROPOSAL_FIELDS as readonly string[]).includes(key)) ||
      values.some(value => typeof value !== 'string' || !value.trim() || value.length > 900 || containsMechanicNumberToken(value))) return 'Черновик содержит пустые, слишком длинные или численно заданные механические положения.';
  if (data.promptVersion !== HOMEBREW_MECHANIC_PROMPT_VERSION || !data.model?.trim() || !Number.isFinite(Date.parse(data.generatedAt)) || typeof data.rawOutput !== 'string') return 'Не хватает provenance модели и prompt.';
  const numericPolicy = data.numericPolicy;
  const claims = numericPolicy?.numericAttributions;
  if (!numericPolicy || !Array.isArray(claims) || claims.length > 24 || numericPolicy.status !== (claims.length ? 'manual-input' : 'not-generated')) return 'Числовые значения допускаются только как отдельный ручной ввод с атрибуцией.';
  const numericClaims = claims as readonly HomebrewNumericAttribution[];
  const ids = new Set<string>();
  for (const claim of numericClaims) {
    if (!claim || typeof claim !== 'object' || typeof claim.id !== 'string' || !claim.id.startsWith(`${content.id}:numeric:`) || ids.has(claim.id)) return 'Некорректный или повторный идентификатор числовой атрибуции.';
    ids.add(claim.id);
    if (!HOMEBREW_NUMERIC_FIELDS.includes(claim.field) || typeof claim.label !== 'string' || !claim.label.trim() || claim.label.length > 80 ||
        typeof claim.value !== 'string' || !claim.value.trim() || claim.value.length > 80 || !/\p{N}/u.test(claim.value)) return 'У каждого HB-числа должны быть назначение, метка и числовое выражение.';
    const origin = claim.origin;
    if (origin?.kind === 'author-input') {
      if (origin.ruleset?.system !== 'D&D 5e' || origin.ruleset.version !== data.ruleset.version || origin.ruleset.layer !== 'HB' ||
          (origin.note !== undefined && (typeof origin.note !== 'string' || origin.note.length > 300))) return 'Авторский ввод должен быть привязан к выбранной версии D&D 5e и слою HB.';
    } else if (origin?.kind === 'source') {
      if (![origin.title, origin.system, origin.version, origin.layer, origin.locator].every(value => typeof value === 'string' && value.trim() && value.length <= 240) ||
          (origin.excerpt !== undefined && (typeof origin.excerpt !== 'string' || origin.excerpt.length > 500))) return 'Для внешнего числа укажите источник, систему, версию, слой и точный локатор.';
    } else if (origin?.kind === 'derived') {
      if (typeof origin.formula !== 'string' || !origin.formula.trim() || origin.formula.length > 240 || !Array.isArray(origin.sourceRefs) || origin.sourceRefs.length === 0 || origin.sourceRefs.length > 12 ||
          origin.sourceRefs.some(ref => typeof ref !== 'string' || !ref.trim() || ref.length > 240)) return 'Для расчётного числа укажите формулу и хотя бы одну ссылку на исходные значения.';
    } else return 'У HB-числа не указано происхождение.';
  }
  if (data.execution?.executable !== false || data.execution?.reviewStatus !== 'pending-review') return 'Сгенерированный черновик не может быть исполняемым или автоматически принятым.';
  return null;
}
