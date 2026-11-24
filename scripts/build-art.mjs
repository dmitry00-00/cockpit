#!/usr/bin/env node
// БА11: оригиналы исследования → проверенный кэш WebP, реестр и версионный атлас.
// Кэш поставляется с проектом: cwebp нужен только для новой/изменённой иллюстрации.
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ROOT, loadGenerator, buildAtlas, readPngSize } from './build-icons.mjs';

export const RECIPE = 'webp-q82-m6-alpha100-v1';
export const SIZES = { portrait: [64, 128, 256], emblem: [48, 96, 192], item: [48, 96, 192], material: [256, 512], instrument: [256, 512], scene: [320, 640, 960] };
export const sha = data => createHash('sha256').update(data).digest('hex');
export function webpInfo(data) {
  if (data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WEBP' || data.readUInt32LE(4) + 8 !== data.length) throw new Error('Повреждён WebP');
  let width, height, alpha = false;
  for (let i = 12; i + 8 <= data.length;) {
    const type = data.toString('ascii', i, i + 4), n = data.readUInt32LE(i + 4), off = i + 8;
    if (off + n > data.length) throw new Error('Обрезан WebP');
    if (type === 'VP8X' && n >= 10) { alpha = !!(data[off] & 16); width = data.readUIntLE(off + 4, 3) + 1; height = data.readUIntLE(off + 7, 3) + 1; }
    if (type === 'VP8 ' && n >= 10 && !width) { width = data.readUInt16LE(off + 6) & 0x3fff; height = data.readUInt16LE(off + 8) & 0x3fff; }
    if (type === 'VP8L' && n >= 5 && !width) { const bits = data.readUInt32LE(off + 1); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1; alpha = !!(bits & 0x10000000); }
    i = off + n + (n % 2);
  }
  if (!width || !height) throw new Error('Нет размеров WebP');
  return { width, height, alpha };
}
export function encode(source, output, width, height) {
  try { execFileSync('cwebp', ['-quiet', '-q', '82', '-m', '6', '-alpha_q', '100', '-exact', '-metadata', 'none', '-resize', String(width), String(height), source, '-o', output], { stdio: 'pipe' }); }
  catch (e) { throw new Error(`Не удалось подготовить ${path.basename(source)}. Для новых исходников нужен cwebp (libwebp). ${e.message}`); }
}
export function safePath(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error('Ожидался относительный путь ассета');
  const file = path.resolve(root, relative);
  if (!file.startsWith(path.resolve(root) + path.sep)) throw new Error('Ассет выходит за каталог');
  return file;
}
export function buildArt({ root = ROOT, sourceDir, convert = encode } = {}) {
  const directories = sourceDir ? [sourceDir] : JSON.parse(readFileSync(path.join(ROOT, 'design/art/sources.json'), 'utf8')).map(p => safePath(ROOT, p));
  const sources = directories.flatMap(dir => JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')).assets.map(asset => ({ asset, dir })));

  const output = path.join(root, 'public/art'), versionDir = path.join(output, 'v1');
  mkdirSync(versionDir, { recursive: true });
  const cacheFile = path.join(root, 'design/art/derived-cache.json');
  mkdirSync(path.dirname(cacheFile), { recursive: true });
  const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  const nextCache = {}, assets = [];
  let encoded = 0;
  const ids = new Set();
  for (const { asset, dir } of sources) {
    if (!/^[a-z][a-z0-9-]+$/.test(asset.id) || ids.has(asset.id) || !SIZES[asset.family]) throw new Error(`Некорректный id/тип: ${asset.id}`);
    ids.add(asset.id);
    if (asset.status !== 'generated' || !asset.review || typeof asset.prompt !== 'string' || !asset.prompt.trim()) throw new Error(`Нет происхождения/проверки: ${asset.id}`);
    const input = safePath(dir, asset.path), original = readFileSync(input), digest = sha(original), size = readPngSize(original);
    if (digest !== asset.sha256 || original.length !== asset.bytes || size.w !== asset.width || size.h !== asset.height) throw new Error(`Исходник изменён без обновления реестра: ${asset.id}`);
    const variants = [];
    for (const width of new Set(SIZES[asset.family].map(n => Math.min(n, size.w)))) {
      const height = Math.max(1, Math.round(size.h * width / size.w));
      const key = `${asset.id}:${digest}:${width}:${height}:${RECIPE}`, cached = cache[key];
      let variant;
      if (cached) {
        const file = safePath(output, cached.path);
        if (existsSync(file)) {
          try {
            const bytes = readFileSync(file), info = webpInfo(bytes);
            if (sha(bytes) === cached.sha256 && bytes.length === cached.bytes && info.width === width && info.height === height && info.alpha === cached.alpha) variant = cached;
          } catch { /* Производный кэш повреждён: пересчитываем из проверенного исходника. */ }
        }
      }
      if (!variant) {
        const temporary = path.join(versionDir, `${asset.id}-${width}.tmp.webp`);
        try {
          convert(input, temporary, width, height);
          const bytes = readFileSync(temporary), info = webpInfo(bytes), hash = sha(bytes);
          if (info.width !== width || info.height !== height) throw new Error(`Неверный масштаб: ${asset.id}`);
          const relative = `v1/${asset.id}-${width}-${hash.slice(0, 16)}.webp`;
          writeFileSync(safePath(output, relative), bytes);
          variant = { path: relative, width, height, bytes: bytes.length, sha256: hash, alpha: info.alpha, format: 'webp' };
          encoded++;
        } finally {
          // Только промежуточный файл этого запуска; не допускаем его поставку после ошибки.
          if (existsSync(temporary)) unlinkSync(temporary);
        }
      }
      nextCache[key] = variant;
      variants.push(variant);
    }
    assets.push({ id: asset.id, version: sha(digest + RECIPE).slice(0, 16), family: asset.family, label: asset.label, direction: asset.variant,
      status: asset.review.decision === 'approved' ? 'approved' : asset.review.decision === 'working-direction' ? 'concept' : 'comparison', purpose: asset.review.decision === 'approved' ? `Портрет персонажа: ${asset.label}` : `Художественная проба: ${asset.label}`,
      source: { kind: 'generated', tool: asset.tool, reference: `${path.relative(ROOT, dir)}/manifest.json#${asset.id}`, path: `${path.relative(ROOT, dir)}/${asset.path}`, sha256: digest, bytes: original.length, width: size.w, height: size.h },
      review: asset.review, recipe: RECIPE, variants });
  }
  const gen = loadGenerator(), atlas = buildAtlas(gen), pngHash = sha(atlas.png);
  const image = `v1/icons-${pngHash.slice(0, 16)}.png`;
  writeFileSync(safePath(output, image), atlas.png);
  const frames = Object.fromEntries(gen.names.map(id => [id, { ...atlas.json.frames[id], id: `icon:${id}`, version: sha(gen.icons[id] + JSON.stringify(gen.palettes[id])).slice(0, 16), purpose: `Знак интерфейса: ${id}`, source: { kind: 'code', reference: 'design/icons-generator.js' } }]));
  // Конкретное происхождение ручной формы хранится вместе с остальными исходниками пилота.
  for (const folder of ['bronze-icons-v1', 'bronze-icons-v2']) {
    const masks = JSON.parse(readFileSync(path.join(ROOT, `design/art/${folder}/masks.json`), 'utf8'));
    for (const e of masks.filter(e => e.status === 'integrated')) frames[e.id].source = { kind: 'code', reference: `design/art/${folder}/masks.json#${e.id}` };
  }
  const atlasData = Buffer.from(JSON.stringify({ frames, meta: { ...atlas.json.meta, image: path.basename(image), contentSha256: pngHash } }, null, 2) + '\n');
  const atlasPath = `v1/icons-${sha(atlasData).slice(0, 16)}.json`;
  writeFileSync(safePath(output, atlasPath), atlasData);
  const manifest = { schemaVersion: 1, collection: 'bronze-atlas', version: '1.0.0', assets, glyphAtlas: { id: 'interface-glyphs', count: gen.names.length, version: pngHash.slice(0, 16), image, manifest: atlasPath, bytes: atlas.png.length, sha256: pngHash, width: atlas.width, height: atlas.height, alpha: true } };
  writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(cacheFile, JSON.stringify(nextCache, null, 2) + '\n');
  const runtime = Object.fromEntries(assets.map(a => [a.id, { label: a.label, family: a.family, status: a.status, direction: a.direction, version: a.version, variants: a.variants.map(v => ({ ...v, path: `art/${v.path}` })) }]));
  mkdirSync(path.join(root, 'src/art'), { recursive: true });
  writeFileSync(path.join(root, 'src/art/registry.generated.ts'), '// Сгенерировано scripts/build-art.mjs. Не править руками.\nexport const ART = ' + JSON.stringify(runtime, null, 2) + ' as const;\nexport type ArtId = keyof typeof ART;\n');
  return { manifest, encoded, originalBytes: assets.reduce((n, a) => n + a.source.bytes, 0), deliveredBytes: assets.flatMap(a => a.variants).reduce((n, v) => n + v.bytes, 0) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = buildArt();
  console.log(`${r.manifest.assets.length} иллюстрации, ${r.manifest.glyphAtlas.count} глифов; WebP пересчитано ${r.encoded}; ${(r.originalBytes/1048576).toFixed(1)} MiB → ${(r.deliveredBytes/1048576).toFixed(2)} MiB (все размеры)`);
}
