import { projectSurface, type GeographicExtent, type SurfaceCamera } from './surfaceProjection';
import type { MapPassport } from './projection';
import type { MapSchema } from './schema';
import type { PlanetMask } from './planet';
import { surfaceTileLoader, surfaceTilesWithCoveredFallbacks } from './surfaceTiles';
import type { GlTile, TileImage } from './tilesGl';

export interface SurfaceVertex {
  source: { x: number; y: number };
  screen: { x: number; y: number };
  front: number;
  longitude: number;
}

export type CanvasAffine = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

/** Affine map from three image-space points to their corresponding screen-space points. */
export function affineFromTriangles(source: readonly [SurfaceVertex['source'], SurfaceVertex['source'], SurfaceVertex['source']], screen: readonly [SurfaceVertex['screen'], SurfaceVertex['screen'], SurfaceVertex['screen']]): CanvasAffine | null {
  const [p1,p2,p3]=source;
  const denominator=p1.x*(p2.y-p3.y)+p2.x*(p3.y-p1.y)+p3.x*(p1.y-p2.y);
  if(!Number.isFinite(denominator)||Math.abs(denominator)<1e-12)return null;
  const [q1,q2,q3]=screen;
  const a=(q1.x*(p2.y-p3.y)+q2.x*(p3.y-p1.y)+q3.x*(p1.y-p2.y))/denominator;
  const c=(q1.x*(p3.x-p2.x)+q2.x*(p1.x-p3.x)+q3.x*(p2.x-p1.x))/denominator;
  const e=(q1.x*(p2.x*p3.y-p3.x*p2.y)+q2.x*(p3.x*p1.y-p1.x*p3.y)+q3.x*(p1.x*p2.y-p2.x*p1.y))/denominator;
  const b=(q1.y*(p2.y-p3.y)+q2.y*(p3.y-p1.y)+q3.y*(p1.y-p2.y))/denominator;
  const d=(q1.y*(p3.x-p2.x)+q2.y*(p1.x-p3.x)+q3.y*(p2.x-p1.x))/denominator;
  const f=(q1.y*(p2.x*p3.y-p3.x*p2.y)+q2.y*(p3.x*p1.y-p1.x*p3.y)+q3.y*(p1.x*p2.y-p2.x*p1.y))/denominator;
  return [a,b,c,d,e,f].every(Number.isFinite)?[a,b,c,d,e,f]:null;
}

/** Clip a projected triangle to the front sheet; intersections are linearly interpolated across its edge. */
export function clipSurfaceTriangle(triangle: readonly [SurfaceVertex,SurfaceVertex,SurfaceVertex]): SurfaceVertex[] {
  const out:SurfaceVertex[]=[];
  let previous=triangle[triangle.length-1]!;
  let previousInside=previous.front>=0;
  for(const current of triangle){
    const currentInside=current.front>=0;
    if(currentInside!==previousInside){
      const t=previous.front/(previous.front-current.front);
      out.push({
        source:{x:previous.source.x+(current.source.x-previous.source.x)*t,y:previous.source.y+(current.source.y-previous.source.y)*t},
        screen:{x:previous.screen.x+(current.screen.x-previous.screen.x)*t,y:previous.screen.y+(current.screen.y-previous.screen.y)*t},
        front:0,
        longitude:previous.longitude+(current.longitude-previous.longitude)*t,
      });
    }
    if(currentInside)out.push(current);
    previous=current;
    previousInside=currentInside;
  }
  return out;
}

function nightAmount(longitude:number,sun:number,morph:number):number {
  const cosine=Math.cos((longitude-sun)*Math.PI/180);
  const t=Math.max(0,Math.min(1,(cosine+0.02)/0.04));
  const daylight=t*t*(3-2*t);
  return 0.62*(1-daylight)*(1-Math.max(0,Math.min(1,morph)));
}

