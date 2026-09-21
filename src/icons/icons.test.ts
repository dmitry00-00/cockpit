// Сгенерированный источник и атлас: 105 имён, сетки 16×16 из 0–4, палитры из четырёх hex,
// atlas.json согласован с IHDR atlas.png, кадры внутри и не пересекаются.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ICONS, ICON_NAMES, IPAL } from './icons.generated';

const ROOT = path.resolve(__dirname, '../..');
const HEX = /^#[0-9a-f]{6}$/;

interface Frame {
  frame: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  spriteSourceSize: { x: number; y: number; w: number; h: number };
}
interface Atlas {
  frames: Record<string, Frame>;
  meta: { image: string; size: { w: number; h: number }; scale: number; format: string };
}

describe('icons.generated.ts', () => {
  it('ровно 105 имён, без повторов, ICON_NAMES в порядке ключей', () => {
    expect(ICON_NAMES.length).toBe(105);
    expect(new Set(ICON_NAMES).size).toBe(105);
    expect(ICON_NAMES).toEqual(Object.keys(ICONS));
    expect(Object.keys(IPAL)).toEqual(Object.keys(ICONS));
  });

  it('каждая сетка — 16 рядов по 16 символов из 0–4, и в ней есть хоть одна клетка', () => {
    for (const name of ICON_NAMES) {
      const rows = ICONS[name].split('/');
      expect(rows.length, name).toBe(16);
      for (const row of rows) expect(row, name).toMatch(/^[0-4]{16}$/);
      expect(ICONS[name].replace(/[0/]/g, '').length, name).toBeGreaterThan(0);
    }
  });

  it('у каждой палитры четыре валидных hex', () => {
    for (const name of ICON_NAMES) {
      const p = IPAL[name];
      expect(p.length, name).toBe(4);
      for (const c of p) expect(c, name).toMatch(HEX);
    }
  });
});

describe('public/icons/atlas', () => {
  const png = readFileSync(path.join(ROOT, 'public/icons/atlas.png'));
  const atlas = JSON.parse(readFileSync(path.join(ROOT, 'public/icons/atlas.json'), 'utf8')) as Atlas;

  it('PNG: сигнатура и IHDR 8-бит RGBA', () => {
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.toString('latin1', 12, 16)).toBe('IHDR');
    expect(png[24]).toBe(8); // глубина
    expect(png[25]).toBe(6); // RGBA
    expect(png.toString('latin1', png.length - 8, png.length - 4)).toBe('IEND');
  });

  it('105 кадров — те же имена, что в ICONS', () => {
    expect(Object.keys(atlas.frames).length).toBe(105);
    expect(Object.keys(atlas.frames)).toEqual([...ICON_NAMES]);
  });

  it('meta.size совпадает с IHDR (байты 16–23), meta указывает на atlas.png', () => {
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    expect(atlas.meta.size).toEqual({ w, h });
    expect(atlas.meta.image).toBe('atlas.png');
    expect(atlas.meta.scale).toBe(1);
    expect(atlas.meta.format).toBe('RGBA8888');
  });

  it('все кадры 16×16, внутри атласа и не пересекаются', () => {
    const { w: W, h: H } = atlas.meta.size;
    const seen = new Set<string>();
    for (const [name, f] of Object.entries(atlas.frames)) {
      expect(f.frame.w, name).toBe(16);
      expect(f.frame.h, name).toBe(16);
      expect(f.sourceSize, name).toEqual({ w: 16, h: 16 });
      expect(f.spriteSourceSize, name).toEqual({ x: 0, y: 0, w: 16, h: 16 });
      expect(f.frame.x, name).toBeGreaterThanOrEqual(0);
      expect(f.frame.y, name).toBeGreaterThanOrEqual(0);
      expect(f.frame.x + f.frame.w, name).toBeLessThanOrEqual(W);
      expect(f.frame.y + f.frame.h, name).toBeLessThanOrEqual(H);
      // Кадры выровнены по сетке 16 — значит, два кадра пересекаются только при равных x,y.
      expect(f.frame.x % 16, name).toBe(0);
      expect(f.frame.y % 16, name).toBe(0);
      const key = `${f.frame.x},${f.frame.y}`;
      expect(seen.has(key), `${name}: кадр ${key} занят`).toBe(false);
      seen.add(key);
    }
  });
});
