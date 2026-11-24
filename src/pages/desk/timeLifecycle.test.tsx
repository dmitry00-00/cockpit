// Отложенная подготовка не должна менять кампанию после закрытия стола.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tempoGroup, openTimeControls } from './testkit';
import { seedState } from '../../campaign/seed';
import { createEngineStore } from '../../engine/store';
import { memoryStore } from '../../engine/persist';

const loader = vi.hoisted(() => ({ prepare: vi.fn() }));
vi.mock('../../campaign/prepareSimulation', () => ({ prepareSimulation: loader.prepare }));

describe('жизненный цикл отложенного шага времени', () => {
  beforeEach(() => { loader.prepare.mockReset(); });

  it('закрытый стол не получает TIME_ADVANCED после завершения загрузки', async () => {
    let resolve!: (value: { ready: boolean }) => void;
    loader.prepare.mockReturnValue(new Promise(r => { resolve = r; }));
    const { store, unmount } = mount();
    const before = store.getState().events.length;
    openTimeControls();
    fireEvent.click(within(tempoGroup()).getByRole('button', { name: 'Шаг' }));
    await waitFor(() => expect(loader.prepare).toHaveBeenCalledOnce());
    unmount();
    await act(async () => { resolve({ ready: false }); });
    expect(store.getState().events).toHaveLength(before);
  });

  it('открытый стол завершает шаг после загрузки и показывает сводку', async () => {
    let resolve!: (value: { ready: boolean }) => void;
    loader.prepare.mockReturnValue(new Promise(r => { resolve = r; }));
    const { store } = mount();
    const before = store.getState().state.time.sec;
    openTimeControls();
    fireEvent.click(within(tempoGroup()).getByRole('button', { name: 'Шаг' }));
    await waitFor(() => expect(loader.prepare).toHaveBeenCalledOnce());
    expect(store.getState().state.time.sec).toBe(before);
    await act(async () => { resolve({ ready: false }); });
    expect(store.getState().state.time.sec).toBe(before + 3600);
    expect(screen.getByRole('region', { name: 'Шаг времени' })).toBeInTheDocument();
  });

  it('ошибка подготовки не сдвигает время и не пишет событие шага', async () => {
    loader.prepare.mockRejectedValue(new Error('Временный отказ данных'));
    const { store } = mount();
    const before = store.getState().state.time.sec;
    const events = store.getState().events.length;
    openTimeControls();
    fireEvent.click(within(tempoGroup()).getByRole('button', { name: 'Шаг' }));
    await waitFor(() => expect(loader.prepare).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByText(/Временный отказ данных/)).toBeInTheDocument());
    expect(store.getState().state.time.sec).toBe(before);
    expect(store.getState().events).toHaveLength(events);
  });

  it('недоступный граф не позволяет пропустить уже активный караван', async () => {
    loader.prepare.mockResolvedValue({ ready: false });
    const state = structuredClone(seedState());
    state.world.processes = { caravan: { id: 'caravan', kind: 'caravan', name: 'Проверочный караван', scale: 'region', stage: 'transit',
      parties: [], startedSec: state.time.sec, nextSec: state.time.sec + 86400, vars: {} } };
    const store = createEngineStore(state, { persist: memoryStore() });
    mount(store);
    openTimeControls();
    fireEvent.click(within(tempoGroup()).getByRole('button', { name: 'Шаг' }));
    await waitFor(() => expect(screen.getByText(/Данные активных караванов недоступны/)).toBeInTheDocument());
    expect(store.getState().state.time.sec).toBe(state.time.sec);
    expect(store.getState().events).toHaveLength(0);
  });
});
