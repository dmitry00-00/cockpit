// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { classifyParsedMaterials, materialClassificationRequest, validateMaterialClassifierDraft } from './materialClassification';
import type { MaterialClassifierDraft } from '../rules/materials/classification';

const candidate = {
  id: 'import-wolf-3ha8',
  name: 'Wolf',
  kind: 'monster',
  sourceFormat: '5etools',
  sourceFile: 'bestiary.json',
  rights: { status: 'declared' as const, license: 'CC BY 4.0' },
  data: { monster: { entries: ['While the wolf is in dim light, it can hide as a bonus action.'] }, edition: 'D&D 5e / 2014' },
};

function draftFor(request: Awaited<ReturnType<typeof materialClassificationRequest>>): MaterialClassifierDraft {
  const span = request.evidence[0];
  return {
    version: 'dnd-mechanics-assessment/1',
    candidateId: request.candidateId,
    sourceFingerprint: request.sourceFingerprint,
    promptVersion: 'dnd-mechanics-v3',
    model: 'local-test-model',
    parameters: { temperature: 0 },
    generatedAt: '2026-11-16T19:00:00Z',
    rawOutput: '{"kind":"mechanic","tags":["Ability","Activation"]}',
    kind: 'mechanic',
    tags: ['Ability', 'Activation'],
    evidence: [
      { locator: span.locator, quote: 'the wolf is in dim light', role: 'kind' },
      { locator: span.locator, quote: 'it can hide as a bonus action', role: 'tag', tag: 'Ability' },
      { locator: span.locator, quote: 'bonus action', role: 'tag', tag: 'Activation' },
    ],
    unknowns: ['Exact visibility rule is outside this record.'],
    confidence: 0.78,
  };
}

describe('parsed material classification cycle', () => {
  it('extracts source-located text and waits when no local provider is configured', async () => {
    const request = await materialClassificationRequest(candidate);
    expect(request).toMatchObject({
      candidateId: candidate.id,
      contentKind: 'monster',
      sourceFile: 'bestiary.json',
      license: 'CC BY 4.0',
      edition: 'D&D 5e / 2014',
      localOnly: true,
      evidenceCoverage: 'complete',
    });
    expect(request.evidence).toContainEqual({
      locator: '/monster/entries/0',
      text: 'While the wolf is in dim light, it can hide as a bonus action.',
    });

    const [staged] = await classifyParsedMaterials([candidate]);
    expect(staged.materialAssessment).toMatchObject({ status: 'awaiting-classifier', evidenceCount: 1 });
    expect(staged.data).toEqual(candidate.data);
  });

  it('validates exact evidence and keeps model output pending manual review', async () => {
    const request = await materialClassificationRequest(candidate);
    expect(validateMaterialClassifierDraft(request, draftFor(request))).toMatchObject({
      status: 'pending-review', kind: 'mechanic', tags: ['Ability', 'Activation'], confidence: 0.78,
    });
    expect(() => validateMaterialClassifierDraft(request, {
      ...draftFor(request), evidence: [{ ...draftFor(request).evidence[0], quote: 'the wolf is always hidden' }],
    })).toThrow(/not an exact substring/);
  });

  it('rejects classifier results for a changed candidate and does not mutate input', async () => {
    const request = await materialClassificationRequest(candidate);
    const badProvider = {
      locality: 'local' as const,
      classify: async () => ({ ...draftFor(request), sourceFingerprint: 'changed-source' }),
    };
    const original = structuredClone(candidate);
    const [staged] = await classifyParsedMaterials([candidate], badProvider);
    expect(staged.materialAssessment.status).toBe('classifier-error');
    expect(candidate).toEqual(original);
  });
});
