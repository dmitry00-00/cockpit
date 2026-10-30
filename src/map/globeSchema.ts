// Глобус на последних шагах колеса (TASKS M16): вместо клеток маски — та же векторная схема, что у плоской карты,
// спроецированная на диск, чтобы переход глобус → карта был без смены картинки. Здесь — чистая геометрия: точка карты
// на диске (обратная сторона — на край диска), ночная сторона полигоном, с какого приближения схема.
import { lonLatToGlobe } from './planet';

const RAD = Math.PI / 180;
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/** С какого приближения глобус рисует схему: последние два шага колеса перед пределом и сам предел. */
export const globeVectorFrom = (maxZoom: number, step: number) => Math.max(1, maxZoom / (step * step));

/**
 * Долгота и широта → px диска радиуса R (диск n×n клеток по cellPx). Обратная сторона — на край диска по тому же
 * направлению: кольцо, ушедшее за горизонт, ложится на горизонт, а не складывается внутрь (диск потом обрезается).
 */
export function diskPoint(n: number, rot: number, cellPx: number, lon: number, lat: number): { x: number; y: number; visible: boolean } {
  const g = lonLatToGlobe(n, rot, lon, lat);
  const R = (n * cellPx) / 2;
  let x = g.x * cellPx;
  let y = g.y * cellPx;
  if (!g.visible) {
    const dx = x - R;
    const dy = y - R;
    const k = (R * 1.02) / (Math.hypot(dx, dy) || 1);
    x = R + dx * k;
    y = R + dy * k;
  }
  return { x, y, visible: g.visible };
}

/**
 * Видимая полусфера в пикселях плоской карты: ось глобуса без наклона, поэтому видно всё, что ближе 90° по долготе к
 * центру, — на плоской карте это полоса по x (долгота линейна по x). Карта занимает lon0…lon1 (меньше 360°), полоса —
 * со сдвигами на оборот, что задевают карту: одна или две. Край — чуть внутри горизонта, чтобы срез лёг под край диска.
 */
export function visibleBands(rot: number, extent: { lon0: number; lon1: number; width: number }, margin = 0.5): [number, number][] {
  const { lon0, lon1, width } = extent;
  const px = width / (lon1 - lon0);
  const out: [number, number][] = [];
  for (const k of [-1, 0, 1]) {
    const a = (rot + 360 * k - (90 - margin) - lon0) * px;
    const b = (rot + 360 * k + (90 - margin) - lon0) * px;
    if (b > 0 && a < width) out.push([a, b]);
  }
  return out;
}

/**
 * Кольцо [x0, y0, x1, y1, …] — в полосе xa ≤ x ≤ xb (Сазерленд — Ходжмен по двум вертикалям): срез идёт по краю
 * полосы, заливка even-odd остаётся верной, а за горизонт кольцо не уходит. Меньше трёх вершин — пусто.
 */
export function clipRingToBand(ring: readonly number[], xa: number, xb: number): number[] {
  let pts: number[] = [...ring];
  for (const [edge, keepLeft] of [[xa, false], [xb, true]] as const) {
    const n = pts.length / 2;
    if (n < 3) return [];
    const inside = (x: number) => (keepLeft ? x <= edge : x >= edge);
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const ax = pts[2 * i], ay = pts[2 * i + 1];
      const j = (i + 1) % n;
      const bx = pts[2 * j], by = pts[2 * j + 1];
      const ain = inside(ax), bin = inside(bx);
      if (ain) out.push(ax, ay);
      if (ain !== bin) {
        const t = (edge - ax) / (bx - ax);
        out.push(edge, ay + (by - ay) * t);
      }
    }
    pts = out;
  }
  return pts.length >= 6 ? pts : [];
}

/** Линия — куски внутри полосы (концы кусков — на её краю). */
export function clipLineToBand(line: readonly number[], xa: number, xb: number): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  const inside = (x: number) => x >= xa && x <= xb;
  for (let i = 0; i < line.length; i += 2) {
    const x = line[i], y = line[i + 1];
    if (inside(x)) {
      if (!cur.length && i > 0) {
        const px = line[i - 2], py = line[i - 1];
        const edge = px < xa ? xa : xb;
        cur.push(edge, py + ((y - py) * (edge - px)) / (x - px));
      }
      cur.push(x, y);
    } else if (cur.length) {
      const px = line[i - 2], py = line[i - 1];
      const edge = x < xa ? xa : xb;
      cur.push(edge, py + ((y - py) * (edge - px)) / (x - px));
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length >= 4) out.push(cur);
  return out.filter(l => l.length >= 4);
}

/**
 * Ночная сторона диска радиуса R (центр — R, R; ось без наклона, как у globeCells): терминатор — меридиан в 90° от
 * подсолнечной долготы, на диске — половина эллипса; ночь — между ним и краем диска. Пустой массив — ночи не видно;
 * весь диск в ночи — круг.
 */
export function nightPolygon(R: number, rot: number, sun: number, steps = 48): { x: number; y: number }[] {
  const s = wrap180(sun - rot);
  // Терминатор на видимой стороне: δ = s − 90 (ночь — западнее) или s + 90 (ночь — восточнее).
  const west = s >= 0;
  const d = west ? s - 90 : s + 90;
  const k = Math.sin(d * RAD);
  if ((west && d <= -90) || (!west && d >= 90)) return [];
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const lat = 90 - (180 * i) / steps;
    out.push({ x: R + R * Math.cos(lat * RAD) * k, y: R - R * Math.sin(lat * RAD) });
  }
  const edge = west ? -1 : 1;
  for (let i = steps; i >= 0; i--) {
    const lat = 90 - (180 * i) / steps;
    out.push({ x: R + edge * R * Math.cos(lat * RAD), y: R - R * Math.sin(lat * RAD) });
  }
  return out;
}
