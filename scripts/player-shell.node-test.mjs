import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPlayerShell } from './build-player-shell.mjs';

test('offline precache contains only player graph, its styles/fonts and shell; release changes invalidate it', async () => {
  const dist = await mkdtemp(join(tmpdir(), 'dm-player-shell-test-'));
  try {
    await mkdir(join(dist, '.vite')); await mkdir(join(dist, 'player')); await mkdir(join(dist, 'assets'));
    await writeFile(join(dist, '.vite/manifest.json'), JSON.stringify({
      'player/index.html': { file: 'assets/player-safe.js', imports: ['_vendor'], css: ['assets/player.css'] },
      '_vendor': { file: 'assets/vendor.js' },
      'index.html': { file: 'assets/master-secret-seed.js', imports: ['_full-campaign'] },
      '_full-campaign': { file: 'assets/private-journal.js' },
    }));
    await writeFile(join(dist, 'assets/player.css'), '@font-face{src:url(/assets/forum.woff2)}');
    await writeFile(join(dist, 'player/index.html'), '<html>player entry one</html>');
    const files = await buildPlayerShell(dist);
    assert.ok(files.includes('/assets/player-safe.js'));
    assert.ok(files.includes('/assets/vendor.js'));
    assert.ok(files.includes('/assets/forum.woff2'));
    assert.equal(files.some(file => /master|private|campaign|api\//.test(file)), false);
    const first = await readFile(join(dist, 'player/sw.js'), 'utf8');
    assert.ok(first.includes('cache.addAll(["/assets/'));
    await writeFile(join(dist, 'player/index.html'), '<html>player entry two</html>');
    await buildPlayerShell(dist);
    assert.notEqual(await readFile(join(dist, 'player/sw.js'), 'utf8'), first);
  } finally { await rm(dist, { recursive: true }); }
});
