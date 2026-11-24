import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { encodePng } from './build-icons.mjs';
import { inspectArtAlpha } from './inspect-art-alpha.mjs';
describe('pixel alpha acceptance', () => {
  it('distinguishes transparent margins, opaque image and edge clipping', () => {
    const dir=mkdtempSync(path.join(tmpdir(),'art-alpha-'));
    try {
      const file=path.join(dir,'fixture.png');
      const pixels=Buffer.alloc(4*4*4);
      for(const [x,y] of [[1,1],[2,1],[1,2],[2,2]]) {const i=(y*4+x)*4;pixels[i]=200;pixels[i+3]=255;}
      writeFileSync(file,encodePng(4,4,pixels));
      expect(inspectArtAlpha(file)).toMatchObject({alpha:true,transparentFraction:.75,bounds:{left:1,top:1,right:2,bottom:2},touchesEdge:false});
      pixels[3]=255;
      writeFileSync(file,encodePng(4,4,pixels));
      expect(inspectArtAlpha(file).touchesEdge).toBe(true);
      for(let i=3;i<pixels.length;i+=4)pixels[i]=255;
      writeFileSync(file,encodePng(4,4,pixels));
      expect(inspectArtAlpha(file).transparentFraction).toBe(0);
    } finally {rmSync(dir,{recursive:true});}
  });
});
