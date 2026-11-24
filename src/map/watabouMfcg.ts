/** Reader for the GeoJSON-like export produced by Watabou MFCG.
 * Coordinates are deliberately preserved in generator units: MFCG exports do not
 * declare a CRS or physical unit, so this module never converts them to feet.
 */

export type MfcgPoint = readonly [number, number];
export type MfcgGeometry =
  | { type: 'Point'; coordinates: MfcgPoint }
  | { type: 'LineString'; coordinates: readonly MfcgPoint[]; width?: number }
  | { type: 'Polygon'; coordinates: readonly (readonly MfcgPoint[])[]; width?: number };

export interface MfcgLayer {
  id: string;
  geometries: readonly MfcgGeometry[];
}

export interface WatabouMfcgCity {
  format: 'mfcg-feature-collection';
  version: string;
  coordinateUnit: 'generator-unit';
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  layers: readonly MfcgLayer[];
  districtNames: readonly string[];
}

const MAX_JSON_CHARS = 2_000_000;
const MAX_FEATURES = 64;
const MAX_GEOMETRIES = 20_000;
const MAX_POINTS = 100_000;
const MAX_ABS_COORDINATE = 100_000;
const VALID_LAYER = /^(values|earth|roads|walls|rivers|planks|buildings|prisms|squares|greens|fields|trees|districts|water)$/;

type RawObject = Record<string, unknown>;

