// Карта мира (HANDOFF §3, §9): пирамида тайлов с диска, пины мест DOM-кнопками поверх, гексы и линейка.
// Тупой компонент: место, рамку и пины даёт страница, стор он не читает. Вид (сдвиг, приближение), слои и
// точки линейки — состояние экрана, не события: в журнал не идут и перезагрузку не переживают.
// Тайлы — <img> с прямоугольником в целых пикселях экрана (projection.tilesAt): на растровой пирамиде
// канвас ничего не добавляет, а DOM-картинки браузер кэширует и декодирует сам. Под тайлами текущего
// уровня лежит уровень на два мельче — пока грузятся крупные, карта не мигает пустотой.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type WheelEvent } from 'react';
import { ENTITY, type EntityType } from '../components/EntityCard';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/icons.generated';
import { TRAVEL_PACE_IDS, TRAVEL_PACES, travelDays, travelDaysOver, type TravelPaceId } from '../rules/srd/travel';
import { DIFFICULT, difficultLabel, routeTerrain, type RouteTerrain, type TerrainGrid } from './terrain';
import { ENCOUNTER_TYPE_LABEL, journeyLegs, supplyNeeded, type RegionTier } from '../rules/a5e/journey';
import type { Explored } from './fog';
import { KIND_LABEL, placeNear, searchPlaces, wikiUrl, type GazetteerPlace } from './gazetteer';
import {
  clampView, fitBox, hexCenters, panBy, pathMiles, scaleBar, tilesAt, toMap, toScreen, zoomAt, zoomLevelFor,
  type MapBox, type MapPassport, type MapPoint, type MapView, type Viewport,
} from './projection';

export interface MapPinItem extends MapPoint {
  id: string;
  name: string;
  type: EntityType;
  icon?: IconName;
  /** Сколько о месте записей и фактов — как бейдж корешка «Здесь». */
  count?: number;
  /** Место на пути лестницы. */
  selected?: boolean;
  /** Цель ждущего предложения — кольцо glow-sim (только мастеру; страница не передаёт его игрокам). */
  pending?: boolean;
  /** Факты о месте: секрет мастера — перечёркнутый глаз, открытое игрокам — слух. Игрокам страница секретов не даёт. */
  facts?: readonly { id: string; text: string; secret: boolean }[];
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
  travel?: { from: MapPoint; onGo: (route: TravelRoute) => void; journey?: JourneyProps };
  /** Сетка местности (src/map/terrain.ts): есть — линейка и поход сами считают мили по трудной местности. */
  terrain?: TerrainGrid | null;
  /**
   * Справочник мест (M12, только мастеру): поиск по имени ведёт карту к месту, щелчок по значку растра — карточка
   * места. Справка, не состояние: ничего не пишет в журнал.
   */
  gazetteer?: readonly GazetteerPlace[];
  /** Свои кнопки страницы в начале панели карты (переключатель «Глобус» на уровне планеты). */
  tools?: ReactNode;
  /** Слева сверху поверх карты — корешки и карточка страницы. */
  children?: ReactNode;
  className?: string;
}

/**
 * Поход по A5E (src/rules/a5e/journey.ts): уровень опасности регионов и сколько ртов кормить; «встреча» — страница
 * бросает d100 по таблице региона и пишет итог в журнал.
 */
export interface JourneyProps {
  tier: RegionTier;
  members: number;
  onEncounter: (regionId: string) => void;
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

type Tool = 'none' | 'ruler' | 'travel';

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
const INPUT = 'h-7 w-44 px-2 type-body-sm text-tx bg-wl shadow-bevel-in placeholder:text-t3 focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';

const BTN = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled) aria-pressed:text-gd-hi aria-pressed:shadow-[var(--bevel),inset_0_-2px_0_var(--gd)]';

