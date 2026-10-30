// Тайлы растра на WebGL2 (TASKS M18, шаг 2; решение кокпита 30.10.2026, MAP_ENGINE_RESEARCH.md): та же пирамида и тот
// же отбор тайлов, что у DOM-картинок (projection.tilesAt: уровень под масштабом и подложка на два мельче), но рисует
// их видеокарта — текстура на тайл, квад в пикселях исходника, проекция в шейдере, как у схемы (map/schemaGl.ts).
//   Почему отбор не свой: WorldMap уже знает, какие тайлы нужны кадру, и DOM-путь остаётся запасным — один список на
//   оба пути, сравнение картинок честное. Своё у ядра — только кэш текстур.
//   Загрузка: fetch → createImageBitmap (декод вне главного потока) — нет его — <img>.decode(); ответы те же, что у
//   DOM-картинок, и браузер держит их в HTTP-кэше (Cache-Control сервера тайлов), так что смена режима не качает заново.
//   Кэш текстур — LRU по кадрам: тайлы кадра не выгружаются никогда, сверх лимита уходят давно не нужные; загрузка
//   тайла, который ушёл из кадра, отменяется — при быстром сдвиге очередь не копится.
//   Мипмапы: уровень пирамиды показывается в 0,5…1 своего размера — без них уменьшение рябит; переприближение
//   (scale > 1) — без сглаживания, как image-rendering: pixelated у DOM-картинок.
// Нет WebGL2 или шейдер не собрался — null, слой рисует DOM-картинками. Контекст потерян — onLost, туда же.
import type { MapBox, MapView, Viewport } from './projection';

export interface GlTile {
  key: string;
  z: number;
  url: string;
  /** Тайл в пикселях исходника. */
  box: MapBox;
}

/** Картинка тайла, готовая к texImage2D; у ImageBitmap есть close() — память декода отдаётся сразу после загрузки. */
export type TileImage = TexImageSource & { close?: () => void };

export interface TilesGlOptions {
  /** Тайл не загрузился (404, битый файл). */
  onError?: (tile: GlTile) => void;
  /** Видеокарта отобрала контекст — слой уходит на DOM. */
  onLost?: () => void;
  /** Загрузка картинки; по умолчанию fetch → createImageBitmap или <img>.decode(). */
  load?: (url: string, signal: AbortSignal) => Promise<TileImage>;
  /** Перерисовка после загрузки тайла — один раз на кадр; по умолчанию requestAnimationFrame. */
  schedule?: (cb: () => void) => void;
  /** Сколько текстур держать (не меньше тайлов кадра). */
  limit?: number;
}

export interface TilesGl {
  /** Кадр: вид карты, окно в px CSS, плотность пикселей, тайлы снизу вверх (подложка, затем уровень), без сглаживания. */
  draw(view: MapView, vp: Viewport, dpr: number, tiles: readonly GlTile[], pixelated: boolean): void;
  /** Сколько текстур загружено и сколько грузится — для проверок и замера. */
  stats(): { ready: number; loading: number };
  dispose(): void;
}

/** 256 текстур 256×256 с мипмапами — около 90 МБ видеопамяти: кадр 1920×1080 на плотности 2 — около 170 тайлов. */
export const TEXTURE_LIMIT = 256;

/**
 * Какие ключи выгрузить: кэш больше limit — давно не нужные кадрам первыми; ключи этого кадра (used === frame) не
 * выгружаются, даже если их больше лимита.
 */
export function evictable(used: ReadonlyMap<string, number>, limit: number, frame: number): string[] {
  if (used.size <= limit) return [];
  const old = [...used].filter(([, f]) => f < frame).sort((a, b) => a[1] - b[1]);
  return old.slice(0, used.size - limit).map(([k]) => k);
}

async function loadImage(url: string, signal: AbortSignal): Promise<TileImage> {
  if (typeof createImageBitmap === 'function') {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`тайл ${url}: ${res.status}`);
    return createImageBitmap(await res.blob());
  }
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return img;
}

const VS = `#version 300 es
precision highp float;
in vec2 a_uv;
uniform vec2 u_vp;
uniform vec3 u_view;
uniform vec4 u_box;
out vec2 v_uv;
vec2 proj(vec2 p) { return (p - u_view.xy) * u_view.z + u_vp * 0.5; }
void main() {
  vec2 s = proj(mix(u_box.xy, u_box.zw, a_uv));
  vec2 c = s / u_vp * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
  v_uv = a_uv;
}`;

