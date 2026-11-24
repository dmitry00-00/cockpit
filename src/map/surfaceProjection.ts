import type { MapPoint, MapView, Viewport } from './projection';

/** Geographic frame shared by the flat map and the planet surface. */
export interface GeographicExtent {
  lon0: number;
  lon1: number;
  latTop: number;
  latBottom: number;
  width: number;
  height: number;
}

export interface SurfaceCamera {
  view: MapView;
  vp: Viewport;
  globe: { lon: number; lat: number; radius: number };
  /** 0 is the orthographic globe; 1 is the exact existing flat MapView. */
  morph: number;
}

export interface SurfacePoint {
  x: number;
  y: number;
  depth: number;
  front: number;
  visible: boolean;
}

export interface SurfaceUniforms {
  /** lon0 radians, latTop radians, longitude radians/source-pixel, signed latitude radians/source-pixel. */
  geo: readonly [number, number, number, number];
  /** center longitude radians, clamped center latitude radians, radius in CSS pixels. */
  globe: readonly [number, number, number];
  morph: number;
  /** map center x, map center y, screen pixels/source-pixel. */
  view: readonly [number, number, number];
  /** viewport width and height in CSS pixels. */
  vp: readonly [number, number];
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const MAX_TILT_DEG = 75;
const INVERSE_TOLERANCE_PX = 0.001;
// Mixed sphere/plane projections can fold. A bounded source-frame seed grid lets the
// inverse find the front visible sheet without turning an unprojection into a map scan.
const MIXED_INVERSE_GRID_STEPS = 4;
const MIXED_INVERSE_MAX_STARTS = 27;

const finite = (n: number) => Number.isFinite(n);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** UI-camera limit only; it says nothing about a planet's canonical axial tilt. */
export function clampSurfaceTilt(degrees: number): number {
  if (!finite(degrees)) return 0;
  return Math.min(MAX_TILT_DEG, Math.max(-MAX_TILT_DEG, degrees));
}

function validExtent(e: GeographicExtent): boolean {
  return finite(e.lon0) && finite(e.lon1) && finite(e.latTop) && finite(e.latBottom)
    && finite(e.width) && finite(e.height) && e.width !== 0 && e.height !== 0
    && e.lon1 !== e.lon0 && e.latBottom !== e.latTop;
}

function cameraValues(camera: SurfaceCamera) {
  const morph = finite(camera.morph) ? clamp01(camera.morph) : 0;
  const radius = camera.globe.radius;
  const scale = camera.view.scale;
  if (!finite(radius) || radius < 0 || !finite(scale) || scale === 0
      || !finite(camera.view.x) || !finite(camera.view.y)
      || !finite(camera.vp.w) || !finite(camera.vp.h)
      || !finite(camera.globe.lon) || !finite(camera.globe.lat)) return null;
  return {
    morph,
    radius,
    scale,
    centerLon: camera.globe.lon * DEG_TO_RAD,
    centerLat: clampSurfaceTilt(camera.globe.lat) * DEG_TO_RAD,
  };
}

function surfaceCoordinates(p: MapPoint, e: GeographicExtent) {
  const lon = (e.lon0 + (p.x / e.width) * (e.lon1 - e.lon0)) * DEG_TO_RAD;
  const lat = (e.latTop + (p.y / e.height) * (e.latBottom - e.latTop)) * DEG_TO_RAD;
  return { lon, lat };
}

/** Project a source-map point onto the orthographic surface, continuously morphing to the exact flat map. */
export function projectSurface(p: MapPoint, extent: GeographicExtent, camera: SurfaceCamera): SurfacePoint {
  const c = cameraValues(camera);
  if (!c || !validExtent(extent) || !finite(p.x) || !finite(p.y)) {
    return { x: Number.NaN, y: Number.NaN, depth: Number.NaN, front: Number.NaN, visible: false };
  }
  const { lon, lat } = surfaceCoordinates(p, extent);
  const delta = lon - c.centerLon;
  const cosLat = Math.cos(lat), sinLat = Math.sin(lat);
  const cosCenter = Math.cos(c.centerLat), sinCenter = Math.sin(c.centerLat);
  const dx = cosLat * Math.sin(delta);
  const dy = sinCenter * cosLat * Math.cos(delta) - cosCenter * sinLat;
  const depth = cosCenter * cosLat * Math.cos(delta) + sinCenter * sinLat;
  const sphereX = camera.vp.w / 2 + c.radius * dx;
  const sphereY = camera.vp.h / 2 + c.radius * dy;
  const flatX = (p.x - camera.view.x) * c.scale + camera.vp.w / 2;
  const flatY = (p.y - camera.view.y) * c.scale + camera.vp.h / 2;
  const x = sphereX + (flatX - sphereX) * c.morph;
  const y = sphereY + (flatY - sphereY) * c.morph;
  const front = depth + (1 - depth) * c.morph;
  return { x, y, depth, front, visible: front >= 0 };
}

function sourcePoint(lonRad: number, latRad: number, e: GeographicExtent): MapPoint {
  const lon = lonRad * RAD_TO_DEG;
  const lat = latRad * RAD_TO_DEG;
  return {
    x: ((lon - e.lon0) / (e.lon1 - e.lon0)) * e.width,
    y: ((lat - e.latTop) / (e.latBottom - e.latTop)) * e.height,
  };
}

function sphereInverse(screen: MapPoint, e: GeographicExtent, camera: SurfaceCamera): MapPoint | null {
  const c = cameraValues(camera);
  if (!c || c.radius <= 0) return null;
  const x = (screen.x - camera.vp.w / 2) / c.radius;
  const y = (screen.y - camera.vp.h / 2) / c.radius;
  const rr = x * x + y * y;
  if (rr > 1 + 1e-10) return null;
  const depth = Math.sqrt(Math.max(0, 1 - rr));
  const sinCenter = Math.sin(c.centerLat), cosCenter = Math.cos(c.centerLat);
  const cosLatCosDelta = sinCenter * y + cosCenter * depth;
  const sinLat = sinCenter * depth - cosCenter * y;
  const lat = Math.asin(Math.min(1, Math.max(-1, sinLat)));
  const delta = Math.atan2(x, cosLatCosDelta);
  return sourcePoint(c.centerLon + delta, lat, e);
}

interface Residual {
  point: MapPoint;
  dx: number;
  dy: number;
  length: number;
  front: number;
}

function residualAt(p: MapPoint, target: MapPoint, e: GeographicExtent, camera: SurfaceCamera): Residual | null {
  const q = projectSurface(p, e, camera);
  if (!finite(q.x) || !finite(q.y) || q.front < -1e-9) return null;
  const dx = q.x - target.x, dy = q.y - target.y;
  return { point: p, dx, dy, length: Math.hypot(dx, dy), front: q.front };
}

function derivative(
  p: MapPoint,
  axis: 'x' | 'y',
  h: number,
  target: MapPoint,
  e: GeographicExtent,
  camera: SurfaceCamera,
  center: Residual,
): [number, number] | null {
  const plus = { ...p, [axis]: p[axis] + h };
  const minus = { ...p, [axis]: p[axis] - h };
  const a = residualAt(plus, target, e, camera);
  const b = residualAt(minus, target, e, camera);
  if (a && b) return [(a.dx - b.dx) / (2 * h), (a.dy - b.dy) / (2 * h)];
  if (a) return [(a.dx - center.dx) / h, (a.dy - center.dy) / h];
  if (b) return [(center.dx - b.dx) / h, (center.dy - b.dy) / h];
  return null;
}

function solveFrom(
  start: MapPoint,
  target: MapPoint,
  e: GeographicExtent,
  camera: SurfaceCamera,
): MapPoint | null {
  const hx = Math.max(1e-4, Math.abs(e.width) * 1e-6);
  const hy = Math.max(1e-4, Math.abs(e.height) * 1e-6);
  let current = residualAt(start, target, e, camera);
  if (!current) return null;
  if (current.length <= INVERSE_TOLERANCE_PX) return current.point;

  for (let i = 0; i < 40; i++) {
    const ax = derivative(current.point, 'x', hx, target, e, camera, current);
    const ay = derivative(current.point, 'y', hy, target, e, camera, current);
    if (!ax || !ay) return null;
    const det = ax[0] * ay[1] - ay[0] * ax[1];
    if (!finite(det) || Math.abs(det) < 1e-14) return null;
    const stepX = (-current.dx * ay[1] + ay[0] * current.dy) / det;
    const stepY = (-ax[0] * current.dy + current.dx * ax[1]) / det;
    if (!finite(stepX) || !finite(stepY)) return null;

    let improved: Residual | null = null;
    for (let damping = 1; damping >= 1 / 4096; damping /= 2) {
      const candidate = residualAt({ x: current.point.x + stepX * damping, y: current.point.y + stepY * damping }, target, e, camera);
      if (candidate && candidate.length < current.length) {
        improved = candidate;
        break;
      }
    }
    if (!improved) return null;
    current = improved;
    if (current.length <= INVERSE_TOLERANCE_PX) return current.point;
  }
  return current.length <= INVERSE_TOLERANCE_PX && current.front >= 0 ? current.point : null;
}

/** Invert the surface projection. Mixed projections use a damped finite-difference Newton solve. */
export function unprojectSurface(screen: MapPoint, extent: GeographicExtent, camera: SurfaceCamera): MapPoint | null {
  const c = cameraValues(camera);
  if (!c || !validExtent(extent) || !finite(screen.x) || !finite(screen.y)) return null;
  if (c.morph === 1) {
    return {
      x: (screen.x - camera.vp.w / 2) / c.scale + camera.view.x,
      y: (screen.y - camera.vp.h / 2) / c.scale + camera.view.y,
    };
  }
  if (c.morph === 0) return sphereInverse(screen, extent, camera);

  const flatStart = {
    x: (screen.x - camera.vp.w / 2) / c.scale + camera.view.x,
    y: (screen.y - camera.vp.h / 2) / c.scale + camera.view.y,
  };
  const sphereStart = sphereInverse(screen, extent, camera);
  const starts = c.morph < 0.5
    ? [sphereStart, flatStart]
    : [flatStart, sphereStart];
  const seeds: MapPoint[] = [];
  for (const start of starts) {
    if (start) seeds.push(start);
  }
  for (let y = 0; y <= MIXED_INVERSE_GRID_STEPS; y++) {
    for (let x = 0; x <= MIXED_INVERSE_GRID_STEPS; x++) {
      if (seeds.length >= MIXED_INVERSE_MAX_STARTS) break;
      seeds.push({
        x: extent.width * x / MIXED_INVERSE_GRID_STEPS,
        y: extent.height * y / MIXED_INVERSE_GRID_STEPS,
      });
    }
  }

  let best: { point: MapPoint; residual: number; front: number } | null = null;
  const solutions: MapPoint[] = [];
  for (const start of seeds) {
    const p = solveFrom(start, screen, extent, camera);
    if (!p || solutions.some(other => Math.hypot(other.x - p.x, other.y - p.y) < 1e-3)) continue;
    // Mixed tiles only cover the authored geographic frame. Ignore other mathematical
    // preimages outside that frame; they have no drawable map content to anchor to.
    if (p.x < -1e-7 || p.x > extent.width + 1e-7 || p.y < -1e-7 || p.y > extent.height + 1e-7) continue;
    const q = residualAt(p, screen, extent, camera);
    if (!q || q.front < 0 || q.length > INVERSE_TOLERANCE_PX) continue;
    solutions.push(p);
    // WebGL depth uses -front: among overlapping visible sheets, the largest front value wins.
    if (!best || q.front > best.front || (q.front === best.front && q.length < best.residual)) {
      best = { point: p, residual: q.length, front: q.front };
    }
  }
  return best?.point ?? null;
}

/** Uniform values use the same degree-to-radian constant as the CPU projector and GLSL source. */
export function projectionUniforms(extent: GeographicExtent, camera: SurfaceCamera): SurfaceUniforms {
  const c = cameraValues(camera);
  if (!validExtent(extent) || !c) throw new RangeError('Invalid geographic extent or surface camera');
  return {
    geo: [
      extent.lon0 * DEG_TO_RAD,
      extent.latTop * DEG_TO_RAD,
      ((extent.lon1 - extent.lon0) / extent.width) * DEG_TO_RAD,
      ((extent.latBottom - extent.latTop) / extent.height) * DEG_TO_RAD,
    ],
    globe: [c.centerLon, c.centerLat, c.radius],
    morph: c.morph,
    view: [camera.view.x, camera.view.y, c.scale],
    vp: [camera.vp.w, camera.vp.h],
  };
}

const GLSL_DEG_TO_RAD = DEG_TO_RAD.toPrecision(17);

/** GLSL 300 ES projection shared by schema vertices and raster-tile vertices. */
export const surfaceProjectionGLSL = `
const float SURFACE_DEG_TO_RAD = ${GLSL_DEG_TO_RAD};
uniform vec4 u_geo;
uniform vec3 u_globe;
uniform float u_morph;
uniform vec3 u_view;
uniform vec2 u_vp;
vec3 surfaceProject(vec2 p) {
  float lon = u_geo.x + p.x * u_geo.z;
  float lat = u_geo.y + p.y * u_geo.w;
  float delta = lon - u_globe.x;
  float cLat = cos(lat);
  float sLat = sin(lat);
  float cCenter = cos(u_globe.y);
  float sCenter = sin(u_globe.y);
  float dx = cLat * sin(delta);
  float dy = sCenter * cLat * cos(delta) - cCenter * sLat;
  float depth = cCenter * cLat * cos(delta) + sCenter * sLat;
  vec2 sphere = u_vp * 0.5 + u_globe.z * vec2(dx, dy);
  vec2 plane = (p - u_view.xy) * u_view.z + u_vp * 0.5;
  return vec3(mix(sphere, plane, u_morph), mix(depth, 1.0, u_morph));
}`;
