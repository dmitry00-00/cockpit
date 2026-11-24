import { useMemo, useState, type ChangeEvent } from 'react';
import torilPlaceIndex from '../../content/maps/toril-places.json';
import { Dialog } from 'radix-ui';
import {
  M20_CORRIDOR_MILES_PER_PIXEL,
  M20_DEFAULT_CORRIDOR_RADIUS_MILES,
  M20_MAP_SOURCES,
  M20_ROUTE_SEGMENTS,
  corridorPreview,
  gapsForRoute,
  initialGapScores,
  initialRouteScores,
  routePlaceCandidates,
  sortByPriority,
  sourcesForRoute,
  type MapPriorityAxis,
  type MapPriorityScore,
  type MapDetailGap,
  type MapRegistrySource,
  type MapRouteSegment,
  type MapPlacePoint,
  type RoutePlaceCandidates,
} from './m20MapRegistry';

const SCORE_OPTIONS = [0, 1, 2, 3, 4, 5];
const AXIS_LABEL: Record<MapPriorityAxis, string> = {
  world: 'Важность в мире',
  table: 'Ценность за столом',
};

function PrioritySelect({
  axis,
  value,
  label,
  onChange,
}: {
  axis: MapPriorityAxis;
  value: number;
  label: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex min-w-24 flex-col gap-1 type-body-xs text-t2">
      <span>{label}</span>
      <select
        aria-label={label}
        data-priority-axis={axis}
        value={value}
        onChange={event => onChange(Number(event.currentTarget.value))}
        className="min-h-9 rounded border border-bz/50 bg-pn px-2 text-tx outline-none focus-visible:ring-2 focus-visible:ring-bz"
      >
        {SCORE_OPTIONS.map(score => <option key={score} value={score}>{score} / 5</option>)}
      </select>
    </label>
  );
}

function PrioritySort({ axis, selected, onSelect }: {
  axis: MapPriorityAxis;
  selected: MapPriorityAxis;
  onSelect: (axis: MapPriorityAxis) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected === axis}
      onClick={() => onSelect(axis)}
      className={`rounded border px-2 py-1 type-body-xs ${selected === axis ? 'border-bz bg-br text-tx' : 'border-bz/40 bg-pn text-t2 hover:text-tx'}`}
    >
      Сортировать: {AXIS_LABEL[axis]}
    </button>
  );
}

function RoutePreview({ route, radiusMiles }: { route: MapRouteSegment; radiusMiles: number }) {
  const preview = useMemo(() => corridorPreview(route, radiusMiles), [route, radiusMiles]);
  const routePath = route.stops.map((stop, index) => `${index === 0 ? 'M' : 'L'} ${stop.x} ${stop.y}`).join(' ');
  return (
    <div>
      <svg
        viewBox={`${preview.x} ${preview.y} ${preview.width} ${preview.height}`}
        role="img"
        aria-label={`Фрагмент карты Toril: поисковый коридор ${radiusMiles} миль вокруг ${route.name}`}
        className="max-h-[300px] w-full rounded border border-bz/35 bg-[#1f2930]"
        preserveAspectRatio="xMidYMid meet"
      >
        <title>Планировочный коридор на растре Toril</title>
        <rect x={preview.x} y={preview.y} width={preview.width} height={preview.height} fill="#26343a" />
        {preview.tiles.map(tile => (
          <image key={`${tile.x}:${tile.y}`} href={tile.url} x={tile.x} y={tile.y} width={tile.width} height={tile.height} />
        ))}
        <path d={routePath} fill="none" stroke="#e8b46f" strokeWidth={preview.radiusPixels * 2} strokeLinecap="round" opacity="0.25" />
        <path d={routePath} fill="none" stroke="#fff0cf" strokeWidth={6} strokeDasharray="24 16" strokeLinecap="round" opacity="0.95" />
        {route.stops.map((stop, index) => (
          <g key={stop.name}>
            <circle cx={stop.x} cy={stop.y} r={22} fill="#241d24" stroke="#e8b46f" strokeWidth={5} />
            <text x={stop.x} y={stop.y + 8} textAnchor="middle" fill="#fff" fontSize={24} fontWeight="700">{index + 1}</text>
          </g>
        ))}
      </svg>
      <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 type-body-xs text-t2" aria-label="Опорные места маршрута">
        {route.stops.map((stop, index) => <li key={stop.name}>{index + 1}. {stop.name}</li>)}
      </ol>
      <p className="mt-2 type-body-xs text-t2">
        Радиус рассчитан по локальной калибровке около {M20_CORRIDOR_MILES_PER_PIXEL} мили на пиксель. Штриховая связка между пинами — ориентир для поиска; это не подтверждённая трасса дороги и не новая геометрия мира.
      </p>
    </div>
  );
}

