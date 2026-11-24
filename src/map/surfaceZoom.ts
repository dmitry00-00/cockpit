import type { MapPoint } from './projection';
import { clampSurfaceTilt, projectSurface, unprojectSurface, type GeographicExtent, type SurfaceCamera } from './surfaceProjection';

const DEG = Math.PI / 180;
const SOLVE_TOLERANCE = 0.05;
const MAX_TILT = 75;

const finite = (n: number) => Number.isFinite(n);
const finitePoint = (p: MapPoint) => finite(p.x) && finite(p.y);
const wrapDegrees = (angle: number) => ((angle % 360) + 360) % 360;
const wrapNear = (angle: number, reference: number) => angle + 360 * Math.round((reference - angle) / 360);
const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

/** Longitude-to-map conversion mirrors planet.lonLatToMap's principal seam and edge behavior. */
function principalLongitude(lon: number, extent: GeographicExtent): number {
  const span = extent.lon1 - extent.lon0;
  if (span <= 0 || span > 360) return clamp(wrapNear(lon, (extent.lon0 + extent.lon1) / 2), extent.lon0, extent.lon1);
  const from = extent.lon0 - (360 - span) / 2;
  const unwrapped = from + wrapDegrees(lon - from);
  const fraction = clamp((unwrapped - extent.lon0) / span, 0, 1);
  return extent.lon0 + fraction * span;
}

function sourceCenter(extent: GeographicExtent, lon: number, lat: number): MapPoint {
  const pLon = principalLongitude(lon, extent);
  const pLat = clamp(lat, Math.min(extent.latTop, extent.latBottom), Math.max(extent.latTop, extent.latBottom));
  return {
    x: (pLon - extent.lon0) / (extent.lon1 - extent.lon0) * extent.width,
    y: (pLat - extent.latTop) / (extent.latBottom - extent.latTop) * extent.height,
  };
}

/** Every candidate camera keeps map center, globe center and latitude-dependent scale in one model. */
function cameraAtCenter(target: SurfaceCamera, extent: GeographicExtent, lon: number, lat: number): SurfaceCamera {
  const centerLat = clampSurfaceTilt(lat);
  const referenceLat = clampSurfaceTilt(target.globe.lat);
  const cosineRatio = Math.cos(centerLat * DEG) / Math.cos(referenceLat * DEG);
  const center = sourceCenter(extent, lon, centerLat);
  return {
    ...target,
    view: { ...target.view, ...center, scale: target.view.scale * cosineRatio },
    globe: { ...target.globe, lon: principalLongitude(lon, extent), lat: centerLat },
  };
}

/** Convert a seam-equivalent inverse into the source extent; points outside that frame are not guessed. */
function anchorInExtent(point: MapPoint, extent: GeographicExtent): MapPoint | null {
  if (!finitePoint(point) || !finite(extent.width) || !finite(extent.height)
      || !finite(extent.lon0) || !finite(extent.lon1) || !finite(extent.latTop) || !finite(extent.latBottom)
      || extent.width <= 0 || extent.height <= 0 || extent.lon1 <= extent.lon0 || extent.lon1 - extent.lon0 > 360
      || extent.latTop === extent.latBottom) return null;
  const lon = extent.lon0 + point.x / extent.width * (extent.lon1 - extent.lon0);
  const wrappedLon = wrapNear(lon, (extent.lon0 + extent.lon1) / 2);
  const wrapped = {
    x: (wrappedLon - extent.lon0) / (extent.lon1 - extent.lon0) * extent.width,
    y: point.y,
  };
  if (wrapped.x < -1e-7 || wrapped.x > extent.width + 1e-7
      || wrapped.y < -1e-7 || wrapped.y > extent.height + 1e-7) return null;
  return { x: clamp(wrapped.x, 0, extent.width), y: clamp(wrapped.y, 0, extent.height) };
}

interface Residual { x: number; y: number }
interface Evaluation {camera:SurfaceCamera;residual:Residual}

