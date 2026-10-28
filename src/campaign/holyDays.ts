// Святые дни богов в календаре Харптоса (E4): правила из поля holy days карточек {{Deity}} Forgotten Realms Wiki
// (CC BY-SA 3.0) — праздник Харптоса, дата месяца, равноденствие и солнцестояние, дни каждого месяца, полнолуние и
// новолуние. Разбор — scripts/import-deities.py, файл маленький (около 20 КБ) и едет в основном куске: календарь и
// «Мир спокоен» читают его сразу. Редакция — по эпохе, как у полей бога: своя, потом старшие, новее — никогда.
import raw from '../../content/cosmos/holy-days.json';
import { DAYS_PER_YEAR, harptos, moonState, type FestivalName, type MonthName } from './calendar';
import { EDITION_ORDER, type Era } from './era';
import { SECONDS_PER_DAY, type State } from '../engine/state';

type Edition = '5eR' | '5e' | '4e' | '3e' | '2e' | '1e' | '';
export type Solar = 'spring' | 'summer' | 'autumn' | 'winter';

/** Правило святого дня. Ровно одно из: festival, month + day, monthly, moon. */
export interface HolyRule {
  festival?: FestivalName;
  month?: MonthName;
  day?: number;
  /** Дата — равноденствие или солнцестояние (Calendar of Harptos). */
  solar?: Solar;
  /** Дни каждого месяца. */
  monthly?: readonly number[];
  moon?: 'full' | 'new';
  /** Имя дня, если вики его даёт: «The Divine Death». */
  label?: string;
}

export interface HolyDeity {
  deity: string;
  /** Латиницей, как в книгах. */
  name: string;
  url: string;
  pantheons?: readonly string[];
  /** Текст поля и разобранные правила по редакциям. */
  editions: Partial<Record<Edition, { text: string; rules: readonly HolyRule[] }>>;
}

export const HOLY_DEITIES: readonly HolyDeity[] = (raw as unknown as { deities: HolyDeity[] }).deities;

export const SOLAR_LABEL: Readonly<Record<Solar, string>> = {
  spring: 'весеннее равноденствие', summer: 'летнее солнцестояние', autumn: 'осеннее равноденствие', winter: 'зимнее солнцестояние',
};

/** Кого показывать: богов Фаэруна (кампания на Sword Coast), всех или набор id — богов партии (E8). */
export type HolyScope = 'faerun' | 'all' | ReadonlySet<string>;
export const inHolyScope = (h: HolyDeity, scope: HolyScope): boolean =>
  typeof scope !== 'string' ? scope.has(h.deity) : scope === 'all' || (h.pantheons?.includes('faerunian-pantheon') ?? false);

/** Боги партии по листам (E8): id бога — имена почитателей. Пусто — ни у кого бога на листе нет. */
export function partyDeitiesOf(state: State): ReadonlyMap<string, readonly string[]> {
  const out = new Map<string, string[]>();
  for (const id of state.party) {
    const a = state.actors[id];
    const d = a?.sheet?.deity;
    if (d && !a.removed) out.set(d.id, [...(out.get(d.id) ?? []), a.name]);
  }
  return out;
}

/** Правила бога для эпохи: первая редакция с полем; поле без разобранных правил — пустой список (только текст). */
export function holyRulesAt(h: HolyDeity, era: Era): readonly HolyRule[] {
  for (const e of EDITION_ORDER[era] as readonly Edition[]) {
    const v = h.editions[e];
    if (v) return v.rules;
  }
  return [];
}

/** Святой день одного бога в конкретный день. */
export interface HolyDay { deity: string; name: string; rule: HolyRule }

/** Правило годовое (праздник или дата) — а не каждый месяц и не каждая луна. */
export const isAnnual = (r: HolyRule): boolean => r.festival !== undefined || r.month !== undefined;

/** Святые дни дня `sec` (любая секунда дня; луна — в полдень, как в сетке месяца). */
export function holyDaysOn(sec: number, era: Era, scope: HolyScope = 'faerun'): HolyDay[] {
  const start = Math.floor(sec / SECONDS_PER_DAY) * SECONDS_PER_DAY;
  const d = harptos(start);
  const moon = moonState(start + SECONDS_PER_DAY / 2).phase;
  const out: HolyDay[] = [];
  for (const h of HOLY_DEITIES) {
    if (!inHolyScope(h, scope)) continue;
    for (const rule of holyRulesAt(h, era)) {
      const hit = rule.festival ? d.festival === rule.festival
        : rule.month ? d.month === rule.month && d.day === rule.day
          : rule.monthly ? d.month !== null && rule.monthly.includes(d.day)
            : rule.moon ? moon === rule.moon : false;
      if (hit) out.push({ deity: h.deity, name: h.name, rule });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export interface NextHolyDay {
  sec: number;
  days: number;
  holy: HolyDay[];
  /** Святой день бога партии — а не просто ближайший у богов Фаэруна. */
  party?: boolean;
}

/** Ближайший святой день для стола: сначала боги партии (E8), нет их или их дней — боги Фаэруна. */
export function nextHolyDayFor(sec: number, era: Era, partyDeities: ReadonlySet<string>): NextHolyDay | undefined {
  const own = partyDeities.size ? nextHolyDay(sec, era, partyDeities) : undefined;
  return own ? { ...own, party: true } : nextHolyDay(sec, era, 'faerun');
}

/**
 * Ближайший день с годовым святым днём (праздник или дата) — сегодняшний считается сегодняшним. Ежемесячные и лунные
 * не берутся: иначе ближайшим всегда был бы Tyr или полнолуние. В году нет — undefined.
 */
export function nextHolyDay(sec: number, era: Era, scope: HolyScope = 'faerun'): NextHolyDay | undefined {
  const today = Math.floor(sec / SECONDS_PER_DAY) * SECONDS_PER_DAY;
  for (let i = 0; i < DAYS_PER_YEAR; i++) {
    const day = today + i * SECONDS_PER_DAY;
    const holy = holyDaysOn(day, era, scope).filter(h => isAnnual(h.rule));
    if (holy.length) return { sec: day, days: i, holy };
  }
  return undefined;
}

/** Имя дня: из вики («The Divine Death») или равноденствие и солнцестояние по-русски. */
export const holyWhat = (h: HolyDay): string | undefined => h.rule.label ?? (h.rule.solar ? SOLAR_LABEL[h.rule.solar] : undefined);

/** «Torm (The Divine Death)», «Lathander (весеннее равноденствие)» — бог и имя дня. */
export const holyLabel = (h: HolyDay): string => {
  const what = holyWhat(h);
  return what ? `${h.name} (${what})` : h.name;
};

/**
 * Святые дни строкой по именам дней: «летнее солнцестояние: Amaunator, Mielikki; The Greening: Eldath; Sune» — в
 * каждой группе первые три бога и «ещё N».
 */
export function holyList(list: readonly HolyDay[], max = 3): string {
  const groups = new Map<string, string[]>();
  for (const h of list) {
    const key = holyWhat(h) ?? '';
    const names = groups.get(key) ?? [];
    if (!names.includes(h.name)) names.push(h.name);
    groups.set(key, names);
  }
  // Без имени дня — последней группой: это сам праздник или дата.
  return [...groups].sort(([a], [b]) => Number(a === '') - Number(b === '')).map(([what, names]) => {
    const who = names.length > max ? `${names.slice(0, max).join(', ')} и ещё ${names.length - max}` : names.join(', ');
    return what ? `${what}: ${who}` : who;
  }).join('; ');
}
