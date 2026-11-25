import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PreparedSimulation } from '../../campaign/prepareSimulation';
import { LOCATION } from '../../campaign/world';
import { PulseView } from '../../lazyParts';
import { mount } from './testkit';
import type { CaravanPlannerSimulation } from './CaravanPlanner';

const loader = vi.hoisted(() => ({ prepare: vi.fn() }));
vi.mock('../../campaign/prepareSimulation', () => ({ prepareSimulation: loader.prepare }));

function prepared(): CaravanPlannerSimulation & Pick<PreparedSimulation, 'proposeCaravan' | 'proposeTradeLine'> {
  const from = { id: 'graph-a', name: 'Waterdeep', x: 0, y: 0 };
  const to = { id: 'graph-b', name: 'Neverwinter', x: 10, y: 0 };
  const proposeTradeLine = vi.fn<PreparedSimulation['proposeTradeLine']>((_state, request) => ({
    id: `test-line-${request.timeEventId}`, scale: 'region', subject: 'Тестовая торговая линия', was: 'не настроена', now: 'предложена',
    cause: 'Тестовая линия', causeId: request.timeEventId, status: 'pending',
    patch: { kind: 'price', id: LOCATION.neverwinter, goods: 'cloth', value: 120 },
  }));
  return {
    ready: true, caravanPlaces: () => [from, to],
    previewCaravanRoute: () => ({ ok: true, from, to, route: { version: 1, map: 'toril', nodes: [from.id, to.id], edges: [{ a: from.id, b: to.id, mode: 'road', miles: 24 }], miles: 24, days: 1.9 } }),
    proposeCaravan: (_state, request) => {
      if (request.quantity === 99) throw new Error('Недостаточно ткани для отправки');
      return { id: `test-caravan-${request.timeEventId}`, scale: 'region', subject: 'Тестовый караван', was: 'не отправлен', now: 'предложено',
        cause: 'Тестовая отправка', causeId: request.timeEventId, status: 'pending',
        patch: { kind: 'price', id: LOCATION.neverwinter, goods: 'cloth', value: 120 } };
    },
    proposeTradeLine,
  };
}
afterEach(cleanup);
beforeEach(async () => { loader.prepare.mockReset(); loader.prepare.mockResolvedValue(prepared()); await PulseView.preload(); });

async function openPlanner() {
  fireEvent.keyDown(window, { key: 'w', code: 'KeyW' });
  fireEvent.click(screen.getByRole('button', { name: 'Спланировать караван' }));
  await screen.findByRole('combobox', { name: 'Откуда' });
}

it('preview leaves the log/world untouched; submit adds a pending proposal linked to its request', async () => {
  const { store } = mount();
  const beforeEvents = store.getState().events.length;
  const beforeWorld = structuredClone(store.getState().state.world);
  await openPlanner();
  expect(store.getState().events).toHaveLength(beforeEvents);
  fireEvent.click(screen.getByRole('button', { name: 'Предложить отправку' }));
  await waitFor(() => expect(screen.getByText(/Караван Waterdeep → Neverwinter предложен/)).toBeInTheDocument());
  const events = store.getState().events.slice(beforeEvents);
  expect(events.map(e => e.type)).toEqual(['NOTE_ADDED', 'WORLD_DELTA_PROPOSED']);
  const proposal = Object.values(store.getState().state.deltas).find(d => d.subject === 'Тестовый караван')!;
  expect(proposal.status).toBe('pending');
  expect(proposal.causeId).toBe(events[0].id);
  expect(proposal.causeId).not.toBe('caravan-preflight');
  expect(store.getState().state.world).toEqual(beforeWorld);
  act(() => store.getState().accept(proposal.id));
  expect(screen.queryByText(/Караван Waterdeep → Neverwinter предложен во входящих/)).toBeNull();
});

it('a rejected cargo request does not leave a false request event in the journal', async () => {
  const { store } = mount();
  await openPlanner();
  const beforeEvents = store.getState().events.length;
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Объём, единицы запаса' }), { target: { value: '99' } });
  fireEvent.click(screen.getByRole('button', { name: 'Предложить отправку' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Недостаточно ткани');
  expect(store.getState().events).toHaveLength(beforeEvents);
});

it('submits a regular trade line through the same pending event path with its interval', async () => {
  const { store } = mount();
  const api = prepared();
  loader.prepare.mockResolvedValue(api);
  const beforeEvents = store.getState().events.length;
  await openPlanner();
  fireEvent.change(screen.getByRole('combobox', { name: 'Отправления' }), { target: { value: 'regular' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Интервал, дней' }), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Предложить регулярную линию' }));
  await waitFor(() => expect(screen.getByText(/Регулярная линия Waterdeep → Neverwinter предложен/)).toBeInTheDocument());

  const calls = vi.mocked(api.proposeTradeLine).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[0][1]).toMatchObject({ intervalDays: 4, from: 'graph-a', to: 'graph-b', timeEventId: 'caravan-preflight' });
  const events = store.getState().events.slice(beforeEvents);
  expect(events.map(event => event.type)).toEqual(['NOTE_ADDED', 'WORLD_DELTA_PROPOSED']);
  const delta = Object.values(store.getState().state.deltas).find(entry => entry.subject === 'Тестовая торговая линия')!;
  expect(delta).toMatchObject({ status: 'pending', causeId: events[0].id });
  expect(store.getState().state.world.locations[LOCATION.neverwinter].prices?.cloth ?? 0).toBe(0);
});

it('closing the desk during submit preparation prevents a late campaign mutation', async () => {
  const { store, unmount } = mount();
  await openPlanner();
  type TestPrepared = CaravanPlannerSimulation & Pick<PreparedSimulation, 'proposeCaravan'>;
  let finish!: (value: TestPrepared) => void;
  loader.prepare.mockReturnValueOnce(new Promise<TestPrepared>(resolve => { finish = resolve; }));
  const before = store.getState().events.length;
  fireEvent.click(screen.getByRole('button', { name: 'Предложить отправку' }));
  await waitFor(() => expect(loader.prepare).toHaveBeenCalledTimes(2));
  unmount();
  await act(async () => { finish(prepared()); });
  expect(store.getState().events).toHaveLength(before);
});