const fmt = (n: number, digits = 1) => n.toLocaleString('ru-RU', { maximumFractionDigits: digits });

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
  const days = TRAVEL_PACE_IDS.map(id => `${TRAVEL_PACES[id].label} ${fmt(travelDaysOver(miles, rough, id))}`);
  const terrain = rough >= 0.5 ? ` · трудная ${fmt(rough, 0)} (${difficultLabel(rt!)})` : '';
  return `${milesLabel(miles)}${terrain} · дней пути: ${days.join(' · ')}`;
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
        <ul role="listbox" aria-label="Найденные места" className="absolute right-0 top-full mt-1 w-72 flex flex-col bg-pn shadow-float z-10">
          {hits.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onClick={() => pick(p)}
                onMouseEnter={() => setActive(i)}
                className={`w-full flex items-baseline gap-2 px-2 py-1 text-left cursor-pointer ${i === active ? 'bg-cd' : ''}`}
              >
                <span className="type-body-sm text-tx truncate">{p.name}</span>
                <span className="type-body-sm text-t2 flex-none">{KIND_LABEL[p.kind] ?? ''}</span>
                {p.card ? null : <span className="type-body-sm text-t3 flex-none ml-auto" title="Описания нет: только имя и класс GIS">без описания</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Карточка места справочника: что это, кто правит, чем опасно, коротко — и откуда текст. */
function PlaceInfo({ place, onClose }: { place: GazetteerPlace; onClose: () => void }) {
  const c = place.card;
  const url = wikiUrl(place);
  const gis = !place.sources || place.sources.includes('Toril GIS');
  return (
    <div data-part="place-info" aria-live="polite" className="absolute right-3 bottom-3 w-96 max-w-[45%] flex flex-col gap-1.5 p-3 bg-pn shadow-float cursor-default">
      <div className="flex items-baseline gap-2">
        <span className="type-h-17 text-tx truncate" title={place.name}>{place.name}</span>
        {KIND_LABEL[place.kind] ? <span className="type-body-sm text-t2 flex-none">{KIND_LABEL[place.kind]}</span> : null}
        <button type="button" title="Закрыть · Esc" onClick={onClose} className={`${BTN} ml-auto flex-none`}>Закрыть</button>
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

/** Регионы пути по A5E: мили, DC занятий, кнопка встречи; припасы — на весь путь обычным темпом. */
function JourneyLegs({ terrain, journey }: { terrain: RouteTerrain; journey: JourneyProps }) {
  const legs = journeyLegs(terrain.miles, 'normal', journey.tier, DIFFICULT);
  if (legs.length === 0) return null;
  const days = legs.reduce((s, l) => s + l.days, 0);
  return (
    <div data-part="journey" className="flex flex-col gap-0.5" title={`A5E: путь — цепочка регионов; в каждом хотя бы одна встреча. Уровень опасности ${journey.tier}`}>
      {legs.map(l => (
        <span key={l.region.id} className="flex items-center gap-2">
          <span className="truncate" title={`${l.region.description}${l.region.fields['Journey Activities'] ? `\n\nЗанятия в пути: ${l.region.fields['Journey Activities']}` : ''}`}>
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
        </span>
      ))}
      <span className="text-t2" title="A5E Supply: 1 в день на Small или Medium, 2 — на Large; съедается на длинном отдыхе">
        припасы обычным темпом: {supplyNeeded(days, { small: journey.members })}
      </span>
    </div>
  );
}

export function WorldMap({ passport, frame, frameKey, pins, party, onPin, hexMiles, travel, fog, terrain, gazetteer, tools, children, className = '' }: WorldMapProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hexRef = useRef<HTMLCanvasElement>(null);
  const [vp, setVp] = useState<Viewport>(FALLBACK_VP);
  const [view, setView] = useState<MapView>(() => fitBox(passport, FALLBACK_VP, frame));
  const [hexOn, setHexOn] = useState(true);
  const [fogOn, setFogOn] = useState(false);
  const [tool, setTool] = useState<Tool>('none');
  const [ruler, setRuler] = useState<MapPoint[]>([]);
  /** Конец похода — пин места; пока его нет, отправиться некуда. */
  const [dest, setDest] = useState<{ id: string; name: string } | null>(null);
  /** Путь по трудной местности — отмечает мастер: лес, горы, болото, лёд (SRD Difficult Terrain). */
  const [rough, setRough] = useState(false);
  const [missing, setMissing] = useState(false);
  /** Место справочника под карточкой: найдено поиском или щелчком по значку. */
  const [found, setFound] = useState<GazetteerPlace | null>(null);
  const [inset, setInset] = useState(0);
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const fitted = useRef<string>('');
  /** Мастер двигал карту после вписывания — размер окна и панелей вид больше не сбрасывают. */
  const touched = useRef(false);
  const panelsRef = useRef<HTMLDivElement>(null);

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
  const fit = () => fitBox(passport, vp, frame, 24, inset);
  useLayoutEffect(() => {
    if (fitted.current !== fitKey) {
      fitted.current = fitKey;
      touched.current = false;
      setRuler([]);
      setDest(null);
      setFound(null);
    }
    setView(v => (touched.current ? clampView(passport, vp, v) : fit()));
  }, [fitKey, vp, inset, passport]);

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const z = zoomLevelFor(passport, view.scale, dpr);
  const under = Math.max(0, z - 2);
  const tiles = [...(under < z ? tilesAt(passport, vp, view, under) : []), ...tilesAt(passport, vp, view, z)];
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
      setView(v => zoomAt(passport, vp, v, factor, at ?? { x: vp.w / 2, y: vp.h / 2 }));
    },
    [passport, vp],
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
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    touched.current = true;
    d.x = e.clientX;
    d.y = e.clientY;
    setView(v => panBy(passport, vp, v, dx, dy));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || d.moved) return;
    if (tool !== 'none') {
      const pt = toMap(view, vp, local(e));
      setRuler(r => [...r, pt]);
      setDest(null);
    } else if (gazetteer) {
      setFound(placeNear(gazetteer, toMap(view, vp, local(e)), PICK_PX / view.scale, PICK_LABEL_PX / view.scale) ?? null);
    }
  };
  const showPlace = (p: GazetteerPlace) => {
    touched.current = true;
    setFound(p);
    setView(fitBox(passport, vp, { x0: p.x - FOUND_R, y0: p.y - FOUND_R, x1: p.x + FOUND_R, y1: p.y + FOUND_R }, 24, inset));
  };
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-part="map-ui"]')) return;
    zoomBy(Math.exp(-e.deltaY * 0.0015), local(e));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const step = 80;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      touched.current = true;
      setView(v => panBy(passport, vp, v, ...moves[e.key]));
    }
    else if (e.key === '+' || e.key === '=') zoomBy(1.5);
    else if (e.key === '-') zoomBy(1 / 1.5);
    else if (e.key === 'Escape' && ruler.length > 0) {
      setRuler([]);
      setDest(null);
    }
    else if (e.key === 'Escape' && found) setFound(null);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const bar = scaleBar(passport, view.scale);
  const route = tool === 'travel' && travel ? [travel.from, ...ruler] : ruler;
  const rulerPts = route.map(p => toScreen(view, vp, p));
  const rulerMiles = pathMiles(passport, route);
  const rulerTerrain = terrain && route.length > 1 ? routeTerrain(terrain, passport, route) : undefined;
  // Галочка «весь путь трудный» — поверх сетки: мастер знает про бурелом, которого на карте нет.
  const roughMiles = rough ? rulerMiles : rulerTerrain?.difficult ?? 0;
  const daysAt = (pace: TravelPaceId) => (rough || !rulerTerrain ? travelDays(rulerMiles, pace, rough) : travelDaysOver(rulerMiles, roughMiles, pace));
  const pickTool = (t: Tool) => {
    setTool(cur => (cur === t ? 'none' : t));
    setRuler([]);
    setDest(null);
  };
  const go = (pace: TravelPaceId) => {
    if (!travel || !dest) return;
    travel.onGo({
      toId: dest.id,
      points: route.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })),
      miles: Math.round(rulerMiles * 10) / 10,
      pace,
      days: daysAt(pace),
      ...(rough ? { difficult: true } : rulerTerrain && roughMiles >= 0.5 ? { difficultMiles: Math.round(roughMiles * 10) / 10 } : {}),
    });
    setTool('none');
    setRough(false);
    setRuler([]);
    setDest(null);
  };
  const partyAt = party ? toScreen(view, vp, party) : null;
  const foundAt = found ? toScreen(view, vp, found) : null;
  const inside = (p: MapPoint) => p.x > -200 && p.y > -40 && p.x < vp.w + 200 && p.y < vp.h + 40;

  return (
    <div
      ref={rootRef}
      role="application"
      aria-roledescription="карта"
      aria-label={`Карта ${passport.label}`}
      tabIndex={0}
      data-part="world-map"
      data-zoom={z}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
      onWheel={onWheel}
      onDoubleClick={e => !(e.target as HTMLElement).closest('button, [data-part="map-ui"]') && zoomBy(2, local(e))}
      onKeyDown={onKeyDown}
      className={`relative overflow-hidden bg-wl select-none touch-none outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--gd)] ${tool !== 'none' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'} ${className}`}
    >
      <div aria-hidden="true" className="absolute inset-0" style={{ imageRendering: overzoom ? 'pixelated' : undefined }}>
        {tiles.map(t => (
          <img
            key={t.key}
            src={t.url}
            alt=""
            draggable={false}
            data-tile={t.key}
            onError={t.z === under ? () => setMissing(true) : undefined}
            className="absolute max-w-none pointer-events-none"
            style={{ left: t.left, top: t.top, width: t.width, height: t.height }}
          />
        ))}
      </div>
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

      {foundAt ? (
        <span
          aria-hidden="true"
          data-part="found"
          className="absolute size-4 -translate-x-1/2 -translate-y-1/2 pointer-events-none shadow-[0_0_0_2px_var(--gd-hi),0_0_0_3px_var(--lo)]"
          style={{ left: foundAt.x, top: foundAt.y }}
        />
      ) : null}

      {pins.map(pin => {
        const at = toScreen(view, vp, pin);
        if (!inside(at)) return null;
        const ent = ENTITY[pin.type];
        const shadow = pin.pending
          ? 'shadow-[var(--float),var(--glow-sim)]'
          : pin.selected
            ? 'shadow-[var(--float),inset_0_-2px_0_var(--gd)]'
            : 'shadow-float';
        return (
          <button
            key={pin.id}
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
            className={`absolute flex items-center gap-1.5 px-1.5 py-0.5 bg-cd ${shadow} cursor-pointer hover:bg-pl focus-visible:shadow-[var(--float),var(--glow-gold)] max-w-56`}
            style={{ left: at.x, top: at.y, transform: 'translate(-50%, calc(-100% - 6px))' }}
          >
            {/* Точка места: плашка стоит над ней и не закрывает подпись самой карты. */}
            <span aria-hidden="true" data-part="pin-point" className="absolute left-1/2 -bottom-[9px] size-1.5 -translate-x-1/2 shadow-[0_0_0_1px_var(--lo)]" style={{ background: ent.color }} />
            <Icon name={pin.icon ?? ent.icon} size={16} color={ent.color} title={ent.label} />
            <span className={`type-body-sm truncate ${pin.selected ? 'text-gd-hi' : 'text-tx'}`}>{pin.name}</span>
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
        );
      })}

      {children ? <div ref={panelsRef} data-part="map-ui" className="absolute left-0 top-0 bottom-0 p-4 flex items-start gap-4 pointer-events-none [&>*]:pointer-events-auto">{children}</div> : null}

      <div data-part="map-ui" className="absolute right-3 top-3 flex items-center gap-1 cursor-default" role="toolbar" aria-label="Карта">
        {gazetteer && gazetteer.length > 0 ? <PlaceSearch places={gazetteer} onPick={showPlace} /> : null}
        {tools}
        <button type="button" title="Отдалить · −" aria-label="Отдалить" onClick={() => zoomBy(1 / 1.5)} className={BTN}>−</button>
        <button type="button" title="Приблизить · +" aria-label="Приблизить" onClick={() => zoomBy(1.5)} className={BTN}>+</button>
        <button type="button" title="Вписать место уровня" onClick={() => {
            touched.current = false;
            setView(fit());
          }} className={BTN}>Вписать</button>
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
        {fog && !fog.forced ? (
          <button type="button" aria-pressed={fogOn} title="Туман знаний: что видят игроки — пройденное партией и открытые места" onClick={() => setFogOn(v => !v)} className={BTN}>
            Туман
          </button>
        ) : null}
        <button type="button" aria-pressed={tool === 'ruler'} title="Линейка: щелчки по карте ставят точки пути, Esc — стереть" onClick={() => pickTool('ruler')} className={BTN}>
          Линейка
        </button>
        {travel ? (
          <button type="button" aria-pressed={tool === 'travel'} title="Поход: путь от партии щелчками, конец — пин места; время пойдёт на дни пути" onClick={() => pickTool('travel')} className={BTN}>
            Поход
          </button>
        ) : null}
      </div>

      <div data-part="map-ui" style={{ left: inset + 12 }} className="absolute bottom-3 flex flex-col items-start gap-1 cursor-default pointer-events-none">
        {tool === 'ruler' ? (
          <div data-part="ruler" className="px-2 py-1 bg-cd shadow-float type-body-sm text-tx pointer-events-auto">
            {ruler.length < 2 ? 'Щелчками по карте отметьте путь' : rulerSummary(rulerMiles, rulerTerrain)}
          </div>
        ) : null}
        {tool === 'travel' ? (
          <div data-part="travel" role="group" aria-label="Поход" className="flex flex-col gap-1 px-2 py-1.5 bg-cd shadow-float type-body-sm text-tx pointer-events-auto">
            {dest ? (
              <>
                <span>
                  {party?.label ?? 'Партия'} → {dest.name} · {milesLabel(rulerMiles)}
                </span>
                {rulerTerrain && !rough ? (
                  <span data-part="route-terrain" className="text-t2" title="По карте местности: лес, болото, горы и лёд — трудная местность SRD, каждая миля идёт за две">
                    {rulerTerrain.difficult >= 0.5 ? `трудная местность: ${milesLabel(rulerTerrain.difficult)} (${difficultLabel(rulerTerrain)})` : 'трудной местности на пути нет'}
                  </span>
                ) : null}
                {rulerTerrain && travel?.journey ? <JourneyLegs terrain={rulerTerrain} journey={travel.journey} /> : null}
                <label className="flex items-center gap-2 cursor-pointer" title="SRD: густой лес, болото, руины, крутые горы и лёд — трудная местность, по ней вдвое медленнее">
                  <input type="checkbox" checked={rough} onChange={e => setRough(e.target.checked)} className="accent-[var(--gd)]" />
                  <span>{rulerTerrain ? 'весь путь трудный — вдвое медленнее' : 'трудная местность — вдвое медленнее'}</span>
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
        <div data-part="scale-bar" className="flex items-center gap-2 px-2 py-1 bg-cd shadow-float" title={`Калибровка карты: ${fmt(passport.milesPerPixel, 2)} мили на пиксель исходника`}>
          <span aria-hidden="true" className="h-1.5 bg-tx shadow-[inset_0_-1px_0_var(--lo)]" style={{ width: bar.px }} />
          <span className="type-num-12 text-tx">{milesLabel(bar.miles)}</span>
        </div>
      </div>

      {found ? <div data-part="map-ui"><PlaceInfo place={found} onClose={() => setFound(null)} /></div> : null}

      {missing ? (
        <div role="status" className="absolute inset-x-0 top-1/3 mx-auto w-fit max-w-[90%] px-4 py-3 bg-cd shadow-float type-body text-tx">
          Тайлы карты {passport.label} не нарезаны. В корне проекта: <span className="type-num-12">.venv/bin/python scripts/tile-map.py content/maps/{passport.id}.json</span>
        </div>
      ) : null}
    </div>
  );
}

export default WorldMap;
