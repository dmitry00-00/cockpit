// Отдых: кость хитов по классу листа (следопыт d10, волшебница d6), запас — уровень минус потраченные, формула с CON
// за каждую кость; кандидаты — партия, потом NPC, выбывшие — нет; takeRest — TIME_ADVANCED на час или восемь и
// REST_TAKEN за ним, предложения симуляции за отрезок — в лог; Ctrl+Z снимает отдых, потом время.
import { describe, expect, it } from 'vitest';
import { createEngineStore } from '../engine';
import { describe as describeEvent } from '../engine/journal';
import { REST_HOURS, conModOf, hitDiceFormula, hitDiceOf, restCandidates, takeRest } from './rest';
import { seedLog, seedState } from './seed';

describe('кости хитов', () => {
  it('по листу: Bo d10 × 5, Lyra d6 × 5, потраченные уменьшают запас; у монстра нет', () => {
    const s = seedState();
    expect(hitDiceOf(s.actors.bo)).toEqual({ die: 10, total: 5, spent: 0, available: 5 });
    expect(hitDiceOf(s.actors.lyra)).toEqual({ die: 6, total: 5, spent: 0, available: 5 });
    expect(hitDiceOf(s.actors.aldric)?.die).toBe(8);
    expect(hitDiceOf({ ...s.actors.bo, hitDiceSpent: 3 })).toMatchObject({ spent: 3, available: 2 });
    expect(hitDiceOf(s.actors.captain)).toBeUndefined();
    expect(conModOf(s.actors.bo)).toBe(3);
    expect(conModOf(s.actors.captain)).toBe(0);
  });

  it('Изобретатель получает d8 из явного слоя Tasha’s 2020, не маркированного как SRD', () => {
    const s = seedState();
    const artificer = {
      ...s.actors.bo,
      sheet: { ...s.actors.bo.sheet!, classId: 'izobretatel', level: 3 },
      hitDiceSpent: 1,
    };
    expect(hitDiceOf(artificer)).toEqual({
      die: 8, total: 3, spent: 1, available: 2,
      ruleset: { id: 'tashas-cauldron-of-everything', version: '2020', layer: 'book' },
      reference: 'D&D Beyond · Tasha’s Cauldron of Everything (Legacy) · Artificer · Hit Die · dndbeyond.com/classes',
    });
  });

  it('формула: CON за каждую кость, знак и ноль', () => {
    expect(hitDiceFormula(2, 10, 3)).toBe('2d10+6');
    expect(hitDiceFormula(1, 6, -1)).toBe('1d6-1');
    expect(hitDiceFormula(3, 8, 0)).toBe('3d8');
  });

  it('кандидаты: партия в порядке корешка, NPC следом, выбывшие и чудовища — нет', () => {
    const s = seedState();
    s.actors.guide = { ...s.actors.bo, id: 'guide', name: 'Проводник', kind: 'npc', sheet: undefined };
    s.actors.lyra.removed = true;
    expect(restCandidates(s).map(a => a.id)).toEqual(['bo', 'korrin', 'aldric', 'guide']);
  });
});

