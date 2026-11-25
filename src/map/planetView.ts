import { scaleBounds, toMap, type MapBox, type MapPassport, type MapPoint, type MapView, type Viewport } from './projection';

/** Keep a globe handoff's geographic camera exactly; ordinary maps continue to use clampView. */
export function planetStartView(start: MapView): MapView {
  return { ...start };
}

/** A planet frame is an unbounded projection. Resizing the viewport must not recenter it. */
export function planetResizeView(view: MapView): MapView {
  return view;
}

/** Pan without forcing the planet image back inside its rectangular source bounds. */
export function planetPanBy(view: MapView, dx: number, dy: number): MapView {
  if (!Number.isFinite(view.scale) || view.scale <= 0 || !Number.isFinite(dx) || !Number.isFinite(dy)) return view;
  return { ...view, x: view.x - dx / view.scale, y: view.y - dy / view.scale };
}

/** Zoom about the cursor with no center clamp. Keep the globe-return scale reachable. */
export function planetZoomAt(
  passport: MapPassport,
  vp: Viewport,
  view: MapView,
  factor: number,
  at: MapPoint,
): MapView {
  if (!Number.isFinite(view.scale) || view.scale <= 0 || !Number.isFinite(factor) || factor <= 0) return view;
  const anchor = toMap(view, vp, at);
  const bounds = scaleBounds(passport, vp);
  // Globe handoffs can begin below the ordinary map's whole-map minimum. Allow zoom-in
  // continuously from that exact scale; once above it, keep the normal zoom-out threshold.
  const min = Math.min(view.scale, bounds.min);
  const scale = Math.min(bounds.max, Math.max(min, view.scale * factor));
  return {
    x: anchor.x - (at.x - vp.w / 2) / scale,
    y: anchor.y - (at.y - vp.h / 2) / scale,
    scale,
  };
}

/** Fit a frame without applying the ordinary map's source-edge center clamp. */
export function planetFitBox(p: MapPassport, vp: Viewport, box: MapBox, pad = 24, left = 0): MapView {
  const free = Math.max(1, vp.w - left);
  const bw = Math.max(1, box.x1 - box.x0);
  const bh = Math.max(1, box.y1 - box.y0);
  const fit = (w: number) => Math.max(1e-6, Math.min((w - 2 * pad) / bw, (vp.h - 2 * pad) / bh));
  const beside = fit(free);
  const whole = fit(vp.w);
  const useBeside = beside >= whole * 0.6;
  const scale = Math.min(Math.max(beside, whole * 0.6), scaleBounds(p, vp).max);
  const target = useBeside ? left + free / 2 : vp.w - pad - (bw * scale) / 2;
  return {
    x: (box.x0 + box.x1) / 2 - (target - vp.w / 2) / scale,
    y: (box.y0 + box.y1) / 2,
    scale,
  };
}
