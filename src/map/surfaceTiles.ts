import { levelSize, tilesAt, type MapPassport, type TileRect } from './projection';
import { projectSurface, type GeographicExtent, type SurfaceCamera } from './surfaceProjection';
import type { GlTile, TileImage } from './tilesGl';
import { loadTileImage } from './tilesGl';
import type { MapSchema } from './schema';
import type { PlanetMask } from './planet';
import { fillSchema, schemaPaths } from './schemaDraw';

export interface SurfaceTileSelection {
  tiles: GlTile[];
  /** Number of hierarchy nodes visited across the selected detail and fallback levels. */
  visitedNodes: number;
}

function tileRect(passport: MapPassport, z: number, tx: number, ty: number): TileRect {
  const k = 2 ** (passport.maxZoom - z);
  const span = passport.tileSize * k;
  const box = {
    x0: tx * span,
    y0: ty * span,
    x1: Math.min(passport.width, (tx + 1) * span),
    y1: Math.min(passport.height, (ty + 1) * span),
  };
  return {
    key: `${z}/${tx}_${ty}`,
    z,
    url: `${passport.tiles}/${z}/${tx}_${ty}.${passport.format}`,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    box,
  };
}

/**
 * Conservative screen/front-face test for a source-map rectangle. The projected centre is expanded by
 * a Lipschitz bound: angular travel bounds the spherical component, while source-pixel travel bounds
 * the flat component. This remains safe at seams, at the limb, and between the two projections.
 */
function mayIntersectSurface(box: TileRect['box'], extent: GeographicExtent, camera: SurfaceCamera): boolean {
  const center = projectSurface({ x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 }, extent, camera);
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(center.front)) return false;

  const morph = Number.isFinite(camera.morph) ? Math.min(1, Math.max(0, camera.morph)) : 0;
  const halfX = (box.x1 - box.x0) / 2;
  const halfY = (box.y1 - box.y0) / 2;
  const lonPerPixel = Math.abs((extent.lon1 - extent.lon0) / extent.width) * Math.PI / 180;
  const latPerPixel = Math.abs((extent.latBottom - extent.latTop) / extent.height) * Math.PI / 180;
  const angularRadius = halfX * lonPerPixel + halfY * latPerPixel;
  const frontRadius = (1 - morph) * angularRadius;
  if (center.front + frontRadius < -1e-9) return false;

  const curvedRadius = (1 - morph) * camera.globe.radius * angularRadius;
  const flatRadius = morph * Math.abs(camera.view.scale) * (halfX + halfY);
  const margin = curvedRadius + flatRadius + 1e-4;
  return center.x + margin >= 0 && center.y + margin >= 0
    && center.x - margin <= camera.vp.w && center.y - margin <= camera.vp.h;
}

/**
 * Enumerate a curved/mixed level by descending only into visible hierarchy branches. visitedNodes is
 * exposed for deterministic bounded-work tests and diagnostics; flat mode keeps the existing viewport query.
 */
