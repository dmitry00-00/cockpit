// Календарь Харптоса: «15 Mirtul 1492 DR, утро» — число секунд и обратно, фаза суток, сезон и Selûne (шаг 8).
// Без Shieldmeet и без погоды. Эпоха: sec = 0 — 1 Hammer 1492 DR 00:00. Год — 12 месяцев по 30 дней и пять
// вставных праздников, 365 дней; с TEMPO_SECONDS.year (365 суток) сходится, с TEMPO_SECONDS.season (90) —
// только приближённо.
import { SECONDS_PER_DAY } from '../engine/state';

export const EPOCH_YEAR = 1492;
export const DAYS_PER_MONTH = 30;
export const DAYS_PER_YEAR = 365;

export const MONTHS = [
  'Hammer', 'Alturiak', 'Ches', 'Tarsakh', 'Mirtul', 'Kythorn',
  'Flamerule', 'Eleasis', 'Eleint', 'Marpenoth', 'Uktar', 'Nightal',
] as const;
export type MonthName = (typeof MONTHS)[number];

export const FESTIVALS = ['Midwinter', 'Greengrass', 'Midsummer', 'Highharvestide', 'Feast of the Moon'] as const;
export type FestivalName = (typeof FESTIVALS)[number];

/** После какого месяца (индекс) стоит праздник. Shieldmeet (раз в четыре года после Midsummer) не ведём. */
const FESTIVAL_AFTER_MONTH: Readonly<Record<FestivalName, number>> = {
  'Midwinter': 0,
  'Greengrass': 3,
  'Midsummer': 6,
  'Highharvestide': 8,
  'Feast of the Moon': 10,
};

export interface HarptosDate {
  year: number;
  /** Месяц — или null в вставной праздник. */
  month: MonthName | null;
  /** Праздник — или null в обычный день. */
  festival: FestivalName | null;
  /** День месяца 1–30; у праздника — 1. */
  day: number;
  hour: number;
  minute: number;
}

/** Порядок дней в году: месяц, за ним его праздник, если есть. Строится один раз. */
interface YearSlot { month: MonthName | null; festival: FestivalName | null; days: number }
const YEAR_LAYOUT: readonly YearSlot[] = MONTHS.flatMap((month, i) => {
  const slots: YearSlot[] = [{ month, festival: null, days: DAYS_PER_MONTH }];
  const festival = FESTIVALS.find(f => FESTIVAL_AFTER_MONTH[f] === i);
  if (festival) slots.push({ month: null, festival, days: 1 });
  return slots;
});

const floorDiv = (a: number, b: number) => Math.floor(a / b);
const mod = (a: number, b: number) => ((a % b) + b) % b;

/** Секунды от эпохи → дата Харптоса. Отрицательные секунды — годы до эпохи, считаются той же сеткой. */
export function harptos(sec: number): HarptosDate {
  const dayIndex = floorDiv(sec, SECONDS_PER_DAY);
  const secOfDay = mod(sec, SECONDS_PER_DAY);
  const year = EPOCH_YEAR + floorDiv(dayIndex, DAYS_PER_YEAR);
  let dayOfYear = mod(dayIndex, DAYS_PER_YEAR);
  for (const slot of YEAR_LAYOUT) {
    if (dayOfYear < slot.days) {
      return { year, month: slot.month, festival: slot.festival, day: dayOfYear + 1, hour: Math.floor(secOfDay / 3600), minute: Math.floor((secOfDay % 3600) / 60) };
    }
    dayOfYear -= slot.days;
  }
  throw new Error(`день ${dayOfYear} вне года из ${DAYS_PER_YEAR} дней`);
}

export type HarptosInput =
  | { year: number; month: MonthName; day: number; hour?: number; minute?: number }
  | { year: number; festival: FestivalName; hour?: number; minute?: number };

/** Дата Харптоса → секунды от эпохи. Обратная к harptos(); день вне 1–30 — ошибка, а не перенос. */
export function secOf(input: HarptosInput): number {
  let dayOfYear = 0;
  let found = false;
  for (const slot of YEAR_LAYOUT) {
    if ('festival' in input ? slot.festival === input.festival : slot.month === input.month) {
      if ('month' in input) {
        if (!Number.isInteger(input.day) || input.day < 1 || input.day > DAYS_PER_MONTH) throw new Error(`день ${input.day} вне месяца ${input.month}`);
        dayOfYear += input.day - 1;
      }
      found = true;
      break;
    }
    dayOfYear += slot.days;
  }
  if (!found) throw new Error('нет такого месяца или праздника');
  const hour = input.hour ?? 0, minute = input.minute ?? 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new Error(`время ${hour}:${minute} вне суток`);
  return ((input.year - EPOCH_YEAR) * DAYS_PER_YEAR + dayOfYear) * SECONDS_PER_DAY + hour * 3600 + minute * 60;
}

const two = (n: number) => String(n).padStart(2, '0');

/** «15 Mirtul 1492 DR, 08:00»; в праздник — «Greengrass 1492 DR, 08:00». Имена — как в книгах, не переводятся. */
export function formatHarptos(sec: number): string {
  const d = harptos(sec);
  const date = d.festival ? `${d.festival} ${d.year} DR` : `${d.day} ${d.month} ${d.year} DR`;
  return `${date}, ${two(d.hour)}:${two(d.minute)}`;
}

