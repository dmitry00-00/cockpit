/** M20: reviewed map sources and planning-only route coverage. No entry changes campaign canon. */
import torilPlaceIndex from '../../content/maps/toril-places.json';

export type MapPriorityAxis = 'world' | 'table';
export type MapSourceStatus = 'active' | 'derived' | 'reference' | 'candidate' | 'draft' | 'uninspected';

export interface MapSourceReference { label: string; url: string }
export interface MapSourceLocalOrigin { path: string; author: string }

export interface MapRegistrySource {
  id: string;
  name: string;
  kind: 'raster' | 'vector' | 'catalog' | 'tactical' | 'archive';
  status: MapSourceStatus;
  coverage: string;
  resolution: string;
  referenceSystem: string;
  edition: string;
  provenance: string;
  rights: string;
  formats: string;
  routeGroups: readonly string[];
  anchorStops?: readonly string[];
  references?: readonly MapSourceReference[];
  localOrigin?: MapSourceLocalOrigin;
  note: string;
}

export interface MapRouteStop {
  name: string;
  /** Stable entry ID from content/maps/toril-places.json. */
  sourcePlaceId: string;
  /** Pixel coordinates in the local HandsomeRob raster, not longitude/latitude. */
  x: number;
  y: number;
}

export interface MapRouteSegment {
  id: string;
  name: string;
  routeGroup: string;
  stops: readonly MapRouteStop[];
  priorityWorld: number;
  priorityTable: number;
  geometryNote: string;
}

export interface MapDetailGap {
  id: string;
  title: string;
  layer: string;
  routeGroups: readonly string[];
  anchorStops?: readonly string[];
  minimumRadiusMiles: number;
  priorityWorld: number;
  priorityTable: number;
  output: string;
  reason: string;
}

export interface MapTilePreview {
  x: number;
  y: number;
  width: 256;
  height: 256;
  url: string;
}

export interface MapPlacePoint {
  id: string;
  name: string;
  nameRu?: string;
  class?: string;
  rank?: number;
  x: number;
  y: number;
  how: string;
}
export interface MapPlaceCandidate extends MapPlacePoint { distancePixels: number; distanceMiles: number }
export interface RoutePlaceCandidates { pinCandidates: MapPlaceCandidate[]; labelHints: MapPlaceCandidate[] }

export interface MapCorridorPreview {
  x: number;
  y: number;
  width: number;
  height: number;
  radiusPixels: number;
  tiles: readonly MapTilePreview[];
}

export const M20_CORRIDOR_MILES_PER_PIXEL = 0.37;
export const M20_DEFAULT_CORRIDOR_RADIUS_MILES = 16;

const TORIL_ROUTE_PLACE_RECORDS = torilPlaceIndex.places as unknown as readonly MapPlacePoint[];

function routeStop(sourcePlaceId: string): MapRouteStop {
  const matches = TORIL_ROUTE_PLACE_RECORDS.filter(place => place.id === sourcePlaceId);
  const place = matches[0];
  if (matches.length !== 1 || !place || place.how !== 'marker' || !Number.isFinite(place.x) || !Number.isFinite(place.y)) {
    throw new Error(`M20 route anchor ${sourcePlaceId} must resolve to one positioned marker in toril-places.json`);
  }
  return { name: place.name, sourcePlaceId, x: place.x, y: place.y };
}

/**
 * Inventory is intentionally source-aware.  “Candidate” and “uninspected” are not
 * silently promoted into map coverage, and rights notes describe use limits rather
 * than granting permission.
 */
