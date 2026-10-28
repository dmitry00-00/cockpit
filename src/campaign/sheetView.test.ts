import { describe, expect, it } from 'vitest';
import { seedEngine } from './seed';
import { GROUP_CHECKS, missingFieldsOf, partySummaryOf, passportOf, sheetViewOf } from './sheetView';

const state = () => seedEngine().getState().state;

describe('sheetViewOf: лист числами', () => {
  it('Bo: DEX 16 → +3, спасбросок DEX +6 с владением, Скрытность +6, инициатива +3, кости хитов d10 5/5', () => {
    const v = sheetViewOf(state().actors.bo)!;
    expect(v.abilities.find(a => a.id === 'dex')).toEqual({ id: 'dex', score: 16, mod: 3, save: 6, saveProficient: true });
    expect(v.abilities.find(a => a.id === 'wis')).toMatchObject({ save: 2, saveProficient: false });
    expect(v.skills.find(s => s.id === 'stealth')).toEqual({ id: 'stealth', ability: 'dex', mod: 6, proficiency: 'proficient' });
    expect(v.skills).toHaveLength(18);
    expect(v.initiative).toBe(3);
    expect(v.proficiencyBonus).toBe(3);
    expect(v.hitDice).toEqual({ die: 10, available: 5, total: 5 });
  });

  it('у монстра листа нет — и вида нет', () => {
    const s = state();
    const monster = Object.values(s.actors).find(a => a.kind === 'monster')!;
    expect(sheetViewOf(monster)).toBeUndefined();
  });
});

describe('паспорт данных', () => {
  it('сид: раса и класс с источником, пробелы — словами поля', () => {
    const s = state();
    const p = passportOf(s.actors.bo)!;
    expect(p.origin).toBe('сид кампании');
    expect(p.parts[1]).toBe('класс SRD');
    expect(p.missing).not.toContain('мировоззрение');
    expect(missingFieldsOf(s.actors.korrin)).toContain('мировоззрение');
    expect(missingFieldsOf(s.actors.korrin)).toContain('рост, вес, возраст');
  });

  it('создан событием ACTOR_SPAWNED — «создан за столом»', () => {
    const s = state();
    const ev = { id: 'e', seq: 1, at: 0, worldSec: 0, type: 'ACTOR_SPAWNED' as const, payload: { actor: s.actors.bo, party: true } };
    expect(passportOf(s.actors.bo, [ev])!.origin).toBe('создан за столом');
  });
});

describe('partySummaryOf: сводка выборки', () => {
  it('партия: лучший и худший по каждой групповой проверке, хиты суммой, ячейки только у заклинателей', () => {
    const s = state();
    const party = s.party.map(id => s.actors[id]);
    const sum = partySummaryOf(party);
    expect(sum.count).toBe(4);
    expect(sum.levels).toEqual({ min: 5, max: 5 });
    expect(sum.leaders.map(l => l.skill)).toEqual(GROUP_CHECKS);
    const stealth = sum.leaders.find(l => l.skill === 'stealth')!;
    expect(stealth.best.mod).toBeGreaterThanOrEqual(stealth.worst.mod);
    expect(stealth.best.name).toBe('Bo Tambernack');
    expect(sum.hp.max).toBe(party.reduce((n, a) => n + a.hp.max, 0));
    expect(sum.slots?.max).toBeGreaterThan(0);
    expect(partySummaryOf([s.actors.korrin]).slots).toBeUndefined();
    expect(sum.gaps.find(g => g.field === 'мировоззрение')?.names).toContain('Korrin Battlehammer');
  });
});
