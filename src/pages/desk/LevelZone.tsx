// Зона уровня лестницы (HANDOFF §3) над картой и выше неё: карта мира или глобус планеты, планетарий системы,
// Великое колесо или Великое древо космологии, схема течений и карточка плана — что есть у уровня. Корешки и
// карточка страницы лежат поверх слева. Ключ — уровень и фокус: переход — одна анимация приближения на 200 мс.
// Вид (глобус или карта, колесо или древо) держит страница: он переживает смену вида главной зоны.
import { useState, type ReactNode } from 'react';
import { eraOf, harptos, tensionsAt, type InfluenceMarks, type Tension } from '../../campaign';
import { SCALE_LABELS, placeEntityType } from '../../components';
import { SCALE_LEVELS, SECONDS_PER_DAY, jumpTo, selectPlace, type Ladder, type Location, type State } from '../../engine';
// Схемы космоса — ленивыми кусками (ROADMAP 0.5): нужны только на уровнях системы, плана и космологии.
import { FlowGraph, GreatWheel, PlanetGlobe, Planetarium, WorldMap, WorldTree } from '../../lazyParts';
import { PlaneInfo } from '../../cosmos/PlaneInfo';
import { PHLOGISTON, sphereByName } from '../../cosmos/phlogiston';
import { COSMOLOGY_NAMES, planeOfLocation } from '../../cosmos/planes';
import { useRealms } from '../../cosmos/realms';
import { REALMSPACE } from '../../cosmos/realmspace';
import { exploredOf } from '../../map/fog';
import type { GazetteerPlace } from '../../map/gazetteer';
import { HEX_MILES, type LevelMap } from '../../map/levelMap';
import { PLANET_MASK_IDS } from '../../map/maps';
import { placeDangerOf, regionWeatherOf } from '../../campaign/mapLayers';
import type { RoadGrid, TerrainGrid } from '../../map/terrain';
import type { MapSchema } from '../../map/schema';
import type { MapPoint, MapView } from '../../map/projection';
import type { UnderdarkRegion } from '../../map/underdark';
import type { JourneyProps, MapPinItem, NewPlaceDraft, TravelRoute } from '../../map/WorldMap';
import { Icon } from '../../icons/Icon';
import { BTN, BTN_TOGGLE } from './styles';

