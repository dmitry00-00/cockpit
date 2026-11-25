# M20 — browser acceptance of the route coverage panel

**Date:** 2026-11-23
**Mode:** local browser, memory-only QA fixture; no campaign or saved journal was opened or changed.

## Surface checked

Opened `design/qa/product-contexts/index.html?fixture=notebook#/session/desk` at 1280×720 and opened the map’s **Покрытие** panel. The panel starts with the High Road corridor at 16 mi. The map displays the corridor and route stop names. The UI identifies the connector as a schematic search aid, not a verified road, and calls out missing source footprints.

## Observations

- The panel exposed 10 source candidates and 5 coverage gaps at the initial radius. At 16 mi it showed 3 local pin/icon candidates and no label-center hints.
- Radius changes to 1 mi and 64 mi updated the displayed radius and candidate/gap counts (4 gaps at 1 mi; 8 pin candidates at 64 mi). This confirms the control updates the search display, not geographic accuracy.
- Expanding the source list kept pin/icon candidates separate from label-center hints. Leilon and Neverwinter appeared as 0.0 mi route-stop pin candidates; this is a proximity hint, not a road intersection or source-footprint match.
- Switching route priority from world importance to table value visibly changed the selected axis and ordering; the first results were Leilon → Neverwinter (score 5) and the High Road (score 4).
- Switching gap priority to world importance changed the ordering to city plan/pin, terrain, road-line source/edition, intermediate points of interest, then UVTT scale.
- Expanding the Neverwinter map source details exposed pixel-grid coordinates, no geographic CRS, edition status still to verify, Mike Schley attribution, WotC copyright, and personal-use-only/no-repository-distribution status. The Neverwinter archives remain uninspected; exact-name searches in the active project and `/Users/dmitrij/cockpit` tree found no local `.zip` or `.module` files to open.
- Restored the panel to 16 mi, world-importance route order, and table-value gap order; closed it without changing the fixture’s displayed game time (`15 Mirtul 1492 DR, 08:00`).

## Result and limits

The memory-only browser pass confirms the panel, radius control, distinct route/gap sorting axes, candidate categories, and source provenance details are visible and usable. It does not validate the underlying geography, compute exact source-footprint intersections, inspect local archives, prove UVTT round-trip/grid compatibility, or connect a missing-layer generator. Those remain open in M20. The Toril GIS GeoPackage exists, but its custom Toril GCS has no validated transform to the HandsomeRob raster-pixel corridor; the current route query therefore remains route-group/stop proximity, not exact overlap. No tests or typecheck were run.

## Export follow-up, 2026-11-23

The JSON draft now includes each route's effective world/table scores in the selected sort order and identifies the route sort axis. The chosen route carries its effective scores. Queued gaps retain the UI order, export their effective scores, and name the selected gap sort axis. This keeps the downloaded plan aligned with the editable UI state. An independent read-only code review found no issues; no browser download check, tests, or typecheck were run.

## Download follow-up, 2026-11-24

An independent read-only review confirmed that `routeOrder`/selected route scores and `queuedGaps` use the same sorted arrays and effective score maps as the panel. The fixture was opened again in memory-only mode, but its coverage control did not open through the available browser actions; a JSON download therefore remains unverified. No campaign or time state was changed.

`downloadPlan` now appends its hidden download link to the document, clicks it, removes the link, then revokes the Blob URL after 1 second instead of immediately. This reduces the chance of revoking the URL before the browser starts reading the download; actual download success and cross-browser behavior are still unconfirmed. Tests and typecheck were not run.

## Source metadata follow-up, 2026-11-24

The downloadable JSON now uses schema version 2 and retains every field already present in the source registry: source kind/status, coverage, resolution, reference system, edition, provenance, rights, formats, route groups, optional anchor stops, and the source note. This keeps the queue reviewable after it leaves the UI; it does not assert that candidate sources are verified or licensed for redistribution. The browser preview in this turn did not expose the coverage panel, so the actual downloaded JSON remains unverified. Tests and typecheck were not run.

## Export completeness follow-up, 2026-11-24

Static review found that the panel's separate source-registry pool with empty `routeGroups` was not included in the JSON download. Schema version 3 now exports it as `unlocatedSourcePool`, with a clear `not-assigned-to-route` association and the same full source metadata as route candidates. It stays distinct from `sources` used for route coverage. The export argument now uses `MapDetailGap[]`, making the full gap contract—including route groups, anchor stops and minimum radius—explicit while preserving the current sorted UI order. No geography or campaign data changes. Actual browser download, tests and typecheck remain unverified.


## Локальный браузерный повтор, 2026-11-24

В приложении на карте региона открыта панель «Покрытие». На отрезке Leilon → Neverwinter при радиусах 1/16/64 миль UI показал соответственно 2/2/5 пинов-кандидатов и 4/5/5 элементов очереди; центров подписей во всех трёх случаях — 0. Переключение маршрута обновило список остановок с Waterdeep/Leilon/Neverwinter на Leilon/Neverwinter. Кнопка JSON-экспорта была нажата, панель осталась открытой без видимой ошибки; фактический скачанный файл не доступен для чтения в этой браузерной среде. Работа меняла только временное состояние планировщика, не кампанию/журнал/время.

## Локальные UVTT Neverwinter, 2026-11-24

В личной библиотеке `/Volumes/внешний/DND staff/разное` найдены две версии одной сцены. Обе — UVTT 0.2, map size 194×232 клеток, origin 0/0, 578 LOS-сегментов, 107 порталов, 0 lights. Вариант 8 px/grid содержит PNG 1552×1856; вариант 10 px/grid — 1940×2320. Сами массивы LOS и порталов совпадают побайтно на уровне JSON-структур. Версия 10 px/grid соответствует уже принятому в M19 профилю MapTool 1.18.7; версию 8 px/grid сохраняем как историческую, активный рабочий профиль — 10 px/grid. Это решает расхождение масштаба по вариантам файла, но не подтверждает их права на публикацию, геопривязку к городскому растру, повторный импорт старой версии или полный export/import round-trip. Файлы не копировались в checkout.

Точность коридорных footprint и реальная генерация слоёв остаются открытыми. Искомые `Neverwinter_Maps.zip` и `guide-to-neverwinter.module` отсутствуют в проверенных доступных библиотеках/checkout; прежний Library transfer в реестре отмечен как неудачный.


### Загрузка JSON из встроенного браузера, 24.11.2026

После нажатия кнопки в панели содержимое JSON осталось недоступным. Встроенный браузер отклонил переход к `chrome://downloads/`: protocol outside allowlist, разрешены только HTTP(S). Политика явно запрещает получать тот же результат через обходные/альтернативные браузерные поверхности; обход не предпринимался. Путь к фактическому файлу и schema/route/gap fields не подтверждены.

## Structured source references follow-up, 2026-11-24

The source registry now carries optional structured `references` (`label`, `url`) and `localOrigin` (`path`, `author`) fields, and the JSON draft advances to schema v4. URLs were copied only from the M20 cartographic register's primary-links list; the two local origins were copied from `content/maps/toril.json` and `content/maps/neverwinter.json`. The unidentified Neverwinter archives, UVTT drafts, and generic external library retain no invented link or origin. The serializer includes these optional fields when present and preserves all existing text metadata. This is a static source-traceability improvement: it does not validate download contents, rights, or geography. Tests, typecheck, browser, planner, and export were not run; the actual downloaded JSON remains unverified.
