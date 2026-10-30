// И5, замер кадра: одна и та же астролябия пятью способами, решётка крутится на 1° за кадр.
//   svg-flat     — один SVG, React меняет transform у <g> решётки; браузер перерисовывает весь SVG;
//   svg-layered  — Astrolabe по умолчанию: решётка — свой слой с CSS-трансформом; React меняет одно свойство style;
//   canvas-full  — Canvas2D, весь прибор каждый кадр;
//   canvas-cached— Canvas2D, плита и решётка заранее, кадр — два drawImage;
//   webgl        — WebGL2, две текстуры и поворот в шейдере (gl.finish() в замере — иначе время ушло бы в GPU-поток).
// Время «работы кадра» — от начала колбэка rAF до конца синхронной работы (у React — flushSync и принудительный
// пересчёт стилей и раскладки), без растра SVG: его считает трасса (run-bench.mjs).
import '@fontsource/forum/400.css';
import '@fontsource/pt-sans/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import '../../src/styles/theme.generated.css';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { secOf } from '../../src/campaign/calendar';
import { Astrolabe } from './Astrolabe';
import { cssPalette, drawCached, drawFull, faceData, makeCanvas, prepareCached } from './canvasFace';
import { glFace } from './glFace';
import { hourDeg, reteDeg } from './astrolabeModel';

const q = new URLSearchParams(location.search);
const R = q.get('r') ?? 'svg-layered';
const N = Number(q.get('n') ?? 300);
const SIZE = Number(q.get('size') ?? 400);
const DPR = devicePixelRatio;
const SEC = secOf({ year: 1492, month: 'Mirtul', day: 15, hour: 8 });
const PARTY: ReadonlySet<string> = new Set(['lathander', 'mielikki']);
const root = document.getElementById('root')!;

const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const summary = (a: number[]) => ({ p50: +pct(a, 50).toFixed(3), p95: +pct(a, 95).toFixed(3), max: +Math.max(...a).toFixed(3), mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3) });

async function run(step: (i: number) => void, extra: Record<string, unknown> = {}) {
  await document.fonts.ready;
  const work: number[] = [], gaps: number[] = [];
  let last = 0;
  await new Promise<void>(done => {
    let i = 0;
    const tick = (ts: number) => {
      if (last) gaps.push(ts - last);
      last = ts;
      const t0 = performance.now();
      step(i);
      work.push(performance.now() - t0);
      if (++i < N) requestAnimationFrame(tick); else done();
    };
    // Первый кадр — прогрев (шрифты, кэш растра): не в счёт.
    requestAnimationFrame(() => { step(-1); requestAnimationFrame(tick); });
  });
  const svgNodes = document.querySelectorAll('svg *').length;
  (window as unknown as { __bench: unknown }).__bench = { renderer: R, frames: N, size: SIZE, dpr: DPR, work: summary(work), interval: summary(gaps), over20ms: gaps.filter(g => g > 20).length, svgNodes, ...extra };
  document.title = 'done';
}

const GRAIN = q.get('grain') !== '0';
let mountMs = 0;
if (R === 'svg-flat' || R === 'svg-layered') {
  let set: (d: number) => void = () => {};
  function Host() {
    const [spin, setSpin] = useState(0);
    set = setSpin;
    return <Astrolabe sec={SEC} tempo="hour" partyDeities={PARTY} onAdvance={() => {}} size={SIZE} mode={R === 'svg-flat' ? 'flat' : 'layered'} spinDeg={spin} grain={GRAIN} />;
  }
  const t0 = performance.now();
  const r = createRoot(root);
  flushSync(() => r.render(<Host />));
  root.getBoundingClientRect();
  mountMs = performance.now() - t0;
  setTimeout(() => run(i => { flushSync(() => set(i + 1)); root.getBoundingClientRect(); void root.offsetHeight; }, { mountMs, grain: GRAIN }), 300);
} else {
  const t0 = performance.now();
  const c = cssPalette();
  const f = faceData(SEC, PARTY);
  mountMs = performance.now() - t0; // данные лица: кольцо, сезоны, метки святых дней года
  const cv = makeCanvas(SIZE, DPR);
  root.appendChild(cv);
  const base = reteDeg(SEC), rule = hourDeg(SEC);
  // Canvas2D откладывает растр до сброса: чтение одного пикселя сбрасывает очередь и честно кладёт растр в кадр.
  const flush = () => { cv.getContext('2d')!.getImageData(0, 0, 1, 1); };
  if (R === 'canvas-full') {
    setTimeout(() => run(i => { drawFull(cv, SIZE, DPR, c, f, base + i + 1, rule); flush(); }, { mountMs }), 300);
  } else if (R === 'canvas-cached') {
    const layers = prepareCached(SIZE, DPR, c, f);
    setTimeout(() => run(i => { drawCached(cv, SIZE, DPR, c, f, layers, base + i + 1, rule); flush(); }, { mountMs }), 300);
  } else if (R === 'webgl') {
    const layers = prepareCached(SIZE, DPR, c, f);
    const g = glFace(cv, layers.plate, layers.rete);
    if (!g) { (window as unknown as { __bench: unknown }).__bench = { renderer: R, error: 'нет WebGL2' }; document.title = 'done'; }
    else setTimeout(() => run(i => { g.draw(((base + i + 1) * Math.PI) / 180); g.finish(); }, { glRenderer: g.renderer, mountMs }), 300);
  }
}
