// Рисование схемы карты (TASKS M16) канвасом — общее для плоской карты (SchemaLayer) и последних шагов колеса глобуса
// (Globe): пути схемы, подписи с ореолом, мерка текста. Импортируют только ленивые части.
import { useEffect, useState } from 'react';
import { SCHEMA_ORDER, type MapSchema } from './schema';
import type { LabelStyle, Measure, PlacedLabel } from './schemaLabels';
import type { MapBox, MapPoint } from './projection';
import type { TerrainCode } from './terrain';

type Rings = readonly (readonly number[])[];

/** Обрезка перед проекцией: кольцо или линия → куски, что остаются (глобус: видимая полусфера). */
export interface SchemaClip {
  ring: (r: readonly number[]) => readonly (readonly number[])[];
  line: (l: readonly number[]) => readonly (readonly number[])[];
}

function pathOf(items: Rings, closed: boolean, project?: (p: MapPoint) => MapPoint, clip?: SchemaClip): Path2D {
  const p = new Path2D();
  const list = clip ? items.flatMap(r => (closed ? clip.ring(r) : clip.line(r))) : items;
  for (const r of list) {
    if (r.length < 4) continue;
    if (project) {
      const a = project({ x: r[0], y: r[1] });
      p.moveTo(a.x, a.y);
      for (let i = 2; i < r.length; i += 2) {
        const b = project({ x: r[i], y: r[i + 1] });
        p.lineTo(b.x, b.y);
      }
    } else {
      p.moveTo(r[0], r[1]);
      for (let i = 2; i < r.length; i += 2) p.lineTo(r[i], r[i + 1]);
    }
    if (closed) p.closePath();
  }
  return p;
}

export interface SchemaPaths {
  land: Path2D;
  regions: readonly { code: TerrainCode; path: Path2D }[];
  roads: Path2D;
  rivers: Path2D;
  borders: Path2D;
}

/**
 * Пути схемы: без project — в пикселях исходника (кадр плоской карты — смена преобразования), с project — сразу в
 * пикселях экрана (глобус: проекция не аффинная, кольца сначала режутся clip по видимой полусфере — иначе кольцо,
 * ушедшее за горизонт, ломает заливку even-odd). Нет Path2D (jsdom) — null.
 */
export function schemaPaths(schema: MapSchema, project?: (p: MapPoint) => MapPoint, clip?: SchemaClip): SchemaPaths | null {
  if (typeof Path2D === 'undefined') return null;
  return {
    land: pathOf(schema.land, true, project, clip),
    regions: SCHEMA_ORDER.flatMap(c => (schema.regions[c]?.length ? [{ code: c, path: pathOf(schema.regions[c]!, true, project, clip) }] : [])),
    roads: pathOf(schema.roads, false, project, clip),
    rivers: pathOf(schema.rivers ?? [], false, project, clip),
    borders: pathOf(schema.borders ?? [], false, project, clip),
  };
}

/** Граница держав: штрих-пунктир в px экрана (штрих, просвет, точка, просвет) и толщина — как на растре, при любом масштабе. */
export const BORDER_DASH: readonly number[] = [8, 3, 2, 3];
export const BORDER_WIDTH = 2;

/**
 * Заливка схемы в текущем преобразовании: суша цветом равнины, классы поверх — по маске суши (с 30.10 они заходят в
 * море, край класса у берега — береговая линия), реки цветом воды, берег линией px экрана, поверх — границы держав
 * штрих-пунктиром map-border (px экрана). Дороги кладёт вызывающий, после границ: их толщина зависит от масштаба.
 */
export function fillSchema(ctx: CanvasRenderingContext2D, paths: SchemaPaths, color: (token: string) => string, px: number, riverPx = px): void {
  ctx.fillStyle = color('terrain-g');
  ctx.fill(paths.land, 'evenodd');
  ctx.save();
  ctx.clip(paths.land, 'evenodd');
  for (const r of paths.regions) {
    ctx.fillStyle = color(`terrain-${r.code}`);
    ctx.fill(r.path, 'evenodd');
  }
  ctx.restore();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = color('terrain-o');
  ctx.lineWidth = riverPx;
  ctx.stroke(paths.rivers);
  ctx.strokeStyle = color('lo');
  ctx.lineWidth = px;
  ctx.stroke(paths.land);
  ctx.strokeStyle = color('map-border');
  ctx.lineWidth = BORDER_WIDTH * px;
  ctx.lineCap = 'butt';
  ctx.setLineDash(BORDER_DASH.map(d => d * px));
  ctx.stroke(paths.borders);
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
}

/** Толщина реки, px экрана: на континенте — волосок, ближе — до 2,5 px (решение кокпита). */
export const riverWidth = (scale: number) => Math.max(1, Math.min(2.5, scale * 8));

