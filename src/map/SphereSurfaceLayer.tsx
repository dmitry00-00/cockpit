import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MapPassport } from './projection';
import type { PlanetMask } from './planet';
import type { MapSchema } from './schema';
import type { GeographicExtent, SurfaceCamera } from './surfaceProjection';
import { type TilesGl } from './tilesGl';
import { maskTile, surfaceTileLoader, surfaceTiles } from './surfaceTiles';
import { forceCanvas, mapPixelRatio } from './renderer';
import { useSurfaceSession } from './SurfaceHost';
import { FrameMetrics } from './frameMetrics';
import { CanvasSurfaceRenderer } from './surfaceCanvas';

interface Props {
  passport: MapPassport;
  extent: GeographicExtent;
  schema: MapSchema;
  mask: PlanetMask;
  camera: SurfaceCamera;
  sun: number;
  raster?: MapPassport;
  onAvailable: (available:boolean)=>void;
}

/** One texture/mesh renderer for the spherical, intermediate and flat projections. */
export function SphereSurfaceLayer({passport,extent,schema,mask,camera,sun,raster,onAvailable}:Props){
  const ref=useRef<HTMLDivElement>(null);
  const session=useSurfaceSession();
  const available=useRef(onAvailable);available.current=onAvailable;
  const sunRef=useRef(sun);sunRef.current=sun;
  const gpuRef=useRef<TilesGl|null>(null);
  const fallbackRef=useRef<CanvasSurfaceRenderer|null>(null);
  const fallbackCanvas=useRef<HTMLCanvasElement>(null);
  const dpr=mapPixelRatio();
  const measure=typeof location!=='undefined'&&new URLSearchParams(location.search).get('mapStats')==='1';
  const tiles=useMemo(()=>[
    ...(camera.morph<1?[maskTile(mask,extent)]:[]),
    ...surfaceTiles(raster??passport,extent,camera,dpr,!raster),
  ],[mask,extent,camera,dpr,passport,raster]);
  const frame=useRef({camera,tiles});frame.current={camera,tiles};
  const [renderer,setRenderer]=useState<'webgl2'|'fallback'>('fallback');
  const [failed,setFailed]=useState(false);
  const [diagnostic,setDiagnostic]=useState('');
  const [stats,setStats]=useState({fps:0,cpu:0,ready:0,loading:0,bytes:0,gpu:null as number|null,samples:0,frameP95:null as number|null,cpuP95:null as number|null,gpuP95:null as number|null});
  const [fallbackStats,setFallbackStats]=useState({fps:0,cpu:0,samples:0,frameP95:null as number|null,cpuP95:null as number|null,drawn:0,ready:0});

  useLayoutEffect(()=>{
    const cv=ref.current;
    if(!cv||failed||forceCanvas()||typeof Path2D==='undefined'){available.current(false);return;}
    const css=getComputedStyle(cv);
    const color=(token:string)=>css.getPropertyValue(`--${token}`).trim()||'#888';
    const loader=surfaceTileLoader(passport,schema,mask,color,dpr);
    const lease=session.claim(cv,{resource:passport.tiles,extent,load:loader.load,sun:()=>sunRef.current,measure,
      onInitError:message=>{if(measure)console.warn('Map surface shader:',message);},
      onLost:()=>{setFailed(true);setRenderer('fallback');available.current(false);},
      onError:tile=>{if(measure)console.warn('Map surface tile:',tile.url);setFailed(true);setRenderer('fallback');available.current(false);},
    });
    const gpu=lease.gpu;
    gpuRef.current=gpu;
    available.current(!!gpu);setRenderer(gpu?'webgl2':'fallback');
    let raf=0,start=performance.now(),previous=start;
    const metrics=new FrameMetrics();
    const draw=()=>{
      const {camera:c,tiles:t}=frame.current;
      const t0=performance.now();gpu?.draw(c.view,c.vp,dpr,t,false,c);return performance.now()-t0;
    };
    if(gpu)draw();
    const benchmark=(now:number)=>{
      const cpu=draw(),s=gpu!.stats();
      metrics.add(now-previous,cpu,s.gpuMs??null);previous=now;
      if(now-start>=1000){
        setStats({...metrics.summary(),ready:s.ready,loading:s.loading,bytes:s.textureBytes+s.meshBytes,gpu:s.gpuMs??null});
        start=now;
      }
      raf=requestAnimationFrame(benchmark);
    };
    if(gpu&&measure)raf=requestAnimationFrame(benchmark);
    return()=>{cancelAnimationFrame(raf);loader.dispose();lease.release();gpuRef.current=null;};
  },[passport,schema,mask,extent,dpr,measure,failed,session]);

  useEffect(()=>{
    gpuRef.current?.draw(camera.view,camera.vp,dpr,tiles,false,camera);
  },[camera,dpr,tiles,sun]);

  useEffect(()=>{
    const canvas=fallbackCanvas.current;
    if(!canvas||renderer==='webgl2'||typeof Path2D==='undefined')return;
    const css=getComputedStyle(canvas);
    const color=(token:string)=>css.getPropertyValue(`--${token}`).trim()||'#888';
    const fallback=new CanvasSurfaceRenderer(canvas,passport,schema,mask,extent,color,dpr);
    fallbackRef.current=fallback;
    fallback.update(camera,tiles,dpr,sun);
    return()=>{
      fallback.dispose();
      if(fallbackRef.current===fallback)fallbackRef.current=null;
    };
  },[renderer,passport,schema,mask,extent,dpr]);

  useEffect(()=>{
    fallbackRef.current?.update(camera,tiles,dpr,sun);
  },[camera,tiles,dpr,sun]);

  useEffect(()=>{
    if(!measure||renderer!=='fallback')return;
    let raf=0,previous=performance.now(),start=previous;
    const metrics=new FrameMetrics();
    const benchmark=(now:number)=>{
      const cpu=fallbackRef.current?.drawFrame()??0;
      metrics.add(now-previous,cpu,null);previous=now;
      if(now-start>=1000){
        setFallbackStats({...metrics.summary(),...(fallbackRef.current?.tileCounts()??{drawn:0,ready:0})});
        start=now;
      }
      raf=requestAnimationFrame(benchmark);
    };
    raf=requestAnimationFrame(benchmark);
    return()=>cancelAnimationFrame(raf);
  },[measure,renderer]);

  return <>
    <div ref={ref} data-part="surface-host" data-renderer={renderer} data-morph={camera.morph.toFixed(3)}
      data-camera={measure?JSON.stringify(camera):undefined} aria-hidden="true" className="absolute inset-0 size-full pointer-events-none" />
    <canvas ref={fallbackCanvas} aria-hidden="true" hidden={renderer==='webgl2'}
      className="absolute inset-0 size-full pointer-events-none" data-part="surface-fallback" />
    {measure&&renderer==='webgl2'?<button type="button" data-part="map-ui" className="absolute top-2 left-2 bg-cd p-2 type-body-sm text-tx" onClick={()=>{if(!session.simulateContextLoss())setDiagnostic('Проба потери контекста недоступна');}}>Проверить запасной рендер</button>:null}
    {diagnostic?<span role="status" className="absolute top-12 left-2 bg-cd p-2 type-body-sm">{diagnostic}</span>:null}
    {measure&&renderer==='webgl2'?<output data-part="map-ui" aria-label="Производительность карты" className="absolute left-2 bottom-2 bg-cd p-2 type-body-sm text-tx pointer-events-none">
      <span>WebGL2 · DPR {dpr} · morph {camera.morph.toFixed(2)}</span><br/>
      <span>RAF {stats.fps.toFixed(1)} FPS · CPU {stats.cpu.toFixed(2)} мс · GPU {stats.gpu===null?'недоступно':`${stats.gpu.toFixed(2)} мс`}</span><br/>
      <span>{stats.samples} кадров · p95 кадр {stats.frameP95?.toFixed(2)??"—"} мс · CPU {stats.cpuP95?.toFixed(2)??"—"} · GPU {stats.gpuP95?.toFixed(2)??"—"}</span><br/>
      <span>Тайлы {stats.ready} · загрузка {stats.loading} · текстуры/сетки ≈ {(stats.bytes/1048576).toFixed(1)} MiB</span>
    </output>:null}
    {measure&&renderer==='fallback'?<output data-part="map-ui" aria-label="Производительность Canvas карты" className="absolute left-2 bottom-2 bg-cd p-2 type-body-sm text-tx pointer-events-none">
      <span>Canvas2D · DPR {dpr} · morph {camera.morph.toFixed(2)}</span><br/>
      <span>RAF {fallbackStats.fps.toFixed(1)} FPS · CPU {fallbackStats.cpu.toFixed(2)} мс</span><br/>
      <span>{fallbackStats.samples} кадров · p95 кадр {fallbackStats.frameP95?.toFixed(2)??"—"} мс · CPU {fallbackStats.cpuP95?.toFixed(2)??"—"} мс</span><br/>
      <span>Тайлы: {fallbackStats.drawn} из {fallbackStats.ready} готовых</span>
    </output>:null}
  </>;
}
