import type { ScaleLevel, Tempo } from '../engine/events';

export interface CalendarMonthData {
  id: string;
  name: string;
  days: number;
  season: string;
}

export interface CalendarIntercalaryData {
  id: string;
  name: string;
  after: string;
  afterIntercalary?: string;
  days: number;
  season: string;
  rule?: { every: number; offset: number };
}

export interface CalendarWeekData { id: string; name: string; days: number }
export interface CalendarDayPhaseData { id: string; labelRu: string; fromHour: number }
export interface CalendarSeasonData { id: string; labelRu: string }
export interface CalendarMoonData {
  id: string; name: string; cycleDays: number;
  fullAt: { year: number; month: string; day: number };
  fullWindowDays?: number; newWindowDays?: number;
}

interface CalendarProfileBase {
  format: 1;
  id: string;
  yearSuffix?: string;
  yearZero?: boolean;
  week?: CalendarWeekData;
  dayPhases?: readonly CalendarDayPhaseData[];
  seasons?: readonly CalendarSeasonData[];
}

export interface MonthsCalendarProfile extends CalendarProfileBase {
  kind: 'months';
  epoch: { year: number; month: string; day: number; hour?: number; minute?: number };
  months: readonly CalendarMonthData[];
  intercalary: readonly CalendarIntercalaryData[];
  week: CalendarWeekData;
  dayPhases: readonly CalendarDayPhaseData[];
  seasons: readonly CalendarSeasonData[];
  moons?: readonly CalendarMoonData[];
}

export interface CounterCalendarProfile extends CalendarProfileBase {
  kind: 'counter';
  epoch: { day: number; hour?: number; minute?: number };
  dayLabel: string;
  week?: CalendarWeekData;
  dayPhases?: readonly CalendarDayPhaseData[];
}

export interface GregorianCalendarProfile extends CalendarProfileBase {
  kind: 'gregorian';
  epoch: { year: number; month: string; day: number; hour?: number; minute?: number };
  months: readonly { id: string; name: string }[];
  week?: CalendarWeekData;
  dayPhases?: readonly CalendarDayPhaseData[];
}

export type CalendarProfile = MonthsCalendarProfile | CounterCalendarProfile | GregorianCalendarProfile;

export interface EditionLensProfile {
  format: 1;
  id: string;
  default: string;
  eras: readonly { id: string; throughYear?: number; fieldOrder: readonly string[]; cosmology?: string }[];
}

export interface ScaleLadderProfile {
  format: 1;
  id: string;
  rankOrder: readonly ScaleLevel[];
  ranks: readonly { id: ScaleLevel; labelRu: string; tempo: Tempo; view: string; map?: string }[];
  roots: readonly {
    id: string; name: string; scale: ScaleLevel; parentId?: string;
    ref?: { kind: string; id: string };
    geo?: { map: string; x: number; y: number; r: number; ry?: number };
  }[];
}

const CORE_SCALE_ORDER: readonly ScaleLevel[] = [
  'cosmology', 'plane', 'system', 'planet', 'continent', 'region', 'settlement', 'building', 'battle',
];
const TEMPOS: readonly Tempo[] = ['round', '10min', 'hour', 'day', 'tenday', 'season', 'year'];
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function object(value: unknown, at: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${at}: ожидается объект`);
  return value as Record<string, unknown>;
}

function text(value: unknown, at: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${at}: ожидается непустая строка`);
  return value.trim();
}

function integer(value: unknown, at: string, min = Number.MIN_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < min) throw new Error(`${at}: ожидается целое число не меньше ${min}`);
  return value as number;
}

function id(value: unknown, at: string): string {
  const result = text(value, at);
  if (!ID.test(result)) throw new Error(`${at}: недопустимый id`);
  return result;
}

function unique<T>(values: readonly T[], key: (value: T) => string, at: string): void {
  const keys = values.map(key);
  if (new Set(keys).size !== keys.length) throw new Error(`${at}: повторяющийся id`);
}

