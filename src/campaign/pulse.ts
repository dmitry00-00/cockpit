// «Пульс мира» (F5, Q8): что происходит без партии — проекция состояния, ничего не меняет. Календарь на три
// десятидневки вперёд (праздники, Selûne, святые дни богов партии, смена сезона, остывание нитей), фракции и их
// отношения, индексы цен поселений по товарам, веса встреч. Значение, которое ждёт решения, идёт рядом с нынешним
// (`pending`), а не вместо него: симуляция не выглядит свершившимся фактом (CLAUDE.md «Правила экрана»).
import { GOODS, SECONDS_PER_DAY, type GoodsId, type State, type WorldPatch } from '../engine/state';
import { SEASON_LABELS, harptos, moonState, seasonOf } from './calendar';
import { eraOf } from './era';
import { holyDaysOn, holyList, isAnnual, partyDeitiesOf } from './holyDays';
import { THREAD_COLD_DAYS } from './simulation';

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

export interface PulseGod { id: string; name: string; worshippers: readonly string[] }

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
  const era = eraOf(harptos(today).year);
  const party = new Set(partyDeitiesOf(state).keys());
  const out: PulseEvent[] = [];
  for (let i = 0; i < days; i++) {
    const sec = today + i * DAY;
    const d = harptos(sec);
    if (d.festival) out.push({ sec, days: i, kind: 'festival', label: d.festival });
    // Полнолуние и новолуние — день самой фазы (daysToFull / daysToNew = 0), как «полнолуние через 3 дня» в полосе часов.
    const moon = moonState(sec);
    if (moon.daysToFull === 0) out.push({ sec, days: i, kind: 'moon-full', label: 'Полнолуние Selûne' });
    if (moon.daysToNew === 0) out.push({ sec, days: i, kind: 'moon-new', label: 'Новолуние Selûne' });
    if (party.size) {
      const holy = holyDaysOn(sec, era, party).filter(h => isAnnual(h.rule));
      if (holy.length) out.push({ sec, days: i, kind: 'holy', label: `Святой день: ${holyList(holy)}` });
    }
    if (i > 0 && seasonOf(sec) !== seasonOf(sec - DAY)) out.push({ sec, days: i, kind: 'season', label: `Сезон: ${SEASON_LABELS[seasonOf(sec)]}` });
  }
  // Нить без внимания остывает — симуляция предложит её закрыть (simulate, правило 1).
  for (const t of Object.values(state.world.threads)) {
    if (t.status !== 'open') continue;
    const cold = Math.floor((t.lastTouchedSec + THREAD_COLD_DAYS * DAY) / DAY) * DAY;
    const i = Math.round((cold - today) / DAY);
    if (i >= 0 && i < days) out.push({ sec: cold, days: i, kind: 'thread', label: `${t.name}: след остынет` });
  }
  return out.sort((a, b) => a.days - b.days);
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

  const prices: PulsePriceRow[] = Object.values(locations).filter(l => l.scale === 'settlement').map(l => {
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
  });

  const encounters: PulseEncounterRow[] = Object.values(locations).flatMap(l => {
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

  const gods = [...partyDeitiesOf(state)].map(([id, worshippers]) => {
    const name = state.party.map(a => state.actors[a]?.sheet?.deity).find(d => d?.id === id)?.name ?? id;
    return { id, name, worshippers };
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
