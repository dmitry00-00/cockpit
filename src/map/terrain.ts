// Местность карты мира (TASKS M9): класс на клетку растра — из scripts/terrain-from-map.py (цвет и фактура растра,
// имена кластеров подсказал покров Toril GIS). Нужна походу: SRD Difficult Terrain — «dense forests, deep swamps,
// rubble-filled ruins, steep mountains, and ice-covered ground… You move at half speed». Линейка и поход считают,
// сколько миль пути легло на такие клетки. Сетка не событие и не состояние — данные карты, как тайлы.
import type { MapPassport, MapPoint } from './projection';

/** Коды клеток: порядок — как CODES в scripts/terrain-from-map.py (значение пикселя = код × 25). */
export const TERRAIN_CODES = ['o', 'g', 'h', 'f', 'm', 's', 'd', 'i', 'u'] as const;
export type TerrainCode = (typeof TERRAIN_CODES)[number];

export const TERRAIN_NAMES: Readonly<Record<TerrainCode, string>> = {
  o: 'вода', g: 'равнина', h: 'холмы', f: 'лес', m: 'горы', s: 'болото', d: 'пустыня', i: 'лёд', u: 'не нанесено',
};

/** Трудная местность по SRD: лес, болото, горы, лёд. Холмы, пустыня и равнина — обычный темп. */
export const DIFFICULT: ReadonlySet<TerrainCode> = new Set<TerrainCode>(['f', 's', 'm', 'i']);

export interface TerrainGrid {
  w: number;
  h: number;
  /** Пикселей исходника в клетке. */
  cell: number;
  /** Код клетки (индекс в TERRAIN_CODES) построчно. */
  data: Uint8Array;
}

export function terrainAt(grid: TerrainGrid, p: MapPoint): TerrainCode | undefined {
  const cx = Math.floor(p.x / grid.cell);
  const cy = Math.floor(p.y / grid.cell);
  if (cx < 0 || cy < 0 || cx >= grid.w || cy >= grid.h) return undefined;
  return TERRAIN_CODES[grid.data[cy * grid.w + cx]];
}

export interface RouteTerrain {
  /** Мили пути по каждому классу, по которому он прошёл (без дорог и поселений). */
  miles: Partial<Record<TerrainCode, number>>;
  /** Мили по трудной местности — сумма лес + болото + горы + лёд. */
  difficult: number;
  /** Мили по дорогам растра (ROADMAP 6.3) — не трудная местность, как бы ни шла дорога. */
  road: number;
  /** Мили по поселениям: ключ — что дал значок (регион A5E), мили. */
  settled: Partial<Record<string, number>>;
}

/** Дороги растра (scripts/roads-from-map.py → roads.png рядом с тайлами): 1 — в клетке пунктир дороги. */
export type RoadGrid = TerrainGrid;

/** Поселение на пути: круг r px исходника вокруг значка; внутри путь идёт регионом region. */
export interface SettlementMark extends MapPoint {
  r: number;
  region: string;
}

/** Что лежит поверх местности: дороги и поселения. Нет — путь только по клеткам, как до 6.3. */
export interface RouteOverlay {
  roads?: RoadGrid | null;
  settlements?: readonly SettlementMark[];
}

/**
 * Допуск «по дороге», px исходника (≈ 3,7 мили при 0,37): мастер ведёт путь щелчками вдоль дороги, а ломаная между
 * щелчками срезает изгибы пунктира. Решение кокпита, не правило.
 */
export const ROAD_TOLERANCE_PX = 10;
/** Отрезок, у которого по дороге больше этой доли шагов, — весь по дороге: дорога петляет, путь мастера прямой. */
export const ROAD_SEGMENT_SHARE = 0.6;

export function nearRoad(roads: RoadGrid, p: MapPoint, tol = ROAD_TOLERANCE_PX): boolean {
  const r = Math.ceil(tol / roads.cell);
  const cx = Math.floor(p.x / roads.cell);
  const cy = Math.floor(p.y / roads.cell);
  for (let y = Math.max(0, cy - r); y <= Math.min(roads.h - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(roads.w - 1, cx + r); x++) {
      if (roads.data[y * roads.w + x] && Math.hypot((x + 0.5) * roads.cell - p.x, (y + 0.5) * roads.cell - p.y) <= tol + roads.cell / 2) return true;
    }
  }
  return false;
}