function SourceRow({ source }: { source: MapRegistrySource }) {
  const status = {
    active: 'В работе',
    derived: 'Производный слой',
    reference: 'Справочный',
    candidate: 'Кандидат',
    draft: 'Черновик',
    uninspected: 'Не осмотрен',
  }[source.status];
  return (
    <li className="rounded border border-bz/25 bg-pn/70 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="type-body-sm text-tx">{source.name}</strong>
        <span className="rounded bg-br px-2 py-0.5 type-body-xs text-t2">{status}</span>
      </div>
      <p className="mt-1 type-body-xs text-t2">{source.coverage} · {source.formats}</p>
      <details className="mt-1 type-body-xs text-t2">
        <summary className="cursor-pointer">Разрешение, привязка и происхождение</summary>
        <p className="mt-1">{source.resolution}</p>
        <p className="mt-1">Привязка: {source.referenceSystem}</p>
        <p className="mt-1">Редакция: {source.edition}</p>
        <p className="mt-1">Источник: {source.provenance}</p>
        <p className="mt-1">Права: {source.rights}</p>
        <p className="mt-1">{source.note}</p>
      </details>
    </li>
  );
}

function sourceExportRecord(source: MapRegistrySource) {
  return {
    id: source.id,
    name: source.name,
    kind: source.kind,
    status: source.status,
    coverage: source.coverage,
    resolution: source.resolution,
    referenceSystem: source.referenceSystem,
    edition: source.edition,
    provenance: source.provenance,
    rights: source.rights,
    formats: source.formats,
    routeGroups: [...source.routeGroups],
    ...(source.anchorStops ? { anchorStops: [...source.anchorStops] } : {}),
    ...(source.references ? { references: source.references.map(reference => ({ ...reference })) } : {}),
    ...(source.localOrigin ? { localOrigin: { ...source.localOrigin } } : {}),
    note: source.note,
  };
}

const TORIL_PLACE_POINTS = torilPlaceIndex.places as unknown as readonly MapPlacePoint[];

