# M18 Canvas fallback progress — 2026-11-05

## Implemented

- Added `CanvasSurfaceRenderer`, which uses the existing surface tile selection/loader and shared `projectSurface` camera for sphere, mixed morph, and flat views.
- The fallback maps selected raster/schema/mask tiles through a bounded triangle mesh, clips triangles at the front hemisphere, and applies night shading while the view remains spherical or mixed. Flat mode uses one exact affine quad per tile.
- The world mask spans the complete globe, so it now uses a 32×32 mesh; ordinary map tiles retain an 8×8 mesh. This removed large triangular artifacts at a 75° tilt without increasing the mesh cost of every map tile.
- Ordinary tile mesh density now follows projected pixel span and angular span, capped at the existing 8×8 maximum; tiny high-LOD tiles use fewer subdivisions because their projected curvature does not need a dense mesh. Flat projection remains exact and the world mask retains its 32×32 quality grid.
- Ready high-detail tiles replace covered coarse fallback tiles only after all selected visible descendants are ready. Coarse tiles remain underneath during loading or partial coverage.
- `SphereSurfaceLayer` mounts this renderer when WebGL2 is unavailable or forced off, while retaining the WebGL2 path and context-loss transition.
- `Globe` keeps the shared surface camera, projected markers and labels, drag/wheel navigation, and map controls active on Canvas fallback when vector data and Canvas path support are available. The legacy pixel globe remains for cases without those prerequisites.

## Browser acceptance

A standalone fixture at `design/qa/surface-fallback/index.html` loads the actual Toril map and schema without creating or mutating campaign state. It supports `?renderer=canvas` and `?mapStats=1` for side-by-side fallback/WebGL inspection.

CUA compared both renderers at 1280×720 CSS pixels, DPR 1:

- spherical view, including the initial 75° tilt;
- mixed projection at 0.5 and 75° tilt;
- flat endpoint at morph 1;
- both raster and vector schema modes.

The mask mesh correction removed the fallback-only triangular wedges. Canvas and WebGL now show comparable surface coverage and composition in these sampled states. Browser console had no errors or warnings. This is visual inspection, not pixel-diff. The browser screenshots are present inline in the 2026-11-05 CUA acceptance trail.

## Canvas frame-cost sample

The opt-in `mapStats=1` diagnostic redraws the current Canvas frame on every animation frame and records a rolling 300-frame window. After the mesh and LOD changes, these Mac/IAB samples reached 60 FPS in the measured views:

| Viewport | Backing DPR | State | RAF | Mean synchronous Canvas draw | p95 draw | p95 frame interval | Ready tiles drawn |
|---|---:|---|---:|---:|---:|---:|---:|
| 1280×720 | 2 | sphere, schema, tilt 75° | 60.0 FPS | 4.39 ms | 4.50 ms | 17.10 ms | 72 / 79 |
| 1280×720 | 2 | sphere, raster, tilt 0° | 60.0 FPS | 4.15 ms | 4.30 ms | 16.80 ms | 78 / 85 |
| 1920×1080 | 1 | morph 0.5, schema, tilt 75° | 60.0 FPS | 6.31 ms | 6.50 ms | 17.30 ms | 106 / 114 |
| 1920×1080 | 2 | morph 0.5, schema, tilt 75° | 60.0 FPS | 12.70 ms | 13.40 ms | 17.50 ms | 421 / 453 |

The DPR 2 value was forced with `mapDpr=2`; the browser's physical `devicePixelRatio` remained 1 and the Canvas backing store was 2560×1440 at 1280×720 and 3840×2160 at 1920×1080. These are synchronous JS/Canvas draw-command costs under continuous redraw, not compositor/GPU time or measurements from a physical DPR 2 display. Before optimization, the 1280×720 DPR 2 sphere sample measured 41.6 FPS, and the 1920×1080 DPR 1 mixed sample measured 26.6 FPS. After optimization, repeated 300-frame windows reached 60 FPS in all four states above. Same-state CUA screenshots at 1920×1080 and DPR 2 showed comparable Canvas/WebGL composition; both tabs had no console errors or warnings. The bright triangular region remains visible in both renderers at 75° and is not fallback-only; it is flagged for shared-renderer visual review.

## Code verification

- `npx tsc --noEmit -p tsconfig.app.json` — passed after adding opt-in Canvas frame sampling.
- Targeted Vitest with a temporary minimal JSDOM config (the project Vite `textSplit` plugin makes the default runner stall): `surfaceCanvas.test.ts`, `surfaceTiles.test.ts`, `GlobeSurface.test.tsx`, `surfaceProjection.test.ts` — 31/31 passed, covering adaptive tessellation and coarse-tile retention until detail is ready.
- `git diff --check` — passed after the performance update.

## Remaining

M18 remains open. Canvas now reaches 60 FPS in the sampled 1280×720 and 1920×1080 views, including forced 2× backing density, but broader visual, zoom, camera-motion and machine coverage is still required. The required Windows acceptance remains open because no Windows machine is available. Curved/mixed Canvas tiles remain a bounded affine approximation; sampled visual parity does not prove parity for every region, zoom, or viewport.