export function parseMonthsCalendarProfile(value: unknown, expectedId?: string): MonthsCalendarProfile {
  const raw = object(value, 'calendar');
  if (raw.format !== 1) throw new Error('calendar.format: поддерживается только 1');
  const calendarId = id(raw.id, 'calendar.id');
  if (expectedId && calendarId !== expectedId) throw new Error(`calendar.id: ожидался ${expectedId}, получен ${calendarId}`);
  if (raw.kind !== 'months') throw new Error('calendar.kind: ожидался months');
  const epochRaw = object(raw.epoch, 'calendar.epoch');
  if (raw.yearZero !== undefined && typeof raw.yearZero !== 'boolean') throw new Error('calendar.yearZero: ожидается boolean');
  const monthsRaw = raw.months;
  if (!Array.isArray(monthsRaw) || !monthsRaw.length) throw new Error('calendar.months: нужен хотя бы один месяц');
  const months = monthsRaw.map((entry, index) => {
    const month = object(entry, `calendar.months[${index}]`);
    return {
      id: id(month.id, `calendar.months[${index}].id`),
      name: text(month.name, `calendar.months[${index}].name`),
      days: integer(month.days, `calendar.months[${index}].days`, 1),
      season: id(month.season, `calendar.months[${index}].season`),
    };
  });
  unique(months, month => month.id, 'calendar.months');
  unique(months, month => month.name, 'calendar.months.name');
  const seasonsRaw = raw.seasons;
  if (!Array.isArray(seasonsRaw) || !seasonsRaw.length) throw new Error('calendar.seasons: нужен хотя бы один сезон');
  const seasons = seasonsRaw.map((entry, index) => {
    const season = object(entry, `calendar.seasons[${index}]`);
    return { id: id(season.id, `calendar.seasons[${index}].id`), labelRu: text(season.labelRu, `calendar.seasons[${index}].labelRu`) };
  });
  unique(seasons, season => season.id, 'calendar.seasons');
  const seasonIds = new Set(seasons.map(season => season.id));
  for (const month of months) if (!seasonIds.has(month.season)) throw new Error(`calendar.months.${month.id}: неизвестный сезон ${month.season}`);

  const intercalaryRaw = raw.intercalary;
  if (!Array.isArray(intercalaryRaw)) throw new Error('calendar.intercalary: ожидается список');
  const intercalary = intercalaryRaw.map((entry, index) => {
    const day = object(entry, `calendar.intercalary[${index}]`);
    const ruleRaw = day.rule === undefined ? undefined : object(day.rule, `calendar.intercalary[${index}].rule`);
    const result: CalendarIntercalaryData = {
      id: id(day.id, `calendar.intercalary[${index}].id`),
      name: text(day.name, `calendar.intercalary[${index}].name`),
      after: id(day.after, `calendar.intercalary[${index}].after`),
      days: integer(day.days, `calendar.intercalary[${index}].days`, 1),
      season: id(day.season, `calendar.intercalary[${index}].season`),
      ...(day.afterIntercalary === undefined ? {} : { afterIntercalary: id(day.afterIntercalary, `calendar.intercalary[${index}].afterIntercalary`) }),
      ...(ruleRaw ? { rule: { every: integer(ruleRaw.every, `calendar.intercalary[${index}].rule.every`, 1), offset: integer(ruleRaw.offset, `calendar.intercalary[${index}].rule.offset`) } } : {}),
    };
    if (!months.some(month => month.id === result.after)) throw new Error(`calendar.intercalary.${result.id}: неизвестный месяц ${result.after}`);
    if (!seasonIds.has(result.season)) throw new Error(`calendar.intercalary.${result.id}: неизвестный сезон ${result.season}`);
    return result;
  });
  unique(intercalary, day => day.id, 'calendar.intercalary');
  unique(intercalary, day => day.name, 'calendar.intercalary.name');
  for (const day of intercalary) if (day.afterIntercalary && !intercalary.some(other => other.id === day.afterIntercalary)) throw new Error(`calendar.intercalary.${day.id}: неизвестная точка вставки ${day.afterIntercalary}`);

  const epochMonth = text(epochRaw.month, 'calendar.epoch.month');
  const month = months.find(candidate => candidate.id === epochMonth);
  if (!month) throw new Error(`calendar.epoch.month: неизвестный месяц ${epochMonth}`);
  const epochYear = integer(epochRaw.year, 'calendar.epoch.year');
  if (raw.yearZero === false && epochYear === 0) throw new Error('calendar.epoch.year: в календаре без нулевого года года 0 нет');
  const epochDay = integer(epochRaw.day, 'calendar.epoch.day', 1);
  if (epochDay > month.days) throw new Error('calendar.epoch.day: день вне месяца эпохи');
  const epochHour = epochRaw.hour === undefined ? 0 : integer(epochRaw.hour, 'calendar.epoch.hour', 0);
  const epochMinute = epochRaw.minute === undefined ? 0 : integer(epochRaw.minute, 'calendar.epoch.minute', 0);
  if (epochHour > 23 || epochMinute > 59) throw new Error('calendar.epoch: время вне суток');
  const weekRaw = object(raw.week, 'calendar.week');
  const week = { id: id(weekRaw.id, 'calendar.week.id'), name: text(weekRaw.name, 'calendar.week.name'), days: integer(weekRaw.days, 'calendar.week.days', 1) };

  if (!Array.isArray(raw.dayPhases) || !raw.dayPhases.length) throw new Error('calendar.dayPhases: нужен список фаз суток');
  const dayPhases = raw.dayPhases.map((entry, index) => {
    const phase = object(entry, `calendar.dayPhases[${index}]`);
    const fromHour = integer(phase.fromHour, `calendar.dayPhases[${index}].fromHour`, 0);
    if (fromHour > 23) throw new Error(`calendar.dayPhases[${index}].fromHour: ожидалось 0–23`);
    return { id: id(phase.id, `calendar.dayPhases[${index}].id`), labelRu: text(phase.labelRu, `calendar.dayPhases[${index}].labelRu`), fromHour };
  });
  unique(dayPhases, phase => phase.id, 'calendar.dayPhases');
  unique(dayPhases, phase => String(phase.fromHour), 'calendar.dayPhases.fromHour');
  dayPhases.sort((a, b) => a.fromHour - b.fromHour);

  const moonsRaw = raw.moons === undefined ? [] : raw.moons;
  if (!Array.isArray(moonsRaw)) throw new Error('calendar.moons: ожидается список');
  const moons = moonsRaw.map((entry, index) => {
    const moon = object(entry, `calendar.moons[${index}]`);
    const fullAtRaw = object(moon.fullAt, `calendar.moons[${index}].fullAt`);
    const fullAtMonth = text(fullAtRaw.month, `calendar.moons[${index}].fullAt.month`);
    const fullAtDefinition = months.find(candidate => candidate.id === fullAtMonth);
    const fullAtYear = integer(fullAtRaw.year, `calendar.moons[${index}].fullAt.year`);
    if (raw.yearZero === false && fullAtYear === 0) throw new Error(`calendar.moons[${index}].fullAt.year: в календаре без нулевого года года 0 нет`);
    const fullAtDay = integer(fullAtRaw.day, `calendar.moons[${index}].fullAt.day`, 1);
    if (!fullAtDefinition || fullAtDay > fullAtDefinition.days) throw new Error(`calendar.moons[${index}].fullAt: дата вне календаря`);
    return {
      id: id(moon.id, `calendar.moons[${index}].id`), name: text(moon.name, `calendar.moons[${index}].name`),
      cycleDays: integer(moon.cycleDays, `calendar.moons[${index}].cycleDays`, 2),
      fullAt: { year: fullAtYear, month: fullAtMonth, day: fullAtDay },
      ...(moon.fullWindowDays === undefined ? {} : { fullWindowDays: integer(moon.fullWindowDays, `calendar.moons[${index}].fullWindowDays`, 0) }),
      ...(moon.newWindowDays === undefined ? {} : { newWindowDays: integer(moon.newWindowDays, `calendar.moons[${index}].newWindowDays`, 0) }),
    };
  });
  unique(moons, moon => moon.id, 'calendar.moons');

  return {
    format: 1, id: calendarId, kind: 'months',
    ...(raw.yearSuffix === undefined ? {} : { yearSuffix: text(raw.yearSuffix, 'calendar.yearSuffix') }),
    ...(raw.yearZero === undefined ? {} : { yearZero: raw.yearZero === true }),
    epoch: {
      year: epochYear, month: epochMonth, day: epochDay,
      hour: epochHour, minute: epochMinute,
    },
    months, intercalary, week, dayPhases, seasons,
    ...(moons.length ? { moons } : {}),
  };
}

