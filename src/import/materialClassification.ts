import {
  MATERIAL_CLASSIFICATION_VERSION,
  MATERIAL_CLASSIFIER_PROMPT_VERSION,
  MATERIAL_CLASS_KINDS,
  MATERIAL_MECHANIC_TAGS,
  type MaterialAssessment,
  type MaterialClassificationClaim,
  type MaterialClassificationRequest,
  type MaterialClassifierDraft,
  type MaterialEvidenceSpan,
} from '../rules/materials/classification';

export interface ParsedMaterialCandidate {
  id: string;
  name: string;
  kind: string;
  sourceFormat: string;
  sourceFile: string;
  rights?: { status: 'declared' | 'unverified'; license?: string };
  data: Readonly<Record<string, unknown>>;
}

export interface MaterialClassificationProvider {
  readonly locality: 'local';
  classify(request: MaterialClassificationRequest): Promise<MaterialClassifierDraft>;
}

const TEXT_FIELDS = /^(entries|entry|description|text|content|details|effect|feature|trait|activation|trigger|condition|outcome|success|failure|special|summary|flavor|notes?|rule|body|action|reaction|legendary|paragraphs?)$/i;
const METADATA_FIELDS = /^(id|_id|name|source|license|edition|url|type|kind|img|image|uuid|flags|sort|folder|ownership|permission|copyright)$/i;
const MAX_EVIDENCE_SPANS = 100;
const MAX_EVIDENCE_CHARS = 24_000;

const escapePointer = (segment: string | number) => String(segment).replace(/~/g, '~0').replace(/\//g, '~1');

async function sourceFingerprint(candidate: ParsedMaterialCandidate): Promise<string> {
  const source = JSON.stringify({
    id: candidate.id,
    name: candidate.name,
    kind: candidate.kind,
    sourceFormat: candidate.sourceFormat,
    sourceFile: candidate.sourceFile,
    rights: candidate.rights ?? null,
    data: candidate.data,
  });
  const bytes = new TextEncoder().encode(source);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function collectEvidence(data: Readonly<Record<string, unknown>>): { evidence: MaterialEvidenceSpan[]; partial: boolean } {
  const evidence: MaterialEvidenceSpan[] = [];
  let charCount = 0;
  let partial = false;

  const visit = (value: unknown, locator: string, textContext: boolean): void => {
    if (typeof value === 'string') {
      const normalized = value.trim();
      const paragraphLike = normalized.length >= 40 && /\s/.test(normalized);
      if ((!textContext && !paragraphLike) || normalized.length < 12) return;
      if (evidence.length >= MAX_EVIDENCE_SPANS || charCount + value.length > MAX_EVIDENCE_CHARS) {
        partial = true;
        return;
      }
      evidence.push({ locator: locator || '/', text: value });
      charCount += value.length;
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, `${locator}/${index}`, textContext));
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (METADATA_FIELDS.test(key) || key.startsWith('_')) continue;
      const childContext = textContext || TEXT_FIELDS.test(key);
      visit(child, `${locator}/${escapePointer(key)}`, childContext);
    }
  };

  visit(data, '', false);
  return { evidence, partial };
}

/** Produce local-only, source-located classifier input from a parser candidate. */
export async function materialClassificationRequest(candidate: ParsedMaterialCandidate): Promise<MaterialClassificationRequest> {
  const { evidence, partial } = collectEvidence(candidate.data);
  const dataEdition = typeof candidate.data.edition === 'string' ? candidate.data.edition : 'не определена';
  return {
    version: MATERIAL_CLASSIFICATION_VERSION,
    candidateId: candidate.id,
    sourceFingerprint: await sourceFingerprint(candidate),
    contentKind: candidate.kind,
    sourceFormat: candidate.sourceFormat,
    sourceFile: candidate.sourceFile,
    ...(candidate.rights?.license ? { license: candidate.rights.license } : {}),
    edition: dataEdition,
    localOnly: true,
    evidenceCoverage: partial ? 'partial' : 'complete',
    evidence,
  };
}