function drawTriangle(ctx:CanvasRenderingContext2D,image:TileImage,vertices:readonly [SurfaceVertex,SurfaceVertex,SurfaceVertex],dpr:number,sun:number,morph:number):boolean {
  const clipped=clipSurfaceTriangle(vertices);
  if(clipped.length<3)return false;
  const source=clipped.map(point=>point.source),screen=clipped.map(point=>point.screen);
  const affine=(index:number):CanvasAffine|null=>affineFromTriangles(
    [source[0]!,source[index]!,source[index+1]!],
    [screen[0]!,screen[index]!,screen[index+1]!],
  );
  let painted=false;
  for(let i=1;i<clipped.length-1;i++){
    const points=[clipped[0]!,clipped[i]!,clipped[i+1]!] as const;
    const transform=affine(i);
    if(!transform)continue;
    ctx.save();
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.beginPath();
    ctx.moveTo(points[0].screen.x,points[0].screen.y);
    ctx.lineTo(points[1].screen.x,points[1].screen.y);
    ctx.lineTo(points[2].screen.x,points[2].screen.y);
    ctx.closePath();
    ctx.clip();
    const [a,b,c,d,e,f]=transform;
    ctx.setTransform(dpr*a,dpr*b,dpr*c,dpr*d,dpr*e,dpr*f);
    ctx.drawImage(image as CanvasImageSource,0,0);
    const shade=nightAmount((points[0].longitude+points[1].longitude+points[2].longitude)/3,sun,morph);
    if(shade>0){
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.globalAlpha=shade;
      ctx.fillStyle='#000';
      ctx.fill();
    }
    ctx.restore();
    painted=true;
  }
  return painted;
}

const IMAGE_STEPS=8;
const MASK_STEPS=32;
const MAX_SCREEN_EDGE_PER_SEGMENT=64;
const MAX_ANGLE_PER_SEGMENT=Math.PI/16;

function imageMeshSteps(tile:GlTile,extent:GeographicExtent,camera:SurfaceCamera):number {
  const box=tile.box;
  const corners=[
    projectSurface({x:box.x0,y:box.y0},extent,camera),
    projectSurface({x:box.x1,y:box.y0},extent,camera),
    projectSurface({x:box.x1,y:box.y1},extent,camera),
    projectSurface({x:box.x0,y:box.y1},extent,camera),
  ];
  const finite=corners.filter(point=>Number.isFinite(point.x)&&Number.isFinite(point.y));
  const screenSpan=finite.length?Math.max(
    Math.max(...finite.map(point=>point.x))-Math.min(...finite.map(point=>point.x)),
    Math.max(...finite.map(point=>point.y))-Math.min(...finite.map(point=>point.y)),
  ):Infinity;
  const angularSpan=Math.abs((extent.lon1-extent.lon0)/extent.width*(box.x1-box.x0))
    +Math.abs((extent.latBottom-extent.latTop)/extent.height*(box.y1-box.y0));
  const byScreen=Math.ceil(screenSpan/MAX_SCREEN_EDGE_PER_SEGMENT);
  const byAngle=Math.ceil(angularSpan*Math.PI/180/MAX_ANGLE_PER_SEGMENT);
  return Math.max(1,Math.min(IMAGE_STEPS,Math.max(byScreen,byAngle)));
}

/** Draw a single source tile through the shared sphere/flat/mixed projection using a bounded affine mesh. */
export function drawSurfaceTile(ctx:CanvasRenderingContext2D,image:TileImage,tile:GlTile,extent:GeographicExtent,camera:SurfaceCamera,dpr:number,sun:number,steps?:number):number {
  const imageWidth=Number((image as ImageBitmap).width||(image as HTMLImageElement).naturalWidth);
  const imageHeight=Number((image as ImageBitmap).height||(image as HTMLImageElement).naturalHeight);
  const boxWidth=tile.box.x1-tile.box.x0,boxHeight=tile.box.y1-tile.box.y0;
  if(imageWidth<=0||imageHeight<=0||boxWidth<=0||boxHeight<=0)return 0;
  // The flat endpoint is affine, so a single quad is exact and avoids unnecessary Canvas draw calls.
  const meshSteps=camera.morph>=1-1e-9?1:steps??(tile.url.startsWith('mask:')?MASK_STEPS:imageMeshSteps(tile,extent,camera));
  const vertices:SurfaceVertex[][]=[];
  for(let y=0;y<=meshSteps;y++){
    const row:SurfaceVertex[]=[];
    for(let x=0;x<=meshSteps;x++){
      const sourceX=tile.box.x0+boxWidth*x/meshSteps;
      const sourceY=tile.box.y0+boxHeight*y/meshSteps;
      const point=projectSurface({x:sourceX,y:sourceY},extent,camera);
      row.push({
        source:{x:(sourceX-tile.box.x0)/boxWidth*imageWidth,y:(sourceY-tile.box.y0)/boxHeight*imageHeight},
        screen:{x:point.x,y:point.y},
        front:point.front,
        longitude:extent.lon0+(sourceX/extent.width)*(extent.lon1-extent.lon0),
      });
    }
    vertices.push(row);
  }
  let painted=0;
  for(let y=0;y<meshSteps;y++)for(let x=0;x<meshSteps;x++){
    const tl=vertices[y]![x]!,tr=vertices[y]![x+1]!,bl=vertices[y+1]![x]!,br=vertices[y+1]![x+1]!;
    if(drawTriangle(ctx,image,[tl,tr,br],dpr,sun,camera.morph))painted++;
    if(drawTriangle(ctx,image,[tl,br,bl],dpr,sun,camera.morph))painted++;
  }
  return painted;
}

