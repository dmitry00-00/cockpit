// Тема Tailwind и данные токенов из design/tokens.json — единственного источника.
// Пишет src/styles/theme.generated.css (переменные :root, тема Tailwind 4, двенадцать стилей
// типографики как @utility) и src/styles/tokens.generated.ts (те же токены данными для страницы
// и тестов). design/tokens.css не импортируется: он тоже скомпилирован из tokens.json, и тест
// tokens-css-parity держит обе компиляции равными.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Ссылка на другой токен: в tokens.json это `{lo}`, в CSS — `var(--lo)`. */
const REF = /^(?:\{([a-z0-9-]+)\}|var\(--([a-z0-9-]+)\))$/;
const refName = v => { const m = REF.exec(v.trim()); return m ? (m[1] ?? m[2]) : null; };

/** value — как писать в CSS (`var(--lo)`), resolved — конечный hex: тема и тесты не зависят от порядка объявлений. */
export function resolveColors(tokens) {
  const byName = new Map(tokens.map(t => [t.name, t.value]));
  const resolve = (v, depth = 0) => {
    const ref = refName(v);
    if (!ref) return v;
    if (depth > 8 || !byName.has(ref)) throw new Error(`токен ссылается на неизвестный ${v}`);
    return resolve(byName.get(ref), depth + 1);
  };
  return tokens.map(t => {
    const ref = refName(t.value);
    return { ...t, value: ref ? `var(--${ref})` : t.value, resolved: resolve(t.value) };
  });
}

const comment = s => (s ? ` /* ${s.replace(/\*\//g, '* /')} */` : '');

export function buildTheme(tokens) {
  const colors = resolveColors(tokens.color.tokens);
  const themeSel = tokens.color.themes.map(t => `[data-theme="${t.id}"]`).join(', ');
  const fam = tokens.type.families;
  const lines = [];
  const L = (...a) => lines.push(...a);

  L('/* Сгенерировано scripts/build-theme.mjs из design/tokens.json — не править руками. */', '');

  // 1. Переменные с именами из tokens.json: их знают bundle.css, документы и тесты.
  L(`:root, ${themeSel} {`);
  for (const c of colors) L(`  --${c.name}: ${c.value};${comment(c.usage)}`);
  L('}', '', ':root {');
  for (const s of tokens.shadow.tokens) L(`  --${s.name}: ${s.value};${comment(s.usage)}`);
  for (const s of tokens.spacing.tokens) L(`  --${s.name}: ${s.value};${comment(s.usage)}`);
  for (const s of tokens.radius.tokens) L(`  --${s.name}: ${s.value};${comment(s.usage)}`);
  for (const s of tokens.size.tokens) L(`  --${s.name}: ${s.value};${comment(s.usage)}`);
  for (const s of tokens.opacity.tokens) L(`  --${s.name}: ${s.value};${comment(s.usage)}`);
  L('}', '');

  // 2. Тема Tailwind — переопределяется целиком: утилиты не вводят значений, которых нет в токенах.
  L('@theme {', '  --*: initial;');
  for (const [k, v] of Object.entries(fam)) L(`  --font-${k}: ${v};`);
  L('  --default-font-family: var(--font-text);', '  --default-mono-font-family: var(--font-mono);');
  L('  --spacing: 4px; /* сетка 4px: p-1 = 4px, p-2 = 8px, p-3 = 12px, p-4 = 16px, p-6 = 24px, p-8 = 32px */');
  L('}', '', '@theme inline {');
  for (const c of colors) L(`  --color-${c.name}: var(--${c.name});`);
  for (const s of tokens.shadow.tokens) L(`  --shadow-${s.name}: var(--${s.name});`);
  for (const s of tokens.size.tokens) L(`  --spacing-${s.name}: var(--${s.name});`);
  L('}', '');

  // 3. Стили типографики — утилиты с префиксом type-: имена h-28, h-20, h-17, h-15 из токенов
  //    совпадают с высотами Tailwind (h-15 = 60px), и без префикса обе утилиты применялись бы разом.
  for (const g of tokens.type.groups) {
    L(`/* ${g.name} */`);
    for (const st of g.styles) {
      const ls = st.letterSpacing ? ` letter-spacing: ${st.letterSpacing};` : '';
      const tt = st.textTransform ? ` text-transform: ${st.textTransform};` : '';
      const fv = g.family === 'mono' ? ' font-variant-numeric: tabular-nums;' : '';
      L(`@utility type-${st.name} { font-family: var(--font-${g.family}); font-size: ${st.fontSize}; line-height: ${st.lineHeight}; font-weight: ${st.fontWeight};${ls}${tt}${fv} }`);
    }
    L('');
  }

  // Стили — данные из токенов, страница перебирает их циклом: сканер Tailwind таких классов не видит,
  // поэтому все пятнадцать объявляются здесь явно.
  const allStyles = tokens.type.groups.flatMap(g => g.styles.map(st => `type-${st.name}`));
  L(`@source inline("${allStyles.join(' ')}");`, '');

  // 4. Данные для страницы токенов и тестов.
  const ts = [
    '// Сгенерировано scripts/build-theme.mjs из design/tokens.json — не править руками.',
    `export const THEME_NAME = ${JSON.stringify(tokens.name)};`,
    `export const THEMES = ${JSON.stringify(tokens.color.themes)} as const;`,
    'export interface ColorToken { name: string; value: string; resolved: string; usage: string }',
    `export const COLORS: readonly ColorToken[] = ${JSON.stringify(colors, null, 2)};`,
    'export interface TypeStyle { name: string; fontSize: string; lineHeight: string; fontWeight: number; letterSpacing?: string; textTransform?: string; sample: string; usage: string }',
    'export interface TypeGroup { name: string; family: string; styles: readonly TypeStyle[] }',
    `export const TYPE_GROUPS: readonly TypeGroup[] = ${JSON.stringify(tokens.type.groups, null, 2)};`,
    `export const FONT_FAMILIES = ${JSON.stringify(fam, null, 2)} as const;`,
    'export interface PlainToken { name: string; value: string; usage: string }',
    `export const SHADOWS: readonly PlainToken[] = ${JSON.stringify(tokens.shadow.tokens, null, 2)};`,
    `export const SPACING: readonly PlainToken[] = ${JSON.stringify(tokens.spacing.tokens, null, 2)};`,
    `export const SIZES: readonly PlainToken[] = ${JSON.stringify(tokens.size.tokens, null, 2)};`,
    `export const RADII: readonly PlainToken[] = ${JSON.stringify(tokens.radius.tokens, null, 2)};`,
    `export const OPACITIES: readonly PlainToken[] = ${JSON.stringify(tokens.opacity.tokens, null, 2)};`,
    '',
  ].join('\n');

  return { css: lines.join('\n'), ts };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const tokens = JSON.parse(readFileSync(join(ROOT, 'design/tokens.json'), 'utf8'));
  const { css, ts } = buildTheme(tokens);
  mkdirSync(join(ROOT, 'src/styles'), { recursive: true });
  writeFileSync(join(ROOT, 'src/styles/theme.generated.css'), css);
  writeFileSync(join(ROOT, 'src/styles/tokens.generated.ts'), ts);
  console.log(`тема: ${tokens.color.tokens.length} цветов, ${tokens.type.groups.reduce((n, g) => n + g.styles.length, 0)} стилей, ${tokens.shadow.tokens.length} рецептов поверхностей`);
}
