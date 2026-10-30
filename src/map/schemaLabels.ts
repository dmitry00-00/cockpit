// Подписи схемы карты (TASKS M16): державы, области, моря, природные области и места — прямо на схеме, с отбором по
// масштабу и значимости, как у Google Maps: на континенте — континенты, моря и державы, ближе — города, ещё ближе —
// городки и урочища; подписи не налезают друг на друга и на пины кампании. Данные — content/maps/<id>-labels.json
// (scripts/labels-from-gis.py: полигоны Toril GIS, подписи растра из карточек, места справочника), отдельным куском
// по требованию; импортирует только ленивая часть схемы. Чистые функции: проекция и мерка текста — снаружи, поэтому
// один отбор служит и плоской карте, и глобусу.
import type { EntityRef } from '../entities';
import { fold } from './gazetteer';
import type { MapBox, MapPoint, Viewport } from './projection';

export type LabelKind =
  | 'continent' | 'ocean' | 'region' | 'realm' | 'sea' | 'lake' | 'island'
  | 'mountains' | 'hills' | 'forest' | 'swamp' | 'desert' | 'ice'
  | 'city' | 'town' | 'site' | 'label';

export interface SchemaLabel extends MapPoint {
  name: string;
  kind: LabelKind;
  /** Радиус вписанного круга области, пиксели исходника; 0 — точка. */
  r: number;
  /** feature_rank GIS (у мест — rank справочника); 9 — нет. */
  rank: number;
}

/** Токен цвета текста: подписи — по ореолу цвета провала (wl), так что контраст считается к нему. */
export type LabelColor = 'tx' | 't2';

export interface LabelStyle {
  /** Кегль, px экрана: не меньше 13 (CLAUDE.md). */
  size: number;
  /** Разрядка, px между знаками — у держав и морей, как на бумажных картах. */
  spacing: number;
  color: LabelColor;
  /** Очередь отбора: меньше — раньше занимает место. */
  order: number;
  /** Сторона квадратной точки места, px; нет — подпись без точки. */
  dot?: number;
  /** Точка: с какого масштаба (px экрана на px исходника) подпись показывается и до какого. */
  min?: number;
  max?: number;
  /**
   * Область: подпись видна, пока её ширина не больше fit × поперечника вписанного круга на экране, и пропадает, когда
   * круг шире maxView диагоналей окна — область больше экрана, её имя не о том, что видно.
   */
  fit?: number;
  maxView?: number;
}

// Хребты и леса вытянуты: вписанный круг у них узкий, а подпись на бумажной карте идёт вдоль — вдвое шире круга.
const AREA_NATURE: LabelStyle = { size: 13, spacing: 0, color: 't2', order: 6, fit: 2.2, maxView: 1.5 };

/** Решение кокпита: кегли, разрядка, пороги масштаба и очередь — подобраны глазами на Toril, не из источника. */
export const LABEL_STYLE: Readonly<Record<LabelKind, LabelStyle>> = {
  continent: { size: 22, spacing: 4, color: 'tx', order: 0, fit: 1.6, maxView: 2.5 },
  ocean: { size: 18, spacing: 3, color: 't2', order: 1, fit: 1.6, maxView: 2.5 },
  region: { size: 15, spacing: 2, color: 'tx', order: 2, fit: 1.8, maxView: 1.6 },
  realm: { size: 15, spacing: 2, color: 'tx', order: 2, min: 0.07, max: 1.2 },
  sea: { size: 15, spacing: 1, color: 't2', order: 3, fit: 1.6, maxView: 2 },
  city: { size: 15, spacing: 0, color: 'tx', order: 4, dot: 5, min: 0.08 },
  lake: { ...AREA_NATURE, order: 5 },
  island: AREA_NATURE,
  mountains: AREA_NATURE,
  hills: AREA_NATURE,
  forest: AREA_NATURE,
  swamp: AREA_NATURE,
  desert: AREA_NATURE,
  ice: AREA_NATURE,
  town: { size: 13, spacing: 0, color: 'tx', order: 7, dot: 4, min: 0.35 },
  site: { size: 13, spacing: 0, color: 't2', order: 8, dot: 3, min: 0.8 },
  label: { size: 13, spacing: 0, color: 't2', order: 8, min: 0.8 },
};

