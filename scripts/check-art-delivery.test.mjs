import { describe, expect, it } from 'vitest';
import { assertNoStaticArtPayload } from './check-art-delivery.mjs';

describe('art delivery static closure', () => {
  it('allows a shared vendor chunk when it contains no art payload', () => {
    expect(() => assertNoStaticArtPayload({
      initialKeys: new Set(['index.html', 'vendor.js']),
      artChunkKeys: new Set(['vendor.js', 'PortraitAsset.js']),
      javascriptByKey: { 'vendor.js': 'React.createElement(...)' }
    })).not.toThrow();
  });

  it.each([
    ['static entry', 'entry.js'],
    ['static dependency', 'vendor.js']
  ])('rejects an art URL in a %s', (_label, key) => {
    expect(() => assertNoStaticArtPayload({
      initialKeys: new Set(['entry.js', 'vendor.js']),
      artChunkKeys: new Set(['PortraitAsset.js']),
      javascriptByKey: { [key]: 'const image = "/art/v1/bo.webp";' }
    })).toThrow(/URL изображений в статическом старте/);
  });

  it('rejects source image URLs in the static closure', () => {
    expect(() => assertNoStaticArtPayload({
      initialKeys: new Set(['vendor.js']),
      artChunkKeys: new Set(),
      javascriptByKey: { 'vendor.js': '"bronze-atlas-v1/bo.png"' }
    })).toThrow(/Ссылка на исходник в статическом старте/);
  });
});
