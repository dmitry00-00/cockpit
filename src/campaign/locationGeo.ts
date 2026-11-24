import type { State, WorldDelta, WorldPatch } from '../engine';
import type { MapPassport, MapPoint } from '../map/projection';

function patchesOf(patch: WorldPatch | undefined): WorldPatch[] {
  return patch?.kind === 'batch' ? patch.patches.flatMap(child => patchesOf(child)) : patch ? [patch] : [];
}

/** A map click proposes pixel coordinates in the selected raster's own coordinate space. */
export function locationGeoDelta(
  state: State,
  locationId: string,
  passport: Pick<MapPassport, 'id' | 'label' | 'width' | 'height'>,
  point: MapPoint,
): WorldDelta {
  const location = state.world.locations[locationId];
  if (!location) throw new Error('Место больше не существует в кампании.');
  if (!passport.id.trim() || !Number.isFinite(passport.width) || !Number.isFinite(passport.height) || passport.width <= 0 || passport.height <= 0) {
    throw new Error('Выбранная карта не имеет корректного паспорта.');
  }
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x > passport.width || point.y > passport.height) {
    throw new Error('Точка выходит за границы выбранной карты.');
  }
  const geo = { map: passport.id, x: Math.round(point.x), y: Math.round(point.y) };
  if (location.geo?.map === geo.map && location.geo.x === geo.x && location.geo.y === geo.y) throw new Error('Место уже привязано к этой точке карты.');
  if (Object.values(state.deltas).some(delta => delta.status === 'pending' && patchesOf(delta.patch).some(
    patch => patch.kind === 'locationGeo' && patch.id === locationId,
  ))) throw new Error('Геопривязка этого места уже ожидает решения во «Входящих».');

  const idPrefix = `d-georef-${locationId}`;
  let id = idPrefix;
  for (let index = 2; state.deltas[id]; index++) id = `${idPrefix}-${index}`;
  const before = location.geo ? `${location.geo.map} (${location.geo.x}, ${location.geo.y})` : 'нет точки на карте';
  return {
    id,
    scale: location.scale,
    subject: `Геопривязка · ${location.name}`,
    was: before,
    now: `${passport.label} · пиксель исходной карты (${geo.x}, ${geo.y})`,
    cause: 'Мастер отметил место на карте; принятая запись кампании получает координаты исходного растра.',
    causeId: location.id,
    status: 'pending',
    patch: { kind: 'locationGeo', id: location.id, geo },
  };
}