/**
 * Цвет схемы в точке карты — по её снимку на маленьком канвасе (width px поперёк карты): глобус до векторных шагов
 * красит клетки так же, как схема, а не классами маски (с 30.10, M16: маска путала равнины с пустыней — у 81 % клеток
 * экстента её класс совпадал со схемой, переход клетки → схема менял цвета). Нет канваса (jsdom) — null.
 */
export function schemaSampler(schema: MapSchema, size: { width: number; height: number }, color: (token: string) => string, width = 1024): ((p: MapPoint) => string | null) | null {
  if (typeof document === 'undefined' || typeof Path2D === 'undefined') return null;
  const k = width / size.width;
  const w = width;
  const h = Math.max(1, Math.round(size.height * k));
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  const paths = schemaPaths(schema);
  if (!ctx || !paths) return null;
  ctx.fillStyle = color('terrain-o');
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.fillStyle = color('terrain-g');
  ctx.fill(paths.land, 'evenodd');
  ctx.save();
  ctx.clip(paths.land, 'evenodd');
  for (const r of paths.regions) {
    ctx.fillStyle = color(`terrain-${r.code}`);
    ctx.fill(r.path, 'evenodd');
  }
  ctx.restore();
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
  return p => {
    const x = Math.floor(p.x * k);
    const y = Math.floor(p.y * k);
    if (x < 0 || y < 0 || x >= w || y >= h) return null;
    const i = 4 * (y * w + x);
    return `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`;
  };
}

const fontOf = (s: LabelStyle, family: string) => `${s.size}px ${family}`;

/** Мерка подписи: ширина текста шрифтом подписей и разрядка поверх (разрядку канвас рисует сам — letterSpacing). */
export function labelMeasure(ctx: CanvasRenderingContext2D, family: string): Measure {
  const cache = new Map<string, number>();
  const spaced = 'letterSpacing' in ctx;
  return (text, s) => {
    const key = `${s.size}:${s.spacing}:${text}`;
    let w = cache.get(key);
    if (w === undefined) {
      ctx.font = fontOf(s, family);
      if (spaced) ctx.letterSpacing = '0px';
      w = ctx.measureText(text).width + (spaced ? s.spacing * text.length : 0);
      cache.set(key, w);
    }
    return w;
  };
}

/** Подписи: ореол цвета провала (wl) — текст читается на любой заливке, — затем текст; точка места — квадратом. */
export function drawLabels(ctx: CanvasRenderingContext2D, placed: readonly PlacedLabel[], family: string, color: (token: string) => string): void {
  const spaced = 'letterSpacing' in ctx;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  const halo = color('wl');
  for (const p of placed) {
    if (p.dot && p.style.dot) {
      const d = p.style.dot;
      ctx.fillStyle = color('lo');
      ctx.fillRect(Math.round(p.dot.x - d / 2) - 1, Math.round(p.dot.y - d / 2) - 1, d + 2, d + 2);
      ctx.fillStyle = color(p.style.color);
      ctx.fillRect(Math.round(p.dot.x - d / 2), Math.round(p.dot.y - d / 2), d, d);
    }
    ctx.font = fontOf(p.style, family);
    if (spaced) ctx.letterSpacing = `${p.style.spacing}px`;
    ctx.strokeStyle = halo;
    ctx.lineWidth = 3;
    ctx.strokeText(p.label.name, p.x, p.y);
    ctx.fillStyle = color(p.style.color);
    ctx.fillText(p.label.name, p.x, p.y);
  }
  if (spaced) ctx.letterSpacing = '0px';
}

/**
 * Что на экране уже занято над канвасом: плашки пинов (с их значками), партия, метки слоёв и глобуса, панели стола и
 * карты — прямоугольники в px host. Подпись под ними не видна, место отдаётся следующей.
 */
const OCCUPIED = '[data-pin], [data-part="party"], [data-event-mark], [data-influence], [data-marker], [data-part="map-ui"] > *';

export function occupiedBoxes(host: Element | null | undefined): MapBox[] {
  if (!host) return [];
  const base = host.getBoundingClientRect();
  const out: MapBox[] = [];
  host.querySelectorAll(OCCUPIED).forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) out.push({ x0: r.left - base.left, y0: r.top - base.top, x1: r.right - base.left, y1: r.bottom - base.top });
  });
  return out;
}

/** Шрифт подписей догружается по unicode-range (Fontsource): канвас рисует запасным, пока не придёт, — потом перерисовка. */
export function useFontsReady(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts?.load) return;
    let live = true;
    void Promise.all([fonts.load('15px Forum', 'Faerûn Кириллица')]).then(() => { if (live) setN(v => v + 1); }, () => {});
    return () => { live = false; };
  }, []);
  return n;
}
