// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { partyLocationId } from '../campaign/processes';
import { EventLog } from './log';
import { emptyState, type State } from './state';
import { partyIsSplit, partyPlaceId } from './ladder';

const base = (): State => {
  const state = emptyState();
  state.actors.bo = { id: 'bo', name: 'Bo', kind: 'pc', hp: { current: 10, max: 10, temp: 0 }, ac: 12, passivePerception: 10, conditions: {}, locationId: 'nw' };
  state.actors.korrin = { id: 'korrin', name: 'Korrin', kind: 'pc', hp: { current: 10, max: 10, temp: 0 }, ac: 12, passivePerception: 10, conditions: {} };
  state.party = ['bo', 'korrin'];
  state.world.locations = {
    nw: { id: 'nw', name: 'Neverwinter', scale: 'settlement' },
    tb: { id: 'tb', name: 'Triboar', scale: 'settlement' },
  };
  return state;
};
const options = () => ({ clock: { now: () => 1 }, ids: { next: () => 'party-travel' } });
const route = { fromId: 'nw', toId: 'tb', map: 'toril', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], miles: 10, pace: 'normal' as const, days: 1 };

describe('единая позиция партии', () => {
  it('не выводит общее место по одному участнику и синхронно убирает позицию процессов', () => {
    const state = base();
    expect(partyPlaceId(state)).toBeUndefined();
    expect(partyLocationId(state)).toBeUndefined();
    expect(partyIsSplit(state)).toBe(false);
    state.actors.korrin.locationId = 'nw';
    expect(partyPlaceId(state)).toBe('nw');
    expect(partyLocationId(state)).toBe('nw');
    state.actors.korrin.locationId = 'tb';
    expect(partyPlaceId(state)).toBeUndefined();
    expect(partyLocationId(state)).toBeUndefined();
    expect(partyIsSplit(state)).toBe(true);
  });

  it('блокирует общий поход при разных или неполных позициях, но воспроизводит старый записанный поход', () => {
    const split = base();
    split.actors.korrin.locationId = 'tb';
    expect(() => new EventLog(split, [], options()).dispatch({ type: 'PARTY_TRAVELED', payload: route })).toThrow(/партия разделена/);

    const partial = base();
    expect(() => new EventLog(partial, [], options()).dispatch({ type: 'PARTY_TRAVELED', payload: route })).toThrow(/единого подтверждённого места/);

    const together = base();
    together.actors.korrin.locationId = 'nw';
    expect(() => new EventLog(together, [], options()).dispatch({ type: 'PARTY_TRAVELED', payload: { ...route, fromId: 'tb' } })).toThrow(/начало маршрута не совпадает/);
    const source = new EventLog(together, [], options());
    const event = source.dispatch({ type: 'PARTY_TRAVELED', payload: route });
    const replay = new EventLog(split, [event], options());
    expect(replay.state.actors.bo.locationId).toBe('tb');
    expect(replay.state.actors.korrin.locationId).toBe('tb');
  });
});
