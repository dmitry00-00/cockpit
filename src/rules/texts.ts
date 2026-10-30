// Загрузка текстов справочников (ROADMAP 0.5): ядро — до первой отрисовки (стол рисуется сразу: числа, имена, уровни;
// своим куском под await, TASKS Q18 — те же модули, что у compendium/index.ts и srd/spells.ts),
// тексты умений, черт, заклинаний и действий — отдельным куском сразу после первой отрисовки. loadTexts() возвращает
// их в те же объекты (rules/textSplit.ts); useTextsReady() перерисовывает страницу, когда тексты на месте. Тесты
// грузят тексты в общем setup до первого теста — для них деления нет.
import { useSyncExternalStore } from 'react';
import monsters from '../../content/srd/monsters.json?split=core&ids=bandit,bandit-captain';
import { hydrateTexts } from './textSplit';

const [classes, feats, races, spells] = await Promise.all([
  import('../../content/compendium/classes.json?split=core'),
  import('../../content/compendium/feats.json?split=core'),
  import('../../content/compendium/races.json?split=core'),
  import('../../content/srd/spells.json?split=core'),
]).then(ms => ms.map(m => m.default));

const PARTS: readonly (readonly [unknown, () => Promise<{ default: unknown }>])[] = [
  [classes, () => import('../../content/compendium/classes.json?split=texts')],
  [feats, () => import('../../content/compendium/feats.json?split=texts')],
  [races, () => import('../../content/compendium/races.json?split=texts')],
  // Монстры в основном куске — только блоки сида; остальные SRD догружаются целиком, с текстами (rules/srd/monsters.ts).
  [monsters, () => import('../../content/srd/monsters.json?split=texts&ids=bandit,bandit-captain')],
  [spells, () => import('../../content/srd/spells.json?split=texts')],
];

let loading: Promise<void> | null = null;
let ready = false;
const listeners = new Set<() => void>();

/** Тексты на места; повторный вызов — тот же промис. */
export function loadTexts(): Promise<void> {
  loading ??= Promise.all(PARTS.map(async ([core, load]) => hydrateTexts(core, (await load()).default as string[]))).then(() => {
    ready = true;
    for (const l of listeners) l();
  });
  return loading;
}

export const textsLoaded = (): boolean => ready;

/** true, когда тексты на местах; до того — false, и компонент перерисуется по загрузке. */
export function useTextsReady(): boolean {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => ready,
    () => ready,
  );
}
