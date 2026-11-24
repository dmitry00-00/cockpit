# M18 — native browser zoom and shared polar region, 2026-11-23

## Setup

- Real Google Chrome window on the current Mac, native page zoom 125% (Chrome showed 125%; the QA surface reported DPR 1.25).
- Isolated `design/qa/surface-fallback/index.html?renderer=webgl&mapStats=1` fixture, window 1360×649. This fixture has no campaign, journal, or clock state.
- Compared schema/raster, tilt 75°, projection morph 0.5 and flat endpoint, then forced Canvas2D fallback at 75°/morph 0 and morph 1.

## Observations

- At 75° with raster, the same bright polar fan and dark wedge were visible in WebGL2 and Canvas2D. The sampled feature is shared by both paths, not fallback-only. Schema showed the same polar convergence. This is visual parity for one sampled region, not a pixel diff or proof that the polar geography is correct.
- WebGL2 at 75°/raster/125%: 60 FPS; p95 frame 17.6 ms, p95 CPU 0.30 ms, p95 GPU 1.30 ms; 57 tiles and about 17.6 MiB reported. At morph 0.5 the bent surface remained visible; at the flat endpoint it remained visible and the controls stayed available.
- Canvas2D at 75°/raster/125%: 60 FPS; p95 frame 17.5 ms, p95 draw 0.20 ms; 2 of 3 selected surface tiles ready. The sampled polar pattern remained visible. At the flat endpoint the map and controls remained visible.
- The native 125% zoom was real Chrome zoom, not a reduced CSS viewport. The map stayed within its surface, but the globe was cropped by the shorter content area at high tilt. No page-scroll or screen-reader assessment was made.

## Limits and next work

The source TIFF still has no CRS/geotransform and its bounds are approximate; Toril GIS has not been calibrated to its pixels. This sample cannot decide whether polar detail is accurate or how uncovered areas should be represented. Keep the polar display decision open. The expanded map/size/motion matrix and physical Windows acceptance also remain open. The owner identified the target as an Acer Nitro V 15 ANV15-52; this Mac session cannot run the Windows acceptance.

No tests, typecheck, saved campaign, or persistent map changes were made. Chrome zoom was restored to 100% and the QA tab was closed. The captured browser screenshots were shown during this turn; they were not saved to the repository.

## Additional viewport sample, 2026-11-23

- In the same isolated fixture, browser viewport overrides at 1024×576, 800×600, 640×800, and 390×844 were checked. At 1024×576, WebGL2 showed the shared polar fan in schema and raster at tilt 75°. At 800×600, both WebGL2 and forced Canvas2D (`?renderer=canvas`) showed it in schema and raster. At 640×800, Canvas2D showed it in schema and raster. At 390×844, WebGL2/schema retained the map and controls.
- At all four viewport sizes, the document width matched the viewport width (no horizontal page overflow). At 800×600 the globe fit at zero tilt and controls remained inside the window; at 640×800 the control row wrapped onto a second line. No FPS samples were taken at these sizes.
- These are responsive viewport overrides on the Mac, not native display zoom measurements, a complete interaction matrix, or Windows evidence. The fan remains an unverified geographic feature rather than a renderer-specific failure.

## Compact viewport follow-up, 2026-11-24

- At a real browser viewport override of 390×844, the isolated fixture was checked at 75° for all four renderer/layer combinations: automatic WebGL2 with schema and raster, and forced Canvas2D (`?renderer=canvas`) with schema and raster.
- In every combination the globe/map and all map controls stayed visible. The document and body widths were 390 CSS px, matching `innerWidth`; no horizontal overflow was present. This confirms viewport behavior for this fixture only; no map state was persisted.
- Renderer readouts confirmed WebGL2 for the automatic path and Canvas2D for the forced fallback. At capture, WebGL2 reported 60 FPS and p95 frame 17.6 ms; Canvas2D reported about 59 FPS and p95 frame 17.7 ms. These are brief fixture readings, not Windows or device-performance acceptance.
- The same bright polar fan/dark wedge remained visible at high tilt in both renderers and both layers. This remains a shared, unverified geographic feature; the sample does not establish whether it is correct.

The 390×844 size is now covered across both renderers and both layers. The broader motion/map matrix, geographic calibration and physical Windows acceptance on the owner's Acer Nitro V 15 ANV15-52 remain open. No tests, typecheck, campaign save or MapTool actions were performed.

## 1024×576 viewport and morph follow-up, 2026-11-24

- In Chrome's responsive viewport override at 1024×576 CSS px (DPR 2 reported by the fixture), all four renderer/layer pairs were inspected: WebGL2/schema, WebGL2/raster, Canvas2D/schema and Canvas2D/raster. At 0° and 75° the globe and controls rendered in each pair. At 75°, the same bright polar fan and dark wedge appeared in both renderers and both layers; map detail remained visible around it. No blank frame or missing-map region was observed in these captures. The dark wedge is recorded as an appearance only, not classified as missing data or correct geography.
- WebGL2/schema was additionally viewed at 75° through morph 0, 0.5 and 1. The map remained drawn at each endpoint; at 0.5 it appeared as a compressed oval, and at 1 as a small centered rectangular plate with a jagged bright polar strip. At morph 0, a short longitude sweep from 111° to 121° kept the polar fan visible as it shifted with the view. At 0° the fan was not visually prominent.
- The first screenshot with DevTools docked showed only a clipped preview area because the panel reduced the available preview width. After undocking DevTools, the 1024×576 viewport fit cleanly and the globe/controls were visible. This preview clipping is not evidence of a blank or missing map region.
- At this point in the work, the 640×800 follow-up was not completed: the accessibility setter changed the width field to `1`, and Chrome reselection returned `cgWindowNotFound`. The later follow-up below records the successful 640×800 check on 2026-11-24.

These are qualitative Mac viewport observations, not a pixel comparison, performance acceptance, geographic validation, or Windows evidence. The polar feature remains unverified because the source raster has no CRS/geotransform. The physical Windows run on the owner's Acer Nitro V 15 ANV15-52 and the remaining viewport matrix remain open. No campaign state or persistent map data changed.


## 640×800 renderer/layer follow-up, 2026-11-24

- In the isolated browser fixture at 640×800 CSS px and 75° tilt, all four pairs were checked: WebGL2/schema, WebGL2/raster, Canvas2D/schema and Canvas2D/raster. In each pair the map and controls rendered.
- This was a Mac responsive viewport with QA instrumentation. The stats overlay in the instrumented Canvas2D view touched the bottom controls; a clean Canvas2D view without that overlay showed the full control strip. This is an instrumentation overlap, not a map layout finding.
- This completes the 640×800 renderer/layer sample only. It does not validate the shared polar fan, measure Windows performance, or replace the physical Acer Nitro V 15 ANV15-52 acceptance. No campaign or map state changed.


## 640×800 renderer/layer follow-up, 2026-11-24

- In the isolated browser fixture at 640×800 CSS px and 75° tilt, all four pairs were checked: WebGL2/schema, WebGL2/raster, Canvas2D/schema and Canvas2D/raster. In each pair the map and controls rendered.
- This was a Mac responsive viewport with QA instrumentation. The stats overlay in the instrumented Canvas2D view touched the bottom controls; a clean Canvas2D view without that overlay showed the full control strip. This is an instrumentation overlap, not a map layout finding.
- This completes the 640×800 renderer/layer sample only. It does not validate the shared polar fan, measure Windows performance, or replace the physical Acer Nitro V 15 ANV15-52 acceptance. No campaign or map state changed.
