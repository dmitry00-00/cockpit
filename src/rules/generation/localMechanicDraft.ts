export const HOMEBREW_MECHANIC_PROMPT_VERSION = 'p7-homebrew-mechanic-draft-v1' as const;

export type MechanicTargetEdition = '2014' | '2024';

export interface MechanicDraftInput {
  concept: string;
  edition: MechanicTargetEdition;
}

export interface HomebrewMechanicProposal {
  name: string;
  purpose: string;
  trigger: string;
  effect: string;
  costOrLimit: string;
  recoveryOrDuration: string;
}

export interface LocalMechanicDraftResult {
  proposal: HomebrewMechanicProposal;
  model: string;
  generatedAt: string;
  parameters: Readonly<Record<string, string | number | boolean>>;
  rawOutput: string;
}

const FIELDS = ['name', 'purpose', 'trigger', 'effect', 'costOrLimit', 'recoveryOrDuration'] as const;
const MAX_TEXT = 900;
// No numbers, number words, counts, dice expressions, DCs, uses, or durations may be supplied by the model.
const NUMBER_TOKEN = /\p{N}|(?<![\p{L}])(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|once|twice|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|single|pair|ноль|нуль|один|одна|одно|одни|одного|одной|одну|одним|одном|два|две|двух|двум|двумя|три|трёх|трех|трём|трем|тремя|четыре|четырёх|четырех|четырём|четырем|пять|пяти|пятью|шесть|шести|шестью|семь|семи|семью|восемь|восьми|восемью|девять|девяти|девятью|десять|десяти|десятью|одиннадцать|двенадцать|тринадцать|четырнадцать|пятнадцать|шестнадцать|семнадцать|восемнадцать|девятнадцать|двадцать|тридцать|сорок|пятьдесят|шестьдесят|семьдесят|восемьдесят|девяносто|сто|тысяча|миллион|раз|однажды|дважды|трижды|первый|первая|первое|первые|второй|вторая|второе|вторые|третий|третья|третье|четвёртый|четвертый|пятый|шестой|седьмой|восьмой|девятый|десятый)(?![\p{L}])/iu;
const REPETITION_OR_DURATION = /(?<![\p{L}])(?:per|each|every)\s+(?:turn|round|day|week|month|year|rest|attack|scene)|(?<![\p{L}])(?:каждый|каждую|каждые|каждого|каждой|каждом|каждым|раз в)\s+(?:ход|раунд|день|неделю|месяц|год|отдых|сцену)|(?:for|until)\s+(?:a|the rest of the)\s+(?:turn|round|day|week)|(?:на|в течение)\s+(?:ход|раунд|день|неделю|месяц|час)/iu;

export function containsMechanicNumberToken(value: string): boolean {
  return NUMBER_TOKEN.test(value) || REPETITION_OR_DURATION.test(value);
}

function parseProposal(rawOutput: string): HomebrewMechanicProposal {
  const unfenced = rawOutput.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed: unknown = JSON.parse(unfenced);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Модель должна вернуть JSON-объект механики.');
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).some(key => !(FIELDS as readonly string[]).includes(key)) ||
      FIELDS.some(key => typeof record[key] !== 'string' || !(record[key] as string).trim() || (record[key] as string).length > MAX_TEXT || containsMechanicNumberToken(record[key] as string))) {
    throw new Error('Модель вернула лишние поля, пустой или слишком длинный текст либо неподтверждённые числа/частоты/длительности.');
  }
  return Object.fromEntries(FIELDS.map(key => [key, (record[key] as string).trim()])) as unknown as HomebrewMechanicProposal;
}

/** Local model proposes qualitative HB text only; numeric mechanics and execution are deliberately out of scope. */
export async function generateLocalMechanicDraft(input: MechanicDraftInput): Promise<LocalMechanicDraftResult> {
  const response = await fetch('/vtt/generation/mechanic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(input),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok || !result || typeof result !== 'object' || Array.isArray(result)) {
    const reason = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'Локальный генератор механик недоступен.';
    throw new Error(reason);
  }
  const payload = result as Record<string, unknown>;
  if (typeof payload.rawOutput !== 'string' || typeof payload.model !== 'string' || !payload.model.trim() ||
      typeof payload.generatedAt !== 'string' || !Number.isFinite(Date.parse(payload.generatedAt)) ||
      !payload.parameters || typeof payload.parameters !== 'object' || Array.isArray(payload.parameters)) {
    throw new Error('Локальный шлюз вернул неполные метаданные генерации механики.');
  }
  return {
    proposal: parseProposal(payload.rawOutput),
    model: payload.model,
    generatedAt: payload.generatedAt,
    parameters: payload.parameters as Readonly<Record<string, string | number | boolean>>,
    rawOutput: payload.rawOutput,
  };
}
