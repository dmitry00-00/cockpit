// Карта мира (HANDOFF §3, §9, §10): математика вида над пирамидой тайлов. Чистые функции без DOM.
// Координаты мира — пиксели исходного растра (у Toril 30600×13400): так места сида стоят там, где их
// видит мастер на этой карте. Вид — центр в пикселях исходника и масштаб «пикселей экрана на пиксель
// исходника». Уровень пирамиды z = maxZoom — исходник целиком, каждый ниже вдвое меньше.

export interface MapPassport {
  id: string;
  label: string;
  width: number;
  height: number;
  tileSize: number;
  maxZoom: number;
  format: string;
  /** Откуда стол берёт тайлы: `${tiles}/${z}/${x}_${y}.${format}`. */
  tiles: string;
  /** Source credit and notes for locally hosted third-party map rasters. */
  attribution?: string;
  sourceUrl?: string;
  timelineUrl?: string;
  note?: string;
  /** Сколько миль в пикселе исходника — калибровка паспорта, не геодезия. */
  milesPerPixel: number;
  /** Сетка местности рядом с тайлами (src/map/terrain.ts): картинка и пикселей исходника в клетке. */
  terrain?: { url: string; cell: number };
  /** Дороги растра рядом с тайлами (scripts/roads-from-map.py): картинка и пикселей исходника в клетке. */
  roads?: { url: string; cell: number };
  /** Векторная схема (TASKS M16, scripts/schema-from-grids.py): регионы местности, береговая линия и дороги — стартовый вид карты. */
  schema?: { url: string };
  /** Граф мира (SIMULATION.md С2, scripts/graph-from-grids.py): поселения и связи для процессов мира. */
  graph?: { url: string };
  /** План места (M10): карта — план города или здания; place — ссылка места справочника (`place:…`), чей это план. */
  plan?: { place: string };
  /** В чём мерить линейку и масштаб: план города — футы; по умолчанию мили. */
  units?: 'feet';
}

/** Точка на карте: пиксели исходника. */
export interface MapPoint {
  x: number;
  y: number;
}

export interface MapBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface MapView {
  x: number;
  y: number;
  scale: number;
}

export interface Viewport {
  w: number;
  h: number;
}

/** Насколько можно приблизить сверх исходника: пиксель карты вдвое крупнее пикселя экрана — дальше растр в кашу. */
export const MAX_OVERZOOM = 2;

/** Размер уровня пирамиды в его пикселях. */
export function levelSize(p: MapPassport, z: number): { w: number; h: number } {
  const k = 2 ** (p.maxZoom - z);
  return { w: Math.ceil(p.width / k), h: Math.ceil(p.height / k) };
}

/** Наименьший масштаб — карта целиком в окне; наибольший — MAX_OVERZOOM. */
export function scaleBounds(p: MapPassport, vp: Viewport): { min: number; max: number } {
  const min = Math.min(vp.w / p.width, vp.h / p.height);
  return { min, max: Math.max(min, MAX_OVERZOOM) };
}

/**
 * Вид в границах: масштаб между min и max, центр не уводит карту с экрана. Если карта по оси уже окна,
 * она стоит посередине; иначе край карты не отходит от края окна.
 */
export function clampView(p: MapPassport, vp: Viewport, v: MapView): MapView {
  const { min, max } = scaleBounds(p, vp);
  const scale = Math.min(max, Math.max(min, v.scale));
  const axis = (c: number, size: number, screen: number) => {
    const half = screen / 2 / scale;
    return half * 2 >= size ? size / 2 : Math.min(size - half, Math.max(half, c));
  };
  return { x: axis(v.x, p.width, vp.w), y: axis(v.y, p.height, vp.h), scale };
}

/**
 * Вид, в который рамка входит целиком с полями pad (пиксели экрана). left — сколько окна слева занято
 * панелями поверх карты: рамка вписывается в остаток справа от них. Широкая рамка (континент) в остаток
 * влезла бы мелко — тогда она крупнее, заходит под панели краем и прижата к правому краю окна.
 */
