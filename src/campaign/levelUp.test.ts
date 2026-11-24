// Q10: повышение уровня по листу и правка листа с причиной — события CHARACTER_LEVELED и SHEET_EDITED на сиде; отмена
// возвращает уровень, хиты и ресурсы; реплей до и после даёт то же состояние.
import { describe, expect, it } from 'vitest';
import { EventLog, journalEntries } from '../engine';
import { LevelUpError, levelUp, levelUpPlan } from './levelUp';
import { resourcePoolsOf } from './resources';
import { seedState } from './seed';
import { abilityMod } from './derive';
import { OWNER_TABLES_PROVENANCE } from './importedChoice';
import { leveledSnapshot } from '../engine/characterLevel';

describe('повышение уровня (Q10)', () => {
  const featureChoicesFor = (actor: ReturnType<typeof seedState>['actors'][string]) => Object.fromEntries(
    levelUpPlan(actor).featureChoices.map(fc => [fc.id, fc.options.slice(0, fc.required).map(option => option.id)]),
  );
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

  it('предлагает черты слоя владельца, сохраняет происхождение и применяет только явный +1 выбора черты', () => {
    const actor = seedState().actors.korrin;
    const plan = levelUpPlan(actor);
    expect(plan.feats.some(feat => feat.source === 'book')).toBe(true);
    expect(plan.feats.some(feat => feat.source === 'hb')).toBe(false);
    expect(plan.feats.map(feat => feat.id)).toContain('ustoycivyy');

    const result = levelUp(actor, { hp: { method: 'average' }, featId: 'ustoycivyy', featAbility: 'wis' });
    expect(result.sheet.abilities.wis).toBe(actor.sheet!.abilities.wis + 1);
    expect(result.sheet.feats?.at(-1)).toMatchObject({
      id: 'ustoycivyy', at: 6, source: 'book', asi: 'wis',
      ruleset: { id: 'owner-tables', version: '2026.10.31', layer: 'content-compendium-feats-json' },
    });
    expect(result.gained).toContain('+1 WIS (черта)');
    expect(() => levelUp(actor, { hp: { method: 'average' }, featId: 'ustoycivyy', featAbility: 'wis', asi: { str: 2 } }))
      .toThrow(/увеличение характеристик отдельно/);
    expect(() => levelUp(actor, { hp: { method: 'average' }, featId: 'ustoycivyy', featAbility: 'invalid' as never }))
      .toThrow(/характеристику/);
  });

  it('применяет точный HP-эффект черты «Крепкий» и сохраняет +2 за следующие уровни', () => {
    const actor = seedState().actors.korrin;
    const targetLevel = actor.sheet!.level + 1;
    expect(levelUpPlan(actor).feats.map(feat => feat.id)).toContain('krepkiy');
    const normal = levelUp(actor, { hp: { method: 'average' }, asi: { str: 2 } });
    const tough = levelUp(actor, { hp: { method: 'average' }, featId: 'krepkiy' });
    expect(tough.hpMax - normal.hpMax).toBe(2 * targetLevel);
    expect(tough.gained).toContain(`+${2 * targetLevel} к максимуму хитов (Крепкий)`);
    expect(tough.sheet.feats?.at(-1)).toMatchObject({ id: 'krepkiy', at: targetLevel, source: 'book' });

    const snapshot = leveledSnapshot(actor, tough);
    const afterTough = { ...actor, ...snapshot, hp: { ...actor.hp, ...snapshot.hp } };
    const withoutFeat = { ...afterTough, sheet: { ...afterTough.sheet!, feats: [] } };
    const laterWithFeat = levelUp(afterTough, { hp: { method: 'average' } });
    const laterWithoutFeat = levelUp(withoutFeat, { hp: { method: 'average' } });
    expect(laterWithFeat.hpMax - laterWithoutFeat.hpMax).toBe(2);
    expect(levelUpPlan(afterTough).feats.map(feat => feat.id)).not.toContain('krepkiy');
  });

  it('событие: уровень, хиты (и нынешние), ресурсы; Ctrl+Z — как было; реплей с нуля — то же', () => {
    const s = seedState();
    const log = new EventLog(s, []);
    const before = structuredClone(log.state.actors.bo);
    const pools = resourcePoolsOf(before);
    const ev = levelUp(before, { hp: { method: 'roll', roll: 3 }, featureChoices: featureChoicesFor(before) });
    log.dispatch({ type: 'CHARACTER_LEVELED', payload: ev });
    const bo = log.state.actors.bo;
    expect(bo.sheet!.level).toBe(6);
    expect(bo.sheet!.choices?.flatMap(item => item.values).some(value => value.at === 6 && value.source === 'srd' && value.ruleset?.version === 'SRD 5.1')).toBe(true);
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
    expect(() => levelUp(s.actors.bo, { hp: { method: 'roll', roll: 11 }, featureChoices: featureChoicesFor(s.actors.bo) })).toThrow(LevelUpError);
    expect(() => levelUp(s.actors.bo, { hp: { method: 'average' }, asi: { dex: 2 }, featureChoices: featureChoicesFor(s.actors.bo) })).toThrow(/увеличения характеристик нет/);
    expect(() => levelUp(s.actors.korrin, { hp: { method: 'average' }, asi: { str: 3 } })).toThrow(/\+2 к одной или \+1 к двум/);
    const low = { ...s.actors.korrin, sheet: { ...s.actors.korrin.sheet!, level: 2, subclassId: undefined } };
    expect(levelUpPlan(low).subclasses?.length).toBeGreaterThan(0);
    expect(() => levelUp(low, { hp: { method: 'average' } })).toThrow(/выбирается подкласс/);
    const sub = levelUpPlan(low).subclasses!.find(item => item.id.includes('cempion'))!;
    expect(levelUp(low, { hp: { method: 'average' }, subclassId: sub.id }).gained[0]).toBe(`подкласс ${sub.name}`);
    const log = new EventLog(s, []);
    const ev = levelUp(s.actors.bo, { hp: { method: 'average' }, featureChoices: featureChoicesFor(s.actors.bo) });
    expect(() => log.dispatch({ type: 'CHARACTER_LEVELED', payload: { ...ev, sheet: { ...ev.sheet, level: 7 } } })).toThrow(/повышение на один/);
  });

  it('Battle Master сохраняет изученные приёмы, добавляет два и заменяет один известный по точной схеме книги', () => {
    const seeded = seedState().actors.korrin;
    const choiceId = 'book-choice:voin:voin-master-boevyh-isskustv:boevoe-prevoshodstvo';
    const known = ['takticeskaa-ocenka', 'otvlekausiy-udar', 'otvetnyy-udar'];
    const actor = { ...seeded, sheet: {
      ...seeded.sheet!, level: 6, subclassId: 'voin-master-boevyh-isskustv',
      choices: [{ id: choiceId, label: 'Боевое превосходство', values: known.map(id => ({ id, name: id, at: 3, source: 'book' as const })) }],
    } };
    const feature = levelUpPlan(actor).featureChoices.find(item => item.id === choiceId)!;
    expect(feature).toMatchObject({ required: 2, source: 'book', replacement: { known: expect.arrayContaining([expect.objectContaining({ id: known[0] })]) } });
    const added = feature.options.slice(0, 2).map(option => option.id);
    const replacedWith = feature.options[2].id;
    const result = levelUp(actor, {
      hp: { method: 'average' },
      featureChoices: { [choiceId]: added },
      featureChoiceReplacements: { [choiceId]: { from: known[0], to: replacedWith } },
    });
    const saved = result.sheet.choices!.find(item => item.id === choiceId)!.values;
    expect(saved.map(item => item.id)).toEqual([known[1], known[2], ...added, replacedWith]);
    expect(saved.find(item => item.id === replacedWith)).toMatchObject({ at: 7, source: 'book', ruleset: { id: 'owner-tables', version: '2026.10.31', layer: 'content-compendium-classes-json' } });
    expect(result.gained).toContain(`${feature.label}: ${feature.options[2].name} (замена)`);
    expect(() => levelUp(actor, {
      hp: { method: 'average' }, featureChoices: { [choiceId]: added },
      featureChoiceReplacements: { [choiceId]: { from: feature.options[0].id, to: feature.options[3].id } },
    })).toThrow(/замена варианта/);
  });

  it('Kensei требует рукопашный и дальнобойный тип на 3-м уровне и сохраняет выбор книги', () => {
    const seeded = seedState().actors.korrin;
    const subclassId = 'monah-kensea';
    const choiceId = 'book-choice:monah:monah-kensea:put-kensea:weapons';
    const actor = { ...seeded, sheet: { ...seeded.sheet!, classId: 'monah', level: 2, subclassId: undefined } };
    const feature = levelUpPlan(actor, subclassId).featureChoices.find(item => item.id === choiceId)!;
    expect(feature.selectionGroups?.map(group => group.id)).toEqual(['melee', 'ranged']);
    expect(() => levelUp(actor, { hp: { method: 'average' }, subclassId, featureChoices: { [choiceId]: ['dagger', 'quarterstaff'] } }))
      .toThrow(/категории выбора/);

    const result = levelUp(actor, { hp: { method: 'average' }, subclassId, featureChoices: { [choiceId]: ['dagger', 'shortbow'] } });
    expect(result.sheet.choices?.find(item => item.id === choiceId)?.values).toEqual([
      expect.objectContaining({ id: 'dagger', at: 3, source: 'book', ruleset: OWNER_TABLES_PROVENANCE }),
      expect.objectContaining({ id: 'shortbow', at: 3, source: 'book', ruleset: OWNER_TABLES_PROVENANCE }),
    ]);
    const state = seedState();
    state.actors.korrin = actor;
    const log = new EventLog(state, []);
    log.dispatch({ type: 'CHARACTER_LEVELED', payload: result });
    expect(log.state.actors.korrin.sheet?.choices?.find(item => item.id === choiceId)?.values.map(value => value.id)).toEqual(['dagger', 'shortbow']);
    log.undo();
    expect(log.state.actors.korrin.sheet?.level).toBe(2);
    expect(log.state.actors.korrin.sheet?.choices?.some(item => item.id === choiceId) ?? false).toBe(false);
    log.redo();
    expect(log.state.actors.korrin.sheet?.choices?.find(item => item.id === choiceId)?.values.map(value => value.id)).toEqual(['dagger', 'shortbow']);
  });

  it('показывает открывающиеся заклинания книжного подкласса по уровню ячеек', () => {
    const seeded = seedState().actors.bo;
    const warlock = { ...seeded, sheet: { ...seeded.sheet!, classId: 'koldun', level: 0, subclassId: undefined, spellcasting: undefined } };
    expect(levelUpPlan(warlock, 'koldun-arhifea').subclassSpellNotes).toEqual([
      { level: 1, name: 'Огонь фей', progression: 'spell', source: 'book' },
      { level: 1, name: 'Усыпление', progression: 'spell', source: 'book' },
    ]);
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
