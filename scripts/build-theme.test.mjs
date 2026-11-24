// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildTheme, resolveColors } from './build-theme.mjs';

const tokens = JSON.parse(readFileSync(new URL('../design/tokens.json', import.meta.url), 'utf8'));

describe('build-theme', () => {
  it('разворачивает ссылки var(--x) до значения', () => {
    const r = resolveColors(tokens.color.tokens);
    const bd = r.find(t => t.name === 'bd');
    expect(bd.value).toBe('var(--lo)');
    expect(bd.resolved).toBe(r.find(t => t.name === 'lo').value);
    expect(r.every(t => /^#[0-9a-f]{6}$/i.test(t.resolved))).toBe(true);
  });

  it('ссылка на несуществующий токен — ошибка, а не тихий var()', () => {
    expect(() => resolveColors([{ name: 'x', value: 'var(--nope)', usage: '' }])).toThrow(/неизвестный/);
  });

  it('каждый токен цвета есть и как переменная, и в теме Tailwind', () => {
    const { css } = buildTheme(tokens);
    for (const t of tokens.color.tokens) {
      const cssValue = t.value.startsWith('{') ? `var(--${t.value.slice(1, -1)})` : t.value;
      expect(css).toContain(`  --${t.name}: ${cssValue};`);
      expect(css).toContain(`  --color-${t.name}: var(--${t.name});`);
    }
  });

  it('тема переопределяется целиком и держит сетку 4px', () => {
    const { css } = buildTheme(tokens);
    expect(css).toMatch(/@theme \{\n  --\*: initial;/);
    expect(css).toContain('--spacing: 4px;');
    for (const k of Object.keys(tokens.type.families)) expect(css).toContain(`--font-${k}: `);
  });

  it('типографика читаема: числовые роли Georgia, текст не ниже 13px, короткие коды от 12px', () => {
    const { css } = buildTheme(tokens);
    const styles = tokens.type.groups.flatMap(g => g.styles.map(st => ({ ...st, family: g.family })));
    expect(styles.length).toBeGreaterThanOrEqual(12);
    expect(JSON.stringify(tokens.type)).not.toMatch(/Press Start|pixel/);
    expect(tokens.type.families.numeric).toContain('Georgia');
    for (const st of styles) {
      expect(css).toMatch(new RegExp(`@utility type-${st.name} \\{[^}]*font-size: ${st.fontSize};`));
      const px = parseInt(st.fontSize, 10);
      expect(px, st.name).toBeGreaterThanOrEqual(st.name === 'key' ? 12 : 13);
      if (st.name.startsWith('num-') && !['num-12'].includes(st.name)) expect(st.family).toBe('numeric');
    }
  });

  it('все стили объявлены в @source inline — сканер не видит классов, собранных из данных', () => {
    const { css } = buildTheme(tokens);
    const m = /@source inline\("([^"]+)"\);/.exec(css);
    expect(m).not.toBeNull();
    const listed = m[1].split(' ');
    for (const st of tokens.type.groups.flatMap(g => g.styles)) expect(listed).toContain(`type-${st.name}`);
  });

  it('радиус в сгенерированном CSS — только ноль', () => {
    const { css } = buildTheme(tokens);
    const radii = [...css.matchAll(/border-radius:\s*([^\s;}]+)/g)].map(m => m[1].trim());
    expect(radii.every(v => v === '0' || v === '0px')).toBe(true);
    expect(tokens.radius.tokens).toEqual([expect.objectContaining({ name: 'radius-0', value: '0' })]);
  });
});