export interface LevelZoneProps {
  state: State;
  events: Parameters<typeof exploredOf>[1];
  ladder: Ladder;
  focus: Location | undefined;
  here: readonly Location[];
  dmView: boolean;
  combat: boolean;
  cardInCombat: boolean;
  /** Записей и фактов о месте — бейджи пинов. */
  counts: ReadonlyMap<string, number>;
  /** Цели ждущих предложений — пульс пинов (только мастеру). */
  pendingIds: ReadonlySet<string>;
  /** Карта уровня — её считает страница: поход и данные карты нужны ей самой. */
  map: LevelMap | undefined;
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
  cosmologyView: 'wheel' | 'tree';
  onCosmologyView: (v: 'wheel' | 'tree') => void;
  /** Поход A5E; нет — данные похода ещё грузятся (ROADMAP 0.5), панель регионов не рисуется. */
  journey?: JourneyProps;
  onTravel: (route: TravelRoute) => void;
  goLadder: (next: Ladder) => void;
  onPin: (id: string) => void;
  /** Новое место щелчком по карте (M8) — только мастеру: черновик и место фокуса, куда оно встанет. */
  onNewPlace?: (draft: NewPlaceDraft, parent: Location) => void;
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
  state, events, ladder, focus, here, dmView, combat, cardInCombat, counts, pendingIds, map, terrain, roads, schema, underdark, gazetteer, lens, onScene,
  planetView, onPlanetView, onCityView, cosmologyView, onCosmologyView, journey, onTravel, goLadder, onPin, onNewPlace, tensions, influence, stacks, card,
}: LevelZoneProps) {
  const shownCard = !combat || cardInCombat ? card : null;
  // Слой «Опасность» (6.4): веса встреч мест — секрет мастера, игрокам их нет.
  const danger = dmView ? placeDangerOf(state) : undefined;
  const mapPins: MapPinItem[] = (map?.places ?? []).map(l => ({
    id: l.id,
    name: l.name,
    type: placeEntityType(l.scale),
    icon: `scale-${l.scale}` as const,
    x: l.geo!.x,
    y: l.geo!.y,
    count: counts.get(l.id) || undefined,
    selected: ladder.path[l.scale] === l.id,
    pending: pendingIds.has(l.id),
    // Факты о месте: мастеру — все, игрокам — только открытые (секрет на их столе отсутствует, а не скрыт).
    facts: Object.values(state.facts)
      .filter(f => f.subjectId === l.id && (dmView || f.visibility === 'players'))
      .map(f => ({ id: f.id, text: f.text, secret: f.visibility !== 'players' })),
    ...(danger?.get(l.id) ? { encounters: danger.get(l.id) } : {}),
    ...(dmView && tensions ? { tensions: tensionsAt(tensions, { locationId: l.id, ...(l.ref?.startsWith('place:') ? { placeId: l.ref.slice(6) } : {}) }).map(t => t.title) } : {}),
  }));
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
  const [globeFocus, setGlobeFocus] = useState<MapPoint | undefined>(undefined);
  // Уровни без карты: система — планетарий (F4.3), план — схема течений флогистона (F4.2), если данные о них есть.
  const systemOn = ladder.level === 'system' && focus?.name === REALMSPACE.sphere.name;
  const planeSphere = ladder.level === 'plane' ? here.map(l => sphereByName(PHLOGISTON, l.name)).find(Boolean) : undefined;
  // Космология — Великое колесо кольцом по мировоззрению; план — его карточка (у Материального — рядом со схемой течений).
  const wheelOn = ladder.level === 'cosmology' && !!focus && COSMOLOGY_NAMES.includes(focus.name);
  const planeHere = ladder.level === 'plane' && focus ? planeOfLocation(focus.name) : undefined;
  // Уделы богов (E3) — по году кампании; данные богов грузятся, только когда на экране схема или план.
  const realms = useRealms(eraOf(harptos(state.time.sec).year), wheelOn || !!planeHere);
  const pathPlane = ladder.path.plane ? state.world.locations[ladder.path.plane] : undefined;
  const wheelCurrent = (pathPlane && planeOfLocation(pathPlane.name)?.id) ?? 'material';
  const planeChild = (name: string) => here.find(l => planeOfLocation(l.name)?.name === name);
  const openChild = (name: string) => {
    const place = here.find(l => l.name === name);
    if (place) goLadder(jumpTo(state, selectPlace(state, ladder, place.id), place.scale));
  };
    return globeOn ? (
    <div key={`${ladder.level}:${focus?.id ?? ''}:globe`} data-part="level-zone" className="level-zoom flex-1 min-h-0 flex">
      <PlanetGlobe
        passport={map!.passport}
        points={mapPins.map(p => ({ id: p.id, label: p.name, type: p.type, icon: p.icon, x: p.x, y: p.y }))}
        party={map!.party}
        sec={state.time.sec}
        focusAt={globeFocus}
        schema={schema}
        onZoomIn={({ point, scale }) => { setMapStart({ ...point, scale }); onPlanetView('map'); }}
        onPick={hit => {
          const place = hit.region ? here.find(l => l.name === hit.label) : undefined;
          if (place) goLadder(jumpTo(state, selectPlace(state, ladder, place.id), place.scale));
        }}
        tools={<button type="button" title="Плоская карта планеты" onClick={() => { setMapStart(undefined); onPlanetView('map'); }} className={BTN}>Карта</button>}
        className="flex-1 min-h-0"
      >
        {stacks}
        {shownCard}
      </PlanetGlobe>
    </div>
    ) : map ? (
    <div key={`${ladder.level}:${focus?.id ?? ''}${map.plan ? ':plan' : ''}`} data-part="level-zone" className="level-zoom flex-1 min-h-0 flex">
      <WorldMap
        tools={(
          <>
            {dmView && lens ? (
              <button type="button" data-part="lens" title={`Карта и карточки справочника — канон на ${lens.year} DR; щелчок — вернуть год кампании`} onClick={lens.onClear} className={`${BTN} flex items-center gap-1 text-gd-hi shadow-[var(--bevel),inset_0_-2px_0_var(--gd)]`}>
                Канон {lens.year} DR
                <Icon name="cross" size={16} color="currentColor" title="Вернуть год кампании" />
              </button>
            ) : null}
            {hasGlobe ? <button type="button" title="Глобус по маске планеты" onClick={() => { setGlobeFocus(undefined); onPlanetView('globe'); }} className={BTN}>Глобус</button> : null}
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
        travel={dmView && !combat && map.party ? { from: map.party, onGo: onTravel, ...(journey ? { journey } : {}) } : undefined}
        fog={mapFog}
        terrain={terrain}
        roads={roads}
        schema={schema}
        start={hasGlobe ? mapStart : undefined}
        onZoomOut={hasGlobe ? v => { setGlobeFocus({ x: v.x, y: v.y }); onPlanetView('globe'); } : undefined}
        underdark={underdark}
        layers={journey ? {
          ...(dmView ? { danger: { tier: journey.tier, onEncounter: journey.onEncounter } } : {}),
          weather: { today: regionWeatherOf(events, state.time.sec, !dmView), ...(dmView && journey.onWeather ? { onRoll: journey.onWeather } : {}) },
        } : undefined}
        gazetteer={dmView ? gazetteer : undefined}
        eventMarks={dmView && lens ? { year: lens.year, places: lens.marks } : undefined}
        influence={dmView && influence ? influenceWithoutPins(influence, map?.places ?? []) : undefined}
        onScene={dmView ? onScene : undefined}
        className="flex-1 min-h-0"
      >
        {stacks}
        {shownCard}
      </WorldMap>
    </div>
    ) : systemOn ? (
    <div key={`${ladder.level}:${focus?.id ?? ''}`} data-part="level-zone" className="level-zoom flex-1 min-h-0 flex">
      <Planetarium
        day={Math.floor(state.time.sec / SECONDS_PER_DAY)}
        canOpen={b => here.some(l => l.name === b.name)}
        onOpen={b => openChild(b.name)}
        className="flex-1 min-h-0"
      >
        {stacks}
        {shownCard}
      </Planetarium>
    </div>
    ) : wheelOn ? (
    <div key={`${ladder.level}:${focus?.id ?? ''}`} data-part="level-zone" className="level-zoom flex-1 min-h-0 flex">
      {(() => {
        const tools = (
          <>
            <button type="button" aria-pressed={cosmologyView === 'wheel'} title="Великое колесо — модель, принятая в 1492 DR" onClick={() => onCosmologyView('wheel')} className={BTN_TOGGLE}>Колесо</button>
            <button type="button" aria-pressed={cosmologyView === 'tree'} title="Великое древо — модель 1372 DR" onClick={() => onCosmologyView('tree')} className={BTN_TOGGLE}>Древо</button>
          </>
        );
        const View = cosmologyView === 'tree' ? WorldTree : GreatWheel;
        return (
          <View
            tools={tools}
            current={wheelCurrent}
            canOpen={p => !!planeChild(p.name)}
            onOpen={p => openChild(planeChild(p.name)!.name)}
            realms={realms}
            className="flex-1 min-h-0"
          >
            {stacks}
            {shownCard}
          </View>
        );
      })()}
    </div>
    ) : planeSphere ? (
    <div key={`${ladder.level}:${focus?.id ?? ''}`} data-part="level-zone" className="level-zoom flex-1 min-h-0 flex">
      <FlowGraph
        plane={planeHere ? <PlaneInfo plane={planeHere} realms={realms?.(planeHere.id)} /> : undefined}
        current={planeSphere.id}
        canOpen={sp => here.some(l => l.name === sp.name)}
        onOpen={sp => openChild(sp.name)}
        className="flex-1 min-h-0"
      >
        {stacks}
        {shownCard}
      </FlowGraph>
    </div>
    ) : (
    <div key={`${ladder.level}:${focus?.id ?? ''}`} data-part="level-zone" className="level-zoom flex-1 min-h-0 flex items-start gap-4 p-4 overflow-auto">
      {stacks}
      {shownCard}
      {planeHere ? <PlaneInfo plane={planeHere} realms={realms?.(planeHere.id)} className="max-w-xl" /> : null}
    </div>
  );
}

export default LevelZone;
