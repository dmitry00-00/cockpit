#!/usr/bin/env node
// Проверяет фактический dist, а не обещание конфигурации сборки.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './build-icons.mjs';
import { sha, webpInfo, safePath } from './build-art.mjs';
export function checkArtDelivery(dist = path.join(ROOT, 'dist')) {
  const bundles = JSON.parse(readFileSync(path.join(dist, '.vite/manifest.json'), 'utf8'));
  const art = JSON.parse(readFileSync(path.join(dist, 'art/manifest.json'), 'utf8'));
  const sheet = bundles['src/art/ArtSheet.tsx'];
  const portrait = bundles['src/art/PortraitAsset.tsx'];
  if (!sheet?.isDynamicEntry || !portrait?.isDynamicEntry) throw new Error('Иллюстрации/портрет потеряли отдельную загрузку');
  const initial = new Set();
  const visit = key => { if (initial.has(key)) return; initial.add(key); for (const dep of bundles[key]?.imports ?? []) visit(dep); };
  for (const [key, entry] of Object.entries(bundles)) if (entry.isEntry) visit(key);
  const artChunks = new Set();
  const visitArt = key => {
    if (artChunks.has(key)) return;
    artChunks.add(key);
    for (const dep of [...(bundles[key]?.imports ?? []), ...(bundles[key]?.dynamicImports ?? [])]) visitArt(dep);
  };
  visitArt('src/art/ArtSheet.tsx');
  visitArt('src/art/PortraitAsset.tsx');
  assertNoStaticArtPayload({
    initialKeys: initial,
    artChunkKeys: artChunks,
    javascriptByKey: Object.fromEntries(Object.entries(bundles)
      .filter(([, entry]) => entry.file.endsWith('.js'))
      .map(([key, entry]) => [key, readFileSync(safePath(dist, entry.file), 'utf8')]))
  });
  for (const [key, entry] of Object.entries(bundles)) if (entry.file.endsWith('.js')) {
    const text = readFileSync(safePath(dist, entry.file), 'utf8');
    if (text.includes('bronze-atlas-v1/')) throw new Error(`Ссылка на исходник в ${entry.file}`);
    if (text.includes('art/v1/') && (!key || !artChunks.has(key) || initial.has(key))) throw new Error(`URL изображений вне отложенного куска: ${entry.file}`);
  }
  let bytes = 0, files = 0;
  for (const asset of art.assets) for (const v of asset.variants) {
    const b = readFileSync(safePath(path.join(dist, 'art'), v.path)), info = webpInfo(b);
    if (sha(b) !== v.sha256 || b.length !== v.bytes || info.width !== v.width || info.height !== v.height || info.alpha !== v.alpha) throw new Error(`Повреждена поставка: ${asset.id}`);
    bytes += b.length; files++;
  }
  const atlas = art.glyphAtlas;
  const atlasBytes = readFileSync(safePath(path.join(dist, 'art'), atlas.image));
  if (sha(atlasBytes) !== atlas.sha256 || !existsSync(safePath(path.join(dist, 'art'), atlas.manifest))) throw new Error('Нет версионного атласа');
  const originals = new Set(art.assets.map(a => a.source.sha256));
  for (const f of readdirSync(dist, { recursive: true }).filter(f => typeof f === 'string' && f.endsWith('.png'))) {
    if (originals.has(sha(readFileSync(safePath(dist, f))))) throw new Error(`Оригинал в поставке: ${f}`);
  }
  return { illustrations: art.assets.length, files, bytes, glyphs: atlas.count, lazyChunks: [sheet.file, portrait.file], staticChunks: initial.size };
}

// Shared chunks can sit in both dependency graphs (for example React), but
// actual gallery payload and image URLs must remain outside the static closure.
export function assertNoStaticArtPayload({ initialKeys, artChunkKeys, javascriptByKey }) {
  for (const key of initialKeys) {
    const text = javascriptByKey[key] ?? '';
    if (text.includes('bronze-atlas-v1/')) throw new Error(`Ссылка на исходник в статическом старте: ${key}`);
    if (text.includes('art/v1/')) throw new Error(`URL изображений в статическом старте: ${key}`);
    // Dynamic module names can appear in Vite preload maps. Actual source/image
    // paths above are the payload signals; a module name alone is not art data.
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(checkArtDelivery(), null, 2));