export function validateMaterialClassifierDraft(
  request: MaterialClassificationRequest,
  draft: MaterialClassifierDraft,
): Extract<MaterialAssessment, { status: 'pending-review' }> {
  if (draft.version !== MATERIAL_CLASSIFICATION_VERSION) throw new Error('Unsupported material-classification version.');
  if (draft.candidateId !== request.candidateId || draft.sourceFingerprint !== request.sourceFingerprint) {
    throw new Error('Classifier result does not match the parsed source record.');
  }
  if (draft.promptVersion !== MATERIAL_CLASSIFIER_PROMPT_VERSION) throw new Error('Unsupported material-classifier prompt version.');
  if (!MATERIAL_CLASS_KINDS.includes(draft.kind)) throw new Error('Unknown material classification kind.');
  if (!draft.model.trim() || !Number.isFinite(Date.parse(draft.generatedAt)) || typeof draft.rawOutput !== 'string' || draft.rawOutput.length > 12_000) {
    throw new Error('Classifier result is missing model provenance or exceeds the raw-output limit.');
  }
  if (!draft.parameters || typeof draft.parameters !== 'object' || Array.isArray(draft.parameters)) throw new Error('Classifier parameters must be recorded.');
  if (!Number.isFinite(draft.confidence) || draft.confidence < 0 || draft.confidence > 1) throw new Error('Classifier confidence must be from 0 to 1.');
  if (!Array.isArray(draft.tags) || draft.tags.some(tag => !MATERIAL_MECHANIC_TAGS.includes(tag))) throw new Error('Classifier returned a tag outside the approved vocabulary.');
  if (new Set(draft.tags).size !== draft.tags.length) throw new Error('Classifier returned a duplicate tag.');
  if (!Array.isArray(draft.unknowns) || draft.unknowns.some(item => typeof item !== 'string' || !item.trim())) throw new Error('Classifier unknowns must be non-empty strings.');
  if (!Array.isArray(draft.evidence) || draft.evidence.length === 0) throw new Error('Classifier result needs exact source evidence.');

  const sourceSpans = new Map(request.evidence.map(span => [span.locator, span.text]));
  const claims: MaterialClassificationClaim[] = [];
  for (const claim of draft.evidence) {
    if (claim.role !== 'kind' && claim.role !== 'tag') throw new Error('Classifier evidence has an unsupported role.');
    if (!claim.quote.trim() || !sourceSpans.get(claim.locator)?.includes(claim.quote)) {
      throw new Error(`Classifier quote is not an exact substring at ${claim.locator}.`);
    }
    if (claim.role === 'tag') {
      if (!claim.tag || !draft.tags.includes(claim.tag)) throw new Error('Tag evidence must support a tag returned by the classifier.');
    } else if (claim.tag) {
      throw new Error('Kind evidence must not carry a mechanic tag.');
    }
    claims.push({ ...claim });
  }
  if (!claims.some(claim => claim.role === 'kind')) throw new Error('Classifier result needs evidence for its material kind.');
  for (const tag of draft.tags) {
    if (!claims.some(claim => claim.role === 'tag' && claim.tag === tag)) throw new Error(`Tag ${tag} has no supporting quote.`);
  }

  return {
    version: MATERIAL_CLASSIFICATION_VERSION,
    status: 'pending-review',
    sourceFingerprint: request.sourceFingerprint,
    evidenceCoverage: request.evidenceCoverage,
    promptVersion: draft.promptVersion,
    model: draft.model,
    parameters: { ...draft.parameters },
    generatedAt: draft.generatedAt,
    rawOutput: draft.rawOutput,
    kind: draft.kind,
    tags: [...draft.tags],
    evidence: claims,
    unknowns: [...draft.unknowns],
    confidence: draft.confidence,
  };
}

/** Parse-stage handoff: local classifier output becomes a proposal, never an accepted label. */
export async function classifyParsedMaterials<T extends ParsedMaterialCandidate>(
  candidates: readonly T[],
  provider?: MaterialClassificationProvider,
): Promise<Array<T & { materialAssessment: MaterialAssessment }>> {
  const results: Array<T & { materialAssessment: MaterialAssessment }> = [];
  for (const candidate of candidates) {
    const request = await materialClassificationRequest(candidate);
    let assessment: MaterialAssessment;
    if (!request.evidence.length) {
      assessment = {
        version: MATERIAL_CLASSIFICATION_VERSION,
        status: 'no-evidence',
        sourceFingerprint: request.sourceFingerprint,
        evidenceCount: 0,
        reason: 'parser found no text-bearing fields',
      };
    } else if (!provider) {
      assessment = {
        version: MATERIAL_CLASSIFICATION_VERSION,
        status: 'awaiting-classifier',
        sourceFingerprint: request.sourceFingerprint,
        evidenceCount: request.evidence.length,
        evidenceCoverage: request.evidenceCoverage,
      };
    } else if ((provider as { locality?: unknown }).locality !== 'local') {
      assessment = {
        version: MATERIAL_CLASSIFICATION_VERSION,
        status: 'classifier-error',
        sourceFingerprint: request.sourceFingerprint,
        reason: 'Material text may only be sent to a provider explicitly marked local.',
      };
    } else {
      try {
        const draft = await provider.classify(request);
        assessment = validateMaterialClassifierDraft(request, draft);
      } catch (error) {
        assessment = {
          version: MATERIAL_CLASSIFICATION_VERSION,
          status: 'classifier-error',
          sourceFingerprint: request.sourceFingerprint,
          reason: (error instanceof Error ? error.message : String(error)).slice(0, 240),
        };
      }
    }
    results.push({ ...candidate, materialAssessment: assessment });
  }
  return results;
}