const KINDS = new Set(Object.keys(LABEL_STYLE));

/** Разбор файла подписей: строки [имя, вид, x, y, r, ранг]; битая строка — ошибка с причиной, а не пустая схема. */
export function parseLabels(raw: unknown): SchemaLabel[] {
  const rows = (raw as { labels?: unknown })?.labels;
  if (!Array.isArray(rows)) throw new Error('подписи схемы: ожидался массив labels');
  return rows.map((row, i) => {
    const [name, kind, x, y, r, rank] = Array.isArray(row) ? row : [];
    if (typeof name !== 'string' || !KINDS.has(kind) || ![x, y, r, rank].every(n => typeof n === 'number')) {
      throw new Error(`подписи схемы: строка ${i} — ожидалось [имя, вид, x, y, r, ранг]`);
    }
    return { name, kind: kind as LabelKind, x, y, r, rank };
  });
}

const LOADERS: Readonly<Record<string, () => Promise<unknown>>> = {
  toril: () => import('../../content/maps/toril-labels.json').then(m => m.default),
};
const cache = new Map<string, Promise<SchemaLabel[]>>();

/** Подписи карты отдельным куском, один раз на сеанс; у карты без подписей — пусто. */
export function loadLabels(mapId: string): Promise<SchemaLabel[]> {
  const load = LOADERS[mapId];
  if (!load) return Promise.resolve([]);
  if (!cache.has(mapId)) cache.set(mapId, load().then(parseLabels).catch(() => []));
  return cache.get(mapId)!;
}

/** Ширина подписи на экране: мерка текста снаружи (canvas measureText), разрядка — сверху. */
export type Measure = (text: string, style: LabelStyle) => number;

/** Подпись видна на этом масштабе? width — её ширина на экране. */
export function labelVisible(l: SchemaLabel, scale: number, width: number, vp: Viewport): boolean {
  const s = LABEL_STYLE[l.kind];
  if (s.fit !== undefined && l.r > 0) {
    const d = 2 * l.r * scale;
    return width <= s.fit * d && d <= (s.maxView ?? 2) * Math.hypot(vp.w, vp.h);
  }
  return scale >= (s.min ?? 0) && scale <= (s.max ?? Infinity);
}

/** Очередь отбора: вид, затем у областей — крупнее раньше, у мест — ранг, затем имя (стабильно при сдвиге карты). */
export function labelOrder(a: SchemaLabel, b: SchemaLabel): number {
  return LABEL_STYLE[a.kind].order - LABEL_STYLE[b.kind].order || b.r - a.r || a.rank - b.rank || a.name.localeCompare(b.name);
}

export interface PlacedLabel {
  label: SchemaLabel;
  style: LabelStyle;
  /** Начало строки текста (левый край) и середина по высоте, px экрана. */
  x: number;
  y: number;
  width: number;
  /** Точка места, px экрана (центр). */
  dot?: MapPoint;
  box: MapBox;
}

export interface PlaceOptions {
  /** Пиксель исходника → px экрана; не видно (обратная сторона глобуса) — null. */
  project: (p: MapPoint) => MapPoint | null;
  /** Пикселей экрана на пиксель исходника — у глобуса у центра диска. */
  scale: number;
  vp: Viewport;
  measure: Measure;
  /** Занятое на экране: плашки пинов кампании, партия. */
  avoid?: readonly MapBox[];
  /** Имена, что уже подписаны пином кампании, — без своей подписи (сравнение без регистра и диакритики). */
  skip?: ReadonlySet<string>;
  /** Не больше стольких подписей. */
  limit?: number;
}

const PAD = 3;
const GAP = 4;
/** Одно имя — одна подпись на этом расстоянии, px экрана: область и лес одного имени (Chondalwood), город и подпись
 * растра рядом не подписываются дважды. Решение кокпита. */
const SAME_NAME_PX = 320;

const hit = (a: MapBox, b: MapBox) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Жадный отбор: в очереди labelOrder каждая подпись, видимая на масштабе, занимает место, если не налезает на уже
 * занятое; у места с точкой — справа, слева, сверху или снизу от точки (первое свободное), у области — по центру.
 * Не влезла — пропадает целиком, с точкой. Имя, уже подписанное ближе SAME_NAME_PX, второй раз не пишется.
 */
