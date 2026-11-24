// Карта мира (HANDOFF §3, §9): пирамида тайлов с диска, пины мест DOM-кнопками поверх, гексы и линейка.
// Тупой компонент: место, рамку и пины даёт страница, стор он не читает. Вид (сдвиг, приближение), слои и
// точки линейки — состояние экрана, не события: в журнал не идут и перезагрузку не переживают.
// Тайлы — <img> с прямоугольником в целых пикселях экрана (projection.tilesAt): на растровой пирамиде
// канвас ничего не добавляет, а DOM-картинки браузер кэширует и декодирует сам. Под тайлами текущего
// уровня лежит уровень на два мельче — пока грузятся крупные, карта не мигает пустотой.
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type WheelEvent } from 'react';
import { ENTITY, type EntityType } from '../components/EntityCard';
import { useOpenEntity } from '../components/openEntity';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/icons.generated';
import { SemanticMark } from '../art/SemanticMark';
import type { ArtId } from '../art/registry.generated';
import { PLACE_KIND_ART } from '../art/semanticBindings';
import { TRAVEL_PACE_IDS, TRAVEL_PACES, travelDays, travelDaysOver, type TravelPaceId } from '../rules/srd/travel';
import { DIFFICULT, difficultLabel, routeTerrain, type RoadGrid, type RouteTerrain, type TerrainGrid } from './terrain';
import { ENCOUNTER_TYPE_LABEL, JOURNEY_REGIONS, UNDERGROUND_REGION, journeyLegs, roadMilesAsPace, settlementMarks, supplyNeeded, type RegionTier } from '../rules/a5e/journey';
import { underdarkAlong, type UnderdarkRegion } from './underdark';
import { CourseCompass } from './CourseCompass';
import type { Wind, WindDirection } from '../campaign/weather';
import type { ProcessMapMarker } from './processMarkers';
import { loadClean } from './cleanMap';
import { RasterLayer } from './RasterLayer';
import { forceCanvas, mapPixelRatio } from './renderer';
import { SphereSurfaceLayer } from './SphereSurfaceLayer';
import { useSurfaceSession } from './SurfaceHost';
import { PLANET_MASKS } from './planet';
import type { GeographicExtent, SurfaceCamera } from './surfaceProjection';
import { planetFitBox, planetPanBy, planetResizeView, planetStartView, planetZoomAt } from './planetView';
import { RegionLayer, SchemaLayer } from '../lazyParts';
import type { MapSchema } from './schema';
import type { LabelHit } from './schemaLabels';
import type { DangerLayer, WeatherLayer } from './RegionLayer';
import type { ScaleLevel } from '../engine/events';
import type { Explored } from './fog';
import { KIND_LABEL, layerPlaces, placeNear, searchPlaces, wikiUrl, type GazetteerPlace } from './gazetteer';
import {
  FEET_PER_MILE, clampView, fitBox, hexCenters, panBy, pathMiles, scaleBar, scaleBounds, tilesAt, toMap, toScreen, zoomAt, zoomLevelFor,
  type MapBox, type MapPassport, type MapPoint, type MapView, type Viewport,
} from './projection';
import type { WarFrontMapLine } from './warFronts';

export interface MapPinItem extends MapPoint {
  id: string;
  name: string;
  type: EntityType;
  icon?: IconName;
  /** Exact type art from a referenced catalog place; the owning page supplies it only in the DM view. */
  art?: ArtId;
  artTitle?: string;
  /** Сколько о месте записей и фактов — как бейдж корешка «Здесь». */
  count?: number;
  /** Место на пути лестницы. */
  selected?: boolean;
  /** Цель ждущего предложения — кольцо glow-sim (только мастеру; страница не передаёт его игрокам). */
  pending?: boolean;
  /** Факты о месте: секрет мастера — перечёркнутый глаз, открытое игрокам — слух. Игрокам страница секретов не даёт. */
  facts?: readonly { id: string; text: string; secret: boolean }[];
  /** Напряжения места (Д3) — заголовки; только мастеру, игрокам страница их не даёт. */
  tensions?: readonly string[];
  /** Веса встреч места (слой «Опасность», 6.4) — только мастеру; pending — ждущее предложение симуляции. */
  encounters?: readonly { key: string; weight: number; pending?: number }[];
}

export interface WorldMapProps {
  passport: MapPassport;
  /** Куда смотреть: рамка уровня. Новая рамка (другой frameKey) — новый вид; внутри неё мастер двигает карту сам. */
  frame: MapBox;
  frameKey: string;
  pins: readonly MapPinItem[];
  /** Где партия — отдельный знак, не кнопка места. */
  party?: MapPoint & { label: string };
  onPin?: (id: string) => void;
  /** Шаг гекса в милях, если на этом уровне есть гексы (регион — шесть миль, §3). */
  hexMiles?: number;
  /** Туман знаний: что открыто игрокам. forced — стол игроков, туман всегда; иначе — слой мастера по кнопке. */
  fog?: { explored: Explored; forced: boolean };
  /** Поход — только мастеру: путь начинается у партии, кончается на пине места, темп — по таблице SRD. */
  travel?: { from: MapPoint; onGo: (route: TravelRoute) => void; journey?: JourneyProps; wind?: { strength: Wind; from: WindDirection } };
  /** Сетка местности (src/map/terrain.ts): есть — линейка и поход сами считают мили по трудной местности. */
  terrain?: TerrainGrid | null;
  /** Дороги растра (ROADMAP 6.3): есть — путь вдоль пунктира идёт регионом Open Roads, быстрее на милю в час (A5E). */
  roads?: RoadGrid | null;
  /** Подземье Toril GIS (6.3): поход «под землёй» называет владения под путём. */
  underdark?: readonly UnderdarkRegion[];
  /**
   * Векторная схема карты (TASKS M16): есть — карта открывается схемой (регионы, береговая линия, дороги), растр —
   * кнопкой «Карта», как режимы Google Maps. Режим — состояние экрана, не событие.
   */
  schema?: MapSchema | null;
  /** Вид на старте рамки вместо вписывания: переход с глобуса колесом (M16) — та же точка, тот же градус на экране. */
  start?: MapView;
  /** Колесо «дальше» на целой карте — вернуться выше (с плоской карты планеты — на глобус, M16). */
  onZoomOut?: (at: MapView) => void;
  /** Current flat camera for the projection handoff; never a world event. */
  onViewChange?: (view:MapView) => void;
  /**
   * Слои по регионам A5E (ROADMAP 6.4) — линзы, не события; нужны сетка местности. «Опасность» — только мастеру:
   * подкраска регионов, уровень и DC, веса встреч на пинах; «Погода» — d20 регионов на этот день из лога.
   */
  layers?: { danger?: DangerLayer; weather?: WeatherLayer };
  /**
   * Справочник мест (M12, только мастеру): поиск по имени ведёт карту к месту, щелчок по значку растра — карточка
   * места. Справка, не состояние: ничего не пишет в журнал.
   */
  gazetteer?: readonly GazetteerPlace[];
  /**
   * События года канона у мест справочника (ROADMAP Х3, линза «Хроники», только мастеру): место → строки событий.
   * Отметка — значок события с числом; щелчок — карточка места.
   */
  eventMarks?: { year: number; places: ReadonlyMap<string, readonly string[]> };
  /**
   * Слой «Влияние» (Д3, ROADMAP 7.4), только мастеру: базы фракций кампании — места их организаций по вики, кольцом с
   * именами; места напряжений — значком с числом. Зон в милях нет: их радиуса не дают ни вики, ни кампания.
   */
  influence?: { bases: ReadonlyMap<string, readonly string[]>; tensions: ReadonlyMap<string, readonly string[]> };
  /** Active campaign war routes, supplied only by the DM view; these are routes, not claimed territorial borders. */
  warFronts?: readonly WarFrontMapLine[];
  /** Active process markers for mapped campaign places; supplied only by the DM view. */
  processMarkers?: readonly ProcessMapMarker[];
  /** Место справочника — сцена «Сейчас здесь» (Д2, ROADMAP 6.2): кнопка в карточке места под щелчком. */
  onScene?: (placeId: string) => void;
  /**
   * Новое место щелчком (M8, только мастеру): точка на карте и форма — имя и уровень, из справочника под щелчком или
   * ввод; «Предложить» отдаёт черновик странице, а та кладёт во входящие предложение с патчем — мир меняется только
   * принятием. `scales` — какие уровни можно выбрать на этой карте.
   */
  newPlace?: { scales: readonly ScaleLevel[]; scaleLabel: (s: ScaleLevel) => string; onPropose: (draft: NewPlaceDraft) => void };
  /** Assign an active campaign place to a point on this map; acceptance writes only this map's raster coordinates. */
  georeference?: {
    places: readonly { id: string; name: string; scaleLabel: string; geoMap?: string }[];
    onPropose: (locationId: string, point: MapPoint) => void;
  };
  /** Свои кнопки страницы в начале панели карты (переключатель «Глобус» на уровне планеты). */
  tools?: ReactNode;
  /** Слева сверху поверх карты — корешки и карточка страницы. */
  children?: ReactNode;
  className?: string;
}

/**
 * Поход по A5E (src/rules/a5e/journey.ts): уровень опасности регионов и сколько ртов кормить; «встреча» и «погода» —
 * страница бросает d100 и d20 по таблицам региона и пишет итог в журнал; «занятия» — форма страницы под регионом.
 */
