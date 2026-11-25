import { describe, expect, it } from 'vitest';
import { MAPS } from './maps';
import { PLANET_MASKS } from './planet';
import { tilesAt } from './projection';
import { maskTile, selectSurfaceTiles, surfaceTiles, surfaceTilesWithCoveredFallbacks } from './surfaceTiles';
import { projectSurface, type GeographicExtent, type SurfaceCamera } from './surfaceProjection';
import { mipTextureBytes, type GlTile } from './tilesGl';

const p=MAPS.toril;
const extent:GeographicExtent={lon0:27,lon1:327,latTop:88,latBottom:-61,width:p.width,height:p.height};
const camera:SurfaceCamera={view:{x:8500,y:2600,scale:.05},vp:{w:1200,h:700},globe:{lon:111,lat:30,radius:320},morph:0};

describe('surface tile pyramid',()=>{
  it('диск и промежуточная проекция используют географические box исходной пирамиды',()=>{
    for(const morph of [0,.5,1]){
      const tiles=surfaceTiles(p,extent,{...camera,morph},2,false);
      expect(tiles.length).toBeGreaterThan(0);
      expect(new Set(tiles.map(t=>t.url)).size).toBe(tiles.length);
      for(const t of tiles){
        expect([t.box.x0,t.box.y0,t.box.x1,t.box.y1].every(Number.isFinite)).toBe(true);
        expect(t.box.x0).toBeGreaterThanOrEqual(0);expect(t.box.x1).toBeLessThanOrEqual(p.width);
        expect(t.url).toMatch(/\/maps\/tiles\/toril\/\d+\/\d+_\d+\.webp/);
      }
    }
  });
  it('схема имеет виртуальные LOD выше исходного растра без выдуманных деталей',()=>{
    const flat={...camera,morph:1,view:{...camera.view,scale:8}};
    const schema=surfaceTiles(p,extent,flat,2,true),raster=surfaceTiles(p,extent,flat,2,false);
    expect(Math.max(...schema.map(t=>t.z))).toBeGreaterThan(p.maxZoom);
    expect(Math.max(...raster.map(t=>t.z))).toBe(p.maxZoom);
    expect(schema.every(t=>t.url.startsWith('schema:'))).toBe(true);
  });
  it('удаляет покрытый грубый LOD из Canvas-кадра, сохраняя его до готовности всех видимых детей',()=>{
    const tiny={...p,width:4,height:4,tileSize:1,maxZoom:2};
    const tinyExtent:GeographicExtent={lon0:0,lon1:360,latTop:90,latBottom:-90,width:4,height:4};
    const flat:SurfaceCamera={view:{x:2,y:2,scale:100},vp:{w:800,h:800},globe:{lon:180,lat:0,radius:300},morph:1};
    const parent:GlTile={key:'0/0_0',z:0,url:'schema:0:0_0',box:{x0:0,y0:0,x1:4,y1:4}};
    const children:GlTile[]=Array.from({length:16},(_,i)=>{
      const x=i%4,y=Math.floor(i/4);
      return {key:`2/${x}_${y}`,z:2,url:`schema:2:${x}_${y}`,box:{x0:x,y0:y,x1:x+1,y1:y+1}};
    });
    const mask:GlTile={key:'mask',z:-1,url:'mask:planet:test',box:{x0:0,y0:0,x1:4,y1:4}};
    const tiles=[mask,parent,...children];
    const ready=new Set(tiles.map(tile=>tile.url));
    const fullyCovered=surfaceTilesWithCoveredFallbacks(tiny,tinyExtent,flat,tiles,ready);
    expect(fullyCovered.map(tile=>tile.key)).not.toContain(parent.key);
    expect(fullyCovered.map(tile=>tile.key)).toContain(mask.key);
    const withoutOneChild=surfaceTilesWithCoveredFallbacks(tiny,tinyExtent,flat,tiles.slice(0,-1),ready);
    expect(withoutOneChild.map(tile=>tile.key)).toContain(parent.key);
  });
  it('ограничивает работу при виртуальном LOD 22 и смешанной проекции',()=>{
    const scale=2**(22-p.maxZoom)/2;
    const highZoom={...camera,view:{...camera.view,scale},morph:.5};
    const selected=selectSurfaceTiles(p,extent,highZoom,2,true);
    expect(Math.max(...selected.tiles.map(t=>t.z))).toBe(22);
    expect(selected.tiles.length).toBeGreaterThan(0);
    expect(selected.tiles.length).toBeLessThan(500);
    // The old full-grid path would visit billions of level-22 entries for this source map.
    expect(selected.visitedNodes).toBeLessThan(5000);
  });
  it('сохраняет покрытие всех видимых sampled points на сфере и при смешении',()=>{
    for(const morph of [0,.35,.8]){
      const view={...camera.view,scale:.025};
      const current={...camera,view,morph};
      const selected=selectSurfaceTiles(p,extent,current,1,false);
      const keys=new Set(selected.tiles.map(t=>t.key));
      for(const z of new Set(selected.tiles.map(t=>t.z))){
        const all=tilesAt(p,{w:p.width,h:p.height},{x:p.width/2,y:p.height/2,scale:1},z);
        for(const tile of all){
          const samples=[0,.5,1].flatMap(tx=>[0,.5,1].map(ty=>({
            x:tile.box.x0+(tile.box.x1-tile.box.x0)*tx,
            y:tile.box.y0+(tile.box.y1-tile.box.y0)*ty,
          })));
          const visible=samples.some(point=>{
            const projected=projectSurface(point,extent,current);
            return projected.visible&&projected.x>=0&&projected.x<=current.vp.w&&projected.y>=0&&projected.y<=current.vp.h;
          });
          if(visible) expect(keys.has(tile.key),`missing visible tile ${tile.key} at morph ${morph}`).toBe(true);
        }
      }
    }
  });
  it('маска вне экстента покрывает ровно полный мир, а не растягивает Toril',()=>{
    const t=maskTile(PLANET_MASKS.toril,extent);
    const lon=(x:number)=>extent.lon0+x/extent.width*(extent.lon1-extent.lon0);
    const lat=(y:number)=>extent.latTop+y/extent.height*(extent.latBottom-extent.latTop);
    expect(lon(t.box.x0)).toBeCloseTo(0);expect(lon(t.box.x1)).toBeCloseTo(360);
    expect(lat(t.box.y0)).toBeCloseTo(90);expect(lat(t.box.y1)).toBeCloseTo(-90);
  });
  it('оценка видеопамяти учитывает все mip уровни',()=>{
    expect(mipTextureBytes(1,1)).toBe(4);
    expect(mipTextureBytes(2,2)).toBe(20);
    expect(mipTextureBytes(256,256)).toBe(349524);
  });
});
