// Глобус уровня планеты (HANDOFF §3, §10, референс Globe.png): пиксельный диск по маске, ночная сторона —
// те же цвета местности, приглушённые, ползунок долготы, щелчок по суше — континент или класс местности.
// Тупой компонент: маску, солнце и метки даёт страница. Канвас — около двух тысяч клеток (§9); в jsdom он
// не рисует, поэтому всё, что проверяется, — в DOM: подпись, ползунок, метки, ответ на щелчок.
// Колесо (TASKS M16): приближает диск к точке под курсором — она встаёт в центр, клеток поперёк диска больше, пока
// хватает разрешения маски; ещё шаг колеса сверх того — onZoomIn: страница переходит на плоскую карту в той же точке.
// Последние шаги колеса перед пределом (globeVectorFrom) — та же векторная схема с подписями, что у плоской карты
// (vector), спроецированная на диск: переход глобус → карта без смены картинки. За краем исходника карты схемы нет —
// там остаются клетки маски.
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, type WheelEvent } from 'react';
import { ENTITY, type EntityType } from '../components/EntityCard';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/icons.generated';
import { globeCells, globeHit, globeToLonLat, lonLatToGlobe, TERRAIN_CLASSES, TERRAIN_LABEL, type PlanetMask } from './planet';
import type { MapPoint } from './projection';
import type { MapSchema } from './schema';
import { drawLabels, fillSchema, labelMeasure, occupiedBoxes, riverWidth, schemaPaths, schemaSampler, useFontsReady } from './schemaDraw';
import { loadLabels, placeLabels, type SchemaLabel } from './schemaLabels';
import { clipLineToBand, clipRingToBand, diskPoint, globeVectorFrom, nightPolygon } from './globeSchema';
import { fold } from './gazetteer';

/** Схема плоской карты для последних шагов колеса: как пиксель карты ложится на глобус. */
export interface GlobeVector {
  schema: MapSchema;
  /** Карта — по ней подписи схемы. */
  mapId?: string;
  toLonLat: (p: MapPoint) => { lon: number; lat: number };
  /** Обратное toLonLat: долгота и широта → пиксель карты. */
  toMap: (ll: { lon: number; lat: number }) => MapPoint;
  /** Размер исходника карты, px. */
  size: { width: number; height: number };
  /** Точка внутри исходника карты — там есть схема; снаружи — клетки маски. */
  covers: (lon: number, lat: number) => boolean;
  /** Пикселей экрана на пиксель карты у точки широты lat в центре окна, диск радиуса radiusPx. */
  scaleAt: (radiusPx: number, lat: number) => number;
  /** Видимая полусфера при долготе центра rot — полосы по x плоской карты (globeSchema.visibleBands). */
  bands: (rot: number) => readonly (readonly [number, number])[];
}

export interface GlobeMarker {
  id: string;
  label: string;
  lon: number;
  lat: number;
  type: EntityType;
  icon?: IconName;
}

export interface GlobeProps {
  mask: PlanetMask;
  /** Долгота в центре на старте — обычно место партии; дальше мастер крутит ползунком. */
  rot: number;
  /** Подсолнечная долгота: дальше 90° от неё — ночь. */
  sun: number;
  markers?: readonly GlobeMarker[];
  /** Щелчок по суше: континент маски (region) или класс местности. */
  onPick?: (hit: { id: string; label: string; region: boolean }) => void;
  /** Клеток поперёк диска. */
  n?: number;
  /** Свои кнопки страницы в панели под глобусом (переключатель на плоскую карту). */
  tools?: ReactNode;
  /** С чего начать: точка в центре и приближение — возврат с плоской карты отдалением (M16). */
  focus?: GlobeFocus;
  /** Колесо дальше предела глобуса: центр диска и радиус в пикселях экрана — по ним страница ставит вид плоской карты. */
  onZoomIn?: (at: GlobeFocus & { radiusPx: number }) => void;
  /** Векторная схема плоской карты — на последних шагах колеса вместо клеток. */
  vector?: GlobeVector;
  children?: ReactNode;
  className?: string;
}

export interface GlobeFocus { lon: number; lat: number; zoom: number }