export function selectSurfaceTiles(
  passport: MapPassport,
  extent: GeographicExtent,
  camera: SurfaceCamera,
  dpr: number,
  schema: boolean,
): SurfaceTileSelection {
  const morph = Number.isFinite(camera.morph) ? Math.min(1, Math.max(0, camera.morph)) : 0;
  const flatScale = Math.abs(camera.view.scale);
  const lonPerPixel = Math.abs((extent.lon1 - extent.lon0) / extent.width) * Math.PI / 180;
  const latPerPixel = Math.abs((extent.latBottom - extent.latTop) / extent.height) * Math.PI / 180;
  const sphereScale = camera.globe.radius * Math.max(lonPerPixel, latPerPixel);
  const effectiveScale = morph === 1
    ? flatScale
    : morph * flatScale + (1 - morph) * sphereScale;
  const z = Math.max(0, Math.min(schema ? 22 : passport.maxZoom,
    Math.ceil(passport.maxZoom + Math.log2(Math.max(Number.MIN_VALUE, effectiveScale * dpr)))));
  const levels = z >= 2 ? [z-2,z] : [0,...(z ? [z] : [])];
  let visitedNodes = 0;
  const all = levels.flatMap(level => {
    if (morph === 1) {
      return tilesAt(passport, camera.vp, camera.view, level).map(t => ({
        ...t,
        url: schema ? `schema:${level}:${t.key.split('/')[1]}` : t.url,
      }));
    }

    const selected: TileRect[] = [];
    const root = tileRect(passport, 0, 0, 0);
    const rootGrid = levelSize(passport, 0);
    const rootCols = Math.ceil(rootGrid.w / passport.tileSize);
    const rootRows = Math.ceil(rootGrid.h / passport.tileSize);
    const visit = (nodeLevel: number, tx: number, ty: number): void => {
      const cols = Math.ceil(levelSize(passport, nodeLevel).w / passport.tileSize);
      const rows = Math.ceil(levelSize(passport, nodeLevel).h / passport.tileSize);
      if (tx >= cols || ty >= rows) return;
      visitedNodes++;
      const tile = nodeLevel === 0 && rootCols === 1 && rootRows === 1
        ? root
        : tileRect(passport, nodeLevel, tx, ty);
      if (!mayIntersectSurface(tile.box, extent, camera)) return;
      if (nodeLevel === level) {
        selected.push(tile);
        return;
      }
      const childLevel = nodeLevel + 1;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) visit(childLevel, tx * 2 + dx, ty * 2 + dy);
      }
    };
    for (let ty = 0; ty < rootRows; ty++) for (let tx = 0; tx < rootCols; tx++) visit(0, tx, ty);
    return selected.map(t => ({
      ...t,
      url: schema ? `schema:${level}:${t.key.split('/')[1]}` : t.url,
    }));
  });
  return { tiles: all, visitedNodes };
}

/** The same pyramid covers either a curved surface or the exact flat viewport. */
export function surfaceTiles(passport: MapPassport, extent: GeographicExtent, camera: SurfaceCamera, dpr: number, schema: boolean): GlTile[] {
  return selectSurfaceTiles(passport, extent, camera, dpr, schema).tiles;
}

/**
 * Keep a coarse tile as a loading fallback until every selected, visible tile in the finest LOD
 * covering it is ready. Once covered, drawing the coarse image underneath only duplicates the same
 * projected area and costs a full second mesh pass on Canvas2D.
 */
export function surfaceTilesWithCoveredFallbacks(
  passport: MapPassport,
  extent: GeographicExtent,
  camera: SurfaceCamera,
  tiles: readonly GlTile[],
  readyUrls: ReadonlySet<string>,
): GlTile[] {
  const surface=tiles.filter(tile=>!tile.url.startsWith('mask:'));
  const detailLevel=Math.max(-1,...surface.map(tile=>tile.z));
  if(detailLevel<0)return [...tiles];
  const byKey=new Map(surface.map(tile=>[tile.key,tile]));
  const covered=(parent:GlTile):boolean=>{
    const delta=detailLevel-parent.z;
    if(delta<=0||delta>6)return false;
    const span=passport.tileSize*2**(passport.maxZoom-detailLevel);
    if(!(span>0))return false;
    const minX=Math.floor(parent.box.x0/span),maxX=Math.ceil(parent.box.x1/span);
    const minY=Math.floor(parent.box.y0/span),maxY=Math.ceil(parent.box.y1/span);
    let visibleChildren=0;
    for(let ty=minY;ty<maxY;ty++)for(let tx=minX;tx<maxX;tx++){
      const box={x0:tx*span,y0:ty*span,x1:Math.min(passport.width,(tx+1)*span),y1:Math.min(passport.height,(ty+1)*span)};
      if(box.x0>=parent.box.x1||box.x1<=parent.box.x0||box.y0>=parent.box.y1||box.y1<=parent.box.y0)continue;
      if(!mayIntersectSurface(box,extent,camera))continue;
      visibleChildren++;
      const child=byKey.get(`${detailLevel}/${tx}_${ty}`);
      if(!child||!readyUrls.has(child.url))return false;
    }
    return visibleChildren>0;
  };
  return tiles.filter(tile=>tile.url.startsWith('mask:')||tile.z===detailLevel||!readyUrls.has(tile.url)||!covered(tile));
}

