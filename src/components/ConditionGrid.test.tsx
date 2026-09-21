// ConditionGrid: пятнадцать ячеек в порядке сетки, тумблеры отдают on, истощение — только уровнями
// через −/+, помощники переводят намерение в команды движка, и всё это сходится с реальным стором.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useStore } from 'zustand';
import { describe, expect, it, vi } from 'vitest';
import { seedEngine } from '../campaign';
import type { EngineStoreApi } from '../engine';
import { CONDITIONS, CONDITION_IDS } from '../rules/srd';
import { CONDITION_ORDER } from './ConditionChip';
import { ConditionGrid, exhaustionCommand, toggleCommand } from './ConditionGrid';

const EMOJI = /\p{Extended_Pictographic}/u;

describe('<ConditionGrid>', () => {
  it('пятнадцать ячеек: четырнадцать кнопок с aria-pressed и группа истощения последней; у каждой иконка с title', () => {
    const { container } = render(<ConditionGrid active={{}} onToggle={() => {}} onExhaustion={() => {}} />);
    const cells = [...container.querySelectorAll('[data-condition]')];
    expect(cells.map(c => c.getAttribute('data-condition'))).toEqual([...CONDITION_ORDER]);
    expect(cells.length).toBe(CONDITION_IDS.length);
    expect(cells.at(-1)!.getAttribute('data-condition')).toBe('exhaustion');
    const toggles = screen.getAllByRole('button', { pressed: false });
    expect(toggles.length).toBe(14);
    for (const id of CONDITION_IDS) {
      expect(screen.getByRole('img', { name: CONDITIONS[id].label }), id).toBeInTheDocument();
    }
    expect(screen.getByRole('group', { name: 'Истощение' })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(EMOJI);
    expect(container.innerHTML).not.toMatch(/\brounded/);
  });

  it('тултип ячейки — подпись и формулировка SRD дословно', () => {
    render(<ConditionGrid active={{}} onToggle={() => {}} onExhaustion={() => {}} />);
    const cell = screen.getByRole('button', { name: 'Ослеплён' });
    expect(cell.getAttribute('title')).toBe(`Ослеплён — ${CONDITIONS.blinded.text.join(' ')}`);
  });

  it('тумблер отдаёт on = чего ещё нет: выключенный → true, включённый → false', () => {
    const onToggle = vi.fn();
    const { rerender } = render(<ConditionGrid active={{}} onToggle={onToggle} onExhaustion={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Отравлен' }));
    expect(onToggle).toHaveBeenLastCalledWith('poisoned', true);

    rerender(<ConditionGrid active={{ poisoned: {} }} onToggle={onToggle} onExhaustion={() => {}} />);
    const cell = screen.getByRole('button', { name: 'Отравлен' });
    expect(cell).toHaveAttribute('aria-pressed', 'true');
    expect(cell.className).toContain('fx-debuff');
    fireEvent.click(cell);
    expect(onToggle).toHaveBeenLastCalledWith('poisoned', false);
    expect(screen.getByRole('button', { name: 'Ослеплён' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('невидимость — бафф: включённая ячейка красится fx-buff, а не fx-debuff', () => {
    render(<ConditionGrid active={{ invisible: {} }} onToggle={() => {}} onExhaustion={() => {}} />);
    const cell = screen.getByRole('button', { name: 'Невидим' });
    expect(cell.className).toContain('fx-buff');
    expect(cell.className).not.toContain('fx-debuff');
  });

  it('истощение — не тумблер: клик по ячейке ничего не шлёт, −/+ шагают уровень на единицу', () => {
    const onToggle = vi.fn();
    const onExhaustion = vi.fn();
    const { rerender } = render(<ConditionGrid active={{}} onToggle={onToggle} onExhaustion={onExhaustion} />);
    const cell = screen.getByRole('group', { name: 'Истощение' });
    fireEvent.click(cell);
    fireEvent.click(within(cell).getByText('Истощение', { selector: 'span' }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(onExhaustion).not.toHaveBeenCalled();
    expect(cell).toHaveAttribute('data-level', '0');
    expect(within(cell).getByTitle('Уровень истощения')).toHaveTextContent('0');

    const minus = within(cell).getByRole('button', { name: 'Истощение: снизить уровень (сейчас 0)' });
    const plus = within(cell).getByRole('button', { name: 'Истощение: повысить уровень (сейчас 0)' });
    expect(minus).toBeDisabled();
    fireEvent.click(minus);
    expect(onExhaustion).not.toHaveBeenCalled();
    fireEvent.click(plus);
    expect(onExhaustion).toHaveBeenLastCalledWith(1);

    rerender(<ConditionGrid active={{ exhaustion: { level: 2 } }} onToggle={onToggle} onExhaustion={onExhaustion} />);
    const cell2 = screen.getByRole('group', { name: 'Истощение' });
    expect(within(cell2).getByTitle('Уровень истощения')).toHaveTextContent('2');
    expect(cell2.className).toContain('fx-debuff');
    fireEvent.click(within(cell2).getByRole('button', { name: 'Истощение: повысить уровень (сейчас 2)' }));
    expect(onExhaustion).toHaveBeenLastCalledWith(3);
    fireEvent.click(within(cell2).getByRole('button', { name: 'Истощение: снизить уровень (сейчас 2)' }));
    expect(onExhaustion).toHaveBeenLastCalledWith(1);

    rerender(<ConditionGrid active={{ exhaustion: { level: 6 } }} onToggle={onToggle} onExhaustion={onExhaustion} />);
    expect(screen.getByRole('button', { name: 'Истощение: повысить уровень (сейчас 6)' })).toBeDisabled();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('уровень истощения слышен: имена «−»/«+» несут текущий уровень, живой регион озвучивает новый; видимое число — только глазу', () => {
    const { rerender } = render(<ConditionGrid active={{}} onToggle={() => {}} onExhaustion={() => {}} />);
    const cell = () => screen.getByRole('group', { name: 'Истощение' });
    const live = () => cell().querySelector('[data-part="level-live"]') as HTMLElement;
    expect(live()).toHaveAttribute('aria-live', 'polite');
    expect(live()).toHaveAttribute('aria-atomic', 'true');
    expect(live()).toHaveClass('sr-only');
    expect(live()).toHaveTextContent('Истощение: уровень 0');
    expect(within(cell()).getByTitle('Уровень истощения')).toHaveAttribute('aria-hidden', 'true');

    rerender(<ConditionGrid active={{ exhaustion: { level: 3 } }} onToggle={() => {}} onExhaustion={() => {}} />);
    expect(live()).toHaveTextContent('Истощение: уровень 3');
    expect(within(cell()).getByRole('button', { name: 'Истощение: снизить уровень (сейчас 3)' })).toBeEnabled();
    expect(within(cell()).getByRole('button', { name: 'Истощение: повысить уровень (сейчас 3)' })).toBeEnabled();
    expect(within(cell()).getAllByRole('button')).toHaveLength(2);
  });
});

describe('намерение → команда', () => {
  it('toggleCommand: включить — CONDITION_ADDED без level, выключить — CONDITION_REMOVED', () => {
    expect(toggleCommand('bo', 'poisoned', true)).toEqual({ type: 'CONDITION_ADDED', payload: { targetId: 'bo', conditionId: 'poisoned' } });
    expect(toggleCommand('bo', 'poisoned', false)).toEqual({ type: 'CONDITION_REMOVED', payload: { targetId: 'bo', conditionId: 'poisoned' } });
  });

  it('exhaustionCommand: 1–6 — явный уровень, 0 — снятие, за границы не выходит', () => {
    expect(exhaustionCommand('bo', 3)).toEqual({ type: 'CONDITION_ADDED', payload: { targetId: 'bo', conditionId: 'exhaustion', level: 3 } });
    expect(exhaustionCommand('bo', 0)).toEqual({ type: 'CONDITION_REMOVED', payload: { targetId: 'bo', conditionId: 'exhaustion' } });
    expect(exhaustionCommand('bo', 9).payload).toMatchObject({ level: 6 });
    expect(exhaustionCommand('bo', -2).type).toBe('CONDITION_REMOVED');
  });
});

/** Страница в миниатюре: стор держит она, сетка получает снимок и колбэки. */
function Harness({ store, id }: { store: EngineStoreApi; id: string }) {
  const actor = useStore(store, s => s.state.actors[id]);
  const dispatch = useStore(store, s => s.dispatch);
  return (
    <ConditionGrid
      active={actor.conditions}
      onToggle={(cid, on) => dispatch(toggleCommand(id, cid, on))}
      onExhaustion={level => dispatch(exhaustionCommand(id, level))}
    />
  );
}

describe('со стором', () => {
  it('клик по «Отравлен» кладёт CONDITION_ADDED без level, ячейка нажата; второй клик — CONDITION_REMOVED', () => {
    const store = seedEngine();
    const before = store.getState().events.length;
    render(<Harness store={store} id="bo" />);
    fireEvent.click(screen.getByRole('button', { name: 'Отравлен' }));
    const added = store.getState().events.at(-1)!;
    expect(added.type).toBe('CONDITION_ADDED');
    expect(added.payload).toEqual({ targetId: 'bo', conditionId: 'poisoned' });
    expect(store.getState().state.actors.bo.conditions.poisoned).toEqual({});
    expect(screen.getByRole('button', { name: 'Отравлен' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Отравлен' }));
    expect(store.getState().events.at(-1)!.type).toBe('CONDITION_REMOVED');
    expect(store.getState().state.actors.bo.conditions.poisoned).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Отравлен' })).toHaveAttribute('aria-pressed', 'false');
    expect(store.getState().events.length).toBe(before + 2);
  });

  it('«+» истощения дважды — уровень 2 в состоянии и на ячейке; «−» с единицы снимает совсем', () => {
    const store = seedEngine();
    render(<Harness store={store} id="bo" />);
    const cell = () => screen.getByRole('group', { name: 'Истощение' });
    const plus = () => within(cell()).getByRole('button', { name: /^Истощение: повысить уровень/ });
    const minus = () => within(cell()).getByRole('button', { name: /^Истощение: снизить уровень/ });
    const live = () => cell().querySelector('[data-part="level-live"]') as HTMLElement;
    fireEvent.click(plus());
    // После «+» и имя кнопки, и живой регион несут новый уровень.
    expect(plus()).toHaveAccessibleName('Истощение: повысить уровень (сейчас 1)');
    expect(live()).toHaveTextContent('Истощение: уровень 1');
    fireEvent.click(plus());
    expect(store.getState().state.actors.bo.conditions.exhaustion).toEqual({ level: 2 });
    expect(cell()).toHaveAttribute('data-level', '2');
    expect(minus()).toHaveAccessibleName('Истощение: снизить уровень (сейчас 2)');
    expect(live()).toHaveTextContent('Истощение: уровень 2');
    fireEvent.click(minus());
    expect(store.getState().state.actors.bo.conditions.exhaustion).toEqual({ level: 1 });
    fireEvent.click(minus());
    expect(store.getState().state.actors.bo.conditions.exhaustion).toBeUndefined();
    expect(cell()).toHaveAttribute('data-level', '0');
    expect(minus()).toBeDisabled();
    const types = store.getState().events.slice(-4).map(e => e.type);
    expect(types).toEqual(['CONDITION_ADDED', 'CONDITION_ADDED', 'CONDITION_ADDED', 'CONDITION_REMOVED']);
  });
});
