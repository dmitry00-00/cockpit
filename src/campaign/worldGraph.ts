// Места графа мира в кампании (SIMULATION.md С2, ленивое воплощение): весь справочник в состоянии не хранится —
// место попадает в мир кампании, когда его тронул процесс (караван пришёл, город осадили). Как и новое место щелчком
// по карте (newPlace.ts), это патч `newLocation` внутри предложения процесса: мир меняет только «Принять».
// Импортируют только ленивые части (виды процессов С3+), из campaign/index.ts не экспортируется — основной кусок.
import { SCALE_LEVELS } from '../engine/events';
import type { Location, State, WorldPatch } from '../engine/state';
import { ref } from '../entities/ref';
import { freeLocationId } from './newPlace';

/** Место справочника карты: id, имя и точка на растре. */
export interface PlaceStub {
  id: string;
  name: string;
  x: number;
  y: number;
}

/** Место кампании, за которым стоит место справочника (`ref: place:<id>`). */
export function locationOfPlace(state: State, placeId: string): Location | undefined {
  const want = ref('place', placeId);
  return Object.values(state.world.locations).find(l => l.ref === want);
}

/** Самое мелкое место кампании крупнее поселения, чья рамка на этой карте накрывает точку. */
export function enclosingLocation(state: State, map: string, x: number, y: number): Location | undefined {
  const settlement = SCALE_LEVELS.indexOf('settlement');
  let best: Location | undefined;
  for (const l of Object.values(state.world.locations)) {
    const g = l.geo;
    const level = SCALE_LEVELS.indexOf(l.scale);
    if (!g || g.map !== map || g.r === undefined || level >= settlement) continue;
    if (Math.abs(x - g.x) > g.r || Math.abs(y - g.y) > (g.ry ?? g.r)) continue;
    if (!best || level > SCALE_LEVELS.indexOf(best.scale) || (level === SCALE_LEVELS.indexOf(best.scale) && l.id < best.id)) best = l;
  }
  return best;
}

/**
 * Место справочника в кампании: уже есть — оно; нет — новое поселение в самом мелком накрывающем месте (регион,
 * континент, планета) и патч `newLocation`, который вид процесса кладёт в своё предложение. Ни одна рамка не накрывает —
 * ошибка: карте кампании не во что поставить место.
 */
export function placeLocation(state: State, place: PlaceStub, map: string): { location: Location; patch?: WorldPatch } {
  const have = locationOfPlace(state, place.id);
  if (have) return { location: have };
  const parent = enclosingLocation(state, map, place.x, place.y);
  if (!parent) throw new Error(`место ${place.name}: на карте ${map} нет места кампании, что накрывает точку`);
  const location: Location = {
    id: freeLocationId(state, place.name), name: place.name, scale: 'settlement', parentId: parent.id,
    ref: ref('place', place.id), geo: { map, x: place.x, y: place.y },
  };
  return { location, patch: { kind: 'newLocation', location } };
}
