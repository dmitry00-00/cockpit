// Глобус уровня планеты по карте мира (§10): маска планеты, солнце по месту партии и метки мест — из пикселей
// плоской карты; колесо за предел глобуса — точка и масштаб плоской карты (M16). Последние шаги колеса — векторная
// схема плоской карты на диске (M16), когда она есть. Отдельным куском (ROADMAP 0.5, lazyParts): маска нужна только
// уровню планеты, основному куску — нет.
import { useMemo, type ReactNode } from 'react';
import { Globe, type GlobeMarker, type GlobeProps, type GlobeVector } from './Globe';
import { PLANET_MASKS, lonLatToMap, mapScaleForGlobe, mapToLonLat, subsolarLon } from './planet';
import type { MapPassport, MapPoint } from './projection';
import type { MapSchema } from './schema';
import { visibleBands } from './globeSchema';

export interface PlanetGlobeProps {
  passport: MapPassport;
  /** Места кампании точками плоской карты. */
  points: readonly (Omit<GlobeMarker, 'lon' | 'lat'> & MapPoint)[];
  party?: MapPoint;
  /** Время кампании — солнце над партией в полдень. */
  sec: number;
  onPick?: GlobeProps['onPick'];
  /** Возврат с плоской карты отдалением (M16): точка карты, что встанет в центр глобуса. */
  focusAt?: MapPoint;
  /** Колесо дальше предела глобуса — точка карты под центром и масштаб плоской карты, равный глобусу (M16). */
  onZoomIn?: (at: { point: MapPoint; scale: number }) => void;
  /** Векторная схема плоской карты (M16): на последних шагах колеса глобус рисует её. */
  schema?: MapSchema | null;
  tools?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function PlanetGlobe({ passport, points, party, sec, onPick, focusAt, onZoomIn, schema, tools, children, className }: PlanetGlobeProps) {
  const mask = PLANET_MASKS[passport.id];
  const vector = useMemo((): GlobeVector | undefined => {
    if (!mask || !schema) return undefined;
    const [lon0, lon1, latTop, latBot] = mask.source.extent;
    const inLon = (lon: number) => {
      const d = (((lon - lon0) % 360) + 360) % 360;
      return d <= lon1 - lon0;
    };
    return {
      schema,
      mapId: passport.id,
      toLonLat: p => mapToLonLat(mask, passport, p),
      toMap: ll => lonLatToMap(mask, passport, ll),
      size: passport,
      covers: (lon, lat) => inLon(lon) && lat <= latTop && lat >= latBot,
      scaleAt: (r, lat) => mapScaleForGlobe(mask, passport, r, lat),
      bands: rot => visibleBands(rot, { lon0, lon1, width: passport.width }),
    };
  }, [mask, schema, passport]);
  if (!mask) return null;
  const lonLat = (pt: MapPoint) => mapToLonLat(mask, passport, pt);
  const at = party ? lonLat(party) : undefined;
  return (
    <Globe
      mask={mask}
      rot={at?.lon ?? 0}
      sun={subsolarLon(at?.lon ?? 0, sec)}
      markers={[
        ...points.map(({ x, y, ...p }) => ({ ...p, ...lonLat({ x, y }) })),
        ...(at ? [{ id: 'party', label: 'Партия', type: 'pc' as const, ...at }] : []),
      ]}
      onPick={onPick}
      focus={focusAt ? { ...lonLat(focusAt), zoom: 1 } : undefined}
      onZoomIn={onZoomIn ? at => onZoomIn({ point: lonLatToMap(mask, passport, at), scale: mapScaleForGlobe(mask, passport, at.radiusPx, at.lat) }) : undefined}
      vector={vector}
      tools={tools}
      className={className}
    >
      {children}
    </Globe>
  );
}
