// Глобус уровня планеты (HANDOFF §3, §10, референс Globe.png): пиксельный диск по маске, ночная сторона —
// те же цвета местности, приглушённые, ползунок долготы, щелчок по суше — континент или класс местности.
// Тупой компонент: маску, солнце и метки получает от страницы, но на сфере маркеры и подписи не рисует.
// Канвас — около двух тысяч клеток (§9); в jsdom он не рисует, поэтому проверяются DOM-интерфейс и ответ на щелчок.
// Колесо (TASKS M16): приближает диск к точке под курсором — она встаёт в центр, клеток поперёк диска больше, пока
// хватает разрешения маски; ещё шаг колеса сверх того — onZoomIn: страница переходит на плоскую карту в той же точке.
// Последние шаги колеса перед пределом (globeVectorFrom) — та же векторная схема, что у плоской карты (vector),
// спроецированная на диск без подписей: переход глобус → карта без смены картинки. За краем исходника карты схемы нет —
// там остаются клетки маски.
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, type WheelEvent } from 'react';
import type { EntityType } from '../components/EntityCard';
import type { IconName } from '../icons/icons.generated';
import { globeCells, globeHit, globeToLonLat, TERRAIN_CLASSES, TERRAIN_LABEL, type PlanetMask } from './planet';
import type { MapPassport, MapPoint, MapView } from './projection';
import type { MapSchema } from './schema';
import { fillSchema, riverWidth, schemaPaths, schemaSampler } from './schemaDraw';
import { clipLineToBand, clipRingToBand, diskPoint, globeVectorFrom, nightPolygon } from './globeSchema';
import { SphereSurfaceLayer } from './SphereSurfaceLayer';
import { useSurfaceSession } from './SurfaceHost';
import { preserveSurfaceZoomAnchor } from './surfaceZoom';
import { clampSurfaceTilt, unprojectSurface, type GeographicExtent, type SurfaceCamera } from './surfaceProjection';
import { loadClean } from './cleanMap';
import { mapPixelRatio } from './renderer';
import { surfaceFromFlat } from './surfaceTransition';

