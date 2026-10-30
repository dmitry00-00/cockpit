// Глобус планеты (HANDOFF §3, §10): не картинка, а сетка маски — равнопромежуточная w×h, строка — широта от +90
// к −90, столбец — долгота от 0 к 360, один символ класса местности на клетку. Здесь — чистая математика:
// ортографическая проекция на n×n клеток, освещённая сторона по подсолнечной долготе, попадание щелчком.
// Связь с плоской картой — экстент исходника в маске (`source.extent`): по нему пиксель карты становится
// долготой и широтой, и место с geo встаёт на глобус там же, где стоит на карте.
import toril from '../../design/masks/toril.json';
import { SECONDS_PER_DAY } from '../engine/state';
import type { MapPoint } from './projection';

export type TerrainClass = 'o' | 'i' | 'u' | 'd' | 'g' | 'f' | 'm';

export const TERRAIN_CLASSES: readonly TerrainClass[] = ['o', 'i', 'u', 'd', 'g', 'f', 'm'];

/** Подписи классов — легенда маски (§10). */
export const TERRAIN_LABEL: Readonly<Record<TerrainClass, string>> = {
  o: 'океан', i: 'лёд', u: 'не нанесено на карту', d: 'пустыня и степь', g: 'равнина', f: 'лес', m: 'горы',
};

export interface MaskRegion {
  id: string;
  label: string;
  lon: readonly number[];
  lat: readonly number[];
}

export interface PlanetMask {
  id: string;
  label: string;
  w: number;
  h: number;
  /** Сетка строками сверху вниз; RLE в файле тоже есть, но массив строк читается без декодера. */
  grid: readonly string[];
  /** Рамки континентов: порядок значим — спорная суша отдана первой подходящей (§10). */
  regions: readonly MaskRegion[];
  /** [lon0, lon1, latTop, latBot] — какой прямоугольник в градусах занимает исходник плоской карты. */
  source: { extent: readonly number[] };
}

export const PLANET_MASKS: Readonly<Record<string, PlanetMask>> = { toril };

const wrap = (lon: number) => ((lon % 360) + 360) % 360;
const RAD = Math.PI / 180;

/** Класс клетки маски в точке. */
export function maskCell(m: PlanetMask, lon: number, lat: number): TerrainClass {
  const x = Math.min(m.w - 1, Math.floor((wrap(lon) / 360) * m.w));
  const y = Math.min(m.h - 1, Math.max(0, Math.floor(((90 - lat) / 180) * m.h)));
  return (m.grid[y]?.[x] ?? 'o') as TerrainClass;
}

/** Освещена ли долгота: в пределах 90° от подсолнечной точки. */
export function isLit(lon: number, sun: number): boolean {
  return Math.abs(wrap(lon - sun + 180) - 180) < 90;
}

/** Клетка глобуса n×n (в единицах клеток, центр клетки) → долгота и широта; вне диска — null. */
export function globeToLonLat(n: number, rot: number, px: number, py: number): { lon: number; lat: number } | null {
  const r = n / 2;
  const nx = (px - r) / r;
  const ny = (py - r) / r;
  if (nx * nx + ny * ny > 1) return null;
  const lat = Math.asin(Math.max(-1, Math.min(1, -ny))) / RAD;
  const cl = Math.cos(lat * RAD);
  if (cl < 0.02) return { lon: wrap(rot), lat };
  const t = nx / cl;
  if (t < -1 || t > 1) return null;
  return { lon: wrap(rot + Math.asin(t) / RAD), lat };
}

/** Точка на глобусе в единицах клеток; visible — на видимой полусфере. */
export function lonLatToGlobe(n: number, rot: number, lon: number, lat: number): { x: number; y: number; visible: boolean } {
  const r = n / 2;
  const d = wrap(lon - rot + 180) - 180;
  return { x: r + r * Math.cos(lat * RAD) * Math.sin(d * RAD), y: r - r * Math.sin(lat * RAD), visible: Math.abs(d) < 90 };
}

export interface GlobeCell {
  x: number;
  y: number;
  cls: TerrainClass;
  lit: boolean;
}