function parseOptionalWeek(value: unknown, at: string): CalendarWeekData | undefined {
  if (value === undefined) return undefined;
  const raw = object(value, at);
  return { id: id(raw.id, `${at}.id`), name: text(raw.name, `${at}.name`), days: integer(raw.days, `${at}.days`, 1) };
}

function parseOptionalDayPhases(value: unknown, at: string): readonly CalendarDayPhaseData[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.length) throw new Error(`${at}: ожидается непустой список`);
  const phases = value.map((entry, index) => {
    const phase = object(entry, `${at}[${index}]`);
    const fromHour = integer(phase.fromHour, `${at}[${index}].fromHour`, 0);
    if (fromHour > 23) throw new Error(`${at}[${index}].fromHour: ожидалось 0–23`);
    return { id: id(phase.id, `${at}[${index}].id`), labelRu: text(phase.labelRu, `${at}[${index}].labelRu`), fromHour };
  });
  unique(phases, phase => phase.id, at);
  unique(phases, phase => String(phase.fromHour), `${at}.fromHour`);
  phases.sort((a, b) => a.fromHour - b.fromHour);
  return phases;
}

function parseBase(raw: Record<string, unknown>, calendarId: string): Pick<CalendarProfileBase, 'format' | 'id' | 'yearSuffix' | 'yearZero'> {
  if (raw.format !== 1) throw new Error('calendar.format: поддерживается только 1');
  if (raw.yearZero !== undefined && typeof raw.yearZero !== 'boolean') throw new Error('calendar.yearZero: ожидается boolean');
  return {
    format: 1, id: calendarId,
    ...(raw.yearSuffix === undefined ? {} : { yearSuffix: text(raw.yearSuffix, 'calendar.yearSuffix') }),
    ...(raw.yearZero === undefined ? {} : { yearZero: raw.yearZero === true }),
  };
}

