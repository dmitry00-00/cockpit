// Отдых: кость хитов по классу листа (следопыт d10, волшебница d6), запас — уровень минус потраченные, формула с CON
// за каждую кость; кандидаты — партия, потом NPC, выбывшие — нет; takeRest — TIME_ADVANCED на час или восемь и
// REST_TAKEN за ним, предложения симуляции за отрезок — в лог; Ctrl+Z снимает отдых, потом время.
import { describe, expect, it } from 'vitest';
import { createEngineStore } from '../engine';
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
    expect(store.getState().events.slice(-2).map(e => e.type)).toEqual(['TIME_ADVANCED', 'REST_TAKEN']);

    store.getState().undo();
    expect(store.getState().state.time.sec).toBe(t0 + 9 * 3600);
    expect(store.getState().state.actors.bo.hitDiceSpent).toBe(1);
    store.getState().undo();
    expect(store.getState().state.time.sec).toBe(t0 + 3600);
  });
});

describe('takeRest и припасы (29.10.2026)', () => {
  const store = () => createEngineStore(seedState(), { persist: { load: () => seedLog(), save: () => {}, clear: () => {} } });

  it('долгий отдых с припасами — по 1 на отдыхающего; короткий — ничего; пустой мешок — ничего (ночлег не из мешка)', () => {
    const s = store();
    expect(takeRest(s.getState(), 'long', ['bo', 'korrin']).supply).toBeNull();
    s.getState().changeSupply('bought', 3);
    expect(takeRest(s.getState(), 'short', ['bo', 'korrin']).supply).toBeNull();
    const long = takeRest(s.getState(), 'long', ['bo', 'korrin', 'lyra', 'aldric']);
    expect(long.supply?.payload).toEqual({ reason: 'eaten', amount: 3, shortfall: 1 });
    expect(s.getState().state.supply).toBe(0);
    expect(s.getState().events.slice(-3).map(e => e.type)).toEqual(['TIME_ADVANCED', 'REST_TAKEN', 'SUPPLY_CHANGED']);
  });
});
