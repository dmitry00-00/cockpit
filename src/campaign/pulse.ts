// «Пульс мира» (F5, Q8): что происходит без партии — проекция состояния, ничего не меняет. Календарь на три
// десятидневки вперёд (праздники, Selûne, святые дни богов партии, смена сезона, сроки настроенных часов нитей), фракции и их
// отношения, индексы цен поселений по товарам, веса встреч. Значение, которое ждёт решения, идёт рядом с нынешним
// (`pending`), а не вместо него: симуляция не выглядит свершившимся фактом (CLAUDE.md «Правила экрана»).
import { GOODS, SRD_GOODS, SECONDS_PER_DAY, type GoodsId, type Location, type State, type WorldPatch } from '../engine/state';
import { SEASON_LABELS, calendarAdapterForState, harptos, moonState, seasonOf } from './calendar';
import { eraOfSetting } from './era';
import { holyDaysOn, holyList, isAnnual, partyDeitiesOf } from './holyDays';
import { THREAD_TICK_DAYS } from './simulation';
import { deityById, serviceOf } from '../cosmos/deities';
import { DEFAULT_SETTING_PACKAGE } from '../packages/registry';

export const PULSE_DAYS = 30;

export type PulseEventKind = 'festival' | 'moon-full' | 'moon-new' | 'holy' | 'season' | 'thread';

export interface PulseEvent {
  /** Начало дня события. */
  sec: number;
  /** Дней от сегодня: 0 — сегодня. */
  days: number;
  kind: PulseEventKind;
  label: string;
}

export interface PulseFaction {
  id: string;
  name: string;
  renown: number;
  influencePercent?: number;
  trend?: number;
}

/** Отношение пары фракций: a < b по id; `pending` — значение ждущего предложения. */
export interface PulseEdge { a: string; b: string; value: number; pending?: number }

export interface PulsePriceCell { index: number; pending?: number }
/** Строка цен поселения: общий индекс (надбавка места) и индексы товаров; 100 — базовая цена. */
export interface PulsePriceRow { id: string; name: string; all: PulsePriceCell; goods: Record<GoodsId, PulsePriceCell> }

export interface PulseEncounter { key: string; weight: number; pending?: number }
export interface PulseEncounterRow { id: string; name: string; entries: PulseEncounter[] }

export interface PulseGodRelation { id: string; name: string; kind: 'serves' | 'served-by' | 'aspect' }
export interface PulseGod { id: string; name: string; worshippers: readonly string[]; relations: readonly PulseGodRelation[] }

export interface Pulse {
  events: PulseEvent[];
  factions: PulseFaction[];
  edges: PulseEdge[];
  prices: PulsePriceRow[];
  encounters: PulseEncounterRow[];
  gods: PulseGod[];
}

const DAY = SECONDS_PER_DAY;

/** Патчи ждущих предложений — то, что мир получит, если мастер примет. */
const pendingPatches = (state: State): WorldPatch[] =>
  Object.values(state.deltas).flatMap(d => (d.status === 'pending' && d.patch ? [d.patch] : []));

/** Календарь [сегодня, сегодня + days): по дням, в порядке дня, внутри дня — как перечислены виды. */
export function pulseEvents(state: State, days = PULSE_DAYS): PulseEvent[] {
  const today = Math.floor(state.time.sec / DAY) * DAY;
  const settingPackageId = state.settingPackageId ?? DEFAULT_SETTING_PACKAGE;
  const isForgottenRealms = settingPackageId === DEFAULT_SETTING_PACKAGE;
  const calendar = calendarAdapterForState(state);
  const year = calendar.yearAt(today);
  const era = isForgottenRealms ? eraOfSetting(year, settingPackageId) : undefined;
  const party = new Set(partyDeitiesOf(state).keys());
  const out: PulseEvent[] = [];
  for (let i = 0; i < days; i++) {
    const sec = today + i * DAY;
    const frDate = isForgottenRealms ? harptos(sec) : undefined;
    if (frDate?.festival) out.push({ sec, days: i, kind: 'festival', label: frDate.festival });
    // Лунные правила профиля календаря применяются по его собственному адаптеру; Selûne и её имя остаются механикой FR.
    const moon = isForgottenRealms ? moonState(sec) : calendar.moonAt?.(sec);
    if (moon?.daysToFull === 0) out.push({ sec, days: i, kind: 'moon-full', label: isForgottenRealms ? 'Полнолуние Selûne' : 'Полнолуние' });
    if (moon?.daysToNew === 0) out.push({ sec, days: i, kind: 'moon-new', label: isForgottenRealms ? 'Новолуние Selûne' : 'Новолуние' });
    if (isForgottenRealms && era && party.size) {
      const holy = holyDaysOn(sec, era, party).filter(h => isAnnual(h.rule));
      if (holy.length) out.push({ sec, days: i, kind: 'holy', label: `Святой день: ${holyList(holy)}` });
    }
    const season = isForgottenRealms ? seasonOf(sec) : calendar.seasonAt?.(sec);
    const previousSeason = isForgottenRealms ? seasonOf(sec - DAY) : calendar.seasonAt?.(sec - DAY);
    if (i > 0 && season && previousSeason && season !== previousSeason) {
      const label = isForgottenRealms
        ? SEASON_LABELS[season as keyof typeof SEASON_LABELS]
        : calendar.seasonLabelAt?.(sec) ?? season;
      out.push({ sec, days: i, kind: 'season', label: `Сезон: ${label}` });
    }
  }
  // Следующий сегмент настроенных часов появится предложением, когда пройдёт десять дней без внимания.
  for (const t of Object.values(state.world.threads)) {
    if (t.status !== 'open' || !t.clock || t.clock.filled >= t.clock.segments) continue;
    const baseline = Math.max(t.lastTouchedSec, t.clock.startedSec ?? t.lastTouchedSec);
    const tick = Math.floor((baseline + THREAD_TICK_DAYS * DAY) / DAY) * DAY;
    const i = Math.round((tick - today) / DAY);
    if (i >= 0 && i < days) out.push({ sec: tick, days: i, kind: 'thread', label: `${t.name}: предложение тика часов` });
  }
  return out.sort((a, b) => a.days - b.days);
}