describe('takeRest', () => {
  it('короткий: +1 час и REST_TAKEN; долгий: +8 часов, Bo снова 49/49, Hunter\'s Mark по сроку истёк, отмена — отдых, потом время', () => {
    const store = createEngineStore(seedState(), { persist: { load: () => seedLog(), save: () => {}, clear: () => {} } });
    const api = store.getState();
    const t0 = api.state.time.sec;
    const short = takeRest(api, 'short', ['bo', 'korrin'], [{ actorId: 'bo', dice: 1, healed: 8 }]);
    expect(short.time.payload).toMatchObject({ tempo: 'hour', steps: REST_HOURS.short });
    expect(short.rest.type).toBe('REST_TAKEN');
    expect(store.getState().state.time.sec).toBe(t0 + 3600);
    expect(store.getState().state.actors.bo).toMatchObject({ hp: { current: 49 }, hitDiceSpent: 1 });

    const long = takeRest(store.getState(), 'long', ['bo', 'korrin', 'lyra', 'aldric']);
    expect(long.time.payload.steps).toBe(8);
    expect(store.getState().state.time.sec).toBe(t0 + 9 * 3600);
    expect(store.getState().state.actors.bo.hitDiceSpent).toBeUndefined();
    // Концентрация по сроку прошла, но система её не снимает — событие пишет мастер (HANDOFF §7).
    expect(store.getState().state.actors.bo.concentration).toBeDefined();
    expect(store.getState().events.slice(-3).map(e => e.type)).toEqual(['TIME_ADVANCED', 'REST_TAKEN', 'SUPPLY_CHANGED']);
    store.getState().undo(); // сначала отменяется учёт припасов

    store.getState().undo();
    expect(store.getState().state.time.sec).toBe(t0 + 9 * 3600);
    expect(store.getState().state.actors.bo.hitDiceSpent).toBe(1);
    store.getState().undo();
    expect(store.getState().state.time.sec).toBe(t0 + 3600);
  });

  it('A5E long-rest attempt advances its recorded duration but resets after more than an hour of strenuous interruption', () => {
    const initial = seedState();
    initial.supply = 2;
    initial.actors.bo.hp.current = 12;
    initial.actors.bo.a5eConditions = { fatigue: 2, strife: 3 };
    initial.actors.bo.hitDiceSpent = 2;
    const store = createEngineStore(initial, { persist: { load: () => seedLog(), save: () => {}, clear: () => {} } });
    const before = store.getState().state;
    const result = takeRest(store.getState(), 'long', ['bo'], [], [], {
      layer: 'a5e', haven: true, suppliedActorIds: ['bo'], roughingIt: false,
      a5eCadence: '24h-v1', a5eStartHp: 'min-1-v1', a5eTiming: 'period-v1',
      a5eDurationHours: 9, a5eStrenuousMinutes: 61,
    });

    expect(result.time.payload.steps).toBe(9);
    expect(result.supply).toBeNull();
    expect(store.getState().state.time.sec).toBe(before.time.sec + 9 * 3600);
    expect(store.getState().state.actors.bo).toMatchObject({
      hp: before.actors.bo.hp, a5eConditions: { fatigue: 2, strife: 3 }, hitDiceSpent: 2,
    });
    expect(store.getState().state.actors.bo.a5eLastLongRestAt).toBeUndefined();
    expect(store.getState().state.supply).toBe(2);
    expect(store.getState().events.slice(-2).map(event => event.type)).toEqual(['TIME_ADVANCED', 'REST_TAKEN']);
    expect(describeEvent(store.getState().events.at(-1)!, store.getState().state)).toContain('период сброшен');
  });

  it('A5E long rest with exactly one hour interruption still completes and applies the duration-based cooldown', () => {
    const initial = seedState();
    initial.supply = 1;
    initial.actors.bo.hp.current = 12;
    initial.actors.bo.a5eConditions = { fatigue: 2, strife: 3 };
    initial.actors.bo.hitDiceSpent = 2;
    const store = createEngineStore(initial, { persist: { load: () => seedLog(), save: () => {}, clear: () => {} } });
    const start = store.getState().state.time.sec;
    const result = takeRest(store.getState(), 'long', ['bo'], [], [], {
      layer: 'a5e', haven: true, suppliedActorIds: ['bo'], roughingIt: false,
      a5eCadence: '24h-v1', a5eStartHp: 'min-1-v1', a5eTiming: 'period-v1',
      a5eDurationHours: 9, a5eStrenuousMinutes: 60,
    });

    expect(result.time.payload.steps).toBe(9);
    expect(result.supply?.payload).toEqual({ reason: 'eaten', amount: 1 });
    expect(store.getState().state.actors.bo).toMatchObject({ hp: { current: 49 }, a5eConditions: { fatigue: 1, strife: 2 } });
    expect(store.getState().state.actors.bo.a5eLastLongRestAt).toBe(start + 9 * 3600);
    expect(store.getState().state.supply).toBe(0);
  });

  it('A5E period-v2 with less than six hours of sleep passes time without rest benefits or Supply use', () => {
    const initial = seedState();
    initial.supply = 2;
    initial.actors.bo.hp.current = 12;
    initial.actors.bo.a5eConditions = { fatigue: 2, strife: 3 };
    initial.actors.bo.hitDiceSpent = 2;
    const store = createEngineStore(initial, { persist: { load: () => seedLog(), save: () => {}, clear: () => {} } });
    const start = store.getState().state.time.sec;
    const result = takeRest(store.getState(), 'long', ['bo'], [], [], {
      layer: 'a5e', haven: true, suppliedActorIds: ['bo'], roughingIt: false,
      a5eCadence: '24h-v1', a5eStartHp: 'min-1-v1', a5eTiming: 'period-v2',
      a5eDurationHours: 8, a5eSleepHours: 5, a5eStrenuousMinutes: 0,
    });

    expect(result.time.payload.steps).toBe(8);
    expect(result.supply).toBeNull();
    expect(store.getState().state.time.sec).toBe(start + 8 * 3600);
    expect(store.getState().state.actors.bo).toMatchObject({
      hp: { current: 12 }, a5eConditions: { fatigue: 2, strife: 3 }, hitDiceSpent: 2,
    });
    expect(store.getState().state.actors.bo.a5eLastLongRestAt).toBeUndefined();
    expect(store.getState().state.supply).toBe(2);
    expect(describeEvent(store.getState().events.at(-1)!, store.getState().state)).toContain('сон 5 ч');
  });
});

describe('takeRest и припасы (29.10.2026)', () => {
  const store = () => createEngineStore(seedState(), { persist: { load: () => seedLog(), save: () => {}, clear: () => {} } });

  it('долгий отдых с припасами — по 1 на отдыхающего; короткий — ничего; пустой мешок — запись нехватки', () => {
    const s = store();
    expect(takeRest(s.getState(), 'long', ['bo', 'korrin']).supply?.payload).toEqual({ reason: 'eaten', amount: 0, shortfall: 2 });
    s.getState().changeSupply('bought', 3);
    expect(takeRest(s.getState(), 'short', ['bo', 'korrin']).supply).toBeNull();
    const long = takeRest(s.getState(), 'long', ['bo', 'korrin', 'lyra', 'aldric']);
    expect(long.supply?.payload).toEqual({ reason: 'eaten', amount: 3, shortfall: 1 });
    expect(s.getState().state.supply).toBe(0);
    expect(s.getState().events.slice(-3).map(e => e.type)).toEqual(['TIME_ADVANCED', 'REST_TAKEN', 'SUPPLY_CHANGED']);
  });
});