export function parseCounterCalendarProfile(value: unknown, expectedId?: string): CounterCalendarProfile {
  const raw = object(value, 'calendar');
  const calendarId = id(raw.id, 'calendar.id');
  if (expectedId && calendarId !== expectedId) throw new Error(`calendar.id: ожидался ${expectedId}, получен ${calendarId}`);
  if (raw.kind !== 'counter') throw new Error('calendar.kind: ожидался counter');
  const base = parseBase(raw, calendarId);
  const epochRaw = object(raw.epoch, 'calendar.epoch');
  const day = integer(epochRaw.day, 'calendar.epoch.day');
  const hour = epochRaw.hour === undefined ? 0 : integer(epochRaw.hour, 'calendar.epoch.hour', 0);
  const minute = epochRaw.minute === undefined ? 0 : integer(epochRaw.minute, 'calendar.epoch.minute', 0);
  if (hour > 23 || minute > 59) throw new Error('calendar.epoch: время вне суток');
  return {
    ...base, kind: 'counter', epoch: { day, hour, minute },
    dayLabel: raw.dayLabel === undefined ? 'Day' : text(raw.dayLabel, 'calendar.dayLabel'),
    ...(parseOptionalWeek(raw.week, 'calendar.week') ? { week: parseOptionalWeek(raw.week, 'calendar.week') } : {}),
    ...(parseOptionalDayPhases(raw.dayPhases, 'calendar.dayPhases') ? { dayPhases: parseOptionalDayPhases(raw.dayPhases, 'calendar.dayPhases') } : {}),
  };
}

