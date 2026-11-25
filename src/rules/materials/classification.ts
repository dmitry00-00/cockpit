/** Material classifier vocabulary from the D&D mechanics handoff. */
export const MATERIAL_CLASSIFICATION_VERSION = 'dnd-mechanics-assessment/1' as const;
export const MATERIAL_CLASSIFIER_PROMPT_VERSION = 'dnd-mechanics-v3' as const;

export const MATERIAL_CLASS_KINDS = ['mechanic', 'fragment', 'nonmechanic', 'ambiguous'] as const;
export type MaterialClassKind = (typeof MATERIAL_CLASS_KINDS)[number];

/** Core primitives plus the supporting labels used by the handoff's blind pilot. */
export const MATERIAL_MECHANIC_TAGS = [
  'Ability', 'Effect', 'Resource', 'Constraint', 'Activation', 'Recovery', 'Progression',
  'ChoiceSet', 'Resolution',
] as const;
export type MaterialMechanicTag = (typeof MATERIAL_MECHANIC_TAGS)[number];

export interface MaterialEvidenceSpan {
  locator: string;
  text: string;
}

export interface MaterialClassificationRequest {
  version: typeof MATERIAL_CLASSIFICATION_VERSION;
  candidateId: string;
  sourceFingerprint: string;
  contentKind: string;
  sourceFormat: string;
  sourceFile: string;
  license?: string;
  edition: string;
  localOnly: true;
  evidenceCoverage: 'complete' | 'partial';
  evidence: readonly MaterialEvidenceSpan[];
}

export interface MaterialClassificationClaim {
  locator: string;
  quote: string;
  role: 'kind' | 'tag';
  tag?: MaterialMechanicTag;
}

export interface MaterialClassifierDraft {
  version: typeof MATERIAL_CLASSIFICATION_VERSION;
  candidateId: string;
  sourceFingerprint: string;
  promptVersion: typeof MATERIAL_CLASSIFIER_PROMPT_VERSION;
  model: string;
  parameters: Readonly<Record<string, string | number | boolean>>;
  generatedAt: string;
  rawOutput: string;
  kind: MaterialClassKind;
  tags: readonly MaterialMechanicTag[];
  evidence: readonly MaterialClassificationClaim[];
  unknowns: readonly string[];
  confidence: number;
}

export type MaterialAssessment =
  | {
      version: typeof MATERIAL_CLASSIFICATION_VERSION;
      status: 'awaiting-classifier';
      sourceFingerprint: string;
      evidenceCount: number;
      evidenceCoverage: 'complete' | 'partial';
    }
  | {
      version: typeof MATERIAL_CLASSIFICATION_VERSION;
      status: 'no-evidence';
      sourceFingerprint: string;
      evidenceCount: 0;
      reason: 'parser found no text-bearing fields';
    }
  | {
      version: typeof MATERIAL_CLASSIFICATION_VERSION;
      status: 'pending-review';
      sourceFingerprint: string;
      evidenceCoverage: 'complete' | 'partial';
      promptVersion: typeof MATERIAL_CLASSIFIER_PROMPT_VERSION;
      model: string;
      parameters: Readonly<Record<string, string | number | boolean>>;
      generatedAt: string;
      rawOutput: string;
      kind: MaterialClassKind;
      tags: readonly MaterialMechanicTag[];
      evidence: readonly MaterialClassificationClaim[];
      unknowns: readonly string[];
      confidence: number;
    }
  | {
      version: typeof MATERIAL_CLASSIFICATION_VERSION;
      status: 'classifier-error';
      sourceFingerprint: string;
      reason: string;
    };
