import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { seedState } from '../campaign/seed';
import { LOCATION } from '../campaign/world';
import { sceneOf } from '../campaign/scene';
import type { Process } from '../engine/state';
import { SceneView } from './SceneView';

it('renders only an explicitly public process clock in the player scene', () => {
  const state = seedState();
  const process: Process = {
    id: 'hidden-war-process', kind: 'war', name: 'Тайная война держав', scale: 'continent', stage: 'campaign',
    parties: ['kingdom:one', 'kingdom:two'], at: LOCATION.toril, startedSec: state.time.sec, nextSec: state.time.sec + 86_400,
    vars: { privateStrength: 7 }, causeId: 'private-cause', clock: { segments: 5, filled: 3, playerVisible: true, playerLabel: 'Давление на рубеже' },
    data: { privatePlan: 'Осада через три дня' },
  };
  state.world.processes = { [process.id]: process };
  const scene = sceneOf(state, { location: LOCATION.neverwinter }, state.time.sec, undefined, { players: true });
  render(<SceneView scene={scene} />);
  expect(screen.getByRole('region', { name: 'Процессы' })).toHaveTextContent('Давление на рубеже');
  expect(screen.getByRole('region', { name: 'Процессы' })).toHaveTextContent('Часы: 3 из 5');
  expect(document.body).not.toHaveTextContent(process.id);
  expect(document.body).not.toHaveTextContent(process.name);
  expect(document.body).not.toHaveTextContent('Осада через три дня');
  expect(document.body).not.toHaveTextContent('kingdom:one');
});
