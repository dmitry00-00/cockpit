// Сборка иконок: сборка в временный каталог даёт байт в байт то же, что лежит в пакете
// (идемпотентность), а PNG и JSON согласованы между собой.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OUT, ROOT, build, crc32, encodePng, loadGenerator, readPngSize } from './build-icons.mjs';

let tmp;
let result;
beforeAll(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'dm-icons-'));
  result = build({ outRoot: tmp });
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('build-icons', () => {
  it('генератор читается без побочного вывода: 183 иконки', () => {
    const gen = loadGenerator();
    expect(gen.names.length).toBe(183);
    expect(result.count).toBe(183);
    expect(result.files.length).toBe(3);
  });

  it('идемпотентна: сборка во временный каталог совпадает с файлами в пакете байт в байт', () => {
    for (const rel of Object.values(OUT)) {
      const fresh = readFileSync(path.join(tmp, rel));
      const inPlace = readFileSync(path.join(ROOT, rel));
      expect(fresh.equals(inPlace), `${rel} отличается — запустить node scripts/build-icons.mjs`).toBe(true);
    }
  });

  it('атлас: 16 колонок × 12 рядов = 256×192, meta.size равен IHDR', () => {
    const png = readFileSync(path.join(tmp, OUT.png));
    const json = JSON.parse(readFileSync(path.join(tmp, OUT.json), 'utf8'));
    expect(readPngSize(png)).toEqual({ w: 256, h: 192 });
    expect(json.meta.size).toEqual({ w: 256, h: 192 });
    expect(Object.keys(json.frames).length).toBe(183);
  });

  it('crc32 и encodePng: IEND по эталону, минимальный PNG с корректными чанками', () => {
    expect(crc32(Buffer.from('IEND', 'latin1'))).toBe(0xae426082);
    const png = encodePng(2, 1, new Uint8Array([255, 0, 0, 255, 0, 0, 255, 128]));
    expect(readPngSize(png)).toEqual({ w: 2, h: 1 });
    // CRC чанка IHDR сходится с содержимым.
    const ihdrLen = png.readUInt32BE(8);
    const ihdrBody = png.subarray(12, 12 + 4 + ihdrLen);
    expect(png.readUInt32BE(16 + ihdrLen)).toBe(crc32(ihdrBody));
    expect(() => encodePng(2, 2, new Uint8Array(3))).toThrow();
  });

  it('TS-источник: шапка «не править руками», ICONS, IPAL, IconName, ICON_NAMES', () => {
    const ts = readFileSync(path.join(tmp, OUT.ts), 'utf8');
    expect(ts.startsWith('// Сгенерировано из design/icons-generator.js — не править руками.')).toBe(true);
    expect(ts).toContain('export const ICONS = {');
    expect(ts).toContain('export const IPAL = {');
    expect(ts).toContain('export type IconName = keyof typeof ICONS;');
    expect(ts).toContain('export const ICON_NAMES: readonly IconName[]');
  });
});
