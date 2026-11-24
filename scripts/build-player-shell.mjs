import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

/** Pin only the player entry's dependency graph for first-launch offline use. */
export async function buildPlayerShell(dist = 'dist') {
  const manifest = JSON.parse(await readFile(resolve(dist, '.vite/manifest.json'), 'utf8'));
  const root = manifest['player/index.html'];
  if (!root) throw new Error('Player entry missing from Vite manifest');
  const files = new Set(['/player/', '/player/manifest.webmanifest', '/player/icon-192.png', '/player/icon-512.png']);
  const visited = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const entry = manifest[key];
    if (!entry) throw new Error(`Missing player dependency ${key}`);
    files.add('/' + entry.file);
    for (const css of entry.css ?? []) files.add('/' + css);
    for (const asset of entry.assets ?? []) files.add('/' + asset);
    for (const imported of entry.imports ?? []) visit(imported);
  }
  visit('player/index.html');
  for (const file of [...files]) {
    if (!file.endsWith('.css')) continue;
    const css = await readFile(resolve(dist, file.slice(1)), 'utf8');
    for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      const url = match[1];
      if (url.startsWith('/assets/')) files.add(url);
    }
  }
  // Avoid caching any page/app entry that is not explicitly in this graph.
  const list = [...files].sort();
  const html = await readFile(resolve(dist, 'player/index.html'), 'utf8');
  const revision = createHash('sha256').update(html + JSON.stringify(list)).digest('hex').slice(0, 16);
  let sw = await readFile('public/player/sw.js', 'utf8');
  sw = sw.replace("const CACHE = 'dm-player-shell-v1';", `const CACHE = 'dm-player-shell-${revision}';`);
  sw = sw.replace("cache.addAll(['/player/', '/player/manifest.webmanifest', '/player/icon-192.png', '/player/icon-512.png'])", `cache.addAll(${JSON.stringify(list)})`);
  await writeFile(resolve(dist, 'player/sw.js'), sw);
  console.log(`Player offline shell: ${list.length} files, revision ${revision}`);
  return list;
}
if (process.argv[1] && resolve(process.argv[1]) === resolve('scripts/build-player-shell.mjs')) await buildPlayerShell();
