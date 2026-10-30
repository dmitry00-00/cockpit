// Схема карты на WebGL2 (TASKS M18, решение кокпита 30.10.2026, MAP_ENGINE_RESEARCH.md): та же картинка, что
// fillSchema на Canvas2D, но заливка — на видеокарте. Замер исследования: весь мир на плотности 2 — 110 мс кадра на
// Canvas2D против 2–4,5 мс здесь; упирается не наш код, а растеризация заливок канвасом.
//   Заливка even-odd без триангуляции: каждое кольцо — веер треугольников от первой вершины, бит стенсила
//   переворачивается на каждом покрытии, чётность — как у Path2D 'evenodd'. Бит 0 — суша, биты 1…7 — классы
//   SCHEMA_ORDER; класс красится только там, где и его бит, и бит суши (клип по суше, как в fillSchema).
//   Линии — квады на отрезок, толщина в px экрана в вершинном шейдере; квад продлён на полтолщины — стыки без щелей,
//   как lineCap 'round' у канваса (у штрих-пунктира границ — без продления, как 'butt').
//   Проекция в шейдере — пока плоскость (вид карты); глобус ляжет сюда же смешением с шаром (M18, шаг 3) — поэтому
//   у линии вторая точка, а не направление: на шаре направление считается после проекции.
// Буферы строятся один раз на схему; кадр — только uniform-ы. Нет WebGL2 или стенсила — null, слой рисует Canvas2D.
import { SCHEMA_ORDER, type MapSchema } from './schema';
import { BORDER_DASH, BORDER_WIDTH, riverWidth } from './schemaDraw';
import type { MapView, Viewport } from './projection';

type Rings = readonly (readonly number[])[];

const VS = `#version 300 es
precision highp float;
in vec2 a_p;
in vec2 a_q;
in float a_side;
in float a_d;
uniform vec2 u_vp;
uniform vec3 u_view;
uniform float u_w;
uniform float u_cap;
out float v_d;
vec2 proj(vec2 p) { return (p - u_view.xy) * u_view.z + u_vp * 0.5; }
void main() {
  vec2 s = proj(a_p);
  if (u_w > 0.0) {
    vec2 dir = normalize(proj(a_q) - s + 1e-6);
    s += vec2(-dir.y, dir.x) * a_side * u_w * 0.5 - dir * u_cap * u_w * 0.5;
  }
  v_d = a_d * u_view.z;
  vec2 c = s / u_vp * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}`;

// Штрих-пунктир границ в px экрана: штрих, просвет, точка, просвет — BORDER_DASH.
const [D0, D1, D2, D3] = BORDER_DASH;
const FS = `#version 300 es
precision mediump float;
uniform vec3 u_c;
uniform float u_dash;
in float v_d;
out vec4 o;
void main() {
  if (u_dash > 0.0) {
    float m = mod(v_d, ${(D0 + D1 + D2 + D3).toFixed(1)});
    if ((m > ${D0.toFixed(1)} && m < ${(D0 + D1).toFixed(1)}) || m > ${(D0 + D1 + D2).toFixed(1)}) discard;
  }
  o = vec4(u_c, 1.0);
}`;

interface Mesh {
  vao: WebGLVertexArrayObject;
  n: number;
}

export interface SchemaGl {
  /** Кадр: вид карты, окно в px CSS, плотность пикселей, цвет токена. Дороги — толщиной по масштабу, как у Canvas2D. */
  draw(view: MapView, vp: Viewport, dpr: number, color: (token: string) => string): void;
  dispose(): void;
}

/** Цвет токена → RGB 0…1: через 2D-канвас, он понимает любой синтаксис CSS (hex, rgb, oklch). */
function rgbOf(): (css: string) => [number, number, number] {
  const ctx = document.createElement('canvas').getContext('2d');
  const cache = new Map<string, [number, number, number]>();
  return css => {
    let v = cache.get(css);
    if (v) return v;
    v = [0.5, 0.5, 0.5];
    if (ctx) {
      ctx.fillStyle = '#000';
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      v = [d[0] / 255, d[1] / 255, d[2] / 255];
    }
    cache.set(css, v);
    return v;
  };
}

