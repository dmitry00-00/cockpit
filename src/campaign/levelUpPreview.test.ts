import { describe, expect, it } from 'vitest';
import { EventLog } from '../engine';
import { seedState } from './seed';
import { levelUpPlan } from './levelUp';
import { previewLevelUp } from './levelUpPreview';
import { classById } from '../rules/compendium';
import { spellcastingOf } from './build';
import { importedChoicesOf, IMPORTED_CHOICE_ADAPTERS, OWNER_TABLES_PROVENANCE } from './importedChoice';

describe('БА27: предпросмотр реального повышения', () => {
  it('применяет выборы Arcane Archer только на размеченных уровнях и хранит book provenance без механического обещания', () => {
    const state = seedState();
    const base = state.actors.korrin;
    const actor = { ...base, sheet: { ...base.sheet!, classId: 'voin', level: 2, subclassId: undefined } };
    state.actors.korrin = actor;
    const subclassId = 'voin-misticeskiy-lucnik';
    const plan = levelUpPlan(actor, subclassId);
    const adapter = IMPORTED_CHOICE_ADAPTERS.find(item => item.subclassId === subclassId)!;
    expect(plan.featureChoices).toContainEqual(expect.objectContaining({ id: adapter.choiceId, required: 2, source: 'book', ruleset: OWNER_TABLES_PROVENANCE, mechanicalSupport: 'informational' }));
    expect(importedChoicesOf(classById('voin')!, 4, subclassId)).toEqual([]);
    const selected = adapter.optionIds.slice(0, 2);
    const preview = previewLevelUp(actor, { hp: { method: 'average' }, subclassId, featureChoices: { [adapter.choiceId]: selected } });
    expect(preview.kind).toBe('ready');
    if (preview.kind !== 'ready') throw Error('preview failed');
    const saved = preview.actor.sheet!.choices!.find(choice => choice.id === adapter.choiceId)!;
    expect(saved.values).toEqual(selected.map(id => {
      const option = classById('voin')!.options!.find(block => block.id === adapter.optionBlockId)!.items.find(item => item.id === id)!;
      return { id, name: option.name, at: 3, source: 'book', ruleset: OWNER_TABLES_PROVENANCE };
    }));
    expect(preview.warnings).toContainEqual(expect.stringMatching(/механический эффект здесь не рассчитывается/));
    expect(preview.warnings).not.toContainEqual(expect.stringMatching(/выбор SRD записан/));
    const log = new EventLog(state, []);
    log.dispatch({ type: 'CHARACTER_LEVELED', payload: preview.change });
    expect(log.state.actors.korrin).toEqual(preview.actor);
    expect(new EventLog(state, log.entries).state.actors.korrin).toEqual(preview.actor);
    log.undo();
    expect(log.state.actors.korrin).toEqual(actor);
  });

  it('предлагает Maneuver schedule уровнями 3/7/10/15 и исключает уже сохранённые варианты', () => {
    const base = seedState().actors.korrin;
    const subclassId = 'voin-master-boevyh-isskustv';
    const adapter = IMPORTED_CHOICE_ADAPTERS.find(item => item.subclassId === subclassId)!;
    const cls = classById('voin')!;
    const block = cls.options!.find(item => item.id === 'priemy')!;
    const oldIds = adapter.optionIds.slice(0, 3);
    const actor = { ...base, sheet: { ...base.sheet!, classId: 'voin', level: 6, subclassId,
      choices: [{ id: adapter.choiceId, label: 'Боевое превосходство', values: oldIds.map(id => ({
        id, name: block.items.find(item => item.id === id)!.name, at: 3, source: 'book' as const, ruleset: OWNER_TABLES_PROVENANCE,
      })) }] } };
    const plan = levelUpPlan(actor);
    const maneuver = plan.featureChoices.find(choice => choice.id === adapter.choiceId)!;
    expect(maneuver).toMatchObject({ required: 2, source: 'book', ruleset: OWNER_TABLES_PROVENANCE });
    expect(maneuver.options.map(option => option.id)).not.toEqual(expect.arrayContaining(oldIds));
    const selected = maneuver.options.slice(0, 2).map(option => option.id);
    const preview = previewLevelUp(actor, { hp: { method: 'average' }, featureChoices: { [adapter.choiceId]: selected } });
    expect(preview.kind).toBe('ready');
    if (preview.kind !== 'ready') throw Error('preview failed');
    expect(preview.actor.sheet!.choices!.find(choice => choice.id === adapter.choiceId)!.values).toHaveLength(5);
    expect(preview.actor.sheet!.choices!.find(choice => choice.id === adapter.choiceId)!.values.slice(-2)).toMatchObject(selected.map(id => ({ id, at: 7, source: 'book', ruleset: OWNER_TABLES_PROVENANCE })));
    expect(preview.warnings).toContainEqual(expect.stringMatching(/механический эффект здесь не рассчитывается/));
  });

  it('проверяет SRD боевой стиль, сохраняет выбор с уровнем/источником и предупреждает о неподдержанном эффекте', () => {
    const base = seedState().actors.korrin;
    const actor = { ...base, sheet: { ...base.sheet!, classId: 'paladin', level: 1 } };
    const plan = levelUpPlan(actor);
    expect(plan.featureChoices).toMatchObject([{ id: 'fighting-style', required: 1, options: expect.arrayContaining([expect.objectContaining({ id: 'oborona', source: 'srd' })]) }]);
    expect(plan.featureChoices[0].options.every(option => option.source === 'srd')).toBe(true);
    expect(previewLevelUp(actor, { hp: { method: 'average' } })).toMatchObject({ kind: 'invalid', reason: expect.stringMatching(/Боевой стиль/) });
    expect(previewLevelUp(actor, { hp: { method: 'average' }, featureChoices: { 'fighting-style': ['book-only'] } })).toMatchObject({ kind: 'invalid', reason: expect.stringMatching(/недоступен/) });
    expect(previewLevelUp(actor, { hp: { method: 'average' }, featureChoices: { 'fighting-style': ['oborona', 'oborona'] } })).toMatchObject({ kind: 'invalid', reason: expect.stringMatching(/дважды/) });
    const preview = previewLevelUp(actor, { hp: { method: 'average' }, featureChoices: { 'fighting-style': ['oborona'] } });
    expect(preview.kind).toBe('ready');
    if (preview.kind !== 'ready') throw Error('preview failed');
    expect(preview.actor.sheet!.choices).toContainEqual({ id: 'fighting-style', label: 'Боевой стиль', values: [{ id: 'oborona', name: 'Оборона', at: 2, source: 'srd', ruleset: { id: 'dnd5e', version: 'SRD 5.1', layer: 'srd' } }] });
    expect(preview.warnings).toContainEqual(expect.stringMatching(/механический эффект здесь не рассчитывается/));
  });

  it('пересчитывает SRD выборы для предложенного подкласса без мутации листа', () => {
    const base = seedState().actors.korrin;
    const sorcerer = { ...base, sheet: { ...base.sheet!, classId: 'carodey', level: 0, subclassId: undefined } };
    const plain = levelUpPlan(sorcerer);
    const draconicId = plain.subclasses!.find(sub => sub.id.includes('nasledie-drakon'))!.id;
    expect(plain.featureChoices).toEqual([]);
    const proposed = levelUpPlan(sorcerer, draconicId);
    expect(proposed.featureChoices).toMatchObject([{ id: 'dragon-ancestor', required: 1, options: expect.arrayContaining([expect.objectContaining({ source: 'srd' })]) }]);
    expect(sorcerer.sheet!.subclassId).toBeUndefined();
  });

  it('UI plan и применение принимают заклинание из списка предложенного подкласса колдуна', () => {
    const base = seedState().actors.korrin;
    const warlock = { ...base, sheet: { ...base.sheet!, classId: 'koldun', level: 0, subclassId: undefined, spellcasting: undefined } };
    const basePlan = levelUpPlan(warlock);
    const fiendId = basePlan.subclasses!.find(sub => sub.id === 'koldun-iscadie')!.id;
    const subclassPlan = levelUpPlan(warlock, fiendId);
    const subclassOnlySpell = subclassPlan.spells!.options.find(spell => !basePlan.spells!.options.some(baseSpell => baseSpell.id === spell.id) && spell.level > 0)!;
    expect(subclassOnlySpell).toBeDefined();
    const cantrips = subclassPlan.spells!.options.filter(spell => spell.level === 0).slice(0, subclassPlan.spells!.cantrips).map(spell => spell.id);
    const leveled = [subclassOnlySpell.id, ...subclassPlan.spells!.options.filter(spell => spell.level > 0 && spell.id !== subclassOnlySpell.id).slice(0, subclassPlan.spells!.spells - 1).map(spell => spell.id)];
    const preview = previewLevelUp(warlock, { hp: { method: 'average' }, subclassId: fiendId, spells: [...cantrips, ...leveled] });
    expect(preview.kind).toBe('ready');
    if (preview.kind !== 'ready') throw Error('preview failed');
    expect(preview.actor.sheet!.spellcasting!.spells).toContain(subclassOnlySpell.id);
  });

  it('создаёт spellcasting sheet при первом уровне подготовки паладина', () => {
    const base = seedState().actors.korrin;
    const paladin = { ...base, sheet: { ...base.sheet!, classId: 'paladin', level: 1, subclassId: undefined, spellcasting: undefined } };
    const plan = levelUpPlan(paladin);
    expect(plan.prepared).toBeDefined();
    const preview = previewLevelUp(paladin, { hp: { method: 'average' }, featureChoices: { 'fighting-style': ['oborona'] } });
    expect(preview.kind).toBe('ready');
    if (preview.kind !== 'ready') throw Error('preview failed');
    expect(preview.actor.sheet!.spellcasting).toMatchObject({ kind: 'prepared', maxLevel: 1, cantrips: [], spells: [], preparedLimit: plan.prepared!.limit, ability: 'cha' });
  });

  it('волшебник получает два новых выбора даже при книге больше табличного минимума', () => {
    const base = seedState().actors.korrin;
    const cls = classById('volsebnik')!;
    const mods = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 } as const;
    const current = spellcastingOf(cls, 3, undefined, mods);
    if (current.kind !== 'plan') throw Error('missing wizard spell plan');
    const oldSpells = current.options.filter(spell => spell.level > 0).slice(0, 11).map(spell => spell.id);
    const oldCantrips = current.options.filter(spell => spell.level === 0).slice(0, 3).map(spell => spell.id);
    const actor = { ...base, sheet: { ...base.sheet!, classId: 'volsebnik', level: 3, subclassId: undefined,
      abilities: { ...base.sheet!.abilities, int: 16 },
      spellcasting: { ability: 'int' as const, saveDc: 13, attack: 5, kind: 'spellbook' as const, maxLevel: current.maxLevel, cantrips: oldCantrips, spells: oldSpells, always: [] },
    } };
    const plan = levelUpPlan(actor);
    expect(oldSpells).toHaveLength(11);
    expect(plan.spells).toMatchObject({ list: 'spellbook', cantrips: 1, spells: 2 });
    const selected = [
      ...plan.spells!.options.filter(spell => spell.level === 0).slice(0, 1),
      ...plan.spells!.options.filter(spell => spell.level > 0).slice(0, 2),
    ].map(spell => spell.id);
    const preview = previewLevelUp(actor, { hp: { method: 'average' }, asi: { int: 2 }, spells: selected });
    expect(preview.kind).toBe('ready');
    if (preview.kind !== 'ready') throw Error('preview failed');
    expect(preview.actor.sheet!.spellcasting!.spells).toEqual([...oldSpells, ...selected]);
    expect(preview.actor.sheet!.spellcasting!.cantrips).toHaveLength(4);
  });

  it('подготовленный жрец выбирает новый заговор, сохраняет подготовленные заклинания и пересчитывает лимит после ASI', () => {
    const base = seedState().actors.korrin;
    const cls = classById('jrec')!;
    const subclassId = 'jrec-jizni';
    const mods = { str: 0, dex: 0, con: 0, int: 0, wis: 3, cha: 0 } as const;
    const current = spellcastingOf(cls, 3, subclassId, mods);
    if (current.kind !== 'plan') throw Error('missing cleric spell plan');
    const cantrips = current.options.filter(spell => spell.level === 0).slice(0, current.cantrips).map(spell => spell.id);
    const prepared = current.options.filter(spell => spell.level > 0 && !current.always.includes(spell.id)).slice(0, 3).map(spell => spell.id);
    const actor = { ...base, sheet: { ...base.sheet!, classId: 'jrec', level: 3, subclassId,
      abilities: { ...base.sheet!.abilities, wis: 16 },
      spellcasting: { ability: 'wis' as const, saveDc: 13, attack: 5, kind: 'prepared' as const, maxLevel: current.maxLevel, cantrips, spells: prepared, preparedLimit: current.leveled, always: current.always },
    } };
    const plan = levelUpPlan(actor);
    expect(plan.spells).toMatchObject({ list: 'prepared', cantrips: 1, spells: 0 });
    expect(plan.prepared).toMatchObject({ current: prepared.length, limit: 7 });
    const gainedCantrip = plan.spells!.options.find(spell => spell.level === 0)!.id;
    const preview = previewLevelUp(actor, { hp: { method: 'average' }, asi: { wis: 2 }, spells: [gainedCantrip] });
    expect(preview.kind).toBe('ready');
    if (preview.kind !== 'ready') throw Error('preview failed');
    expect(preview.actor.sheet!.spellcasting).toMatchObject({ cantrips: [...cantrips, gainedCantrip], spells: prepared, preparedLimit: 8 });
  });

  it('на десятом уровне чародея предлагает только новый выбор Метамагии и сохраняет прежние picks', () => {
    const base = seedState().actors.korrin;
    const optionBlock = classById('carodey')!.options!.find(block => block.id === 'metamagia')!;
    const old = optionBlock.items.filter(option => option.source === 'srd').slice(0, 2);
    const ruleset = { id: 'dnd5e', version: 'SRD 5.1', layer: 'srd' };
    const cls = classById('carodey')!;
    const currentCasting = spellcastingOf(cls, 9, undefined, { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 });
    if (currentCasting.kind !== 'plan') throw Error('missing sorcerer spell plan');
    const currentCantrips = currentCasting.options.filter(spell => spell.level === 0).slice(0, currentCasting.cantrips).map(spell => spell.id);
    const currentSpells = currentCasting.options.filter(spell => spell.level > 0).slice(0, currentCasting.leveled).map(spell => spell.id);
    const actor = { ...base, sheet: { ...base.sheet!, classId: 'carodey', level: 9,
      spellcasting: { ability: 'cha' as const, saveDc: 14, attack: 6, kind: 'known' as const, maxLevel: currentCasting.maxLevel, cantrips: currentCantrips, spells: currentSpells, always: [] },
      choices: [{ id: 'metamagic', label: 'Метамагия', values: old.map(option => ({ id: option.id, name: option.name, at: 3, source: option.source, ruleset })) }] } };
    const plan = levelUpPlan(actor);
    expect(plan.featureChoices).toMatchObject([{ id: 'metamagic', required: 1 }]);
    expect(plan.featureChoices[0].options.some(option => old.some(value => value.id === option.id))).toBe(false);
    const option = plan.featureChoices[0].options[0];
    const newSpells = [
      ...plan.spells!.options.filter(spell => spell.level === 0).slice(0, plan.spells!.cantrips).map(spell => spell.id),
      ...plan.spells!.options.filter(spell => spell.level > 0).slice(0, plan.spells!.spells).map(spell => spell.id),
    ];
    const preview = previewLevelUp(actor, { hp: { method: 'average' }, featureChoices: { metamagic: [option.id] }, spells: newSpells });
    expect(preview.kind).toBe('ready');
    if (preview.kind !== 'ready') throw Error('preview failed');
    expect(preview.actor.sheet!.choices!.find(choice => choice.id === 'metamagic')!.values).toEqual([
      ...old.map(value => ({ id: value.id, name: value.name, at: 3, source: 'srd', ruleset })),
      { id: option.id, name: option.name, at: 10, source: 'srd', ruleset },
    ]);
    expect(preview.warnings).toContainEqual(expect.stringMatching(/механический эффект здесь не рассчитывается/));
  });

  it('на шестом уровне плута сохраняет новый Expertise и пересчитывает пассивную внимательность', () => {
    const base = seedState().actors.korrin;
    const old = ['athletics', 'insight'];
    const actor = { ...base, sheet: { ...base.sheet!, classId: 'plut', level: 5, skills: ['athletics', 'insight', 'perception', 'stealth'], expertise: old, choices: [{ id: 'expertise', label: 'Компетентность', values: old.map(id => ({ id, name: id, at: 1, source: 'srd' as const })) }] } };
    const plan = levelUpPlan(actor);
    const expertise = plan.featureChoices.find(fc => fc.id === 'expertise')!;
    expect(expertise.required).toBe(2);
    expect(expertise.options.map(option => option.id)).not.toEqual(expect.arrayContaining(old));
    const preview = previewLevelUp(actor, { hp: { method: 'average' }, featureChoices: { expertise: ['perception', 'stealth'] } });
    expect(preview.kind).toBe('ready');
    if (preview.kind !== 'ready') throw Error('preview failed');
    expect(preview.actor.sheet!.expertise).toEqual(expect.arrayContaining([...old, 'perception', 'stealth']));
    expect(preview.actor.passivePerception).toBe(actor.passivePerception + actor.sheet!.proficiencyBonus);
    expect(preview.actor.sheet!.choices!.find(choice => choice.id === 'expertise')!.values.at(-1)).toMatchObject({ id: 'stealth', at: 6, source: 'srd' });
  });

  it('раненый персонаж: результат совпадает с событием и replay, HPtemp и потраченное не сбрасываются', () => {
    const s = seedState();
    s.actors.korrin = { ...s.actors.korrin, hp: { ...s.actors.korrin.hp, current: 20, temp: 7 }, hitDiceSpent: 2, resourcesSpent: { 'second-wind': 1 } };
    const before = structuredClone(s);
    const preview = previewLevelUp(s.actors.korrin, { hp: { method: 'average' }, asi: { con: 2 } });
    expect(preview.kind).toBe('ready');
    if (preview.kind !== 'ready') throw Error('preview failed');
    expect(preview.actor.hp.temp).toBe(7);
    expect(preview.warnings).toContain('Подкласс в листе не выбран. Расчёт не учитывает его умения.');
    expect(preview.actor.hitDiceSpent).toBe(2);
    expect(preview.actor.resourcesSpent?.['second-wind']).toBe(1);
    expect(preview.actor.hp.current - 20).toBe(preview.actor.hp.max - s.actors.korrin.hp.max);
    expect(preview.lines).toContainEqual({ label: 'CON', before: String(s.actors.korrin.sheet!.abilities.con), after: String(s.actors.korrin.sheet!.abilities.con + 2) });
    const log = new EventLog(s, []);
    expect(log.entries).toHaveLength(0);
    log.dispatch({ type: 'CHARACTER_LEVELED', payload: preview.change });
    expect(log.state.actors.korrin).toEqual(preview.actor);
    expect(new EventLog(s, log.entries).state.actors.korrin).toEqual(preview.actor);
    log.undo();
    expect(log.state.actors.korrin).toEqual(s.actors.korrin);
    expect(s).toEqual(before);
  });
  it('не рассчитывает недопустимые варианты: ASI за20, пустые заклинания, неверный бросок', () => {
    const s = seedState();
    const capped = { ...s.actors.korrin, sheet: { ...s.actors.korrin.sheet!, abilities: { ...s.actors.korrin.sheet!.abilities, str: 20 } } };
    expect(previewLevelUp(capped, { hp: { method: 'average' }, asi: { str: 2 } })).toMatchObject({ kind: 'invalid', reason: expect.stringMatching(/выше 20/) });
    expect(previewLevelUp(s.actors.lyra, { hp: { method: 'average' } })).toMatchObject({ kind: 'invalid', reason: expect.stringMatching(/заклинания/) });
    expect(previewLevelUp(s.actors.bo, { hp: { method: 'roll', roll: 0 } })).toMatchObject({ kind: 'invalid', reason: expect.stringMatching(/бросок/) });
  });
  it('изменения книги заклинаний и выбранной замены берутся из тех же решений', () => {
    const s = seedState(), lyra = s.actors.lyra;
    const p = levelUpPlan(lyra);
    const chosen = p.spells!.options.filter(o => o.level > 0).slice(0, p.spells!.spells).map(o => o.id);
    const preview = previewLevelUp(lyra, { hp: { method: 'average' }, spells: chosen });
    expect(preview.kind).toBe('ready');
    if (preview.kind !== 'ready') throw Error('preview failed');
    expect(preview.actor.sheet!.spellcasting!.spells).toEqual([...lyra.sheet!.spellcasting!.spells, ...chosen]);
    expect(preview.lines.some(l => l.label === 'Книга заклинаний')).toBe(true);
    const bp = levelUpPlan(s.actors.bo);
    const from = bp.replacement!.known[0].id;
    const to = bp.replacement!.options.find(o => !s.actors.bo.sheet!.spellcasting!.spells.includes(o.id))!.id;
    const featureChoices = Object.fromEntries(bp.featureChoices.map(fc => [fc.id, fc.options.slice(0, fc.required).map(option => option.id)]));
    const replacement = previewLevelUp(s.actors.bo, { hp: { method: 'average' }, replaceSpell: { from, to }, featureChoices });
    expect(replacement.kind).toBe('ready');
    if (replacement.kind !== 'ready') throw Error('preview failed');
    expect(replacement.actor.sheet!.spellcasting!.spells).not.toContain(from);
    expect(replacement.actor.sheet!.spellcasting!.spells).toContain(to);
  });
  it('неподдержанный класс имеет причину, а неизвестные ручные выборы не объявляются рассчитанными', () => {
    const s = seedState();
    const art = { ...s.actors.korrin, sheet: { ...s.actors.korrin.sheet!, classId: 'izobretatel' } };
    expect(previewLevelUp(art, { hp: { method: 'average' } })).toMatchObject({ kind: 'invalid', reason: expect.stringMatching(/нет кости хитов/) });
    const low = { ...s.actors.korrin, sheet: { ...s.actors.korrin.sheet!, level: 2, subclassId: undefined } };
    const subclassId = levelUpPlan(low).subclasses!.find(sub => /Кавалерист/.test(sub.name))!.id;
    const manual = previewLevelUp(low, { hp: { method: 'average' }, subclassId });
    expect(manual.kind).toBe('ready');
    if (manual.kind !== 'ready') throw Error('preview failed');
    expect(manual.warnings.some(w => w.includes('требуется выбор по описанию') && w.includes('точной схемы'))).toBe(true);
  });
});