const FS = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 o;
void main() { o = texture(u_tex, v_uv); }`;

interface Entry {
  tex?: WebGLTexture;
  abort?: AbortController;
  failed?: boolean;
}

/** Слой тайлов на канвасе (своём: у канваса один вид контекста). Нет WebGL2 или шейдер не собрался — null. */
export function createTilesGl(cv: HTMLCanvasElement, opts: TilesGlOptions = {}): TilesGl | null {
  if (typeof WebGL2RenderingContext === 'undefined') return null;
  const gl = cv.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true }) as WebGL2RenderingContext | null;
  if (!gl) return null;
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
  const u = { vp: U('u_vp'), view: U('u_view'), box: U('u_box'), tex: U('u_tex') };

  // Один квад на все тайлы: углы 0…1, место тайла — uniform u_box.
  const vao = gl.createVertexArray()!;
  const quad = gl.createBuffer()!;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const aUv = gl.getAttribLocation(prog, 'a_uv');
  gl.enableVertexAttribArray(aUv);
  gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // Сэмплеры WebGL2 — фильтр кадра без правки каждой текстуры: сглаженный и «пиксельный» для переприближения.
  const sampler = (mag: number) => {
    const s = gl.createSampler()!;
    gl.samplerParameteri(s, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.samplerParameteri(s, gl.TEXTURE_MAG_FILTER, mag);
    gl.samplerParameteri(s, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(s, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return s;
  };
  const smooth = sampler(gl.LINEAR);
  const pixel = sampler(gl.NEAREST);

  const load = opts.load ?? loadImage;
  const schedule = opts.schedule ?? (cb => requestAnimationFrame(cb));
  const entries = new Map<string, Entry>();
  const used = new Map<string, number>();
  let frame = 0;
  let last: Parameters<TilesGl['draw']> | null = null;
  let queued = false;
  let lost = false;
  let disposed = false;

  const redraw = () => {
    if (queued) return;
    queued = true;
    schedule(() => {
      queued = false;
      if (last && !lost && !disposed) api.draw(...last);
    });
  };

  const upload = (img: TileImage): WebGLTexture => {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    img.close?.();
    return tex;
  };

  const request = (t: GlTile) => {
    const abort = new AbortController();
    const e: Entry = { abort };
    entries.set(t.url, e);
    load(t.url, abort.signal).then(img => {
      if (disposed || lost || abort.signal.aborted || entries.get(t.url) !== e) {
        img.close?.();
        return;
      }
      e.abort = undefined;
      e.tex = upload(img);
      redraw();
    }, () => {
      if (disposed || abort.signal.aborted || entries.get(t.url) !== e) return;
      e.abort = undefined;
      e.failed = true;
      opts.onError?.(t);
    });
  };

  const drop = (url: string) => {
    const e = entries.get(url);
    if (!e) return;
    e.abort?.abort();
    if (e.tex) gl.deleteTexture(e.tex);
    entries.delete(url);
    used.delete(url);
  };

  const onContextLost = (ev: Event) => {
    ev.preventDefault();
    lost = true;
    opts.onLost?.();
  };
  cv.addEventListener('webglcontextlost', onContextLost);

  const api: TilesGl = {
    draw(view, vp, dpr, tiles, pixelated) {
      if (lost || disposed) return;
      last = [view, vp, dpr, tiles, pixelated];
      frame++;
      for (const t of tiles) {
        used.set(t.url, frame);
        if (!entries.has(t.url)) request(t);
      }
      // Ушедшие из кадра загрузки — отменить; сверх лимита — выгрузить давно не нужные.
      for (const [url, e] of entries) if (e.abort && used.get(url)! < frame) drop(url);
      for (const url of evictable(used, Math.max(opts.limit ?? TEXTURE_LIMIT, tiles.length), frame)) drop(url);

      const w = Math.round(vp.w * dpr);
      const h = Math.round(vp.h * dpr);
      if (cv.width !== w) cv.width = w;
      if (cv.height !== h) cv.height = h;
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      gl.uniform2f(u.vp, vp.w, vp.h);
      gl.uniform3f(u.view, view.x, view.y, view.scale);
      gl.uniform1i(u.tex, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindSampler(0, pixelated ? pixel : smooth);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(vao);
      for (const t of tiles) {
        const tex = entries.get(t.url)?.tex;
        if (!tex) continue;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform4f(u.box, t.box.x0, t.box.y0, t.box.x1, t.box.y1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.bindVertexArray(null);
    },
    stats() {
      let ready = 0;
      let loading = 0;
      for (const e of entries.values()) {
        if (e.tex) ready++;
        else if (e.abort) loading++;
      }
      return { ready, loading };
    },
    dispose() {
      disposed = true;
      cv.removeEventListener('webglcontextlost', onContextLost);
      for (const url of [...entries.keys()]) drop(url);
      gl.deleteSampler(smooth);
      gl.deleteSampler(pixel);
      gl.deleteBuffer(quad);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };
  return api;
}
