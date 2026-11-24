import { describe, expect, it } from 'vitest';
import { MAPS } from './maps';
import { toMap, type MapView, type Viewport } from './projection';
import { planetFitBox, planetPanBy, planetResizeView, planetStartView, planetZoomAt } from './planetView';

const passport = MAPS.toril;
const vp: Viewport = { w: 1200, h: 700 };
const highLatitudeStart: MapView = { x: 400, y: 1169, scale: 0.025 };

describe('planet camera view', () => {
  it('accepts and keeps the globe handoff through resize without center clamping', () => {
    expect(planetStartView(highLatitudeStart)).toEqual(highLatitudeStart);
    expect(planetResizeView(highLatitudeStart)).toBe(highLatitudeStart);
  });

  it('allows hand panning beyond all source map edges', () => {
    const moved = planetPanBy({ x: 100, y: 1169, scale: 0.025 }, 400, 200);
    expect(moved.x).toBe(-15900);
    expect(moved.y).toBe(-6831);
  });

  it('keeps the cursor anchor at a viewport edge while zooming from the globe scale', () => {
    const view = { x: 100, y: 1169, scale: 0.025 };
    const at = { x: 0, y: vp.h };
    const anchor = toMap(view, vp, at);
    const zoomed = planetZoomAt(passport, vp, view, 1.5, at);
    const after = toMap(zoomed, vp, at);
    expect(zoomed.scale).toBeGreaterThan(view.scale);
    expect(after.x).toBeCloseTo(anchor.x, 8);
    expect(after.y).toBeCloseTo(anchor.y, 8);
  });

  it('holds a start below the ordinary whole-map minimum until the wheel can return to the globe', () => {
    const zoomedOut = planetZoomAt(passport, vp, highLatitudeStart, 0.5, { x: vp.w / 2, y: vp.h / 2 });
    expect(zoomedOut.scale).toBe(highLatitudeStart.scale);
  });

  it('fits a place frame without clamping its source center', () => {
    const box = { x0: -10000, y0: -10000, x1: -9000, y1: -9000 };
    const fit = planetFitBox(passport, vp, box, 24, 500);
    expect(fit.x).toBeLessThan(0);
    expect(fit.y).toBeLessThan(0);
    expect(fit.scale).toBeGreaterThan(0);
  });
});
