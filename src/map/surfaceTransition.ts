import type { MapView } from './projection';
import type { SurfaceCamera } from './surfaceProjection';

/** Reverse handoff starts at the exact flat camera, then bends into the target sphere.
 * Incoming map center/scale may differ from the sphere's constrained latitude/zoom. */
export function surfaceFromFlat(target: SurfaceCamera, incoming: MapView, progress: number): SurfaceCamera {
  const t=Math.max(0,Math.min(1,progress));
  if(t===1)return target;
  const blend=(a:number,b:number)=>a+(b-a)*t;
  const startRadius=target.globe.radius*incoming.scale/target.view.scale;
  return {
    ...target,
    view:{x:blend(incoming.x,target.view.x),y:blend(incoming.y,target.view.y),scale:blend(incoming.scale,target.view.scale)},
    globe:{...target.globe,radius:blend(startRadius,target.globe.radius)},
    morph:blend(1,target.morph),
  };
}