export const M20_MAP_SOURCES: readonly MapRegistrySource[] = [
  {
    id: 'toril-handsomerob',
    name: 'Toril — растр HandsomeRob',
    kind: 'raster',
    status: 'active',
    coverage: 'Планета; в пилоте — Побережье Мечей',
    resolution: '30 600 × 13 400 px; тайлы z0–z7; локальная калибровка около 0,37 мили/px',
    referenceSystem: 'Собственная сетка исходного изображения; заявленная рамка 27–327°E / 88–61°S; неравнопромежуточная и не подтверждена как полноценная CRS',
    edition: 'Смешанная фанатская карта; единый DR/редакция не установлены',
    provenance: 'Автор HandsomeRob; файл находится в maps/abeir toril/ и не включён в git',
    rights: 'Отдельная лицензия не указана. Только локальная работа за столом; не распространять растр.',
    formats: 'Исходный TIFF; производная пирамида тайлов WebP',
    routeGroups: ['high-road'],
    localOrigin: { path: 'maps/abeir toril/HandsomeRobs_map_of_Toril-TorilMap.tif', author: 'HandsomeRob' },
    note: 'Опорная подложка кокпита. Дальность и позиция вдали от Побережья требуют отдельной калибровки.',
  },
  {
    id: 'toril-gis',
    name: 'Toril GIS — Geospatial Grimoire',
    kind: 'vector',
    status: 'active',
    coverage: 'Поверхность Toril и отдельные слои Подземья; пилот High Road',
    resolution: 'Снимок 2026-09-24_1; локальный индекс описывал 1 851 объект, состав зависит от снимка и источника объекта',
    referenceSystem: 'Toril GCS из toril_gcs.wkt; не подменять координатами растра HandsomeRob без контрольных точек',
    edition: 'Базовая поверхность — FRIA 2e; 3e геометрия деформирована к 2e; 4e Spellplague несовместим; 5e Sword Coast в целом совместим',
    provenance: 'Geospatial Grimoire; источник отдельных объектов указан в метаданных, текст wiki не равен первичному канону',
    rights: 'Неофициальный Fan Content; учитывать Fan Content Policy и атрибуцию. Условия отдельных источников проверять отдельно.',
    formats: 'GeoPackage; WKT; derived JSON/GeoJSON-like layers',
    routeGroups: ['high-road'],
    references: [
      { label: 'Toril GIS — data sources', url: 'https://www.geospatial-grimoire.com/worlds/toril/gis/docs/data-sources/' },
      { label: 'Toril GIS — release snapshots', url: 'https://www.geospatial-grimoire.com/worlds/toril/gis/docs/release-snapshots/' },
      { label: 'Toril GIS repository', url: 'https://github.com/geospatial-grimoire/toril-gis' },
    ],
    note: 'Слой пригоден как источник с редакциями и конфликтами, а не как бесспорная география.',
  },
  {
    id: 'toril-derived-layers',
    name: 'Производные слои кокпита Toril',
    kind: 'vector',
    status: 'derived',
    coverage: 'Глобальная карта и наземные подписи; подробность неодинакова',
    resolution: '1 550 подписей; 863 точки мест; 354 нерешённых/отвергнутых сопоставления; подземный слой — 40 уникальных областей и 87 точек',
    referenceSystem: 'Пиксели исходного растра; подземная привязка по 60 местам: медиана 37 px, p90 110 px',
    edition: 'Смешанные исходные редакции; следовать источнику каждой сущности',
    provenance: 'content/maps/toril-labels.json, toril-places.json, toril-missing.json, toril-underdark.json; скрипты OCR/привязки указаны в записях',
    rights: 'Производный Fan Content; атрибуция Toril GIS и правообладателей сохранены; не считать OCR-позицию каноном.',
    formats: 'JSON, PNG/WebP grid layers, vector schema and route graph',
    routeGroups: ['high-road'],
    references: [
      { label: 'Toril GIS — data sources', url: 'https://www.geospatial-grimoire.com/worlds/toril/gis/docs/data-sources/' },
    ],
    note: 'High Road/Long Road видны в схеме; Triboar Trail не дорисован, так как подтверждённой линии в имеющихся источниках нет.',
  },
  {
    id: 'toril-underdark',
    name: 'Toril GIS — Подземье',
    kind: 'vector',
    status: 'derived',
    coverage: 'Отдельный подземный слой; 40 уникальных областей (28/33/27 по трём горизонтам)',
    resolution: '87 точек (38/51/32 по трём горизонтам); сверка по 60 опорным местам: медиана 37 px, p90 110 px исходной поверхности',
    referenceSystem: 'Привязано к пикселям поверхности для показа; подземная координатная система и высоты не заданы',
    edition: 'Состав и источник региона проверять по метаданным Toril GIS; не смешивать с поверхностной географией',
    provenance: 'content/maps/toril-underdark.json; Toril GIS / Geospatial Grimoire',
    rights: 'Неофициальный Fan Content; атрибуция и права отдельных оснований требуют проверки.',
    formats: 'JSON polygon rings',
    routeGroups: ['underdark-only'],
    references: [
      { label: 'Toril GIS — data sources', url: 'https://www.geospatial-grimoire.com/worlds/toril/gis/docs/data-sources/' },
      { label: 'Toril GIS repository', url: 'https://github.com/geospatial-grimoire/toril-gis' },
    ],
    note: 'Не является покрытием поверхности вдоль High Road; вертикальные входы и переходы пока не подтверждены этим слоем.',
  },
  {
    id: 'forgotten-realms-rasters',
    name: 'Forgotten Realms Rasters',
    kind: 'raster',
    status: 'candidate',
    coverage: 'Поверхностные карты Toril по регионам и редакциям',
    resolution: 'Набор растров разных масштабов; единое разрешение отсутствует',
    referenceSystem: 'Собственная CRS Toril; GeoTIFF либо PNG/JPG с world file; присвоение WGS84 может искажать геометрию',
    edition: 'Слои FRIA/2e, 3e, 4e и 5e нужно выбирать явно',
    provenance: 'Публичный проект Geospatial Grimoire; список слоёв и источник конкретного растра проверять перед импортом',
    rights: 'В опубликованном описании нет общего разрешения на повторное распространение растров.',
    formats: 'GeoTIFF, PNG/JPG + world files',
    routeGroups: ['high-road'],
    references: [
      { label: 'Forgotten Realms Rasters repository', url: 'https://github.com/geospatial-grimoire/forgotten-realms-rasters' },
    ],
    note: 'Перспективен для контроля привязки и изданий; текущая проверка не подтвердила локальную установку всего набора.',
  },
  {
    id: 'fria',
    name: 'Forgotten Realms Interactive Atlas (FRIA)',
    kind: 'catalog',
    status: 'reference',
    coverage: 'Планетарные, региональные и городские карты; заявлено свыше 850 цифровых карт',
    resolution: 'Номинальная основа глобальной карты около 1:2 000 000; подробность отдельных планов различается',
    referenceSystem: 'Историческая печатно-цифровая карта; машинная CRS/экспорт геометрии не установлены',
    edition: '1999; картографическая основа для ряда 2e-слоёв Toril GIS',
    provenance: 'ProFantasy выпускала атлас в сотрудничестве/по лицензии Wizards of the Coast; продукт больше не продаётся',
    rights: 'Официальное происхождение не означает разрешения на извлечение/перепубликацию карт.',
    formats: 'Исторический коммерческий CD-ROM; переносимый современный слой в проекте не найден',
    routeGroups: ['high-road'],
    references: [
      { label: 'ProFantasy — Forgotten Realms Interactive Atlas', url: 'https://www.profantasy.com/pages/forgotten-realms-interactive-atlas' },
    ],
    note: 'Полезен для поиска редакции и первичного происхождения, не для автоматического импорта.',
  },
  {
    id: 'aided-d-atlas',
    name: 'AideDD Faerûn / Neverwinter',
    kind: 'catalog',
    status: 'candidate',
    coverage: 'Faerûn; интерактивные пины и области Neverwinter',
    resolution: 'Позиции пинов доступны в интерфейсе сайта; точный экспорт/масштаб и версия подложки не проверены',
    referenceSystem: 'Локальная система карты; совпадение с Mike Schley-подложкой вероятно по атрибуции, но не подтверждено контрольными точками',
    edition: 'Версия карты/состояние Neverwinter не установлены',
    provenance: 'AideDD; у городской карты указан Mike Schley',
    rights: 'Не установлены права на изображение и экспорт координат. Не копировать растр/тексты до проверки.',
    formats: 'Web page; marker deep links; возможный пользовательский GeoJSON не подтверждён',
    routeGroups: ['high-road'],
    anchorStops: ['Neverwinter'],
    references: [
      { label: 'AideDD — Faerûn atlas', url: 'https://www.aidedd.org/atlas/faerun' },
      { label: 'AideDD — Neverwinter', url: 'https://www.aidedd.org/atlas/neverwinter' },
    ],
    note: 'Кандидат для сверки названий и пинов, не источник принятой геометрии.',
  },
  {
    id: 'forgotten-maps',
    name: 'Forgotten Maps — Faerûn / Neverwinter',
    kind: 'catalog',
    status: 'candidate',
    coverage: 'Региональные и городские карты; автор сообщает о 50+ картах мест',
    resolution: 'Интерактивные планы локаций; общий масштаб и переносимые координаты не обнаружены',
    referenceSystem: 'Экранные карты; CRS/калибровка неизвестны',
    edition: 'Состояния карт и эпохи фиксировать по конкретной карте',
    provenance: 'Crowd/fan project; у отдельных карт разные авторы',
    rights: 'Нет общей лицензии на повторное использование; условия отдельной карты проверять у автора.',
    formats: 'Web app; экспорт в проектный формат не подтверждён',
    routeGroups: ['high-road'],
    anchorStops: ['Neverwinter'],
    references: [
      { label: 'Forgotten Maps — Neverwinter', url: 'https://forgottenmaps.com/neverwinter/' },
    ],
    note: 'Полезен как указатель на названия и связки городского пина с планом места.',
  },
  {
    id: 'neverwinter-plan',
    name: 'План Neverwinter — Mike Schley',
    kind: 'raster',
    status: 'active',
    coverage: 'Только Neverwinter и его городская планировка',
    resolution: '1 440 × 1 015 px; локальная линейка около 3,58 ft/px; план в стенах около 0,8 мили',
    referenceSystem: 'Пиксельная сетка локального растра; перевод в футы откалиброван, географическая CRS отсутствует',
    edition: 'План состояния города после восстановления/Chasm; точная публикация и дата карты ещё сверяются',
    provenance: 'Mike Schley; art © Wizards of the Coast; источник перечислен в content/maps/neverwinter.json',
    rights: 'Локальное личное использование за столом; растр не в git и не распространяется.',
    formats: 'WebP подложка; собственные тайлы; ручные/авторские геометрические черновики',
    routeGroups: ['high-road'],
    anchorStops: ['Neverwinter'],
    localOrigin: { path: 'maps/plans/neverwinter/Neverwinter-Map-Horizontal.webp', author: 'Mike Schley (© Wizards of the Coast)' },
    note: 'Именованных зданий/канонических пинов, согласованных с подложкой, пока не подтверждено.',
  },
  {
    id: 'neverwinter-uvtt',
    name: 'Локальные Neverwinter `.dd2vtt` черновики',
    kind: 'tactical',
    status: 'draft',
    coverage: 'Одна settlement-сцена Neverwinter, два варианта сетки',
    resolution: 'UVTT 0.2; карта 194 × 232 клеток; `pixels_per_grid` расходится: 8 и 10',
    referenceSystem: 'Сетка сцены; географической CRS нет; стены/порталы требуют визуальной сверки',
    edition: 'Авторский черновик M19, не канонический план зданий',
    provenance: 'Два локальных файла в DND staff/разное; имена содержат один place ID',
    rights: 'Права на встроенную картинку и ассеты не проверены; локальный черновик не является разрешением на публикацию.',
    formats: 'Universal VTT `.dd2vtt` 0.2: изображение, сетка и геометрия сцены',
    routeGroups: ['high-road'],
    anchorStops: ['Neverwinter'],
    note: 'До выбора варианта нужно разрешить расхождение масштаба 8/10 и проверить привязку к городскому плану.',
  },
  {
    id: 'neverwinter-library-archives',
    name: 'Переданные архивы Neverwinter (16.11.2026)',
    kind: 'archive',
    status: 'uninspected',
    coverage: 'Не подтверждено; заявлены `Neverwinter_Maps.zip` и `guide-to-neverwinter.module`',
    resolution: 'Содержимое и вложенные карты не осмотрены',
    referenceSystem: 'Неизвестна',
    edition: 'Неизвестна',
    provenance: 'Два пользовательских файла Library; 12,5 MB и 52,5 MB',
    rights: 'Не оценены до просмотра состава и лицензий вложений.',
    formats: 'ZIP и Foundry `.module`-архив',
    routeGroups: ['high-road'],
    anchorStops: ['Neverwinter'],
    note: 'В этой среде перенос байтов завершился сетевой ошибкой DNS; не засчитывать содержимое как проверенное покрытие.',
  },
  {
    id: 'local-generic-assets',
    name: 'Внешний диск DND staff — общая библиотека',
    kind: 'catalog',
    status: 'candidate',
    coverage: 'Общие тактические карты, подземья, города и справочники; геопривязка к High Road не доказана',
    resolution: '2 449 файлов; 960 JPG, 800 PDF, 339 ZIP; тематические наборы не равны географическому покрытию',
    referenceSystem: 'В большинстве случаев нет CRS, world file или локальной калибровки',
    edition: 'Смешанные редакции D&D и авторские наборы; фиксировать по конкретному материалу',
    provenance: 'Локальная папка владельца; текущая инвентаризация по именам/форматам, не постраничная проверка всех документов',
    rights: 'Личное использование/доступ к паку не подтверждает право на публикацию; учитывать лицензию конкретного автора.',
    formats: 'PDF/JPG/PNG/ZIP и прочие локальные файлы; два `.dd2vtt`; нативных Wonderdraft/Dungeondraft и GIS-файлов не найдено',
    routeGroups: [],
    note: 'В числе релевантных материалов: `undermap.jpg`, Underdark/Drow справочники, `Cityscape.pdf`, Phandelver и Waterdeep книги. Их нельзя автоматически ставить на карту.',
  },
];