/** Схема плоской карты для последних шагов колеса: как пиксель карты ложится на глобус. */
export interface GlobeVector {
  passport?: MapPassport;
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
  /** Exact flat camera at a reverse projection handoff; navigation state only. */
  fromFlat?: MapView;
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

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Globe({ mask, rot: rot0, sun, onPick, n: n0 = 44, tools, focus, fromFlat, onZoomIn, vector, children, className = '' }: GlobeProps) {
  const maxZoom = globeMaxZoom(mask, n0);
  const [zoom, setZoom] = useState(() => Math.min(maxZoom, Math.max(1, focus?.zoom ?? 1)));
  const [rot, setRot] = useState(focus?.lon ?? Math.round(rot0));
  /** Широта в центре окна — только на приближении; целый диск стоит посередине. */
  const [lat, setLat] = useState(clampSurfaceTilt(focus?.lat ?? 0));
  const [gpuAvailable,setGpuAvailable]=useState<boolean|null>(null);
  const [entryProgress,setEntryProgress]=useState(fromFlat?0:1);
  const entryStarted=useRef(false);
  const surfaceLayout=!!gpuAvailable || (!!vector?.passport && typeof Path2D!=='undefined');
  const surfaceSession=useSurfaceSession();
  const [rasterMode,setRasterMode]=useState(surfaceSession.look!=='schema');
  useEffect(()=>{surfaceSession.look=rasterMode?'clean':'schema';},[rasterMode,surfaceSession]);
  const [clean,setClean]=useState<MapPassport|null>(null);
  const [morphOverride,setMorphOverride]=useState<number|null>(null);
  const diagnostics=typeof location!=='undefined'&&new URLSearchParams(location.search).get('mapStats')==='1';
  const dragRef=useRef<{id:number;x:number;y:number;lon:number;lat:number;moved:boolean}|null>(null);
  const suppressClick=useRef(false);
  const zoomRaf=useRef(0);
  const zoomCurrent=useRef(zoom);zoomCurrent.current=zoom;
  const zoomTarget=useRef(zoom);
  useEffect(()=>()=>cancelAnimationFrame(zoomRaf.current),[]);
  useEffect(()=>{
    let live=true;setClean(null);
    if(vector?.passport)void loadClean(vector.passport).then(p=>{if(live)setClean(p);});
    return()=>{live=false;};
  },[vector?.passport]);
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
    if (reducedMotion() || typeof requestAnimationFrame === 'undefined' || typeof performance === 'undefined') {
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
  const drawVector = !surfaceLayout && !!vector && typeof Path2D !== 'undefined' && mix > 0;
  const dpr = drawVector ? mapPixelRatio() : 1;

  // Пути схемы на диске — один раз на вид (поворот, клетки, размер клетки), а не на каждый кадр проявления.
  const R = gpuAvailable ? n0 * zoom * cellPx / 2 : size / 2;
  const extent=useMemo(():GeographicExtent|null=>{
    if(!vector?.passport)return null;
    const a=vector.toLonLat({x:0,y:0}),b=vector.toLonLat({x:vector.size.width,y:vector.size.height});
    return {lon0:a.lon,lon1:b.lon,latTop:a.lat,latBottom:b.lat,width:vector.size.width,height:vector.size.height};
  },[vector]);
  const flatZoom=maxZoom*1.65;
  const camera=useMemo(():SurfaceCamera|null=>{
    if(!vector||!extent||!box.w||!box.h)return null;
    const t=Math.min(1,Math.max(0,(zoom-maxZoom)/(flatZoom-maxZoom)));
    const morph=morphOverride??t*t*(3-2*t);
    const center=vector.toMap({lon:rot,lat:clampSurfaceTilt(lat)});
    const target={vp:box,view:{...center,scale:vector.scaleAt(R,lat)},globe:{lon:rot,lat:clampSurfaceTilt(lat),radius:R},morph};
    return fromFlat && entryProgress<1 ? surfaceFromFlat(target,fromFlat,entryProgress) : target;
  },[vector,extent,box,zoom,maxZoom,flatZoom,rot,lat,R,morphOverride,fromFlat,entryProgress]);
  useEffect(()=>{
    if(!fromFlat||!surfaceLayout||!box.w||!box.h||entryStarted.current)return;
    entryStarted.current=true;
    if(reducedMotion()){setEntryProgress(1);return;}
    let frame=0;
    const start=performance.now();
    const tick=(now:number)=>{const t=Math.min(1,(now-start)/320);setEntryProgress(t*t*(3-2*t));if(t<1)frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);
    return()=>{cancelAnimationFrame(frame);entryStarted.current=false;};
  },[fromFlat,surfaceLayout,box.w,box.h]);
  const cameraRef=useRef(camera);cameraRef.current=camera;
  const surfaceActive=surfaceLayout&&!!camera&&!!extent;
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
    if(surfaceLayout)return;
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
    const { paths } = disk;
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
  }, [mask, n, rot, sun, cellPx, size, R, dpr, mix, disk, vector, zoomed, lat,surfaceLayout]);

  const surfaceAt=(clientX:number,clientY:number)=>{
    if(!camera||!extent||!vector||!boxRef.current)return null;
    const rect=boxRef.current.getBoundingClientRect();
    const point=unprojectSurface({x:clientX-rect.left,y:clientY-rect.top},extent,camera);
    return point?vector.toLonLat(point):null;
  };