export function maskTile(mask: PlanetMask, extent: GeographicExtent): GlTile {
  return {key:'mask',z:-1,url:`mask:planet:${mask.id}`,box:{
    x0:-extent.lon0/(extent.lon1-extent.lon0)*extent.width,
    x1:(360-extent.lon0)/(extent.lon1-extent.lon0)*extent.width,
    y0:(90-extent.latTop)/(extent.latBottom-extent.latTop)*extent.height,
    y1:(-90-extent.latTop)/(extent.latBottom-extent.latTop)*extent.height,
  }};
}

/** Vector data is rasterized once per requested LOD tile, never on every animation frame.
 * The geometry stays vector-derived at any zoom: virtual schema levels may exceed raster maxZoom.
 * Jobs yield between tiles so initial warming does not block dragging/controls in one long loop. */
export function surfaceTileLoader(passport: MapPassport, schema: MapSchema, mask: PlanetMask, color:(token:string)=>string, dpr:number) {
  const paths=schemaPaths(schema);
  if (!paths) throw new Error('Vector paths unavailable');
  const queue: {url:string;signal:AbortSignal;resolve:(v:TileImage)=>void;reject:(e:unknown)=>void}[]=[];
  let scheduled=false, disposed=false;
  const abortError=()=>new DOMException('Aborted','AbortError');
  const paint=(url:string):HTMLCanvasElement=>{
    const cv=document.createElement('canvas');
    if(url.startsWith('mask:')){
      cv.width=mask.w;cv.height=mask.h;
      const ctx=cv.getContext('2d');if(!ctx)throw new Error('2D unavailable');
      for(let y=0;y<mask.h;y++)for(let x=0;x<mask.w;x++){ctx.fillStyle=color(`terrain-${mask.grid[y]?.[x]??'o'}`);ctx.fillRect(x,y,1,1);}
      return cv;
    }
    const match=/^schema:(\d+):(\d+)_(\d+)$/.exec(url);if(!match)throw new Error('Invalid schema tile');
    const z=Number(match[1]),tx=Number(match[2]),ty=Number(match[3]);
    const span=passport.tileSize*2**(passport.maxZoom-z),x0=tx*span,y0=ty*span;
    const width=Math.min(span,passport.width-x0),height=Math.min(span,passport.height-y0);
    if(width<=0||height<=0)throw new Error('Schema tile outside map');
    const k=passport.tileSize/span;
    cv.width=Math.max(1,Math.round(width*k));cv.height=Math.max(1,Math.round(height*k));
    const ctx=cv.getContext('2d');if(!ctx)throw new Error('2D unavailable');
    ctx.fillStyle=color('terrain-o');ctx.fillRect(0,0,cv.width,cv.height);
    ctx.setTransform(k,0,0,k,-x0*k,-y0*k);
    fillSchema(ctx,paths,color,dpr/k,dpr/k);
    ctx.strokeStyle=color('gd');ctx.lineWidth=dpr/k;ctx.stroke(paths.roads);
    return cv;
  };
  const tick=()=>{
    scheduled=false;
    const start=performance.now();let count=0;
    while(queue.length && count<2 && performance.now()-start<6){
      const job=queue.shift()!;
      if(disposed||job.signal.aborted){job.reject(abortError());continue;}
      try{job.resolve(paint(job.url));}catch(e){job.reject(e);}
      count++;
    }
    if(queue.length&&!disposed)schedule();
  };
  const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(tick);};
  return {
    load:(url:string,signal:AbortSignal):Promise<TileImage>=>{
      if(disposed||signal.aborted)return Promise.reject(abortError());
      if(!url.startsWith('schema:')&&!url.startsWith('mask:'))return loadTileImage(url,signal);
      return new Promise((resolve,reject)=>{queue.push({url,signal,resolve,reject});schedule();});
    },
    dispose:()=>{disposed=true;while(queue.length)queue.shift()!.reject(abortError());},
  };
}
