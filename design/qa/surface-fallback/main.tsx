import { createRoot } from 'react-dom/client';
import '@fontsource/forum';
import '@fontsource/pt-sans';
import '../../../src/styles/index.css';
import { useEffect, useState } from 'react';
import { Globe, type GlobeVector } from '../../../src/map/Globe';
import { MAPS } from '../../../src/map/maps';
import { PLANET_MASKS, mapToLonLat, lonLatToMap, mapScaleForGlobe } from '../../../src/map/planet';
import { visibleBands } from '../../../src/map/globeSchema';
import { parseSchema, type MapSchema } from '../../../src/map/schema';
import { SurfaceHostProvider } from '../../../src/map/SurfaceHost';

function Qa(){
  const [schema,setSchema]=useState<MapSchema|null>(null);
  const passport=MAPS.toril,mask=PLANET_MASKS.toril;
  useEffect(()=>{let live=true;void fetch('/maps/tiles/toril/schema.json').then(r=>r.json()).then(data=>{if(live)setSchema(parseSchema(data));});return()=>{live=false;};},[]);
  if(!schema)return <main className="min-h-screen grid place-items-center bg-wl text-tx">Загружаю схему Toril…</main>;
  const vector:GlobeVector={passport,schema,mapId:'toril',size:passport,
    toLonLat:p=>mapToLonLat(mask,passport,p),toMap:p=>lonLatToMap(mask,passport,p),
    covers:(lon,lat)=>{const [lon0,lon1,top,bottom]=mask.source.extent;return lon>=lon0&&lon<=lon1&&lat<=top&&lat>=bottom;},
    scaleAt:(radius,lat)=>mapScaleForGlobe(mask,passport,radius,lat),
    bands:rot=>visibleBands(rot,{lon0:mask.source.extent[0]!,lon1:mask.source.extent[1]!,width:passport.width})};
  return <SurfaceHostProvider><div style={{height:"100vh",width:"100vw",display:"flex"}}><Globe className="flex-1" mask={mask} rot={111} sun={111} vector={vector} n={80} /></div></SurfaceHostProvider>;
}

createRoot(document.getElementById('root')!).render(<Qa/>);