function downloadPlan({
  route,
  radiusMiles,
  sources,
  unlocatedSources,
  routeOrder,
  routeScores,
  routeSort,
  gaps,
  gapScores,
  gapSort,
  places,
}: {
  route: MapRouteSegment;
  radiusMiles: number;
  sources: readonly MapRegistrySource[];
  unlocatedSources: readonly MapRegistrySource[];
  routeOrder: readonly MapRouteSegment[];
  routeScores: Readonly<Record<string, MapPriorityScore>>;
  routeSort: MapPriorityAxis;
  gaps: readonly MapDetailGap[];
  gapScores: Readonly<Record<string, MapPriorityScore>>;
  gapSort: MapPriorityAxis;
  places: RoutePlaceCandidates;
}) {
  const routeScore = routeScores[route.id] ?? { world: route.priorityWorld, table: route.priorityTable };
  const contents = {
    schemaVersion: 4,
    purpose: 'M20 route coverage planning draft; does not alter campaign canon.',
    route: {
      ...route,
      corridorRadiusMiles: radiusMiles,
      priorityWorld: routeScore.world,
      priorityTable: routeScore.table,
    },
    routePriorityOrder: {
      sortedBy: routeSort,
      routes: routeOrder.map(candidate => {
        const score = routeScores[candidate.id] ?? { world: candidate.priorityWorld, table: candidate.priorityTable };
        return { id: candidate.id, name: candidate.name, priorityWorld: score.world, priorityTable: score.table };
      }),
    },
    sources: sources.map(sourceExportRecord),
    unlocatedSourcePool: {
      description: 'Source registry entries with no routeGroups; listed separately and not counted as route coverage candidates.',
      association: 'not-assigned-to-route',
      sources: unlocatedSources.map(sourceExportRecord),
    },
    gapPriorityAxis: gapSort,
    queuedGaps: gaps.map(gap => {
      const score = gapScores[gap.id] ?? { world: gap.priorityWorld, table: gap.priorityTable };
      return { ...gap, priorityWorld: score.world, priorityTable: score.table };
    }),
    nearbyPlaceCandidates: {
      method: 'point distance to schematic route-stop line in source raster pixels; proximity does not confirm a road or canonical location',
      pinCandidates: places.pinCandidates,
      labelCenterHints: places.labelHints,
    },
    generatedAt: new Date().toISOString(),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(contents, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `m20-${route.id}-${radiusMiles}mi.json`;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function MapCoveragePlanner({ currentMapId }: { currentMapId?: string }) {
  const suggestedRoute = currentMapId === 'neverwinter' ? 'high-road-leilon-neverwinter' : M20_ROUTE_SEGMENTS[0].id;
  const [open, setOpen] = useState(false);
  const [routeId, setRouteId] = useState(suggestedRoute);
  const [radiusMiles, setRadiusMiles] = useState(M20_DEFAULT_CORRIDOR_RADIUS_MILES);
  const [routeSort, setRouteSort] = useState<MapPriorityAxis>('world');
  const [gapSort, setGapSort] = useState<MapPriorityAxis>('table');
  const [routeScores, setRouteScores] = useState<Record<string, MapPriorityScore>>(initialRouteScores);
  const [gapScores, setGapScores] = useState<Record<string, MapPriorityScore>>(initialGapScores);
  const route = M20_ROUTE_SEGMENTS.find(item => item.id === routeId) ?? M20_ROUTE_SEGMENTS[0];
  const sortedRoutes = useMemo(() => sortByPriority(M20_ROUTE_SEGMENTS, routeScores, routeSort), [routeScores, routeSort]);
  const sourceList = useMemo(() => sourcesForRoute(route), [route]);
  const gaps = useMemo(() => gapsForRoute(route, radiusMiles, gapScores, gapSort), [route, radiusMiles, gapScores, gapSort]);
  const nearbyPlaces = useMemo(() => routePlaceCandidates(route, radiusMiles, TORIL_PLACE_POINTS), [route, radiusMiles]);
  const unlocatedSources = M20_MAP_SOURCES.filter(source => source.routeGroups.length === 0);

  const updateScore = (
    setScores: (update: (current: Record<string, MapPriorityScore>) => Record<string, MapPriorityScore>) => void,
    id: string,
    axis: MapPriorityAxis,
    value: number,
  ) => setScores(current => ({ ...current, [id]: { ...current[id], [axis]: value } }));

  const onRadiusChange = (event: ChangeEvent<HTMLInputElement>) => setRadiusMiles(Number(event.currentTarget.value));

  return (
    <Dialog.Root open={open} onOpenChange={setOpen} modal={false}>
      <Dialog.Trigger asChild>
        <button type="button" title="Источники карт, пробелы и приоритеты маршрутов" className="rounded border border-bz/50 bg-pn px-2 py-1 type-body-xs text-tx hover:bg-br focus-visible:outline focus-visible:outline-2 focus-visible:outline-bz">
          Покрытие
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content aria-describedby="m20-map-planner-description" className="fixed left-1/2 top-12 z-[90] w-[min(1120px,calc(100vw-24px))] max-h-[calc(100vh-104px)] -translate-x-1/2 overflow-y-auto rounded bg-pn p-4 shadow-frame outline-none sm:p-5">
          <header className="mb-4 flex items-start justify-between gap-4 border-b border-bz/40 pb-3">
            <div>
              <Dialog.Title className="type-h-20 text-tx">Картографические источники и пробелы</Dialog.Title>
              <Dialog.Description id="m20-map-planner-description" className="mt-1 max-w-3xl type-body-xs text-t2">
                Черновой план M20. Он сводит источники и задаёт очередь детализации, но не записывает новые факты в кампанию.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label="Закрыть реестр карт" className="rounded border border-bz/50 bg-pn px-3 py-2 type-body-xs text-tx hover:bg-br">Закрыть</button>
            </Dialog.Close>
          </header>

          <div className="grid gap-4 lg:grid-cols-[minmax(310px,0.95fr)_minmax(0,1.25fr)]">
            <section aria-labelledby="m20-route-title" className="min-w-0">
              <h3 id="m20-route-title" className="type-h-16 text-tx">Маршруты и два независимых приоритета</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <PrioritySort axis="world" selected={routeSort} onSelect={setRouteSort} />
                <PrioritySort axis="table" selected={routeSort} onSelect={setRouteSort} />
              </div>
              <div className="mt-2 overflow-x-auto rounded border border-bz/30">
                <table className="w-full min-w-[520px] border-collapse text-left type-body-xs">
                  <thead className="bg-br text-t2">
                    <tr><th className="p-2">Участок</th><th className="p-2">Мир</th><th className="p-2">Стол</th></tr>
                  </thead>
                  <tbody>
                    {sortedRoutes.map(candidate => (
                      <tr key={candidate.id} className={candidate.id === route.id ? 'bg-br/70' : 'bg-pn'}>
                        <td className="p-2 align-top">
                          <button type="button" aria-pressed={candidate.id === route.id} onClick={() => setRouteId(candidate.id)} className="text-left text-tx underline decoration-bz/60 underline-offset-2 hover:text-bz">
                            {candidate.name}
                          </button>
                        </td>
                        <td className="p-2 align-top">
                          <select aria-label={`Важность в мире · ${candidate.name}`} value={routeScores[candidate.id]?.world ?? 0} onChange={event => updateScore(setRouteScores, candidate.id, 'world', Number(event.currentTarget.value))} className="min-h-8 rounded border border-bz/40 bg-pn px-1 text-tx">
                            {SCORE_OPTIONS.map(value => <option key={value} value={value}>{value}</option>)}
                          </select>
                        </td>
                        <td className="p-2 align-top">
                          <select aria-label={`Ценность за столом · ${candidate.name}`} value={routeScores[candidate.id]?.table ?? 0} onChange={event => updateScore(setRouteScores, candidate.id, 'table', Number(event.currentTarget.value))} className="min-h-8 rounded border border-bz/40 bg-pn px-1 text-tx">
                            {SCORE_OPTIONS.map(value => <option key={value} value={value}>{value}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 type-body-xs text-t2">Оценки 0–5 — редактируемые рабочие гипотезы. Сортировка выбирает одну ось и не смешивает её со второй.</p>
            </section>

            <section aria-labelledby="m20-corridor-title" className="min-w-0">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 id="m20-corridor-title" className="type-h-16 text-tx">Коридор выбранного участка</h3>
                  <p className="mt-1 type-body-xs text-t2">{route.name}</p>
                </div>
                <label className="flex min-w-56 flex-col gap-1 type-body-xs text-t2">
                  <span>Радиус поиска: <strong className="text-tx">{radiusMiles} миль</strong></span>
                  <input type="range" min="1" max="64" step="1" value={radiusMiles} onChange={onRadiusChange} aria-label="Радиус поискового коридора в милях" className="accent-[var(--bz)]" />
                </label>
              </div>
              <div className="mt-2">
                <RoutePreview route={route} radiusMiles={radiusMiles} />
              </div>
              <p className="mt-2 type-body-xs text-t2">{route.geometryNote}</p>
              <details className="mt-2 rounded border border-bz/25 bg-pn/70 p-2 type-body-xs text-t2">
                <summary className="cursor-pointer">Места рядом с поисковой линией · значки {nearbyPlaces.pinCandidates.length} · центры подписей {nearbyPlaces.labelHints.length}</summary>
                <p className="mt-1">Расстояние измерено до прямых связок между маркерами на локальном растре. Это кандидаты для проверки, не подтверждение близости к настоящей дороге. `marker`/`icon` считаются пинами; координата `label` — только центр подписи и показана отдельно.</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div><strong className="text-tx">Пины карты</strong><ul className="mt-1 max-h-44 space-y-1 overflow-y-auto">{nearbyPlaces.pinCandidates.map(place => <li key={place.id}>{place.nameRu || place.name} · {place.how} · {place.distanceMiles.toFixed(1)} миль · {place.x},{place.y} px</li>)}{!nearbyPlaces.pinCandidates.length ? <li>Нет пинов в выбранном радиусе.</li> : null}</ul></div>
                  <div><strong className="text-tx">Центры подписей · подсказки</strong><ul className="mt-1 max-h-44 space-y-1 overflow-y-auto">{nearbyPlaces.labelHints.map(place => <li key={place.id}>{place.nameRu || place.name} · {place.distanceMiles.toFixed(1)} миль · {place.x},{place.y} px</li>)}{!nearbyPlaces.labelHints.length ? <li>Нет центров подписей в выбранном радиусе.</li> : null}</ul></div>
                </div>
              </details>
            </section>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <section aria-labelledby="m20-sources-title" className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 id="m20-sources-title" className="type-h-16 text-tx">Кандидаты источников для участка</h3>
                <span className="rounded bg-br px-2 py-1 type-body-xs text-t2">{sourceList.length}</span>
              </div>
              <p className="mt-1 type-body-xs text-t2">Источники всё ещё подбираются по реестру, группе участка и опорным местам: проверенных footprints для большинства нет. Для точек растра ниже считается расстояние до поисковой линии; это не превращает прямую связку в подтверждённую дорогу.</p>
              <ul className="mt-2 grid gap-2">
                {sourceList.map(source => <SourceRow key={source.id} source={source} />)}
              </ul>
              {unlocatedSources.length ? (
                <details className="mt-2 rounded border border-bz/25 bg-pn/70 p-2 type-body-xs text-t2">
                  <summary className="cursor-pointer">Локальный пул без пространственной привязки · {unlocatedSources.length}</summary>
                  {unlocatedSources.map(source => (
                    <div key={source.id} className="mt-2 rounded border border-bz/25 p-2">
                      <strong className="text-tx">{source.name}</strong>
                      <p className="mt-1">{source.coverage} · {source.formats}</p>
                      <p className="mt-1">{source.note}</p>
                    </div>
                  ))}
                </details>
              ) : null}
            </section>

            <section aria-labelledby="m20-gaps-title" className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 id="m20-gaps-title" className="type-h-16 text-tx">Очередь недостающих слоёв</h3>
                  <span className="rounded bg-br px-2 py-1 type-body-xs text-t2">{gaps.length}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <PrioritySort axis="world" selected={gapSort} onSelect={setGapSort} />
                  <PrioritySort axis="table" selected={gapSort} onSelect={setGapSort} />
                </div>
              </div>
              <ol className="mt-2 grid gap-2">
                {gaps.map((gap, index) => {
                  const score = gapScores[gap.id] ?? { world: gap.priorityWorld, table: gap.priorityTable };
                  return (
                    <li key={gap.id} className="rounded border border-bz/25 bg-pn/70 p-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <strong className="type-body-sm text-tx">{index + 1}. {gap.title}</strong>
                          <p className="mt-1 type-body-xs text-t2">{gap.layer} · {gap.reason}</p>
                          <p className="mt-1 type-body-xs text-t2">Выход: {gap.output}</p>
                        </div>
                        <div className="flex gap-2">
                          <PrioritySelect axis="world" value={score.world} label={`Важность в мире · ${gap.title}`} onChange={value => updateScore(setGapScores, gap.id, 'world', value)} />
                          <PrioritySelect axis="table" value={score.table} label={`Ценность за столом · ${gap.title}`} onChange={value => updateScore(setGapScores, gap.id, 'table', value)} />
                        </div>
                      </div>
                    </li>
                  );
                })}
                {!gaps.length ? <li className="rounded border border-bz/25 p-3 type-body-xs text-t2">Для этого радиуса нет задач в очереди.</li> : null}
              </ol>
            </section>
          </div>

          <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-bz/40 pt-3">
            <p className="max-w-3xl type-body-xs text-t2">Реестр различает опубликованный источник, производный слой и авторскую геометрию. Непроверенная реконструкция остаётся черновиком и не переписывает канон.</p>
            <button type="button" onClick={() => downloadPlan({
              route,
              radiusMiles,
              sources: sourceList,
              unlocatedSources,
              routeOrder: sortedRoutes,
              routeScores,
              routeSort,
              gaps,
              gapScores,
              gapSort,
              places: nearbyPlaces,
            })} className="rounded border border-bz/50 bg-br px-3 py-2 type-body-xs text-tx hover:bg-pn">Скачать черновик очереди JSON</button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default MapCoveragePlanner;
