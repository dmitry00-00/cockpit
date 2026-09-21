#!/usr/bin/env node
// Сборка иконок: один источник — два выхода.
//   design/icons-generator.js  →  src/icons/icons.generated.ts   (inline-SVG для DOM, компонент Icon)
//                              →  public/icons/atlas.png + atlas.json  (spritesheet для PixiJS)
// Запуск: node scripts/build-icons.mjs. Идемпотентен: одинаковый вход даёт байт в байт одинаковый выход.
// Нативных зависимостей нет: PNG кодируется здесь же (IHDR + IDAT через zlib + IEND).

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);

/** Корень пакета (каталог над scripts/). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Сторона одного спрайта в пикселях — сетка генератора 16×16. */
export const CELL = 16;
/** Колонок в атласе: 105 иконок → 16 × 7 = 256 × 112 px. */
export const COLUMNS = 16;

/** Пути выходов относительно корня. */
export const OUT = {
  ts: 'src/icons/icons.generated.ts',
  png: 'public/icons/atlas.png',
  json: 'public/icons/atlas.json',
};

const GRID_RE = /^[0-4]{16}$/;
const HEX_RE = /^#[0-9a-f]{6}$/;

/**
 * Читает генератор. Он написан как CommonJS, но package.json объявляет `"type": "module"`,
 * и Node считает любой `.js` в пакете ES-модулем — обычный require(...) падает на
 * «require is not defined». Поэтому файл читается как текст и компилируется в CJS-обёртке
 * (vm.compileFunction — то же, что делает загрузчик CommonJS). `require.main === module`
 * внутри генератора при этом ложно, и побочный icons.out.js рядом с ним не пишется.
 */
export function loadGenerator() {
  const filename = path.join(ROOT, 'design/icons-generator.js');
  const source = readFileSync(filename, 'utf8');
  const fn = vm.compileFunction(source, ['exports', 'require', 'module', '__filename', '__dirname'], {
    filename,
  });
  const module = { exports: {} };
  fn(module.exports, require, module, filename, path.dirname(filename));
  const { icons, palettes } = module.exports;
  const names = Object.keys(icons);
  validate({ icons, palettes, names });
  return { icons, palettes, names };
}

/** Строгая проверка входа: лучше упасть здесь, чем записать мусор в три файла. */
export function validate({ icons, palettes, names }) {
  for (const name of names) {
    const rows = String(icons[name]).split('/');
    if (rows.length !== CELL || !rows.every((r) => GRID_RE.test(r))) {
      throw new Error(`иконка «${name}»: сетка не 16×16 из символов 0–4`);
    }
    const p = palettes[name];
    if (!Array.isArray(p) || p.length !== 4 || !p.every((c) => HEX_RE.test(c))) {
      throw new Error(`иконка «${name}»: палитра не из четырёх hex-цветов`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* PNG                                                                 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** CRC32 по таблице — на случай Node без zlib.crc32 (появился в 22.2). */
function makeCrc32() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
}
export const crc32 = typeof zlib.crc32 === 'function' ? (buf) => zlib.crc32(buf) >>> 0 : makeCrc32();

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * Кодирует RGBA-буфер (width × height × 4 байта) в PNG: 8 бит, тип 6 (RGBA),
 * фильтр 0 в каждой строке, один IDAT.
 */
export function encodePng(width, height, rgba) {
  if (rgba.length !== width * height * 4) {
    throw new Error(`encodePng: ожидалось ${width * height * 4} байт, получено ${rgba.length}`);
  }
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  const src = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // фильтр None
    src.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // глубина
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // сжатие
  ihdr[11] = 0; // фильтр
  ihdr[12] = 0; // без чересстрочности
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Ширина и высота из IHDR — байты 16–23 файла. */
export function readPngSize(buf) {
  if (!PNG_SIGNATURE.equals(buf.subarray(0, 8))) throw new Error('не PNG: нет сигнатуры');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/* ------------------------------------------------------------------ */
/* Растеризация                                                        */

/** '#rrggbb' → [r, g, b]. */
export function hexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

/**
 * Пишет иконку в RGBA-буфер шириной `stride` пикселей по смещению (ox, oy),
 * увеличивая каждую клетку в `scale` раз без сглаживания. Тон 0 — прозрачный.
 */
export function blit(rgba, stride, ox, oy, grid, palette, scale = 1) {
  const rows = grid.split('/');
  const colors = palette.map(hexToRgb);
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const t = rows[y].charCodeAt(x) - 48;
      if (t === 0) continue;
      const [r, g, b] = colors[t - 1];
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const i = ((oy + y * scale + sy) * stride + (ox + x * scale + sx)) * 4;
          rgba[i] = r;
          rgba[i + 1] = g;
          rgba[i + 2] = b;
          rgba[i + 3] = 255;
        }
      }
    }
  }
}

/** Атлас: спрайты в порядке генератора, слева направо, сверху вниз, без масштабирования. */
export function buildAtlas({ icons, palettes, names }, columns = COLUMNS) {
  const rows = Math.ceil(names.length / columns);
  const width = columns * CELL;
  const height = rows * CELL;
  const rgba = new Uint8Array(width * height * 4);
  const frames = {};
  names.forEach((name, i) => {
    const x = (i % columns) * CELL;
    const y = Math.floor(i / columns) * CELL;
    blit(rgba, width, x, y, icons[name], palettes[name]);
    frames[name] = {
      frame: { x, y, w: CELL, h: CELL },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: CELL, h: CELL },
      sourceSize: { w: CELL, h: CELL },
    };
  });
  const json = {
    frames,
    meta: {
      app: 'scripts/build-icons.mjs',
      version: '1.0',
      image: path.basename(OUT.png),
      size: { w: width, h: height },
      scale: 1,
      format: 'RGBA8888',
    },
  };
  return { png: encodePng(width, height, rgba), json, width, height };
}

