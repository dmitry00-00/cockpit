// Зона уровня лестницы (HANDOFF §3) над картой и выше неё: карта мира или глобус планеты, планетарий системы,
// Великое колесо или Великое древо космологии, схема течений и карточка плана — что есть у уровня. Корешки и
// карточка страницы лежат поверх слева. Ключ — уровень и фокус: переход — одна анимация приближения на 200 мс.
// Вид (глобус или карта, колесо или древо) держит страница: он переживает смену вида главной зоны.
import { lazy, Suspense, useRef, useState, type ReactNode } from 'react';
import { calendarAdapterForState, eraOfSetting, tensionsAt, weatherOf, type InfluenceMarks, type Tension } from '../../campaign';
import { SCALE_LABELS, placeEntityType } from '../../components';
import { SCALE_LEVELS, SECONDS_PER_DAY, jumpTo, selectPlace, type Ladder, type Location, type State } from '../../engine';
// Схемы космоса — ленивыми кусками (ROADMAP 0.5): нужны только на уровнях системы, плана и космологии.
import { FlowGraph, GreatWheel, PlanetGlobe, Planetarium, PostSpellplagueFr4e, WorldMap, WorldTree } from '../../lazyParts';
import { PlaneInfo } from '../../cosmos/PlaneInfo';
import { PHLOGISTON, sphereByName } from '../../cosmos/phlogiston';
import { COSMOLOGY_NAMES, planeOfLocation } from '../../cosmos/planes';
import { useRealms } from '../../cosmos/realms';
import { REALMSPACE } from '../../cosmos/realmspace';
import { exploredOf } from '../../map/fog';
import { KIND_LABEL, type GazetteerPlace } from '../../map/gazetteer';
import { PLACE_KIND_ART } from '../../art/semanticBindings';
import { geoOf, HEX_MILES, type LevelMap } from '../../map/levelMap';
import { MapCoveragePlanner } from '../../map/MapCoveragePlanner';
import { UnderdarkMapPanel } from '../../map/UnderdarkMapPanel';
import { PLANET_MASK_IDS } from '../../map/maps';
import { placeDangerOf, regionWeatherOf } from '../../campaign/mapLayers';
import type { RoadGrid, TerrainGrid } from '../../map/terrain';
import type { MapSchema } from '../../map/schema';
import type { MapPassport, MapPoint, MapView } from '../../map/projection';
import type { UnderdarkRegion } from '../../map/underdark';
import type { JourneyProps, MapPinItem, NewPlaceDraft, TravelRoute } from '../../map/WorldMap';
import { warFrontLinesFromState } from '../../map/warFronts';
import { processMarkersFromState } from '../../map/processMarkers';
import { Icon } from '../../icons/Icon';
import { BTN, BTN_TOGGLE } from './styles';
import { SurfaceHostProvider } from '../../map/SurfaceHost';
import { settlementPreview } from '../../campaign/settlementPlan';
import type { SettlementDraft } from '../../map/settlementDraft';
import { planOf } from '../../map/maps';
import { DEFAULT_SETTING_PACKAGE } from '../../packages/registry';
import { adventureRoutesForMap } from '../../campaign/adventureRoutes';
import { AdventureRouteMapPanel } from '../../components/AdventureRouteMapPanel';
import { CosmologyChronologyDialog } from './CosmologyChronologyDialog';
import type { CosmologyViewId } from '../../cosmos/postSpellplagueFr4e.types';
const SettlementPlanView=lazy(()=>import('../../map/SettlementPlanView').then(m=>({default:m.SettlementPlanView})));

