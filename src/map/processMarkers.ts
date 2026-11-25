import type { State } from '../engine/state';

export interface ProcessMapMarker {
  locationId: string;
  locationName: string;
  x: number;
  y: number;
  labels: readonly string[];
}

/** Active, accepted processes anchored to locations with coordinates on this map; never use for player projections. */
export function processMarkersFromState(state: State, mapId: string, dmView: boolean): readonly ProcessMapMarker[] {
  if (!dmView || !mapId) return [];
  const grouped = new Map<string, ProcessMapMarker>();
  for (const process of Object.values(state.world.processes ?? {})) {
    if (process.ended || process.startedSec > state.time.sec || !process.at) continue;
    const location = state.world.locations[process.at];
    const geo = location?.geo;
    if (!location || !geo || geo.map !== mapId || !Number.isFinite(geo.x) || !Number.isFinite(geo.y)) continue;
    const marker = grouped.get(location.id);
    if (marker) grouped.set(location.id, { ...marker, labels: [...marker.labels, process.name] });
    else grouped.set(location.id, { locationId: location.id, locationName: location.name, x: geo.x, y: geo.y, labels: [process.name] });
  }
  return [...grouped.values()]
    .map(marker => ({ ...marker, labels: [...marker.labels].sort((a, b) => a.localeCompare(b, 'en')) }))
    .sort((a, b) => a.locationName.localeCompare(b.locationName, 'en') || a.locationId.localeCompare(b.locationId));
}
