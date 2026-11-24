import { expect, it } from 'vitest';
import { emptyState, type Process } from '../engine/state';
import { warFrontLinesFromState } from './warFronts';

const process = (overrides: Partial<Process> = {}): Process => ({
  id: 'war-active', kind: 'war', name: 'Cormyr — Luskan', scale: 'continent', stage: 'campaign',
  parties: ['kingdom:cormyr', 'kingdom:luskan'], startedSec: 0, nextSec: 1, vars: {},
  data: { kind: 'war', version: 1, front: { map: 'toril', nodes: [
    { id: 'suzail', name: 'Suzail', x: 100, y: 200 }, { id: 'front-town', name: 'Front Town', x: 120, y: 220 },
  ] } },
  ...overrides,
});

it('returns only valid active war routes for the DM and requested map', () => {
  const state = emptyState();
  state.world.processes = {
    active: process(),
    ended: process({ id: 'ended', ended: true }),
    otherMap: process({ id: 'other-map', data: { kind: 'war', version: 1, front: { map: 'aster', nodes: [
      { id: 'a', name: 'A', x: 0, y: 0 }, { id: 'b', name: 'B', x: 1, y: 1 },
    ] } } }),
    settled: process({ id: 'settled', stage: 'peace' }),
    invalid: process({ id: 'invalid', data: { kind: 'war', version: 1, front: { map: 'toril', nodes: [{ id: 'a', name: 'A', x: 0, y: 0 }] } } }),
  };

  expect(warFrontLinesFromState(state, 'toril', true)).toEqual([{
    id: 'war-active', label: 'Cormyr — Luskan', nodes: [
      { id: 'suzail', name: 'Suzail', x: 100, y: 200 }, { id: 'front-town', name: 'Front Town', x: 120, y: 220 },
    ],
  }]);
  expect(warFrontLinesFromState(state, 'toril', false)).toEqual([]);
  expect(warFrontLinesFromState(state, 'aster', true)).toHaveLength(1);
});
