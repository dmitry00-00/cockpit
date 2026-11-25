import { describe, expect, it } from 'vitest';
import { lonLatToMap, mapScaleForGlobe, type PlanetMask } from './planet';
import { clampSurfaceTilt, projectSurface, type GeographicExtent, type SurfaceCamera } from './surfaceProjection';
import { preserveSurfaceZoomAnchor } from './surfaceZoom';

const extent: GeographicExtent = { lon0: 350, lon1: 390, latTop: 55, latBottom: -35, width: 800, height: 600 };
const size = { width: extent.width, height: extent.height };
const mask:PlanetMask = { id:'test',label:'test',w:1,h:1,grid:['o'],regions:[],source: { extent: [extent.lon0, extent.lon1, extent.latTop, extent.latBottom] } };
const camera = (morph: number, globe = { lon: 0, lat: 10, radius: 230 }): SurfaceCamera => {
  const lat = clampSurfaceTilt(globe.lat);
  const center = lonLatToMap(mask, size, { lon: globe.lon, lat });
  return {
    view: { ...center, scale: mapScaleForGlobe(mask, size, globe.radius, lat) },
    vp: { w: 800, h: 600 }, globe: { ...globe, lat }, morph,
  };
};

function expectCoherent(result: SurfaceCamera, reference: SurfaceCamera) {
  const center = lonLatToMap(mask, size, { lon: result.globe.lon, lat: result.globe.lat });
  expect(result.view.x).toBeCloseTo(center.x, 7);
  expect(result.view.y).toBeCloseTo(center.y, 7);
  expect(result.view.scale).toBeCloseTo(reference.view.scale * Math.cos(result.globe.lat * Math.PI / 180)
    / Math.cos(reference.globe.lat * Math.PI / 180), 7);
  expect(Math.abs(result.globe.lat)).toBeLessThanOrEqual(75);
}

function expectAnchor(result: SurfaceCamera, reference: SurfaceCamera, source: { x: number; y: number }, screen: { x: number; y: number }) {
  const projected = projectSurface(source, extent, result);
  expect(Number.isFinite(result.view.x) && Number.isFinite(result.view.y) && Number.isFinite(result.view.scale)).toBe(true);
  expect(Number.isFinite(result.globe.lon) && Number.isFinite(result.globe.lat)).toBe(true);
  expectCoherent(result, reference);
  expect(Math.hypot(projected.x - screen.x, projected.y - screen.y)).toBeLessThanOrEqual(0.25);
}

describe('surface zoom anchor preservation', () => {
  it('keeps the same world point under the cursor across sphere radius and center changes', () => {
    const previous = camera(0, { lon: 4, lat: 14, radius: 240 });
    const source = { x: 470, y: 280 };
    const screen = projectSurface(source, extent, previous);
    const target = camera(0, { lon: -12, lat: -8, radius: 175 });
    const result = preserveSurfaceZoomAnchor(previous, target, extent, screen);
    expectAnchor(result, target, source, screen);
    expect(result.globe.radius).toBe(target.globe.radius);
    expect(result.morph).toBe(target.morph);
  });

  it('preserves an anchor during mixed morph while deriving view from the solved globe center', () => {
    const previous = camera(0.22, { lon: 355, lat: 15, radius: 225 });
    const source = { x: 425, y: 260 };
    const screen = projectSurface(source, extent, previous);
    const target = camera(0.58, { lon: 8, lat: -4, radius: 270 });
    const result = preserveSurfaceZoomAnchor(previous, target, extent, screen);
    expectAnchor(result, target, source, screen);
    expect(result.morph).toBe(target.morph);
  });

  it('keeps the flat endpoint anchored with a coherent latitude-scaled view', () => {
    const previous = camera(0.7, { lon: 2, lat: 12, radius: 215 });
    const source = { x: 520, y: 230 };
    const screen = projectSurface(source, extent, previous);
    const target = camera(1, { lon: 365, lat: 30, radius: 1000 });
    const result = preserveSurfaceZoomAnchor(previous, target, extent, screen);
    expectAnchor(result, target, source, screen);
    expect(result.globe.radius).toBe(1000);
  });

  it('wraps an inverse longitude through the principal seam without a camera jump', () => {
    const previous = camera(0, { lon: 0, lat: 0, radius: 230 });
    const source = { x: 300, y: 290 }; // longitude 365°, equivalent to 5° across the seam
    const screen = projectSurface(source, extent, previous);
    const target = camera(0, { lon: 358, lat: -5, radius: 190 });
    const result = preserveSurfaceZoomAnchor(previous, target, extent, screen);
    expectAnchor(result, target, source, screen);
    expect(result.globe.lon).toBeGreaterThanOrEqual(extent.lon0);
    expect(result.globe.lon).toBeLessThanOrEqual(extent.lon1);
  });

  it('returns the target unchanged when the cursor inverse fails or lies outside the map extent', () => {
    const previous = camera(0);
    const target = camera(0.4, { lon: 12, lat: -3, radius: 260 });
    expect(preserveSurfaceZoomAnchor(previous, target, extent, { x: 800, y: 300 })).toBe(target);
    expect(preserveSurfaceZoomAnchor(previous, target, extent, { x: 20, y: 20 })).toBe(target);
  });

  it('keeps a finite constrained camera for a diagnostic center outside Toril coverage', () => {
    // Diagnostic-only: Toril's covers() excludes lat=-75 (latBottom=-61), so wheel zoom cannot reach this camera.
    const toril: GeographicExtent = { lon0: 27, lon1: 327, latTop: 88, latBottom: -61, width: 30600, height: 13400 };
    const torilMask: PlanetMask = { ...mask, source: { extent: [27, 327, 88, -61] } };
    const torilSize = { width: toril.width, height: toril.height };
    const makeCamera = (radius: number, lat = -75): SurfaceCamera => ({
      view: {
        ...lonLatToMap(torilMask, torilSize, { lon: 27, lat }),
        scale: mapScaleForGlobe(torilMask, torilSize, radius, lat),
      },
      vp: { w: 1200, h: 700 }, globe: { lon: 27, lat, radius }, morph: 0.5,
    });
    const previous = makeCamera(338);
    const source = { x: 22950, y: 11390 };
    const screen = projectSurface(source, toril, previous);
    // Keep target center fixed at the actual clamped camera; only radius and coherent cos(lat) scale change.
    const target = makeCamera(400);
    const result = preserveSurfaceZoomAnchor(previous, target, toril, screen);
    const anchored = projectSurface(source, toril, result);
    expect([anchored.x,anchored.y,result.view.scale,result.globe.lat,result.globe.lon].every(Number.isFinite)).toBe(true);
    expect(result.globe.radius).toBe(400);
    expect(Math.abs(result.globe.lat)).toBeLessThanOrEqual(75);

    // The bounded tilt itself does not make this anchor impossible: this separate coherent center
    // projects it within 0.016 px. The current center-started solve misses that distant solution.
    const feasible: SurfaceCamera = {
      view: { ...lonLatToMap(torilMask, torilSize, { lon: 237.34, lat: -23.26 }), scale: mapScaleForGlobe(torilMask, torilSize, 400, -23.26) },
      vp: { w: 1200, h: 700 }, globe: { lon: 237.34, lat: -23.26, radius: 400 }, morph: 0.5,
    };
    const feasiblePoint = projectSurface(source, toril, feasible);
    expect(Math.hypot(feasiblePoint.x - screen.x, feasiblePoint.y - screen.y)).toBeLessThan(0.25);
    expect(Math.abs(feasible.globe.lat)).toBeLessThanOrEqual(75);
  });
});