/** Stops were taken from content/maps/toril-places.json; each connecting line is only a planning aid. */
export const M20_ROUTE_SEGMENTS: readonly MapRouteSegment[] = [
  {
    id: 'high-road-waterdeep-neverwinter',
    name: 'High Road · Waterdeep → Leilon → Neverwinter',
    routeGroup: 'high-road',
    stops: [
      routeStop('e37dd71f-f84a-4ba1-a21c-2c98f6ad3cc2'),
      routeStop('0598e6f0-5933-41cf-b00b-bf8c97334031'),
      routeStop('7e243b80-8918-42fa-b60e-03cec8bdb184'),
    ],
    priorityWorld: 5,
    priorityTable: 4,
    geometryNote: 'Точки — позиции маркеров на растре. Соединитель между ними схематичен; дорожный слой остаётся отдельным источником.',
  },
  {
    id: 'high-road-luskan-neverwinter',
    name: 'High Road · Luskan → Neverwinter',
    routeGroup: 'high-road',
    stops: [
      routeStop('cbe600f2-1f0f-4599-8c6f-436645c9bcac'),
      routeStop('7e243b80-8918-42fa-b60e-03cec8bdb184'),
    ],
    priorityWorld: 4,
    priorityTable: 3,
    geometryNote: 'Точки — позиции маркеров на растре. Соединитель между ними схематичен; дорожный слой остаётся отдельным источником.',
  },
  {
    id: 'high-road-waterdeep-leilon',
    name: 'Сегмент · Waterdeep → Leilon',
    routeGroup: 'high-road',
    stops: [
      routeStop('e37dd71f-f84a-4ba1-a21c-2c98f6ad3cc2'),
      routeStop('0598e6f0-5933-41cf-b00b-bf8c97334031'),
    ],
    priorityWorld: 3,
    priorityTable: 3,
    geometryNote: 'Сегмент High Road между двумя именованными маркерами; линия соединения — поисковая, не авторитетная геометрия дороги.',
  },
  {
    id: 'high-road-leilon-neverwinter',
    name: 'Сегмент · Leilon → Neverwinter',
    routeGroup: 'high-road',
    stops: [
      routeStop('0598e6f0-5933-41cf-b00b-bf8c97334031'),
      routeStop('7e243b80-8918-42fa-b60e-03cec8bdb184'),
    ],
    priorityWorld: 4,
    priorityTable: 5,
    geometryNote: 'Сегмент High Road между двумя именованными маркерами; линия соединения — поисковая, не авторитетная геометрия дороги.',
  },
];

