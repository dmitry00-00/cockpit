// И5, замер: та же астролябия канвасом — для сравнения с SVG (bench.html). Геометрия — из astrolabeModel.ts,
// радиусы — те же, что в Astrolabe.tsx. Цвета — значения переменных токенов, прочитанные со страницы (getComputedStyle):
// канвас не понимает var(--x), поэтому токен разрешается один раз при подготовке.
//   full  — каждый кадр рисует всё: лимб, кольцо года с подписями, метки, солнце, линейку, Selûne;
//   cached — плита и решётка нарисованы один раз во внеэкранные канвасы, кадр — два drawImage с поворотом.
import { harptos } from '../../src/campaign/calendar';
import { holyMarks, moonDisc, moonPath, polar, ringDeg, ringSlots, seasonArcs, yearPos, type HolyMark, type RingSlot } from './astrolabeModel';

const R_FRAME = 199, R_LIMB_OUT = 194, R_LIMB_IN = 168, R_RING_OUT = 160, R_RING_IN = 126, R_SEASON = 113, R_MOON = 32;
const PHASES = [['--sky-dawn', 5, 11], ['--sky-day', 11, 17], ['--sky-dusk', 17, 21], ['--sky-night', 21, 29]] as const;
const rad = (deg: number) => ((deg - 90) * Math.PI) / 180; // наш угол — по часовой от верха; у канваса ноль справа
const hourToDeg = (h: number) => ((h / 24) * 360 + 180) % 360;

export type Palette = (name: string) => string;
export function cssPalette(el: Element = document.documentElement): Palette {
  const cs = getComputedStyle(el);
  const cache = new Map<string, string>();
  return name => {
    let v = cache.get(name);
    if (v === undefined) { v = cs.getPropertyValue(name).trim() || '#f0f'; cache.set(name, v); }
    return v;
  };
}

export interface FaceData { slots: RingSlot[]; seasons: ReturnType<typeof seasonArcs>; marks: HolyMark[]; sunDeg: number; moon: ReturnType<typeof moonDisc> }

export function faceData(sec: number, party: ReadonlySet<string>): FaceData {
  const { year, doy, diy } = yearPos(sec);
  return { slots: ringSlots(year), seasons: seasonArcs(year), marks: holyMarks(year, party), sunDeg: ringDeg(doy, diy), moon: moonDisc(sec) };
}

function band(ctx: CanvasRenderingContext2D, r0: number, r1: number, d0: number, d1: number) {
  ctx.beginPath();
  ctx.arc(0, 0, r1, rad(d0), rad(d1));
  ctx.arc(0, 0, r0, rad(d1), rad(d0), true);
  ctx.closePath();
}