/** Ночь — те же цвета, затемнённые (референс: «один мир при другом освещении, а не другая палитра»). */
const NIGHT_SHADE = 0.62;
/** Проявление схемы поверх клеток, мс (решение кокпита). */
const FADE_MS = 240;
/** Шаг приближения на щелчок колеса. */
const WHEEL_STEP = 1.2;
/**
 * Предел приближения: клеток поперёк диска не больше, чем у маски на полусферу (w / 2), — дальше клетка глобуса
 * мельче клетки маски, и подробность берёт плоская карта.
 */
export const globeMaxZoom = (mask: PlanetMask, n: number) => Math.max(1, mask.w / 2 / n);

const NO_MARKERS: readonly GlobeMarker[] = [];

export function Globe({ mask, rot: rot0, sun, markers = NO_MARKERS, onPick, n: n0 = 44, tools, focus, onZoomIn, vector, children, className = '' }: GlobeProps) {
  const maxZoom = globeMaxZoom(mask, n0);
  const [zoom, setZoom] = useState(() => Math.min(maxZoom, Math.max(1, focus?.zoom ?? 1)));
  const [rot, setRot] = useState(Math.round(focus?.lon ?? rot0));
  /** Широта в центре окна — только на приближении; целый диск стоит посередине. */
  const [lat, setLat] = useState(focus?.lat ?? 0);
  const [cellPx, setCellPx] = useState(14);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const n = Math.round(n0 * zoom);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => { if (!focus) setRot(Math.round(rot0)); }, [rot0, focus]);

  // Клетка — целое число пикселей; целый диск (без приближения) — по меньшей стороне свободного места.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      setBox({ w: el.clientWidth, h: el.clientHeight });
      const side = Math.min(el.clientWidth, el.clientHeight) - 24;
      if (side > 0) setCellPx(Math.max(6, Math.floor(side / n0)));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [n0]);

  // Схема на последних шагах колеса; в jsdom (нет Path2D) — всегда клетки.
  const vectorOn = !!vector && typeof Path2D !== 'undefined' && zoom >= globeVectorFrom(maxZoom, WHEEL_STEP) - 1e-9;
  const [labels, setLabels] = useState<readonly SchemaLabel[]>([]);
  const fonts = useFontsReady();
  const mapId = vectorOn ? vector?.mapId : undefined;
  useEffect(() => {
    if (!mapId) return;
    let live = true;
    void loadLabels(mapId).then(l => { if (live) setLabels(l); });
    return () => { live = false; };
  }, [mapId]);

  const size = n * cellPx;
  // Широта центра окна — по высоте точки на диске; целый диск — посередине.
  const zoomed = zoom > 1;
  const centerY = zoomed ? (n / 2 - (n / 2) * Math.sin(lat * (Math.PI / 180))) * cellPx : size / 2;
  const diskPos = { left: box.w / 2 - size / 2, top: box.h / 2 - centerY };
  // Переход клетки → схема (M16, 30.10): не сменой картинки, а за FADE_MS — схема проявляется поверх клеток и уходит
  // обратно при отдалении; клетки в экстенте карты — цветами самой схемы (schemaSampler), так что проявляется та же
  // картинка, только резче.
  const [mix, setMix] = useState(vectorOn ? 1 : 0);
  const mixRef = useRef(mix);
  useEffect(() => {
    const target = vectorOn ? 1 : 0;
    if (mixRef.current === target) return;
    if (typeof requestAnimationFrame === 'undefined' || typeof performance === 'undefined') {
      mixRef.current = target;
      setMix(target);
      return;
    }
    const from = mixRef.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - t0) / FADE_MS));
      mixRef.current = from + (target - from) * k;
      setMix(mixRef.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [vectorOn]);
  const drawVector = !!vector && typeof Path2D !== 'undefined' && mix > 0;
  const dpr = drawVector && typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  // Пути схемы на диске — один раз на вид (поворот, клетки, размер клетки), а не на каждый кадр проявления.
  const R = size / 2;
  const disk = useMemo(() => {
    if (!drawVector || !vector) return null;
    const onDisk = (p: MapPoint) => {
      const ll = vector.toLonLat(p);
      return diskPoint(n, rot, cellPx, ll.lon, ll.lat);
    };
    const bands = vector.bands(rot);
    const paths = schemaPaths(vector.schema, onDisk, {
      ring: r => bands.map(([a, b]) => clipRingToBand(r, a, b)).filter(c => c.length),
      line: l => bands.flatMap(([a, b]) => clipLineToBand(l, a, b)),
    });
    return { onDisk, paths };
  }, [drawVector, vector, n, rot, cellPx]);
  // Снимок схемы для цвета клеток — один раз на схему; цвета токенов — с канваса глобуса.
  const samplerRef = useRef<{ schema: MapSchema; at: ((p: MapPoint) => string | null) | null } | null>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext?.('2d');
    if (!cv || !ctx) return;
    const css = getComputedStyle(cv);
    const token = (name: string) => css.getPropertyValue(`--${name}`).trim() || '#000';
    const color = Object.fromEntries(TERRAIN_CLASSES.map(c => [c, token(`terrain-${c}`)]));
    if (vector && vector.schema !== samplerRef.current?.schema) {
      samplerRef.current = { schema: vector.schema, at: schemaSampler(vector.schema, vector.size, token) };
    }
    const sample = vector ? samplerRef.current?.at ?? null : null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    if (mix < 1 || !disk) {
      for (const c of globeCells(mask, n, rot, sun)) {
        let fill = color[c.cls];
        if (sample && vector) {
          const ll = globeToLonLat(n, rot, c.x + 0.5, c.y + 0.5);
          if (ll && vector.covers(ll.lon, ll.lat)) fill = sample(vector.toMap(ll)) ?? fill;
        }
        ctx.fillStyle = fill;
        ctx.fillRect(c.x * cellPx, c.y * cellPx, cellPx, cellPx);
        if (!c.lit) {
          ctx.fillStyle = `rgba(0,0,0,${NIGHT_SHADE})`;
          ctx.fillRect(c.x * cellPx, c.y * cellPx, cellPx, cellPx);
        }
      }
    }
    if (!disk || !vector) return;
    ctx.save();
    ctx.globalAlpha = mix;
    ctx.beginPath();
    ctx.arc(R, R, R, 0, 2 * Math.PI);
    ctx.clip();
    ctx.fillStyle = color.o;
    ctx.fillRect(0, 0, size, size);
    // За краем исходника карты схемы нет — клетки маски, как раньше.
    for (const c of globeCells(mask, n, rot, sun)) {
      const ll = globeToLonLat(n, rot, c.x + 0.5, c.y + 0.5);
      if (!ll || vector.covers(ll.lon, ll.lat)) continue;
      ctx.fillStyle = color[c.cls];
      ctx.fillRect(c.x * cellPx, c.y * cellPx, cellPx, cellPx);
    }
    const { onDisk, paths } = disk;
    const scale = vector.scaleAt(R, zoomed ? lat : 0);
    if (paths) {
      fillSchema(ctx, paths, token, 1, riverWidth(scale));
      ctx.strokeStyle = token('gd');
      ctx.lineWidth = Math.max(1, Math.min(2.5, scale * 6));
      ctx.stroke(paths.roads);
    }
    const night = nightPolygon(R, rot, sun);
    if (night.length) {
      ctx.beginPath();
      night.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = `rgba(0,0,0,${NIGHT_SHADE})`;
      ctx.fill();
    }
    ctx.restore();
    if (!labels.length || box.w <= 0) return;
    // Подписи — в окне глобуса (не в квадрате диска), как у плоской карты: тот же отбор, тот же масштаб у центра.
    const family = token('font-display') || 'serif';
    const placed = placeLabels(labels, {
      project: p => {
        const d = onDisk(p);
        return d.visible ? { x: d.x + diskPos.left, y: d.y + diskPos.top } : null;
      },
      scale,
      vp: box,
      measure: labelMeasure(ctx, family),
      // Метки мест кампании — по DOM окна глобуса; их имена схема не повторяет.
      avoid: occupiedBoxes(boxRef.current),
      skip: new Set(markers.map(m => fold(m.label))),
    });
    ctx.setTransform(dpr, 0, 0, dpr, -diskPos.left * dpr, -diskPos.top * dpr);
    ctx.globalAlpha = mix;
    drawLabels(ctx, placed, family, token);
    ctx.globalAlpha = 1;
  }, [mask, n, rot, sun, cellPx, size, R, dpr, mix, disk, vector, labels, fonts, box, diskPos.left, diskPos.top, markers, zoomed, lat]);

  const at = (e: MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return globeToLonLat(n, rot, (e.clientX - r.left) / cellPx, (e.clientY - r.top) / cellPx);
  };

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (e.deltaY === 0) return;
    if (e.deltaY < 0) {
      // Точка под курсором — в центр; вне диска — приближаем к текущему центру.
      const r = e.currentTarget.querySelector('canvas')?.getBoundingClientRect();
      const ll = r ? globeToLonLat(n, rot, (e.clientX - r.left) / cellPx, (e.clientY - r.top) / cellPx) : null;
      const c = ll ?? { lon: rot, lat };
      if (zoom >= maxZoom) {
        onZoomIn?.({ lon: c.lon, lat: c.lat, zoom, radiusPx: size / 2 });
        return;
      }
      setRot(Math.round(c.lon));
      setLat(c.lat);
      setZoom(z => Math.min(maxZoom, z * WHEEL_STEP));
    } else {
      setZoom(z => {
        const next = Math.max(1, z / WHEEL_STEP);
        if (next === 1) setLat(0);
        return next;
      });
    }
  };

  return (
    <div className={`relative flex min-h-0 bg-wl ${className}`} data-part="globe">
      {children ? <div className="flex-none p-4 flex items-start gap-4 min-h-0 max-h-full">{children}</div> : null}
      <div className="flex-1 min-w-0 flex flex-col items-center gap-3 p-4">
        <div ref={boxRef} onWheel={onWheel} data-part="globe-view" data-zoom={zoom.toFixed(2)} className="relative flex-1 min-h-0 w-full overflow-hidden">
        <div className="absolute" style={{ width: size, height: size, ...diskPos }}>
          <canvas
            ref={canvasRef}
            width={Math.round(size * dpr)}
            height={Math.round(size * dpr)}
            role="img"
            aria-label={`Глобус ${mask.label}: щелчок по суше — континент`}
            data-rot={rot}
            data-vector={vectorOn || undefined}
            data-mix={drawVector ? mix.toFixed(2) : undefined}
            style={{ width: size, height: size }}
            className={`block cursor-pointer ${drawVector ? '' : '[image-rendering:pixelated]'}`}
            onMouseMove={e => {
              const ll = at(e);
              const hit = ll ? globeHit(mask, ll.lon, ll.lat) : null;
              setHover(hit ? hit.label : ll ? TERRAIN_LABEL.o : null);
            }}
            onMouseLeave={() => setHover(null)}
            onClick={e => {
              const ll = at(e);
              const hit = ll ? globeHit(mask, ll.lon, ll.lat) : null;
              if (hit) onPick?.(hit);
            }}
          />
          {markers.map(m => {
            const p = lonLatToGlobe(n, rot, m.lon, m.lat);
            if (!p.visible) return null;
            const ent = ENTITY[m.type];
            return (
              <span
                key={m.id}
                data-marker={m.id}
                title={`${ent.label} · ${m.label}`}
                className="absolute flex items-center gap-1 px-1 py-0.5 bg-cd shadow-float pointer-events-none whitespace-nowrap"
                style={{ left: p.x * cellPx, top: p.y * cellPx, transform: 'translate(-50%, -50%)' }}
              >
                <Icon name={m.icon ?? ent.icon} size={16} color={ent.color} title={ent.label} />
                <span className="type-body-sm text-tx">{m.label}</span>
              </span>
            );
          })}
        </div>
        </div>
        <div className="flex items-center gap-3 px-3 py-2 bg-pn shadow-bevel" data-part="globe-ui">
          {tools}
          <label className="flex items-center gap-2">
            <span className="type-num-12 uppercase text-t2">Долгота</span>
            <input type="range" min={0} max={359} step={1} value={rot} aria-label="Долгота в центре глобуса" onChange={e => setRot(Number(e.target.value))} className="w-48 accent-[var(--gd)]" />
            <span className="type-num-12 text-tx w-10 text-right">{rot}°</span>
          </label>
          <span className="type-body-sm text-t2 min-w-36" aria-live="polite">{hover ?? (onZoomIn ? 'Щелчок по суше — континент · колесо — ближе, до плоской карты' : 'Щелчок по суше — континент')}</span>
        </div>
      </div>
    </div>
  );
}

export default Globe;