function object(value: unknown, label: string): RawObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}: expected object`);
  return value as RawObject;
}

function point(value: unknown, label: string, state: { count: number }, bounds: number[]): MfcgPoint {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(item => typeof item === 'number' && Number.isFinite(item))) {
    throw new Error(`${label}: invalid 2D coordinate`);
  }
  const [x, y] = value as number[];
  if (Math.abs(x) > MAX_ABS_COORDINATE || Math.abs(y) > MAX_ABS_COORDINATE) throw new Error(`${label}: coordinate outside supported range`);
  state.count++;
  if (state.count > MAX_POINTS) throw new Error('MFCG export exceeds point limit');
  bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
  bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
  return [x, y];
}

function line(value: unknown, label: string, state: { count: number }, bounds: number[]): MfcgPoint[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_POINTS) throw new Error(`${label}: invalid line`);
  return value.map((item, index) => point(item, `${label}[${index}]`, state, bounds));
}

function polygonRings(value: unknown, label: string, state: { count: number }, bounds: number[]): MfcgPoint[][] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) throw new Error(`${label}: invalid polygon rings`);
  return value.map((ring, index) => {
    const result = line(ring, `${label}[${index}]`, state, bounds);
    const first = result[0]; const last = result[result.length - 1];
    // MFCG labels its export GeoJSON-like, but omits the repeated final vertex
    // on some polygon rings. Polygon semantics imply closure, so normalize it.
    if (first[0] !== last[0] || first[1] !== last[1]) result.push(first);
    let area = 0;
    for (let i = 1; i < result.length; i++) area += result[i - 1][0] * result[i][1] - result[i][0] * result[i - 1][1];
    if (Math.abs(area) < 1e-8) throw new Error(`${label}[${index}]: zero-area ring`);
    return result;
  });
}

function optionalWidth(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 10_000) throw new Error(`${label}: invalid width`);
  return value;
}

function flattenGeometry(value: unknown, label: string, state: { count: number; geometries: number }, bounds: number[], into: MfcgGeometry[], inheritedWidth?: number): void {
  const raw = object(value, label);
  const type = raw.type;
  if (type === 'GeometryCollection') {
    if (!Array.isArray(raw.geometries) || raw.geometries.length > MAX_GEOMETRIES) throw new Error(`${label}: invalid geometry collection`);
    raw.geometries.forEach((item, index) => flattenGeometry(item, `${label}.geometries[${index}]`, state, bounds, into, inheritedWidth));
    return;
  }
  const width = optionalWidth(raw.width, `${label}.width`) ?? inheritedWidth;
  const coordinates = raw.coordinates;
  const add = (geometry: MfcgGeometry) => {
    state.geometries++;
    if (state.geometries > MAX_GEOMETRIES) throw new Error('MFCG export exceeds geometry limit');
    into.push(geometry);
  };
  switch (type) {
    case 'Point': add({ type, coordinates: point(coordinates, `${label}.coordinates`, state, bounds) }); break;
    case 'MultiPoint':
      if (!Array.isArray(coordinates)) throw new Error(`${label}: invalid multipoint`);
      coordinates.forEach((item, index) => add({ type: 'Point', coordinates: point(item, `${label}.coordinates[${index}]`, state, bounds) }));
      break;
    case 'LineString': add({ type, coordinates: line(coordinates, `${label}.coordinates`, state, bounds), ...(width ? { width } : {}) }); break;
    case 'MultiLineString':
      if (!Array.isArray(coordinates)) throw new Error(`${label}: invalid multiline`);
      coordinates.forEach((item, index) => add({ type: 'LineString', coordinates: line(item, `${label}.coordinates[${index}]`, state, bounds), ...(width ? { width } : {}) }));
      break;
    case 'Polygon': add({ type, coordinates: polygonRings(coordinates, `${label}.coordinates`, state, bounds), ...(width ? { width } : {}) }); break;
    case 'MultiPolygon':
      if (!Array.isArray(coordinates)) throw new Error(`${label}: invalid multipolygon`);
      coordinates.forEach((item, index) => add({ type: 'Polygon', coordinates: polygonRings(item, `${label}.coordinates[${index}]`, state, bounds), ...(width ? { width } : {}) }));
      break;
    default: throw new Error(`${label}: unsupported geometry type`);
  }
}

/** Parse an MFCG JSON export without assigning a map projection or physical scale. */
export function parseWatabouMfcgCity(value: unknown): WatabouMfcgCity {
  let parsed = value;
  if (typeof value === 'string') {
    if (value.length > MAX_JSON_CHARS) throw new Error('MFCG export exceeds size limit');
    try { parsed = JSON.parse(value) as unknown; } catch { throw new Error('MFCG export is not valid JSON'); }
  }
  const root = object(parsed, 'MFCG export');
  if (JSON.stringify(root).length > MAX_JSON_CHARS) throw new Error('MFCG export exceeds size limit');
  if (root.type !== 'FeatureCollection' || !Array.isArray(root.features) || root.features.length < 2 || root.features.length > MAX_FEATURES) {
    throw new Error('unsupported MFCG export: expected FeatureCollection');
  }
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const state = { count: 0, geometries: 0 };
  const layers: MfcgLayer[] = [];
  const districts: string[] = [];
  let version: string | null = null;
  const seen = new Set<string>();
  for (const [index, item] of root.features.entries()) {
    const raw = object(item, `features[${index}]`);
    if (raw.type === 'Feature' && raw.id === 'values') {
      if (raw.generator !== 'mfcg' || typeof raw.version !== 'string' || raw.version.length > 64) throw new Error('unsupported MFCG generator metadata');
      version = raw.version;
      continue;
    }
    if (typeof raw.id !== 'string' || !VALID_LAYER.test(raw.id) || raw.id === 'values' || seen.has(raw.id)) throw new Error(`features[${index}]: unsupported or duplicate MFCG layer`);
    seen.add(raw.id);
    const geometries: MfcgGeometry[] = [];
    const sourceGeometry = raw.type === 'Feature' ? raw.geometry : raw;
    if (sourceGeometry !== undefined && sourceGeometry !== null) flattenGeometry(sourceGeometry, `features[${index}]`, state, bounds, geometries);
    if (raw.id === 'districts') {
      const names = Array.isArray(raw.geometries) ? raw.geometries.map((part, partIndex) => {
        const name = object(part, `districts[${partIndex}]`).name;
        if (typeof name !== 'string' || name.length > 256) throw new Error(`districts[${partIndex}]: invalid name`);
        return name;
      }) : [];
      districts.push(...names);
    }
    layers.push({ id: raw.id, geometries });
  }
  if (version === null) throw new Error('MFCG version metadata is missing');
  if (!Number.isFinite(bounds[0]) || !Number.isFinite(bounds[1]) || !Number.isFinite(bounds[2]) || !Number.isFinite(bounds[3])) throw new Error('MFCG export contains no geometry');
  return {
    format: 'mfcg-feature-collection', version, coordinateUnit: 'generator-unit',
    bounds: { minX: bounds[0], minY: bounds[1], maxX: bounds[2], maxY: bounds[3] },
    layers, districtNames: districts,
  };
}