/* ------------------------------------------------------------------ */
/* TypeScript                                                          */

export function renderTs({ icons, palettes, names }) {
  const q = (s) => `'${s}'`;
  const lines = [];
  lines.push('// Сгенерировано из design/icons-generator.js — не править руками.');
  lines.push('// Пересобрать: node scripts/build-icons.mjs (тот же источник даёт public/icons/atlas.png для PixiJS).');
  lines.push('');
  lines.push('/** Сетка 16×16: шестнадцать рядов по шестнадцать символов через «/», 0 — пусто, 1–4 — тон палитры. */');
  lines.push('export const ICONS = {');
  for (const n of names) lines.push(`  ${q(n)}: ${q(icons[n])},`);
  lines.push('} as const;');
  lines.push('');
  lines.push('/** Четыре тона иконки: 1 самый тёмный … 4 самый светлый; тон 3 — базовый цвет токена. */');
  lines.push('export const IPAL = {');
  for (const n of names) lines.push(`  ${q(n)}: [${palettes[n].map(q).join(', ')}],`);
  lines.push('} as const;');
  lines.push('');
  lines.push('export type IconName = keyof typeof ICONS;');
  lines.push('');
  lines.push('/** Все имена в порядке генератора — он же порядок спрайтов в атласе. */');
  lines.push('export const ICON_NAMES: readonly IconName[] = Object.keys(ICONS) as IconName[];');
  lines.push('');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Сборка                                                              */

/**
 * Собирает всё в `outRoot` (по умолчанию корень пакета) и возвращает
 * число иконок и записанные пути. Каталоги создаются по необходимости.
 */
export function build({ outRoot = ROOT } = {}) {
  const gen = loadGenerator();
  const ts = renderTs(gen);
  const atlas = buildAtlas(gen);
  const outputs = [
    [OUT.ts, ts],
    [OUT.png, atlas.png],
    [OUT.json, JSON.stringify(atlas.json, null, 2) + '\n'],
  ];
  const files = [];
  for (const [rel, data] of outputs) {
    const abs = path.join(outRoot, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, data);
    files.push(abs);
  }
  return { count: gen.names.length, files, width: atlas.width, height: atlas.height };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = build();
  console.log(`${r.count} иконок → ${OUT.ts}, ${OUT.png} (${r.width}×${r.height}), ${OUT.json}`);
}
