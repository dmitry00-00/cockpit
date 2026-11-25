# M20 — anchors derive from the place registry, 24.11.2026

## Change

The four High Road route variants no longer duplicate the names and raster-pixel coordinates of their nine stop occurrences. Each occurrence is now built from its existing `sourcePlaceId` in `content/maps/toril-places.json`. The resolver requires exactly one matching record, `how: "marker"`, and finite `x`/`y`; otherwise module initialization fails instead of silently drawing a stale or unsupported anchor.

The stable IDs and all nine route-stop positions were already checked against the place index in `M20_ROUTE_ANCHOR_PROVENANCE_2026-11-24.md`. This change uses that recorded source relationship to prevent future name/coordinate drift; it does not add, move, or georeference any place. The route corridor remains a schematic search line between markers.

## Exact limits

- Coordinates are the local HandsomeRob raster's pixel system. This does not establish longitude/latitude or a transformation from Toril GIS's custom Toril GCS.
- The connector is not an authoritative road trace; no road, coastline, footprint, or buffer intersection is asserted.
- No source rights or publication permission change. Existing source IDs and their provenance remain as recorded.
- No external archive, map export, planner, or campaign data was accessed or changed.

This was a static implementation/data review only. Tests, typecheck, browser, planner, and export were not run.
