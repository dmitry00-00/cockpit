import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const root=fileURLToPath(new URL('../design/art/bronze-icons-v2/', import.meta.url));
const {entries,render}=require(root+'pilot.cjs');
const before=JSON.parse(readFileSync(root+'baseline.json'));
writeFileSync(root+'comparison.json',JSON.stringify(entries.map(e=>({...e,before:before[e.id].grid,after:render(e.mask),palette:before[e.id].palette})),null,2)+'\n');
// Контактный лист — только сравнение сеток, не снимок браузера. Подписи — в index.html.
const {encodePng}=await import('./build-icons.mjs');
const es=JSON.parse(readFileSync(root+'comparison.json'));
const w=1000,h=Math.ceil(es.length/4)*120,b=new Uint8Array(w*h*4);
for(let i=0;i<w*h;i++)b.set([26,17,24,255],i*4);
es.forEach((e,i)=>{const ox=i%4*250,oy=Math.floor(i/4)*120;
  for(const [j,key] of ['before','after'].entries())for(const[k,size] of [16,24,32].entries()){
    const grid=e[key].split('/');
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const t=+grid[Math.floor(y*16/size)][Math.floor(x*16/size)];if(!t)continue;
      const hex=e.palette[t-1];
      b.set([parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16),255],((oy+j*48+12+y)*w+ox+k*70+16+x)*4);
    }
  }
});
writeFileSync(root+'contact-sheet.png',encodePng(w,h,b));