export function fitBox(p: MapPassport, vp: Viewport, box: MapBox, pad = 24, left = 0): MapView {
  const free = Math.max(1, vp.w - left);
  const bw = Math.max(1, box.x1 - box.x0);
  const bh = Math.max(1, box.y1 - box.y0);
  const fit = (w: number) => Math.max(1e-6, Math.min((w - 2 * pad) / bw, (vp.h - 2 * pad) / bh));
  const beside = fit(free);
  const whole = fit(vp.w);
  const scale = Math.max(beside, whole * 0.6);
  const target = scale === beside ? left + free / 2 : vp.w - pad - (bw * scale) / 2; // где на экране центр рамки
  return clampView(p, vp, { x: (box.x0 + box.x1) / 2 - (target - vp.w / 2) / scale, y: (box.y0 + box.y1) / 2, scale });
}

/** Вся карта. */
export const wholeMap = (p: MapPassport): MapBox => ({ x0: 0, y0: 0, x1: p.width, y1: p.height });

export function toScreen(v: MapView, vp: Viewport, pt: MapPoint): MapPoint {
  return { x: (pt.x - v.x) * v.scale + vp.w / 2, y: (pt.y - v.y) * v.scale + vp.h / 2 };
}

export function toMap(v: MapView, vp: Viewport, pt: MapPoint): MapPoint {
  return { x: (pt.x - vp.w / 2) / v.scale + v.x, y: (pt.y - vp.h / 2) / v.scale + v.y };
}

/** Приближение в factor раз с неподвижной точкой экрана at (курсор под колесом остаётся над тем же местом). */
export function zoomAt(p: MapPassport, vp: Viewport, v: MapView, factor: number, at: MapPoint): MapView {
  const anchor = toMap(v, vp, at);
  const { min, max } = scaleBounds(p, vp);
  const scale = Math.min(max, Math.max(min, v.scale * factor));
  return clampView(p, vp, { x: anchor.x - (at.x - vp.w / 2) / scale, y: anchor.y - (at.y - vp.h / 2) / scale, scale });
}

/** Сдвиг на (dx, dy) пикселей экрана: карта едет за рукой. */
export function panBy(p: MapPassport, vp: Viewport, v: MapView, dx: number, dy: number): MapView {
  return clampView(p, vp, { ...v, x: v.x - dx / v.scale, y: v.y - dy / v.scale });
}

/** Уровень пирамиды для масштаба: самый мелкий, чей пиксель не крупнее пикселя экрана (с учётом dpr). */
export function zoomLevelFor(p: MapPassport, scale: number, dpr = 1): number {
  const z = Math.ceil(p.maxZoom + Math.log2(scale * dpr) - 1e-9);
  return Math.min(p.maxZoom, Math.max(0, z));
}

export interface TileRect {
  key: string;
  z: number;
  url: string;
  /** Прямоугольник на экране, округлённый до целых пикселей, — без щелей между соседями. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Тот же тайл в пикселях исходника — для подложки WebGL2 (M18): там проекция в шейдере, без округления. */
  box: MapBox;
}

