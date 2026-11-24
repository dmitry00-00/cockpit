// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adventureLaunchDelta, adventureOutcomeDelta, adventureRouteStatusDelta } from './adventureSession';
import { seedEngine } from './seed';
import { memoryStore } from '../engine/persist';
import { parseContentImport } from '../import/content';

const source = () => readFileSync(new URL('../../research/content-phandelver/first-vertical.json', import.meta.url), 'utf8');

describe('adventure route state', () => {
  it('builds outcome patches from the current session after a stale caller snapshot', () => {
    const input = source();
    const adventureId = (JSON.parse(input) as { id: string }).id;
    const [content] = parseContentImport('first-vertical.json', input);
    const store = seedEngine({ persist: memoryStore() });
    store.getState().propose({ id: 'stale-outcome-import', scale: 'settlement', subject: content.name, was: 'нет', now: 'каталог', cause: 'тестовый исходник', causeId: 'stale-outcome-source', status: 'pending', patch: { kind: 'importedContent', content } });
    store.getState().accept('stale-outcome-import');
    const launch = adventureLaunchDelta(store.getState().state, content, true);
    store.getState().propose(launch);
    store.getState().accept(launch.id);

    const stale = store.getState().state.world.adventureSessions![adventureId];
    const delivery = adventureOutcomeDelta(store.getState().state, stale, 'arrival', 'delivery-resolution');
    store.getState().propose(delivery);
    store.getState().accept(delivery.id);
    const current = store.getState().state.world.adventureSessions![adventureId];
    const close = adventureRouteStatusDelta(store.getState().state, current, 'supply-route', 'closed', 'мост разрушен');
    store.getState().propose(close);
    store.getState().accept(close.id);

    const rescue = adventureOutcomeDelta(store.getState().state, stale, 'prisoner', 'rescue-resolution');
    expect(rescue.patch).toMatchObject({ kind: 'adventureSession', session: {
      routeStates: { 'supply-route': { status: 'closed', causeId: close.causeId } },
      resolvedProposalIds: ['delivery-resolution', 'rescue-resolution'],
    } });
    store.getState().propose(rescue);
    store.getState().accept(rescue.id);
    expect(store.getState().state.world.adventureSessions![adventureId]).toMatchObject({
      routeStates: { 'supply-route': { status: 'closed', causeId: close.causeId } },
      resolvedProposalIds: ['delivery-resolution', 'rescue-resolution'],
    });
  });

  it('acceptance, rejection, undo, redo and reload preserve route provenance', () => {
    const input = source();
    const adventureId = (JSON.parse(input) as { id: string }).id;
    const [content] = parseContentImport('first-vertical.json', input);
    const persist = memoryStore();
    const store = seedEngine({ persist });
    store.getState().propose({ id: 'route-test-import', scale: 'settlement', subject: content.name, was: 'нет', now: 'каталог', cause: 'тестовый исходник', causeId: 'route-test-source', status: 'pending', patch: { kind: 'importedContent', content } });
    store.getState().accept('route-test-import');
    const launch = adventureLaunchDelta(store.getState().state, content, true);
    store.getState().propose(launch);
    store.getState().accept(launch.id);

    const active = store.getState().state.world.adventureSessions![adventureId];
    expect(active.routeStates).toEqual({});
    const close = adventureRouteStatusDelta(store.getState().state, active, 'supply-route', 'closed', 'мост разрушен');
    store.getState().propose(close);
    store.getState().accept(close.id);
    expect(store.getState().state.world.adventureSessions![adventureId].routeStates?.['supply-route']).toMatchObject({ status: 'closed', reason: 'мост разрушен', causeId: close.causeId });

    store.getState().undo();
    expect(store.getState().state.world.adventureSessions![adventureId].routeStates?.['supply-route']).toBeUndefined();
    store.getState().redo();
    expect(store.getState().state.world.adventureSessions![adventureId].routeStates?.['supply-route']).toMatchObject({ status: 'closed', causeId: close.causeId });

    const reopen = adventureRouteStatusDelta(store.getState().state, store.getState().state.world.adventureSessions![adventureId], 'supply-route', 'open', 'переправа восстановлена');
    store.getState().propose(reopen);
    store.getState().reject(reopen.id, 'не подтверждена в игре');
    expect(store.getState().state.world.adventureSessions![adventureId].routeStates?.['supply-route'].status).toBe('closed');
    const reopenAccepted = adventureRouteStatusDelta(store.getState().state, store.getState().state.world.adventureSessions![adventureId], 'supply-route', 'open', 'переправа восстановлена');
    store.getState().propose(reopenAccepted);
    store.getState().accept(reopenAccepted.id);
    expect(store.getState().state.world.adventureSessions![adventureId].routeStates?.['supply-route']).toMatchObject({ status: 'open', reason: 'переправа восстановлена', causeId: reopenAccepted.causeId });

    const restored = seedEngine({ persist });
    expect(restored.getState().state.world.adventureSessions![adventureId].routeStates).toEqual(store.getState().state.world.adventureSessions![adventureId].routeStates);
    expect(restored.getState().events.some(event => event.type === 'WORLD_DELTA_ACCEPTED' && 'deltaId' in event.payload && event.payload.deltaId === close.id)).toBe(true);
  });
});