/** Клетки диска: класс местности и свет. Около двух тысяч на n = 44 — верхняя граница SVG, поэтому рисует канвас (§9). */
export function globeCells(m: PlanetMask, n: number, rot: number, sun: number): GlobeCell[] {
  const out: GlobeCell[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const ll = globeToLonLat(n, rot, x + 0.5, y + 0.5);
      if (ll) out.push({ x, y, cls: maskCell(m, ll.lon, ll.lat), lit: isLit(ll.lon, sun) });
    }
  }
  return out;
}

/** Что под щелчком: рамка континента (первая подходящая) или класс местности; океан — null. */
export function globeHit(m: PlanetMask, lon: number, lat: number): { id: string; label: string; region: boolean } | null {
  const cls = maskCell(m, lon, lat);
  if (cls === 'o') return null;
  const L = wrap(lon);
  const r = m.regions.find(g => L >= g.lon[0] && L <= g.lon[1] && lat >= g.lat[0] && lat <= g.lat[1]);
  return r ? { id: r.id, label: r.label, region: true } : { id: cls, label: TERRAIN_LABEL[cls], region: false };
}

/** Пиксель исходника плоской карты → долгота и широта по экстенту маски. */
export function mapToLonLat(m: PlanetMask, size: { width: number; height: number }, pt: MapPoint): { lon: number; lat: number } {
  const [lon0, lon1, latTop, latBot] = m.source.extent;
  return { lon: lon0 + (pt.x / size.width) * (lon1 - lon0), lat: latTop - (pt.y / size.height) * (latTop - latBot) };
}

/** Долгота и широта → пиксель исходника плоской карты (обратное mapToLonLat); вне экстента — на его край. */
export function lonLatToMap(m: PlanetMask, size: { width: number; height: number }, ll: { lon: number; lat: number }): MapPoint {
  const [lon0, lon1, latTop, latBot] = m.source.extent;
  // Долгота по кругу: в оборот, где разрыв экстента поделен пополам между краями — точка в разрыве идёт к ближнему краю.
  const from = lon0 - (360 - (lon1 - lon0)) / 2;
  const lon = from + wrap(ll.lon - from);
  const fx = Math.min(1, Math.max(0, (lon - lon0) / (lon1 - lon0)));
  const fy = Math.min(1, Math.max(0, (latTop - ll.lat) / (latTop - latBot)));
  return { x: fx * size.width, y: fy * size.height };
}

/**
 * Масштаб плоской карты (пикселей экрана на пиксель исходника) для перехода глобус → карта без скачка (M16): у точки
 * на широте lat глобус радиуса radiusPx кладёт градус в radiusPx·cos(lat) пикселей по обеим осям (ось без наклона —
 * параллель горизонтальна, меридиан вертикален), а карта — в kx·s по долготе и ky·s по широте (у HandsomeRob kx ≠ ky:
 * 102 и 90 px на градус). Масштаб — среднее геометрическое осей: по долготе карта на √(kx/ky) ≈ 6 % крупнее глобуса,
 * по широте на столько же мельче (решение кокпита). До 30.10 cos(lat) не было: у Waterdeep (54°) карта после перехода
 * была в 1,7 раза крупнее глобуса.
 */
export function mapScaleForGlobe(m: PlanetMask, size: { width: number; height: number }, radiusPx: number, lat = 0): number {
  const [lon0, lon1, latTop, latBot] = m.source.extent;
  const kx = size.width / (lon1 - lon0);
  const ky = size.height / (latTop - latBot);
  return (radiusPx * RAD * Math.cos(Math.max(-89, Math.min(89, lat)) * RAD)) / Math.sqrt(kx * ky);
}

/**
 * Подсолнечная долгота: в полдень по месту партии солнце над её долготой, за час уходит на 15° к западу.
 * Наклон оси и времена года терминатор не гнут — вертикальная граница дня, как в референсе глобуса.
 */
export function subsolarLon(partyLon: number, sec: number): number {
  const hour = (((sec % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY) / 3600;
  return wrap(partyLon - (hour - 12) * 15);
}
