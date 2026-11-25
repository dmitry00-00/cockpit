// Календарный движок над профилью сеттинга (content/calendars/*.json). Публичные функции Harptos ниже —
// совместимый API Forgotten Realms; CalendarAdapter и createCalendarAdapter работают с профилем пакета напрямую.
// Временная шкала и event log остаются целыми секундами; форматированная дата не сохраняется в состоянии.
import { SECONDS_PER_DAY } from '../engine/state';
import type { State } from '../engine/state';
import harptosSource from '../../content/calendars/harptos.json';
import { DEFAULT_SETTING_PACKAGE, PACKAGE_REGISTRY, settingDataFor } from '../packages/registry';
import { parseCalendarProfile, parseMonthsCalendarProfile, type CalendarProfile, type MonthsCalendarProfile, type CounterCalendarProfile, type GregorianCalendarProfile } from '../packages/settingData';

const HARPTOS_PROFILE = parseMonthsCalendarProfile(harptosSource, 'harptos');

/** Calendar id declared by the default setting package. Kept as metadata; callers should use an adapter. */
const defaultSetting = PACKAGE_REGISTRY.find(p => p.id === DEFAULT_SETTING_PACKAGE && p.kind === 'setting');
export const CALENDAR_ID = defaultSetting?.time?.calendar;

export const EPOCH_YEAR = HARPTOS_PROFILE.epoch.year;
export const DAYS_PER_MONTH = HARPTOS_PROFILE.months[0].days;
/** Обычный год; recurring intercalary days are added by daysInYear. */
export const DAYS_PER_YEAR = HARPTOS_PROFILE.months.reduce((sum, month) => sum + month.days, 0)
  + HARPTOS_PROFILE.intercalary.filter(day => !day.rule).reduce((sum, day) => sum + day.days, 0);

export const MONTHS = HARPTOS_PROFILE.months.map(month => month.name) as readonly string[];
export type MonthName = (typeof MONTHS)[number];

/** Annual intercalary days and recurring leap-day holidays are both declared in the package calendar. */
export const FESTIVALS = HARPTOS_PROFILE.intercalary.filter(day => !day.rule).map(day => day.name) as readonly string[];
const LEAP_INTERCALARY = HARPTOS_PROFILE.intercalary.find(day => !!day.rule);
export const SHIELDMEET = LEAP_INTERCALARY?.name ?? '';
export type FestivalName = (typeof FESTIVALS)[number] | typeof SHIELDMEET;

const occurs = (year: number, rule?: { every: number; offset: number }): boolean => !rule || ((year - rule.offset) % rule.every + rule.every) % rule.every === 0;
export const isShieldmeetYear = (year: number): boolean => LEAP_INTERCALARY ? occurs(year, LEAP_INTERCALARY.rule) : false;
export const daysInYear = (year: number): number => DAYS_PER_YEAR + HARPTOS_PROFILE.intercalary.filter(day => day.rule && occurs(year, day.rule)).reduce((sum, day) => sum + day.days, 0);

/** После какого месяца (индекс) стоит ежегодный праздник; Shieldmeet — сразу за Midsummer в свой год. */
const monthIndexById = new Map(HARPTOS_PROFILE.months.map((month, index) => [month.id, index]));
const monthByName = new Map(HARPTOS_PROFILE.months.map(month => [month.name, month]));
const festivalByName = new Map(HARPTOS_PROFILE.intercalary.map(day => [day.name, day]));
const FESTIVAL_AFTER_MONTH: Readonly<Record<string, number>> = Object.fromEntries(HARPTOS_PROFILE.intercalary.map(day => [day.name, monthIndexById.get(day.after)!]));

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

/** Порядок дней в году: месяц, за ним его праздник, если есть; в год Shieldmeet — он за Midsummer. Два варианта, строятся один раз. */
interface YearSlot { month: MonthName | null; festival: FestivalName | null; days: number; season: Season }
const layout = (year: number): readonly YearSlot[] => HARPTOS_PROFILE.months.flatMap(month => {
  const slots: YearSlot[] = [{ month: month.name, festival: null, days: month.days, season: month.season as Season }];
  for (const day of HARPTOS_PROFILE.intercalary.filter(candidate => candidate.after === month.id && occurs(year, candidate.rule))) {
    slots.push({ month: null, festival: day.name, days: day.days, season: day.season as Season });
  }
  return slots;
});
const COMMON_YEAR = layout(EPOCH_YEAR + 1);
const SHIELDMEET_YEAR = layout(EPOCH_YEAR);
const yearLayout = (year: number) => (isShieldmeetYear(year) ? SHIELDMEET_YEAR : COMMON_YEAR);

const floorDiv = (a: number, b: number) => Math.floor(a / b);
const mod = (a: number, b: number) => ((a % b) + b) % b;
const occurrencesBetween = (a: number, b: number, rule: { every: number; offset: number }) =>
  floorDiv(b - 1 - rule.offset, rule.every) - floorDiv(a - 1 - rule.offset, rule.every);
