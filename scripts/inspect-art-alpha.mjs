import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Inspect pixels without editing the generated original. Supports 8-bit RGB/RGBA PNGs. */
export function inspectArtAlpha(file) {
  const bytes = readFileSync(file), chunks = [];
  if (bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new Error('Not PNG');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  const depth = bytes[24], color = bytes[25], channels = color === 6 ? 4 : color === 2 ? 3 : 0;
  if (depth !== 8 || !channels || bytes[28] !== 0) throw new Error('Unsupported PNG pixel format');
  for (let i = 8; i < bytes.length;) {
    const length = bytes.readUInt32BE(i), kind = bytes.toString('ascii', i + 4, i + 8);
    if (kind === 'IDAT') chunks.push(bytes.subarray(i + 8, i + 8 + length));
    i += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * channels;
  let previous = Buffer.alloc(stride), offset = 0, zero = 0, partial = 0;
  let left = width, top = height, right = -1, bottom = -1;
  const paeth = (a,b,c) => { const p=a+b-c, x=Math.abs(p-a), y=Math.abs(p-b), z=Math.abs(p-c); return x<=y&&x<=z?a:y<=z?b:c; };
  for (let y = 0; y < height; y++) {
    const filter = raw[offset++], row = Buffer.from(raw.subarray(offset, offset + stride)); offset += stride;
    if (filter > 4) throw new Error('Invalid PNG filter');
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x-channels] : 0, b = previous[x], c = x >= channels ? previous[x-channels] : 0;
      row[x] = (row[x] + (filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c))) & 255;
    }
    for (let x = 0; x < width; x++) {
      const alpha = channels === 4 ? row[x*channels+3] : 255;
      if (alpha === 0) zero++; else if (alpha < 255) partial++;
      if (alpha > 10) { left=Math.min(left,x); top=Math.min(top,y); right=Math.max(right,x); bottom=Math.max(bottom,y); }
    }
    previous = row;
  }
  return { width, height, alpha: channels===4, transparentFraction: zero/(width*height), partialFraction: partial/(width*height),
    bounds: right<0 ? null : {left,top,right,bottom},
    touchesEdge: right>=0 && (left===0 || top===0 || right===width-1 || bottom===height-1) };
}
if (process.argv[1] && resolve(process.argv[1]) === resolve('scripts/inspect-art-alpha.mjs')) {
  for (const file of process.argv.slice(2)) console.log(JSON.stringify({file,...inspectArtAlpha(file)}));
}
