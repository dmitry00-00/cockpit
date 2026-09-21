// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** border-radius: 0 везде, во всём, всегда. Сторож ходит по исходникам, а не по обещаниям. */
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(css|tsx?|mjs)$/.test(n) && !n.endsWith('.test.ts') && !n.endsWith('.test.tsx')) out.push(p);
  }
  return out;
}
const SRC = new URL('..', import.meta.url).pathname;

describe('радиус', () => {
  const files = walk(SRC);
  it('исходники есть', () => expect(files.length).toBeGreaterThan(3));
  it.each(files)('%s: border-radius только 0 и никаких rounded-*', file => {
    const s = readFileSync(file, 'utf8');
    const radii = [...s.matchAll(/border-radius:\s*([^\s;}]+)/g)].map(m => m[1].trim()).filter(v => v !== '0' && v !== '0px');
    expect(radii).toEqual([]);
    const rounded = [...s.matchAll(/\brounded(?:-[a-z0-9\[\]]+)?\b/g)].map(m => m[0]).filter(c => c !== 'rounded-none' && c !== 'rounded-0');
    expect(rounded).toEqual([]);
  });
});