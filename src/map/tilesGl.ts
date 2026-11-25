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
import { projectionUniforms, surfaceProjectionGLSL, type GeographicExtent, type SurfaceCamera } from './surfaceProjection';

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
  /** Все тайлы нижнего уровня текущего кадра готовы: DOM-подложку можно убрать. */
  onCoverage?: (ready: boolean) => void;
  /** География поверхности: тот же shader работает на сфере, плоскости и между ними. */
  extent?: GeographicExtent;
  sun?: number | (() => number);
  measure?: boolean;
  onInitError?: (message: string) => void;
}

export interface TilesGl {
  /** Кадр: вид карты, окно в px CSS, плотность пикселей, тайлы снизу вверх (подложка, затем уровень), без сглаживания. */
  draw(view: MapView, vp: Viewport, dpr: number, tiles: readonly GlTile[], pixelated: boolean, camera?: SurfaceCamera): void;
  /** Сколько текстур загружено и сколько грузится — для проверок и замера. */
  stats(): { ready: number; loading: number; textureBytes: number; meshBytes: number; gpuMs?: number | null };
  /** Cancel old-owner work while retaining ready textures for a projection handoff. */
  cancelPending?(): void;
  dispose(): void;
}

/** 256 текстур 256×256 с мипмапами — около 90 МБ видеопамяти: кадр 1920×1080 на плотности 2 — около 170 тайлов. */
export const TEXTURE_LIMIT = 256;

/** RGBA8 plus every generated mip level; allocation estimate, not hardware memory usage. */
export function mipTextureBytes(width: number, height: number): number {
  let w = Math.max(1, Math.floor(width)), h = Math.max(1, Math.floor(height)), bytes = 0;
  do { bytes += w*h*4; if (w===1 && h===1) break; w=Math.max(1,w>>1); h=Math.max(1,h>>1); } while (true);
  return bytes;
}

/**
 * Какие ключи выгрузить: кэш больше limit — давно не нужные кадрам первыми; ключи этого кадра (used === frame) не
 * выгружаются, даже если их больше лимита.
 */
export function evictable(used: ReadonlyMap<string, number>, limit: number, frame: number): string[] {
  if (used.size <= limit) return [];
  const old = [...used].filter(([, f]) => f < frame).sort((a, b) => a[1] - b[1]);
  return old.slice(0, used.size - limit).map(([k]) => k);
}

export async function loadTileImage(url: string, signal: AbortSignal): Promise<TileImage> {
  if (typeof createImageBitmap === 'function') {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`тайл ${url}: ${res.status}`);
    return createImageBitmap(await res.blob());
  }
  const img = new Image();
  img.decoding = 'async';
  const cancel = () => { img.src = ''; };
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  signal.addEventListener('abort', cancel, { once: true });
  try {
    img.src = url;
    await img.decode();
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  } finally {
    signal.removeEventListener('abort', cancel);
  }
  return img;
}

const VS = `#version 300 es
precision highp float;
in vec2 a_uv;
uniform vec4 u_box;
${surfaceProjectionGLSL}
out vec2 v_uv;
out float v_front;
out float v_lon;
void main() {
  vec2 p = mix(u_box.xy, u_box.zw, a_uv);
  vec3 s = surfaceProject(p);
  vec2 c = s.xy / u_vp * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, -s.z * (1.0-u_morph) * 0.5, 1.0);
  v_uv = a_uv;
  v_front = s.z;
  v_lon = u_geo.x + p.x * u_geo.z;
}`;