/* ---------- Фаза суток, сезон, Selûne ---------- */

export type DayPhase = 'morning' | 'day' | 'evening' | 'night';

/** Утро 5–11, день 11–17, вечер 17–21, ночь 21–5 — как говорят за столом, а не по астрономии. */
export function dayPhase(sec: number): DayPhase {
  const hour = harptos(sec).hour;
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'day';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export const SEASON_LABELS: Readonly<Record<Season, string>> = { winter: 'зима', spring: 'весна', summer: 'лето', autumn: 'осень' };

/** Сезон по месяцу: Hammer–Ches зима, Tarsakh–Kythorn весна, Flamerule–Eleint лето, Marpenoth–Nightal осень; праздник — к сезону перед ним. */
export function seasonOf(sec: number): Season {
  const d = harptos(sec);
  const month = d.month ?? (d.festival === 'Midwinter' ? 'Hammer' : d.festival === 'Greengrass' ? 'Tarsakh' : d.festival === 'Midsummer' ? 'Flamerule' : d.festival === 'Highharvestide' ? 'Eleint' : 'Uktar');
  const i = MONTHS.indexOf(month);
  return i < 3 ? 'winter' : i < 6 ? 'spring' : i < 9 ? 'summer' : 'autumn';
}

export type MoonPhase = 'new' | 'waxing' | 'full' | 'waning';

/** Цикл Selûne — 30 дней; §13: 15 Mirtul 1492 растёт, полнолуние через 3 дня — значит, полная 18 Mirtul. */
export const MOON_CYCLE_DAYS = 30;
export const MOON_FULL_EPOCH_SEC = secOf({ year: 1492, month: 'Mirtul', day: 18 });

export interface MoonState {
  phase: MoonPhase;
  /** Дней до ближайшего полнолуния (0 — сегодня). */
  daysToFull: number;
  /** Дней до новолуния. */
  daysToNew: number;
}

/** Фаза по дню цикла: полная ±1 день, новая — середина цикла ±1, между ними растёт или убывает. */
export function moonState(sec: number): MoonState {
  const day = Math.floor((sec - MOON_FULL_EPOCH_SEC) / SECONDS_PER_DAY);
  const inCycle = ((day % MOON_CYCLE_DAYS) + MOON_CYCLE_DAYS) % MOON_CYCLE_DAYS;
  const half = MOON_CYCLE_DAYS / 2;
  const phase: MoonPhase = inCycle <= 1 || inCycle >= MOON_CYCLE_DAYS - 1 ? 'full'
    : Math.abs(inCycle - half) <= 1 ? 'new'
      : inCycle < half ? 'waning' : 'waxing';
  const daysToFull = inCycle === 0 ? 0 : MOON_CYCLE_DAYS - inCycle;
  const daysToNew = inCycle <= half ? half - inCycle : MOON_CYCLE_DAYS + half - inCycle;
  return { phase, daysToFull, daysToNew };
}

/** Полнолуния в (fromSec, toSec] — секунды начала дня каждого; шаг времени спрашивает, было ли оно за шаг. */
export function fullMoonsBetween(fromSec: number, toSec: number): number[] {
  const period = MOON_CYCLE_DAYS * SECONDS_PER_DAY;
  const first = MOON_FULL_EPOCH_SEC + Math.ceil((fromSec + 1 - MOON_FULL_EPOCH_SEC) / period) * period;
  const out: number[] = [];
  for (let t = first; t <= toSec; t += period) out.push(t);
  return out;
}

/** «через 3 дня», «сегодня», «завтра». */
export function inDays(n: number): string {
  if (n <= 0) return 'сегодня';
  if (n === 1) return 'завтра';
  const forms: [string, string, string] = ['день', 'дня', 'дней'];
  const m10 = n % 10, m100 = n % 100;
  const f = m10 === 1 && m100 !== 11 ? forms[0] : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? forms[1] : forms[2];
  return `через ${n} ${f}`;
}

/* ---------- Ближайший праздник: пустые входящие показывают «Мир спокоен» и его (CLAUDE.md, «Правила экрана») ---------- */

export interface NextFestival { festival: FestivalName; sec: number; days: number }

/**
 * Ближайший вставной праздник от `sec` — сегодняшний считается сегодняшним (days = 0), а не следующим через год.
 * Праздник — единственное событие календаря, которого нет в полосе часов: луна там уже есть, и дважды факт не печатается.
 */
export function nextFestival(sec: number): NextFestival {
  const today = floorDiv(sec, SECONDS_PER_DAY) * SECONDS_PER_DAY;
  const { year } = harptos(sec);
  const candidates = [year, year + 1].flatMap(y => FESTIVALS.map(festival => ({ festival, sec: secOf({ year: y, festival }) })));
  const next = candidates.filter(c => c.sec >= today).sort((a, b) => a.sec - b.sec)[0];
  return { ...next, days: floorDiv(next.sec - today, SECONDS_PER_DAY) };
}
