// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { RACES, FEATS, CLASSES } from './index';
import {
  raceFacetRows, usedTraitKinds, traitKindOrder, marksOf, isFlatAsi, formatAsi,
  classLevelGrid, isSlotKey, featRows, usedEffectKinds, effectKindOrder, asiLevels, TRAIT_KINDS,
} from './views';

describe('матрица «раса × фасет»', () => {
  it('раса идёт перед своими подрасами, и каждая черта попадает ровно в одну клетку', () => {
    const rows = raceFacetRows(RACES, ['srd', 'book', 'hb']);
    expect(rows.filter(r => r.level === 'race')).toHaveLength(RACES.length);
    expect(rows.filter(r => r.level === 'subrace')).toHaveLength(RACES.reduce((n, r) => n + r.subraces.length, 0));
    for (const race of RACES) {
      const i = rows.findIndex(r => r.key === race.id);
      for (const s of race.subraces) expect(rows.findIndex(r => r.key === `${race.id}/${s.id}`)).toBeGreaterThan(i);
    }
    for (const r of rows) {
      const inCells = TRAIT_KINDS.reduce((n, k) => n + r.cells[k].length, 0);
      const src = r.level === 'race' ? RACES.find(x => x.id === r.id)!.traits : RACES.flatMap(x => x.subraces).find(x => x.id === r.id)!.traits;
      expect(inCells, r.key).toBe(src.length);
    }
  });

  it('фильтр «только SRD» оставляет девять рас и четыре подрасы, а родитель SRD-подрасы не теряется', () => {
    const rows = raceFacetRows(RACES, ['srd']);
    expect(rows.filter(r => r.level === 'race')).toHaveLength(9);
    expect(rows.filter(r => r.level === 'subrace').map(r => r.name).sort()).toEqual(['High Elf', 'Hill Dwarf', 'Lightfoot', 'Rock Gnome']);
    // раса из книги с одной подрасой SRD в компендиуме не встречается — но правило должно держать её родителя
    const fake = [{ ...RACES[0], id: 'x', source: 'book' as const, subraces: [{ ...RACES[0].subraces[0], id: 'y', source: 'srd' as const }] }];
    expect(raceFacetRows(fake, ['srd']).map(r => r.key)).toEqual(['x', 'x/y']);
  });

  it('колонки: «прочее» всегда последнее, самые частые фасеты — первые, пустые не показываются', () => {
    const order = traitKindOrder(RACES);
    expect(order[order.length - 1]).toBe('other');
    expect(new Set(order)).toEqual(new Set(TRAIT_KINDS));
    const count = (k: string) => RACES.flatMap(r => [...r.traits, ...r.subraces.flatMap(s => s.traits)]).filter(t => t.kind === k).length;
    for (let i = 1; i < order.length - 1; i++) expect(count(order[i - 1])).toBeGreaterThanOrEqual(count(order[i]));
    const used = usedTraitKinds(raceFacetRows(RACES, ['srd']), order);
    expect(used.length).toBeLessThan(TRAIT_KINDS.length);
    expect(used).toContain('vision'); // у дварфа и эльфа — серая отметка «vision» без текста черты
  });

  it('серые отметки листа: «limbs: Когти» — значение, «vision» — просто отметка, чужое имя — молча мимо', () => {
    expect(marksOf(['vision', 'limbs', 'limbs: Когти', 'nonsense'])).toEqual({ vision: true, limbs: 'Когти' });
  });

  it('ASI: у человека «ко всем», у остальных — список без нулей', () => {
    const human = RACES.find(r => r.name === 'Human')!;
    expect(isFlatAsi(human.asi)).toBe(true);
    const elf = RACES.find(r => r.name === 'Elf')!;
    expect(isFlatAsi(elf.asi)).toBe(false);
    expect(formatAsi(elf.asi)).toEqual([{ ability: 'dex', value: 2 }, { ability: 'int', value: 1 }]);
    expect(formatAsi(undefined)).toEqual([]);
  });
});

describe('сетка «уровень × подкласс»', () => {
  it('20 строк, бонус мастерства растёт от +2 до +6, ячейки — цифрами, умения подкласса стоят на своих уровнях', () => {
    const wizard = CLASSES.find(c => c.name === 'Wizard')!;
    const grid = classLevelGrid(wizard, ['srd', 'book', 'hb']);
    expect(grid.rows).toHaveLength(20);
    expect(grid.rows[0].proficiencyBonus).toBe(2);
    expect(grid.rows[19].proficiencyBonus).toBe(6);
    expect(grid.resourceKeys.filter(isSlotKey)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(grid.rows[0].resources['0']).toBe('3'); // заговоры 1-го уровня — целое, а не «3.0»
    for (const s of grid.subclasses) for (const row of grid.rows) for (const f of row.bySubclass[s.id]) expect(f.level).toBe(row.level);
    const evocation = grid.subclasses.find(s => s.source === 'srd')!;
    expect(grid.rows[1].bySubclass[evocation.id].length).toBeGreaterThan(0); // школа выбирается на 2-м
  });

  it('фильтр источников убирает подклассы из книги, SRD-подкласс остаётся', () => {
    const cleric = CLASSES.find(c => c.name === 'Cleric')!;
    const grid = classLevelGrid(cleric, ['srd']);
    expect(grid.subclasses.map(s => s.name)).toEqual(['Жизни']);
  });

  it('уровни повышения характеристик — правило SRD: воин +6 и +14, плут +10', () => {
    expect([...asiLevels('volsebnik')].sort((a, b) => a - b)).toEqual([4, 8, 12, 16, 19]);
    expect([...asiLevels('voin')].sort((a, b) => a - b)).toEqual([4, 6, 8, 12, 14, 16, 19]);
    expect([...asiLevels('plut')].sort((a, b) => a - b)).toEqual([4, 8, 10, 12, 16, 19]);
  });
});

describe('таблица «черта × эффект»', () => {
  it('поиск ищет по названию и тексту, фильтр — по источнику, колонки — только занятые', () => {
    const all = featRows(FEATS, ['srd', 'book', 'hb']);
    expect(all).toHaveLength(FEATS.length);
    expect(featRows(FEATS, ['srd']).map(r => r.feat.name)).toEqual(['Grappler']);
    const q = featRows(FEATS, ['srd', 'book', 'hb'], 'концентрац');
    expect(q.length).toBeGreaterThan(0);
    for (const r of q) expect((r.feat.nameRu + r.feat.text).toLowerCase()).toContain('концентрац');
    const order = effectKindOrder(FEATS);
    const used = usedEffectKinds(all, order);
    for (const k of used) expect(all.some(r => r.feat.effects[k])).toBe(true);
    const count = (k: (typeof order)[number]) => FEATS.filter(f => f.effects[k]).length;
    for (let i = 1; i < order.length; i++) expect(count(order[i - 1])).toBeGreaterThanOrEqual(count(order[i]));
  });

  it('имена черт не набраны капсом — регистр выровнен импортёром', () => {
    for (const f of FEATS) expect(f.nameRu, f.id).not.toMatch(/^[А-ЯЁ]{4,}/);
  });
});