/** Damped finite-difference Newton solve over the two geographic camera-center coordinates. */
function solveCenter(
  anchor: MapPoint,
  screen: MapPoint,
  extent: GeographicExtent,
  target: SurfaceCamera,
): SurfaceCamera | null {
  if (!finite(target.globe.radius) || target.globe.radius < 0 || !finite(target.view.scale) || target.view.scale <= 0
      || !finite(target.vp.w) || !finite(target.vp.h)) return null;
  let lon = principalLongitude(target.globe.lon, extent);
  let lat = clampSurfaceTilt(target.globe.lat);
  const evaluate = (candidateLon: number, candidateLat: number): { camera: SurfaceCamera; residual: Residual } | null => {
    const camera = cameraAtCenter(target, extent, candidateLon, candidateLat);
    const point = projectSurface(anchor, extent, camera);
    if (!finite(point.x) || !finite(point.y) || !finite(camera.view.x) || !finite(camera.view.y) || !finite(camera.view.scale)) return null;
    return { camera, residual: { x: point.x - screen.x, y: point.y - screen.y } };
  };

  const initial = evaluate(lon,lat);
  if (!initial) return null;
  let current:Evaluation=initial;
  for (let iteration = 0; iteration < 48; iteration++) {
    const error = Math.hypot(current.residual.x, current.residual.y);
    if (error <= SOLVE_TOLERANCE && projectSurface(anchor, extent, current.camera).visible) return current.camera;

    const h = 1e-3;
    const lonA = evaluate(lon + h, lat), lonB = evaluate(lon - h, lat);
    const latPlus = Math.min(MAX_TILT, lat + h), latMinus = Math.max(-MAX_TILT, lat - h);
    const latA = evaluate(lon, latPlus), latB = evaluate(lon, latMinus);
    if (!lonA || !lonB || !latA || !latB || latPlus === latMinus) return null;
    const j00 = (lonA.residual.x - lonB.residual.x) / (2 * h);
    const j10 = (lonA.residual.y - lonB.residual.y) / (2 * h);
    const j01 = (latA.residual.x - latB.residual.x) / (latPlus - latMinus);
    const j11 = (latA.residual.y - latB.residual.y) / (latPlus - latMinus);
    const determinant = j00 * j11 - j01 * j10;
    if (!finite(determinant) || Math.abs(determinant) < 1e-10) return null;
    let stepLon = (-current.residual.x * j11 + j01 * current.residual.y) / determinant;
    let stepLat = (-j00 * current.residual.y + current.residual.x * j10) / determinant;
    if (!finite(stepLon) || !finite(stepLat)) return null;
    const maxStep = Math.max(Math.abs(stepLon), Math.abs(stepLat));
    if (maxStep > 45) { stepLon *= 45 / maxStep; stepLat *= 45 / maxStep; }

    let next: Evaluation | null = null;
    let nextLon = lon, nextLat = lat;
    for (let damping = 1; damping >= 1 / 2048; damping /= 2) {
      const candidateLon = principalLongitude(lon + stepLon * damping, extent);
      const candidateLat = clampSurfaceTilt(lat + stepLat * damping);
      const candidate = evaluate(candidateLon, candidateLat);
      if (candidate && Math.hypot(candidate.residual.x, candidate.residual.y) < error) {
        next = candidate; nextLon = candidateLon; nextLat = candidateLat; break;
      }
    }
    if (!next) return null;
    current = next; lon = nextLon; lat = nextLat;
  }
  return Math.hypot(current.residual.x, current.residual.y) <= SOLVE_TOLERANCE
    && projectSurface(anchor, extent, current.camera).visible ? current.camera : null;
}

/**
 * Preserve the geographic source point beneath a screen cursor while changing the surface camera.
 * The returned camera is coherent with Globe: map center is derived from globe lon/lat and scale
 * follows cos(latitude). Radius and morph remain those requested by `target`.
 */
export function preserveSurfaceZoomAnchor(
  previous: SurfaceCamera,
  target: SurfaceCamera,
  extent: GeographicExtent,
  screen: MapPoint,
): SurfaceCamera {
  if (!finitePoint(screen)) return target;
  const inverse = unprojectSurface(screen, extent, previous);
  const anchor = inverse && anchorInExtent(inverse, extent);
  if (!anchor) return target;
  return solveCenter(anchor, screen, extent, target) ?? target;
}