  const handoff=()=>{
    const current=cameraRef.current;
    if(current)onZoomIn?.({lon:current.globe.lon,lat:current.globe.lat,zoom:zoomCurrent.current,radiusPx:current.globe.radius});
  };
  const animateZoom=(target:number,after?:()=>void,anchor?:MapPoint)=>{
    zoomTarget.current=target;cancelAnimationFrame(zoomRaf.current);
    const from=zoomCurrent.current,start=performance.now(),previous=cameraRef.current;
    const advance=(value:number)=>{
      if(anchor&&previous&&extent&&vector){
        const radius=n0*value*cellPx/2;
        const progress=Math.min(1,Math.max(0,(value-maxZoom)/(flatZoom-maxZoom)));
        const next:SurfaceCamera={...previous,globe:{...previous.globe,radius},view:{...previous.view,scale:vector.scaleAt(radius,previous.globe.lat)},morph:progress*progress*(3-2*progress)};
        const anchored=preserveSurfaceZoomAnchor(previous,next,extent,anchor);
        setRot(anchored.globe.lon);setLat(anchored.globe.lat);
      }
      setZoom(value);
    };
    if(reducedMotion()){
      advance(target);
      // The handoff must read the committed final camera, even without animated frames.
      if(after)zoomRaf.current=requestAnimationFrame(after);
      return;
    }
    const tick=(now:number)=>{
      const t=Math.min(1,(now-start)/220),ease=1-(1-t)**3,value=from+(target-from)*ease;
      advance(value);
      if(t<1)zoomRaf.current=requestAnimationFrame(tick);else if(after)zoomRaf.current=requestAnimationFrame(after);
    };
    zoomRaf.current=requestAnimationFrame(tick);
  };