export function parseGregorianCalendarProfile(value: unknown, expectedId?: string): GregorianCalendarProfile {
  const raw = object(value, 'calendar');
  const calendarId = id(raw.id, 'calendar.id');
  if (expectedId && calendarId !== expectedId) throw new Error(`calendar.id: ожидался ${expectedId}, получен ${calendarId}`);
  if (raw.kind !== 'gregorian') throw new Error('calendar.kind: ожидался gregorian');
  const base = parseBase(raw, calendarId);
  const epochRaw = object(raw.epoch, 'calendar.epoch');
  const epochMonth = id(epochRaw.month, 'calendar.epoch.month');
  if (!Array.isArray(raw.months) || raw.months.length !== 12) throw new Error('calendar.months: для gregorian нужны 12 месяцев');
  const months = raw.months.map((entry, index) => {
    const month = object(entry, `calendar.months[${index}]`);
    return { id: id(month.id, `calendar.months[${index}].id`), name: text(month.name, `calendar.months[${index}].name`) };
  });
  unique(months, month => month.id, 'calendar.months');
  unique(months, month => month.name, 'calendar.months.name');
  if (!months.some(month => month.id === epochMonth)) throw new Error(`calendar.epoch.month: неизвестный месяц ${epochMonth}`);
  const epochYear = integer(epochRaw.year, 'calendar.epoch.year');
  if (base.yearZero === false && epochYear === 0) throw new Error('calendar.epoch.year: в календаре без нулевого года года 0 нет');
  const epochDay = integer(epochRaw.day, 'calendar.epoch.day', 1);
  const epochMonthNumber = months.findIndex(month => month.id === epochMonth) + 1;
  const astronomicalYear = base.yearZero === false && epochYear < 0 ? epochYear + 1 : epochYear;
  const maxEpochDay = epochMonthNumber === 2 ? (astronomicalYear % 4 === 0 && (astronomicalYear % 100 !== 0 || astronomicalYear % 400 === 0) ? 29 : 28)
    : [4, 6, 9, 11].includes(epochMonthNumber) ? 30 : 31;
  if (epochDay > maxEpochDay) throw new Error('calendar.epoch.day: дата вне месяца эпохи');
  const epochHour = epochRaw.hour === undefined ? 0 : integer(epochRaw.hour, 'calendar.epoch.hour', 0);
  const epochMinute = epochRaw.minute === undefined ? 0 : integer(epochRaw.minute, 'calendar.epoch.minute', 0);
  if (epochHour > 23 || epochMinute > 59) throw new Error('calendar.epoch: время вне суток');
  return {
    ...base, kind: 'gregorian', epoch: { year: epochYear, month: epochMonth, day: epochDay, hour: epochHour, minute: epochMinute },
    months,
    ...(parseOptionalWeek(raw.week, 'calendar.week') ? { week: parseOptionalWeek(raw.week, 'calendar.week') } : {}),
    ...(parseOptionalDayPhases(raw.dayPhases, 'calendar.dayPhases') ? { dayPhases: parseOptionalDayPhases(raw.dayPhases, 'calendar.dayPhases') } : {}),
  };
}

export function parseCalendarProfile(value: unknown, expectedId?: string): CalendarProfile {
  const raw = object(value, 'calendar');
  if (raw.kind === 'months') return parseMonthsCalendarProfile(value, expectedId);
  if (raw.kind === 'counter') return parseCounterCalendarProfile(value, expectedId);
  if (raw.kind === 'gregorian') return parseGregorianCalendarProfile(value, expectedId);
  throw new Error(`calendar.kind: неизвестный тип ${String(raw.kind)}`);
}

export function parseEditionLensProfile(value: unknown, expectedId?: string): EditionLensProfile {
  const raw = object(value, 'lenses');
  if (raw.format !== 1) throw new Error('lenses.format: поддерживается только 1');
  const lensId = id(raw.id, 'lenses.id');
  if (expectedId && lensId !== expectedId) throw new Error(`lenses.id: ожидался ${expectedId}, получен ${lensId}`);
  if (!Array.isArray(raw.eras) || !raw.eras.length) throw new Error('lenses.eras: нужен хотя бы один период');
  const eras = raw.eras.map((entry, index) => {
    const era = object(entry, `lenses.eras[${index}]`);
    if (!Array.isArray(era.fieldOrder) || !era.fieldOrder.every(field => typeof field === 'string')) throw new Error(`lenses.eras[${index}].fieldOrder: ожидается список строк`);
    return {
      id: text(era.id, `lenses.eras[${index}].id`),
      ...(era.throughYear === undefined ? {} : { throughYear: integer(era.throughYear, `lenses.eras[${index}].throughYear`) }),
      fieldOrder: [...era.fieldOrder] as string[],
      ...(era.cosmology === undefined ? {} : { cosmology: text(era.cosmology, `lenses.eras[${index}].cosmology`) }),
    };
  });
  unique(eras, era => era.id, 'lenses.eras');
  const defaults = text(raw.default, 'lenses.default');
  if (!eras.some(era => era.id === defaults)) throw new Error('lenses.default: нет такого периода');
  let previous = Number.NEGATIVE_INFINITY;
  for (const era of eras) if (era.throughYear !== undefined) {
    if (era.throughYear <= previous) throw new Error('lenses.eras: throughYear должны возрастать');
    previous = era.throughYear;
  }
  return { format: 1, id: lensId, default: defaults, eras };
}

