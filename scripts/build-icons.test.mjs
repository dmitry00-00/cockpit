// Сборка иконок: сборка в временный каталог даёт байт в байт то же, что лежит в пакете
// (идемпотентность), а PNG и JSON согласованы между собой.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OUT, ROOT, build, crc32, encodePng, loadGenerator, readPngSize } from './build-icons.mjs';

const require = createRequire(import.meta.url);
const pilot = require('../design/art/bronze-icons-v1/pilot.cjs');
const baseline = require('../design/art/bronze-icons-v1/baseline.json');
const tokens = require('../design/tokens.json');

describe('ручной пилот БА10', () => {
  it('пилот содержит 18–24 принятых разных силуэта, светлая грань различима на рабочих поверхностях', () => {
    const accepted = pilot.entries.filter(e => e.status === 'integrated');
    expect(accepted.length).toBeGreaterThanOrEqual(18);
    expect(accepted.length).toBeLessThanOrEqual(24);
    expect(new Set(accepted.map(e => pilot.render(e.mask))).size).toBe(accepted.length);
    const lum = hex => {
      const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255)
        .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
    };
    const surfaces = tokens.color.tokens.filter(t => ['wl', 'bg', 'pn', 'cd', 'pl'].includes(t.name));
    const gen = loadGenerator();
    for (const e of accepted) for (const surface of surfaces) {
      const a = lum(gen.palettes[e.id][3]), b = lum(surface.value);
      expect((Math.max(a, b) + .05) / (Math.min(a, b) + .05), `${e.id} / ${surface.name}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('меняет только отобранные формы, сохраняя палитры и порядок имён', () => {
    const gen = loadGenerator();
    // БА10 проверяется отдельно: БА12 вправе доработать ранее отклонённые формы.
    const icons = pilot.apply(Object.fromEntries(Object.entries(baseline).map(([id, b]) => [id, b.grid])));
    for (const entry of pilot.entries) {
      expect(icons[entry.id]).toBe(entry.status === 'integrated' ? pilot.render(entry.mask) : baseline[entry.id].grid);
      expect(gen.palettes[entry.id]).toEqual(baseline[entry.id].palette);
    }
  });

  it('отказывает при опечатке id, повторе и повреждении сетки до записи атласа', () => {
    const e = pilot.entries[0];
    expect(() => pilot.apply({}, [e])).toThrow('Неизвестная');
    expect(() => pilot.apply({ [e.id]: '' }, [e, e])).toThrow('Повтор');
    expect(() => pilot.render(['#'])).toThrow('силуэт');
  });
});

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