/**
 * Рендер схемы на канвасе (отдельном: у канваса один вид контекста). Нет WebGL2, стенсила или шейдер не собрался —
 * null. onLost — видеокарта отобрала контекст (сон, смена GPU): слой уходит на Canvas2D.
 */
export function createSchemaGl(cv: HTMLCanvasElement, schema: MapSchema, onLost?: () => void): SchemaGl | null {
  if (typeof WebGL2RenderingContext === 'undefined') return null;
  const gl = cv.getContext('webgl2', { stencil: true, antialias: true, depth: false, premultipliedAlpha: true });
  if (!gl || !(gl.getContextAttributes()?.stencil)) return null;
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = shader(gl.VERTEX_SHADER, VS);
  const fs = shader(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  const U = (n: string) => gl.getUniformLocation(prog, n);
  const u = { vp: U('u_vp'), view: U('u_view'), w: U('u_w'), cap: U('u_cap'), c: U('u_c'), dash: U('u_dash') };
  const A = { p: gl.getAttribLocation(prog, 'a_p'), q: gl.getAttribLocation(prog, 'a_q'), side: gl.getAttribLocation(prog, 'a_side'), d: gl.getAttribLocation(prog, 'a_d') };
  const buffers: WebGLBuffer[] = [];
  const vaos: WebGLVertexArrayObject[] = [];

  const mesh = (attrs: readonly [number, Float32Array, number][], n: number): Mesh => {
    const vao = gl.createVertexArray()!;
    vaos.push(vao);
    gl.bindVertexArray(vao);
    for (const loc of [A.p, A.q, A.side, A.d]) gl.disableVertexAttribArray(loc);
    for (const [loc, data, size] of attrs) {
      const b = gl.createBuffer()!;
      buffers.push(b);
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    }
    gl.bindVertexArray(null);
    return { vao, n };
  };

  // Веера колец: (v0, vi, vi+1) — чётность покрытия даёт even-odd без иерархии колец и без триангуляции.
  const fans = (rings: Rings): Mesh => {
    let total = 0;
    for (const r of rings) if (r.length >= 6) total += (r.length / 2 - 2) * 6;
    const v = new Float32Array(total);
    let k = 0;
    for (const r of rings) {
      const n = r.length / 2;
      for (let i = 1; i < n - 1; i++) {
        v[k++] = r[0]; v[k++] = r[1];
        v[k++] = r[2 * i]; v[k++] = r[2 * i + 1];
        v[k++] = r[2 * i + 2]; v[k++] = r[2 * i + 3];
      }
    }
    return mesh([[A.p, v, 2]], total / 2);
  };

  // Линии: на отрезок два треугольника; у вершины — её точка, соседняя точка отрезка, сторона и путь от начала линии.
  const lines = (ls: Rings, closed: boolean): Mesh => {
    const P: number[] = [];
    const Q: number[] = [];
    const S: number[] = [];
    const D: number[] = [];
    for (const l of ls) {
      const n = l.length / 2;
      if (n < 2) continue;
      let d = 0;
      for (let i = 0; i < (closed ? n : n - 1); i++) {
        const j = (i + 1) % n;
        const ax = l[2 * i], ay = l[2 * i + 1], bx = l[2 * j], by = l[2 * j + 1];
        const len = Math.hypot(bx - ax, by - ay);
        // У вершины b соседняя — a: направление развёрнуто, поэтому сторона у неё с обратным знаком.
        const quad: [number, number, number, number, number, number][] = [
          [ax, ay, bx, by, 1, d], [ax, ay, bx, by, -1, d], [bx, by, ax, ay, 1, d + len],
          [ax, ay, bx, by, 1, d], [bx, by, ax, ay, 1, d + len], [bx, by, ax, ay, -1, d + len],
        ];
        for (const [px, py, qx, qy, s, dd] of quad) {
          P.push(px, py);
          Q.push(qx, qy);
          S.push(s);
          D.push(dd);
        }
        d += len;
      }
    }
    return mesh([[A.p, new Float32Array(P), 2], [A.q, new Float32Array(Q), 2], [A.side, new Float32Array(S), 1], [A.d, new Float32Array(D), 1]], S.length);
  };

  const land = fans(schema.land);
  const regions = SCHEMA_ORDER.flatMap((code, i) => (schema.regions[code]?.length ? [{ code, bit: 2 << i, mesh: fans(schema.regions[code]!) }] : []));
  const coast = lines(schema.land, true);
  const rivers = lines(schema.rivers ?? [], false);
  const borders = lines(schema.borders ?? [], false);
  const roads = lines(schema.roads, false);
  const rgb = rgbOf();
  let lost = false;
  const onContextLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    onLost?.();
  };
  cv.addEventListener('webglcontextlost', onContextLost);

  const drawMesh = (m: Mesh) => {
    if (!m.n) return;
    gl.bindVertexArray(m.vao);
    gl.drawArrays(gl.TRIANGLES, 0, m.n);
  };

  return {
    draw(view, vp, dpr, color) {
      if (lost) return;
      const w = Math.round(vp.w * dpr);
      const h = Math.round(vp.h * dpr);
      if (cv.width !== w) cv.width = w;
      if (cv.height !== h) cv.height = h;
      gl.viewport(0, 0, w, h);
      gl.useProgram(prog);
      const col = (token: string) => gl.uniform3f(u.c, ...rgb(color(token)));
      const [r, g, b] = rgb(color('terrain-o'));
      gl.clearColor(r, g, b, 1);
      gl.clearStencil(0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      gl.uniform2f(u.vp, vp.w, vp.h);
      gl.uniform3f(u.view, view.x, view.y, view.scale);
      gl.uniform1f(u.w, 0);
      gl.uniform1f(u.cap, 0);
      gl.uniform1f(u.dash, 0);
      // Стенсил: сначала чётность покрытий (цвет не пишется), потом заливка по маске.
      gl.enable(gl.STENCIL_TEST);
      gl.colorMask(false, false, false, false);
      gl.stencilFunc(gl.ALWAYS, 0, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
      gl.stencilMask(1);
      drawMesh(land);
      for (const rg of regions) {
        gl.stencilMask(rg.bit);
        drawMesh(rg.mesh);
      }
      gl.colorMask(true, true, true, true);
      gl.stencilMask(0);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      gl.stencilFunc(gl.EQUAL, 1, 1);
      col('terrain-g');
      drawMesh(land);
      for (const rg of regions) {
        gl.stencilFunc(gl.EQUAL, rg.bit | 1, rg.bit | 1);
        col(`terrain-${rg.code}`);
        drawMesh(rg.mesh);
      }
      gl.disable(gl.STENCIL_TEST);
      // Линии — порядок fillSchema, затем дороги, как у SchemaLayer.
      gl.uniform1f(u.cap, 1);
      gl.uniform1f(u.w, riverWidth(view.scale));
      col('terrain-o');
      drawMesh(rivers);
      gl.uniform1f(u.w, 1);
      col('lo');
      drawMesh(coast);
      gl.uniform1f(u.cap, 0);
      gl.uniform1f(u.dash, 1);
      gl.uniform1f(u.w, BORDER_WIDTH);
      col('map-border');
      drawMesh(borders);
      gl.uniform1f(u.dash, 0);
      gl.uniform1f(u.cap, 1);
      gl.uniform1f(u.w, Math.max(1, Math.min(2.5, view.scale * 6)));
      col('gd');
      drawMesh(roads);
      gl.bindVertexArray(null);
    },
    dispose() {
      cv.removeEventListener('webglcontextlost', onContextLost);
      for (const b of buffers) gl.deleteBuffer(b);
      for (const v of vaos) gl.deleteVertexArray(v);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };
}
