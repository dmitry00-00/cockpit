// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { EventLog } from './log';
import { emptyState } from './state';
import { createEngineStore } from './store';

const stateWithBo = () => {
  const state = emptyState();
  state.actors.bo = { id: 'bo', name: 'Bo', kind: 'pc', hp: { current: 10, max: 10, temp: 0 }, ac: 12, passivePerception: 10, conditions: {} };
  state.party = ['bo'];
  return state;
};
const fixed = () => {
  let id = 0;
  return { clock: { now: () => ++id }, ids: { next: () => `integrity-${++id}` } };
};

describe('неизменяемая история событий', () => {
  it('отделяет payload команды и блокирует изменение истории после записи', () => {
    const log = new EventLog(stateWithBo(), [], fixed());
    const payload = { targetId: 'bo', amount: 2 };
    const event = log.dispatch({ type: 'DAMAGE_APPLIED', payload });

    payload.amount = 20;
    expect(event.payload.amount).toBe(2);
    expect(log.state.actors.bo.hp.current).toBe(8);
    expect(Reflect.set(event.payload, 'amount', 30)).toBe(false);
    if (event.effect?.kind === 'hp') expect(Reflect.set(event.effect.after, 'current', 1)).toBe(false);
    expect(Object.isFrozen(log.entries)).toBe(true);
    expect(() => (log.entries as unknown as unknown[]).pop()).toThrow();
    expect(log.length).toBe(1);
    expect(new EventLog(stateWithBo(), log.entries, fixed()).state).toEqual(log.state);
  });

  it('отклоняет повторные ID при генерации, replay, проверке и принятии ветки', () => {
    const source = new EventLog(stateWithBo(), [], { clock: { now: () => 1 }, ids: { next: () => 'same-id' } });
    const first = source.dispatch({ type: 'DAMAGE_APPLIED', payload: { targetId: 'bo', amount: 1 } });
    expect(() => source.dispatch({ type: 'DAMAGE_APPLIED', payload: { targetId: 'bo', amount: 1 } })).toThrow(/уже в логе/);
    expect(source.length).toBe(1);

    const duplicate = { ...first, seq: 1 };
    expect(() => new EventLog(stateWithBo(), [first, duplicate], fixed())).toThrow(/уже в логе/);
    expect(() => EventLog.check([first, duplicate])).toThrow(/повторный id/);
    const main = new EventLog(stateWithBo(), [], fixed());
    expect(() => main.adopt([first, duplicate], 0)).toThrow(/повторяется в ветке/);
    expect(main.length).toBe(0);
  });

  it('показывает отказ сохранения, даже если адаптер бросает исключение', () => {
    const store = createEngineStore(stateWithBo(), {
      ...fixed(),
      persist: { load: () => null, save: () => { throw new Error('write denied'); }, clear: () => {} },
    });
    store.getState().damage('bo', 1);
    expect(store.getState().state.actors.bo.hp.current).toBe(9);
    expect(store.getState().saveFailed).toBe(true);
  });
});
