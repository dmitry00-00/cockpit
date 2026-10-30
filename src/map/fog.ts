// Туман знаний (решение владельца 27.10.2026): игрокам открыто то, где партия прошла, и места, которые мастер
// открыл кнопкой (PLACE_REVEALED). Проекция лога и состояния, своего события у тумана нет: пройденное выводится
// из PARTY_TRAVELED, что не отменены. На столе игроков туман включён всегда, у мастера — слоем по кнопке.
import { undoneIds } from '../engine/journal';
import { ancestorsOf, partyPlaceId } from '../engine/ladder';
import type { DomainEvent, PayloadByType } from '../engine/events';
import type { State } from '../engine/state';
import { geoOf } from './levelMap';
import type { MapPassport, MapPoint } from './projection';

/**
 * Насколько видно вокруг пути и места, где стоит партия, — в милях. Правило стола, не SRD: SRD даёт темп, но не
 * обзор; полдня пути в каждую сторону — то, что партия успевает разведать и услышать по дороге.
 */
export const FOG_SIGHT_MILES = 12;

export interface FogCircle extends MapPoint {
  /** Радиус в пикселях исходника. */
  r: number;
}

export interface Explored {
  /** Открытые круги: место партии, открытые мастером места (их рамка или обзор). */
  circles: FogCircle[];
  /** Пройденные пути — ломаные; открыто на обзор по обе стороны. */
  paths: MapPoint[][];
  /** Обзор в пикселях исходника — полуширина коридора пути. */
  sight: number;
}

export function exploredOf(state: State, events: readonly DomainEvent[], passport: MapPassport): Explored {
  const sight = FOG_SIGHT_MILES / passport.milesPerPixel;
  const undone = undoneIds(events);
  const paths = events
    .filter(e => e.type === 'PARTY_TRAVELED' && !e.undoes && !e.redoes && !undone.has(e.id))
    .map(e => e.payload as PayloadByType['PARTY_TRAVELED'])
    .filter(p => p.map === passport.id)
    .map(p => p.points.map(pt => ({ x: pt.x, y: pt.y })));
  const circles: FogCircle[] = [];
  for (const l of Object.values(state.world.locations)) {
    if (!l.revealed || l.geo?.map !== passport.id) continue;
    circles.push({ x: l.geo.x, y: l.geo.y, r: Math.max(sight, l.geo.r ?? 0) });
  }
  // Место партии — тем же путём, что знак партии на карте (partyPlaceId): у сида оно выводится, а не записано.
  const at = partyPlaceId(state);
  const g = at ? geoOf(state, at) : undefined;
  if (g?.map === passport.id && !circles.some(c => c.x === g.x && c.y === g.y && c.r >= sight)) circles.push({ x: g.x, y: g.y, r: sight });
  // План города (M10) открыт целиком, если город открыт игрокам или партия в нём: обзор в 12 миль шире любого плана.
  const city = passport.plan ? Object.values(state.world.locations).find(l => l.ref === passport.plan!.place) : undefined;
  if (city && (city.revealed || (at && (at === city.id || ancestorsOf(state, at).some(a => a.id === city.id))))) {
    circles.push({ x: passport.width / 2, y: passport.height / 2, r: Math.hypot(passport.width, passport.height) / 2 });
  }
  return { circles, paths, sight };
}

/** Точка открыта игрокам: в открытом круге или в коридоре обзора пройденного пути. */
export function isExplored(ex: Explored, p: MapPoint): boolean {
  if (ex.circles.some(c => Math.hypot(c.x - p.x, c.y - p.y) <= c.r)) return true;
  return ex.paths.some(path => path.some((b, i) => {
    if (i === 0) return path.length === 1 && Math.hypot(b.x - p.x, b.y - p.y) <= ex.sight;
    const a = path[i - 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = dx || dy ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
    return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y) <= ex.sight;
  }));
}
