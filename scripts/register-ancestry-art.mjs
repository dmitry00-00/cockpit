import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inspectArtAlpha } from './inspect-art-alpha.mjs';
const dir='design/art/ancestry-extended-v1';
const queue=JSON.parse(readFileSync('coordination/tasks/ancestry-generation-queue.json','utf8'));
const runs=readdirSync(`${dir}/runs`).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(readFileSync(`${dir}/runs/${f}`,'utf8'))).sort((a,b)=>a.index-b.index);
const assets=runs.map(run=>{
 const item=queue.items[run.index];
 if(!item || item.baseFamily!==run.family)throw new Error(`Queue mismatch ${run.family}`);
 const path=`${run.family}.png`, bytes=readFileSync(`${dir}/${path}`), qa=inspectArtAlpha(`${dir}/${path}`);
 if(!qa.alpha || qa.transparentFraction<.15 || qa.touchesEdge) throw new Error(`Alpha/framing requires correction ${path}: ${JSON.stringify(qa)}`);
 return {id:`codex-${run.family}-v1`,label:item.label,family:'emblem',variant:'painterly ancestry extended v1',status:'generated',path,prompt:run.prompt,
 tool:'OpenAI built-in image_gen; underlying model version undisclosed',sourceRef:item.sourceRef,source:item.source,
 interpretation:item.visualBriefStatus,review:{decision:'working-direction',productionReady:false,note:'Authored ancestry illustration; full role/small-size surface acceptance pending. Not a canonical individual or lineage. Goblinoid category must not be inherited by children.'},
 bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),width:qa.width,height:qa.height,alphaAudit:qa};
});
writeFileSync(`${dir}/manifest.json`,JSON.stringify({version:1,purpose:'34 missing ancestry bases; source-aware authored interpretations',assets},null,2)+'\n');
const roles=queue.items.map(item=>({roleId:item.baseFamily,recordId:item.id,label:item.label,sourceRef:item.sourceRef,sourceArtId:`codex-${item.baseFamily}-v1`,generationStatus:assets.some(a=>a.id===`codex-${item.baseFamily}-v1`)?'done':'pending',reviewStatus:'pending',subraceIds:item.subraceIds,inheritance:item.sameAncestrySubracesMayReuseBase ?? [],inheritanceProhibitedForSubraceIds:item.inheritanceProhibitedForSubraceIds ?? []}));
writeFileSync(`${dir}/coverage.json`,JSON.stringify({requiredNewOriginals:34,selectedOriginals:assets.length,existingBaseOriginals:queue.existingBaseOriginals,roles},null,2)+'\n');
const sourcesPath='design/art/sources.json',sources=JSON.parse(readFileSync(sourcesPath,'utf8'));
if(assets.length && !sources.includes(dir)){sources.push(dir);writeFileSync(sourcesPath,JSON.stringify(sources,null,2)+'\n');}
console.log(JSON.stringify({registered:assets.length,remaining:34-assets.length,ids:assets.map(a=>a.id)}));
