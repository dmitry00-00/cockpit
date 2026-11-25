// С4: пеший путь между связанными местами держав задаёт географию фронта.
// Выбор чистый; активный фронт появляется только после принятия предложения войны.
import type { CaravanResources, CaravanPlaceOption } from './caravan';
import { kingdomExistsIn, type Kingdom } from '../world/kingdoms';
import { route, walkDays } from '../world/graph';

export interface WarFrontPlan {
  version: 1;
  map: string;
  fromPlace: string;
  toPlace: string;
  nodes: readonly CaravanPlaceOption[];
  miles: number;
  days: number;
  tier: 2 | 3;
  sideAPlaceIds: readonly string[];
  sideBPlaceIds: readonly string[];
  capitalA?: string;
  capitalB?: string;
}

export type WarFrontPreview =
  | { ok: true; front: WarFrontPlan }
  | { ok: false; reason: string };

const placeIdsOf = (kingdom: Kingdom): string[] => [...new Set([
  ...(kingdom.capitalPlace ? [kingdom.capitalPlace] : []),
  ...(kingdom.place ? [kingdom.place] : []),
  ...(kingdom.places ?? []),
])];

/** Places linked to a current-year kingdom and present in the prepared Toril graph. Capital is the default. */
export function warPlaces(resources: CaravanResources, kingdomId: string, year: number): CaravanPlaceOption[] {
  const kingdom = resources.kingdoms.get(kingdomId);
  if (!kingdom || !kingdomExistsIn(kingdom, year)) return [];
  const ids = placeIdsOf(kingdom).filter(id => resources.graph.nodes.has(id) && resources.places.has(id));
  return ids.map(id => {
    const place = resources.places.get(id)!;
    const node = resources.graph.nodes.get(id)!;
    return { id, name: place.name, x: node.x, y: node.y };
  }).sort((a, b) => Number(b.id === kingdom.capitalPlace) - Number(a.id === kingdom.capitalPlace)
    || a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id));
}

/** Build a route from explicit kingdom-linked endpoints; default to each capital when it is on the graph. */
export function previewWarFront(
  resources: CaravanResources | null,
  sideAId: string,
  sideBId: string,
  year: number,
  fromPlaceId?: string,
  toPlaceId?: string,
): WarFrontPreview {
  if (!resources) return { ok: false, reason: 'граф военных маршрутов недоступен' };
  const a = resources.kingdoms.get(sideAId), b = resources.kingdoms.get(sideBId);
  if (!a || !b || !kingdomExistsIn(a, year) || !kingdomExistsIn(b, year)) return { ok: false, reason: 'одна из держав не существует в выбранном году' };
  const placesA = warPlaces(resources, sideAId, year), placesB = warPlaces(resources, sideBId, year);
  const from = placesA.find(place => place.id === (fromPlaceId ?? a.capitalPlace)) ?? (!fromPlaceId ? placesA[0] : undefined);
  const to = placesB.find(place => place.id === (toPlaceId ?? b.capitalPlace)) ?? (!toPlaceId ? placesB[0] : undefined);
  if (!from || !to) return { ok: false, reason: 'для одной из держав нет связанного места в графе карты' };
  if (from.id === to.id) return { ok: false, reason: 'выберите два разных места держав' };
  const path = route(resources.graph, from.id, to.id, walkDays('normal'));
  if (!path) return { ok: false, reason: `между ${from.name} и ${to.name} нет пешего маршрута` };
  const nodes = path.nodes.map(id => {
    const place = resources.places.get(id), node = resources.graph.nodes.get(id);
    return place && node ? { id, name: place.name, x: node.x, y: node.y } : undefined;
  });
  if (nodes.some(node => !node)) return { ok: false, reason: 'в пути есть место без записи справочника карты' };
  const tier: 2 | 3 = /empire/i.test(`${a.type ?? ''} ${b.type ?? ''}`) ? 3 : 2;
  return {
    ok: true,
    front: {
      version: 1, map: resources.graph.map, fromPlace: from.id, toPlace: to.id,
      nodes: nodes as CaravanPlaceOption[], miles: path.miles, days: Math.round(path.cost * 10) / 10, tier,
      sideAPlaceIds: placeIdsOf(a), sideBPlaceIds: placeIdsOf(b),
      ...(a.capitalPlace ? { capitalA: a.capitalPlace } : {}),
      ...(b.capitalPlace ? { capitalB: b.capitalPlace } : {}),
    },
  };
}
