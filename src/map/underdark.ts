// Подземье карты мира (ROADMAP 6.3): владения, бездны и сети пещер Toril GIS в пикселях растра
// (scripts/underdark-from-gis.py). На растре Подземья нет, поэтому это подсказка мастеру: под какими владениями лежит
// путь «под землёй». Привязка GIS к растру ошибается на десятки пикселей (медиана — в файле), владения — сотни.
// Данные карты, как справочник мест: отдельный кусок, грузится при первой карте.
import type { MapPoint } from './projection';
import { loadPackageJson, packageHasLayer, settingPackageForMap } from '../packages/registry';

export interface UnderdarkRegion {
  id: string;
  name: string;
  nameRu?: string | null;
  /** Класс GIS: Domain, Abyss, Cavern Network, Fungal Forest, Subregion. */
  kind: string;
  /** Внешние кольца [x0, y0, x1, y1, …] в пикселях исходника. */
  rings: readonly (readonly number[])[];
  featureLevels?: readonly UnderdarkLevelId[];
  source?: UnderdarkSource;
  sourceRecordUrl?: string | null;
}

export type UnderdarkLevelId = 'Upperdark' | 'Middledark' | 'Lowerdark';

export interface UnderdarkSource {
  id: string;
  title: string;
  edition: string | null;
  url: string | null;
}

export interface UnderdarkLevel {
  id: UnderdarkLevelId;
  nameRu: string;
  order: number;
  minDepthMiles: number;
  maxDepthMiles: number | null;
  sourceTitle: string;
  sourcePages: string;
}

export interface UnderdarkSite {
  id: string;
  name: string;
  nameRu?: string | null;
  kind: string;
  layer: string;
  featureLevels: readonly UnderdarkLevelId[];
  x: number;
  y: number;
  source: UnderdarkSource;
  sourceRecordUrl?: string | null;
}

export interface UnderdarkConnectionSource {
  title: string;
  edition: string;
  page?: string;
  pages?: string;
  url: string;
  verification?: 'primary-verified' | 'secondary-citation-only';
}

export interface UnderdarkConnectionLevelContext {
  place: string;
  featureLevels: readonly UnderdarkLevelId[];
  sourceRecordUrl?: string;
  basis: string;
}

export interface UnderdarkConnection {
  id: string;
  kind: string;
  status: 'confirmed-text-unmapped' | 'confirmed-network-endpoints-unknown';
  from: string;
  to: string;
  via: string;
  /** Only levels that the source explicitly assigns to the route itself. */
  routeLevels: readonly UnderdarkLevelId[];
  /** A source-confirmed connection to the surface; this does not reveal the underground depth. */
  surfaceAccess: boolean;
  /** GIS level membership of nearby named regions or sites; not route depth. */
  levelContext: readonly UnderdarkConnectionLevelContext[];
  geometry: null;
  evidence: string;
  sources: readonly UnderdarkConnectionSource[];
}

export interface UnderdarkAtlas {
  map: string;
  source: string;
  attribution: string;
  error: string;
  schemaVersion: number;
  coordinateSystem: {
    id: string;
    width: number;
    height: number;
    sourceCrs: string;
    transform: string;
    controlPoints: number;
    leaveOneOutSample: number;
    medianErrorPx: number;
    p90ErrorPx: number;
    meaning: string;
  };
  provenance: {
    dataset: string;
    featureLevelMeaning: string;
    positionMeaning: string;
    confidence: string;
    limitations: readonly string[];
  };
  levels: readonly UnderdarkLevel[];
  regions: readonly UnderdarkRegionRecord[];
  sites: readonly UnderdarkSite[];
  connections: readonly UnderdarkConnection[];
}

export interface UnderdarkRegionRecord extends Omit<UnderdarkRegion, 'kind'> {
  kind?: string;
  class?: string;
}
interface UnderdarkFile { regions: readonly UnderdarkRegionRecord[] }

const cache = new Map<string, Promise<UnderdarkRegion[]>>();
const atlasCache = new Map<string, Promise<UnderdarkAtlas | null>>();

const LEVEL_IDS: readonly UnderdarkLevelId[] = ['Upperdark', 'Middledark', 'Lowerdark'];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string';
const isLevelId = (value: unknown): value is UnderdarkLevelId => LEVEL_IDS.includes(value as UnderdarkLevelId);
const isLevelIds = (value: unknown): value is UnderdarkLevelId[] =>
  Array.isArray(value) && value.length > 0 && value.every(isLevelId);
