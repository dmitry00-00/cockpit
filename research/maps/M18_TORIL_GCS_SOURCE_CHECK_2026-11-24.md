# M18 — проверка опубликованной CRS и локальных VRT, 24.11.2026

## Публичная система координат Toril GIS

Документация Geospatial Grimoire описывает пользовательскую Toril GCS с эллипсоидом `a=6,410,000 m`, `rf=160.25`; отдельно различает QGIS map-window PCS Patterson, координатную GCS с меридианом Myth Drannor и внутреннее хранение GeoPackage относительно FRIA prime meridian. Это даёт определение системы координат для самого Toril GIS, но не контрольные точки для другого растрового изображения.

В описании DEM v3 автор отдельно предупреждает о несогласованной метаинформации: встроенная CRS использует WGS 84 fallback ellipsoid, sidecar говорит EPSG:4326, а векторные слои используют Toril ellipsoid. Документация запрещает молча переименовывать это в корректную CRS. Отдельный материал о геопривязанных исходных картах заявляет коллекцию, выровненную под Toril GCS, и ограничивает её non-commercial / educational / hobbyist use; эти файлы в проект не импортировались.

Источники: [Coordinate Systems](https://www.geospatial-grimoire.com/worlds/toril/gis/docs/coordinate-systems/), [Adding Your Own Data](https://www.geospatial-grimoire.com/worlds/toril/gis/docs/adding-your-own-data/), [Terrain Model](https://www.geospatial-grimoire.com/worlds/toril/gis/docs/terrain-model/), [Georeferenced Raster Maps of Toril](https://www.geospatial-grimoire.com/blog/2026-02-23-georeferenced-raster-maps-of-toril/).

## Проверка локальных M17 VRT

- `maps/abeir toril/HandsomeRobs_map_of_Toril-TorilMap-clean-m17-2026-11-20.vrt` имеет `rasterXSize=30600`, `rasterYSize=13400` и pixel-space `GeoTransform` `(0, 1, 0, 13400, 0, -1)`. В документе нет `<SRS>`.
- `...-oldiron-2026-11-20.vrt` также не содержит `<SRS>` и задаёт смещение `(16478, 8041)` с единичным шагом пикселя; это мозаичное размещение, не долгота/широта.
- `content/maps/toril.json` продолжает ссылаться на исходный HandsomeRobs TIFF. Связь этих пиксельных координат с Toril GIS GCS не найдена.

## Вывод для M18

У Toril GIS есть описанная custom CRS, однако она сама по себе не калибрует локальный HandsomeRobs raster. Найденные VRT содержат только пиксельные координаты, а текущий растр не имеет CRS/геотрансформации. Не следует назначать Toril GCS, строить точный полярный вывод или менять отображение без конкретной georeferenced-копии с подтверждёнными контрольными точками и правами либо авторской калибровки с измеримой ошибкой. Полярный веер остаётся общим визуальным наблюдением обоих рендереров/слоёв, не географической проверкой.

Никакие карты не скачивались и не импортировались; права на candidate georeferenced maps не принимались; тесты и географические преобразования не выполнялись.