const recurringDaysBetween = (a: number, b: number) => HARPTOS_PROFILE.intercalary
  .filter(day => day.rule)
  .reduce((sum, day) => sum + occurrencesBetween(a, b, day.rule!) * day.days, 0);

/** Первый день года — дней от эпохи из файла календаря; годы до эпохи дают отрицательное смещение. */
export const yearStartDay = (year: number): number => (year - EPOCH_YEAR) * DAYS_PER_YEAR + recurringDaysBetween(EPOCH_YEAR, year);
/** Начало года, секунды от эпохи. */
export const yearStartSec = (year: number): number => yearStartDay(year) * SECONDS_PER_DAY;
/** Тот же день и час в другом году — для линзы года: у праздника и дня месяца одно место в году, Shieldmeet → Midsummer. */
export function sameDayIn(sec: number, year: number): number {
  const d = harptos(sec);
  const input: HarptosInput = d.festival === SHIELDMEET && !isShieldmeetYear(year) ? { year, festival: 'Midsummer', hour: d.hour, minute: d.minute }
    : d.festival ? { year, festival: d.festival, hour: d.hour, minute: d.minute } : { year, month: d.month!, day: d.day, hour: d.hour, minute: d.minute };
  return secOf(input) + (mod(sec, 60));
}

/** Секунды от эпохи → дата Харптоса. Отрицательные секунды — годы до эпохи, считаются той же сеткой. */
export function harptos(sec: number): HarptosDate {
  const dayIndex = floorDiv(sec, SECONDS_PER_DAY);
  const secOfDay = mod(sec, SECONDS_PER_DAY);
  let year = EPOCH_YEAR + floorDiv(dayIndex, DAYS_PER_YEAR);
  while (yearStartDay(year) > dayIndex) year--;
  while (yearStartDay(year + 1) <= dayIndex) year++;
  let dayOfYear = dayIndex - yearStartDay(year);
  for (const slot of yearLayout(year)) {
    if (dayOfYear < slot.days) {
      return { year, month: slot.month, festival: slot.festival, day: dayOfYear + 1, hour: Math.floor(secOfDay / 3600), minute: Math.floor((secOfDay % 3600) / 60) };
    }
    dayOfYear -= slot.days;
  }
  throw new Error(`день ${dayOfYear} вне года ${year}`);
}

export type HarptosInput =
  | { year: number; month: MonthName; day: number; hour?: number; minute?: number }
  | { year: number; festival: FestivalName; hour?: number; minute?: number };

