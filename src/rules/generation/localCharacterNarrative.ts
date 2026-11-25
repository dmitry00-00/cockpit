export const CHARACTER_NARRATIVE_PROMPT_VERSION = 'p7-srd-character-reskin-v1' as const;

export interface CharacterNarrativeInput {
  baseName: string;
  race: string;
  characterClass: string;
  level: number;
  concept: string;
}

export interface CharacterNarrative {
  name: string;
  appearance: string;
  personality: string;
  motivation: string;
}

export interface LocalCharacterNarrativeResult {
  narrative: CharacterNarrative;
  model: string;
  generatedAt: string;
  parameters: Readonly<Record<string, string | number | boolean>>;
  rawOutput: string;
}

const FIELDS = ['name', 'appearance', 'personality', 'motivation'] as const;
const MAX_TEXT = 800;

function parseNarrative(rawOutput: string): CharacterNarrative {
  const unfenced = rawOutput.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed: unknown = JSON.parse(unfenced);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Модель должна вернуть JSON-объект персонажа.');
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).some(key => !(FIELDS as readonly string[]).includes(key)) ||
      FIELDS.some(key => typeof record[key] !== 'string' || !(record[key] as string).trim() || (record[key] as string).length > MAX_TEXT || /\p{N}/u.test(record[key] as string))) {
    throw new Error('Модель вернула лишние поля, пустой текст, цифры или слишком длинное описание.');
  }
  return {
    name: (record.name as string).trim(),
    appearance: (record.appearance as string).trim(),
    personality: (record.personality as string).trim(),
    motivation: (record.motivation as string).trim(),
  };
}

/** The local model supplies only prose; all game numbers come from an existing, validated character template. */
export async function generateLocalCharacterNarrative(input: CharacterNarrativeInput): Promise<LocalCharacterNarrativeResult> {
  const response = await fetch('/vtt/generation/character', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(input),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok || !result || typeof result !== 'object' || Array.isArray(result)) {
    const reason = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'Локальный генератор персонажей недоступен.';
    throw new Error(reason);
  }
  const payload = result as Record<string, unknown>;
  if (typeof payload.rawOutput !== 'string' || typeof payload.model !== 'string' || typeof payload.generatedAt !== 'string' ||
      !payload.parameters || typeof payload.parameters !== 'object' || Array.isArray(payload.parameters)) {
    throw new Error('Локальный шлюз вернул неполные метаданные генерации персонажа.');
  }
  return {
    narrative: parseNarrative(payload.rawOutput),
    model: payload.model,
    generatedAt: payload.generatedAt,
    parameters: payload.parameters as Readonly<Record<string, string | number | boolean>>,
    rawOutput: payload.rawOutput,
  };
}
