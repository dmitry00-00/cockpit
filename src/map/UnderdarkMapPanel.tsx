import { useEffect, useMemo, useState } from 'react';
import { Dialog } from 'radix-ui';
import {
  loadUnderdarkAtlas,
  type UnderdarkAtlas,
  type UnderdarkConnection,
  type UnderdarkLevel,
  type UnderdarkLevelId,
  type UnderdarkRegionRecord,
  type UnderdarkSite,
} from './underdark';

type ViewMode = 'map' | 'connections';

const LEVEL_LABEL: Record<UnderdarkLevelId, string> = {
  Upperdark: 'Верхнее Подземье',
  Middledark: 'Среднее Подземье',
  Lowerdark: 'Нижнее Подземье',
};

const AREA_COLOR: Readonly<Record<string, string>> = {
  Domain: '#78658a',
  Abyss: '#a95459',
  'Cavern Network': '#6b97a0',
  Lake: '#4f93ad',
  'Fungal Forest': '#79935d',
  Subregion: '#bd965d',
};

function depthLabel(level: UnderdarkLevel) {
  if (level.maxDepthMiles === null) return `${level.minDepthMiles}+ миль`;
  if (level.minDepthMiles === 0) return `до ${level.maxDepthMiles} миль`;
  return `${level.minDepthMiles}–${level.maxDepthMiles} миль`;
}

function boundsFor(regions: readonly UnderdarkRegionRecord[], sites: readonly UnderdarkSite[]) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const region of regions) {
    for (const ring of region.rings) {
      for (let i = 0; i + 1 < ring.length; i += 2) {
        xs.push(ring[i]);
        ys.push(ring[i + 1]);
      }
    }
  }
  for (const site of sites) {
    xs.push(site.x);
    ys.push(site.y);
  }
  if (!xs.length) return { x: 0, y: 0, width: 1000, height: 600 };
  const pad = 380;
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return {
    x,
    y,
    width: Math.max(1200, Math.max(...xs) - x + pad),
    height: Math.max(800, Math.max(...ys) - y + pad),
  };
}

function ringPath(ring: readonly number[]) {
  if (ring.length < 6) return '';
  const [x, y, ...rest] = ring;
  const lines = Array.from({ length: Math.floor(rest.length / 2) }, (_, i) => `L ${rest[i * 2]} ${rest[i * 2 + 1]}`);
  return `M ${x} ${y} ${lines.join(' ')} Z`;
}

