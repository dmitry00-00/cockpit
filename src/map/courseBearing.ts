import type { MapPoint } from './projection';

export const COMPASS_DIRECTIONS = ['север', 'северо-восток', 'восток', 'юго-восток', 'юг', 'юго-запад', 'запад', 'северо-запад'] as const;

export interface CourseBearing {
  /** Clockwise degrees from map north, rounded to the nearest degree. */
  degrees: number;
  direction: typeof COMPASS_DIRECTIONS[number];
}

/** Direct bearing on a north-up raster map; this is not a road route or a geodesic calculation. */
export function courseBearing(from: MapPoint, to: MapPoint): CourseBearing | null {
  const east = to.x - from.x;
  const north = from.y - to.y; // Raster coordinates grow downward.
  if (east === 0 && north === 0) return null;
  const degrees = (Math.round((Math.atan2(east, north) * 180 / Math.PI + 360) % 360)) % 360;
  const index = Math.round(degrees / 45) % COMPASS_DIRECTIONS.length;
  return { degrees, direction: COMPASS_DIRECTIONS[index] };
}
