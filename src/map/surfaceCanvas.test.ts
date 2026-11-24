import { describe, expect, it } from 'vitest';
import { affineFromTriangles, clipSurfaceTriangle, drawSurfaceTile, type SurfaceVertex } from './surfaceCanvas';
import type { GeographicExtent, SurfaceCamera } from './surfaceProjection';
import type { GlTile, TileImage } from './tilesGl';

const vertex=(x:number,y:number,front:number):SurfaceVertex=>({
  source:{x,y},
  screen:{x:2*x+3*y+5,y:-x+4*y+7},
  front,
  longitude:x,
});

describe('Canvas surface fallback geometry',()=>{
  it('builds a source-to-screen affine transform through all three control points',()=>{
    const source=[{x:1,y:2},{x:8,y:2},{x:3,y:9}] as const;
    const target=[{x:11,y:14},{x:25,y:7},{x:31,y:29}] as const;
    const transform=affineFromTriangles(source,target);
    expect(transform).not.toBeNull();
    for(let i=0;i<3;i++){
      const p=source[i]!,q=target[i]!;
      const [a,b,c,d,e,f]=transform!;
      expect(a*p.x+c*p.y+e).toBeCloseTo(q.x,8);
      expect(b*p.x+d*p.y+f).toBeCloseTo(q.y,8);
    }
  });

  it('rejects degenerate source triangles',()=>{
    expect(affineFromTriangles(
      [{x:0,y:0},{x:1,y:1},{x:2,y:2}],
      [{x:0,y:0},{x:1,y:1},{x:2,y:2}],
    )).toBeNull();
  });

  it('keeps front-facing triangles and removes back-facing triangles',()=>{
    const front=[vertex(0,0,1),vertex(4,0,1),vertex(0,4,1)] as const;
    const back=[vertex(0,0,-1),vertex(4,0,-1),vertex(0,4,-1)] as const;
    expect(clipSurfaceTriangle(front)).toEqual(front);
    expect(clipSurfaceTriangle(back)).toEqual([]);
  });

  it('clips a crossing triangle at the front-sheet boundary',()=>{
    const clipped=clipSurfaceTriangle([vertex(0,0,1),vertex(4,0,-1),vertex(0,4,1)]);
    expect(clipped).toHaveLength(4);
    expect(clipped.every(point=>point.front>=0)).toBe(true);
    expect(clipped.filter(point=>point.front===0)).toHaveLength(2);
    expect(clipped.find(point=>point.front===0)?.source).toEqual({x:2,y:0});
  });

  it('uses a denser mesh for the world mask than for ordinary image tiles',()=>{
    const calls:{count:number}={count:0};
    const ctx={save(){},restore(){},setTransform(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},clip(){},
      drawImage(){calls.count++;},fill(){},clearRect(){}} as unknown as CanvasRenderingContext2D;
    const image={width:360,height:180} as TileImage;
    const extent:GeographicExtent={lon0:0,lon1:360,latTop:90,latBottom:-90,width:360,height:180};
    const camera:SurfaceCamera={view:{x:180,y:90,scale:1},vp:{w:360,h:360},globe:{lon:180,lat:0,radius:170},morph:0};
    const tile=(url:string):GlTile=>({key:url,z:0,url,box:{x0:0,y0:0,x1:360,y1:180}});
    drawSurfaceTile(ctx,image,tile('raster:tile'),extent,camera,1,0);
    const imageCalls=calls.count;
    calls.count=0;
    drawSurfaceTile(ctx,image,tile('mask:planet:test'),extent,camera,1,0);
    expect(imageCalls).toBeGreaterThan(0);
    expect(calls.count).toBeGreaterThan(imageCalls*4);
  });

  it('uses one quad for a high-detail tile whose projected area is only a few pixels',()=>{
    const calls={count:0};
    const ctx={save(){},restore(){},setTransform(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},clip(){},
      drawImage(){calls.count++;},fill(){},clearRect(){}} as unknown as CanvasRenderingContext2D;
    const image={width:256,height:256} as TileImage;
    const extent:GeographicExtent={lon0:0,lon1:360,latTop:90,latBottom:-90,width:36000,height:18000};
    const camera:SurfaceCamera={view:{x:18000,y:9000,scale:1},vp:{w:360,h:360},globe:{lon:180,lat:0,radius:170},morph:0};
    const tile:GlTile={key:'22/0_0',z:22,url:'schema:22:0_0',box:{x0:17998,y0:8998,x1:18002,y1:9002}};
    drawSurfaceTile(ctx,image,tile,extent,camera,1,0);
    expect(calls.count).toBe(2);
  });
});
