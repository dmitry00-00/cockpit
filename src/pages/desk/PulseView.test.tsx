import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedState } from '../../campaign/seed';
import type { Process } from '../../engine/state';
import type { PreparedCosmicSimulation } from '../../campaign/prepareCosmic';
import { LOCATION } from '../../campaign/world';
import { PulseView } from './PulseView';

afterEach(cleanup);

describe('PulseView · часы процессов', () => {
  it('показывает стадию, прогресс и дату следующего такта как нерешённое предложение', () => {
    const state = structuredClone(seedState());
    const process: Process = {
      id: 'caravan-test', kind: 'caravan', name: 'Waterdeep → Neverwinter (cloth)', scale: 'region', stage: 'transit',
      parties: [], startedSec: state.time.sec, nextSec: state.time.sec + 86_400,
      vars: { routeIndex: 2 }, clock: { segments: 5, filled: 2 },
    };
    state.world.processes = { [process.id]: process };
    const onProcessClockVisibility = vi.fn();

    render(<PulseView state={state} mainRef={createRef<HTMLElement>()} onOpenEntity={() => {}} onProcessClockVisibility={onProcessClockVisibility} />);

    const panel = screen.getByRole('region', { name: 'Процессы мира' });
    expect(panel).toHaveTextContent('Waterdeep → Neverwinter (cloth)');
    expect(panel).toHaveTextContent('Караван · в пути');
    expect(screen.getByRole('progressbar', { name: 'Часы процесса Waterdeep → Neverwinter (cloth)' })).toHaveAttribute('aria-valuenow', '2');
    expect(panel).toHaveTextContent('2 из 5');
    expect(panel).toHaveTextContent('предложение ещё не определено');
    const settings = within(panel).getByText('Открыть часы игрокам');
    fireEvent.click(settings);
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Подпись часов для игроков Waterdeep → Neverwinter (cloth)' }), { target: { value: 'Караван идёт' } });
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Показывать счётчик' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Предложить изменение' }));
    expect(onProcessClockVisibility).toHaveBeenCalledWith(process, true, 'Караван идёт');
  });
});

it('exposes the C6 cosmic and planetary process planner to the master view', () => {
  const state = structuredClone(seedState());
  const prepare = vi.fn().mockResolvedValue({ targets: () => [] } as unknown as PreparedCosmicSimulation);
  render(<PulseView state={state} mainRef={createRef<HTMLElement>()} onOpenEntity={() => {}}
    onPrepareCosmic={prepare} onProposeCosmic={vi.fn()} />);
  expect(screen.getByRole('region', { name: 'Космические и планетарные процессы' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Подготовить космический сценарий' })).toBeInTheDocument();
});

it('shows a cosmic field inherited from an upper plane at the party location', () => {
  const state = structuredClone(seedState());
  for (const id of state.party) if (state.actors[id]) state.actors[id].locationId = LOCATION.neverwinter;
  const process: Process = {
    id: 'cosmic-context-test', kind: 'cosmic', name: 'Война Крови · Материальный', scale: 'plane', stage: 'ongoing',
    parties: [LOCATION.material], at: LOCATION.material, startedSec: state.time.sec, nextSec: state.time.sec + 30 * 86_400,
    vars: { elapsedDays: 0, durationDays: 30 }, causeId: 'cause-cosmic-test',
    data: {
      version: 1, kind: 'cosmic', ruleVersion: 'dm-cockpit-cosmic/1', targetId: 'plane:great-wheel:material',
      targetName: 'Материальный', targetType: 'План · Великое Колесо', eventKind: 'blood-war', text: 'Следы войны замечены у порталов.',
      durationDays: 30, playerVisible: false, sourceRefs: ['Planar Handbook · 21'], factId: 'fact-cosmic-context-test', locationId: LOCATION.material,
    },
  };
  state.world.processes = { [process.id]: process };
  render(<PulseView state={state} mainRef={createRef<HTMLElement>()} onOpenEntity={() => {}} />);
  const panel = screen.getByRole('region', { name: 'Космическое поле места партии' });
  expect(panel).toHaveTextContent('Война Крови · Материальный');
  expect(panel).toHaveTextContent('унаследовано через');
  expect(panel).toHaveTextContent('Следы войны замечены у порталов.');
  expect(panel).toHaveTextContent('Planar Handbook · 21');
});
