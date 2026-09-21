// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/** design/tokens.css и theme.generated.css скомпилированы из одного tokens.json — переменные :root обязаны совпадать. */
function vars(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of css.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)) if (!out.has(m[1])) out.set(m[1], m[2].trim());
  return out;
}
const legacy = vars(readFileSync(new URL('../../design/tokens.css', import.meta.url), 'utf8'));
const generated = vars(readFileSync(new URL('./theme.generated.css', import.meta.url), 'utf8'));

describe('паритет с design/tokens.css', () => {
  it('каждая переменная tokens.css есть в сгенерированной теме с тем же значением', () => {
    const diff = [...legacy].filter(([k, v]) => generated.get(k) !== v).map(([k, v]) => `${k}: ${v} ≠ ${generated.get(k)}`);
    expect(diff).toEqual([]);
  });
  it('в tokens.css ровно те переменные, что и в tokens.json (ни одной лишней)', () => {
    const extra = [...legacy.keys()].filter(k => !generated.has(k));
    expect(extra).toEqual([]);
  });
});