export function parseScaleLadderProfile(value: unknown, expectedId?: string): ScaleLadderProfile {
  const raw = object(value, 'ladder');
  if (raw.format !== 1) throw new Error('ladder.format: поддерживается только 1');
  const ladderId = id(raw.id, 'ladder.id');
  if (expectedId && ladderId !== expectedId) throw new Error(`ladder.id: ожидался ${expectedId}, получен ${ladderId}`);
  if (!Array.isArray(raw.rankOrder) || !raw.rankOrder.every(rank => typeof rank === 'string')) throw new Error('ladder.rankOrder: ожидается список рангов');
  const rankOrder = raw.rankOrder.map((rank, index) => id(rank, `ladder.rankOrder[${index}]`) as ScaleLevel);
  if (rankOrder.length !== CORE_SCALE_ORDER.length || rankOrder.some((rank, index) => rank !== CORE_SCALE_ORDER[index])) {
    throw new Error('ladder.rankOrder: порядок должен совпадать с девятью рангами ядра');
  }
  if (!Array.isArray(raw.ranks) || raw.ranks.length !== rankOrder.length) throw new Error('ladder.ranks: нужны подписи и параметры всех девяти рангов');
  const ranks = raw.ranks.map((entry, index) => {
    const rank = object(entry, `ladder.ranks[${index}]`);
    const rankId = id(rank.id, `ladder.ranks[${index}].id`) as ScaleLevel;
    if (!rankOrder.includes(rankId)) throw new Error(`ladder.ranks[${index}]: неизвестный ранг ${rankId}`);
    const tempo = text(rank.tempo, `ladder.ranks[${index}].tempo`) as Tempo;
    if (!TEMPOS.includes(tempo)) throw new Error(`ladder.ranks[${index}].tempo: неизвестный темп ${tempo}`);
    return { id: rankId, labelRu: text(rank.labelRu, `ladder.ranks[${index}].labelRu`), tempo, view: id(rank.view, `ladder.ranks[${index}].view`), ...(rank.map === undefined ? {} : { map: id(rank.map, `ladder.ranks[${index}].map`) }) };
  });
  unique(ranks, rank => rank.id, 'ladder.ranks');
  if (rankOrder.some(rank => !ranks.some(entry => entry.id === rank))) throw new Error('ladder.ranks: отсутствует подпись одного из рангов');
  if (!Array.isArray(raw.roots)) throw new Error('ladder.roots: ожидается список корневых мест');
  const roots = raw.roots.map((entry, index) => {
    const root = object(entry, `ladder.roots[${index}]`);
    const scale = id(root.scale, `ladder.roots[${index}].scale`) as ScaleLevel;
    if (!rankOrder.includes(scale)) throw new Error(`ladder.roots[${index}].scale: неизвестный ранг ${scale}`);
    const geoRaw = root.geo === undefined ? undefined : object(root.geo, `ladder.roots[${index}].geo`);
    const refRaw = root.ref === undefined ? undefined : object(root.ref, `ladder.roots[${index}].ref`);
    return {
      id: id(root.id, `ladder.roots[${index}].id`), name: text(root.name, `ladder.roots[${index}].name`), scale,
      ...(root.parentId === undefined ? {} : { parentId: id(root.parentId, `ladder.roots[${index}].parentId`) }),
      ...(refRaw ? { ref: { kind: id(refRaw.kind, `ladder.roots[${index}].ref.kind`), id: text(refRaw.id, `ladder.roots[${index}].ref.id`) } } : {}),
      ...(geoRaw ? { geo: {
        map: id(geoRaw.map, `ladder.roots[${index}].geo.map`),
        x: integer(geoRaw.x, `ladder.roots[${index}].geo.x`, 0), y: integer(geoRaw.y, `ladder.roots[${index}].geo.y`, 0),
        r: integer(geoRaw.r, `ladder.roots[${index}].geo.r`, 0),
        ...(geoRaw.ry === undefined ? {} : { ry: integer(geoRaw.ry, `ladder.roots[${index}].geo.ry`, 0) }),
      } } : {}),
    };
  });
  unique(roots, root => root.id, 'ladder.roots');
  for (const root of roots) if (root.parentId && !roots.some(parent => parent.id === root.parentId)) throw new Error(`ladder.roots.${root.id}: неизвестный родитель ${root.parentId}`);
  const parents = new Map(roots.map(root => [root.id, root.parentId]));
  for (const root of roots) {
    const seen = new Set<string>();
    let cursor: string | undefined = root.id;
    while (cursor) {
      if (seen.has(cursor)) throw new Error(`ladder.roots.${root.id}: цикл в иерархии мест`);
      seen.add(cursor);
      cursor = parents.get(cursor);
    }
  }
  return { format: 1, id: ladderId, rankOrder, ranks, roots };
}
