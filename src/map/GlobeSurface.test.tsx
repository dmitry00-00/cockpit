import { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Globe, type GlobeVector } from './Globe';
import { MAPS } from './maps';
import { PLANET_MASKS, lonLatToMap, mapToLonLat, mapScaleForGlobe } from './planet';
import type { SurfaceCamera } from './surfaceProjection';
import { visibleBands } from './globeSchema';

vi.hoisted(()=>vi.resetModules());
vi.mock('./SphereSurfaceLayer',()=>({SphereSurfaceLayer:({camera,onAvailable}:{camera:SurfaceCamera;onAvailable:(v:boolean)=>void})=>{
  useEffect(()=>onAvailable(true),[onAvailable]);
  return <div data-testid="surface-frame" data-morph={camera.morph} data-lat={camera.globe.lat} data-radius={camera.globe.radius} data-view={JSON.stringify(camera.view)}/>;
}}));
const mask=PLANET_MASKS.toril,passport=MAPS.toril;
const [lon0,lon1]=mask.source.extent;
const vector:GlobeVector={passport,schema:{land:[],regions:{},roads:[]},mapId:'toril',size:passport,
  toLonLat:p=>mapToLonLat(mask,passport,p),toMap:p=>lonLatToMap(mask,passport,p),
  covers:()=>true,scaleAt:(r,lat)=>mapScaleForGlobe(mask,passport,r,lat),bands:rot=>visibleBands(rot,{lon0,lon1,width:passport.width})};
beforeEach(()=>{
  history.replaceState(null,'','/?mapStats=1');
  vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(640);
  vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(420);
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();history.replaceState(null,'','/');});

it('смешение и наклон меняют общую проекцию без перехода страницы и без вызова onZoomIn',()=>{
  const onZoomIn=vi.fn();
  render(<Globe mask={mask} rot={120} sun={120} vector={vector} onZoomIn={onZoomIn}/>);
  fireEvent.change(screen.getByRole('slider',{name:'Смешение проекций'}),{target:{value:'0.5'}});
  expect(screen.getByTestId('surface-frame')).toHaveAttribute('data-morph','0.5');
  fireEvent.change(screen.getByRole('slider',{name:'Наклон глобуса'}),{target:{value:'75'}});
  expect(screen.getByTestId('surface-frame')).toHaveAttribute('data-lat','75');
  expect(onZoomIn).not.toHaveBeenCalled();
});

it('колесо над ползунком не приближает глобус',()=>{
  const {container}=render(<Globe mask={mask} rot={120} sun={120} vector={vector}/>);
  const view=container.querySelector('[data-part="globe-view"]')!;
  // UI находится снаружи области жестов; этот же guard защищает вложенные map-ui controls.
  fireEvent.wheel(screen.getByRole('slider',{name:'Смешение проекций'}),{deltaY:-100});
  expect(view).toHaveAttribute('data-zoom','1.00');
});

it('не разворачивает отсутствующую часть исходной карты с подменой географического центра',()=>{
  const onZoomIn=vi.fn();
  render(<Globe mask={mask} rot={0} sun={111} vector={{...vector,covers:()=>false}} onZoomIn={onZoomIn}/>);
  const flat=screen.getByRole('button',{name:'Плоская карта'});
  expect(flat).toBeDisabled();
  expect(flat).toHaveAttribute('title','Для этой области нет подробной карты');
  fireEvent.click(flat);
  expect(onZoomIn).not.toHaveBeenCalled();
});