  const at = (e: MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return globeToLonLat(n, rot, (e.clientX - r.left) / cellPx, (e.clientY - r.top) / cellPx);
  };

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (e.deltaY === 0) return;
    if(surfaceActive&&camera&&vector){
      if(entryProgress<1||dragRef.current)return;
      if((e.target as HTMLElement).closest('button,input,[data-part="map-ui"]'))return;
      const covered=vector.covers(rot,lat);
      setMorphOverride(null);
      const maximum=covered?flatZoom:maxZoom;
      if(e.deltaY<0&&zoom>=flatZoom-1e-6&&covered){handoff();return;}
      const target=Math.max(1,Math.min(maximum,zoomTarget.current*(e.deltaY<0?WHEEL_STEP:1/WHEEL_STEP)));
      const rect=e.currentTarget.getBoundingClientRect();
      animateZoom(target,undefined,{x:e.clientX-rect.left,y:e.clientY-rect.top});
      return;
    }
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
      <div className={`relative flex-1 min-w-0 flex flex-col items-center ${surfaceLayout ? '' : 'gap-3 p-4'}`}>
        <div ref={boxRef} onWheel={onWheel} data-part="globe-view" data-zoom={zoom.toFixed(2)} data-entry={entryProgress.toFixed(3)} className="relative flex-1 min-h-0 w-full overflow-hidden touch-none"
          onPointerDown={e=>{if(entryProgress<1||!surfaceActive||e.button!==0||(e.target as HTMLElement).closest('button,input,[data-part="map-ui"]'))return;
            cancelAnimationFrame(zoomRaf.current);zoomTarget.current=zoomCurrent.current;
            dragRef.current={id:e.pointerId,x:e.clientX,y:e.clientY,lon:rot,lat,moved:false};suppressClick.current=false;e.currentTarget.setPointerCapture(e.pointerId);}}
          onPointerMove={e=>{const drag=dragRef.current;if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.moved ||= Math.hypot(dx,dy)>5;
            if(drag.moved){setRot(((drag.lon-dx/R*180/Math.PI)%360+360)%360);setLat(clampSurfaceTilt(drag.lat+dy/R*180/Math.PI));}}}
          onPointerUp={e=>{if(dragRef.current?.id===e.pointerId){suppressClick.current=dragRef.current.moved;dragRef.current=null;e.currentTarget.releasePointerCapture(e.pointerId);}}}
          onPointerCancel={()=>{dragRef.current=null;suppressClick.current=true;}}
        >
        {camera&&extent&&vector?.passport?<SphereSurfaceLayer passport={vector.passport} schema={vector.schema} extent={extent} mask={mask} camera={camera} sun={sun} raster={rasterMode?(clean??vector.passport):undefined} onAvailable={setGpuAvailable}/>:null}
        {surfaceActive?<canvas className="absolute inset-0 size-full cursor-grab active:cursor-grabbing" role="img" aria-label={`Глобус ${mask.label}: щелчок по суше — континент`}
          onClick={e=>{if(suppressClick.current){suppressClick.current=false;return;}const ll=surfaceAt(e.clientX,e.clientY),hit=ll?globeHit(mask,ll.lon,ll.lat):null;if(hit)onPick?.(hit);}}
          onMouseMove={e=>{const ll=surfaceAt(e.clientX,e.clientY),hit=ll?globeHit(mask,ll.lon,ll.lat):null;setHover(hit?.label??null);}}
        />:null}
        <div className="absolute pointer-events-none" style={gpuAvailable?{width:box.w,height:box.h,left:0,top:0}:{ width: size, height: size, ...diskPos }}>
          <canvas
            ref={canvasRef}
            hidden={surfaceActive}
            width={Math.round(size * dpr)}
            height={Math.round(size * dpr)}
            role="img"
            aria-label={`Глобус ${mask.label}: щелчок по суше — континент`}
            data-rot={rot}
            data-vector={vectorOn || undefined}
            data-mix={drawVector ? mix.toFixed(2) : undefined}
            style={{ width: size, height: size }}
            className={`block pointer-events-auto cursor-pointer ${drawVector ? '' : '[image-rendering:pixelated]'}`}
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
        </div>
        </div>
        <div className={`flex flex-wrap items-center gap-3 px-3 py-2 bg-pn shadow-bevel ${surfaceLayout ? 'absolute right-2 bottom-2 max-w-[calc(100%-1rem)]' : ''}`} data-part="map-ui" data-globe-ui="true">
          {!surfaceLayout?tools:null}
          {surfaceLayout?<>
            <button type="button" disabled={!vector?.covers(rot,lat)} title={!vector?.covers(rot,lat)?'Для этой области нет подробной карты':undefined} onClick={()=>{if(camera?.morph===1)handoff();else animateZoom(flatZoom,handoff);}} className="type-num-12 text-tx disabled:text-t4">Плоская карта</button>
            <button type="button" aria-pressed={!rasterMode} onClick={()=>setRasterMode(false)} className="type-num-12 text-tx">Схема</button>
            <button type="button" aria-pressed={rasterMode} onClick={()=>setRasterMode(true)} className="type-num-12 text-tx">Карта</button>
            <label className="flex items-center gap-2 type-body-sm text-t2">Наклон <input aria-label="Наклон глобуса" type="range" min={-75} max={75} value={lat} onChange={e=>setLat(Number(e.target.value))}/></label>
            {diagnostics?<label className="flex items-center gap-2 type-body-sm text-t2">Проекция <input aria-label="Смешение проекций" type="range" min={0} max={1} step={0.05} value={camera?.morph??0} onChange={e=>setMorphOverride(Number(e.target.value))}/></label>:null}
          </>:null}
          <label className="flex items-center gap-2">
            <span className="type-num-12 uppercase text-t2">Долгота</span>
            <input type="range" min={0} max={359} step={1} value={rot} aria-label="Долгота в центре глобуса" onChange={e => setRot(Number(e.target.value))} className="w-48 accent-[var(--gd)]" />
            <span className="type-num-12 text-tx w-10 text-right">{rot.toFixed(0)}°</span>
          </label>
          <span className="type-body-sm text-t2 min-w-36" aria-live="polite">{hover ?? (onZoomIn ? 'Щелчок по суше — континент · колесо — ближе, до плоской карты' : 'Щелчок по суше — континент')}</span>
        </div>
      </div>
    </div>
  );
}

export default Globe;
