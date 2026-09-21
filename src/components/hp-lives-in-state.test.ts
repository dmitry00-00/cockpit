// @vitest-environment node
// Сторож шага 5: число хитов живёт только в State движка. Ни один компонент и ни одна страница стола не
// держит его в useState — ни под именем hp, ни current, ни max. Читает исходники, а не DOM: копия хитов
// в локальном состоянии не видна ни одним рендером, пока не разойдётся с логом. Считает знаменатель:
// сколько файлов и сколько useState просмотрено — «проверено 0» не считается зелёным.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');
const COMPONENTS = join(ROOT, 'components');
const PAGES = join(ROOT, 'pages');

const isSource = (name: string) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !/\.d\.ts$/.test(name);

function sources(): { file: string; text: string }[] {
  const comps = readdirSync(COMPONENTS).filter(isSource).map(f => join(COMPONENTS, f));
  const pages = readdirSync(PAGES).filter(f => isSource(f) && /^Desk/.test(f)).map(f => join(PAGES, f));
  return [...comps, ...pages].map(file => ({ file, text: readFileSync(file, 'utf8') }));
}

/** `const [name, setName] = useState…` → name; useState без деструктуризации тоже ловится (как «?»). */
const USE_STATE = /(?:const|let)\s*\[\s*([A-Za-z_$][\w$]*)\s*(?:,\s*[A-Za-z_$][\w$]*\s*)?\]\s*=\s*useState\b|\buseState\b/g;
const HP_NAME = /hp|current|max/i;

describe('хиты живут в State, не в useState', () => {
  const files = sources();

  it('сторож видит компоненты шага 5 и страницу стола', () => {
    const names = files.map(f => f.file.split('/').pop());
    for (const must of ['HpBar.tsx', 'HpControl.tsx', 'PartySpineRow.tsx', 'EntityCard.tsx', 'DeskPage.tsx']) {
      expect(names, `в списке нет ${must}`).toContain(must);
    }
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it('ни один useState в src/components и DeskPage не называется hp, current или max', () => {
    let seen = 0;
    const offenders: string[] = [];
    for (const { file, text } of files) {
      for (const m of text.matchAll(USE_STATE)) {
        seen++;
        const name = m[1] ?? '?';
        if (HP_NAME.test(name)) offenders.push(`${file.split('/').pop()}: [${name}] = useState`);
      }
    }
    // Знаменатель: черновик поля и вспышка — законные useState, их не меньше трёх.
    expect(seen).toBeGreaterThanOrEqual(3);
    expect(offenders).toEqual([]);
  });

  it('ни один компонент не импортирует стор напрямую: состояние приходит пропсами', () => {
    const comps = files.filter(f => f.file.startsWith(COMPONENTS));
    expect(comps.length).toBeGreaterThanOrEqual(8);
    for (const { file, text } of comps) {
      expect(text, `${file.split('/').pop()} ходит в стор`).not.toMatch(/from\s+['"]zustand['"]|createEngineStore|seedEngine|useEngine/);
    }
  });
});
