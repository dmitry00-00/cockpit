# M21 — browser and keyboard acceptance of the Underdark panel

**Date:** 2026-11-23
**Mode:** local memory-only QA fixture at 1280×720; no saved campaign was opened or changed.

## Observations

- Opened the separate Underdark map from the live map panel. The dialog states that surface roads are not copied into it and no passage lines have been invented. The upper level shows 28 regions and 38 places; switching to the Middle Underdark showed 33 regions and 51 places; the Lower Underdark showed 27 regions and 32 places.
- The map frame remains the same while levels switch. The level controls visibly carry the depth ranges. The diagram and its legend were readable in the viewport; the dialog itself scrolls internally to reach the longer place and region lists.
- In the passage view, the UI lists four source-backed textual relations and explicitly says exact lines, entrances, and transition coordinates are unknown. It also separates a region’s GIS level membership from the depth of a route. The Labyrinth mention remains a research note rather than a map edge.
- Keyboard selection worked on the interactive map: Enter selected Fardrimm and exposed its source details; Space selected Arnwolt and updated the selected state and details. Selection stayed within the memory-only fixture.
- Closed the dialog. The fixture returned to its map view at `15 Mirtul 1492 DR, 08:00`; no session record changed.

## Maintenance and remaining work

The map SVG intentionally uses an accessible interactive `group`, not an `img`. Updated two stale assertions in `UnderdarkMapPanel.test.tsx` to query that group; tests were not run.

This browser pass confirms level switching, the source-limited passage view, and keyboard selection. It does not validate geographic control points, surface entrances, source claims against primary page scans, mobile/responsive behavior, or physical Windows behavior. The current pixel registration reports median error 37 px and p90 110 px over 60 of 753 anchors; it is context only and must not be read as cave geometry. All four relations remain without route geometry or assigned route depth.

## Source link follow-up, 2026-11-23

Region and site details now use the existing source URL as a fallback when an exact `sourceRecordUrl` is absent. The link is labeled as a general source page; when a specific object page exists, the existing object-record link remains primary. No geography, confidence, or relationship data changed. Browser follow-up on the same memory-only fixture selected Arnwolt Domain and Tomb Tapper Tomb. Both displayed the general Underdark source page because neither had an exact object-record URL; the link label clearly identifies it as a general source page. The dialog closed back to the map view, with the fixture at `15 Mirtul 1492 DR, 08:00`; no saved campaign was opened or changed. Tests and typecheck were not run.


## Responsive follow-up, 2026-11-24

The same memory-only fixture was checked at 390×844 and 320×700 with the Lower Underdark panel open. In both sizes the document width matched the viewport (no horizontal page overflow); the dialog stayed within the viewport and scrolled internally. At 390 px the map SVG was 331 px wide; at 320 px it was 261 px wide. The level and mode controls wrap/stack at 320 px while remaining visible, and the legend wraps. The dialog content measured 1192 px tall in a 780 px client area at 390×844, and 1367 px in a 636 px client area at 320×700, confirming that the long place/region lists remain reachable by internal scrolling. The dialog was closed and the viewport override reset; the fixture returned to 15 Mirtul 1492 DR, 08:00. No saved campaign was opened or changed. This is a responsive layout check only; touch behavior and Windows acceptance remain unverified.


## Primary-source follow-up, 2026-11-24

The printed page 89 of *Lost Empires of Faerûn* (3.5e) was checked directly for the Lowroad relation. It supports the named underground trade route through Fardrimm, but supplies no exact centerline, entrance coordinates, or route depth for this map; no geometry was added. The current JSON has five textual relations, while this 23 November browser observation correctly records the four visible at that time. See `M21_PRIMARY_SOURCE_CHECK_2026-11-24.md`.