function SourceLinks({ sources }: { sources: UnderdarkConnection['sources'] }) {
  const verificationLabel = (verification: UnderdarkConnection['sources'][number]['verification']) => {
    if (verification === 'primary-verified') return 'Первичный текст проверен';
    if (verification === 'secondary-citation-only') return 'Только вторичная ссылка';
    return null;
  };
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 type-body-xs text-t2">
      {sources.map(source => (
        <li key={`${source.title}:${source.page ?? source.pages ?? ''}`}>
          <a href={source.url} target="_blank" rel="noreferrer" className="underline decoration-bz/60 underline-offset-2 hover:text-tx">
            {source.title} · {source.edition}{source.page ? ` · с. ${source.page}` : ''}{source.pages ? ` · с. ${source.pages}` : ''}
          </a>
          {verificationLabel(source.verification) ? <span className="ml-1">· {verificationLabel(source.verification)}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function ConnectionCard({ connection }: { connection: UnderdarkConnection }) {
  const hasPrimaryVerifiedSource = connection.sources.some(source => source.verification === 'primary-verified');
  const allSourcesSecondaryOnly = connection.sources.length > 0
    && connection.sources.every(source => source.verification === 'secondary-citation-only');
  const status = hasPrimaryVerifiedSource
    ? 'Первичный источник проверен для этой связи · геометрия неизвестна'
    : allSourcesSecondaryOnly
      ? 'Связь приведена вторичным источником · первичный текст не проверен · геометрия неизвестна'
      : connection.status === 'confirmed-text-unmapped'
        ? 'Источник указан · проверка первичного текста не зафиксирована · геометрия неизвестна'
        : 'Сеть названа источником · первичный текст не проверен · геометрия неизвестна';
  return (
    <li className="rounded border border-bz/30 bg-pn/75 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="type-body-sm text-tx">{connection.via}</strong>
        <span className="rounded bg-br px-2 py-1 type-body-xs text-t2">{status}</span>
      </div>
      <p className="mt-2 type-body-sm text-tx">{connection.from} → {connection.to}</p>
      <p className="mt-1 type-body-xs text-t2">
        {connection.routeLevels.length
          ? `Ярус маршрута по источнику: ${connection.routeLevels.map(level => LEVEL_LABEL[level]).join(' · ')}`
          : 'Ярус самого маршрута источником не установлен.'}
        {connection.surfaceAccess ? ' Подтверждена связь с поверхностью; точный подземный конец неизвестен.' : ''}
      </p>
      {connection.levelContext.length ? (
        <ul className="mt-1 space-y-1 type-body-xs text-t2">
          {connection.levelContext.map(context => (
            <li key={context.place}>
              Геоконтекст GIS · {context.place}: {context.featureLevels.map(level => LEVEL_LABEL[level]).join(' · ')} — {context.basis}
              {context.sourceRecordUrl ? <> <a href={context.sourceRecordUrl} target="_blank" rel="noreferrer" className="underline decoration-bz/60 underline-offset-2">Запись объекта</a></> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 type-body-xs leading-relaxed text-t2">{connection.evidence}</p>
      <SourceLinks sources={connection.sources} />
    </li>
  );
}

function RegionDetail({ region }: { region: UnderdarkRegionRecord }) {
  const sourceName = region.source?.title ?? 'Toril GIS';
  return (
    <div className="mt-3 rounded border border-bz/25 bg-br/40 p-2 type-body-xs text-t2">
      <strong className="text-tx">{region.nameRu || region.name}</strong>
      <p className="mt-1">{region.kind ?? region.class} · запись слоя: {sourceName}{region.source?.edition ? `, ${region.source.edition}` : ''}</p>
      {region.sourceRecordUrl ? <a href={region.sourceRecordUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block underline decoration-bz/60 underline-offset-2">Справочная запись объекта</a> : null}
      {!region.sourceRecordUrl && region.source?.url ? <a href={region.source.url} target="_blank" rel="noreferrer" className="mt-1 inline-block underline decoration-bz/60 underline-offset-2">Общая страница источника: {sourceName}</a> : null}
    </div>
  );
}

function SiteDetail({ site }: { site: UnderdarkSite }) {
  const sourceName = site.source.title;
  return (
    <div className="mt-3 rounded border border-bz/25 bg-br/40 p-2 type-body-xs text-t2">
      <strong className="text-tx">{site.nameRu || site.name}</strong>
      <p className="mt-1">{site.kind} · {sourceName}{site.source.edition ? `, ${site.source.edition}` : ''}</p>
      <p className="mt-1">Координаты на схеме: {site.x}, {site.y} px</p>
      {site.sourceRecordUrl ? <a href={site.sourceRecordUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block underline decoration-bz/60 underline-offset-2">Справочная запись объекта</a> : null}
      {!site.sourceRecordUrl && site.source.url ? <a href={site.source.url} target="_blank" rel="noreferrer" className="mt-1 inline-block underline decoration-bz/60 underline-offset-2">Общая страница источника: {sourceName}</a> : null}
    </div>
  );
}

function AtlasView({ atlas, level, onLevel, mode, onMode }: {
  atlas: UnderdarkAtlas;
  level: UnderdarkLevelId;
  onLevel: (level: UnderdarkLevelId) => void;
  mode: ViewMode;
  onMode: (mode: ViewMode) => void;
}) {
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const regions = useMemo(() => atlas.regions.filter(region => region.featureLevels?.includes(level)), [atlas.regions, level]);
  const sites = useMemo(() => atlas.sites.filter(site => site.featureLevels.includes(level)), [atlas.sites, level]);
  // Keep one pixel frame for every depth so switching levels preserves geographic alignment and scale.
  const bounds = useMemo(() => boundsFor(atlas.regions, atlas.sites), [atlas.regions, atlas.sites]);
  const selectedSite = sites.find(site => site.id === selectedSiteId);
  const selectedRegion = regions.find(region => region.id === selectedRegionId);
  const currentLevel = atlas.levels.find(item => item.id === level)!;

  return (
    <>
      <nav aria-label="Ярус Подземья" className="mb-3 flex flex-wrap gap-2">
        {atlas.levels.map(item => (
          <button
            key={item.id}
            type="button"
            aria-pressed={level === item.id}
            onClick={() => { onLevel(item.id); setSelectedSiteId(null); setSelectedRegionId(null); }}
            className={`rounded border px-3 py-2 text-left type-body-xs ${level === item.id ? 'border-bz bg-br text-tx' : 'border-bz/40 bg-pn text-t2 hover:text-tx'}`}
          >
            <span className="block font-semibold">{item.nameRu}</span>
            <span>{depthLabel(item)}</span>
          </button>
        ))}
        <div className="ml-auto flex gap-2" role="group" aria-label="Режим карты Подземья">
          <button type="button" aria-pressed={mode === 'map'} onClick={() => onMode('map')} className={`rounded border px-3 py-2 type-body-xs ${mode === 'map' ? 'border-bz bg-br text-tx' : 'border-bz/40 bg-pn text-t2'}`}>Схема</button>
          <button type="button" aria-pressed={mode === 'connections'} onClick={() => onMode('connections')} className={`rounded border px-3 py-2 type-body-xs ${mode === 'connections' ? 'border-bz bg-br text-tx' : 'border-bz/40 bg-pn text-t2'}`}>Переходы</button>
        </div>
      </nav>

      {mode === 'map' ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0">
            <svg
              viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
              role="group"
              aria-label={`${currentLevel.nameRu}: ${regions.length} областей и ${sites.length} мест по Toril GIS`}
              preserveAspectRatio="xMidYMid meet"
              className="max-h-[min(62vh,680px)] min-h-72 w-full rounded border border-bz/35 bg-[#17191d]"
            >
              <defs>
                <pattern id="m21-underdark-grid" width="500" height="500" patternUnits="userSpaceOnUse">
                  <path d="M 500 0 L 0 0 0 500" fill="none" stroke="#8b806e" strokeOpacity="0.12" strokeWidth="7" />
                </pattern>
                <radialGradient id="m21-underdark-ground">
                  <stop offset="0%" stopColor="#343039" />
                  <stop offset="100%" stopColor="#19191d" />
                </radialGradient>
              </defs>
              <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} fill="url(#m21-underdark-ground)" />
              <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} fill="url(#m21-underdark-grid)" />
              {regions.map(region => (
                <g key={region.id} role="button" tabIndex={0} className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f0c885]" aria-label={`Выбрать область ${region.nameRu || region.name}`} aria-pressed={selectedRegionId === region.id}
                  onClick={() => { setSelectedRegionId(region.id); setSelectedSiteId(null); }}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedRegionId(region.id); setSelectedSiteId(null); } }}>
                  {region.rings.map((ring, index) => (
                    <path
                      key={`${region.id}:${index}`}
                      d={ringPath(ring)}
                      fill={AREA_COLOR[region.kind ?? region.class ?? ''] ?? '#756b71'}
                      fillOpacity={selectedRegionId === region.id ? 0.48 : 0.22}
                      stroke={AREA_COLOR[region.kind ?? region.class ?? ''] ?? '#b39a74'}
                      strokeOpacity="0.82"
                      strokeWidth={selectedRegionId === region.id ? 24 : 12}
                      vectorEffect="non-scaling-stroke"
                    >
                      <title>{region.nameRu || region.name} · {region.kind ?? region.class}</title>
                    </path>
                  ))}
                </g>
              ))}
              {sites.map(site => (
                <g key={site.id} role="button" tabIndex={0} className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f0c885]" aria-label={`Выбрать место ${site.nameRu || site.name}`} aria-pressed={selectedSiteId === site.id}
                  onClick={() => { setSelectedSiteId(site.id); setSelectedRegionId(null); }}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedSiteId(site.id); setSelectedRegionId(null); } }}>
                  <title>{site.nameRu || site.name} · {site.kind}</title>
                  <circle cx={site.x} cy={site.y} r={selectedSiteId === site.id ? 75 : 48} fill={selectedSiteId === site.id ? '#f0c885' : '#d2b48c'} fillOpacity={selectedSiteId === site.id ? 1 : 0.82} stroke="#211e22" strokeWidth="18" vectorEffect="non-scaling-stroke" />
                </g>
              ))}
            </svg>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 type-body-xs text-t2" aria-label="Условные обозначения">
              {Object.entries(AREA_COLOR).map(([kind, color]) => (
                <span key={kind} className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />{kind}</span>
              ))}
              <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full bg-[#d2b48c]" />место / поселение</span>
            </div>
            {selectedSite ? <SiteDetail site={selectedSite} /> : selectedRegion ? <RegionDetail region={selectedRegion} /> : null}
          </div>
          <aside className="min-h-0 rounded border border-bz/30 bg-pn/65 p-3">
            <h3 className="type-body-sm font-semibold text-tx">Места · {sites.length}</h3>
            <p className="mt-1 type-body-xs text-t2">Точки перечислены в выбранном ярусе Toril GIS. Нажмите название, чтобы подсветить его на схеме.</p>
            <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto pr-1 lg:max-h-[min(47vh,500px)]">
              {sites.map(site => (
                <li key={site.id}>
                  <button type="button" onClick={() => { setSelectedSiteId(site.id); setSelectedRegionId(null); }} className={`w-full rounded px-2 py-1 text-left type-body-xs ${selectedSiteId === site.id ? 'bg-br text-tx' : 'text-t2 hover:bg-br/70 hover:text-tx'}`}>
                    <span className="block truncate">{site.nameRu || site.name}</span>
                    <span className="block opacity-75">{site.kind}</span>
                  </button>
                </li>
              ))}
            </ul>
            <h3 className="mt-3 border-t border-bz/25 pt-2 type-body-sm font-semibold text-tx">Области · {regions.length}</h3>
            <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto pr-1">
              {regions.map(region => (
                <li key={region.id}>
                  <button type="button" onClick={() => { setSelectedRegionId(region.id); setSelectedSiteId(null); }} className={`w-full rounded px-2 py-1 text-left type-body-xs ${selectedRegionId === region.id ? 'bg-br text-tx' : 'text-t2 hover:bg-br/70 hover:text-tx'}`}>
                    <span className="block truncate">{region.nameRu || region.name}</span>
                    <span className="block opacity-75">{region.kind ?? region.class}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      ) : (
        <section aria-label="Подтверждённые связи и переходы">
          <p className="mb-3 rounded border border-bz/30 bg-br/45 p-3 type-body-xs leading-relaxed text-t2">
            Здесь перечислены только связи, для которых есть источник и именованные стороны. Их текст подтверждён; точные линии, входы и координаты переходов в этой версии не нанесены. Ярус географического объекта из GIS не переносится на проход. Пустой слой туннелей Toril GIS не используется как доказательство связи.
          </p>
          <p className="mb-3 rounded border border-bz/30 bg-pn/65 p-3 type-body-xs leading-relaxed text-t2">
            В текущем атласе нет связи, для которой источник задаёт оба яруса перехода. Это означает, что подтверждённые вертикальные рёбра здесь не представлены; оно не доказывает, что переходов в мире нет.
          </p>
          <ul className="grid gap-2 md:grid-cols-2">
            {atlas.connections.map(connection => <ConnectionCard key={connection.id} connection={connection} />)}
          </ul>
          <p className="mt-3 type-body-xs text-t2">Упоминания сетей без локализуемых концов (в том числе Лабиринта между Верхним и Средним Подземьем) остаются исследовательскими пометками, а не рёбрами карты.</p>
        </section>
      )}

      <details className="rounded border border-bz/30 bg-pn/65 p-3 type-body-xs leading-relaxed text-t2">
        <summary className="cursor-pointer font-semibold text-tx">Происхождение данных, привязка и ограничения</summary>
        <div className="mt-2 space-y-2">
          <p><strong>Набор:</strong> {atlas.provenance.dataset}</p>
          <p><strong>Координаты:</strong> {atlas.coordinateSystem.sourceCrs}; {atlas.coordinateSystem.transform}. {atlas.coordinateSystem.meaning}</p>
          <p><strong>Опорные точки:</strong> {atlas.coordinateSystem.controlPoints}; проверка без одной точки — {atlas.coordinateSystem.leaveOneOutSample}; медианная ошибка {atlas.coordinateSystem.medianErrorPx}px, p90 {atlas.coordinateSystem.p90ErrorPx}px исходного растра.</p>
          <p><strong>Ярусы областей:</strong> {atlas.provenance.featureLevelMeaning}</p>
          <p><strong>Положение объектов:</strong> {atlas.provenance.positionMeaning}</p>
          <p><strong>Уверенность:</strong> {atlas.provenance.confidence}</p>
          <p><strong>Ограничения:</strong></p>
          <ul className="list-disc space-y-1 pl-5">{atlas.provenance.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>
          <p>{atlas.error}</p>
          <p>{atlas.attribution}</p>
        </div>
      </details>

      <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-bz/30 pt-3 type-body-xs text-t2">
        <span>Привязка к пикселям растра Toril: медиана ошибки {atlas.coordinateSystem.medianErrorPx}px, p90 {atlas.coordinateSystem.p90ErrorPx}px. Области дают контекст, не геометрию пещер.</span>
        <a href="https://www.geospatial-grimoire.com/worlds/toril/gis/docs/data-sources/" target="_blank" rel="noreferrer" className="underline decoration-bz/60 underline-offset-2 hover:text-tx">Происхождение данных Toril GIS</a>
      </footer>
    </>
  );
}

export function UnderdarkMapPanel({ currentMapId }: { currentMapId?: string }) {
  const [open, setOpen] = useState(false);
  const [atlas, setAtlas] = useState<UnderdarkAtlas | null>(null);
  const [error, setError] = useState(false);
  const [level, setLevel] = useState<UnderdarkLevelId>('Upperdark');
  const [mode, setMode] = useState<ViewMode>('map');

  useEffect(() => {
    if (!open || !currentMapId) return;
    let active = true;
    setError(false);
    void loadUnderdarkAtlas(currentMapId).then(value => {
      if (!active) return;
      setAtlas(value);
      setError(!value);
      if (value && !value.levels.some(item => item.id === level)) setLevel(value.levels[0]?.id ?? 'Upperdark');
    }).catch(() => {
      if (active) setError(true);
    });
    return () => { active = false; };
  }, [currentMapId, open]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen} modal={false}>
      <Dialog.Trigger asChild>
        <button type="button" title="Отдельная многоуровневая карта Подземья с источниками и подтверждёнными связями" className="rounded border border-bz/50 bg-pn px-2 py-1 type-body-xs text-tx hover:bg-br focus-visible:ring-2 focus-visible:ring-bz">
          Подземье
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content aria-describedby="m21-underdark-description" className="fixed left-1/2 top-8 z-[90] w-[min(1180px,calc(100vw-20px))] max-h-[calc(100vh-64px)] -translate-x-1/2 overflow-y-auto rounded bg-pn p-3 shadow-frame outline-none sm:p-5">
          <header className="mb-3 flex items-start justify-between gap-4 border-b border-bz/40 pb-3">
            <div>
              <Dialog.Title className="type-h-20 text-tx">Подземье Фаэруна</Dialog.Title>
              <Dialog.Description id="m21-underdark-description" className="mt-1 max-w-4xl type-body-xs leading-relaxed text-t2">
                Отдельная карта трёх ярусов из Toril GIS. Поверхностные дороги сюда не переносятся; на схеме нет выдуманных линий проходов.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild><button type="button" aria-label="Закрыть карту Подземья" className="rounded border border-bz/40 px-2 py-1 text-t2 hover:bg-br hover:text-tx">Закрыть</button></Dialog.Close>
          </header>
          {!currentMapId || !atlas ? (
            <p role={error ? 'alert' : 'status'} className="rounded border border-bz/30 bg-br/40 p-4 type-body-sm text-t2">
              {error ? 'Для этой карты нет подготовленного атласа Подземья.' : 'Загружаю ярусы и точки…'}
            </p>
          ) : (
            <AtlasView atlas={atlas} level={level} onLevel={setLevel} mode={mode} onMode={setMode} />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
