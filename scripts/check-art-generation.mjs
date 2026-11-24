import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { inspectArtAlpha } from './inspect-art-alpha.mjs';
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const sources=read('design/art/sources.json'), all=new Map();
for(const dir of sources){
 for(const asset of read(`${dir}/manifest.json`).assets){
  assert.ok(!all.has(asset.id),`Duplicate ID ${asset.id}`);
  const path=`${dir}/${asset.path}`,bytes=readFileSync(path);
  assert.equal(bytes.length,asset.bytes,`${asset.id}: bytes`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,`${asset.id}: hash`);
  all.set(asset.id,asset);
 }
}
const queue=read('coordination/tasks/ancestry-generation-queue.json');
const ancestry=read('design/art/ancestry-extended-v1/manifest.json');
assert.equal(queue.items.length,34); assert.equal(ancestry.assets.length,34);
for(const item of queue.items){
 const id=`codex-${item.baseFamily}-v1`,asset=all.get(id);
 assert.ok(asset,`Missing ${id}`);assert.equal(asset.sourceRef,item.sourceRef);
 const qa=inspectArtAlpha(`design/art/ancestry-extended-v1/${asset.path}`);
 assert.ok(qa.alpha && qa.transparentFraction>.15 && !qa.touchesEdge,`Alpha/framing ${id}`);
 assert.equal(qa.width,asset.width);assert.equal(qa.height,asset.height);
}
const roles=read('design/art/ancestry-extended-v1/role-map.json');
const races=read('content/compendium/races.json').races;
assert.equal(roles.parents.length,38);assert.equal(races.length,38);
let childCount=0;
for(const race of races){
 const role=roles.parents.find(p=>p.recordId===race.id);
 assert.ok(role && all.has(role.artId),`Parent ${race.id}`);
 assert.equal(role.subraces.length,race.subraces.length);
 for(const subrace of race.subraces){
  childCount++;
  const child=role.subraces.find(c=>c.recordId===subrace.id);
  assert.ok(child && all.has(child.artId),`Child ${subrace.id}`);
  if(race.id==='goblinoidy'){
   assert.notEqual(child.artId,role.artId);assert.equal(child.policy,'explicit-child-original');
   const asset=all.get(child.artId),qa=inspectArtAlpha(`design/art/ancestry-goblinoid-children-v1/${asset.path}`);
   assert.ok(qa.alpha && qa.transparentFraction>.15 && !qa.touchesEdge);
  }else{assert.equal(child.artId,role.artId);assert.equal(child.policy,'inherit-same-parent-only');}
 }
}
assert.equal(childCount,62);
const publicAssets=read('public/art/manifest.json').assets;
assert.equal(publicAssets.length,all.size);
for(const asset of publicAssets){
 assert.ok(all.has(asset.id));assert.equal(asset.source.sha256,all.get(asset.id).sha256);
 for(const variant of asset.variants)assert.ok(existsSync(`public/art/${variant.path}`),`Missing derivative ${variant.path}`);
}
console.log(JSON.stringify({sourceOriginals:all.size,ancestryParents:38,subraceRoles:62,newParents:34,separateGoblinoidChildren:3,missing:0,alphaAndHashes:'passed',derivatives:'present'},null,2));
