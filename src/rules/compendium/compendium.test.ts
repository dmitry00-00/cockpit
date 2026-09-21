// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { RACES, FEATS, CLASSES, COMPENDIUM_META, bySource } from './index';
import { CONDITION_IDS } from '../srd/conditions';

/** Числа — из таблиц (замер 18.09.2026): расхождение значит, что импортёр или таблица изменились. */
describe('компендиум из таблиц', () => {
  it('состав: 38 рас, 62 подрасы, 172 черты, 13 классов', () => {
    expect(RACES).toHaveLength(38);
    expect(RACES.reduce((n, r) => n + r.subraces.length, 0)).toBe(62);
    expect(FEATS).toHaveLength(172);
    expect(CLASSES).toHaveLength(13);
    expect(CLASSES.map(c => c.nameRu)).toContain('Изобретатель');
  });

  it('у каждой записи есть источник, и SRD-подмножество — ровно то, что есть в SRD 5.1', () => {
    const all = [...RACES, ...RACES.flatMap(r => r.subraces), ...FEATS, ...CLASSES, ...CLASSES.flatMap(c => c.subclasses)];
    for (const x of all) expect(['srd', 'book', 'hb'], x.id).toContain(x.source);
    expect(bySource(RACES, ['srd']).map(r => r.name).sort()).toEqual(['Dragonborn', 'Dwarf', 'Elf', 'Gnome', 'Half-Elf', 'Half-Orc', 'Halfling', 'Human', 'Tiefling']);
    expect(bySource(RACES.flatMap(r => r.subraces), ['srd']).map(s => s.name).sort()).toEqual(['High Elf', 'Hill Dwarf', 'Lightfoot', 'Rock Gnome']);
    expect(bySource(FEATS, ['srd']).map(f => f.name)).toEqual(['Grappler']);
    expect(bySource(CLASSES, ['srd'])).toHaveLength(12);
    expect(CLASSES.find(c => c.nameRu === 'Изобретатель')?.source).toBe('book');
    expect(bySource(FEATS, ['hb'])).toHaveLength(5);
    for (const c of bySource(CLASSES, ['srd'])) expect(c.subclasses.filter(s => s.source === 'srd').length, c.name).toBe(1);
  });

  it('id уникальны внутри своего списка', () => {
    const dup = (ids: string[]) => ids.filter((x, i) => ids.indexOf(x) !== i);
    expect(dup(RACES.map(r => r.id))).toEqual([]);
    expect(dup(FEATS.map(f => f.id))).toEqual([]);
    expect(dup(CLASSES.map(c => c.id))).toEqual([]);
    for (const r of RACES) expect(dup(r.subraces.map(s => s.id)), r.nameRu).toEqual([]);
    for (const c of CLASSES) expect(dup(c.subclasses.map(s => s.id)), c.nameRu).toEqual([]);
  });

  it('ASI подрасы — числа −2…2 по шести характеристикам; у расы либо ASI, либо подрасы', () => {
    for (const r of RACES) {
      expect(r.asi !== undefined || r.subraces.length > 0, r.nameRu).toBe(true);
      for (const s of r.subraces) {
        for (const [ab, v] of Object.entries(s.asi)) {
          expect(['str', 'dex', 'con', 'int', 'wis', 'cha']).toContain(ab);
          expect(Math.abs(v)).toBeLessThanOrEqual(2);
        }
      }
    }
    expect(RACES.find(r => r.name === 'Elf')?.subraces.find(s => s.name === 'High Elf')?.asi).toEqual({ dex: 2, int: 1 });
    expect(RACES.find(r => r.name === 'Human')?.asi).toEqual({ str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 });
  });

  it('черты рас: у каждой имя и фасет; фасет по ключевому слову помечен как эвристика', () => {
    const traits = RACES.flatMap(r => [...r.traits, ...r.subraces.flatMap(s => s.traits)]);
    expect(traits.length).toBeGreaterThan(200);
    for (const t of traits) {
      expect(t.name.length).toBeGreaterThan(1);
      expect(['keyword', 'text'], t.name).toContain(t.kindSource); // обе — эвристики импортёра; 'fill' — отметка листа, она в facetMarks
    }
    const other = traits.filter(t => t.kind === 'other').length;
    expect(other / traits.length).toBeLessThan(0.35); // эвристика, а не истина (замер 18.09: 73 из 246); треть и больше «прочего» — сигнал переписать правила
  });

  it('классы: 20 уровней, бонус мастерства 2…6, у подкласса — уровень получения', () => {
    for (const c of CLASSES) {
      expect(c.levels.map(l => l.level)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
      expect(c.levels[0].proficiencyBonus).toBe(2);
      expect(c.levels[19].proficiencyBonus).toBe(6);
      expect(c.subclasses.length, c.nameRu).toBeGreaterThanOrEqual(4); // у изобретателя в таблице ровно четыре
      for (const s of c.subclasses) expect(s.gainedAt, `${c.nameRu}: ${s.name}`).not.toBeNull();
      expect(Object.keys(c.proficiencies).length, c.nameRu).toBeGreaterThanOrEqual(3);
    }
    const fighter = CLASSES.find(c => c.name === 'Fighter')!;
    expect(fighter.levels[4].features.map(f => f.name)).toContain('Дополнительная атака');
    expect(fighter.subclasses.find(s => s.source === 'srd')?.name).toBe('Чемпион');
    const ranger = CLASSES.find(c => c.name === 'Ranger')!;
    expect(ranger.levels[1].resources['1']).toBe('2');
  });

  it('в компендиуме нет эмодзи, а состояния SRD не дублируются', () => {
    const text = JSON.stringify([RACES, FEATS, CLASSES]);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(CONDITION_IDS).toHaveLength(15);
    expect(COMPENDIUM_META.license).toMatch(/CC-BY/);
  });
});
