import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { emptyState } from '../../engine/state';
import type { PreparedCosmicSimulation } from '../../campaign/prepareCosmic';
import type { CosmicRequestInput } from '../../campaign/cosmic';
import { CosmicPlanner } from './CosmicPlanner';

afterEach(cleanup);

it('offers catalog-backed cosmic targets and submits a typed pending scenario', async () => {
  const target = { id: 'plane:great-wheel:abyss', name: 'Abyss', label: 'Abyss · Великое Колесо', type: 'План', scale: 'plane' as const, locationId: 'plane-abyss', parentId: 'loc-great-wheel', refs: ['Planar Handbook · 21'] };
  const prepare = vi.fn().mockResolvedValue({ targets: () => [target] } as unknown as PreparedCosmicSimulation);
  const propose = vi.fn(async (_input: Omit<CosmicRequestInput, 'timeEventId'>) => 'Процесс предложен во входящие.');
  render(<CosmicPlanner state={emptyState()} prepare={prepare} propose={propose} />);

  fireEvent.click(screen.getByRole('button', { name: 'Подготовить космический сценарий' }));
  await screen.findByRole('combobox', { name: 'Цель процесса' });
  expect(screen.getByText(/Planar Handbook · 21/)).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Тип космического процесса' }), { target: { value: 'blood-war' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Космическое событие' }), { target: { value: 'Фронт движется к вратам' } });
  fireEvent.click(screen.getByRole('button', { name: 'Предложить процесс' }));

  await waitFor(() => expect(propose).toHaveBeenCalledWith({
    targetId: target.id, eventKind: 'blood-war', text: 'Фронт движется к вратам', durationDays: 30, playerVisible: false,
  }));
  expect(await screen.findByText('Процесс предложен во входящие.')).toBeInTheDocument();
});
