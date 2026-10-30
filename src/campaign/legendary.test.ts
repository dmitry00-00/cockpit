// Легендарные действия в бою (Q13): число — из абзаца блока, потраченное — ресурс актёра через RESOURCE_SPENT /
// RESOURCE_RESTORED, возврат — в начале своего хода отдельным событием; отмена хода — два шага; журнал называет ресурс.
import { beforeAll, describe, expect, it } from 'vitest';
import { createEngineStore } from '../engine';
import { journalEntries } from '../engine/journal';
import { loadMonsterLibraries } from '../rules/srd/monsters';
import { LEGENDARY_RESOURCE, legendaryRegainOf, legendaryTrackOf, regainLegendary } from './legendary';
import { monsterActor, seedState } from './seed';

beforeAll(async () => { await loadMonsterLibraries(); });

/** Сид и красный дракон в бою: Bo 15, дракон 12, Korrin 10 — ход у Bo. */
function battle() {
  const store = createEngineStore(seedState());
  const api = store.getState();
  api.spawn(monsterActor('dragon', 'adult-red-dragon'));
  api.startEncounter([{ actorId: 'bo', initiative: 15 }, { actorId: 'dragon', initiative: 12 }, { actorId: 'korrin', initiative: 10 }]);
  return store;
}
const track = (store: ReturnType<typeof battle>) => legendaryTrackOf(store.getState().state.actors.dragon)!;
const turn = (store: ReturnType<typeof battle>) => { store.getState().nextTurn(); regainLegendary(store.getState()); };

describe('легендарные действия', () => {
  it('у дракона — 3 из абзаца блока, варианты со стоимостью; у бандита и персонажа — нет', () => {
    const store = battle();
    const t = track(store);
    expect([t.max, t.spent, t.available]).toEqual([3, 0, 3]);
    expect(t.intro).toMatch(/^The dragon can take 3 legendary actions/);
    expect(t.options.map(o => o.cost)).toEqual([1, 1, 2]);
    const s = store.getState().state;
    expect(legendaryTrackOf(s.actors.captain)).toBeNull();
    expect(legendaryTrackOf(s.actors.bo)).toBeNull();
  });

  it('трата — RESOURCE_SPENT стоимостью варианта; больше, чем осталось, — ошибка движка; журнал — «Легендарные действия −2»', () => {
    const store = battle();
    store.getState().spendResource('dragon', LEGENDARY_RESOURCE, 3, 2);
    expect(track(store).available).toBe(1);
    expect(() => store.getState().spendResource('dragon', LEGENDARY_RESOURCE, 3, 2)).toThrow(/осталось 1 из 3/);
    const { events, state } = store.getState();
    const last = journalEntries(events, state).at(-1)!;
    expect(last.text).toBe('Легендарные действия −2: Adult Red Dragon (1 из 3)');
  });

  it('возврат — в начале своего хода, не чужого: отдельный RESOURCE_RESTORED сразу за TURN_ADVANCED; отмена — по шагу', () => {
    const store = battle();
    store.getState().spendResource('dragon', LEGENDARY_RESOURCE, 3, 2);
    // Ход Bo → ход дракона: возврат.
    expect(legendaryRegainOf(store.getState().state)).toBeNull();
    turn(store);
    expect(store.getState().events.slice(-2).map(e => e.type)).toEqual(['TURN_ADVANCED', 'RESOURCE_RESTORED']);
    expect(track(store).spent).toBe(0);
    // Ход Korrin: дракон тратит — возвращать на чужом ходу нечего.
    store.getState().spendResource('dragon', LEGENDARY_RESOURCE, 3, 1);
    turn(store);
    expect(store.getState().events.at(-1)!.type).toBe('TURN_ADVANCED');
    expect(track(store).spent).toBe(1);
    // Ничего не потрачено — и события нет.
    turn(store);
    turn(store);
    expect(track(store).spent).toBe(0);
    turn(store);
    expect(store.getState().events.at(-1)!.type).toBe('TURN_ADVANCED');
    // Отмена хода дракона с возвратом — два шага: сначала возврат, потом ход.
    const fresh = battle();
    fresh.getState().spendResource('dragon', LEGENDARY_RESOURCE, 3, 3);
    turn(fresh);
    fresh.getState().undo();
    expect(track(fresh).spent).toBe(3);
    expect(fresh.getState().state.encounter.order[fresh.getState().state.encounter.turnIndex]).toBe('dragon');
    fresh.getState().undo();
    expect(fresh.getState().state.encounter.order[fresh.getState().state.encounter.turnIndex]).toBe('bo');
  });

  it('дракон ходит первым в новом бою — потраченное в прошлом возвращается в начале боя', () => {
    const store = battle();
    store.getState().spendResource('dragon', LEGENDARY_RESOURCE, 3, 3);
    store.getState().endEncounter();
    store.getState().startEncounter([{ actorId: 'dragon', initiative: 20 }, { actorId: 'bo', initiative: 15 }]);
    regainLegendary(store.getState());
    expect(track(store).spent).toBe(0);
  });
});