function isAtlasSource(value: unknown): value is UnderdarkSource {
  return isRecord(value) && isText(value.id) && isText(value.title)
    && (value.edition === null || isText(value.edition))
    && (value.url === null || isText(value.url));
}
function isAtlasShape(value: unknown): value is UnderdarkAtlas {
  if (!isRecord(value) || value.schemaVersion !== 2 || !isText(value.map) || !isText(value.source)
    || !isText(value.attribution) || !isText(value.error)) return false;
  if (!Array.isArray(value.levels) || value.levels.length !== LEVEL_IDS.length || !Array.isArray(value.regions)
    || !Array.isArray(value.sites) || !Array.isArray(value.connections)) return false;
  if (!value.levels.every((level, index) => isRecord(level) && level.id === LEVEL_IDS[index]
    && isText(level.nameRu) && level.order === index + 1 && Number.isFinite(level.minDepthMiles)
    && (level.maxDepthMiles === null || Number.isFinite(level.maxDepthMiles))
    && isText(level.sourceTitle) && isText(level.sourcePages))) return false;
  if (!isRecord(value.coordinateSystem) || !isText(value.coordinateSystem.id)
    || !Number.isFinite(value.coordinateSystem.width) || !Number.isFinite(value.coordinateSystem.height)
    || !isText(value.coordinateSystem.sourceCrs) || !isText(value.coordinateSystem.transform)
    || !Number.isFinite(value.coordinateSystem.controlPoints) || !Number.isFinite(value.coordinateSystem.leaveOneOutSample)
    || !Number.isFinite(value.coordinateSystem.medianErrorPx) || !Number.isFinite(value.coordinateSystem.p90ErrorPx)
    || !isText(value.coordinateSystem.meaning)) return false;
  if (!isRecord(value.provenance) || !isText(value.provenance.dataset)
    || !isText(value.provenance.featureLevelMeaning) || !isText(value.provenance.positionMeaning)
    || !isText(value.provenance.confidence) || !Array.isArray(value.provenance.limitations)
    || !value.provenance.limitations.every(isText)) return false;
  if (!value.regions.every(region => isRecord(region) && isText(region.id) && isText(region.name)
    && isLevelIds(region.featureLevels) && Array.isArray(region.rings)
    && region.rings.every(ring => Array.isArray(ring) && ring.length >= 6 && ring.length % 2 === 0 && ring.every(Number.isFinite))
    && isAtlasSource(region.source))) return false;
  if (!value.sites.every(site => isRecord(site) && isText(site.id) && isText(site.name) && isText(site.kind)
    && isText(site.layer) && isLevelIds(site.featureLevels) && Number.isFinite(site.x) && Number.isFinite(site.y)
    && isAtlasSource(site.source))) return false;
  return value.connections.every(connection => isRecord(connection) && isText(connection.id) && isText(connection.kind)
    && (connection.status === 'confirmed-text-unmapped' || connection.status === 'confirmed-network-endpoints-unknown')
    && isText(connection.from) && isText(connection.to) && isText(connection.via)
    && Array.isArray(connection.routeLevels) && connection.routeLevels.every(isLevelId)
    && typeof connection.surfaceAccess === 'boolean' && connection.geometry === null
    && Array.isArray(connection.levelContext) && connection.levelContext.every(context => isRecord(context)
      && isText(context.place) && isLevelIds(context.featureLevels) && isText(context.basis))
    && isText(connection.evidence) && Array.isArray(connection.sources) && connection.sources.length > 0
    && connection.sources.every(source => isRecord(source) && isText(source.title) && isText(source.edition)
      && isText(source.url) && (source.page === undefined || isText(source.page))
      && (source.pages === undefined || isText(source.pages))
      && (source.verification === undefined || source.verification === 'primary-verified' || source.verification === 'secondary-citation-only')));
}

export function loadUnderdarkAtlas(mapId: string): Promise<UnderdarkAtlas | null> {
  if (!atlasCache.has(mapId)) {
    const pkg = settingPackageForMap(mapId);
    const path = `content/maps/${mapId}-underdark.json`;
    if (!pkg || !packageHasLayer(pkg.id, path)) return Promise.resolve(null);
    atlasCache.set(mapId, loadPackageJson(pkg.id, path).then(raw => {
      return isAtlasShape(raw) && raw.map === mapId ? raw : null;
    }));
  }
  return atlasCache.get(mapId)!;
}

export function loadUnderdark(mapId: string): Promise<UnderdarkRegion[]> {
  if (!cache.has(mapId)) {
    cache.set(mapId, loadUnderdarkAtlas(mapId).then(atlas => {
      // Keep the surface-route hint limited to broad areas; the dedicated atlas also includes waterbody polygons.
      if (atlas) return atlas.regions.filter(r => (r.kind ?? r.class) !== 'Lake').map(r => ({ ...r, kind: r.kind ?? r.class ?? 'Domain' }));
      // Preserve compatibility with legacy packages that only contain region polygons.
      const pkg = settingPackageForMap(mapId);
      const path = `content/maps/${mapId}-underdark.json`;
      if (!pkg || !packageHasLayer(pkg.id, path)) return [];
      return loadPackageJson(pkg.id, path).then(raw => (raw as UnderdarkFile).regions.map(r => ({
        ...r,
        kind: r.kind ?? r.class ?? 'Domain',
      })));
    }));
  }
  return cache.get(mapId)!;
}

/** Точка внутри кольца — чётность пересечений луча вправо. */
function inRing(ring: readonly number[], p: MapPoint): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [ring[i], ring[i + 1], ring[j], ring[j + 1]];
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Области Подземья под путём — в порядке, в каком путь в них входит; шаг проверки — step px исходника. */
export function underdarkAlong(regions: readonly UnderdarkRegion[], points: readonly MapPoint[], step = 16): UnderdarkRegion[] {
  const seen = new Set<string>();
  const out: UnderdarkRegion[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 0; k <= n; k++) {
      const p = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
      for (const r of regions) {
        if (!seen.has(r.id) && r.rings.some(ring => inRing(ring, p))) {
          seen.add(r.id);
          out.push(r);
        }
      }
    }
  }
  return out;
}