export interface LevelZoneProps {
  state: State;
  events: Parameters<typeof exploredOf>[1];
  ladder: Ladder;
  focus: Location | undefined;
  here: readonly Location[];
  dmView: boolean;
  combat: boolean;
  cardInCombat: boolean;
  showInspector?: boolean;
  /** Записей и фактов о месте — бейджи пинов. */
  counts: ReadonlyMap<string, number>;
  /** Цели ждущих предложений — пульс пинов (только мастеру). */
  pendingIds: ReadonlySet<string>;
  /** Карта уровня — её считает страница: поход и данные карты нужны ей самой. */
  map: LevelMap | undefined;
  /** Позиция камеры хранится на странице, чтобы пережить переход между картой и хроникой. */
  savedMapView?: MapView;
  onMapViewChange?: (view: MapView | null) => void;
  terrain: TerrainGrid | null;
  roads: RoadGrid | null;
  /** Векторная схема карты (M16): есть — карта открывается схемой. */
  schema: MapSchema | null;
  underdark: readonly UnderdarkRegion[] | undefined;
  gazetteer: readonly GazetteerPlace[] | undefined;
  /** Линза года канона (ROADMAP Х3): события года у мест справочника и выход из линзы; только мастеру. */
  lens?: { year: number; marks: ReadonlyMap<string, readonly string[]>; onClear: () => void };
  /** Сцена места справочника (Д2): «Сейчас здесь» из карточки места на карте — только мастеру. */
  onScene?: (placeId: string) => void;
  planetView: 'globe' | 'map';
  onPlanetView: (v: 'globe' | 'map') => void;
  /** Поселение с планом (M10): план или карта мира — переключатель, состояние экрана. */
  onCityView?: (v: 'plan' | 'map') => void;
  cosmologyView: CosmologyViewId;
  onCosmologyView: (v: CosmologyViewId) => void;
  /** Поход A5E; нет — данные похода ещё грузятся (ROADMAP 0.5), панель регионов не рисуется. */
  journey?: JourneyProps;
  onTravel: (route: TravelRoute) => void;
  goLadder: (next: Ladder) => void;
  onPin: (id: string) => void;
  /** Новое место щелчком по карте (M8) — только мастеру: черновик и место фокуса, куда оно встанет. */
  onNewPlace?: (draft: NewPlaceDraft, parent: Location) => void;
  /** Геопривязка активного места: координаты исходного растра попадут в журнал предложением. */
  onGeoreference?: (locationId: string, point: MapPoint, passport: MapPassport) => void;
  onSettlementPlan?: (draft: SettlementDraft, location: Location, mapId: string) => void;
  /** Напряжения (Д3): значок на пине места — только мастеру. */
  tensions?: readonly Tension[] | null;
  /** Слой влияния (7.4): базы фракций кампании и места напряжений — только мастеру. */
  influence?: InfluenceMarks;
  /** Корешки «Здесь», державы, противники. */
  stacks: ReactNode;
  /** Карточка в слоте: в бою — только по кнопке. */
  card: ReactNode;
}

/** Напряжения места с пином кампании уже на пине — слой влияния их не повторяет (базы фракций остаются). */
function influenceWithoutPins(m: InfluenceMarks, places: readonly Location[]): InfluenceMarks {
  const pinned = new Set(places.flatMap(l => (l.ref?.startsWith('place:') ? [l.ref.slice(6)] : [])));
  return { bases: m.bases, tensions: new Map([...m.tensions].filter(([id]) => !pinned.has(id))) };
}

