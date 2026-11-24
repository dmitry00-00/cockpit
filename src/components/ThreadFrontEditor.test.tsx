// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { emptyState } from '../engine/state';
import { ThreadFrontEditor } from './ThreadFrontEditor';

function stateWithThread() {
  const state = emptyState();
  state.world.threads.t = { id: 't', name: 'Культ Talos', status: 'open', openedSec: 0, lastTouchedSec: 0 };
  return state;
}

describe('ThreadFrontEditor', () => {
  it('creates a GM proposal without changing the thread before acceptance', () => {
    const state = stateWithThread();
    const onPropose = vi.fn();
    render(<ThreadFrontEditor state={state} thread={state.world.threads.t} pending={false} onPropose={onPropose} />);
    fireEvent.change(screen.getByLabelText('Масштаб'), { target: { value: 'adventure' } });
    fireEvent.change(screen.getByLabelText(/Вопросы о ставках/), { target: { value: 'Откроет ли культ ворота?' } });
    const names = screen.getAllByLabelText('Имя');
    const impulses = screen.getAllByLabelText('Стремление');
    const dooms = screen.getAllByLabelText('Неотвратимая беда');
    fireEvent.change(names[0], { target: { value: 'Культ' } });
    fireEvent.change(impulses[0], { target: { value: 'распространить веру' } });
    fireEvent.change(dooms[0], { target: { value: 'тирания' } });
    fireEvent.change(screen.getAllByLabelText(/Мрачные знаки/)[0], { target: { value: 'Культ вербует стражу' } });
    fireEvent.change(names[1], { target: { value: 'Буря' } });
    fireEvent.change(impulses[1], { target: { value: 'обрушиться на город' } });
    fireEvent.change(dooms[1], { target: { value: 'разрушение' } });
    fireEvent.click(screen.getByRole('button', { name: 'Предложить фронт' }));
    expect(onPropose).toHaveBeenCalledWith(expect.objectContaining({ patch: { kind: 'threadFront', id: 't', front: expect.objectContaining({ type: 'adventure', dangers: expect.arrayContaining([expect.objectContaining({ name: 'Культ' })]) }) } }));
    expect(state.world.threads.t.front).toBeUndefined();
  });

  it('refuses an empty front', () => {
    const state = stateWithThread();
    const onPropose = vi.fn();
    render(<ThreadFrontEditor state={state} thread={state.world.threads.t} pending={false} onPropose={onPropose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Предложить фронт' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Добавьте от 1 до 3 вопросов');
    expect(onPropose).not.toHaveBeenCalled();
  });

  it('proposes a manual portent checkoff and leaves it unchanged until acceptance', () => {
    const state = stateWithThread();
    state.world.threads.t.front = {
      source: 'dungeon-world-srd:fronts', type: 'adventure', stakes: ['Откроет ли культ ворота?'], dangers: [
        { id: 'cult', name: 'Культ', impulse: 'распространить веру', impendingDoom: 'тирания', portents: [{ id: 'sign', text: 'Культ вербует стражу', fulfilled: false }] },
        { id: 'storm', name: 'Буря', impulse: 'обрушиться на город', impendingDoom: 'разрушение', portents: [] },
      ],
    };
    const onPropose = vi.fn();
    render(<ThreadFrontEditor state={state} thread={state.world.threads.t} pending={false} onPropose={onPropose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Предложить отметку' }));
    expect(onPropose).toHaveBeenCalledWith(expect.objectContaining({ patch: { kind: 'threadFront', id: 't', front: expect.objectContaining({ dangers: expect.arrayContaining([expect.objectContaining({ portents: [expect.objectContaining({ fulfilled: true })] })]) }) } }));
    expect(state.world.threads.t.front.dangers[0].portents[0].fulfilled).toBe(false);
  });

  it('lets the GM propose a consequence record only after every portent for the danger has passed', () => {
    const state = stateWithThread();
    state.world.threads.t.front = {
      source: 'dungeon-world-srd:fronts', type: 'adventure', stakes: ['Откроет ли культ ворота?'], dangers: [
        { id: 'cult', name: 'Культ', impulse: 'распространить веру', impendingDoom: 'тирания', portents: [{ id: 'sign', text: 'Культ вербует стражу', fulfilled: true }] },
        { id: 'storm', name: 'Буря', impulse: 'обрушиться на город', impendingDoom: 'разрушение', portents: [] },
      ],
    };
    const onPropose = vi.fn();
    render(<ThreadFrontEditor state={state} thread={state.world.threads.t} pending={false} onPropose={onPropose} />);
    fireEvent.change(screen.getByLabelText('Запись исхода опасности Культ'), { target: { value: 'Стража распустила культ.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Предложить запись исхода' }));
    expect(onPropose).toHaveBeenCalledWith(expect.objectContaining({ patch: { kind: 'threadFront', id: 't', front: expect.objectContaining({ dangers: expect.arrayContaining([expect.objectContaining({ resolution: { text: 'Стража распустила культ.', atSec: 0 } })]) }) } }));
    expect(state.world.threads.t.front.dangers[0].resolution).toBeUndefined();
  });
});
