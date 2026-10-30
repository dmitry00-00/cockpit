// Поход по карте: дни пути → шаг времени днями (неполный день — тоже день) с предложениями мира за этот отрезок,
// затем PARTY_TRAVELED и Supply A5E за эти дни на каждого (SUPPLY_CHANGED); Ctrl+Z снимает припасы, поход, потом время.
import { describe, expect, it } from 'vitest';
import { createEngineStore, partyPlaceId } from '../engine';
import { travel, travelCalendarDays } from './travel';
import { seedLog, seedState } from './seed';
import { LOCATION } from './world';

describe('поход', () => {
  it('календарные дни — дни пути вверх до целого', () => {
    expect(travelCalendarDays(3)).toBe(3);
    expect(travelCalendarDays(2.4)).toBe(3);
    expect(travelCalendarDays(0.2)).toBe(1);
  });

  it('Neverwinter → Old Owl Well: 3,1 дня быстрым темпом — время на 4 дня вперёд, партия там; отмена — назад в Neverwinter, потом время', () => {
    const store = createEngineStore(seedState(), { persist: { load: () => seedLog(), save: () => {}, clear: () => {} } });
    const api = store.getState();
    const t0 = api.state.time.sec;
    expect(partyPlaceId(api.state)).not.toBe(LOCATION.oldOwlWell);
    const from = partyPlaceId(api.state);
    const r = travel(api, { fromId: from, toId: LOCATION.oldOwlWell, map: 'toril', points: [{ x: 8522, y: 2610 }, { x: 8700, y: 2668 }], miles: 93.6, pace: 'fast', days: 3.1 });
    let s = store.getState().state;
    expect(r.time.payload).toMatchObject({ tempo: 'day', steps: 4 });
    expect(s.time.sec - t0).toBe(4 * 86_400);
    expect(partyPlaceId(s)).toBe(LOCATION.oldOwlWell);
    expect(store.getState().events.slice(-2).map(e => e.type)).toEqual(['PARTY_TRAVELED', 'SUPPLY_CHANGED']);
    // В сиде мешок пуст: четыре ночи на четверых — съедено 0, не хватило 16.
    expect(r.supply?.payload).toEqual({ reason: 'eaten', amount: 0, shortfall: 16 });
    store.getState().undo();
    store.getState().undo();
    s = store.getState().state;
    expect(partyPlaceId(s)).toBe(from);
    expect(s.time.sec - t0).toBe(4 * 86_400);
    store.getState().undo();
    // Отмена шага времени снимает и его; предложения симуляции необратимы и остаются в логе как были.
    expect(store.getState().state.time.sec).toBe(t0);
  });

  it('припасы: съедено календарные дни × рты; хватает — без «не хватило»', () => {
    const store = createEngineStore(seedState(), { persist: { load: () => seedLog(), save: () => {}, clear: () => {} } });
    store.getState().changeSupply('bought', 20);
    const api = store.getState();
    const r = travel(api, { fromId: partyPlaceId(api.state), toId: LOCATION.oldOwlWell, map: 'toril', points: [{ x: 8522, y: 2610 }, { x: 8700, y: 2668 }], miles: 50, pace: 'normal', days: 2.1 });
    expect(r.supply?.payload).toEqual({ reason: 'eaten', amount: 12 });
    expect(store.getState().state.supply).toBe(8);
  });
});