/** Дата Харптоса → секунды от эпохи. Обратная к harptos(); день вне 1–30 — ошибка, а не перенос. */
export function secOf(input: HarptosInput): number {
  if ('festival' in input && input.festival === SHIELDMEET && !isShieldmeetYear(input.year)) throw new Error(`в ${input.year} ${HARPTOS_PROFILE.yearSuffix ?? ''} нет ${SHIELDMEET}: он появляется по правилу календаря`);
  let dayOfYear = 0;
  let found = false;
  for (const slot of yearLayout(input.year)) {
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
  return (yearStartDay(input.year) + dayOfYear) * SECONDS_PER_DAY + hour * 3600 + minute * 60;
}

const two = (n: number) => String(n).padStart(2, '0');

/** Дата без времени; имена — как в книгах, не переводятся. */
export function formatHarptosDateOnly(sec: number, includeYear = true): string {
  const d = harptos(sec);
  const date = d.festival ? d.festival : `${d.day} ${d.month}`;
  const year = [d.year, HARPTOS_PROFILE.yearSuffix].filter(Boolean).join(' ');
  return includeYear ? `${date} ${year}` : date;
}

/** «15 Mirtul 1492 DR, 08:00»; в праздник — «Greengrass 1492 DR, 08:00». */
export function formatHarptos(sec: number): string {
  return `${formatHarptosDateOnly(sec)}, ${two(harptos(sec).hour)}:${two(harptos(sec).minute)}`;
}

/* ---------- Фаза суток, сезон, Selûne ---------- */

export type DayPhase = 'morning' | 'day' | 'evening' | 'night';

/** Утро 5–11, день 11–17, вечер 17–21, ночь 21–5 — как говорят за столом, а не по астрономии. */
export function dayPhase(sec: number): DayPhase {
  const hour = harptos(sec).hour;
  const phases = HARPTOS_PROFILE.dayPhases;
  return ([...phases].reverse().find(phase => hour >= phase.fromHour)?.id ?? phases.at(-1)!.id) as DayPhase;
}

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export const SEASON_LABELS: Readonly<Record<Season, string>> = Object.freeze(Object.fromEntries(HARPTOS_PROFILE.seasons.map(season => [season.id, season.labelRu])) as Record<Season, string>);

/** Сезон по месяцу: Hammer–Ches зима, Tarsakh–Kythorn весна, Flamerule–Eleint лето, Marpenoth–Nightal осень; праздник — к сезону перед ним. */
export function seasonOf(sec: number): Season {
  const d = harptos(sec);
  if (d.festival) return festivalByName.get(d.festival)?.season as Season ?? HARPTOS_PROFILE.seasons[0].id as Season;
  return monthByName.get(d.month!)?.season as Season ?? HARPTOS_PROFILE.seasons[0].id as Season;
}

export type MoonPhase = 'new' | 'waxing' | 'full' | 'waning';

/** Цикл Selûne — 30 дней; §13: 15 Mirtul 1492 растёт, полнолуние через 3 дня — значит, полная 18 Mirtul. */
const PRIMARY_MOON = HARPTOS_PROFILE.moons?.[0];
export const MOON_CYCLE_DAYS = PRIMARY_MOON?.cycleDays ?? 0;
export const MOON_FULL_EPOCH_SEC = PRIMARY_MOON
  ? secOf({ year: PRIMARY_MOON.fullAt.year, month: monthByName.get(HARPTOS_PROFILE.months.find(month => month.id === PRIMARY_MOON.fullAt.month)!.name)!.name, day: PRIMARY_MOON.fullAt.day })
  : 0;

export interface MoonState {
  phase: MoonPhase;
  /** Дней до ближайшего полнолуния (0 — сегодня). */
  daysToFull: number;
  /** Дней до новолуния. */
  daysToNew: number;
}

/** Фаза по дню цикла: полная ±1 день, новая — середина цикла ±1, между ними растёт или убывает. */
export function moonState(sec: number): MoonState {
  if (!PRIMARY_MOON) throw new Error(`у календаря ${HARPTOS_PROFILE.id} не объявлена луна`);
  const day = Math.floor((sec - MOON_FULL_EPOCH_SEC) / SECONDS_PER_DAY);
  const inCycle = ((day % MOON_CYCLE_DAYS) + MOON_CYCLE_DAYS) % MOON_CYCLE_DAYS;
  const newAt = Math.floor(MOON_CYCLE_DAYS / 2);
  const fullWindow = PRIMARY_MOON.fullWindowDays ?? 1;
  const newWindow = PRIMARY_MOON.newWindowDays ?? 1;
  const distanceFromFull = Math.min(inCycle, MOON_CYCLE_DAYS - inCycle);
  const distanceFromNew = Math.min(Math.abs(inCycle - newAt), MOON_CYCLE_DAYS - Math.abs(inCycle - newAt));
  const phase: MoonPhase = distanceFromFull <= fullWindow ? 'full'
    : distanceFromNew <= newWindow ? 'new'
      : inCycle < newAt ? 'waning' : 'waxing';
  const daysToFull = inCycle === 0 ? 0 : MOON_CYCLE_DAYS - inCycle;
  const daysToNew = mod(newAt - inCycle, MOON_CYCLE_DAYS);
  return { phase, daysToFull, daysToNew };
}

/** Полнолуния в (fromSec, toSec] — секунды начала дня каждого; шаг времени спрашивает, было ли оно за шаг. */
export function fullMoonsBetween(fromSec: number, toSec: number): number[] {
  if (!PRIMARY_MOON) return [];
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
  const candidates = [year, year + 1].flatMap(y => HARPTOS_PROFILE.intercalary.filter(day => occurs(y, day.rule)).map(day => day.name as FestivalName)
    .map((festival: FestivalName) => ({ festival, sec: secOf({ year: y, festival }) })));
  const next = candidates.filter(c => c.sec >= today).sort((a, b) => a.sec - b.sec)[0];
  return { ...next, days: floorDiv(next.sec - today, SECONDS_PER_DAY) };
}

/* ---------- Календарь на экране: слоты года и дни месяца (часы Харптоса, 28.10.2026) ---------- */

/** В месяце три десятидневки по десять дней. */
export const TENDAY = 10;

export interface YearSlotView {
  month: MonthName | null;
  festival: FestivalName | null;
  /** Начало первого дня слота, секунды от эпохи. */
  startSec: number;
  days: number;
  season: Season;
}

/** Год по порядку: двенадцать месяцев и пять праздников между ними — для сетки года. */
export function yearSlots(year: number): YearSlotView[] {
  let sec = yearStartSec(year);
  return yearLayout(year).map(slot => {
    const view = { month: slot.month, festival: slot.festival, startSec: sec, days: slot.days, season: seasonOf(sec) };
    sec += slot.days * SECONDS_PER_DAY;
    return view;
  });
}

/** Месяц перед праздником: в праздник календарь показывает его. Shieldmeet — за Midsummer, месяц тот же. */
export function monthBefore(festival: FestivalName): MonthName {
  return MONTHS[FESTIVAL_AFTER_MONTH[festival === SHIELDMEET ? 'Midsummer' : festival]];
}

/** Ежегодный праздник сразу после месяца — или null (Shieldmeet — festivalsAfter). */
export function festivalAfter(month: MonthName): FestivalName | null {
  return FESTIVALS.find(f => FESTIVAL_AFTER_MONTH[f] === MONTHS.indexOf(month)) ?? null;
}

/** Все праздники после месяца в этот год: за Flamerule в год Shieldmeet — Midsummer и Shieldmeet. */
export function festivalsAfter(month: MonthName, year: number): FestivalName[] {
  const f = festivalAfter(month);
  return f ? [f, ...(f === 'Midsummer' && isShieldmeetYear(year) ? [SHIELDMEET] as const : [])] : [];
}

export interface MonthDay {
  day: number;
  /** Начало дня, секунды от эпохи. */
  sec: number;
  /** Десятидневка 1–3. */
  tenday: number;
  /** Selûne в полдень этого дня. */
  moon: MoonPhase;
}

/** Тридцать дней месяца с десятидневкой и фазой Selûne. */
export function monthDays(year: number, month: MonthName): MonthDay[] {
  const start = secOf({ year, month, day: 1 });
  return Array.from({ length: DAYS_PER_MONTH }, (_, i) => {
    const sec = start + i * SECONDS_PER_DAY;
    return { day: i + 1, sec, tenday: Math.floor(i / TENDAY) + 1, moon: moonState(sec + SECONDS_PER_DAY / 2).phase };
  });
}

/**
 * Calendar boundary exposed to setting-agnostic consumers. The current adapter deliberately retains the Harptos
 * date/input types so existing FR code keeps its behavior; a future calendar can implement this contract without
 * changing package selection or adding an `if (setting === 'fr')` branch to the engine.
 */
export interface CalendarAdapter<Date = unknown, Input = unknown> {
  readonly id: string;
  readonly kind: CalendarProfile['kind'];
  readonly yearSuffix?: string;
  dateAt(sec: number): Date;
  secondsAt(input: Input): number;
  /** Same calendar date after a whole number of years; absent for calendars without years. */
  addYears?(sec: number, years: number): number;
  /** Counter calendars have no year; consumers must branch before showing year/era controls. */
  yearAt(sec: number): number | null;
  /** Zero-based day position inside the adapter's year, used to order mixed chronologies without parsing date text. */
  dayOfYearAt(sec: number): number;
  formatDate(sec: number): string;
  formatDateOnly(sec: number): string;
  /** Дата без года и времени; для часов отдельно добавить formatTime. */
  formatCompactDate(sec: number): string;
  formatTime(sec: number): string;
  seasonAt?(sec: number): string;
  seasonLabelAt?(sec: number): string;
  dayPhaseAt?(sec: number): string;
  weekDayAt?(sec: number): number;
  moonAt?(sec: number): MoonState;
}

export interface ProfileCalendarDate {
  year: number;
  month: string | null;
  intercalary: string | null;
  day: number;
  hour: number;
  minute: number;
}

export type ProfileCalendarInput =
  | { year: number; month: string; day: number; hour?: number; minute?: number }
  | { year: number; intercalary: string; day?: number; hour?: number; minute?: number };

function shiftedCalendarYear(year: number, delta: number, yearZero = true): number {
  const astronomicalYear = yearZero || year >= 0 ? year : year + 1;
  const shifted = astronomicalYear + delta;
  return yearZero || shifted > 0 ? shifted : shifted - 1;
}

/** Build all calendar behavior from the setting's declared JSON profile. */
function createMonthsCalendarAdapter(profile: MonthsCalendarProfile): CalendarAdapter<ProfileCalendarDate, ProfileCalendarInput> {
  const daySeconds = SECONDS_PER_DAY;
  const ordinaryYearDays = profile.months.reduce((sum, month) => sum + month.days, 0)
    + profile.intercalary.filter(day => !day.rule).reduce((sum, day) => sum + day.days, 0);
  const monthByKey = new Map(profile.months.flatMap(month => [[month.id, month], [month.name, month]]));
  const intercalaryByKey = new Map(profile.intercalary.flatMap(day => [[day.id, day], [day.name, day]]));
  const ruleOccurs = (year: number, rule?: { every: number; offset: number }) => !rule || ((year - rule.offset) % rule.every + rule.every) % rule.every === 0;
  const floorDiv = (a: number, b: number) => Math.floor(a / b);
  const mod = (a: number, b: number) => ((a % b) + b) % b;
  const occurrencesBetween = (a: number, b: number, rule: { every: number; offset: number }) =>
    floorDiv(b - 1 - rule.offset, rule.every) - floorDiv(a - 1 - rule.offset, rule.every);
  const yearIndex = (year: number) => profile.yearZero === false && year < 0 ? year + 1 : year;
  const recurringOccurrencesBetween = (a: number, b: number, rule: { every: number; offset: number }) => {
    const count = occurrencesBetween(a, b, rule);
    const crossesMissingZero = (a <= 0 && b > 0) || (b <= 0 && a > 0);
    return count - (profile.yearZero === false && crossesMissingZero && ruleOccurs(0, rule) ? Math.sign(b - a) : 0);
  };
  const slotsForYear = (year: number) => {
    const slots: Array<{ month: string | null; intercalary: string | null; days: number; season: string }> = [];
    const emitted = new Set<string>();
    const appendAfter = (anchor: string, kind: 'month' | 'intercalary') => {
      for (const item of profile.intercalary) {
        const matches = kind === 'month' ? item.after === anchor && !item.afterIntercalary : item.afterIntercalary === anchor;
        if (!matches || !ruleOccurs(year, item.rule) || emitted.has(item.id)) continue;
        emitted.add(item.id);
        slots.push({ month: null, intercalary: item.id, days: item.days, season: item.season });
        appendAfter(item.id, 'intercalary');
      }
    };
    for (const month of profile.months) {
      slots.push({ month: month.id, intercalary: null, days: month.days, season: month.season });
      appendAfter(month.id, 'month');
    }
    return slots;
  };
  const recurringDaysBetween = (a: number, b: number) => profile.intercalary
    .filter(day => day.rule)
    .reduce((sum, day) => sum + recurringOccurrencesBetween(a, b, day.rule!) * day.days, 0);
  const yearStartDay = (year: number) => (yearIndex(year) - yearIndex(profile.epoch.year)) * ordinaryYearDays + recurringDaysBetween(profile.epoch.year, year);
  const epochYearSlots = slotsForYear(profile.epoch.year);
  let epochDayInYear = 0;
  for (const slot of epochYearSlots) {
    if (slot.month === profile.epoch.month) {
      epochDayInYear += profile.epoch.day - 1;
      break;
    }
    epochDayInYear += slot.days;
  }
  const epochOffsetSec = epochDayInYear * daySeconds + (profile.epoch.hour ?? 0) * 3600 + (profile.epoch.minute ?? 0) * 60;
  const yearStartSec = (year: number) => yearStartDay(year) * daySeconds - epochOffsetSec;
  const dateAt = (sec: number): ProfileCalendarDate => {
    const dayIndex = floorDiv(sec + epochOffsetSec, daySeconds);
    const secOfDay = mod(sec + epochOffsetSec, daySeconds);
    let year = shiftedCalendarYear(profile.epoch.year, floorDiv(dayIndex, ordinaryYearDays), profile.yearZero !== false);
    while (yearStartDay(year) > dayIndex) year = shiftedCalendarYear(year, -1, profile.yearZero !== false);
    while (yearStartDay(shiftedCalendarYear(year, 1, profile.yearZero !== false)) <= dayIndex) year = shiftedCalendarYear(year, 1, profile.yearZero !== false);
    let dayOfYear = dayIndex - yearStartDay(year);
    for (const slot of slotsForYear(year)) {
      if (dayOfYear < slot.days) return {
        year, month: slot.month, intercalary: slot.intercalary, day: dayOfYear + 1,
        hour: Math.floor(secOfDay / 3600), minute: Math.floor((secOfDay % 3600) / 60),
      };
      dayOfYear -= slot.days;
    }
    throw new Error(`день вне года ${year}`);
  };
  const secondsAt = (input: ProfileCalendarInput) => {
    if (profile.yearZero === false && input.year === 0) throw new Error('в календаре без нулевого года года 0 нет');
    let dayOfYear = 0;
    let found = false;
    const slots = slotsForYear(input.year);
    for (const slot of slots) {
      const match = 'month' in input
        ? slot.month !== null && (slot.month === input.month || monthByKey.get(input.month)?.id === slot.month)
        : slot.intercalary !== null && (slot.intercalary === input.intercalary || intercalaryByKey.get(input.intercalary)?.id === slot.intercalary);
      if (match) {
        if ('month' in input) {
          const month = monthByKey.get(input.month);
          if (!month) throw new Error(`неизвестный месяц ${input.month}`);
          if (!Number.isInteger(input.day) || input.day < 1 || input.day > month.days) throw new Error(`день ${input.day} вне месяца ${month.name}`);
          dayOfYear += input.day - 1;
        } else {
          const intercalary = intercalaryByKey.get(input.intercalary);
          if (!intercalary) throw new Error(`неизвестный вставной день ${input.intercalary}`);
          const day = input.day ?? 1;
          if (!Number.isInteger(day) || day < 1 || day > intercalary.days) throw new Error(`день ${day} вне вставного периода ${intercalary.name}`);
          dayOfYear += day - 1;
        }
        found = true;
        break;
      }
      dayOfYear += slot.days;
    }
    if (!found) throw new Error('нет такого месяца или вставного дня в этом году');
    const hour = input.hour ?? 0, minute = input.minute ?? 0;
    if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error(`время ${hour}:${minute} вне суток`);
    return yearStartSec(input.year) + (dayOfYear * daySeconds) + hour * 3600 + minute * 60;
  };
  const addYears = (sec: number, years: number) => {
    if (!Number.isSafeInteger(years)) throw new Error('Число лет должно быть целым безопасным числом');
    const date = dateAt(sec);
    const targetYear = shiftedCalendarYear(date.year, years, profile.yearZero !== false);
    if (!Number.isSafeInteger(targetYear)) throw new Error('Целевой год вне безопасного диапазона');
    const time = { hour: date.hour, minute: date.minute };
    if (date.month) return secondsAt({ year: targetYear, month: date.month, day: date.day, ...time }) + mod(sec, 60);

    const sourceSlot = intercalaryByKey.get(date.intercalary!);
    if (!sourceSlot) throw new Error(`неизвестный вставной период ${date.intercalary}`);
    const stepIntercalary = (id: string): number => {
      const slot = intercalaryByKey.get(id);
      if (!slot) throw new Error(`неизвестный вставной период ${id}`);
      if (ruleOccurs(targetYear, slot.rule)) {
        return secondsAt({ year: targetYear, intercalary: id, day: Math.min(date.day, slot.days), ...time }) + mod(sec, 60);
      }
      if (slot.afterIntercalary) return stepIntercalary(slot.afterIntercalary);
      if (slot.after) {
        const siblings = profile.intercalary.filter(candidate => candidate.after === slot.after && !candidate.afterIntercalary);
        const sourceIndex = siblings.findIndex(candidate => candidate.id === slot.id);
        for (let i = sourceIndex - 1; i >= 0; i--) {
          if (ruleOccurs(targetYear, siblings[i].rule)) return stepIntercalary(siblings[i].id);
        }
        const month = monthByKey.get(slot.after);
        if (!month) throw new Error(`неизвестный месяц ${slot.after}`);
        return secondsAt({ year: targetYear, month: month.id, day: month.days, ...time }) + mod(sec, 60);
      }
      throw new Error(`вставной период ${slot.name} отсутствует в году ${targetYear} и не имеет предыдущей даты`);
    };
    return stepIntercalary(sourceSlot.id);
  };
  const dayOfYearAt = (sec: number) => floorDiv(sec - yearStartSec(dateAt(sec).year), daySeconds);
  const formatDateOnly = (sec: number, includeYear = true) => {
    const date = dateAt(sec);
    const monthName = date.month ? monthByKey.get(date.month)!.name : null;
    const intercalaryName = date.intercalary ? intercalaryByKey.get(date.intercalary)!.name : null;
    const label = intercalaryName ?? `${date.day} ${monthName}`;
    return includeYear ? [label, String(date.year), profile.yearSuffix].filter(part => part !== undefined && part !== '').join(' ') : label;
  };
  const two = (n: number) => String(n).padStart(2, '0');
  const formatTime = (sec: number) => { const d = dateAt(sec); return `${two(d.hour)}:${two(d.minute)}`; };
  const seasonAt = (sec: number) => {
    const d = dateAt(sec);
    const slot = slotsForYear(d.year).find(x => x.month === d.month && x.intercalary === d.intercalary);
    return slot?.season ?? profile.seasons[0].id;
  };
  const dayPhaseAt = (sec: number) => {
    const hour = dateAt(sec).hour;
    return [...profile.dayPhases].reverse().find(phase => hour >= phase.fromHour)?.id ?? profile.dayPhases.at(-1)!.id;
  };
  const moon = profile.moons?.[0];
  const moonEpochSec = moon ? secondsAt({ year: moon.fullAt.year, month: moon.fullAt.month, day: moon.fullAt.day }) : 0;
  const moonAt = moon ? (sec: number): MoonState => {
    const day = floorDiv(sec - moonEpochSec, daySeconds);
    const inCycle = mod(day, moon.cycleDays);
    const newAt = Math.floor(moon.cycleDays / 2);
    const fullWindow = moon.fullWindowDays ?? 1, newWindow = moon.newWindowDays ?? 1;
    const distanceFromFull = Math.min(inCycle, moon.cycleDays - inCycle);
    const rawNewDistance = Math.abs(inCycle - newAt);
    const distanceFromNew = Math.min(rawNewDistance, moon.cycleDays - rawNewDistance);
    const phase: MoonPhase = distanceFromFull <= fullWindow ? 'full'
      : distanceFromNew <= newWindow ? 'new'
        : inCycle < newAt ? 'waning' : 'waxing';
    return { phase, daysToFull: inCycle === 0 ? 0 : moon.cycleDays - inCycle, daysToNew: mod(newAt - inCycle, moon.cycleDays) };
  } : undefined;
  const formatDate = (sec: number) => `${formatDateOnly(sec)}, ${formatTime(sec)}`;
  const adapter: CalendarAdapter<ProfileCalendarDate, ProfileCalendarInput> = {
    id: profile.id, kind: profile.kind, yearSuffix: profile.yearSuffix, dateAt, secondsAt, addYears, yearAt: sec => dateAt(sec).year, dayOfYearAt,
    formatDate, formatDateOnly: sec => formatDateOnly(sec), formatCompactDate: sec => formatDateOnly(sec, false), formatTime,
    seasonAt, seasonLabelAt: sec => profile.seasons.find(season => season.id === seasonAt(sec))?.labelRu ?? seasonAt(sec),
    dayPhaseAt, weekDayAt: sec => mod(dayOfYearAt(sec), profile.week.days), moonAt,
  };
  return Object.freeze(adapter);
}

export interface CounterCalendarDate { day: number; hour: number; minute: number }
export interface CounterCalendarInput { day: number; hour?: number; minute?: number }

const calendarTwo = (n: number) => String(n).padStart(2, '0');

function createCounterCalendarAdapter(profile: CounterCalendarProfile): CalendarAdapter<CounterCalendarDate, CounterCalendarInput> {
  const epochOffset = (profile.epoch.hour ?? 0) * 3600 + (profile.epoch.minute ?? 0) * 60;
  const dateAt = (sec: number): CounterCalendarDate => {
    const offset = sec + epochOffset;
    return {
      day: profile.epoch.day + Math.floor(offset / SECONDS_PER_DAY),
      hour: Math.floor(((offset % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY / 3600),
      minute: Math.floor((((offset % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY % 3600) / 60),
    };
  };
  const secondsAt = (input: CounterCalendarInput) => {
    if (!Number.isSafeInteger(input.day)) throw new Error('день счётчика должен быть целым безопасным числом');
    const hour = input.hour ?? 0, minute = input.minute ?? 0;
    if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error(`время ${hour}:${minute} вне суток`);
    return (input.day - profile.epoch.day) * SECONDS_PER_DAY - epochOffset + hour * 3600 + minute * 60;
  };
  const formatDateOnly = (sec: number) => `${profile.dayLabel} ${dateAt(sec).day}`;
  const formatTime = (sec: number) => { const d = dateAt(sec); return `${calendarTwo(d.hour)}:${calendarTwo(d.minute)}`; };
  const dayPhaseAt = profile.dayPhases ? (sec: number) => {
    const hour = dateAt(sec).hour;
    return [...profile.dayPhases!].reverse().find(phase => hour >= phase.fromHour)?.id ?? profile.dayPhases!.at(-1)!.id;
  } : undefined;
  const adapter: CalendarAdapter<CounterCalendarDate, CounterCalendarInput> = {
    id: profile.id, kind: profile.kind, dateAt, secondsAt,
    yearAt: () => null,
    dayOfYearAt: sec => dateAt(sec).day - profile.epoch.day,
    formatDate: sec => `${formatDateOnly(sec)}, ${formatTime(sec)}`,
    formatDateOnly, formatCompactDate: formatDateOnly, formatTime,
    ...(profile.week ? { weekDayAt: sec => ((dateAt(sec).day - profile.epoch.day) % profile.week!.days + profile.week!.days) % profile.week!.days } : {}),
    ...(dayPhaseAt ? { dayPhaseAt } : {}),
  };
  return Object.freeze(adapter);
}

interface CivilDate { year: number; month: number; day: number }
function daysFromCivil(year: number, month: number, day: number): number {
  let y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
function civilFromDays(days: number): CivilDate {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  let year = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  year += month <= 2 ? 1 : 0;
  return { year, month, day };
}

function createGregorianCalendarAdapter(profile: GregorianCalendarProfile): CalendarAdapter<ProfileCalendarDate, ProfileCalendarInput> {
  const toAstronomical = (year: number) => profile.yearZero === false && year < 0 ? year + 1 : year;
  const fromAstronomical = (year: number) => profile.yearZero === false && year <= 0 ? year - 1 : year;
  const monthByKey = new Map(profile.months.flatMap((month, index) => [[month.id, { ...month, number: index + 1 }], [month.name, { ...month, number: index + 1 }]]));
  const daysInMonth = (year: number, month: number) => month === 2
    ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28)
    : ([4, 6, 9, 11].includes(month) ? 30 : 31);
  const epochDay = daysFromCivil(toAstronomical(profile.epoch.year), monthByKey.get(profile.epoch.month)!.number, profile.epoch.day);
  const epochOffset = (profile.epoch.hour ?? 0) * 3600 + (profile.epoch.minute ?? 0) * 60;
  const dateAt = (sec: number): ProfileCalendarDate => {
    const elapsed = sec + epochOffset;
    const date = civilFromDays(epochDay + Math.floor(elapsed / SECONDS_PER_DAY));
    const secOfDay = ((elapsed % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
    return {
      year: fromAstronomical(date.year), month: profile.months[date.month - 1].id, intercalary: null, day: date.day,
      hour: Math.floor(secOfDay / 3600), minute: Math.floor((secOfDay % 3600) / 60),
    };
  };
  const secondsAt = (input: ProfileCalendarInput) => {
    if (!('month' in input)) throw new Error('григорианская дата требует месяц');
    if (profile.yearZero === false && input.year === 0) throw new Error('в календаре без нулевого года года 0 нет');
    const month = monthByKey.get(input.month);
    if (!month) throw new Error(`неизвестный месяц ${input.month}`);
    const astronomicalYear = toAstronomical(input.year);
    const maxDay = daysInMonth(astronomicalYear, month.number);
    if (!Number.isInteger(input.day) || input.day < 1 || input.day > maxDay) throw new Error(`день ${input.day} вне месяца ${month.name}`);
    const hour = input.hour ?? 0, minute = input.minute ?? 0;
    if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error(`время ${hour}:${minute} вне суток`);
    return (daysFromCivil(astronomicalYear, month.number, input.day) - epochDay) * SECONDS_PER_DAY - epochOffset + hour * 3600 + minute * 60;
  };
  const dayOfYearAt = (sec: number) => {
    const date = dateAt(sec);
    return daysFromCivil(toAstronomical(date.year), monthByKey.get(date.month!)!.number, date.day)
      - daysFromCivil(toAstronomical(date.year), 1, 1);
  };
  const formatDateOnly = (sec: number, includeYear = true) => {
    const date = dateAt(sec);
    const month = monthByKey.get(date.month!)!;
    const dateLabel = `${date.day} ${month.name}`;
    return includeYear ? [dateLabel, String(date.year), profile.yearSuffix].filter(part => part !== undefined && part !== '').join(' ') : dateLabel;
  };
  const formatTime = (sec: number) => { const date = dateAt(sec); return `${calendarTwo(date.hour)}:${calendarTwo(date.minute)}`; };
  const dayPhaseAt = profile.dayPhases ? (sec: number) => {
    const hour = dateAt(sec).hour;
    return [...profile.dayPhases!].reverse().find(phase => hour >= phase.fromHour)?.id ?? profile.dayPhases!.at(-1)!.id;
  } : undefined;
  const adapter: CalendarAdapter<ProfileCalendarDate, ProfileCalendarInput> = {
    id: profile.id, kind: profile.kind, yearSuffix: profile.yearSuffix, dateAt, secondsAt,
    addYears: (sec, years) => {
      if (!Number.isSafeInteger(years)) throw new Error('Число лет должно быть целым безопасным числом');
      const date = dateAt(sec);
      const targetYear = shiftedCalendarYear(date.year, years, profile.yearZero !== false);
      if (!Number.isSafeInteger(targetYear)) throw new Error('Целевой год вне безопасного диапазона');
      const month = monthByKey.get(date.month!)!;
      const astronomicalYear = toAstronomical(targetYear);
      const maxDay = daysInMonth(astronomicalYear, month.number);
      return secondsAt({ year: targetYear, month: date.month!, day: Math.min(date.day, maxDay), hour: date.hour, minute: date.minute })
        + ((sec % 60) + 60) % 60;
    },
    yearAt: sec => dateAt(sec).year, dayOfYearAt,
    formatDate: sec => `${formatDateOnly(sec)}, ${formatTime(sec)}`,
    formatDateOnly: sec => formatDateOnly(sec), formatCompactDate: sec => formatDateOnly(sec, false), formatTime,
    ...(profile.week ? { weekDayAt: sec => ((Math.floor((sec + epochOffset) / SECONDS_PER_DAY) % profile.week!.days) + profile.week!.days) % profile.week!.days } : {}),
    ...(dayPhaseAt ? { dayPhaseAt } : {}),
  };
  return Object.freeze(adapter);
}

/** Build the calendar implementation selected by a validated package profile. */
export function createCalendarAdapter(profile: CalendarProfile): CalendarAdapter<unknown, unknown> {
  if (profile.kind === 'months') return createMonthsCalendarAdapter(profile) as CalendarAdapter<unknown, unknown>;
  if (profile.kind === 'counter') return createCounterCalendarAdapter(profile) as CalendarAdapter<unknown, unknown>;
  return createGregorianCalendarAdapter(profile) as CalendarAdapter<unknown, unknown>;
}

const CALENDAR_ADAPTER_CACHE = new Map<string, CalendarAdapter<unknown, unknown>>();

/** Resolve the calendar only from the selected setting package's manifest and declared data layer. */
export function calendarAdapterForSetting(settingPackageId: string): CalendarAdapter<unknown, unknown> {
  const setting = PACKAGE_REGISTRY.find(p => p.id === settingPackageId && p.kind === 'setting');
  if (!setting) throw new Error(`пакет сеттинга не найден: ${settingPackageId}`);
  const calendarId = setting.time?.calendar;
  if (!calendarId) throw new Error(`у пакета ${settingPackageId} не объявлен календарь в time.calendar`);
  const key = `${settingPackageId}:${setting.time?.calendarData ?? ''}:${calendarId}`;
  const cached = CALENDAR_ADAPTER_CACHE.get(key);
  if (cached) return cached;
  const profile = parseCalendarProfile(settingDataFor(settingPackageId, 'calendar'), calendarId);
  const adapter = createCalendarAdapter(profile) as unknown as CalendarAdapter<unknown, unknown>;
  CALENDAR_ADAPTER_CACHE.set(key, adapter);
  return adapter;
}

/** Resolve from campaign state; missing ids in legacy saves retain the repository's original FR calendar default. */
export function calendarAdapterForState(state: Pick<State, 'settingPackageId'>): CalendarAdapter<unknown, unknown> {
  return calendarAdapterForSetting(state.settingPackageId ?? DEFAULT_SETTING_PACKAGE);
}

/** Old session data omits a setting id; preserve the repository's default package/calendar in that case. */
export const ACTIVE_CALENDAR_ADAPTER = calendarAdapterForSetting(DEFAULT_SETTING_PACKAGE);
