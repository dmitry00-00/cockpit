import { expect, it } from 'vitest';
import { seedState } from '../campaign/seed';
import type { Process } from '../engine/state';
import { LOCATION } from '../campaign/world';
import { processMarkersFromState } from './processMarkers';

const makeProcess = (id: string, name: string, overrides: Partial<Process> = {}): Process => ({
  id, kind: 'famine', name, scale: 'settlement', stage: 'shortage', parties: [], at: LOCATION.neverwinter,
  startedSec: 0, nextSec: 86_400, vars: {}, ...overrides,
});

it('groups accepted active processes by mapped campaign location and keeps the projection GM-only', () => {
  const state = seedState();
  state.world.processes = {
    famine: makeProcess('famine', 'Голод'),
    blockade: makeProcess('blockade', 'Блокада', { kind: 'blockade' }),
    ended: makeProcess('ended', 'Снятая блокада', { ended: true }),
    unmapped: makeProcess('unmapped', 'Процесс без точки', { at: 'missing-location' }),
  };
  const markers = processMarkersFromState(state, 'toril', true);
  expect(markers).toEqual([expect.objectContaining({
    locationId: LOCATION.neverwinter, locationName: 'Neverwinter', x: 8522, y: 2610, labels: ['Блокада', 'Голод'],
  })]);
  expect(processMarkersFromState(state, 'toril', false)).toEqual([]);
  expect(processMarkersFromState(state, 'aster', true)).toEqual([]);
});
