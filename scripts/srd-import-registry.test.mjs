import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { join, resolve } from 'node:path';
import {
  buildSrdImportDocument,
  getSrdImportDefinition,
  REPOSITORY_ROOT,
  SRD_IMPORT_REGISTRY,
  SRD_IMPORT_TYPES,
  srdImportAttribution,
  writeSrdImport,
} from './srd-import-registry.mjs';

test('each registered SRD type has one importer, output and documented source', async () => {
  const outputPaths = new Set();
  const importerPaths = new Set();
  for (const type of SRD_IMPORT_TYPES) {
    const source = getSrdImportDefinition(type);
    assert.match(source.apiBase, /^https:\/\//);
    assert.match(source.sourceUrl, /^https:\/\//);
    assert.equal(source.license, 'CC-BY-4.0');
    assert.equal(source.policyReference, 'SOURCES.md §1');
    assert.ok(!outputPaths.has(source.output), `duplicate output: ${source.output}`);
    assert.ok(!importerPaths.has(source.importer), `duplicate importer: ${source.importer}`);
    outputPaths.add(source.output);
    importerPaths.add(source.importer);
    await access(resolve(REPOSITORY_ROOT, source.importer));
  }
  assert.equal(SRD_IMPORT_TYPES.length, 20);
});

test('an unchanged import keeps its original fetchedAt even when object key order differs', () => {
  const type = 'spell';
  const payload = { spells: [{ id: 'acid-splash', components: { verbal: true, somatic: true } }] };
  const previous = {
    spells: [{ components: { somatic: true, verbal: true }, id: 'acid-splash' }],
    fetchedAt: '2026-10-27',
    source: srdImportAttribution(type),
  };

  assert.deepEqual(buildSrdImportDocument(type, payload, { previous, today: '2026-11-16' }), {
    source: srdImportAttribution(type),
    fetchedAt: '2026-10-27',
    spells: payload.spells,
  });
});

test('a changed import advances fetchedAt and source metadata cannot be overridden by a type importer', () => {
  const previous = {
    source: srdImportAttribution('monster'),
    fetchedAt: '2026-10-27',
    monsters: { goblin: { hp: 7 } },
  };
  assert.equal(buildSrdImportDocument('monster', { monsters: { goblin: { hp: 8 } } }, { previous, today: '2026-11-16' }).fetchedAt, '2026-11-16');
  assert.throws(() => buildSrdImportDocument('monster', { source: 'unverified' }), /source и fetchedAt/);
});

test('the writer skips an identical file and atomically updates a changed snapshot', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'srd-import-test-'));
  const outputPath = join(directory, 'spells.json');
  try {
    const original = { spells: [{ id: 'acid-splash' }] };
    const first = await writeSrdImport('spell', original, { outputPath, today: '2026-11-16' });
    const firstBytes = await readFile(outputPath, 'utf8');
    const repeat = await writeSrdImport('spell', original, { outputPath, today: '2026-11-17' });
    assert.equal(first.changed, true);
    assert.equal(repeat.changed, false);
    assert.equal(await readFile(outputPath, 'utf8'), firstBytes);
    assert.equal(JSON.parse(firstBytes).fetchedAt, '2026-11-16');

    const changed = await writeSrdImport('spell', { spells: [{ id: 'acid-splash' }, { id: 'alarm' }] }, { outputPath, today: '2026-11-17' });
    assert.equal(changed.changed, true);
    assert.equal(JSON.parse(await readFile(outputPath, 'utf8')).fetchedAt, '2026-11-17');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
