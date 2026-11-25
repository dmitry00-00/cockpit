import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { emptyState } from '../../engine/state';
import { ref } from '../../entities/ref';
import { UrbanPlanner } from './UrbanPlanner';

afterEach(cleanup);

function worldWithCity() {
  const world = emptyState().world;
  world.locations.city = { id: 'city', name: 'City', scale: 'settlement', ref: ref('place', 'city-place'), population: 1_000, order: 6, stock: { food: 0 } };
  world.factions.a = { id: 'a', name: 'Faction A', renown: 0 };
  world.factions.b = { id: 'b', name: 'Faction B', renown: 0 };
  return world;
}

it('prepares city processes and submits only explicit, pending action inputs', async () => {
  const world = worldWithCity();
  const treatmentPreview = vi.fn().mockReturnValue({ temples: 2, perDay: 4, source: 'подтверждённые источники' });
  const prepare = vi.fn().mockResolvedValue({
    proposeFamine: vi.fn(), proposeEpidemic: vi.fn(), proposeCityFaction: vi.fn(), proposeBlockade: vi.fn(), endBlockade: vi.fn(), proposeFactionRelation: vi.fn(),
    epidemicTreatment: treatmentPreview,
  });
  const famine = vi.fn().mockResolvedValue('Голод предложен во входящие.');
  const epidemic = vi.fn().mockResolvedValue('Вспышка предложена во входящие.');
  const cityFaction = vi.fn().mockResolvedValue('Городская фракция предложена во входящие.');
  const relation = vi.fn().mockResolvedValue('Отношение предложено во входящие.');
  render(<UrbanPlanner world={world} year={1492} prepare={prepare} famine={famine} epidemic={epidemic} cityFaction={cityFaction}
    blockade={vi.fn()} endBlockade={vi.fn()} relation={relation} />);

  fireEvent.click(screen.getByRole('button', { name: 'Управлять городскими процессами' }));
  await screen.findByRole('combobox', { name: 'Поселение' });
  expect(prepare).toHaveBeenCalledOnce();
  expect(await screen.findByText(/Лечение в City: 2 подтверждённых храмов, до 4 больных в день/)).toBeInTheDocument();
  expect(treatmentPreview).toHaveBeenCalledWith(world, 'city', 1492);
  fireEvent.click(screen.getByRole('button', { name: 'Предложить голод' }));
  await waitFor(() => expect(famine).toHaveBeenCalledWith('city', 6));
  expect(await screen.findByText('Голод предложен во входящие.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Предложить вспышку Sewer Plague' }));
  await waitFor(() => expect(epidemic).toHaveBeenCalledWith('city', 1, 1.5));
  fireEvent.click(screen.getByRole('button', { name: 'Подключить City как фракцию' }));
  await waitFor(() => expect(cityFaction).toHaveBeenCalledWith('city'));
  fireEvent.click(screen.getByRole('button', { name: 'Предложить изменение отношений' }));
  await waitFor(() => expect(relation).toHaveBeenCalledWith('a', 'b', 0));
});

it('does not infer a famine from missing food stock or create a process without campaign settlements', async () => {
  const prepare = vi.fn().mockResolvedValue({
    proposeFamine: vi.fn(), proposeEpidemic: vi.fn(), proposeCityFaction: vi.fn(), proposeBlockade: vi.fn(), endBlockade: vi.fn(), proposeFactionRelation: vi.fn(),
    epidemicTreatment: vi.fn().mockReturnValue({ temples: 0, perDay: 0, source: 'данные храмов недоступны' }),
  });
  const famine = vi.fn();
  const world = emptyState().world;
  world.locations.city = { id: 'city', name: 'City', scale: 'settlement', population: 100, order: 6 };
  render(<UrbanPlanner world={world} year={1492} prepare={prepare} famine={famine} epidemic={vi.fn()} cityFaction={vi.fn()} blockade={vi.fn()} endBlockade={vi.fn()} relation={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Управлять городскими процессами' }));
  const famineButton = await screen.findByRole('button', { name: 'Предложить голод' });
  expect(famineButton).toBeDisabled();
  expect(famine).not.toHaveBeenCalled();

  cleanup();
  render(<UrbanPlanner world={emptyState().world} year={1492} prepare={prepare} famine={famine} epidemic={vi.fn()} cityFaction={vi.fn()} blockade={vi.fn()} endBlockade={vi.fn()} relation={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Управлять городскими процессами' }));
  expect(await screen.findByText(/В кампании пока нет поселений/)).toBeInTheDocument();
});

it('shows incubation, confirmed treatment and campaign-only city secession in the process panel', async () => {
  const world = worldWithCity();
  world.processes = {
    epidemic: {
      id: 'epidemic', kind: 'epidemic', name: 'City', scale: 'settlement', stage: 'incubation', parties: ['city'], at: 'city',
      startedSec: 0, nextSec: 86_400, vars: { infected: 3, incubating1: 1, incubating2: 2, incubating3: 0, incubating4: 0 },
      data: { kind: 'epidemic', treatmentTemples: 2, treatmentPerDay: 4 },
    },
  };
  world.settlementPolity = {
    city: { status: 'independent', separatedFrom: { kingdomId: 'polity', kingdomName: 'Polity' }, atSec: 0, source: 'table rule' },
  };
  const prepare = vi.fn().mockResolvedValue({
    proposeFamine: vi.fn(), proposeEpidemic: vi.fn(), proposeCityFaction: vi.fn(), proposeBlockade: vi.fn(), endBlockade: vi.fn(), proposeFactionRelation: vi.fn(),
    epidemicTreatment: vi.fn().mockReturnValue({ temples: 2, perDay: 4, source: 'подтверждённые источники' }),
  });
  render(<UrbanPlanner world={world} year={1492} prepare={prepare} famine={vi.fn()} epidemic={vi.fn()} cityFaction={vi.fn()} blockade={vi.fn()} endBlockade={vi.fn()} relation={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Управлять городскими процессами' }));
  expect(await screen.findByText(/Эпидемия · City · incubation · инкубация 3 · больные 3 · храмы 2, лечение 4\/день/)).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Города, вышедшие из державы' })).toHaveTextContent('City · независим от Polity');
});
