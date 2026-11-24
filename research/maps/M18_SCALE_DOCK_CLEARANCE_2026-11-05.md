# M18 responsive map dock clearance — 2026-11-05

## Findings

At the local map QA page, the map's 192 px tool panel was anchored `right-3`, while the scale ladder/armillary dock was absolutely positioned at the right edge of the same workspace. At the active compact viewport (982 × 654 CSS px as captured by the in-app browser), the open map panel extended beneath the scale dock. This made the rightmost map controls difficult or impossible to click.

The same matrix exposed a second issue in the Great Wheel and World Tree: in a short or narrow viewport, a tall SVG was vertically centered in a shorter flex column, which placed the SVG top above its scroll container. Scrolling could reach the bottom, but not the missing beginning of the diagram.

## Change

`src/map/WorldMap.tsx` now anchors the map panel at `right-16` and caps its width at `calc(100% - 5.5rem)`, leaving space for the 52 px scale dock, its inset, and a small visual gap. The map-panel test asserts both layout constraints. The map and scale controls remain independently available.

For short/wide and narrow/tall work areas, `src/pages/DeskPage.css` now aligns the Great Wheel, World Tree, Planetarium, and flow diagram to the start of their scroll areas instead of vertically centering an oversized SVG. This keeps the diagram's upper edge reachable while retaining vertical scrolling.

## Browser acceptance

- Route: `/design/qa/product-contexts/index.html#session/desk`.
- State: memory-only QA campaign, Sword Coast North region map, map tools panel open, vertical scale dock visible, chronology and clock in their persistent bottom rail.
- Before: map panel overlapped the scale dock.
- After: panel's right edge stopped before the dock; all toolbar rows and scale buttons were visible at the captured 982 × 654 CSS px viewport.
- The browser tool displayed the before/after screenshots during this acceptance turn. It did not expose a path to persist those screenshots in the repo. Browser zoom/125% and Windows were not verified here.

Additional viewport checks in the same in-app browser, with the dock and panels open:

| Viewport | Scenario | Evidence |
|---|---|---|
| 1280 × 720 | Sword Coast map | Map toolbar `[984,1176]`, dock `[1180,1232]`; no overlap. |
| 1024 × 576 | Effective CSS viewport for 125% on a 1280 × 720 display | Map toolbar `[728,920]`, dock `[924,976]`; no document overflow. This emulates the reduced CSS workspace, but does not emulate DPR 1.25 or native browser zoom. |
| 800 × 600 | Narrow desktop map | Toolbar `[504,696]`, dock `[700,752]`; no overlap or document overflow. |
| 640 × 800 | Tall compact map and World Tree | Toolbar/dock do not overlap; SVG begins within its scroll container and the remainder is vertically scrollable. |
| 390 × 844 | Map, then Great Wheel and World Tree | No horizontal document overflow; toolbar/dock do not overlap. Both diagram SVGs start inside their scroll container and are vertically scrollable. Small diagram labels remain too small for comfortable reading at this width. |

## Automated check status

- Application source type check: `npx tsc --noEmit -p tsconfig.app.json` — passed.
- The exact toolbar test passed **1/1** using Vitest with a temporary lightweight jsdom setup; temporary config/setup files were removed after the run.
- The default project Vitest setup did not emit test results during several waits and was interrupted (exit 130). Its `src/test-setup.ts` eagerly awaits text, SRD-monster, and lazy-part preloads; that initialization path remains undiagnosed.
- A wider run with the lightweight setup reported 42 passed / 1 failed; the failure was an unrelated schema-render assertion because that temporary setup intentionally omitted the app's schema data preloads. It is not treated as a regression result.

No campaign actions were dispatched; the browser scenario used memory-only state.

This is a partial responsive acceptance, not completion of the M18/БА2 matrix. Native browser zoom at 125%, Windows, globe transition, GPU frame measurements, battle/panel permutations, and other map matrix items remain open.
