import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cockpitEntry } from './lib/bundle-entry.mjs';

test('measures the cockpit even when the company/player entries precede it', () => {
  const chunk = (facadeModuleId, code) => ({ type: 'chunk', isEntry: true, facadeModuleId, code });
  const app = chunk('/project/index.html', 'large cockpit');
  const bundle = { company: chunk('/project/company-site/index.html', ''), player: chunk('/project/player/index.html', 'small'), app };
  assert.equal(cockpitEntry(bundle, '/project/index.html'), app);
});

test('fails closed when only other entries or a non-entry module are present', () => {
  assert.throws(() => cockpitEntry({ company: { type: 'chunk', isEntry: true, facadeModuleId: '/project/company-site/index.html' } }, '/project/index.html'));
  assert.throws(() => cockpitEntry({ app: { type: 'chunk', isEntry: false, facadeModuleId: '/project/index.html' } }, '/project/index.html'));
});
