import { describe,expect,it } from 'vitest';
import { surfaceFromFlat } from './surfaceTransition';
import { projectSurface, type GeographicExtent, type SurfaceCamera } from './surfaceProjection';
import { toScreen } from './projection';
const extent:GeographicExtent={lon0:27,lon1:327,latTop:88,latBottom:-61,width:30600,height:13400};
const target:SurfaceCamera={vp:{w:1200,h:700},view:{x:8500,y:2600,scale:.04},globe:{lon:111,lat:30,radius:320},morph:0};
const incoming={x:15300,y:6700,scale:.025};
describe('flat → sphere handoff',()=>{
  it('starts with the exact incoming flat projection, even when center and scale differ',()=>{
    const first=surfaceFromFlat(target,incoming,0);
    expect(first.view).toEqual(incoming);expect(first.morph).toBe(1);
    for(const point of [{x:0,y:0},{x:8500,y:2600},{x:30600,y:13400}]){
      const actual=projectSurface(point,extent,first),flat=toScreen(incoming,target.vp,point);
      expect(actual.x).toBeCloseTo(flat.x,9);expect(actual.y).toBeCloseTo(flat.y,9);
    }
    expect(surfaceFromFlat(target,incoming,1)).toBe(target);
  });
  it('moves continuously through finite cameras without changing the viewport',()=>{
    let previous=surfaceFromFlat(target,incoming,0);
    for(let i=1;i<=100;i++){
      const next=surfaceFromFlat(target,incoming,i/100);
      expect(next.vp).toBe(target.vp);
      expect(next.morph).toBeLessThan(previous.morph);
      const a=projectSurface({x:15000,y:6500},extent,previous),b=projectSurface({x:15000,y:6500},extent,next);
      expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeLessThan(15);
      expect([b.x,b.y,next.view.scale,next.globe.radius].every(Number.isFinite)).toBe(true);
      previous=next;
    }
  });
});