export function LevelZone({
  state, events, ladder, focus, here, dmView, combat, cardInCombat, counts, pendingIds, map, savedMapView, onMapViewChange, terrain, roads, schema, underdark, gazetteer, lens, onScene,
  planetView, onPlanetView, onCityView, cosmologyView, onCosmologyView, journey, onTravel, goLadder, onPin, onNewPlace, onGeoreference, onSettlementPlan, tensions, influence, stacks, card, showInspector = true,
}: LevelZoneProps) {
  const [cosmologyPortalContainer, setCosmologyPortalContainer] = useState<HTMLDivElement | null>(null);
  const [planPreview,setPlanPreview]=useState<{locationId:string;mapId:string;draft:SettlementDraft}|null>(null);
  const settlement=dmView && !combat && focus?.scale==='settlement' && ladder.level==='settlement' ? focus : null;
  const preview=settlement && planPreview?.locationId===settlement.id ? planPreview : null;
  const pendingPlan=settlement && Object.values(state.deltas).some(d=>d.status==='pending' && d.patch?.kind==='settlementPlan' && d.patch.plan.locationId===settlement.id);
  const openPlan=()=>{if(!settlement||!map)return;const mapId=geoOf(state,settlement.id)?.map??map.passport.id;setPlanPreview({locationId:settlement.id,mapId,draft:settlementPreview(state,settlement,mapId)});};
  const shownCard = !combat || cardInCombat ? card : null;
  const isForgottenRealms = (state.settingPackageId ?? DEFAULT_SETTING_PACKAGE) === DEFAULT_SETTING_PACKAGE;
  const routeWeather = isForgottenRealms ? weatherOf(state.time.sec) : undefined;
  // Слой «Опасность» (6.4): веса встреч мест — секрет мастера, игрокам их нет.
  const danger = dmView ? placeDangerOf(state) : undefined;
  // Remove unrevealed pins before building any player-visible map props.
  const mapPlaces = (map?.places ?? []).filter(l => dmView || l.revealed === true);
  const mapPins: MapPinItem[] = mapPlaces.map(l => {
    // Only an explicit catalog ref supplies a more specific type; never infer it from name or scale.
    // Keep this detail out of the player projection, whose pins retain the existing broad scale glyph.
    const placeId = dmView && l.ref?.startsWith('place:') ? l.ref.slice(6) : undefined;
    const kind = placeId ? gazetteer?.find(place => place.id === placeId)?.kind : undefined;
    const art = kind ? PLACE_KIND_ART[kind] : undefined;
    return {
      id: l.id,
      name: l.name,
      type: placeEntityType(l.scale),
      icon: `scale-${l.scale}` as const,
      x: l.geo!.x,
      y: l.geo!.y,
      count: counts.get(l.id) || undefined,
      selected: ladder.path[l.scale] === l.id,
      pending: pendingIds.has(l.id),
      ...(art && kind ? { art, artTitle: `Тип места: ${KIND_LABEL[kind] ?? kind}` } : {}),
      // Факты о месте: мастеру — все, игрокам — только открытые (секрет на их столе отсутствует, а не скрыт).
      facts: Object.values(state.facts)
        .filter(f => f.subjectId === l.id && (dmView || f.visibility === 'players'))
        .map(f => ({ id: f.id, text: f.text, secret: f.visibility !== 'players' })),
      ...(danger?.get(l.id) ? { encounters: danger.get(l.id) } : {}),
      ...(dmView && tensions ? { tensions: tensionsAt(tensions, { locationId: l.id, ...(l.ref?.startsWith('place:') ? { placeId: l.ref.slice(6) } : {}) }).map(t => t.title) } : {}),
    };
  });
  const visibleWarFronts = map ? warFrontLinesFromState(state, map.passport.id, dmView) : [];
  const visibleProcessMarkers = map ? processMarkersFromState(state, map.passport.id, dmView) : [];
  const adventureMapRoutes = dmView && map ? Object.values(state.world.adventureSessions ?? {})
    .filter(session => session.status === 'active')
    .flatMap(session => adventureRoutesForMap(session.graph, session.routeStates ?? {}, map.passport.id)
      .map(route => ({
        id: `${session.id}:${route.id}`,
        name: route.name,
        status: route.status,
        places: route.places,
      }))) : [];
  // Ждущие новые места (M8) — пины симуляции: место ещё не в мире, только в предложении; щелчок по ним никуда не ведёт.
  const proposed: MapPinItem[] = dmView && map ? Object.values(state.deltas).flatMap(d => {
    const p = d.status === 'pending' ? d.patch : undefined;
    const geo = p?.kind === 'newLocation' ? p.location.geo : undefined;
    return p?.kind === 'newLocation' && geo?.map === map.passport.id
      ? [{ id: d.id, name: p.location.name, type: placeEntityType(p.location.scale), icon: `scale-${p.location.scale}` as const, x: geo.x, y: geo.y, pending: true }]
      : [];
  }) : [];
  const proposedIds = new Set(proposed.map(p => p.id));
  // Уровни нового места: ниже фокуса, у региона — и подрегион того же уровня; не выше региона и не ниже здания.
  const at = (s: Location['scale']) => SCALE_LEVELS.indexOf(s);
  const newScales = focus && map
    ? SCALE_LEVELS.slice(Math.max(at('region'), focus.scale === 'region' ? at('region') : at(focus.scale) + 1), at('building') + 1)
    : [];
  const mapFog = map ? { explored: exploredOf(state, events, map.passport), forced: !dmView } : undefined;
  // Уровень планеты — глобус по маске (§10), если у карты она есть; плоская карта — переключателем.
  const hasGlobe = !!map && ladder.level === 'planet' && PLANET_MASK_IDS.has(map.passport.id);
  const globeOn = hasGlobe && planetView === 'globe';
  // Колесо между глобусом и плоской картой планеты (M16): с глобуса — карта в той же точке и с тем же градусом на экране,
  // с целой карты дальше — глобус над её центром. Состояние вида, не событие.
  const [mapStart, setMapStart] = useState<MapView | undefined>(undefined);
  const [globeFocus, setGlobeFocus] = useState<MapView | undefined>(undefined);
  const lastFlatView=useRef<MapView|undefined>(undefined);
  // Уровни без карты: система — планетарий (F4.3), план — схема течений флогистона (F4.2), если данные о них есть.
  const systemOn = isForgottenRealms && ladder.level === 'system' && focus?.name === REALMSPACE.sphere.name;
  const planeSphere = isForgottenRealms && ladder.level === 'plane' ? here.map(l => sphereByName(PHLOGISTON, l.name)).find(Boolean) : undefined;
  // Космология — Великое колесо кольцом по мировоззрению; план — его карточка (у Материального — рядом со схемой течений).
  const wheelOn = isForgottenRealms && ladder.level === 'cosmology' && !!focus && COSMOLOGY_NAMES.includes(focus.name);
  const planeHere = isForgottenRealms && ladder.level === 'plane' && focus ? planeOfLocation(focus.name) : undefined;
  // Уделы богов (E3) — по году кампании; данные богов грузятся, только когда на экране схема или план.
  const era = eraOfSetting(calendarAdapterForState(state).yearAt(state.time.sec), state.settingPackageId ?? DEFAULT_SETTING_PACKAGE);
  const realms = useRealms(era, isForgottenRealms && (wheelOn || !!planeHere));
  const pathPlane = ladder.path.plane ? state.world.locations[ladder.path.plane] : undefined;
  const wheelCurrent = (pathPlane && planeOfLocation(pathPlane.name)?.id) ?? 'material';
  const planeChild = (name: string) => here.find(l => planeOfLocation(l.name)?.name === name);
  const openChild = (name: string) => {
    const place = here.find(l => l.name === name);
    if (place) goLadder(jumpTo(state, selectPlace(state, ladder, place.id), place.scale));
  };
  const inspector = showInspector ? (
    <aside className="desk-inspector" aria-label="Объект и окружение">
        {shownCard}
        <details className="desk-nearby">
          <summary className={BTN}>Места и участники</summary>
          {stacks}
        </details>
      </aside>
  ) : null;
    return <SurfaceHostProvider>{preview && settlement ? (
      <div data-part="settlement-plan-preview" className="flex-1 min-h-0 min-w-0 overflow-auto pr-14">
        {pendingPlan ? <p role="status" className="p-2 text-t2">Закрепление ожидает решения во «Входящих».</p> : null}
        <Suspense fallback={<p className="p-4 text-t2">Загрузка плана…</p>}>
          <SettlementPlanView draft={preview.draft} accepted={!!state.world.settlementPlans?.[settlement.id]} onClose={()=>setPlanPreview(null)}
            canonicalLabel={planOf(settlement.ref, state.settingPackageId)?.label}
            onAccept={onSettlementPlan&&!pendingPlan?editedDraft=>onSettlementPlan(editedDraft,settlement,preview.mapId):undefined}/>
        </Suspense>
      </div>
    ) : globeOn ? (
    <div key={`${ladder.level}:${focus?.id ?? ''}:globe`} data-part="level-zone" className="desk-map-layout flex-1 min-h-0 min-w-0 flex">
      {inspector}
      <PlanetGlobe
        passport={map!.passport}
        points={mapPins.map(p => ({ id: p.id, label: p.name, type: p.type, icon: p.icon, x: p.x, y: p.y }))}
        party={map!.party}
        sec={state.time.sec}
        focusAt={globeFocus}
        fromFlat={globeFocus}
        schema={schema}
        onZoomIn={({ point, scale }) => { setMapStart({ ...point, scale }); onPlanetView('map'); }}
        onPick={hit => {
          const place = hit.region ? here.find(l => l.name === hit.label) : undefined;
          if (place) goLadder(jumpTo(state, selectPlace(state, ladder, place.id), place.scale));
        }}
        tools={(
          <>
            {dmView ? <MapCoveragePlanner currentMapId={map!.passport.id} /> : null}
            {dmView && map!.passport.id === 'toril' ? <UnderdarkMapPanel currentMapId={map!.passport.id} /> : null}
            <button type="button" title="Плоская карта планеты" onClick={() => { setMapStart(undefined); onMapViewChange?.(null); onPlanetView('map'); }} className={BTN}>Карта</button>
          </>
        )}
        className="flex-1 min-h-0"
      >
      </PlanetGlobe>
    </div>
    ) : map ? (
    <div key={`${ladder.level}:${focus?.id ?? ''}${map.plan ? ':plan' : ''}`} data-part="level-zone" className={`${hasGlobe?'':'level-zoom '}desk-map-layout flex-1 min-h-0 min-w-0 flex`}>
      {inspector}
      <WorldMap
        tools={(
          <>
            {dmView ? <MapCoveragePlanner currentMapId={map.passport.id} /> : null}
            {dmView && map.passport.id === 'toril' ? <UnderdarkMapPanel currentMapId={map.passport.id} /> : null}
            {dmView && lens ? (
              <button type="button" data-part="lens" title={`Карта и карточки справочника — канон на ${lens.year} DR; щелчок — вернуть год кампании`} onClick={lens.onClear} className={`${BTN} flex items-center gap-1 text-gd-hi shadow-[var(--bevel),inset_0_-2px_0_var(--gd)]`}>
                Канон {lens.year} DR
                <Icon name="cross" size={16} color="currentColor" title="Вернуть год кампании" />
              </button>
            ) : null}
            {hasGlobe ? <button type="button" title="Глобус по маске планеты" onClick={() => { setGlobeFocus(lastFlatView.current); onPlanetView('globe'); }} className={BTN}>Глобус</button> : null}
            {settlement && onSettlementPlan ? <button type="button" onClick={openPlan} className={BTN} title="Авторская геометрия правила стола; канонический план сохраняет приоритет">{state.world.settlementPlans?.[settlement.id]?'Авторский план':'Черновик поселения'}</button>:null}
            {map.plan !== undefined && onCityView ? (
              map.plan
                ? <button type="button" title="Поселение на карте мира: окрестности, поход" onClick={() => onCityView('map')} className={BTN}>Карта мира</button>
                : <button type="button" title="План города" onClick={() => onCityView('plan')} className={BTN}>План</button>
            ) : null}
          </>
        )}
        passport={map.passport}
        frame={map.frame}
        frameKey={map.frameKey}
        pins={[...mapPins, ...proposed]}
        party={map.party ? { ...map.party, label: 'Партия' } : undefined}
        hexMiles={HEX_MILES[ladder.level]}
        onPin={id => { if (!proposedIds.has(id)) onPin(id); }}
        newPlace={dmView && !combat && onNewPlace && focus && newScales.length ? { scales: newScales, scaleLabel: s => SCALE_LABELS[s], onPropose: d => onNewPlace(d, focus) } : undefined}
        georeference={dmView && !combat && onGeoreference ? {
          places: Object.values(state.world.locations).sort((a, b) => a.name.localeCompare(b.name)).map(location => ({
            id: location.id, name: location.name, scaleLabel: SCALE_LABELS[location.scale], ...(location.geo ? { geoMap: location.geo.map } : {}),
          })),
          onPropose: (id, point) => onGeoreference(id, point, map.passport),
        } : undefined}
        travel={dmView && !combat && map.party ? { from: map.party, onGo: onTravel, ...(routeWeather ? { wind: { strength: routeWeather.wind, from: routeWeather.windFrom } } : {}), ...(journey && isForgottenRealms ? { journey } : {}) } : undefined}
        fog={mapFog}
        terrain={terrain}
        roads={roads}
        schema={schema}
        start={hasGlobe ? mapStart ?? savedMapView : savedMapView}
        onViewChange={v=>{lastFlatView.current=v; onMapViewChange?.(v);}}
        onZoomOut={hasGlobe ? v => { setGlobeFocus(v); onPlanetView('globe'); } : undefined}
        underdark={underdark}
        layers={journey && isForgottenRealms ? {
          ...(dmView ? { danger: { tier: journey.tier, onEncounter: journey.onEncounter } } : {}),
          weather: { today: regionWeatherOf(events, state.time.sec, !dmView), ...(dmView && journey.onWeather ? { onRoll: journey.onWeather } : {}) },
        } : undefined}
        gazetteer={dmView ? gazetteer : undefined}
        eventMarks={dmView && lens ? { year: lens.year, places: lens.marks } : undefined}
        influence={dmView && influence ? influenceWithoutPins(influence, map?.places ?? []) : undefined}
        warFronts={visibleWarFronts.length ? visibleWarFronts : undefined}
        processMarkers={visibleProcessMarkers.length ? visibleProcessMarkers : undefined}
        onScene={dmView ? onScene : undefined}
        className="flex-1 min-h-0"
        children={adventureMapRoutes.length ? <AdventureRouteMapPanel routes={adventureMapRoutes} /> : undefined}
      />
    </div>
    ) : systemOn ? (
    <div key={`${ladder.level}:${focus?.id ?? ''}`} data-part="level-zone" className="level-zoom desk-map-layout flex-1 min-h-0 min-w-0 flex">
      {inspector}
      <Planetarium
        day={Math.floor(state.time.sec / SECONDS_PER_DAY)}
        canOpen={b => here.some(l => l.name === b.name)}
        onOpen={b => openChild(b.name)}
        className="flex-1 min-h-0"
      >
      </Planetarium>
    </div>
    ) : wheelOn ? (
    <div key={`${ladder.level}:${focus?.id ?? ''}:${cosmologyView}`} ref={setCosmologyPortalContainer} data-part="level-zone" className="relative level-zoom desk-map-layout flex-1 min-h-0 min-w-0 flex">
      {(() => {
        const tools = (
          <>
            <button type="button" aria-pressed={cosmologyView === 'wheel'} title="Показать схему Великого Колеса" onClick={() => onCosmologyView('wheel')} className={BTN_TOGGLE}>Колесо</button>
            <button type="button" aria-pressed={cosmologyView === 'tree'} title="Показать схему Великого Древа" onClick={() => onCosmologyView('tree')} className={BTN_TOGGLE}>Древо</button>
            <button type="button" aria-pressed={cosmologyView === 'axis'} aria-label="FR 4e после Spellplague" title="FR 4e post-Spellplague · срез источника 1479 DR · Axis-compatible" onClick={() => onCosmologyView('axis')} className={BTN_TOGGLE}>FR 4e</button>
            {dmView ? <CosmologyChronologyDialog model={cosmologyView} portalContainer={cosmologyPortalContainer} /> : null}
          </>
        );
        const View = cosmologyView === 'tree' ? WorldTree : GreatWheel;
        if (cosmologyView === 'axis') {
          return (
            <>
              {showInspector ? (
                <aside className="desk-inspector" aria-label="Контекст выбранной линзы">
                  <p className="type-key uppercase text-gd-hi">Визуальная линза</p>
                  <h2 className="type-h-17 text-tx">FR 4e post-Spellplague</h2>
                  <p className="type-body-sm text-t2">Срез книги — 1479 DR. Spellplague 1385 DR — событие, не граница периода модели.</p>
                  <p className="type-body-sm text-t2">Линза меняет только схему. Игровой объект мира остаётся «{focus?.name ?? 'Космология'}»; время, журнал и карта не изменяются.</p>
                  <details className="desk-nearby">
                    <summary className={BTN}>Места и участники</summary>
                    {stacks}
                  </details>
                </aside>
              ) : null}
              <PostSpellplagueFr4e tools={tools} className="flex-1" />
            </>
          );
        }
        return (
          <>
            {inspector}
            <View
              tools={tools}
              current={wheelCurrent}
              canOpen={p => !!planeChild(p.name)}
              onOpen={p => openChild(planeChild(p.name)!.name)}
              realms={realms}
              className="flex-1 min-h-0"
            >
            </View>
          </>
        );
      })()}
    </div>
    ) : planeSphere ? (
    <div key={`${ladder.level}:${focus?.id ?? ''}`} data-part="level-zone" className="level-zoom desk-map-layout flex-1 min-h-0 min-w-0 flex">
      {inspector}
      <FlowGraph
        plane={planeHere ? <PlaneInfo plane={planeHere} realms={realms?.(planeHere.id)} /> : undefined}
        current={planeSphere.id}
        canOpen={sp => here.some(l => l.name === sp.name)}
        onOpen={sp => openChild(sp.name)}
        className="flex-1 min-h-0"
      >
      </FlowGraph>
    </div>
    ) : (
    <div key={`${ladder.level}:${focus?.id ?? ''}`} data-part="level-zone" className="level-zoom flex-1 min-h-0 flex items-start gap-4 p-4 overflow-auto">
      {stacks}
      {shownCard}
      {planeHere ? <PlaneInfo plane={planeHere} realms={realms?.(planeHere.id)} className="max-w-xl" /> : null}
    </div>
  )}</SurfaceHostProvider>;
}

export default LevelZone;