/** Строка цен места: общий индекс и товары против базовых (100), значение ждущего патча — рядом. */
export function priceRowOf(l: Location, patches: readonly WorldPatch[]): PulsePriceRow {
  const base = l.pricePercent ?? 0;
  const pBase = patches.find(x => x.kind === 'location' && x.field === 'pricePercent' && x.id === l.id);
  const pendingBase = pBase && pBase.kind === 'location' && pBase.field === 'pricePercent' ? pBase.value : undefined;
  const goods = Object.fromEntries(GOODS.map(g => {
    const own = l.prices?.[g] ?? 0;
    const p = patches.find(x => x.kind === 'price' && x.id === l.id && x.goods === g);
    const pendingOwn = p && p.kind === 'price' ? p.value : undefined;
    const cell: PulsePriceCell = { index: 100 + base + own };
    if (pendingOwn !== undefined || pendingBase !== undefined) cell.pending = 100 + (pendingBase ?? base) + (pendingOwn ?? own);
    return [g, cell];
  })) as Record<GoodsId, PulsePriceCell>;
  return { id: l.id, name: l.name, all: { index: 100 + base, ...(pendingBase !== undefined ? { pending: 100 + pendingBase } : {}) }, goods };
}

/** Колонки таблицы цен: разделы SRD — всегда (их покупает партия), грузы торговли — если у кого-то своя цена или ждущая. */
export const pricedGoods = (rows: readonly PulsePriceRow[]): GoodsId[] =>
  GOODS.filter(g => (SRD_GOODS as readonly GoodsId[]).includes(g) || rows.some(r => r.goods[g].index !== r.all.index || r.goods[g].pending !== undefined));

/** Веса встреч мест кампании и ждущие их изменения — для «Пульса» и слоя «Опасность» карты (ROADMAP 6.4). */
export function encounterRowsOf(state: State): PulseEncounterRow[] {
  const patches = pendingPatches(state);
  return Object.values(state.world.locations).flatMap(l => {
    const keys = new Set([
      ...Object.keys(l.encounters ?? {}),
      ...patches.flatMap(p => (p.kind === 'encounter' && p.id === l.id ? [p.key] : [])),
    ]);
    if (!keys.size) return [];
    const entries = [...keys].sort().map(key => {
      const p = patches.find(x => x.kind === 'encounter' && x.id === l.id && x.key === key);
      return { key, weight: l.encounters?.[key] ?? 1, ...(p && p.kind === 'encounter' ? { pending: p.value } : {}) };
    });
    return [{ id: l.id, name: l.name, entries }];
  });
}

export function pulseOf(state: State, days = PULSE_DAYS): Pulse {
  const patches = pendingPatches(state);
  const { factions, locations } = state.world;

  const edges: PulseEdge[] = [];
  const ids = Object.keys(factions).sort();
  for (const a of ids) {
    for (const b of ids) {
      if (a >= b) continue;
      const value = factions[a].relations?.[b] ?? 0;
      const p = patches.find(x => x.kind === 'relation' && ((x.id === a && x.other === b) || (x.id === b && x.other === a)));
      if (value !== 0 || p) edges.push({ a, b, value, ...(p && p.kind === 'relation' ? { pending: p.value } : {}) });
    }
  }

  const prices: PulsePriceRow[] = Object.values(locations).filter(l => l.scale === 'settlement').map(l => priceRowOf(l, patches));

  const encounters = encounterRowsOf(state);

  const gods = [...partyDeitiesOf(state)].map(([id, worshippers]) => {
    const isForgottenRealms = (state.settingPackageId ?? DEFAULT_SETTING_PACKAGE) === DEFAULT_SETTING_PACKAGE;
    const deity = isForgottenRealms ? deityById(id) : undefined;
    const name = deity?.name ?? state.party.map(a => state.actors[a]?.sheet?.deity).find(d => d?.id === id)?.name ?? id;
    const relations: PulseGodRelation[] = [];
    if (deity) {
      const settingPackageId = state.settingPackageId ?? DEFAULT_SETTING_PACKAGE;
      const service = serviceOf(deity, eraOfSetting(calendarAdapterForState(state).yearAt(state.time.sec), settingPackageId));
      for (const d of service.masters) relations.push({ id: d.id, name: d.name, kind: 'serves' });
      for (const d of service.servants) relations.push({ id: d.id, name: d.name, kind: 'served-by' });
      for (const d of service.aspects) relations.push({ id: d.id, name: d.name, kind: 'aspect' });
    }
    return { id, name, worshippers, relations };
  });

  return {
    events: pulseEvents(state, days),
    factions: Object.values(factions).map(f => ({ id: f.id, name: f.name, renown: f.renown, ...(f.influencePercent !== undefined ? { influencePercent: f.influencePercent } : {}), ...(f.trend ? { trend: f.trend } : {}) })),
    edges,
    prices,
    encounters,
    gods,
  };
}