const FS = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
uniform float u_sun;
uniform float u_night;
in vec2 v_uv;
in float v_front;
in float v_lon;
out vec4 o;
void main() {
  if (v_front < 0.0) discard;
  float night = 1.0 - smoothstep(-0.02, 0.02, cos(v_lon-u_sun));
  vec4 c = texture(u_tex, v_uv);
  o = vec4(c.rgb * (1.0-0.62*night*u_night), c.a);
}`;

interface Entry {
  tex?: WebGLTexture;
  abort?: AbortController;
  failed?: boolean;
  bytes?: number;
}

/** Слой тайлов на канвасе (своём: у канваса один вид контекста). Нет WebGL2 или шейдер не собрался — null. */
export function createTilesGl(cv: HTMLCanvasElement, opts: TilesGlOptions = {}): TilesGl | null {
  if (typeof WebGL2RenderingContext === 'undefined') return null;
  const gl = cv.getContext('webgl2', { alpha: true, antialias: true, depth: true, stencil: false, premultipliedAlpha: true }) as WebGL2RenderingContext | null;
  if (!gl) return null;
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) return s;
    opts.onInitError?.(gl.getShaderInfoLog(s) ?? 'Shader compilation failed');
    gl.deleteShader(s);
    return null;
  };
  const vs = shader(gl.VERTEX_SHADER, VS);
  const fs = shader(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }
  const prog = gl.createProgram();
  if (!prog) {
    gl.deleteShader(vs); gl.deleteShader(fs);
    return null;
  }
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    opts.onInitError?.(gl.getProgramInfoLog(prog) ?? 'Shader link failed');
    gl.deleteProgram(prog);
    gl.deleteShader(vs); gl.deleteShader(fs);
    return null;
  }
  const U = (n: string) => gl.getUniformLocation(prog, n);
  const u = { vp: U('u_vp'), view: U('u_view'), box: U('u_box'), tex: U('u_tex'), geo: U('u_geo'), globe: U('u_globe'), morph: U('u_morph'), sun: U('u_sun'), night: U('u_night') };

  // Один квад на все тайлы: углы 0…1, место тайла — uniform u_box.
  const aUv = gl.getAttribLocation(prog, 'a_uv');
  const meshes = new Map<string, { vao: WebGLVertexArrayObject; buffer: WebGLBuffer; n: number; bytes: number }>();
  const tileMesh = (tile: GlTile, curved: boolean) => {
    const extent = opts.extent;
    const nx = curved && extent ? Math.max(1, Math.ceil((tile.box.x1-tile.box.x0) / extent.width * Math.abs(extent.lon1-extent.lon0) / 2)) : 1;
    const ny = curved && extent ? Math.max(1, Math.ceil((tile.box.y1-tile.box.y0) / extent.height * Math.abs(extent.latTop-extent.latBottom) / 2)) : 1;
    const key = `${nx}:${ny}`;
    let mesh = meshes.get(key);
    if (!mesh) {
      const uv = new Float32Array(nx*ny*12);
      let i = 0;
      for (let y=0;y<ny;y++) for (let x=0;x<nx;x++) {
        for (const [dx,dy] of [[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]]) { uv[i++]=(x+dx)/nx; uv[i++]=(y+dy)/ny; }
      }
      const vao=gl.createVertexArray()!, buffer=gl.createBuffer()!;
      gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,uv,gl.STATIC_DRAW);
      gl.enableVertexAttribArray(aUv); gl.vertexAttribPointer(aUv,2,gl.FLOAT,false,0,0);
      mesh={vao,buffer,n:uv.length/2,bytes:uv.byteLength}; meshes.set(key,mesh);
    }
    return mesh;
  };

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

  const load = opts.load ?? loadTileImage;
  const schedule = opts.schedule ?? (cb => requestAnimationFrame(cb));
  const entries = new Map<string, Entry>();
  const used = new Map<string, number>();
  let frame = 0;
  let last: Parameters<TilesGl['draw']> | null = null;
  let queued = false;
  let lost = false;
  let disposed = false;
  // https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/
  const timer = opts.measure ? gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT:number; GPU_DISJOINT_EXT:number } | null : null;
  const queries: WebGLQuery[] = [];
  let gpuMs: number | null = null;

  const redraw = () => {
    if (queued) return;
    queued = true;
    schedule(() => {
      queued = false;
      if (last && !lost && !disposed) api.draw(...last);
    });
  };

  const upload = (img: TileImage): WebGLTexture => {
    const tex = gl.createTexture();
    if (!tex) throw new Error('Texture allocation failed');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // UV (0,0) проецируется в верхний левый угол квада, как у изображения: flip Y не нужен.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
    } catch (error) {
      gl.deleteTexture(tex);
      throw error;
    }
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
      try {
        e.tex = upload(img);
        const width = 'width' in img && typeof img.width === 'number' ? img.width : 256;
        const height = 'height' in img && typeof img.height === 'number' ? img.height : 256;
        e.bytes = mipTextureBytes(width, height);
        redraw();
      } catch {
        e.failed = true;
        opts.onError?.(t);
      } finally {
        img.close?.();
      }
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
    draw(view, vp, dpr, tiles, pixelated, camera) {
      if (lost || disposed) return;
      if (timer) {
        const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT);
        while (queries.length && (disjoint || gl.getQueryParameter(queries[0],gl.QUERY_RESULT_AVAILABLE))) {
          const q=queries.shift()!;
          gpuMs=disjoint ? null : Number(gl.getQueryParameter(q,gl.QUERY_RESULT))/1e6;
          gl.deleteQuery(q);
        }
      }
      const query=timer && queries.length<3 ? gl.createQuery() : null;
      if(query)gl.beginQuery(timer!.TIME_ELAPSED_EXT,query);
      last = [view, vp, dpr, tiles, pixelated, camera];
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
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(prog);
      gl.uniform2f(u.vp, vp.w, vp.h);
      gl.uniform3f(u.view, view.x, view.y, view.scale);
      if (camera && opts.extent) {
        const uniforms = projectionUniforms(opts.extent, camera);
        gl.uniform4f(u.geo, ...uniforms.geo); gl.uniform3f(u.globe, ...uniforms.globe);
        gl.uniform1f(u.morph, uniforms.morph);
      } else {
        gl.uniform4f(u.geo,0,0,1,1); gl.uniform3f(u.globe,0,0,1); gl.uniform1f(u.morph,1);
      }
      gl.uniform1f(u.sun,(typeof opts.sun === 'function' ? opts.sun() : opts.sun ?? 0)*Math.PI/180);
      gl.uniform1f(u.night,camera ? 1-camera.morph : 0);
      gl.uniform1i(u.tex, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindSampler(0, pixelated ? pixel : smooth);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      let level: number | undefined;
      for (const t of tiles) {
        const tex = entries.get(t.url)?.tex;
        if (!tex) continue;
        if (level !== t.z) { gl.clear(gl.DEPTH_BUFFER_BIT); level=t.z; }
        const mesh = tileMesh(t, !!camera && camera.morph < 1);
        gl.bindVertexArray(mesh.vao);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform4f(u.box, t.box.x0, t.box.y0, t.box.x1, t.box.y1);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.n);
      }
      gl.bindVertexArray(null);
      if(query){gl.endQuery(timer!.TIME_ELAPSED_EXT);queries.push(query);}
      const base = Math.min(...tiles.map(t => t.z));
      opts.onCoverage?.(tiles.length > 0 && tiles.filter(t => t.z === base).every(t => !!entries.get(t.url)?.tex));
    },
    cancelPending() {
      for (const [url, entry] of entries) if (entry.abort) drop(url);
    },
    stats() {
      let ready = 0;
      let loading = 0;
      for (const e of entries.values()) {
        if (e.tex) ready++;
        else if (e.abort) loading++;
      }
      return { ready, loading, textureBytes: [...entries.values()].reduce((n,e)=>n+(e.bytes??0),0), meshBytes: [...meshes.values()].reduce((n,m)=>n+m.bytes,0), gpuMs };
    },
    dispose() {
      disposed = true;
      cv.removeEventListener('webglcontextlost', onContextLost);
      for (const url of [...entries.keys()]) drop(url);
      gl.deleteSampler(smooth);
      gl.deleteSampler(pixel);
      for (const mesh of meshes.values()) { gl.deleteBuffer(mesh.buffer); gl.deleteVertexArray(mesh.vao); }
      meshes.clear();
      for (const q of queries) gl.deleteQuery(q);
      queries.length=0;
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };
  return api;
}
