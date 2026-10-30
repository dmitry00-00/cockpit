// И5, замер: астролябия на WebGL2 — плита и решётка как две текстуры (растр канваса из canvasFace.ts), кадр — два
// четырёхугольника, решётка поворачивается в вершинном шейдере. Подписей WebGL сам не рисует: текст всё равно
// растрируется канвасом, поэтому WebGL здесь — то же «нарисовать один раз и вращать», что композитор делает для
// слоя SVG с CSS-трансформом. Ядро карты (src/map/schemaGl.ts) не трогается: свой маленький контекст.
const VS = `#version 300 es
in vec2 p; uniform float a; out vec2 uv;
void main(){ uv = p*0.5+0.5; uv.y = 1.0-uv.y; float c = cos(a), s = sin(a); gl_Position = vec4(c*p.x + s*p.y, -s*p.x + c*p.y, 0, 1); }`;
const FS = `#version 300 es
precision mediump float; in vec2 uv; uniform sampler2D t; out vec4 o;
void main(){ o = texture(t, uv); }`;

export interface GlFace { draw(reteRad: number): void; finish(): void; renderer: string; dispose(): void }

export function glFace(cv: HTMLCanvasElement, plate: HTMLCanvasElement, rete: HTMLCanvasElement): GlFace | null {
  const gl = cv.getContext('webgl2', { premultipliedAlpha: true, antialias: false });
  if (!gl) return null;
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader'); return s; };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = (src: HTMLCanvasElement) => {
    const t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const tPlate = tex(plate), tRete = tex(rete);
  const ua = gl.getUniformLocation(prog, 'a');
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.viewport(0, 0, cv.width, cv.height);
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  return {
    renderer,
    draw(a) {
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(ua, 0); gl.bindTexture(gl.TEXTURE_2D, tPlate); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.uniform1f(ua, a); gl.bindTexture(gl.TEXTURE_2D, tRete); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    finish() { gl.finish(); },
    dispose() { gl.deleteTexture(tPlate); gl.deleteTexture(tRete); gl.deleteBuffer(buf); gl.deleteProgram(prog); },
  };
}
