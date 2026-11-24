import { describe, expect, it } from 'vitest';
import type { MapPoint } from './projection';
import { lonLatToMap, mapScaleForGlobe, type PlanetMask } from './planet';
import {
  clampSurfaceTilt,
  projectSurface,
  projectionUniforms,
  surfaceProjectionGLSL,
  unprojectSurface,
  type GeographicExtent,
  type SurfaceCamera,
} from './surfaceProjection';

const extent: GeographicExtent = {
  lon0: 10,
  lon1: 70,
  latTop: 45,
  latBottom: -25,
  width: 600,
  height: 350,
};

const camera = (morph: number, patch: Partial<SurfaceCamera> = {}): SurfaceCamera => ({
  view: { x: 300, y: 175, scale: 1.2 },
  vp: { w: 800, h: 600 },
  globe: { lon: 40, lat: 20, radius: 250 },
  morph,
  ...patch,
});

const expectPointClose = (actual: MapPoint | null, expected: MapPoint, digits = 3) => {
  expect(actual).not.toBeNull();
  expect(actual!.x).toBeCloseTo(expected.x, digits);
  expect(actual!.y).toBeCloseTo(expected.y, digits);
};

describe('surface projection', () => {
  it('keeps the flat endpoint exactly equal to the existing map projection', () => {
    const c = camera(1);
    const p = { x: 120, y: 290 };
    const q = projectSurface(p, extent, c);
    expect(q.x).toBe((p.x - c.view.x) * c.view.scale + c.vp.w / 2);
    expect(q.y).toBe((p.y - c.view.y) * c.view.scale + c.vp.h / 2);
    expect(q.front).toBe(1);
    expect(q.visible).toBe(true);
    expectPointClose(unprojectSurface({ x: q.x, y: q.y }, extent, c), p, 12);
  });

  it('projects the globe center and marks the limb/back side by front depth', () => {
    const c = camera(0);
    const center = { x: 300, y: 125 };
    const q = projectSurface(center, extent, c);
    expect(q.x).toBeCloseTo(c.vp.w / 2, 10);
    expect(q.y).toBeCloseTo(c.vp.h / 2, 10);
    expect(q.depth).toBeCloseTo(1, 10);
    expect(q.visible).toBe(true);

    const limb = projectSurface({ x: 1200, y: 225 }, extent, c); // 90° angular distance from the tilted camera center
    expect(limb.depth).toBeCloseTo(0, 10);
    expect(limb.visible).toBe(true);
    const back = projectSurface({ x: 1500, y: 225 }, extent, c);
    expect(back.depth).toBeLessThan(0);
    expect(back.visible).toBe(false);
    expect(unprojectSurface({ x: c.vp.w / 2 + c.globe.radius + 1, y: c.vp.h / 2 }, extent, c)).toBeNull();
  });

  it('round-trips the orthographic endpoint with a tilted camera and unbounded source coordinates', () => {
    const c = camera(0, { globe: { lon: 0, lat: 37, radius: 220 } });
    const p = { x: -90, y: 132 };
    const q = projectSurface(p, extent, c);
    expect(q.visible).toBe(true);
    expectPointClose(unprojectSurface({ x: q.x, y: q.y }, extent, c), p, 8);
  });

  it('round-trips mixed morphs through a damped inverse solve and rejects the back side', () => {
    for (const morph of [0.15, 0.45, 0.8, 0.98]) {
      const c = camera(morph);
      const p = { x: 300, y: 170 };
      const q = projectSurface(p, extent, c);
      expect(q.visible).toBe(true);
      expectPointClose(unprojectSurface({ x: q.x, y: q.y }, extent, c), p, 2);
    }
    const nearGlobe = camera(0.01);
    const back = projectSurface({ x: 1500, y: 125 }, extent, nearGlobe);
    expect(back.visible).toBe(false);
    // A backside point can overlap a different visible point during morph; any returned inverse must be front-facing.
    const inverse = unprojectSurface({ x: back.x, y: back.y }, extent, nearGlobe);
    if (inverse) expect(projectSurface(inverse, extent, nearGlobe).front).toBeGreaterThanOrEqual(0);
  });

  it('chooses the frontmost visible preimage when a mixed projection folds', () => {
    const toril: GeographicExtent = { lon0: 27, lon1: 327, latTop: 88, latBottom: -61, width: 30600, height: 13400 };
    const mask:PlanetMask = { id:'test',label:'test',w:1,h:1,grid:['o'],regions:[],source:{extent:[27,327,88,-61]} };
    const center = lonLatToMap(mask, { width: toril.width, height: toril.height }, { lon: 27, lat: -75 });
    const c: SurfaceCamera = {
      view: { ...center, scale: mapScaleForGlobe(mask, { width: toril.width, height: toril.height }, 338, -75) },
      vp: { w: 1200, h: 700 }, globe: { lon: 27, lat: -75, radius: 338 }, morph: 0.5,
    };
    const frontPoint = { x: 22950, y: 11390 };
    const occludedPoint = { x: 21225.86287759146, y: 7985.875393830288 };
    const screen = projectSurface(frontPoint, toril, c);
    const occluded = projectSurface(occludedPoint, toril, c);
    expect(screen.visible).toBe(true);
    expect(occluded.visible).toBe(true);
    expect(occluded.depth).toBeLessThan(0);
    expect(Math.hypot(screen.x - occluded.x, screen.y - occluded.y)).toBeLessThan(0.001);
    expect(screen.front).toBeGreaterThan(occluded.front);
    const inverse = unprojectSurface({ x: screen.x, y: screen.y }, toril, c);
    expect(inverse).not.toBeNull();
    expectPointClose(inverse, frontPoint, 2);
    expect(projectSurface(inverse!, toril, c).front).toBeGreaterThan(occluded.front);
    expect(Math.hypot(inverse!.x - occludedPoint.x, inverse!.y - occludedPoint.y)).toBeGreaterThan(1000);
  });

  it('recovers the 50 visible high-tilt samples that returned null before multistart', () => {
    const toril: GeographicExtent = { lon0: 27, lon1: 327, latTop: 88, latBottom: -61, width: 30600, height: 13400 };
    const mask:PlanetMask = { id:'test',label:'test',w:1,h:1,grid:['o'],regions:[],source:{extent:[27,327,88,-61]} };
    const edgeCases = [
      { lon: 27, points: [[0.75, 0.85], [0.75, 1], [1, 0], [1, 0.15]] },
      { lon: 327, points: [[0, 0], [0, 0.15], [0.25, 0.85], [0.25, 1]] },
      { lon: 356, points: [[0, 0], [0, 0.15], [0.25, 0]] },
      { lon: 0, points: [[0.75, 0], [1, 0], [1, 0.15], [1, 0.5]] },
    ];
    const topCases = [
      { lon: 27, points: [[0.75, 0.15], [0.75, 0.5], [1, 1]] },
      { lon: 327, points: [[0, 1], [0.25, 0.15], [0.25, 0.5]] },
      { lon: 356, points: [[0, 0.5], [0, 1]] },
      { lon: 0, points: [[1, 0.85], [1, 1]] },
    ];
    let tested = 0;
    for (const lat of [-75, -74.999]) for (const { lon, points } of edgeCases) {
      const center = lonLatToMap(mask, { width: toril.width, height: toril.height }, { lon, lat });
      const c: SurfaceCamera = { view: { ...center, scale: mapScaleForGlobe(mask, { width: toril.width, height: toril.height }, 338, lat) }, vp: { w: 1200, h: 700 }, globe: { lon, lat, radius: 338 }, morph: 0.5 };
      for (const [fx, fy] of points) {
        const p = { x: toril.width * fx, y: toril.height * fy };
        const screen = projectSurface(p, toril, c);
        if (!screen.visible) continue;
        const inverse = unprojectSurface({ x: screen.x, y: screen.y }, toril, c);
        expect(inverse, `visible inverse failed at lon=${lon}, fx=${fx}, fy=${fy}`).not.toBeNull();
        tested++;
      }
    }
    for (const lat of [74.999, 75]) for (const { lon, points } of topCases) {
      const center = lonLatToMap(mask, { width: toril.width, height: toril.height }, { lon, lat });
      const c: SurfaceCamera = { view: { ...center, scale: mapScaleForGlobe(mask, { width: toril.width, height: toril.height }, 338, lat) }, vp: { w: 1200, h: 700 }, globe: { lon, lat, radius: 338 }, morph: 0.5 };
      for (const [fx, fy] of points) {
        const p = { x: toril.width * fx, y: toril.height * fy };
        const screen = projectSurface(p, toril, c);
        expect(screen.visible).toBe(true);
        expect(unprojectSurface({ x: screen.x, y: screen.y }, toril, c), `visible inverse failed at lon=${lon}, lat=${lat}, fx=${fx}, fy=${fy}`).not.toBeNull();
        tested++;
      }
    }
    expect(tested).toBe(50);
  });

  it('uses the front depth for folded picks across the covered Toril morph range', () => {
    const toril: GeographicExtent = { lon0: 27, lon1: 327, latTop: 88, latBottom: -61, width: 30600, height: 13400 };
    const mask:PlanetMask = { id:'test',label:'test',w:1,h:1,grid:['o'],regions:[],source:{extent:[27,327,88,-61]} };
    let tested = 0;
    let occludedSourceSamples = 0;
    for (const lat of [-60, 0, 60]) for (const lon of [27, 200, 327]) {
      const center = lonLatToMap(mask, { width: toril.width, height: toril.height }, { lon, lat });
      const c: SurfaceCamera = {
        view: { ...center, scale: mapScaleForGlobe(mask, { width: toril.width, height: toril.height }, 338, lat) },
        vp: { w: 1200, h: 700 }, globe: { lon, lat, radius: 338 }, morph: 0,
      };
      for (let step = 1; step <= 9; step++) {
        c.morph = step / 10;
        for (const fx of [0, 0.25, 0.5, 0.75, 1]) for (const fy of [0, 0.25, 0.5, 0.75, 1]) {
          const source = { x: toril.width * fx, y: toril.height * fy };
          const screen = projectSurface(source, toril, c);
          if (!screen.visible) continue;
          const inverse = unprojectSurface({ x: screen.x, y: screen.y }, toril, c);
          expect(inverse, `visible pick failed at lon=${lon}, lat=${lat}, morph=${c.morph}`).not.toBeNull();
          const picked = projectSurface(inverse!, toril, c);
          expect(Math.hypot(picked.x - screen.x, picked.y - screen.y)).toBeLessThan(0.0012);
          expect(picked.front).toBeGreaterThanOrEqual(screen.front - 1e-6);
          if (Math.hypot(inverse!.x - source.x, inverse!.y - source.y) > 1) occludedSourceSamples++;
          tested++;
        }
      }
    }
    expect(tested).toBeGreaterThan(0);
    // Folded source points occur in reachable camera states; depth/front selection resolves them.
    expect(occludedSourceSamples).toBeGreaterThan(0);
  });

  it('wraps the seam to the longitude nearest the globe center', () => {
    const seamExtent = { ...extent, lon0: 350, lon1: 390 };
    const c = camera(0, { globe: { lon: 0, lat: 0, radius: 200 } });
    const p = { x: 150, y: 175 }; // 360° is the camera center, not 360° away.
    const q = projectSurface(p, seamExtent, c);
    expect(q.x).toBeCloseTo(c.vp.w / 2, 10);
    const unprojected = unprojectSurface({ x: q.x, y: q.y }, seamExtent, c);
    expect(unprojected).not.toBeNull();
    // The inverse picks the longitude equivalent nearest the globe center (0°, not 360°), so source x is unbounded.
    expect(unprojected!.x).toBeCloseTo(-5250, 8);
  });

  it('is continuous at both morph endpoints', () => {
    const p = { x: 220, y: 205 };
    const a = projectSurface(p, extent, camera(0.999));
    const b = projectSurface(p, extent, camera(1));
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.1);

    const c = projectSurface(p, extent, camera(0));
    const d = projectSurface(p, extent, camera(0.001));
    expect(Math.hypot(c.x - d.x, c.y - d.y)).toBeLessThan(0.1);
  });

  it('clamps only the UI camera tilt and supplies radians used by the GLSL projection', () => {
    expect(clampSurfaceTilt(90)).toBe(75);
    expect(clampSurfaceTilt(-90)).toBe(-75);
    expect(clampSurfaceTilt(Number.NaN)).toBe(0);
    const u = projectionUniforms(extent, camera(0.5, { globe: { lon: 30, lat: 90, radius: 200 } }));
    expect(u.geo[0]).toBeCloseTo(10 * Math.PI / 180, 14);
    expect(u.geo[2]).toBeCloseTo((60 / 600) * Math.PI / 180, 14);
    expect(u.geo[3]).toBeCloseTo((-70 / 350) * Math.PI / 180, 14);
    expect(u.globe[0]).toBeCloseTo(30 * Math.PI / 180, 14);
    expect(u.globe[1]).toBeCloseTo(75 * Math.PI / 180, 14);
    expect(u.morph).toBe(0.5);
    expect(surfaceProjectionGLSL).toContain('surfaceProject(vec2 p)');
    expect(surfaceProjectionGLSL).toContain('mix(sphere, plane, u_morph)');
    expect(surfaceProjectionGLSL).toContain('SURFACE_DEG_TO_RAD');
  });

  it('returns null rather than a guessed inverse when the camera/extent is singular', () => {
    const c = camera(0, { globe: { lon: 0, lat: 0, radius: 0 } });
    expect(unprojectSurface({ x: 400, y: 300 }, extent, c)).toBeNull();
    expect(unprojectSurface({ x: 400, y: 300 }, { ...extent, width: 0 }, camera(0))).toBeNull();
  });
});