export const M20_DETAIL_GAPS: readonly MapDetailGap[] = [
  {
    id: 'verify-road-source',
    title: 'Проверить источник и редакцию дорожной линии',
    layer: 'Дороги / макромаршрут',
    routeGroups: ['high-road'],
    minimumRadiusMiles: 0,
    priorityWorld: 4,
    priorityTable: 4,
    output: 'Сверенный фрагмент дороги с source id, редакцией, контрольными точками и точностью.',
    reason: 'Текущая сплошная линия получена из растра; она не заменяет векторную геометрию первичного источника.',
  },
  {
    id: 'terrain-corridor',
    title: 'Свести рельеф и дорожный коридор',
    layer: 'Рельеф / опасности / переходы',
    routeGroups: ['high-road'],
    minimumRadiusMiles: 1,
    priorityWorld: 4,
    priorityTable: 5,
    output: 'Только локальная полоса рельефа, водных преград и точек смены маршрута в выбранном радиусе.',
    reason: 'Рельеф классифицирован по цвету растра; несовпадения на локальных участках нельзя трактовать как подтверждённый факт.',
  },
  {
    id: 'nearby-settlements',
    title: 'Сверить промежуточные места и пины',
    layer: 'Поселения / POI / названия',
    routeGroups: ['high-road'],
    minimumRadiusMiles: 16,
    priorityWorld: 3,
    priorityTable: 4,
    output: 'Очередь POI в пределах буфера с исходной ссылкой и статусом координаты.',
    reason: 'Справочник содержит найденные и неразрешённые пины; 354 записи отдельно перечислены как пропуски/ошибки.',
  },
  {
    id: 'neverwinter-plan-crosswalk',
    title: 'Согласовать городской план с дорожным пином',
    layer: 'Поселение → городской план',
    routeGroups: ['high-road'],
    anchorStops: ['Neverwinter'],
    minimumRadiusMiles: 0,
    priorityWorld: 4,
    priorityTable: 5,
    output: 'Проверенные ориентиры и преобразование между городским растром и пинами без перезаписи канона.',
    reason: 'Растр 1440 × 1015 откалиброван по линейке; совпадение с AideDD/городскими маркерами не подтверждено.',
  },
  {
    id: 'uvtt-scale-reconcile',
    title: 'Разрешить расхождение `.dd2vtt` 8/10 px на клетку',
    layer: 'Тактическая сцена / стены / порталы',
    routeGroups: ['high-road'],
    anchorStops: ['Neverwinter'],
    minimumRadiusMiles: 0,
    priorityWorld: 2,
    priorityTable: 5,
    output: 'Один проверенный UVTT-профиль либо две явно версионированные версии сцены.',
    reason: 'Два локальных экспорта имеют одинаковый размер сетки, но разные pixels_per_grid; импорт ещё не подтверждает визуальную геометрию.',
  },
];

