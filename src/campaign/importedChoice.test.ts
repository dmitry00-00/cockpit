import { describe, expect, it } from 'vitest';
import { classById } from '../rules/compendium';
import { importedChoicesOf, IMPORTED_CHOICE_ADAPTERS, OWNER_TABLES_PROVENANCE } from './importedChoice';

describe('curated imported book choice schedules', () => {
  it('keeps the exact Arcane Archer schedule, linked block, options and provenance', () => {
    const cls = classById('voin')!;
    const subclassId = 'voin-misticeskiy-lucnik';
    const choiceId = 'book-choice:voin:voin-misticeskiy-lucnik:magiceskiy-vystrel';
    const levels = [3, 7, 10, 15, 18];
    const archer = IMPORTED_CHOICE_ADAPTERS.find(adapter => adapter.subclassId === subclassId)!;
    expect(archer.gains).toEqual([{ level: 3, count: 2 }, { level: 7, count: 1 }, { level: 10, count: 1 }, { level: 15, count: 1 }, { level: 18, count: 1 }]);
    expect(cls.options!.find(block => block.id === archer.optionBlockId)?.subclassId).toBe(subclassId);
    expect(cls.options!.find(block => block.id === archer.optionBlockId)!.items.map(item => item.id)).toEqual(archer.optionIds);
    for (const level of levels) {
      const [choice] = importedChoicesOf(cls, level, subclassId);
      expect(choice).toMatchObject({ id: choiceId, count: archer.gains.find(gain => gain.level === level)!.count, cumulativeCount: archer.gains.filter(gain => gain.level <= level).reduce((sum, gain) => sum + gain.count, 0), source: 'book', ruleset: OWNER_TABLES_PROVENANCE });
      expect(choice.adapter.evidence.bookEdition).toBe('not-marked-in-content');
      expect(choice.options.every(option => option.source === 'book')).toBe(true);
      if (level === 3) expect(choice.sourceCells).toEqual([
        { id: 'isusaa-strela', cell: 'W23' }, { id: 'tenevaa-strela', cell: 'X23' },
        { id: 'izgonausaa-strela', cell: 'W24' }, { id: 'pronzausaa-strela', cell: 'X24' },
        { id: 'vzryvnaa-strela', cell: 'W25' }, { id: 'sjimausaa-strela', cell: 'X25' },
        { id: 'oslablausaa-strela', cell: 'W26' }, { id: 'obmannaa-strela', cell: 'X26' },
      ]);
    }
    expect(importedChoicesOf(cls, 4, subclassId)).toEqual([]);
  });

  it('uses an explicit Battle Master binding for the unlinked maneuver list', () => {
    const cls = classById('voin')!;
    const subclassId = 'voin-master-boevyh-isskustv';
    const adapter = IMPORTED_CHOICE_ADAPTERS.find(item => item.subclassId === subclassId)!;
    expect(adapter.optionBlockId).toBe('priemy');
    expect(adapter.requireBlockSubclassLink).toBe(false);
    expect(adapter.gains).toEqual([{ level: 3, count: 3 }, { level: 7, count: 2 }, { level: 10, count: 2 }, { level: 15, count: 2 }]);
    expect(importedChoicesOf(cls, 3, subclassId)[0].options).toHaveLength(22);
    const old = adapter.optionIds.slice(0, 3).map(id => ({ id }));
    const next = importedChoicesOf(cls, 7, subclassId, [{ id: adapter.choiceId, label: 'Приёмы', values: old }])[0];
    expect(next).toMatchObject({ count: 2, cumulativeCount: 5 });
    expect(next.options.map(option => option.id)).not.toEqual(expect.arrayContaining(old.map(value => value.id)));
    expect(next.options.every(option => option.source === 'book')).toBe(true);
  });

  it('Kensei uses source-defined category groups at 3 and one new weapon type later', () => {
    const cls = classById('monah')!;
    const subclassId = 'monah-kensea';
    const adapter = IMPORTED_CHOICE_ADAPTERS.find(item => item.subclassId === subclassId)!;
    expect(adapter.gains).toEqual([{ level: 3, count: 2 }, { level: 6, count: 1 }, { level: 11, count: 1 }, { level: 17, count: 1 }]);
    const [initial] = importedChoicesOf(cls, 3, subclassId);
    expect(initial).toMatchObject({ source: 'book', ruleset: OWNER_TABLES_PROVENANCE });
    expect(initial.selectionGroups?.map(group => [group.id, group.required])).toEqual([['melee', 1], ['ranged', 1]]);
    expect(initial.selectionGroups?.[0].options.every(option => option.text?.includes('рукопашное'))).toBe(true);
    expect(initial.selectionGroups?.[1].options.every(option => option.text?.includes('дальнобойное'))).toBe(true);
    expect(initial.selectionGroups?.[1].options.some(option => option.id === 'longbow')).toBe(true);
    expect(initial.options.every(option => option.source === 'srd')).toBe(true);
    expect(initial.adapter.evidence.options).toBe('content/srd/equipment.json:items');

    const saved = [{ id: initial.id, label: initial.label, values: [
      { id: 'dagger' }, { id: 'shortbow' },
    ] }];
    const [later] = importedChoicesOf(cls, 6, subclassId, saved);
    expect(later).toMatchObject({ count: 1, cumulativeCount: 3, source: 'book' });
    expect(later.selectionGroups).toHaveLength(1);
    expect(later.selectionGroups?.[0].id).toBe('any');
    expect(later.options.map(option => option.id)).not.toEqual(expect.arrayContaining(['dagger', 'shortbow']));
    expect(importedChoicesOf(cls, 5, subclassId)).toEqual([]);
  });
});
