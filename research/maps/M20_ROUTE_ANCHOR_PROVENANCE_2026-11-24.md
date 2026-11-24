# M20 — provenance IDs for route anchors, 2026-11-24

All nine route-stop occurrences in the four High Road route variants now retain a `sourcePlaceId` from `content/maps/toril-places.json`. The four unique anchors are Waterdeep, Leilon, Neverwinter, and Luskan. The selected route is already included by the planning JSON export, so its stop records preserve these IDs alongside the names and coordinates.

A static data comparison found exactly one place record for each unique ID and matched every route stop's ID, name, `x`, and `y` to that record. Each linked place is a `marker` entry. No route positions or geometry were changed.

The coordinates remain pixels in the local HandsomeRob raster, not longitude/latitude. A source ID proves which local place-index row supplied an anchor; it does not validate the raster's CRS, establish an authoritative road line, or turn straight connectors between stops into route geometry.

Tests, typecheck, browser download, and live campaign checks were not run. M20 remains open for exact source-footprint queries, archive/UVTT inspection, verified layer generation, and browser acceptance of the JSON download.
