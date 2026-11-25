// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createEngineStore } from './store';
import { emptyState } from './state';
import { EventLog } from './log';
import { worldDeltaFreshness } from './reduce';
import type { Process } from './state';

const deterministic = () => {
  let id = 0;
  return { clock: { now: () => ++id }, ids: { next: () => `fresh-${++id}` } };
};

const proposal = (id: string, value: number) => ({
  id, scale: 'settlement' as const, subject: 'Neverwinter · еда', was: '5 дней', now: `${value} дней`,
  cause: 'проверка одновременных предложений', causeId: 'freshness-test', status: 'pending' as const,
  patch: { kind: 'stock' as const, id: 'town', goods: 'food' as const, value },
});

describe('актуальность предложений мира', () => {
  it('снимает исходное значение в редьюсере, блокирует молчаливую перезапись и воспроизводится из журнала', () => {
    const state = emptyState();
    state.world.locations.town = { id: 'town', name: 'Neverwinter', scale: 'settlement', stock: { food: 5 } };
    const store = createEngineStore(state, deterministic());
    const api = store.getState();
    const first = proposal('fresh-first', 8);
    const second = proposal('fresh-second', 9);
    // Этот снимок пришёл снаружи и не должен управлять проверкой актуальности.
    api.propose({ ...first, patchBase: { kind: 'stock', id: 'town', goods: 'food', value: 99 } });
    api.propose(second);

    expect(store.getState().state.deltas['fresh-first']?.patchBase).toEqual({ kind: 'stock', id: 'town', goods: 'food', value: 5 });
    expect(store.getState().state.deltas['fresh-second']?.patchBase).toEqual({ kind: 'stock', id: 'town', goods: 'food', value: 5 });
    api.accept('fresh-first');
    const eventCount = store.getState().events.length;

    expect(() => api.accept('fresh-second')).toThrow(/Устарели запаса товаров.*пересчитайте результат/i);
    expect(store.getState().events).toHaveLength(eventCount);
    expect(store.getState().state.world.locations.town?.stock?.food).toBe(8);
    expect(store.getState().state.deltas['fresh-second']?.status).toBe('pending');
    expect(store.getState().toast).toMatch(/Предложение не принято: Устарели запаса товаров/);

    const replay = new EventLog(state, store.getState().events, deterministic());
    expect(replay.state.deltas['fresh-second']?.patchBase).toEqual({ kind: 'stock', id: 'town', goods: 'food', value: 5 });
    expect(replay.state.deltas['fresh-second']?.status).toBe('pending');
  });

  const caravan = (ended = false): Process => ({
    id: 'caravan-1', kind: 'caravan', name: 'Waterdeep → Neverwinter', scale: 'region', stage: ended ? 'arrived' : 'transit',
    parties: [], startedSec: 0, nextSec: 86_400, vars: { routeIndex: ended ? 1 : 0 }, ended,
    data: { kind: 'caravan', version: 1, route: { nodes: ['waterdeep-place', 'neverwinter-place'] } },
  });

  const arrival = () => ({
    id: 'fresh-arrival', scale: 'settlement' as const, subject: 'Караван · Neverwinter', was: 'в пути', now: 'прибыл',
    cause: 'проверка входящих условий маршрута', causeId: 'fresh-route-test', status: 'pending' as const,
    patch: { kind: 'batch' as const, patches: [
      { kind: 'stock' as const, id: 'town', goods: 'cloth' as const, value: 3 },
      { kind: 'process' as const, process: caravan(true) },
    ] },
  });

  const blocker = (kind: 'blockade' | 'war', placeId: string): Process => kind === 'blockade' ? ({
    id: `blockade-${placeId}`, kind: 'blockade', name: 'Осада Neverwinter', scale: 'region', stage: 'active',
    parties: [], startedSec: 0, nextSec: 86_400, vars: {}, data: { kind: 'blockade', version: 1, targetPlaceId: placeId },
  }) : ({
    id: `war-${placeId}`, kind: 'war', name: 'Фронт у Neverwinter', scale: 'continent', stage: 'campaign',
    parties: [], startedSec: 0, nextSec: 86_400, vars: {}, data: {
      kind: 'war', version: 1, ruleVersion: 'dm-cockpit-war/1', sideA: {}, sideB: {}, front: { nodes: [{ id: placeId }] },
    },
  });

  it.each([
    ['блокада', 'blockade'],
    ['фронт войны', 'war'],
  ] as const)('устаревает прибытие, если после расчёта появляется %s на маршруте', (_label, kind) => {
    const state = emptyState();
    state.world.locations.town = { id: 'town', name: 'Neverwinter', scale: 'settlement', stock: { cloth: 2 } };
    state.world.processes = { 'caravan-1': caravan() };
    const store = createEngineStore(state, deterministic());
    const api = store.getState();
    api.propose({ ...arrival(), readDependencies: [], readBase: [] });
    const saved = store.getState().state.deltas['fresh-arrival'];
    expect(saved?.readDependencies?.map(item => item.placeId)).toEqual(['neverwinter-place', 'waterdeep-place']);
    expect(saved?.readBase).toHaveLength(2);

    const newBlocker = blocker(kind, 'neverwinter-place');
    api.propose({
      id: 'fresh-route-closure', scale: 'region', subject: 'Путь закрыт', was: 'открыт', now: 'закрыт',
      cause: 'проверка зависимости маршрута', causeId: 'fresh-route-test', status: 'pending',
      patch: { kind: 'process', process: newBlocker },
    });
    api.accept('fresh-route-closure');

    expect(worldDeltaFreshness(store.getState().state, store.getState().state.deltas['fresh-arrival']!)).toMatchObject({
      current: false,
      message: expect.stringMatching(/Условия маршрута каравана устарели.*блокада или фронт/i),
    });
    expect(() => api.accept('fresh-arrival')).toThrow(/Условия маршрута каравана устарели/i);
    expect(store.getState().state.world.locations.town?.stock?.cloth).toBe(2);
    expect(store.getState().state.deltas['fresh-arrival']?.status).toBe('pending');
  });

  it('не считает караван устаревшим из-за блокады вне зафиксированного маршрута', () => {
    const state = emptyState();
    state.world.locations.town = { id: 'town', name: 'Neverwinter', scale: 'settlement', stock: { cloth: 2 } };
    state.world.processes = { 'caravan-1': caravan() };
    const store = createEngineStore(state, deterministic());
    const api = store.getState();
    api.propose(arrival());
    api.propose({
      id: 'fresh-unrelated-closure', scale: 'region', subject: 'Другой путь закрыт', was: 'открыт', now: 'закрыт',
      cause: 'проверка зависимости маршрута', causeId: 'fresh-route-test', status: 'pending',
      patch: { kind: 'process', process: blocker('blockade', 'other-place') },
    });
    api.accept('fresh-unrelated-closure');
    expect(worldDeltaFreshness(store.getState().state, store.getState().state.deltas['fresh-arrival']!)).toEqual({ current: true });
  });
});