export function drawPlate(ctx: CanvasRenderingContext2D, c: Palette) {
  const g = ctx.createLinearGradient(-R_FRAME, -R_FRAME, R_FRAME, R_FRAME);
  g.addColorStop(0, c('--hi')); g.addColorStop(0.5, c('--br')); g.addColorStop(1, c('--lo'));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R_FRAME, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c('--wl'); ctx.beginPath(); ctx.arc(0, 0, R_LIMB_OUT, 0, Math.PI * 2); ctx.fill();
  for (const [tok, h0, h1] of PHASES) { band(ctx, R_LIMB_IN, R_LIMB_OUT, hourToDeg(h0), hourToDeg(h0) + (h1 - h0) * 15); ctx.fillStyle = c(tok); ctx.fill(); }
  ctx.strokeStyle = c('--tx');
  for (let h = 0; h < 24; h++) {
    const major = h % 3 === 0;
    const a = polar(hourToDeg(h), R_LIMB_OUT), b = polar(hourToDeg(h), R_LIMB_OUT - (major ? 10 : 6));
    ctx.lineWidth = major ? 3 : 2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.font = '600 14px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = c('--lo'); ctx.fillStyle = c('--tx');
  for (const h of [0, 3, 6, 9, 12, 15, 18, 21]) {
    const p = polar(hourToDeg(h), R_LIMB_IN + 11);
    const t = String(h).padStart(2, '0');
    ctx.strokeText(t, p.x, p.y); ctx.fillText(t, p.x, p.y);
  }
  ctx.fillStyle = c('--bg'); ctx.beginPath(); ctx.arc(0, 0, R_LIMB_IN, 0, Math.PI * 2); ctx.fill();
}

export function drawRete(ctx: CanvasRenderingContext2D, c: Palette, f: FaceData) {
  ctx.strokeStyle = c('--pl'); ctx.lineWidth = 6;
  for (const d of [0, 90, 180, 270]) { const a = polar(d, R_MOON + 4), b = polar(d, R_RING_IN); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  f.slots.forEach((s, i) => {
    if (s.festival) return;
    band(ctx, R_RING_IN, R_RING_OUT, s.startDeg, s.endDeg);
    ctx.fillStyle = c(i % 2 ? '--cd' : '--pn'); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = c('--lo'); ctx.stroke();
  });
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '13px "PT Sans", sans-serif'; ctx.fillStyle = c('--t2');
  for (const s of f.seasons) {
    const mid = (s.startDeg + s.endDeg) / 2, p = polar(mid, R_SEASON);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((mid * Math.PI) / 180); ctx.fillText(s.label, 0, 0); ctx.restore();
  }
  ctx.font = '15px Forum, serif';
  for (const s of f.slots) {
    const mid = (s.startDeg + s.endDeg) / 2, p = polar(mid, R_RING_IN + 12);
    if (s.festival) { ctx.fillStyle = c('--gd-hi'); ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = c('--lo'); ctx.stroke(); continue; }
    ctx.fillStyle = c('--tx'); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((mid * Math.PI) / 180); ctx.fillText(s.label, 0, 0); ctx.restore();
  }
  for (const m of f.marks) {
    const a = polar(m.deg, R_RING_OUT + 1), b = polar(m.deg - 1.6, R_RING_OUT + 8), d = polar(m.deg + 1.6, R_RING_OUT + 8);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(d.x, d.y); ctx.closePath();
    ctx.fillStyle = c(m.party ? '--gd' : '--t2'); ctx.fill();
  }
  const sun = polar(f.sunDeg, R_RING_OUT - 8), needle = polar(f.sunDeg, R_LIMB_IN + 2);
  ctx.lineWidth = 7; ctx.strokeStyle = c('--lo'); ctx.beginPath(); ctx.moveTo(sun.x, sun.y); ctx.lineTo(needle.x, needle.y); ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = c('--gd-hi'); ctx.stroke();
  ctx.fillStyle = c('--gd-hi'); ctx.beginPath(); ctx.arc(sun.x, sun.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = c('--lo'); ctx.stroke();
}

export function drawRuleAndCap(ctx: CanvasRenderingContext2D, c: Palette, f: FaceData, ruleDeg: number) {
  ctx.save(); ctx.rotate((ruleDeg * Math.PI) / 180);
  ctx.fillStyle = c('--br'); ctx.fillRect(-2.5, -R_RING_IN + 2, 5, R_RING_IN - 2 - R_MOON); ctx.fillRect(-11, -92, 22, 22);
  ctx.restore();
  ctx.fillStyle = c('--pl'); ctx.beginPath(); ctx.arc(0, 0, R_MOON, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c('--wl'); ctx.beginPath(); ctx.arc(0, 0, R_MOON - 4, 0, Math.PI * 2); ctx.fill();
  const d = moonPath(f.moon, R_MOON - 4);
  if (d) { ctx.fillStyle = c('--tx'); ctx.fill(new Path2D(d)); }
}

/** Канвас стороной size CSS px с плотностью dpr; рисование — в единицах 400 с центром в нуле. */
export function makeCanvas(size: number, dpr: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr);
  cv.style.width = `${size}px`; cv.style.height = `${size}px`;
  return cv;
}
const toUnits = (ctx: CanvasRenderingContext2D, size: number, dpr: number) => { const k = (size * dpr) / 400; ctx.setTransform(k, 0, 0, k, (size * dpr) / 2, (size * dpr) / 2); };

/** Полная перерисовка кадра. */
export function drawFull(cv: HTMLCanvasElement, size: number, dpr: number, c: Palette, f: FaceData, reteRot: number, ruleDeg: number) {
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  toUnits(ctx, size, dpr); drawPlate(ctx, c);
  ctx.save(); ctx.rotate((reteRot * Math.PI) / 180); drawRete(ctx, c, f); ctx.restore();
  drawRuleAndCap(ctx, c, f, ruleDeg);
}

/** Плита и решётка — один раз во внеэкранные канвасы; дальше кадр — drawImage. */
export function prepareCached(size: number, dpr: number, c: Palette, f: FaceData) {
  const plate = makeCanvas(size, dpr), rete = makeCanvas(size, dpr);
  const p = plate.getContext('2d')!; toUnits(p, size, dpr); drawPlate(p, c);
  const r = rete.getContext('2d')!; toUnits(r, size, dpr); drawRete(r, c, f);
  return { plate, rete };
}
export function drawCached(cv: HTMLCanvasElement, size: number, dpr: number, c: Palette, f: FaceData, layers: { plate: HTMLCanvasElement; rete: HTMLCanvasElement }, reteRot: number, ruleDeg: number) {
  const ctx = cv.getContext('2d')!;
  const W = cv.width;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, W);
  ctx.drawImage(layers.plate, 0, 0);
  ctx.translate(W / 2, W / 2); ctx.rotate((reteRot * Math.PI) / 180); ctx.drawImage(layers.rete, -W / 2, -W / 2);
  toUnits(ctx, size, dpr); drawRuleAndCap(ctx, c, f, ruleDeg);
}

/** Для подписи замера: какой день нарисован. */
export const faceDate = (sec: number) => { const d = harptos(sec); return `${d.day} ${d.month ?? d.festival} ${d.year}`; };