/**
 * Путь по клеткам: ломаная режется на шаги в полклетки, каждый шаг — в класс клетки под его серединой. Мили — по
 * калибровке паспорта. Вода на пути считается как есть: переправу мастер решает сам. Поверх местности (overlay):
 * шаг в круге поселения — регион поселения, у дороги — дорога; отрезок, почти весь лежащий у дороги, — дорога целиком.
 */
export function routeTerrain(grid: TerrainGrid, passport: MapPassport, points: readonly MapPoint[], overlay: RouteOverlay = {}): RouteTerrain {
  const px: Partial<Record<TerrainCode, number>> = {};
  const settledPx: Record<string, number> = {};
  let roadPx = 0;
  const { roads, settlements = [] } = overlay;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / (grid.cell / 2)));
    const open: TerrainCode[] = [];
    let onRoad = 0;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const town = settlements.find(s => Math.hypot(s.x - p.x, s.y - p.y) <= s.r);
      if (town) {
        settledPx[town.region] = (settledPx[town.region] ?? 0) + len / n;
        continue;
      }
      const c = terrainAt(grid, p);
      if (roads && nearRoad(roads, p)) onRoad++;
      else if (c) open.push(c);
    }
    const step = len / n;
    if (onRoad && onRoad >= ROAD_SEGMENT_SHARE * (onRoad + open.length)) {
      roadPx += (onRoad + open.length) * step;
      continue;
    }
    roadPx += onRoad * step;
    for (const c of open) px[c] = (px[c] ?? 0) + step;
  }
  const miles: Partial<Record<TerrainCode, number>> = {};
  let difficult = 0;
  for (const code of TERRAIN_CODES) {
    const v = px[code];
    if (v === undefined) continue;
    miles[code] = v * passport.milesPerPixel;
    if (DIFFICULT.has(code)) difficult += miles[code]!;
  }
  const settled = Object.fromEntries(Object.entries(settledPx).map(([k, v]) => [k, v * passport.milesPerPixel]));
  return { miles, difficult, road: roadPx * passport.milesPerPixel, settled };
}

/** «лес 20, горы 12» — трудные классы пути по убыванию миль. */
export function difficultLabel(rt: RouteTerrain): string {
  return TERRAIN_CODES.filter(c => DIFFICULT.has(c) && (rt.miles[c] ?? 0) >= 0.5)
    .sort((a, b) => (rt.miles[b] ?? 0) - (rt.miles[a] ?? 0))
    .map(c => `${TERRAIN_NAMES[c]} ${Math.round(rt.miles[c]!)}`)
    .join(', ');
}

/**
 * Сетка из серой картинки (terrain.png рядом с тайлами): значение пикселя = код × 25. В браузере — через canvas;
 * где canvas не рисует (jsdom) или картинки нет — null, и поход работает по галочке мастера, как раньше.
 */
export async function loadTerrain(url: string, cell: number): Promise<TerrainGrid | null> {
  return loadGreyGrid(url, cell, v => Math.min(TERRAIN_CODES.length - 1, Math.round(v / 25)));
}

/** Дороги: серая картинка, 255 — дорога. Как у местности: нет canvas или картинки — null, путь без дорог. */
export async function loadRoads(url: string, cell: number): Promise<RoadGrid | null> {
  return loadGreyGrid(url, cell, v => (v >= 128 ? 1 : 0));
}

/** Серая картинка карты → сетка: значение клетки — of(яркость пикселя). */
async function loadGreyGrid(url: string, cell: number, of: (v: number) => number): Promise<TerrainGrid | null> {
  if (typeof Image === 'undefined' || typeof document === 'undefined') return null;
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || !canvas.width) return null;
    ctx.drawImage(img, 0, 0);
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const data = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < data.length; i++) data[i] = of(rgba[i * 4]);
    return { w: canvas.width, h: canvas.height, cell, data };
  } catch {
    return null;
  }
}