export function placeLabels(labels: readonly SchemaLabel[], o: PlaceOptions): PlacedLabel[] {
  const taken: MapBox[] = [...(o.avoid ?? [])];
  const out: PlacedLabel[] = [];
  const limit = o.limit ?? 300;
  const inView = (b: MapBox) => b.x0 >= 0 && b.y0 >= 0 && b.x1 <= o.vp.w && b.y1 <= o.vp.h;
  const free = (b: MapBox) => inView(b) && !taken.some(t => hit(t, b));
  const sorted = [...labels].sort(labelOrder);
  const named = new Map<string, MapPoint[]>();
  const twice = (key: string, at: MapPoint) => (named.get(key) ?? []).some(p => Math.hypot(p.x - at.x, p.y - at.y) < SAME_NAME_PX);
  const keep = (key: string, at: MapPoint) => named.set(key, [...(named.get(key) ?? []), at]);
  for (const l of sorted) {
    if (out.length >= limit) break;
    const key = fold(l.name);
    if (o.skip?.has(key)) continue;
    const s = LABEL_STYLE[l.kind];
    // Дешёвая отсечка до мерки текста: точка-подпись вне масштаба.
    if (s.fit === undefined && (o.scale < (s.min ?? 0) || o.scale > (s.max ?? Infinity))) continue;
    const at = o.project(l);
    if (!at || at.x < -400 || at.y < -100 || at.x > o.vp.w + 400 || at.y > o.vp.h + 100) continue;
    if (twice(key, at)) continue;
    const width = o.measure(l.name, s);
    if (!labelVisible(l, o.scale, width, o.vp)) continue;
    const h = s.size;
    if (!s.dot) {
      const box = { x0: at.x - width / 2 - PAD, y0: at.y - h / 2 - PAD, x1: at.x + width / 2 + PAD, y1: at.y + h / 2 + PAD };
      if (!free(box)) continue;
      taken.push(box);
      keep(key, at);
      out.push({ label: l, style: s, x: at.x - width / 2, y: at.y, width, box });
      continue;
    }
    const d = s.dot / 2;
    const dotBox = { x0: at.x - d - 1, y0: at.y - d - 1, x1: at.x + d + 1, y1: at.y + d + 1 };
    if (!free(dotBox)) continue;
    const spots: MapPoint[] = [
      { x: at.x + d + GAP, y: at.y },
      { x: at.x - d - GAP - width, y: at.y },
      { x: at.x - width / 2, y: at.y - d - GAP - h / 2 },
      { x: at.x - width / 2, y: at.y + d + GAP + h / 2 },
    ];
    for (const p of spots) {
      const box = { x0: p.x - PAD, y0: p.y - h / 2 - PAD, x1: p.x + width + PAD, y1: p.y + h / 2 + PAD };
      if (!free(box)) continue;
      taken.push(box, dotBox);
      keep(key, at);
      out.push({ label: l, style: s, x: p.x, y: p.y, width, dot: at, box });
      break;
    }
  }
  return out;
}

/** Подпись-область, за которой стоит карточка (держава — по `kingdom.label`): щелчок по ней открывает карточку. */
export interface LabelHit {
  box: MapBox;
  ref: EntityRef;
  name: string;
}

/**
 * Щелчковые подписи кадра: области (без точки), чьё имя есть в refs (ключ — fold имени). У подписи с точкой щелчок уже
 * ловит справочник мест (карточка места), второй цели ей не нужно.
 */
export function labelHits(placed: readonly PlacedLabel[], refs: ReadonlyMap<string, EntityRef>): LabelHit[] {
  return placed.flatMap(p => {
    const ref = p.dot ? undefined : refs.get(fold(p.label.name));
    return ref ? [{ box: p.box, ref, name: p.label.name }] : [];
  });
}

/** Подпись под точкой экрана; подписи кадра не налезают друг на друга, так что она одна. */
export const hitAt = (hits: readonly LabelHit[], pt: MapPoint): LabelHit | undefined =>
  hits.find(h => pt.x >= h.box.x0 && pt.x <= h.box.x1 && pt.y >= h.box.y0 && pt.y <= h.box.y1);
