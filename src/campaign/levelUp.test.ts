// Q10: повышение уровня по листу и правка листа с причиной — события CHARACTER_LEVELED и SHEET_EDITED на сиде; отмена
// возвращает уровень, хиты и ресурсы; реплей до и после даёт то же состояние.
import { describe, expect, it } from 'vitest';
import { EventLog, journalEntries } from '../engine';
import { LevelUpError, levelUp, levelUpPlan } from './levelUp';
import { resourcePoolsOf } from './resources';
import { seedState } from './seed';
import { abilityMod } from './derive';

describe('повышение уровня (Q10)', () => {
  it('Korrin, воин 5 → 6: увеличение на 6-м (SRD воина), +2 STR; хиты — среднее d10 + CON + 1 «Дварфская выдержка»', () => {
    const s = seedState();
    const k = s.actors.korrin;
    const plan = levelUpPlan(k);
    expect(plan).toMatchObject({ level: 6, die: 10, average: 6, asi: true, subclasses: null });
    const ev = levelUp(k, { hp: { method: 'average' }, asi: { str: 2 } });
    const con = abilityMod(k.sheet!.abilities.con);
    expect(ev.sheet).toMatchObject({ level: 6, abilities: { str: k.sheet!.abilities.str + 2 } });
    expect(k.sheet!.traits.map(t => t.name)).toContain('Дварфская Выдержка');
    expect(ev.hpMax).toBe(k.hp.max + 6 + con + 1);
    expect(ev.hp).toEqual({ method: 'average', value: 6 });
    expect(ev.gained).toContain('+2 STR');
  });

  it('событие: уровень, хиты (и нынешние), ресурсы; Ctrl+Z — как было; реплей с нуля — то же', () => {
    const s = seedState();
    const log = new EventLog(s, []);
    const before = structuredClone(log.state.actors.bo);
    const pools = resourcePoolsOf(before);
    const ev = levelUp(before, { hp: { method: 'roll', roll: 3 } });
    log.dispatch({ type: 'CHARACTER_LEVELED', payload: ev });
    const bo = log.state.actors.bo;
    expect(bo.sheet!.level).toBe(6);
    expect(bo.hp.max - before.hp.max).toBe(bo.hp.current - before.hp.current);
    expect(journalEntries(log.entries, log.state).at(-1)!.text).toMatch(/^Bo Tambernack — 6-й уровень: максимум хитов \d+ \(бросок 3\)/);
    const replayed = new EventLog(seedState(), log.entries);
    expect(replayed.state.actors.bo).toEqual(bo);
    log.undo();
    expect(log.state.actors.bo).toEqual(before);
    expect(resourcePoolsOf(log.state.actors.bo)).toEqual(pools);
    log.redo();
    expect(log.state.actors.bo.sheet!.level).toBe(6);
  });

  it('проверки: бросок вне кости, увеличение не на своём уровне, +3, подкласс на уровне выбора; движок — только на один', () => {
    const s = seedState();
    expect(() => levelUp(s.actors.bo, { hp: { method: 'roll', roll: 11 } })).toThrow(LevelUpError);
    expect(() => levelUp(s.actors.bo, { hp: { method: 'average' }, asi: { dex: 2 } })).toThrow(/увеличения характеристик нет/);
    expect(() => levelUp(s.actors.korrin, { hp: { method: 'average' }, asi: { str: 3 } })).toThrow(/\+2 к одной или \+1 к двум/);
    const low = { ...s.actors.korrin, sheet: { ...s.actors.korrin.sheet!, level: 2, subclassId: undefined } };
    expect(levelUpPlan(low).subclasses?.length).toBeGreaterThan(0);
    expect(() => levelUp(low, { hp: { method: 'average' } })).toThrow(/выбирается подкласс/);
    const sub = levelUpPlan(low).subclasses![0];
    expect(levelUp(low, { hp: { method: 'average' }, subclassId: sub.id }).gained[0]).toBe(`подкласс ${sub.name}`);
    const log = new EventLog(s, []);
    const ev = levelUp(s.actors.bo, { hp: { method: 'average' } });
    expect(() => log.dispatch({ type: 'CHARACTER_LEVELED', payload: { ...ev, sheet: { ...ev.sheet, level: 7 } } })).toThrow(/повышение на один/);
  });
});

describe('правка листа (SHEET_EDITED)', () => {
  it('паспорт с причиной; журнал — поле и причина; без причины и не паспортное поле — нельзя; отмена', () => {
    const log = new EventLog(seedState(), []);
    const was = log.state.actors.bo.sheet!.alignment;
    log.dispatch({ type: 'SHEET_EDITED', payload: { actorId: 'bo', patch: { alignment: 'Хаотично-добрый' }, reason: 'игрок уточнил' } });
    expect(log.state.actors.bo.sheet!.alignment).toBe('Хаотично-добрый');
    expect(journalEntries(log.entries, log.state).at(-1)!.text).toBe('Лист Bo Tambernack: мировоззрение: Хаотично-добрый · причина: игрок уточнил');
    expect(() => log.dispatch({ type: 'SHEET_EDITED', payload: { actorId: 'bo', patch: { alignment: 'Н' }, reason: ' ' } })).toThrow(/нужна причина/);
    expect(() => log.dispatch({ type: 'SHEET_EDITED', payload: { actorId: 'bo', patch: { level: 9 } as never, reason: 'x' } })).toThrow(/правятся только/);
    log.undo();
    expect(log.state.actors.bo.sheet!.alignment).toBe(was);
  });
});
