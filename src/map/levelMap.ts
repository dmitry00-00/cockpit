// Карта уровня лестницы (HANDOFF §3): какую карту показать, куда смотреть и какие места на ней отметить.
// Чистая проекция State + Ladder; страница передаёт результат в WorldMap. Уровни с картой — планета,
// континент, регион, поселение; выше и ниже карты нет (план этажа и сетка боя — другие виды). У поселения со своим
// планом (M10, паспорт с plan.place = ref места) уровень показывает план; карта мира — переключателем.
import { SCALE_LEVELS, type ScaleLevel } from '../engine/events';
import { ancestorsOf, focusOf, partyPlaceId, type Ladder } from '../engine/ladder';
import type { Location, LocationGeo, State } from '../engine/state';
import { mapById, planOf } from './maps';
import type { MapBox, MapPassport, MapPoint } from './projection';

export const MAP_LEVELS: readonly ScaleLevel[] = ['planet', 'continent', 'region', 'settlement'];

/** Шаг гекса по уровню: регион — шесть миль (§3). */
export const HEX_MILES: Partial<Record<ScaleLevel, number>> = { region: 6 };

/** Рамка места без радиуса — поселение, здание: столько пикселей исходника вокруг точки. */
const DEFAULT_R = 120;

/** На сколько уровней вниз показывать пины: на планете и континенте глубже — каша из слипшихся плашек. */
const PIN_DEPTH: Partial<Record<ScaleLevel, number>> = { planet: 1, continent: 1, region: 2, settlement: 2 };

export interface LevelMap {
  passport: MapPassport;
  frame: MapBox;
  frameKey: string;
  /** Места ниже рамки с координатами — пины, не глубже PIN_DEPTH уровня. */
  places: Location[];
  party?: MapPoint;
  /** У поселения есть план (M10): показан он (true) или карта мира с планом за переключателем (false). */
  plan?: boolean;
}

const idx = (l: ScaleLevel) => SCALE_LEVELS.indexOf(l);

/** Своё geo или ближайшего предка с ним. */
export function geoOf(state: State, id: string): LocationGeo | undefined {
  const loc = state.world.locations[id];
  if (!loc) return undefined;
  return loc.geo ?? ancestorsOf(state, id).find(a => a.geo)?.geo;
}

const boxOf = (g: LocationGeo): MapBox => {
  const r = g.r ?? DEFAULT_R;
  const ry = g.ry ?? r;
  return { x0: g.x - r, y0: g.y - ry, x1: g.x + r, y1: g.y + ry };
};

/**
 * План поселения: весь растр плана рамкой, пины — места внутри поселения с координатами на плане, партия — если её
 * место стоит на плане. Места без координат плана на нём не видны: их ставит мастер инструментом «Место».
 */
function planMap(state: State, focus: Location, passport: MapPassport): LevelMap {
  const deepest = idx('settlement') + (PIN_DEPTH.settlement ?? 1);
  const places = Object.values(state.world.locations).filter(
    l => l.id !== focus.id && l.geo?.map === passport.id && idx(l.scale) <= deepest && ancestorsOf(state, l.id).some(a => a.id === focus.id),
  );
  const partyId = partyPlaceId(state);
  const partyGeo = partyId ? geoOf(state, partyId) : undefined;
  return {
    passport,
    frame: { x0: 0, y0: 0, x1: passport.width, y1: passport.height },
    frameKey: `settlement:${focus.id}:plan`,
    places,
    party: partyGeo && partyGeo.map === passport.id ? { x: partyGeo.x, y: partyGeo.y } : undefined,
    plan: true,
  };
}

/**
 * Карта уровня или undefined: уровень без карты, место без координат, паспорт карты не найден. opts.plan = false —
 * поселение с планом на карте мира (переключатель мастера).
 */
export function levelMap(state: State, ladder: Ladder, opts: { plan?: boolean } = {}): LevelMap | undefined {
  if (!MAP_LEVELS.includes(ladder.level)) return undefined;
  const focus = focusOf(state, ladder);
  if (!focus) return undefined;
  const plan = ladder.level === 'settlement' ? planOf(focus.ref) : undefined;
  if (plan && opts.plan !== false) return planMap(state, focus, plan);
  const geo = geoOf(state, focus.id);
  const passport = mapById(geo?.map);
  if (!geo || !passport) return undefined;
  // Подрегион (Triboar Trail) — того же уровня, что родитель: пины берём от верхнего места уровня.
  let root = focus;
  for (const a of ancestorsOf(state, focus.id)) {
    if (a.scale !== focus.scale) break;
    root = a;
  }
  const deepest = idx(ladder.level) + (PIN_DEPTH[ladder.level] ?? 1);
  // Подрегион чужого региона (Triboar Trail на карте континента) прячется за своим регионом: его пин — уровнем ниже.
  const nested = (l: Location) => {
    const parent = l.parentId ? state.world.locations[l.parentId] : undefined;
    return !!parent && parent.id !== root.id && parent.scale === l.scale;
  };
  const places = Object.values(state.world.locations).filter(
    l => l.id !== root.id && l.geo?.map === passport.id && idx(l.scale) <= deepest && !nested(l) && ancestorsOf(state, l.id).some(a => a.id === root.id),
  );
  const partyId = partyPlaceId(state);
  const partyGeo = partyId ? geoOf(state, partyId) : undefined;
  return {
    passport,
    frame: boxOf(geo),
    frameKey: `${ladder.level}:${focus.id}`,
    places,
    party: partyGeo && partyGeo.map === passport.id ? { x: partyGeo.x, y: partyGeo.y } : undefined,
    ...(plan ? { plan: false } : {}),
  };
}
