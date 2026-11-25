import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPOSITORY_ROOT, renderSettingImportPlan, validateSettingImportProfile } from './setting-import-plan.mjs';

const profile = JSON.parse(readFileSync(`${REPOSITORY_ROOT}/packages/fr/import-profile.json`, 'utf8'));

test('FR import profile has a source policy and all field map scripts', () => {
  assert.equal(validateSettingImportProfile(profile), profile);
  assert.equal(profile.sources.wiki.distribution, 'internal');
  assert.deepEqual(Object.keys(profile.fieldMaps).sort(), ['chronology', 'deity', 'organization', 'person', 'place', 'polity']);
});

test('FR plan retains dependency-driven repeat passes without executing importers', () => {
  const text = renderSettingImportPlan(profile);
  assert.match(text, /organizations-seed/);
  assert.match(text, /organizations-resolve-leaders/);
  assert.match(text, /chronology-seed/);
  assert.match(text, /kingdoms-final/);
  assert.match(text, /скрипты не запускаются/);
});

test('unknown pipeline dependencies are rejected', () => {
  const invalid = structuredClone(profile);
  invalid.pipeline[0].dependsOn = ['missing-stage'];
  assert.throws(() => validateSettingImportProfile(invalid), /неизвестная зависимость/);
});

test('plan output sorts stages by dependency even if the profile is unordered', () => {
  const unordered = structuredClone(profile);
  unordered.pipeline.reverse();
  const text = renderSettingImportPlan(unordered);
  assert.ok(text.indexOf('01. extract-places') < text.indexOf('03. organizations-seed'));
  assert.ok(text.indexOf('03. organizations-seed') < text.indexOf('04. people'));
});

test('a package artifact cannot be read before an ancestor stage creates it', () => {
  const invalid = structuredClone(profile);
  invalid.pipeline[0].reads = ['organizations'];
  assert.throws(() => validateSettingImportProfile(invalid), /не создаётся предшествующим этапом/);
});