export interface JourneyProps {
  tier: RegionTier;
  members: number;
  onEncounter: (regionId: string) => void;
  onWeather?: (regionId: string) => void;
  /** Форма «Занятия в пути» для региона (components/JourneyActivities) — её собирает страница: партия, броски; days —
   *  дни пути по региону (A5E: «1 Supply per day spent doing this journey activity»). */
  activities?: (regionId: string, dc: number, days: number) => ReactNode;
  /** Общий запас партии сейчас — рядом с расходом пути; нет — только расход. */
  supply?: number;
  /** Последний бросок встречи (ROADMAP 0.5, M15): итог строкой под регионом; onAppear — блок нашёлся, «Появился» открывает «Добавить» с ним. */
  encounter?: { regionId: string; text: string; onAppear?: () => void };
}

/** Черновик нового места (M8): точка исходника, имя, уровень; из справочника — ещё ссылка на его место. */
export interface NewPlaceDraft extends MapPoint {
  name: string;
  scale: ScaleLevel;
  /** id места справочника карты, если щёлкнули по его значку. */
  gazetteerId?: string;
}

/** Уровень по классу справочника: город — поселение, крепость и руины — здание, лес и горы — регион; иначе — первый из допустимых. */
export function scaleForKind(kind: string | undefined, scales: readonly ScaleLevel[]): ScaleLevel {
  const k = (kind ?? '').toLowerCase();
  const guess: ScaleLevel | undefined = /city|town|village|settlement|capital/.test(k) ? 'settlement'
    : /fort|ruin|temple|tomb|inn|mine|monast|tower|castle|keep|well/.test(k) ? 'building'
      : /region|forest|mountain|hill|swamp|marsh|desert|lake|island|pass|road|river|sea/.test(k) ? 'region' : undefined;
  return guess && scales.includes(guess) ? guess : scales[0];
}

/** Путь похода, который карта отдаёт странице: точки исходника от партии до места, мили и дни выбранным темпом. */
export interface TravelRoute {
  toId: string;
  points: MapPoint[];
  miles: number;
  pace: TravelPaceId;
  days: number;
  /** Весь путь — трудная местность: отметил мастер галочкой. */
  difficult?: boolean;
  /** Сколько миль пути по трудной местности — по сетке местности карты. */
  difficultMiles?: number;
}

type Tool = 'none' | 'ruler' | 'travel' | 'place' | 'georeference';

/** Размер окна, пока его не измерили (jsdom, первый кадр). */
const FALLBACK_VP: Viewport = { w: 960, h: 540 };
/** Гекс мельче этого радиуса на экране — каша: слой скрыт, кнопка подсказывает приблизить. */
const HEX_MIN_RADIUS = 7;
const DRAG_THRESHOLD = 4;
/** Найденное место вписывается рамкой ± столько пикселей исходника (~75 миль на Toril). */
const FOUND_R = 200;
/** Щелчок ловит место справочника не дальше стольких пикселей экрана от значка и от середины подписи. */
const PICK_PX = 12;
const PICK_LABEL_PX = 48;
const INPUT = 'min-h-7 w-full min-w-0 px-2 py-0.5 type-body-sm text-tx bg-wl shadow-bevel-in placeholder:text-t3 focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';

const BTN = 'type-num-12 uppercase px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled) aria-pressed:text-gd-hi aria-pressed:shadow-[var(--bevel),inset_0_-2px_0_var(--gd)]';

const fmt = (n: number, digits = 1) => n.toLocaleString('ru-RU', { maximumFractionDigits: digits });

/** 1 фут, 2 фута, 5 футов, 500 футов — целыми. */
export function feetLabel(feet: number): string {
  const n = Math.round(feet);
  const m10 = n % 10;
  const m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? 'фут' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'фута' : 'футов';
  return `${fmt(n, 0)} ${word}`;
}

/** Расстояние в единицах карты: план города (M10) — футами, остальное — милями. */
export const distanceLabel = (p: MapPassport, miles: number): string => (p.units === 'feet' ? feetLabel(miles * FEET_PER_MILE) : milesLabel(miles));

/** 1 миля, 2 мили, 5 миль, 2,5 мили. */
export function milesLabel(miles: number): string {
  const n = Math.round(miles * 10) / 10;
  if (!Number.isInteger(n)) return `${fmt(n)} мили`;
  const m10 = n % 10;
  const m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? 'миля' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'мили' : 'миль';
  return `${fmt(n, 0)} ${word}`;
}

/**
 * Путь линейки словами: «72 мили · дней пути: обычный 3 · быстрый 2,4 · медленный 4». С местностью — ещё
 * «трудная 12 (лес 12)», и дни уже с ней: трудная миля идёт за две (SRD).
 */
export function rulerSummary(miles: number, rt?: RouteTerrain): string {
  const rough = rt?.difficult ?? 0;
  const days = TRAVEL_PACE_IDS.map(id => `${TRAVEL_PACES[id].label} ${fmt(routeDays(miles, rt, id))}`);
  const road = rt && rt.road >= 0.5 ? ` · по дороге ${fmt(rt.road, 0)}` : '';
  const terrain = rough >= 0.5 ? ` · трудная ${fmt(rough, 0)} (${difficultLabel(rt!)})` : '';
  return `${milesLabel(miles)}${road}${terrain} · дней пути: ${days.join(' · ')}`;
}

/** Дни пути по местности: трудная миля за две (SRD), миля дороги — быстрее на милю в час (A5E Open Roads, Fast Travel). */
export function routeDays(miles: number, rt: RouteTerrain | undefined, pace: TravelPaceId): number {
  if (!rt) return travelDays(miles, pace, false);
  return travelDaysOver(miles - rt.road + roadMilesAsPace(rt.road, pace), rt.difficult, pace);
}

