import { cpSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, it, expect } from 'vitest';
import { ROOT, encodePng } from './build-icons.mjs';
import { buildArt, encode, sha, webpInfo, safePath } from './build-art.mjs';
const temp = [];
const fresh = () => { const p = mkdtempSync(path.join(tmpdir(), 'cockpit-art-')); temp.push(p); return p; };
afterEach(() => temp.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })));
function cachedRoot() {
  const root = fresh();
  cpSync(path.join(ROOT, 'public/art'), path.join(root, 'public/art'), { recursive: true });
  mkdirSync(path.join(root, 'design/art'), { recursive: true });
  cpSync(path.join(ROOT, 'design/art/derived-cache.json'), path.join(root, 'design/art/derived-cache.json'));
  return root;
}
const unavailable = () => { throw new Error('кодировщик не должен запускаться для проверенного кэша'); };
const encoderAvailable = (() => { try { execFileSync('cwebp', ['-version'], { stdio: 'ignore' }); execFileSync('dwebp', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

describe('конвейер БА11', () => {
  it('собирается без кодировщика из поставляемого кэша байт-в-байт; источники не являются URL доставки', () => {
    const root = cachedRoot();
    const r = buildArt({ root, convert: unavailable });
    expect(r.encoded).toBe(0);
    expect(readFileSync(path.join(root, 'public/art/manifest.json'))).toEqual(readFileSync(path.join(ROOT, 'public/art/manifest.json')));
    expect(readFileSync(path.join(root, 'src/art/registry.generated.ts'))).toEqual(readFileSync(path.join(ROOT, 'src/art/registry.generated.ts')));
    // 27 earlier + 79 Kimi + 23 content + 24 world/travel + 12 spells + 19 traits/slots + 18 map/sky + 6 factions.
    const ancestryCount = JSON.parse(readFileSync(path.join(ROOT, 'design/art/ancestry-extended-v1/manifest.json'), 'utf8')).assets.length;
    const goblinoidCount = JSON.parse(readFileSync(path.join(ROOT, 'design/art/ancestry-goblinoid-children-v1/manifest.json'), 'utf8')).assets.length;
    expect(r.manifest.assets).toHaveLength(208 + ancestryCount + goblinoidCount);
    expect(r.deliveredBytes).toBeLessThan(r.originalBytes / 10);
    expect(r.manifest.glyphAtlas.count).toBe(183);
    for (const asset of r.manifest.assets) {
      expect(asset.source.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(asset.review.productionReady).toBe(asset.id === 'bo-portrait');
      if (asset.id === 'bo-portrait') expect(asset).toMatchObject({ status: 'approved', source: { reference: expect.stringContaining('party-portraits-v1/manifest.json') } });
      for (const variant of asset.variants) {
        expect(variant.path).toMatch(/^v1\/[a-z0-9-]+\.webp$/);
        expect(variant.width).toBeLessThanOrEqual(asset.source.width);
        expect(variant.bytes).toBeLessThan((asset.family === 'scene' ? 192 : 64) * 1024);
        const bytes = readFileSync(path.join(root, 'public/art', variant.path));
        expect(sha(bytes)).toBe(variant.sha256);
        expect(webpInfo(bytes)).toEqual({ width: variant.width, height: variant.height, alpha: variant.alpha });
      }
    }
    const atlas = JSON.parse(readFileSync(path.join(root, 'public/art', r.manifest.glyphAtlas.manifest)));
    expect(Object.keys(atlas.frames)).toHaveLength(183);
    expect(atlas.frames['race-el-f'].source.reference).toContain('masks.json#race-el-f');
    expect(atlas.frames.hp.source.reference).toBe('design/icons-generator.js');
  });
  it('повреждённая производная пересчитывается, остальные берутся из кэша', () => {
    const root = cachedRoot();
    const manifest = JSON.parse(readFileSync(path.join(root, 'public/art/manifest.json')));
    const v = manifest.assets[0].variants[0], file = path.join(root, 'public/art', v.path), good = readFileSync(file);
    writeFileSync(file, 'broken');
    let calls = 0;
    const r = buildArt({ root, convert: (_source, output, width, height) => {
      calls++; expect(width).toBe(v.width); expect(height).toBe(v.height); writeFileSync(output, good);
    } });
    expect(calls).toBe(1); expect(r.encoded).toBe(1);
    expect(readFileSync(file)).toEqual(good);
  });
  it('изменённый без регистрации исходник останавливает сборку, не подменяя старый реестр', () => {
    const root = cachedRoot(), sourceDir = fresh();
    const m = JSON.parse(readFileSync(path.join(ROOT, 'design/art/bronze-atlas-v1/manifest.json')));
    m.assets = [m.assets[0]];
    writeFileSync(path.join(sourceDir, 'manifest.json'), JSON.stringify(m));
    cpSync(path.join(ROOT, 'design/art/bronze-atlas-v1', m.assets[0].path), path.join(sourceDir, m.assets[0].path));
    const p = path.join(sourceDir, m.assets[0].path), bytes = readFileSync(p);
    writeFileSync(p, Buffer.concat([bytes, Buffer.from('changed')]));
    const old = readFileSync(path.join(root, 'public/art/manifest.json'));
    expect(() => buildArt({ root, sourceDir, convert: unavailable })).toThrow('Исходник изменён');
    expect(readFileSync(path.join(root, 'public/art/manifest.json'))).toEqual(old);
  });
  it('ошибка кодировщика не оставляет временный файл в публичной поставке', () => {
    const root = cachedRoot();
    const manifestPath = path.join(root, 'public/art/manifest.json'), old = readFileSync(manifestPath);
    const manifest = JSON.parse(old), v = manifest.assets[0].variants[0];
    writeFileSync(path.join(root, 'public/art', v.path), 'broken');
    let temporary;
    expect(() => buildArt({ root, convert: (_input, output) => {
      temporary = output; writeFileSync(output, 'partial'); throw new Error('encoder failed');
    } })).toThrow('encoder failed');
    expect(existsSync(temporary)).toBe(false);
    expect(readFileSync(manifestPath)).toEqual(old);
  });
  it('не принимает выход за каталог и повреждённый заголовок', () => {
    expect(() => safePath(ROOT, '../secret.png')).toThrow();
    expect(() => safePath(ROOT, '/tmp/image.png')).toThrow();
    expect(() => webpInfo(Buffer.from('not an image'))).toThrow();
  });
  it.skipIf(!encoderAvailable)('сохраняет прозрачные/полупрозрачные пиксели при реальном кодировании, не увеличивает маленький исходник', () => {
    const root = fresh(), sourceDir = fresh();
    const png = encodePng(2, 1, new Uint8Array([255, 0, 0, 0, 0, 255, 0, 123]));
    const input = path.join(sourceDir, 'tiny.png'); writeFileSync(input, png);
    writeFileSync(path.join(sourceDir, 'manifest.json'), JSON.stringify({ assets: [{ id: 'test-alpha', family: 'portrait', label: 'Тест', variant: 'A', prompt: 'unit fixture', status: 'generated', path: 'tiny.png', sha256: sha(png), width: 2, height: 1, bytes: png.length, tool: 'fixture', review: { decision: 'comparison-only', productionReady: false } }] }));
    const r = buildArt({ root, sourceDir, convert: encode });
    expect(r.encoded).toBe(1);
    const variants = r.manifest.assets[0].variants;
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({ width: 2, height: 1, alpha: true });
    const output = path.join(root, 'alpha.pam');
    execFileSync('dwebp', [path.join(root, 'public/art', variants[0].path), '-pam', '-o', output], { stdio: 'ignore' });
    const pam = readFileSync(output), pixels = pam.subarray(pam.indexOf('ENDHDR\n') + 7);
    expect(pixels[3]).toBe(0); expect(pixels[7]).toBe(123);
    expect(existsSync(path.join(root, 'public/art/v1/test-alpha-2.tmp.webp'))).toBe(false);
  });
});