it('возврат начинает с точной плоской камеры, сворачивает её и не вызывает обратный переход',()=>{
  const frames=new Map<number,FrameRequestCallback>();let id=0;
  vi.spyOn(performance,'now').mockReturnValue(1000);
  vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.set(++id,cb);return id;});
  vi.stubGlobal('cancelAnimationFrame',(key:number)=>frames.delete(key));
  const fromFlat={x:15300,y:6700,scale:.025},onZoomIn=vi.fn();
  render(<Globe mask={mask} rot={111} sun={111} focus={{lon:111,lat:20,zoom:1}} fromFlat={fromFlat} vector={vector} onZoomIn={onZoomIn}/>);
  expect(screen.getByTestId('surface-frame')).toHaveAttribute('data-morph','1');
  expect(JSON.parse(screen.getByTestId('surface-frame').getAttribute('data-view')!)).toEqual(fromFlat);
  act(()=>{for(const [key,callback] of [...frames]){frames.delete(key);callback(1320);}});
  expect(screen.getByTestId('surface-frame')).toHaveAttribute('data-morph','0');
  expect(onZoomIn).not.toHaveBeenCalled();
});

it('при уменьшенном движении колесо сразу ставит конечный масштаб без кадров анимации',()=>{
  vi.stubGlobal('matchMedia',()=>({matches:true}));
  const raf=vi.fn();vi.stubGlobal('requestAnimationFrame',raf);
  const {container}=render(<Globe mask={mask} rot={111} sun={111} vector={vector}/>);
  const view=container.querySelector('[data-part="globe-view"]')!;
  fireEvent.wheel(view,{deltaY:-100,clientX:320,clientY:210});
  expect(view).toHaveAttribute('data-zoom','1.20');
  expect(raf).not.toHaveBeenCalled();
});

it('при уменьшенном движении передаёт финальную плоскую камеру после её commit',()=>{
  vi.stubGlobal('matchMedia',()=>({matches:true}));
  const frames:FrameRequestCallback[]=[];
  vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.push(cb);return frames.length;});
  const onZoomIn=vi.fn();
  render(<Globe mask={mask} rot={111} sun={111} vector={vector} onZoomIn={onZoomIn}/>);
  fireEvent.click(screen.getByRole('button',{name:'Плоская карта'}));
  expect(screen.getByTestId('surface-frame')).toHaveAttribute('data-morph','1');
  expect(onZoomIn).not.toHaveBeenCalled();
  expect(frames).toHaveLength(1);
  act(()=>{frames.shift()!(1000);});
  expect(onZoomIn).toHaveBeenCalledWith(expect.objectContaining({radiusPx:Number(screen.getByTestId('surface-frame').getAttribute('data-radius'))}));
});

it('начало drag останавливает wheel RAF и следующий zoom продолжается с текущего масштаба',()=>{
  class Pointer extends MouseEvent { pointerId=1; }
  vi.stubGlobal('PointerEvent',Pointer);
  const frames=new Map<number,FrameRequestCallback>();let id=0;
  vi.spyOn(performance,'now').mockReturnValue(1000);
  vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.set(++id,cb);return id;});
  vi.stubGlobal('cancelAnimationFrame',(key:number)=>frames.delete(key));
  const {container}=render(<Globe mask={mask} rot={111} sun={111} vector={vector}/>);
  const view=container.querySelector('[data-part="globe-view"]')!;
  Object.assign(view,{setPointerCapture:vi.fn(),releasePointerCapture:vi.fn()});
  fireEvent.wheel(view,{deltaY:-100,clientX:320,clientY:210});
  act(()=>{for(const [key,cb] of [...frames]){frames.delete(key);cb(1100);}});
  expect(frames.size).toBe(1);
  fireEvent.pointerDown(view,{button:0,clientX:320,clientY:210});
  fireEvent.pointerMove(view,{clientX:350,clientY:230});
  fireEvent.wheel(view,{deltaY:-100,clientX:320,clientY:210});
  expect(frames.size).toBe(0);
  fireEvent.pointerUp(view,{clientX:350,clientY:230});
  expect(frames.size).toBe(0);
  expect(Number(screen.getByTestId('surface-frame').getAttribute('data-lat'))).toBeGreaterThan(0);
  fireEvent.wheel(view,{deltaY:-100,clientX:320,clientY:210});
  act(()=>{for(const [key,cb] of [...frames]){frames.delete(key);cb(1220);}});
  expect(view).toHaveAttribute('data-zoom','1.40');
});