export interface MapPriorityScore { world: number; table: number }
export type MapPriorityScores = Readonly<Record<string, MapPriorityScore>>;

export function initialRouteScores(): Record<string, MapPriorityScore> {
  return Object.fromEntries(M20_ROUTE_SEGMENTS.map(route => [route.id, { world: route.priorityWorld, table: route.priorityTable }]));
}

export function initialGapScores(): Record<string, MapPriorityScore> {
  return Object.fromEntries(M20_DETAIL_GAPS.map(gap => [gap.id, { world: gap.priorityWorld, table: gap.priorityTable }]));
}

export function sortByPriority<T extends { id: string }>(
  items: readonly T[],
  scores: MapPriorityScores,
  axis: MapPriorityAxis,
): T[] {
  return [...items].sort((a, b) => {
    const aScore = scores[a.id] ?? { world: 0, table: 0 };
    const bScore = scores[b.id] ?? { world: 0, table: 0 };
    const scoreDifference = bScore[axis] - aScore[axis];
    if (scoreDifference !== 0) return scoreDifference;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function sourcesForRoute(route: MapRouteSegment): MapRegistrySource[] {
  const stops = new Set(route.stops.map(stop => stop.name));
  return M20_MAP_SOURCES.filter(source => {
    if (source.routeGroups.includes('surface-global')) return true;
    if (source.routeGroups.includes(route.routeGroup)) {
      return !source.anchorStops?.length || source.anchorStops.some(stop => stops.has(stop));
    }
    return (source.anchorStops ?? []).some(stop => stops.has(stop));
  });
}

export function gapsForRoute(
  route: MapRouteSegment,
  radiusMiles: number,
  scores: MapPriorityScores,
  axis: MapPriorityAxis,
): MapDetailGap[] {
  const stops = new Set(route.stops.map(stop => stop.name));
  const candidates = M20_DETAIL_GAPS.filter(gap =>
    gap.routeGroups.includes(route.routeGroup)
    && radiusMiles >= gap.minimumRadiusMiles
    && (!(gap.anchorStops?.length) || gap.anchorStops.some(stop => stops.has(stop))),
  );
  return sortByPriority(candidates, scores, axis);
}

function distancePointToSegment(point: Pick<MapRouteStop, 'x' | 'y'>, a: MapRouteStop, b: MapRouteStop): number {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** Candidate distance to the schematic search line in the shared raster-pixel space. */
export function routePlaceCandidates(
  route: MapRouteSegment,
  radiusMiles: number,
  places: readonly MapPlacePoint[],
): RoutePlaceCandidates {
  const radiusPixels = Math.max(0, Number.isFinite(radiusMiles) ? radiusMiles : 0) / M20_CORRIDOR_MILES_PER_PIXEL;
  const distanceToRoute = (point: MapPlacePoint) => {
    if (!route.stops.length) return Number.POSITIVE_INFINITY;
    if (route.stops.length === 1) return Math.hypot(point.x - route.stops[0].x, point.y - route.stops[0].y);
    return Math.min(...route.stops.slice(1).map((stop, index) => distancePointToSegment(point, route.stops[index], stop)));
  };
  const pinCandidates: MapPlaceCandidate[] = [];
  const labelHints: MapPlaceCandidate[] = [];
  for (const place of places) {
    if (!Number.isFinite(place.x) || !Number.isFinite(place.y) || !['marker', 'icon', 'label'].includes(place.how)) continue;
    const distancePixels = distanceToRoute(place);
    if (distancePixels > radiusPixels) continue;
    const candidate = { ...place, distancePixels, distanceMiles: distancePixels * M20_CORRIDOR_MILES_PER_PIXEL };
    if (place.how === 'label') labelHints.push(candidate);
    else pinCandidates.push(candidate);
  }
  const nearestFirst = (a: MapPlaceCandidate, b: MapPlaceCandidate) => a.distancePixels - b.distancePixels || a.name.localeCompare(b.name);
  pinCandidates.sort(nearestFirst); labelHints.sort(nearestFirst);
  return { pinCandidates, labelHints };
}

/** Build a tile-backed corridor preview in source-image pixels; no WGS84 transform is implied. */
export function corridorPreview(route: MapRouteSegment, radiusMiles: number): MapCorridorPreview {
  const radiusPixels = Math.max(0, radiusMiles) / M20_CORRIDOR_MILES_PER_PIXEL;
  const minX = Math.min(...route.stops.map(stop => stop.x)) - radiusPixels;
  const maxX = Math.max(...route.stops.map(stop => stop.x)) + radiusPixels;
  const minY = Math.min(...route.stops.map(stop => stop.y)) - radiusPixels;
  const maxY = Math.max(...route.stops.map(stop => stop.y)) + radiusPixels;
  const x = Math.max(0, Math.floor(minX / 256) * 256);
  const y = Math.max(0, Math.floor(minY / 256) * 256);
  const right = Math.ceil(maxX / 256) * 256;
  const bottom = Math.ceil(maxY / 256) * 256;
  const tiles: MapTilePreview[] = [];
  for (let tileY = y / 256; tileY < bottom / 256; tileY += 1) {
    for (let tileX = x / 256; tileX < right / 256; tileX += 1) {
      tiles.push({
        x: tileX * 256,
        y: tileY * 256,
        width: 256,
        height: 256,
        url: `/maps/tiles/toril/7/${tileX}_${tileY}.webp`,
      });
    }
  }
  return { x, y, width: right - x, height: bottom - y, radiusPixels, tiles };
}
