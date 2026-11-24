import {
  MATERIAL_CLASSIFIER_PROMPT_VERSION,
  type MaterialClassifierDraft,
  type MaterialClassificationRequest,
} from '../rules/materials/classification';
import type {
  MaterialClassificationProvider,
} from './materialClassification';

function parseClassifierJson(rawOutput: string): Record<string, unknown> {
  const unfenced = rawOutput.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed: unknown = JSON.parse(unfenced);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Локальный классификатор должен вернуть JSON-объект.');
  return parsed as Record<string, unknown>;
}

/** Keeps source evidence on the same machine; the shared validator checks all labels and exact quotes. */
export const localMaterialClassifier: MaterialClassificationProvider = {
  locality: 'local',
  async classify(request: MaterialClassificationRequest): Promise<MaterialClassifierDraft> {
    const response = await fetch('/vtt/generation/classify-material', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(request),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
      const reason = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' ? payload.error : 'Локальный классификатор недоступен.';
      throw new Error(reason);
    }
    const envelope = payload as Record<string, unknown>;
    if (typeof envelope.rawOutput !== 'string' || typeof envelope.model !== 'string' || !envelope.model.trim() ||
        typeof envelope.generatedAt !== 'string' || !envelope.parameters || typeof envelope.parameters !== 'object' || Array.isArray(envelope.parameters)) {
      throw new Error('Локальный шлюз вернул неполные метаданные классификации.');
    }
    const draft = parseClassifierJson(envelope.rawOutput);
    return {
      ...draft,
      version: request.version,
      candidateId: request.candidateId,
      sourceFingerprint: request.sourceFingerprint,
      promptVersion: MATERIAL_CLASSIFIER_PROMPT_VERSION,
      model: envelope.model,
      parameters: envelope.parameters as Readonly<Record<string, string | number | boolean>>,
      generatedAt: envelope.generatedAt,
      rawOutput: envelope.rawOutput,
    } as MaterialClassifierDraft;
  },
};