/** Тайлы уровня z, которые попадают в окно, с их местом на экране. */
export function tilesAt(p: MapPassport, vp: Viewport, v: MapView, z: number): TileRect[] {
  const k = 2 ** (p.maxZoom - z);
  const { w: lw, h: lh } = levelSize(p, z);
  const span = p.tileSize * k;
  const tl = toMap(v, vp, { x: 0, y: 0 });
  const br = toMap(v, vp, { x: vp.w, y: vp.h });
  const cx0 = Math.max(0, Math.floor(tl.x / span));
  const cy0 = Math.max(0, Math.floor(tl.y / span));
  const cx1 = Math.min(Math.ceil(lw / p.tileSize) - 1, Math.floor(br.x / span));
  const cy1 = Math.min(Math.ceil(lh / p.tileSize) - 1, Math.floor(br.y / span));
  const out: TileRect[] = [];
  for (let ty = cy0; ty <= cy1; ty++) {
    for (let tx = cx0; tx <= cx1; tx++) {
      const box = { x0: tx * span, y0: ty * span, x1: Math.min(p.width, (tx + 1) * span), y1: Math.min(p.height, (ty + 1) * span) };
      const a = toScreen(v, vp, { x: box.x0, y: box.y0 });
      const b = toScreen(v, vp, { x: box.x1, y: box.y1 });
      const left = Math.round(a.x);
      const top = Math.round(a.y);
      out.push({ key: `${z}/${tx}_${ty}`, z, url: `${p.tiles}/${z}/${tx}_${ty}.${p.format}`, left, top, width: Math.round(b.x) - left, height: Math.round(b.y) - top, box });
    }
  }
  return out;
}

/** Мили между точками карты по калибровке паспорта. */
export function milesBetween(p: MapPassport, a: MapPoint, b: MapPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y) * p.milesPerPixel;
}

/** Длина ломаной в милях. */
export function pathMiles(p: MapPassport, pts: readonly MapPoint[]): number {
  let sum = 0;
  for (let i = 1; i < pts.length; i++) sum += milesBetween(p, pts[i - 1], pts[i]);
  return sum;
}

/** Длина масштабной линейки: круглое число миль (1, 2, 5 × 10ⁿ), которое на экране не длиннее maxPx. */
export function scaleBar(p: MapPassport, scale: number, maxPx = 120): { miles: number; px: number } {
  // План города (M10) меряется в футах: круглое число — в футах, отдаём его милями.
  const per = p.units === 'feet' ? FEET_PER_MILE : 1;
  const unitsPerScreenPx = (p.milesPerPixel * per) / scale;
  const limit = maxPx * unitsPerScreenPx;
  const pow = 10 ** Math.floor(Math.log10(limit));
  const value = [5, 2, 1].map(m => m * pow).find(m => m <= limit) ?? pow;
  return { miles: value / per, px: Math.round(value / unitsPerScreenPx) };
}

/** SRD: «1 mile = 5,280 feet» — миля в футах. */
export const FEET_PER_MILE = 5280;

/**
 * Центры гексов (остриём вверх) с шагом hexMiles, попадающие в окно. Сетка привязана к пикселю (0, 0)
 * исходника, поэтому гекс места не меняется при сдвиге и приближении. radius — от центра до вершины в
 * пикселях экрана.
 */
export function hexCenters(p: MapPassport, vp: Viewport, v: MapView, hexMiles: number): { radius: number; centers: MapPoint[] } {
  const r = hexMiles / p.milesPerPixel / Math.sqrt(3); // радиус в пикселях исходника: ширина гекса = √3·r = шаг
  const dx = Math.sqrt(3) * r;
  const dy = 1.5 * r;
  const tl = toMap(v, vp, { x: 0, y: 0 });
  const br = toMap(v, vp, { x: vp.w, y: vp.h });
  const row0 = Math.max(0, Math.floor(tl.y / dy) - 1);
  const row1 = Math.min(Math.ceil(p.height / dy), Math.ceil(br.y / dy) + 1);
  const centers: MapPoint[] = [];
  for (let row = row0; row <= row1; row++) {
    const off = row % 2 ? dx / 2 : 0;
    const col0 = Math.max(0, Math.floor((tl.x - off) / dx) - 1);
    const col1 = Math.min(Math.ceil(p.width / dx), Math.ceil((br.x - off) / dx) + 1);
    for (let col = col0; col <= col1; col++) centers.push(toScreen(v, vp, { x: col * dx + off, y: row * dy }));
  }
  return { radius: r * v.scale, centers };
}
