// Персонаж как путь (Д8): дорога класса на 20 уровней по листу сида; «следующий уровень даст»; пробелы партии —
// лечение, тёмное зрение, ловушки — по правилу стола.
import { describe, expect, it } from 'vitest';
import { nextLevelText, partyGaps, pathOf } from './path';
import { partySummaryOf } from './sheetView';
import { seedState } from './seed';

const s = seedState();
const party = s.party.map(id => s.actors[id]);

describe('pathOf', () => {
  it('Korrin, воин 5: 20 ступеней, нынешняя — 5-я; на 6-м — увеличение характеристик SRD (у воина оно и на 6-м)', () => {
    const path = pathOf(s.actors.korrin.sheet!)!;
    expect(path.steps).toHaveLength(20);
    expect(path.steps.filter(x => x.state === 'now').map(x => x.level)).toEqual([5]);
    expect(path.steps.filter(x => x.state === 'past')).toHaveLength(4);
    expect(path.steps[5]).toMatchObject({ level: 6, state: 'next', asi: true });
    expect(path.steps[0].features.map(f => f.name)).toEqual(['Второе дыхание', 'Боевой стиль']);
    expect(nextLevelText(path)).toBe('Следующий уровень (6-й) даст: увеличение характеристик или черта');
  });

  it('подкласс выбран — его умения на своих уровнях; не выбран — «выбор подкласса» там, где класс его даёт', () => {
    const aldric = pathOf(s.actors.aldric.sheet!)!;
    expect(aldric.subclassName).toBeDefined();
    expect(aldric.steps.flatMap(x => x.subclass).length).toBeGreaterThan(0);
    const noSub = pathOf({ ...s.actors.korrin.sheet!, subclassId: undefined, level: 2 })!;
    expect(noSub.steps.filter(x => x.subclassPick).map(x => x.level)).toEqual([3]);
    expect(nextLevelText(noSub)).toContain('выбор подкласса');
    expect(nextLevelText(pathOf({ ...s.actors.korrin.sheet!, level: 20 })!)).toBeNull();
  });
});

describe('пробелы партии', () => {
  it('лечение есть (Aldric с 1-го, Bo с 2-го), тёмное зрение — у дварфа и эльфа, ловушки — ни у кого', () => {
    const gaps = Object.fromEntries(partyGaps(party).map(g => [g.capability, g]));
    expect(gaps.healing.covered).toBe(true);
    expect(gaps.healing.who.map(w => [w.name, w.from])).toEqual([['Bo Tambernack', 2], ['Brother Aldric', 1]]);
    expect(gaps.darkvision.who.map(w => w.name)).toEqual(['Korrin Battlehammer', 'Lyra Moonwhisper']);
    expect(gaps.traps).toMatchObject({ covered: false, who: [] });
    // Партия первого уровня: следопыт лечит только со 2-го.
    const low = partyGaps([{ ...s.actors.bo, sheet: { ...s.actors.bo.sheet!, level: 1 } }]);
    expect(low[0]).toMatchObject({ capability: 'healing', covered: false, who: [{ name: 'Bo Tambernack', from: 2, now: false }] });
  });

  it('сводка партии — строками: есть — кто; нет — у кого с какого уровня или «ни у кого»', () => {
    expect(partySummaryOf(party).capabilities.map(c => [c.label, c.covered, c.who])).toEqual([
      ['Лечение', true, 'Bo Tambernack, Brother Aldric'],
      ['Тёмное зрение', true, 'Korrin Battlehammer, Lyra Moonwhisper'],
      ['Снятие ловушек', false, 'ни у кого'],
    ]);
    expect(partySummaryOf([{ ...s.actors.bo, sheet: { ...s.actors.bo.sheet!, level: 1 } }]).capabilities[0].who).toBe('Bo Tambernack с 2-го');
  });
});
