export const MONSTER_NARRATIVE_PROMPT_VERSION = 'p7-srd-monster-reskin-v1' as const;
export const CR_MONSTER_NARRATIVE_PROMPT_VERSION = 'p7-cr-monster-narrative-v1' as const;
export type MonsterNarrativeMode = 'srd-reskin' | 'cr-candidate';

export interface MonsterNarrativeInput {
  baseName: string;
  size: string;
  creatureType: string;
  alignment: string;
  concept: string;
  mode?: MonsterNarrativeMode;
}

export interface MonsterNarrative {
  name: string;
  appearance: string;
  behavior: string;
  habitat: string;
}

export interface LocalMonsterNarrativeResult {
  narrative: MonsterNarrative;
  model: string;
  generatedAt: string;
  parameters: Readonly<Record<string, string | number | boolean>>;
  rawOutput: string;
  promptVersion: typeof MONSTER_NARRATIVE_PROMPT_VERSION | typeof CR_MONSTER_NARRATIVE_PROMPT_VERSION;
}

const MAX_TEXT = 800;
const NARRATIVE_FIELDS = ['name', 'appearance', 'behavior', 'habitat'] as const;
const NUMERAL_WORDS = /(?:^|[^\p{L}])(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|once|twice|ноль|нуль|один(?:а|о|ы|у|ом|ой|ого|ому)?|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять|одиннадцать|двенадцать|тринадцать|четырнадцать|пятнадцать|шестнадцать|семнадцать|восемнадцать|девятнадцать|двадцать|тридцать|сорок|пятьдесят|шестьдесят|семьдесят|восемьдесят|девяносто|сто|двести|триста|четыреста|пятьсот|шестьсот|семьсот|восемьсот|девятьсот|тысяча|перв(?:ый|ая|ое|ые|ого|ому|ым|ой)|втор(?:ой|ая|ое|ые|ого|ому|ым|ой)|трет(?:ий|ья|ье|ьи|ьего|ьему|ьим|ьей)|четвёрт(?:ый|ая|ое|ые|ого|ому|ым|ой)|пят(?:ый|ая|ое|ые|ого|ому|ым|ой)|шест(?:ый|ая|ое|ые|ого|ому|ым|ой)|седьм(?:ой|ая|ое|ые|ого|ому|ым|ой)|восьм(?:ой|ая|ое|ые|ого|ому|ым|ой)|девят(?:ый|ая|ое|ые|ого|ому|ым|ой)|десят(?:ый|ая|ое|ые|ого|ому|ым|ой))(?=$|[^\p{L}])/iu;

export function containsNumericNarrative(text: string): boolean {
  return /\p{N}/u.test(text) || NUMERAL_WORDS.test(text);
}

export function parseMonsterNarrativeOutput(rawOutput: string): MonsterNarrative {
  const unfenced = rawOutput.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed: unknown = JSON.parse(unfenced);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Модель должна вернуть JSON-объект описания.');
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).some(key => !(NARRATIVE_FIELDS as readonly string[]).includes(key)) ||
      NARRATIVE_FIELDS.some(key => typeof record[key] !== 'string' || !(record[key] as string).trim() || (record[key] as string).length > MAX_TEXT || containsNumericNarrative(record[key] as string))) {
    throw new Error('Модель вернула лишние поля, пустой текст, цифры или слишком длинное описание.');
  }
  return {
    name: (record.name as string).trim(),
    appearance: (record.appearance as string).trim(),
    behavior: (record.behavior as string).trim(),
    habitat: (record.habitat as string).trim(),
  };
}

/** Calls the same-origin, loopback-only Vite endpoint; no imported rule text or statblock is sent. */
export async function generateLocalMonsterNarrative(input: MonsterNarrativeInput): Promise<LocalMonsterNarrativeResult> {
  const response = await fetch('/vtt/generation/monster', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(input),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok || !result || typeof result !== 'object' || Array.isArray(result)) {
    const reason = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'Локальный генератор недоступен.';
    throw new Error(reason);
  }
  const payload = result as Record<string, unknown>;
  const expectedPrompt = input.mode === 'cr-candidate' ? CR_MONSTER_NARRATIVE_PROMPT_VERSION : MONSTER_NARRATIVE_PROMPT_VERSION;
  if (typeof payload.rawOutput !== 'string' || typeof payload.model !== 'string' || typeof payload.generatedAt !== 'string' ||
      payload.promptVersion !== expectedPrompt || !payload.parameters || typeof payload.parameters !== 'object' || Array.isArray(payload.parameters)) {
    throw new Error('Локальный шлюз вернул неполные метаданные генерации.');
  }
  return {
    narrative: parseMonsterNarrativeOutput(payload.rawOutput),
    model: payload.model,
    generatedAt: payload.generatedAt,
    parameters: payload.parameters as Readonly<Record<string, string | number | boolean>>,
    rawOutput: payload.rawOutput,
    promptVersion: expectedPrompt,
  };
}
