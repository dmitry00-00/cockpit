import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inspectArtAlpha } from './inspect-art-alpha.mjs';
const dir='design/art/ancestry-goblinoid-children-v1';
const roles=[['ancestry-goblin','Гоблин','goblinoidy-gobliny'],['ancestry-hobgoblin','Хобгоблин','goblinoidy-hobgobliny'],['ancestry-bugbear','Багбир','goblinoidy-bagbir']];
const assets=roles.map(([family,label,recordId],index)=>{
 const run=JSON.parse(readFileSync(`${dir}/runs/${family}.json`,'utf8'));
 const path=`${family}.png`,bytes=readFileSync(`${dir}/${path}`),qa=inspectArtAlpha(`${dir}/${path}`);
 if(!qa.alpha || qa.transparentFraction<.15 || qa.touchesEdge)throw new Error(`Invalid child alpha/framing: ${family}`);
 return {id:`codex-${family}-v1`,label,family:'emblem',variant:'painterly goblinoid child ancestries v1',status:'generated',path,prompt:run.prompt,
 tool:'OpenAI built-in image_gen; underlying model version undisclosed',recordId,source:'book',sourceRef:`content/compendium/races.json#/races/10/subraces/${index}`,
 interpretation:'Authored generic ancestry illustration; not an NPC identity, faction, rule or universal canonical appearance.',
 review:{decision:'working-direction',productionReady:false,note:'Own child image, never inherited from composite goblinoid category. Product integration remains separate.'},
 bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),width:qa.width,height:qa.height,alphaAudit:qa};
});
writeFileSync(`${dir}/manifest.json`,JSON.stringify({version:1,purpose:'Explicit images for goblinoid children; composite inheritance prohibited',assets},null,2)+'\n');
const sources=JSON.parse(readFileSync('design/art/sources.json','utf8'));
if(!sources.includes(dir)){sources.push(dir);writeFileSync('design/art/sources.json',JSON.stringify(sources,null,2)+'\n');}
const queue=JSON.parse(readFileSync('coordination/tasks/ancestry-generation-queue.json','utf8'));
const compendium=JSON.parse(readFileSync('content/compendium/races.json','utf8'));
const familyOf=new Map([...queue.existingBaseOriginals,...queue.items].map(r=>[r.id,r.baseFamily]));
const parents=compendium.races.map((race,index)=>({recordId:race.id,sourceRef:`content/compendium/races.json#/races/${index}`,artId:`codex-${familyOf.get(race.id)}-v1`,subraces:race.subraces.map((sub,childIndex)=>({recordId:sub.id,sourceRef:`content/compendium/races.json#/races/${index}/subraces/${childIndex}`,artId:assets.find(a=>a.recordId===sub.id)?.id ?? `codex-${familyOf.get(race.id)}-v1`,policy:race.id==='goblinoidy'?'explicit-child-original':'inherit-same-parent-only'}))}));
if(parents.length!==38 || parents.reduce((n,p)=>n+p.subraces.length,0)!==62)throw new Error('Ancestry catalog changed; review roles');
writeFileSync('design/art/ancestry-extended-v1/role-map.json',JSON.stringify({schemaVersion:1,purpose:'Explicit generated image-role catalog; no automatic activation or NPC assignment',parentCount:38,subraceCount:62,parents},null,2)+'\n');
console.log('3 child originals registered; 38 parent and 62 subrace roles mapped');