export class CanvasSurfaceRenderer {
  private readonly context:CanvasRenderingContext2D;
  private readonly loader:ReturnType<typeof surfaceTileLoader>;
  private readonly ready=new Map<string,TileImage>();
  private readonly pending=new Map<string,AbortController>();
  private tiles:readonly GlTile[]=[];
  private drawTiles:readonly GlTile[]=[];
  private camera:SurfaceCamera|null=null;
  private sun=0;
  private dpr=1;
  private disposed=false;

  constructor(
    private readonly canvas:HTMLCanvasElement,
    private readonly passport:MapPassport,
    schema:MapSchema,
    mask:PlanetMask,
    private readonly extent:GeographicExtent,
    color:(token:string)=>string,
    dpr:number,
  ) {
    const context=canvas.getContext('2d');
    if(!context)throw new Error('Canvas2D недоступен');
    this.context=context;
    this.loader=surfaceTileLoader(passport,schema,mask,color,dpr);
  }

  update(camera:SurfaceCamera,tiles:readonly GlTile[],dpr:number,sun:number):void {
    if(this.disposed)return;
    this.camera=camera;
    this.tiles=tiles;
    this.dpr=dpr;
    this.sun=sun;
    this.selectDrawTiles();
    const desired=new Map(this.tiles.map(tile=>[tile.url,tile]));
    for(const [url,controller] of this.pending)if(!desired.has(url)){controller.abort();this.pending.delete(url);}
    for(const [url,image] of this.ready)if(!desired.has(url)){image.close?.();this.ready.delete(url);}
    const width=Math.max(1,Math.round(camera.vp.w*dpr)),height=Math.max(1,Math.round(camera.vp.h*dpr));
    if(this.canvas.width!==width)this.canvas.width=width;
    if(this.canvas.height!==height)this.canvas.height=height;
    this.draw();
    for(const tile of desired.values())if(!this.ready.has(tile.url)&&!this.pending.has(tile.url))this.load(tile);
  }

  private load(tile:GlTile):void {
    const controller=new AbortController();
    this.pending.set(tile.url,controller);
    void this.loader.load(tile.url,controller.signal).then(image=>{
      this.pending.delete(tile.url);
      if(this.disposed||controller.signal.aborted||!this.tiles.some(current=>current.url===tile.url)){image.close?.();return;}
      this.ready.set(tile.url,image);
      this.selectDrawTiles();
      this.draw();
    }).catch(()=>{
      this.pending.delete(tile.url);
      if(!this.disposed)this.draw();
    });
  }

  private selectDrawTiles():void {
    if(!this.camera){this.drawTiles=[];return;}
    this.drawTiles=surfaceTilesWithCoveredFallbacks(this.passport,this.extent,this.camera,this.tiles,new Set(this.ready.keys()));
  }

  private draw():number {
    const camera=this.camera,ctx=this.context;
    if(this.disposed||!camera)return 0;
    const started=performance.now();
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    ctx.clearRect(0,0,camera.vp.w,camera.vp.h);
    for(const tile of this.drawTiles){
      const image=this.ready.get(tile.url);
      if(image)drawSurfaceTile(ctx,image,tile,this.extent,camera,this.dpr,this.sun);
    }
    return performance.now()-started;
  }

  /** Redraw the current frame once and return synchronous Canvas CPU time for opt-in diagnostics. */
  drawFrame():number { return this.draw(); }

  tileCounts():{drawn:number;ready:number} {
    return {drawn:this.drawTiles.filter(tile=>this.ready.has(tile.url)).length,ready:this.tiles.filter(tile=>this.ready.has(tile.url)).length};
  }

  dispose():void {
    this.disposed=true;
    for(const controller of this.pending.values())controller.abort();
    this.pending.clear();
    for(const image of this.ready.values())image.close?.();
    this.ready.clear();
    this.loader.dispose();
    this.context.clearRect(0,0,this.canvas.width,this.canvas.height);
  }

}