function hexPath(ctx: CanvasRenderingContext2D, c: MapPoint, r: number) {
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2; // остриём вверх
    const x = c.x + r * Math.cos(a);
    const y = c.y + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Поиск места: поле в панели карты и список под ним; Enter — первое (или выбранное стрелками). */
function PlaceSearch({ places, onPick }: { places: readonly GazetteerPlace[]; onPick: (p: GazetteerPlace) => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const hits = searchPlaces(places, q);
  const pick = (p: GazetteerPlace) => {
    onPick(p);
    setQ('');
    setActive(0);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') setActive(i => Math.min(i + 1, hits.length - 1));
    else if (e.key === 'ArrowUp') setActive(i => Math.max(i - 1, 0));
    else if (e.key === 'Enter' && hits[active]) pick(hits[active]);
    else if (e.key === 'Escape' && q) setQ('');
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <div className="relative" data-part="place-search">
      <input
        type="search"
        autoComplete="off"
        aria-label="Найти место"
        placeholder="Место — имя"
        title="Поиск по справочнику карты: латиницей или русским именем GIS"
        value={q}
        onChange={e => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKey}
        className={INPUT}
      />
      {hits.length > 0 ? (
        <ul role="listbox" aria-label="Найденные места" className="absolute left-0 top-full mt-1 w-full flex flex-col bg-pn shadow-float z-10 max-h-56 overflow-y-auto">
          {hits.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onClick={() => pick(p)}
                onMouseEnter={() => setActive(i)}
                className={`w-full flex flex-wrap items-baseline gap-2 px-2 py-1 text-left cursor-pointer ${i === active ? 'bg-cd' : ''}`}
              >
                {PLACE_KIND_ART[p.kind] ? <SemanticMark asset={PLACE_KIND_ART[p.kind]!} icon="ent-location" size={16} title={`Тип места: ${KIND_LABEL[p.kind] ?? p.kind}`} /> : null}
                <span className="type-body-sm text-tx min-w-0 flex-1 whitespace-normal break-words">{p.name}</span>
                <span className="type-body-sm text-t2 max-w-full whitespace-normal break-words">{KIND_LABEL[p.kind] ?? ''}</span>
                {p.card ? null : <span className="type-body-sm text-t3 ml-auto max-w-full whitespace-normal break-words" title="Описания нет: только имя и класс GIS">без описания</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Карточка места справочника: что это, кто правит, чем опасно, коротко — и откуда текст. */
function PlaceInfo({ place, onClose, onScene }: { place: GazetteerPlace; onClose: () => void; onScene?: (id: string) => void }) {
  const c = place.card;
  // Общая карточка места справочника (ROADMAP 0.3): боги, церкви, организации, жители по вики — если страница дала вход.
  const openEntity = useOpenEntity();
  const url = wikiUrl(place);
  const gis = !place.sources || place.sources.includes('Toril GIS');
  return (
    <div data-part="place-info" aria-live="polite" className="absolute right-[17rem] bottom-3 w-96 max-w-[calc(100%-18rem)] max-h-[calc(100%-1.5rem)] overflow-y-auto overscroll-contain flex flex-col gap-1.5 p-3 bg-pn shadow-float cursor-default">
      <div data-part="place-info-header" className="flex flex-wrap items-start gap-2">
        {PLACE_KIND_ART[place.kind] ? <SemanticMark asset={PLACE_KIND_ART[place.kind]!} icon="ent-location" size={24} title={`Тип места: ${KIND_LABEL[place.kind] ?? place.kind}`} /> : null}
        <span className="type-h-17 text-tx min-w-0 flex-1 whitespace-normal break-words" title={place.name}>{place.name}</span>
        {KIND_LABEL[place.kind] ? <span className="type-body-sm text-t2 max-w-full whitespace-normal break-words">{KIND_LABEL[place.kind]}</span> : null}
        {openEntity ? <button type="button" title="Общая карточка места по вики: боги, церкви, организации, жители" onClick={() => openEntity(`place:${place.id}`)} className={`${BTN} max-w-full whitespace-normal break-words ml-auto flex-none`}>Карточка</button> : null}
        {onScene ? <button type="button" title="Карточка места на вкладке «Сейчас»: день, вера, силы, люди, округа" onClick={() => onScene(place.id)} className={`${BTN} max-w-full whitespace-normal break-words ${openEntity ? '' : 'ml-auto '}flex-none`}>Сейчас здесь</button> : null}
        <button type="button" title="Закрыть · Esc" onClick={onClose} className={`${BTN} max-w-full whitespace-normal break-words ${onScene || openEntity ? '' : 'ml-auto '}flex-none`}>Закрыть</button>
      </div>
      {place.approx ? <span className="type-body-sm text-t3">Позиция по Toril GIS: на растре место не подписано</span> : null}
      {c?.what ? <p className="type-body text-tx">{c.what}</p> : null}
      {c?.ruler ? <p className="type-body-sm text-t2">Правит: {c.ruler}</p> : null}
      {c?.danger ? <p className="type-body-sm text-t2">Опасность: {c.danger}</p> : null}
      {c?.summary ? <p className="type-body-sm text-t2">{c.summary}</p> : null}
      {c ? null : <p className="type-body-sm text-t3">Описания нет: только имя и класс из Toril GIS</p>}
      <span className="flex flex-wrap gap-3 type-body-sm text-t3">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" title="Текст карточки — пересказ статьи, CC BY-SA 3.0" className="underline hover:text-tx">
            Forgotten Realms Wiki · CC BY-SA
          </a>
        ) : null}
        {gis ? <span title="Toril GIS (Geospatial Grimoire) — Fan Content">Toril GIS</span> : null}
      </span>
    </div>
  );
}

/** Регионы пути по A5E: мили, DC занятий, встреча, погода и занятия; припасы — на весь путь обычным темпом. */
/** days — дни пути обычным темпом, как у кнопки «обычный» и у похода: по ним партия и съест припасы (campaign/travel.ts). */
/** under — мили под землёй: весь путь — Underland Realm, местность и дороги поверхности не в счёт. */
function JourneyLegs({ terrain, under, journey, days }: { terrain?: RouteTerrain; under?: number; journey: JourneyProps; days: number }) {
  const [busy, setBusy] = useState<string | null>(null);
  const legs = under !== undefined
    ? journeyLegs({}, 'normal', journey.tier, DIFFICULT, { [UNDERGROUND_REGION]: under })
    : terrain ? journeyLegs(terrain.miles, 'normal', journey.tier, DIFFICULT, { 'open-roads': terrain.road, ...terrain.settled }) : [];
  if (legs.length === 0) return null;
  const need = supplyNeeded(days, { small: journey.members });
  return (
    <div data-part="journey" className="flex flex-col gap-0.5" title={`A5E: путь — цепочка регионов; в каждом хотя бы одна встреча. Уровень опасности ${journey.tier}`}>
      {legs.map(l => (
        <div key={l.region.id} className="flex flex-col gap-1">
          <span className="flex flex-wrap items-start gap-2">
            <span className="min-w-0 flex-1 whitespace-normal break-words" title={`${l.region.description}${l.region.fields['Journey Activities'] ? `\n\nЗанятия в пути: ${l.region.fields['Journey Activities']}` : ''}`}>
              {l.region.name} · {milesLabel(l.miles)} · DC {l.dc}
            </span>
            <button
              type="button"
              title={`Бросить d100 по таблице встреч ${l.region.name}, уровень ${journey.tier}: ${Object.values(ENCOUNTER_TYPE_LABEL).join(', ')}`}
              onClick={() => journey.onEncounter(l.region.id)}
              className={BTN}
            >
              встреча
            </button>
            {journey.onWeather ? (
              <button type="button" title={`Погода в ${l.region.name}: d20 по таблице региона, зимой +5 (A5E) — описательная, на героев не влияет`} onClick={() => journey.onWeather!(l.region.id)} className={BTN}>
                погода
              </button>
            ) : null}
            {journey.activities ? (
              <button type="button" aria-expanded={busy === l.region.id} title="Кто чем занят в пути: проверка в начале региона, DC по опасности, исходы A5E" onClick={() => setBusy(busy === l.region.id ? null : l.region.id)} className={BTN}>
                занятия
              </button>
            ) : null}
          </span>
          {journey.encounter?.regionId === l.region.id ? (
            <span className="flex flex-wrap items-start gap-2 pl-2" data-part="encounter-result">
              <span className="text-tx min-w-0 flex-1 whitespace-normal break-words">{journey.encounter.text}</span>
              {journey.encounter.onAppear ? (
                <button type="button" title="Блок встречи — в форму «Добавить»: имя, сколько штук" onClick={journey.encounter.onAppear} className={BTN}>Появился</button>
              ) : null}
            </span>
          ) : null}
          {busy === l.region.id && journey.activities ? journey.activities(l.region.id, l.dc, l.days) : null}
        </div>
      ))}
      <span className="text-t2" title="A5E Supply: 1 в день на Small или Medium, 2 — на Large; съедается на длинном отдыхе">
        припасы обычным темпом: {need}
        {journey.supply !== undefined ? ` · есть ${journey.supply}${journey.supply < need ? `, не хватит ${need - journey.supply}` : ''}` : ''}
      </span>
    </div>
  );
}

export function WorldMap({ passport, frame, frameKey, pins, party, onPin, hexMiles, travel, fog, terrain, roads, underdark, schema, start, onZoomOut, onViewChange, layers, gazetteer, eventMarks, influence, warFronts, processMarkers, onScene, newPlace, georeference, tools, children, className = '' }: WorldMapProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hexRef = useRef<HTMLCanvasElement>(null);
  const planetMode = !!onZoomOut;
  const [vp, setVp] = useState<Viewport>(FALLBACK_VP);
  const [view, setView] = useState<MapView>(() => planetMode && start ? planetStartView(start) : fitBox(passport, FALLBACK_VP, frame));
  const reportView=useRef(onViewChange);reportView.current=onViewChange;
  useLayoutEffect(()=>{reportView.current?.(view);},[view]);
  const [hexOn, setHexOn] = useState(true);
  const [fogOn, setFogOn] = useState(false);
  /** Слой «Справочник»: места с карточками маркерами (29.10, только мастеру — справочник у игроков не передаётся). */
  const [layerOn, setLayerOn] = useState(true);
  /** Слой «Влияние» — по кнопке: значков напряжений на карте мира около сотни. */
  const [influenceOn, setInfluenceOn] = useState(false);
  const [warFrontsOn, setWarFrontsOn] = useState(false);
  const [processesOn, setProcessesOn] = useState(false);
  /** Слой по регионам A5E (6.4): один за раз — подкраска у них общая. */
  const [regionLayer, setRegionLayer] = useState<'danger' | 'weather' | null>(null);
  /** Вид подложки (M16): схема — по умолчанию, когда она есть; растр — кнопкой «Карта». */
  const surfaceSession=useSurfaceSession();
  const [look, setLook] = useState<'schema' | 'raster' | 'clean'>(surfaceSession.look);
  useEffect(()=>{surfaceSession.look=look;},[look,surfaceSession]);
  const schemaOn = !!schema && look === 'schema';
  const surfaceMask = PLANET_MASKS[passport.id];
  const surfaceCandidate = !!surfaceMask && !!schema && !forceCanvas() && typeof Path2D !== 'undefined';
  const [surfaceAvailable, setSurfaceAvailable] = useState<boolean | null>(null);
  const sharedSurface = surfaceCandidate && surfaceAvailable !== false;
  const surfaceExtent = useMemo((): GeographicExtent | null => {
    if (!surfaceMask) return null;
    const [lon0,lon1,latTop,latBottom] = surfaceMask.source.extent;
    return {lon0,lon1,latTop,latBottom,width:passport.width,height:passport.height};
  }, [surfaceMask,passport]);
  const surfaceCamera = useMemo((): SurfaceCamera => ({view,vp,globe:{lon:0,lat:0,radius:1},morph:1}), [view,vp]);
  const [cleanResult, setCleanResult] = useState<{ base: MapPassport; clean: MapPassport | null } | null>(null);
  // Новый паспорт не должен даже на один кадр использовать очищенную подложку предыдущей карты.
  const cleanPassport = cleanResult?.base === passport ? cleanResult.clean : null;
  useEffect(() => {
    let live = true;
    setCleanResult(null);
    void loadClean(passport).then(clean => { if (live) setCleanResult({ base: passport, clean }); });
    return () => { live = false; };
  }, [passport]);
  const cleanOn = look === 'clean' && !!cleanPassport;
  const tilePassport = cleanOn ? cleanPassport! : passport;
  const [tool, setTool] = useState<Tool>('none');
  const [ruler, setRuler] = useState<MapPoint[]>([]);
  /** Конец похода — пин места; пока его нет, отправиться некуда. */
  const [dest, setDest] = useState<{ id: string; name: string } | null>(null);
  /** Путь по трудной местности — отмечает мастер: лес, горы, болото, лёд (SRD Difficult Terrain). */
  const [rough, setRough] = useState(false);
  /** Поход под землёй — отмечает мастер: на растре Подземья нет, путь по поверхности — проекция туннелей. */
  const [underground, setUnderground] = useState(false);
  const [missing, setMissing] = useState(false);
  /** Место справочника под карточкой: найдено поиском или щелчком по значку. */
  const [found, setFound] = useState<GazetteerPlace | null>(null);
  const [draft, setDraft] = useState<NewPlaceDraft | null>(null);
  const [geoTargetId, setGeoTargetId] = useState('');
  const [geoDraft, setGeoDraft] = useState<{ locationId: string; x: number; y: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [inset, setInset] = useState(0);
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const fitted = useRef<string>('');
  /** Мастер двигал карту после вписывания — размер окна и панелей вид больше не сбрасывают. */
  const touched = useRef(false);
  const panelsRef = useRef<HTMLDivElement>(null);
  const openEntity = useOpenEntity();
  /** Щелчковые подписи схемы в этом кадре (державы) и та, что под указателем, — для курсора. */
  const labelHits = useRef<readonly LabelHit[]>([]);
  const [overLabel, setOverLabel] = useState<string | null>(null);
  const labelAt = (pt: MapPoint) => (openEntity ? labelHits.current.find(h => pt.x >= h.box.x0 && pt.x <= h.box.x1 && pt.y >= h.box.y0 && pt.y <= h.box.y1) : undefined);

  // Размер окна — из ResizeObserver; без него (jsdom) остаётся запасной.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    // Размер раскладки, а не getBoundingClientRect: зона уровня въезжает анимацией scale, и в первый кадр
    // прямоугольник меньше настоящего, а ResizeObserver трансформаций не видит и не поправит.
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setVp(v => (v.w === w && v.h === h ? v : { w, h }));
    };
    const measurePanels = () => setInset(panelsRef.current?.offsetWidth ?? 0);
    measure();
    measurePanels();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      measure();
      measurePanels();
    });
    ro.observe(el);
    if (panelsRef.current) ro.observe(panelsRef.current);
    return () => ro.disconnect();
  }, []);

  // Новая рамка — вписать заново и стереть линейку; новый размер окна или панелей — вписать, пока мастер не
  // трогал карту, иначе только удержать вид в границах. frame — данные того же ключа: пересчёт по ключу.
  const fitKey = `${passport.id}:${frameKey}`;
  const fit = () => planetMode
    ? planetFitBox(passport, vp, frame, 24, inset)
    : fitBox(passport, vp, frame, 24, inset);
  const resizeView = (value: MapView) => planetMode ? planetResizeView(value) : clampView(passport, vp, value);
  useLayoutEffect(() => {
    if (fitted.current !== fitKey) {
      fitted.current = fitKey;
      touched.current = false;
      setRuler([]);
      setDest(null);
      setFound(null);
      // В planet mode старт с глобуса сохраняет исходный flat camera без прямоугольного clamp.
      if (start) {
        touched.current = true;
        setView(planetMode ? planetStartView(start) : clampView(passport, vp, start));
        return;
      }
    }
    setView(v => (touched.current ? resizeView(v) : fit()));
  }, [fitKey, vp, inset, passport, planetMode]);

  const dpr = mapPixelRatio();
  const z = zoomLevelFor(passport, view.scale, dpr);
  const under = Math.max(0, z - 2);
  // В режиме «Схема» тайлы не грузятся вовсе: подложка — векторная.
  const tiles = schemaOn ? [] : [...(under < z ? tilesAt(tilePassport, vp, view, under) : []), ...tilesAt(tilePassport, vp, view, z)];
  const overzoom = view.scale > 1;

  const hex = hexMiles && hexOn ? hexCenters(passport, vp, view, hexMiles) : null;
  const hexVisible = hex !== null && hex.radius >= HEX_MIN_RADIUS;

  useEffect(() => {
    const cv = hexRef.current;
    const ctx = cv?.getContext?.('2d');
    if (!cv || !ctx) return;
    cv.width = Math.round(vp.w * dpr);
    cv.height = Math.round(vp.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vp.w, vp.h);
    if (!hex || !hexVisible) return;
    const css = getComputedStyle(cv);
    ctx.lineWidth = 1;
    ctx.strokeStyle = css.getPropertyValue('--lo').trim() || '#000';
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    for (const c of hex.centers) hexPath(ctx, c, hex.radius);
    ctx.stroke();
  });

  const zoomBy = useCallback(
    (factor: number, at?: MapPoint) => {
      touched.current = true;
      setView(v => planetMode
        ? planetZoomAt(passport, vp, v, factor, at ?? { x: vp.w / 2, y: vp.h / 2 })
        : zoomAt(passport, vp, v, factor, at ?? { x: vp.w / 2, y: vp.h / 2 }));
    },
    [passport, vp, planetMode],
  );

  const local = (e: { clientX: number; clientY: number }): MapPoint => {
    const r = rootRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.button ?? 0) !== 0 || (e.target as HTMLElement).closest('button, [data-part="map-ui"]')) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // Указатель уже отпущен (или синтетический): карта поедет и без захвата.
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d && tool === 'none') {
      // Над кнопкой (значок места, панель) щелчок уйдёт ей, а не подписи под ней.
      const name = (e.target as HTMLElement).closest('button, [data-part="map-ui"]') ? null : labelAt(local(e))?.name ?? null;
      if (name !== overLabel) setOverLabel(name);
    }
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    touched.current = true;
    d.x = e.clientX;
    d.y = e.clientY;
    setView(v => planetMode ? planetPanBy(v, dx, dy) : panBy(passport, vp, v, dx, dy));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || d.moved) return;
    if (tool === 'place' && newPlace) {
      // Новое место: под щелчком значок справочника — его имя, класс и точка; иначе — точка щелчка и пустое имя.
      const pt = toMap(view, vp, local(e));
      const near = gazetteer ? placeNear(gazetteer, pt, PICK_PX / view.scale, PICK_LABEL_PX / view.scale) : undefined;
      setDraft(near
        ? { x: near.x, y: near.y, name: near.name, scale: scaleForKind(near.kind, newPlace.scales), gazetteerId: near.id }
        : { x: Math.round(pt.x), y: Math.round(pt.y), name: draft?.name ?? '', scale: draft?.scale ?? newPlace.scales[0] });
    } else if (tool === 'georeference' && georeference) {
      const target = georeference.places.find(place => place.id === geoTargetId) ?? georeference.places[0];
      if (target) {
        const pt = toMap(view, vp, local(e));
        setGeoDraft({ locationId: target.id, x: Math.round(pt.x), y: Math.round(pt.y) });
        setGeoError(null);
      }
    } else if (tool !== 'none') {
      const pt = toMap(view, vp, local(e));
      setRuler(r => [...r, pt]);
      setDest(null);
    } else if (labelAt(local(e))) {
      // Подпись державы на схеме — её карточка (подпись — плашка в пикселях экрана из последнего кадра схемы).
      openEntity!(labelAt(local(e))!.ref);
    } else if (gazetteer) {
      setFound(placeNear(gazetteer, toMap(view, vp, local(e)), PICK_PX / view.scale, PICK_LABEL_PX / view.scale) ?? null);
    }
  };
  const showPlace = (p: GazetteerPlace) => {
    touched.current = true;
    setFound(p);
    const box = { x0: p.x - FOUND_R, y0: p.y - FOUND_R, x1: p.x + FOUND_R, y1: p.y + FOUND_R };
    setView(planetMode ? planetFitBox(passport, vp, box, 24, inset) : fitBox(passport, vp, box, 24, inset));
  };
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-part="map-ui"]')) return;
    // Карта уже целиком в окне, а колесо — ещё дальше: выше уровнем (глобус).
    if (onZoomOut && e.deltaY > 0 && view.scale <= scaleBounds(passport, vp).min * 1.001) {
      onZoomOut(view);
      return;
    }
    zoomBy(Math.exp(-e.deltaY * 0.0015), local(e));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const step = 80;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      touched.current = true;
      setView(v => planetMode ? planetPanBy(v, ...moves[e.key]) : panBy(passport, vp, v, ...moves[e.key]));
    }
    else if (e.key === '+' || e.key === '=') zoomBy(1.5);
    else if (e.key === '-') zoomBy(1 / 1.5);
    else if (e.key === 'Escape' && ruler.length > 0) {
      setRuler([]);
      setDest(null);
    }
    else if (e.key === 'Escape' && geoDraft) setGeoDraft(null);
    else if (e.key === 'Escape' && draft) setDraft(null);
    else if (e.key === 'Escape' && found) setFound(null);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const bar = scaleBar(passport, view.scale);
  const route = tool === 'travel' && travel ? [travel.from, ...ruler] : ruler;
  const destinationPin = dest ? pins.find(pin => pin.id === dest.id) : undefined;
  const rulerPts = route.map(p => toScreen(view, vp, p));
  const rulerMiles = pathMiles(passport, route);
  // Поселения справочника на пути (6.3): круги значков City, Town, Village — регионы A5E внутри.
  const settlements = useMemo(() => (gazetteer ? settlementMarks(gazetteer, passport.milesPerPixel) : []), [gazetteer, passport.milesPerPixel]);
  const overlay = useMemo(() => ({ roads, settlements }), [roads, settlements]);
  const regionOn = regionLayer && layers?.[regionLayer] ? regionLayer : null;
  const rulerTerrain = terrain && route.length > 1 ? routeTerrain(terrain, passport, route, overlay) : undefined;
  // Под землёй местность и дороги поверхности не в счёт: путь — по туннелям под ней.
  const surface = underground ? undefined : rulerTerrain;
  // Галочка «весь путь трудный» — поверх сетки: мастер знает про бурелом, которого на карте нет.
  const roughMiles = rough ? rulerMiles : surface?.difficult ?? 0;
  const daysAt = (pace: TravelPaceId) => (rough || !surface ? travelDays(rulerMiles, pace, rough) : routeDays(rulerMiles, surface, pace));
  const below = underground && underdark && route.length > 1 ? underdarkAlong(underdark, route) : [];
  const pickTool = (t: Tool) => {
    setTool(cur => (cur === t ? 'none' : t));
    setRuler([]);
    setDest(null);
    setDraft(null);
    setGeoDraft(null);
    setGeoError(null);
  };
  const propose = () => {
    if (!newPlace || !draft || !draft.name.trim()) return;
    newPlace.onPropose({ ...draft, name: draft.name.trim(), x: Math.round(draft.x), y: Math.round(draft.y) });
    setDraft(null);
    setTool('none');
  };
  const proposeGeo = () => {
    if (!georeference || !geoDraft || !georeference.places.some(place => place.id === geoDraft.locationId)) return;
    try {
      georeference.onPropose(geoDraft.locationId, { x: geoDraft.x, y: geoDraft.y });
      setGeoDraft(null);
      setGeoError(null);
      setTool('none');
    } catch (error) {
      setGeoError(error instanceof Error ? error.message : String(error));
    }
  };
  const draftAt = draft ? toScreen(view, vp, draft) : null;
  const geoDraftAt = geoDraft ? toScreen(view, vp, geoDraft) : null;
  const go = (pace: TravelPaceId) => {
    if (!travel || !dest) return;
    travel.onGo({
      toId: dest.id,
      points: route.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })),
      miles: Math.round(rulerMiles * 10) / 10,
      pace,
      days: daysAt(pace),
      ...(rough ? { difficult: true } : surface && roughMiles >= 0.5 ? { difficultMiles: Math.round(roughMiles * 10) / 10 } : {}),
    });
    setTool('none');
    setRough(false);
    setUnderground(false);
    setRuler([]);
    setDest(null);
  };
  const partyAt = party ? toScreen(view, vp, party) : null;
  const foundAt = found ? toScreen(view, vp, found) : null;
  const inside = (p: MapPoint) => p.x > -200 && p.y > -40 && p.x < vp.w + 200 && p.y < vp.h + 40;
  // Pin names are screen labels, so keep nearby places readable without moving their geographic points.
  const pinLabels = useMemo(() => {
    type Box = { left: number; right: number; top: number; bottom: number };
    const items = pins
      .map(pin => ({ pin, at: toScreen(view, vp, pin) }))
      .filter(item => item.at.x > -200 && item.at.y > -40 && item.at.x < vp.w + 200 && item.at.y < vp.h + 40)
      .sort((a, b) => Number(!!b.pin.selected) - Number(!!a.pin.selected) || a.pin.id.localeCompare(b.pin.id));
    const placed: Box[] = [];
    const layouts: Array<{ pin: MapPinItem; at: MapPoint; labelX: number; labelY: number; box: Box }> = [];
    const candidates: Array<[number, number]> = [
      [0, 0], [0, -28], [0, 28], [64, 0], [-64, 0], [0, -56], [0, 56],
      [104, -28], [-104, -28], [104, 28], [-104, 28], [0, -84], [0, 84],
      [64, -56], [-64, -56], [64, 56], [-64, 56],
    ];
    const score = (box: Box) => {
      const overlap = placed.reduce((n, other) => n + (box.left < other.right + 4 && other.left < box.right + 4 && box.top < other.bottom + 4 && other.top < box.bottom + 4 ? 1 : 0), 0);
      const coversPoint = items.reduce((n, other) => n + (other.at.x >= box.left - 3 && other.at.x <= box.right + 3 && other.at.y >= box.top - 3 && other.at.y <= box.bottom + 3 ? 1 : 0), 0);
      const overflow = Math.max(0, 2 - box.left) + Math.max(0, box.right - vp.w + 2) + Math.max(0, 2 - box.top) + Math.max(0, box.bottom - vp.h + 2);
      return overlap * 10000 + coversPoint * 1000 + overflow * 10;
    };
    for (const { pin, at } of items) {
      const width = Math.min(224, 34 + pin.name.length * 7 + (pin.count ? 24 : 0) + (pin.facts?.length ?? 0) * 16 + (pin.tensions?.length ? 20 : 0) + (pin.encounters?.length ? 24 : 0));
      const height = 23;
      const options = candidates.map(([dx, dy]) => {
        const labelX = at.x + dx;
        const labelY = at.y + dy;
        return { labelX, labelY, box: { left: labelX - width / 2, right: labelX + width / 2, top: labelY - height - 6, bottom: labelY - 6 } };
      });
      const chosen = options.reduce((best, option) => score(option.box) < score(best.box) ? option : best);
      placed.push(chosen.box);
      layouts.push({ pin, at, ...chosen });
    }
    return layouts;
  }, [pins, view, vp]);
  // Слой справочника — по рамке экрана в координатах исходника; пины кампании рисуются поверх.
  const layer = gazetteer && layerOn && tool === 'none' ? (() => {
    const a = toMap(view, vp, { x: 0, y: 0 });
    const b = toMap(view, vp, { x: vp.w, y: vp.h });
    return layerPlaces(gazetteer, { x0: a.x, y0: a.y, x1: b.x, y1: b.y });
  })() : [];

  return (
    <div
      ref={rootRef}
      role="application"
      aria-roledescription="карта"
      aria-label={`Карта ${passport.label}`}
      tabIndex={0}
      data-part="world-map"
      title={overLabel ? `${overLabel} — карточка державы` : undefined}
      data-zoom={z}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
      onWheel={onWheel}
      onDoubleClick={e => !(e.target as HTMLElement).closest('button, [data-part="map-ui"]') && zoomBy(2, local(e))}
      onKeyDown={onKeyDown}
      className={`relative overflow-hidden bg-wl select-none touch-none outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--gd)] ${tool !== 'none' ? 'cursor-crosshair' : overLabel ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'} ${className}`}
    >
      {surfaceCandidate && surfaceExtent && schema ? <SphereSurfaceLayer passport={passport} extent={surfaceExtent} schema={schema} mask={surfaceMask} camera={surfaceCamera} sun={0} raster={schemaOn?undefined:tilePassport} onAvailable={setSurfaceAvailable}/> : null}
      {!schemaOn && !sharedSurface ? <RasterLayer key={tilePassport.tiles} tiles={tiles} view={view} vp={vp} dpr={dpr} pixelated={overzoom} onError={() => setMissing(true)} /> : null}
      {schemaOn ? <SchemaLayer schema={schema} vp={vp} view={view} mapId={passport.id} pins={pins} labelsOnly={sharedSurface} legend={!regionOn} onHits={h => (labelHits.current = h)} /> : null}
      {cleanOn && schema ? <SchemaLayer schema={schema} vp={vp} view={view} mapId={passport.id} pins={pins} labelsOnly supplementalRasterLabels rasterIconPlaces={gazetteer ?? []} legend={false} onHits={h => (labelHits.current = h)} /> : null}
      {fog && (fog.forced || fogOn) ? (
        // Туман — тёмная заливка с прорезями: круги открытых мест и коридоры пройденных путей шириной в обзор.
        <svg aria-hidden="true" data-part="fog" data-forced={fog.forced || undefined} className="absolute inset-0 size-full pointer-events-none">
          <defs>
            <mask id={`fog-${passport.id}`} maskUnits="userSpaceOnUse" x={0} y={0} width={vp.w} height={vp.h}>
              <rect x={0} y={0} width={vp.w} height={vp.h} fill="white" />
              {fog.explored.circles.map((c, i) => {
                const at = toScreen(view, vp, c);
                return <circle key={i} cx={at.x} cy={at.y} r={c.r * view.scale} fill="black" />;
              })}
              {fog.explored.paths.map((path, i) => (
                <polyline
                  key={i}
                  points={path.map(p => toScreen(view, vp, p)).map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="black"
                  strokeWidth={2 * fog.explored.sight * view.scale}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </mask>
          </defs>
          <rect x={0} y={0} width={vp.w} height={vp.h} mask={`url(#fog-${passport.id})`} style={{ fill: 'var(--wl)', opacity: fog.forced ? 0.82 : 0.55 }} />
        </svg>
      ) : null}
      {hexVisible ? <canvas ref={hexRef} aria-hidden="true" data-part="hex" className="absolute inset-0 size-full pointer-events-none" /> : null}
      {regionOn && terrain ? (
        <RegionLayer kind={regionOn} grid={terrain} overlay={overlay} vp={vp} view={view} explored={fog?.forced ? fog.explored : undefined}
          danger={layers?.danger} weather={layers?.weather} />
      ) : null}
      {rulerPts.length > 0 ? (
        <svg aria-hidden="true" className="absolute inset-0 size-full pointer-events-none" data-part="ruler-path">
          {/* Переменные CSS — через style: в атрибуты SVG браузер их не подставляет. */}
          <polyline points={rulerPts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" strokeWidth={4} style={{ stroke: 'var(--lo)' }} />
          <polyline points={rulerPts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" strokeWidth={2} strokeDasharray="6 4" style={{ stroke: 'var(--gd-hi)' }} />
          {rulerPts.map((p, i) => (
            <rect key={i} x={p.x - 3} y={p.y - 3} width={6} height={6} style={{ fill: 'var(--gd-hi)', stroke: 'var(--lo)' }} />
          ))}
        </svg>
      ) : null}
      {warFrontsOn && warFronts?.length ? (
        <svg role="img" aria-label={`Маршруты фронтов войны: ${warFronts.map(front => front.label).join('; ')}`}
          className="absolute inset-0 size-full pointer-events-none" data-part="war-fronts">
          {warFronts.map(front => {
            const points = front.nodes.map(node => toScreen(view, vp, node));
            const coordinates = points.map(point => `${point.x},${point.y}`).join(' ');
            return <g key={front.id} data-war-process={front.id}>
              <title>Маршрут фронта войны: {front.label}</title>
              <polyline points={coordinates} fill="none" stroke="var(--lo)" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
              <polyline points={coordinates} fill="none" stroke="var(--fx-damage-hi)" strokeWidth={3} strokeDasharray="10 6" strokeLinecap="round" strokeLinejoin="round" />
              {points.map((point, index) => <circle key={`${front.id}:${front.nodes[index]!.id}`} cx={point.x} cy={point.y} r={4} fill="var(--fx-damage-hi)" stroke="var(--lo)" strokeWidth={1.5} />)}
            </g>;
          })}
        </svg>
      ) : null}

      {processesOn && processMarkers?.length ? (
        <svg role="img" aria-label={`Активные процессы на карте: ${processMarkers.map(marker => `${marker.locationName}: ${marker.labels.join(', ')}`).join('; ')}`}
          className="absolute inset-0 size-full pointer-events-none" data-part="map-processes">
          {processMarkers.map(marker => {
            const point = toScreen(view, vp, marker);
            if (!inside(point)) return null;
            return <g key={marker.locationId} data-process-location={marker.locationId}>
              <title>{`${marker.locationName}: ${marker.labels.join('; ')}`}</title>
              <circle cx={point.x} cy={point.y} r={11} strokeWidth={2} style={{ fill: 'var(--src-sim)', stroke: 'var(--lo)' }} />
              <text x={point.x} y={point.y + 3.5} textAnchor="middle" style={{ fill: 'var(--lo)', fontSize: 10, fontWeight: 700 }}>{marker.labels.length > 9 ? '9+' : marker.labels.length}</text>
            </g>;
          })}
        </svg>
      ) : null}

      {partyAt && inside(partyAt) ? (
        <div
          data-part="party"
          title={party!.label}
          className="absolute p-0.5 bg-cd shadow-[var(--float),inset_0_-2px_0_var(--ent-pc)] pointer-events-none"
          style={{ left: partyAt.x, top: partyAt.y, transform: 'translate(-50%, 6px)' }}
        >
          <Icon name="ent-pc" size={16} color="var(--ent-pc)" title={party!.label} />
        </div>
      ) : null}

      {draftAt ? (
        <span
          aria-hidden="true"
          data-part="new-place"
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 pointer-events-none bg-src-sim shadow-[0_0_0_2px_var(--lo)]"
          style={{ left: draftAt.x, top: draftAt.y }}
        />
      ) : null}

      {geoDraftAt ? (
        <span
          aria-hidden="true"
          data-part="georeference-point"
          className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-src-sim shadow-[0_0_0_2px_var(--lo)] pointer-events-none"
          style={{ left: geoDraftAt.x, top: geoDraftAt.y }}
        />
      ) : null}

      {foundAt ? (
        <span
          aria-hidden="true"
          data-part="found"
          className="absolute size-4 -translate-x-1/2 -translate-y-1/2 pointer-events-none shadow-[0_0_0_2px_var(--gd-hi),0_0_0_3px_var(--lo)]"
          style={{ left: foundAt.x, top: foundAt.y }}
        />
      ) : null}

      {layer.map(p => {
        const at = toScreen(view, vp, p);
        const kind = KIND_LABEL[p.kind];
        const title = `${p.name}${kind ? ` · ${kind}` : ''} · карточка справочника${p.approx ? ' · позиция по GIS: значок на растре не найден' : ''}`;
        return (
          <button
            key={p.id}
            type="button"
            data-place={p.id}
            data-approx={p.approx || undefined}
            aria-label={title}
            title={title}
            onClick={() => setFound(p)}
            className="absolute size-4 grid place-items-center -translate-x-1/2 -translate-y-1/2 cursor-pointer focus-visible:shadow-[var(--glow-gold)]"
            style={{ left: at.x, top: at.y }}
          >
            {/* Форма, а не только цвет: залитый — на значке растра, полый — позиция по GIS. Имя — на растре и в подсказке. */}
            <span className={`size-2 ${p.approx ? 'shadow-[inset_0_0_0_2px_var(--ent-loc),0_0_0_1px_var(--lo)]' : 'bg-ent-loc shadow-[0_0_0_1px_var(--lo)]'}`} />
          </button>
        );
      })}

      {eventMarks && gazetteer ? gazetteer.filter(p => eventMarks.places.has(p.id)).map(p => {
        const at = toScreen(view, vp, p);
        if (!inside(at)) return null;
        const lines = eventMarks.places.get(p.id)!;
        const title = `${p.name} · ${eventMarks.year} DR: ${lines.length} ${lines.length === 1 ? 'событие' : 'событий'} — ${lines.slice(0, 3).join(' · ')}${lines.length > 3 ? ' …' : ''}`;
        return (
          <button
            key={`event:${p.id}`}
            type="button"
            data-event-mark={p.id}
            aria-label={`${p.name}: события ${eventMarks.year} DR — ${lines.length}`}
            title={title}
            onClick={() => setFound(p)}
            className="absolute flex items-center gap-1 px-1 py-0.5 bg-cd shadow-[var(--float),inset_0_-2px_0_var(--ent-event)] cursor-pointer hover:bg-pl focus-visible:shadow-[var(--float),var(--glow-gold)]"
            // Справа от точки места: над ней стоит пин кампании того же места, под ней — часто пин соседнего.
            style={{ left: at.x, top: at.y, transform: 'translate(8px, -50%)' }}
          >
            <Icon name="ent-event" size={16} color="var(--ent-event)" title="Событие канона" />
            <span className="type-num-12 text-tx">{lines.length}</span>
          </button>
        );
      }) : null}

      {influence && influenceOn && gazetteer ? gazetteer.filter(p => influence.bases.has(p.id) || influence.tensions.has(p.id)).map(p => {
        const at = toScreen(view, vp, p);
        if (!inside(at)) return null;
        const bases = influence.bases.get(p.id) ?? [];
        const lines = influence.tensions.get(p.id) ?? [];
        const title = [bases.length ? `${p.name} · база: ${bases.join(', ')} (по вики)` : p.name, ...(lines.length ? [`напряжения: ${lines.join('; ')}`] : [])].join(' · ');
        return (
          <button
            key={`influence:${p.id}`}
            type="button"
            data-influence={p.id}
            aria-label={title}
            title={title}
            onClick={() => setFound(p)}
            className="absolute flex items-center gap-1 cursor-pointer focus-visible:shadow-[var(--glow-gold)]"
            // Слева от точки места: справа — метки событий хроники, сверху — пин кампании.
            style={{ left: at.x, top: at.y, transform: 'translate(calc(-100% - 8px), -50%)' }}
          >
            {lines.length ? (
              <span className="flex items-center gap-0.5 px-1 py-0.5 bg-cd shadow-[var(--float),inset_0_-2px_0_var(--fx-debuff-hi)]">
                <Icon name="pulse" size={16} color="var(--fx-debuff-hi)" title="Напряжения" />
                <span className="type-num-12 text-tx">{lines.length}</span>
              </span>
            ) : null}
            {bases.length ? (
              <span className="flex items-center gap-1 px-1 py-0.5 bg-cd shadow-[var(--float),inset_0_-2px_0_var(--ent-faction)]">
                <Icon name="ent-faction" size={16} color="var(--ent-faction)" title="База фракции кампании" />
                <span className="type-body-xs text-tx whitespace-nowrap">{bases.join(', ')}</span>
              </span>
            ) : null}
          </button>
        );
      }) : null}

      {pinLabels.some(({ at, labelX, labelY }) => labelX !== at.x || labelY !== at.y) ? (
        <svg aria-hidden="true" data-part="pin-leaders" className="absolute inset-0 size-full pointer-events-none z-10">
          {pinLabels.map(({ pin, at, labelX, labelY, box }) => {
            if (labelX === at.x && labelY === at.y) return null;
            const x2 = Math.max(box.left + 6, Math.min(at.x, box.right - 6));
            const y2 = Math.max(box.top + 6, Math.min(at.y, box.bottom - 6));
            return <line key={pin.id} x1={at.x} y1={at.y} x2={x2} y2={y2} stroke="var(--lo)" strokeWidth="1" strokeOpacity="0.75" />;
          })}
        </svg>
      ) : null}
      {pinLabels.map(({ pin, at, labelX, labelY }) => {
        const ent = ENTITY[pin.type];
        const shadow = pin.pending
          ? 'shadow-[var(--float),var(--glow-sim)]'
          : pin.selected
            ? 'shadow-[var(--float),inset_0_-2px_0_var(--gd)]'
            : 'shadow-float';
        return (
          <Fragment key={pin.id}>
            <span
              aria-hidden="true"
              data-part="pin-point"
              data-pin-point-for={pin.id}
              className="absolute z-20 size-1.5 -translate-x-1/2 -translate-y-1/2 shadow-[0_0_0_1px_var(--lo)] pointer-events-none"
              style={{ left: at.x, top: at.y, background: ent.color }}
            />
            <button
              type="button"
              data-pin={pin.id}
              data-selected={pin.selected || undefined}
              data-pending={pin.pending || undefined}
              aria-current={pin.selected ? 'true' : undefined}
              title={`${ent.label} · ${pin.name}${pin.pending ? ' · ждёт решения' : ''}`}
              onClick={() => {
                // В походе пин — конец пути, а не переход по лестнице.
                if (tool === 'travel') {
                  setRuler(r => [...r, { x: pin.x, y: pin.y }]);
                  setDest({ id: pin.id, name: pin.name });
                } else onPin?.(pin.id);
              }}
              className={`absolute z-20 flex items-center gap-1.5 px-1.5 py-0.5 bg-cd ${shadow} cursor-pointer hover:bg-pl focus-visible:shadow-[var(--float),var(--glow-gold)] max-w-56`}
              style={{ left: labelX, top: labelY, transform: 'translate(-50%, calc(-100% - 6px))' }}
            >
              {pin.art
                ? <SemanticMark asset={pin.art} icon={pin.icon ?? ent.icon} size={16} color={ent.color} title={pin.artTitle ?? ent.label} />
                : <Icon name={pin.icon ?? ent.icon} size={16} color={ent.color} title={ent.label} />}
              <span className={`type-body-sm truncate ${pin.selected ? 'text-gd-hi' : 'text-tx'}`}>{pin.name}</span>
            {regionOn === 'danger' && pin.encounters?.length ? (
              <span
                data-part="pin-danger"
                className="flex-none type-num-12 text-ab-str-hi"
                title={`Встречи: ${pin.encounters.map(e => `${e.key} ×${e.weight}${e.pending !== undefined ? ` → ×${e.pending} (ждёт)` : ''}`).join('; ')}`}
              >
                ×{Math.max(...pin.encounters.map(e => e.weight))}{pin.encounters.some(e => e.pending !== undefined) ? `→${Math.max(...pin.encounters.map(e => e.pending ?? e.weight))}` : ''}
              </span>
            ) : null}
            {pin.tensions?.length ? (
              <span data-part="pin-tensions" className="flex-none flex items-center gap-0.5" title={`Напряжения: ${pin.tensions.join('; ')}`}>
                <Icon name="pulse" size={16} color="var(--fx-debuff-hi)" title="Напряжения" />
                <span className="type-num-12 text-fx-debuff-hi">{pin.tensions.length}</span>
              </span>
            ) : null}
            {(pin.facts ?? []).map(f => (
              <Icon
                key={f.id}
                name={f.secret ? 'hidden' : 'pin-rumor'}
                size={16}
                color={f.secret ? 'var(--src-dm)' : 'var(--src-players)'}
                title={`${f.secret ? 'Секрет мастера' : 'Известно игрокам'}: ${f.text}`}
                className="flex-none"
              />
            ))}
            {pin.count ? <span className="type-num-12 flex-none px-1 py-px bg-cd shadow-bevel text-t2" title="Записей и фактов о месте">{pin.count}</span> : null}
            </button>
          </Fragment>
        );
      })}

      {/* Панели стола (стопки, карточка) — под панелью карты: сверху отступ на её высоту, иначе кнопки закрывают верхнюю кромку карточки. */}
      {children ? <div ref={panelsRef} data-part="map-ui" className="absolute left-0 top-0 bottom-0 p-4 pt-12 flex items-start gap-4 pointer-events-none [&>*]:pointer-events-auto">{children}</div> : null}

      <div data-part="map-ui" className="absolute z-30 right-16 top-3 bottom-3 w-48 max-w-[calc(100%-5.5rem)] overflow-y-auto overflow-x-hidden flex flex-col items-stretch gap-1 p-2 bg-pn/95 shadow-float cursor-default overscroll-contain" role="toolbar" aria-label="Карта" tabIndex={0}>
        {passport.attribution || passport.note || passport.sourceUrl ? <details data-part="map-source" className="relative">
          <summary title="Источник, статус и условия карты" className={`${BTN} w-full text-left list-none cursor-pointer focus-visible:shadow-[var(--bevel),var(--glow-gold)] [&::-webkit-details-marker]:hidden`}>Источник карты</summary>
          <div className="relative mt-1 flex flex-col gap-1 p-2 bg-cd shadow-bevel-in type-body-xs text-t2">
            {passport.attribution ? <p>{passport.attribution}</p> : null}
            {passport.note ? <p>{passport.note}</p> : null}
            {passport.sourceUrl ? <a className="underline text-gd-hi" href={passport.sourceUrl} target="_blank" rel="noreferrer">Страница карты и лицензия</a> : null}
            {passport.timelineUrl ? <a className="underline text-gd-hi" href={passport.timelineUrl} target="_blank" rel="noreferrer">Хронология автора</a> : null}
          </div>
        </details> : null}
        {gazetteer && gazetteer.length > 0 ? <div className="w-full"><PlaceSearch places={gazetteer} onPick={showPlace} /></div> : null}
        {schema ? (
          <span role="group" aria-label="Вид карты" className="flex flex-col gap-1">
            <button type="button" aria-pressed={schemaOn} title="Схема: регионы местности, береговая линия и дороги — векторная разметка по сетке растра, чёткая на любом приближении" onClick={() => setLook('schema')} className={`${BTN} w-full text-left`}>Схема</button>
            <button type="button" aria-pressed={cleanOn || (!cleanPassport && look === 'raster')} title={cleanPassport ? 'Карта: очищенный растр с заново наложенными подписями и местами' : `Карта: растр ${passport.label}`} onClick={() => setLook(cleanPassport ? 'clean' : 'raster')} className={`${BTN} w-full text-left`}>Карта</button>
            {cleanPassport ? <button type="button" aria-pressed={look === 'raster'} title="Исходная карта с надписями и значками HandsomeRob" onClick={() => setLook('raster')} className={`${BTN} w-full text-left`}>Исходник</button> : null}
          </span>
        ) : null}
        {tools ? <div className="flex flex-col gap-1 [&>button]:w-full [&>button]:text-left">{tools}</div> : null}
        <div role="group" aria-label="Масштаб карты" className="flex gap-1">
          <button type="button" title="Отдалить · −" aria-label="Отдалить" onClick={() => zoomBy(1 / 1.5)} className={`${BTN} flex-1`}>−</button>
          <button type="button" title="Приблизить · +" aria-label="Приблизить" onClick={() => zoomBy(1.5)} className={`${BTN} flex-1`}>+</button>
        </div>
        <button type="button" title="Вписать место уровня" onClick={() => {
            touched.current = false;
            setView(fit());
          }} className={`${BTN} w-full text-left`}>Вписать</button>
        <details data-part="map-layers" className="relative">
          <summary title="Дополнительные слои карты" className={`${BTN} w-full text-left list-none cursor-pointer focus-visible:shadow-[var(--bevel),var(--glow-gold)] [&::-webkit-details-marker]:hidden`}>
            Слои
          </summary>
          <div data-part="map-layer-menu" role="group" aria-label="Дополнительные слои карты" className="relative mt-1 flex flex-col items-stretch gap-1 p-1 bg-cd shadow-bevel-in">
        {hexMiles ? (
          <button
            type="button"
            aria-pressed={hexOn}
            title={hex && !hexVisible ? `Гексы по ${hexMiles} миль — приблизьте, чтобы увидеть` : `Гексы по ${hexMiles} миль`}
            onClick={() => setHexOn(v => !v)}
            className={BTN}
          >
            Гексы
          </button>
        ) : null}
        {influence && gazetteer && gazetteer.length > 0 && (influence.bases.size > 0 || influence.tensions.size > 0) ? (
          <button type="button" aria-pressed={influenceOn} title={`Влияние: базы фракций кампании по вики (${influence.bases.size}) и места напряжений (${influence.tensions.size}); щелчок — карточка места`} onClick={() => setInfluenceOn(v => !v)} className={BTN}>
            Влияние
          </button>
        ) : null}
        {warFronts?.length ? (
          <button type="button" aria-pressed={warFrontsOn} title="Маршруты фронтов активных войн; линия показывает путь, а не границу владения" onClick={() => setWarFrontsOn(value => !value)} className={BTN}>
            Фронты
          </button>
        ) : null}
        {processMarkers?.length ? (
          <button type="button" aria-pressed={processesOn} title="Активные принятые процессы по последней записанной точке; слой только для мастера" onClick={() => setProcessesOn(value => !value)} className={BTN}>
            Процессы
          </button>
        ) : null}
        {terrain && layers?.danger ? (
          <button type="button" aria-pressed={regionOn === 'danger'} title="Опасность: регионы A5E под окном (где какая таблица встреч), уровень и DC занятий, веса встреч мест кампании на пинах" onClick={() => setRegionLayer(v => (v === 'danger' ? null : 'danger'))} className={BTN}>
            Опасность
          </button>
        ) : null}
        {terrain && layers?.weather ? (
          <button type="button" aria-pressed={regionOn === 'weather'} title="Погода: регионы A5E под окном и их погода сегодня — d20 региона из журнала" onClick={() => setRegionLayer(v => (v === 'weather' ? null : 'weather'))} className={BTN}>
            Погода
          </button>
        ) : null}
        {gazetteer && gazetteer.length > 0 ? (
          <button type="button" aria-pressed={layerOn} title="Справочник: места с карточками — залитый квадрат на значке растра, полый — позиция по GIS; при отдалении — сначала города; щелчок — карточка" onClick={() => setLayerOn(v => !v)} className={BTN}>
            Справочник
          </button>
        ) : null}
        {fog && !fog.forced ? (
          <button type="button" aria-pressed={fogOn} title="Туман знаний: что видят игроки — пройденное партией и открытые места" onClick={() => setFogOn(v => !v)} className={BTN}>
            Туман
          </button>
        ) : null}
          </div>
        </details>
        <button type="button" aria-pressed={tool === 'ruler'} title="Линейка: щелчки по карте ставят точки пути, Esc — стереть" onClick={() => pickTool('ruler')} className={`${BTN} w-full text-left`}>
          Линейка
        </button>
        {newPlace ? (
          <button type="button" aria-pressed={tool === 'place'} title="Новое место: щелчок по карте — точка, имя и уровень; во входящие ляжет предложение, мир изменит только «Принять»" onClick={() => pickTool('place')} className={`${BTN} w-full text-left`}>
            Место
          </button>
        ) : null}
        {georeference?.places.length ? (
          <button type="button" aria-pressed={tool === 'georeference'} title="Геопривязка: выбрать активное место, отметить точку на этой карте и отправить изменение во «Входящие»" onClick={() => pickTool('georeference')} className={`${BTN} w-full text-left`}>
            Привязать место
          </button>
        ) : null}
        {travel ? (
          <button type="button" aria-pressed={tool === 'travel'} title="Поход: путь от партии щелчками, конец — пин места; время пойдёт на дни пути" onClick={() => pickTool('travel')} className={`${BTN} w-full text-left`}>
            Поход
          </button>
        ) : null}
      </div>

      <div data-part="map-ui" style={{ left: inset + 12 }} className="absolute bottom-3 flex flex-col items-start gap-1 cursor-default pointer-events-none">
        {tool === 'ruler' ? (
          <div data-part="ruler" className="px-2 py-1 bg-cd shadow-float type-body-sm text-tx pointer-events-auto">
            {ruler.length < 2 ? 'Щелчками по карте отметьте путь' : passport.units === 'feet' ? distanceLabel(passport, rulerMiles) : rulerSummary(rulerMiles, rulerTerrain)}
          </div>
        ) : null}
        {tool === 'place' && newPlace ? (
          <div data-part="new-place-form" role="group" aria-label="Новое место" className="flex flex-col gap-1 px-2 py-1.5 bg-cd shadow-float type-body-sm text-tx pointer-events-auto">
            {draft ? (
              <>
                <span className="flex items-center gap-2">
                  <input
                    type="text"
                    autoFocus
                    aria-label="Имя места"
                    placeholder="имя латиницей, как в книгах"
                    value={draft.name}
                    onChange={e => setDraft({ ...draft, name: e.target.value, gazetteerId: undefined })}
                    onKeyDown={e => { if (e.key === 'Enter') propose(); }}
                    className={INPUT}
                  />
                  <select aria-label="Уровень места" value={draft.scale} onChange={e => setDraft({ ...draft, scale: e.target.value as ScaleLevel })} className={`${INPUT} w-auto`}>
                    {newPlace.scales.map(sc => <option key={sc} value={sc}>{newPlace.scaleLabel(sc)}</option>)}
                  </select>
                </span>
                {draft.gazetteerId ? <span className="text-t2">из справочника карты — карточка по вики будет у места</span> : null}
                <span className="flex items-center gap-1">
                  <button type="button" disabled={!draft.name.trim()} onClick={propose} title="Во входящие — предложение; место появится после «Принять», Ctrl+Z уберёт" className={BTN}>Предложить</button>
                  <button type="button" onClick={() => setDraft(null)} title="Стереть точку · Esc" className={BTN}>Отмена</button>
                </span>
              </>
            ) : (
              <span>Щелчок по карте — точка нового места</span>
            )}
          </div>
        ) : null}
        {tool === 'georeference' && georeference ? (
          <div data-part="georeference-form" role="group" aria-label="Геопривязка места" className="flex flex-col gap-1 px-2 py-1.5 bg-cd shadow-float type-body-sm text-tx pointer-events-auto">
            <label className="flex flex-col gap-1">
              Место кампании
              <select aria-label="Место для геопривязки" value={georeference.places.some(place => place.id === geoTargetId) ? geoTargetId : georeference.places[0]?.id ?? ''} onChange={event => { setGeoTargetId(event.target.value); setGeoDraft(null); setGeoError(null); }} className={INPUT}>
                {georeference.places.map(place => <option key={place.id} value={place.id}>{place.name} · {place.scaleLabel}{place.geoMap ? ` · сейчас: ${place.geoMap}` : ' · без точки'}</option>)}
              </select>
            </label>
            {geoDraft ? (
              <>
                <span className="text-t2">{georeference.places.find(place => place.id === geoDraft.locationId)?.name ?? geoDraft.locationId} · {passport.label} · пиксель ({geoDraft.x}, {geoDraft.y})</span>
                <span className="flex items-center gap-1">
                  <button type="button" onClick={proposeGeo} className={BTN}>Предложить</button>
                  <button type="button" onClick={() => setGeoDraft(null)} className={BTN}>Отмена точки</button>
                </span>
              </>
            ) : <span className="text-t2">Выберите место и щёлкните по карте. Координаты будут предложены мастеру и сохранятся только после принятия.</span>}
            {geoError ? <span role="alert" className="text-fx-damage-hi">{geoError}</span> : null}
            <button type="button" onClick={() => pickTool('georeference')} className={BTN}>Закрыть</button>
          </div>
        ) : null}
        {tool === 'travel' ? (
          <div data-part="travel" role="group" aria-label="Поход" className="flex flex-col gap-1 px-2 py-1.5 bg-cd shadow-float type-body-sm text-tx pointer-events-auto">
            {dest ? (
              <>
                {passport.id === 'toril' && destinationPin && travel ? (
                  <CourseCompass from={travel.from} to={destinationPin} target={dest.name} wind={travel.wind} />
                ) : null}
                <span>
                  {party?.label ?? 'Партия'} → {dest.name} · {milesLabel(rulerMiles)}
                </span>
                {surface && !rough ? (
                  <span data-part="route-terrain" className="text-t2" title="По карте местности: лес, болото, горы и лёд — трудная местность SRD, каждая миля идёт за две">
                    {surface.difficult >= 0.5 ? `трудная местность: ${milesLabel(surface.difficult)} (${difficultLabel(surface)})` : 'трудной местности на пути нет'}
                  </span>
                ) : null}
                {surface && surface.road >= 0.5 ? (
                  <span data-part="route-road" className="text-t2" title={`Дороги — пунктир растра. ${JOURNEY_REGIONS['open-roads']?.fields['Fast Travel'] ?? ''} Трудной местностью дорога не считается (решение кокпита)`}>
                    по дороге: {milesLabel(surface.road)} — на милю в час быстрее
                  </span>
                ) : null}
                {underground ? (
                  <span data-part="route-underdark" className="text-t2" title="Владения Подземья под путём — по Toril GIS (Fan Content), привязка к растру ошибается на десятки миль">
                    {below.length ? `под путём: ${below.map(r => r.name).join(', ')}` : 'под путём владений Подземья по Toril GIS нет'}
                  </span>
                ) : null}
                {travel?.journey && (surface || underground) ? <JourneyLegs terrain={surface} under={underground ? rulerMiles : undefined} journey={travel.journey} days={daysAt('normal')} /> : null}
                <label className="flex items-center gap-2 cursor-pointer" title="SRD: густой лес, болото, руины, крутые горы и лёд — трудная местность, по ней вдвое медленнее">
                  <input type="checkbox" checked={rough} onChange={e => setRough(e.target.checked)} className="accent-[var(--gd)]" />
                  <span>{surface ? 'весь путь трудный — вдвое медленнее' : 'трудная местность — вдвое медленнее'}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer" title="A5E Underland Realm: путь по туннелям Подземья; местность и дороги поверхности не в счёт">
                  <input type="checkbox" checked={underground} onChange={e => setUnderground(e.target.checked)} className="accent-[var(--gd)]" />
                  <span>под землёй — Underland Realm</span>
                </label>
                <span className="flex items-center gap-1">
                  {TRAVEL_PACE_IDS.map(id => (
                    <button
                      key={id}
                      type="button"
                      title={`${TRAVEL_PACES[id].milesPerDay} миль в день${TRAVEL_PACES[id].effect ? ` · ${TRAVEL_PACES[id].effect}` : ''}`}
                      onClick={() => go(id)}
                      className={BTN}
                    >
                      {TRAVEL_PACES[id].label} · {fmt(daysAt(id))} дн
                    </button>
                  ))}
                </span>
              </>
            ) : (
              <span>Путь от партии — щелчками по карте, конец — пин места</span>
            )}
          </div>
        ) : null}
        <div data-part="scale-bar" className="flex items-center gap-2 px-2 py-1 bg-cd shadow-float" title={passport.units === 'feet' ? `Калибровка плана: ${fmt(passport.milesPerPixel * FEET_PER_MILE, 2)} фута на пиксель исходника` : `Калибровка карты: ${fmt(passport.milesPerPixel, 2)} мили на пиксель исходника`}>
          <span aria-hidden="true" className="h-1.5 bg-tx shadow-[inset_0_-1px_0_var(--lo)]" style={{ width: bar.px }} />
          <span className="type-num-12 text-tx">{distanceLabel(passport, bar.miles)}</span>
        </div>
      </div>

      {found ? <div data-part="map-ui"><PlaceInfo place={found} onClose={() => setFound(null)} {...(onScene ? { onScene } : {})} /></div> : null}

      {missing && !schemaOn ? (
        <div role="status" className="absolute inset-x-0 top-1/3 mx-auto w-fit max-w-[90%] px-4 py-3 bg-cd shadow-float type-body text-tx">
          Изображение карты {passport.label} недоступно.
        </div>
      ) : null}
    </div>
  );
}

export default WorldMap;
