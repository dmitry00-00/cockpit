// RollModal: шапка с костью и подписью, формула, итог по исходу (крит золото, провал урон, иначе tx),
// бирки костей (20 на d20 — золото) и модификатора со знаком, строка крит/провал, метка скрытого броска у итога,
// переключатель «скрытый бросок» — про будущее, история не длиннее десяти; проекции rollHistoryOf / lastRollOf
// на синтетическом логе с отменой через undoes и повтором через redoes.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DiceRolled, DomainEvent } from '../engine';
import { HISTORY_MAX, RollModal, diceSides, lastRollOf, rollHistoryOf, type RollHistoryItem } from './RollModal';

const EMOJI = /\p{Extended_Pictographic}/u;
const MINUS = '−';

const rollOf = (over: Partial<DiceRolled> = {}): DiceRolled => ({
  formula: '1d20+8', dice: [14], mod: 8, total: 22, hidden: false, label: 'DEX · Скрытность', ...over,
});

let seq = 0;
const ev = (id: string, payload: DiceRolled, extra: Partial<DomainEvent> = {}): DomainEvent =>
  ({ id, seq: ++seq, at: seq, worldSec: 0, type: 'DICE_ROLLED', payload, ...extra }) as DomainEvent;
const damage = (id: string): DomainEvent =>
  ({ id, seq: ++seq, at: seq, worldSec: 0, type: 'DAMAGE_APPLIED', payload: { targetId: 'bo', amount: 3 } }) as DomainEvent;

const modal = () => screen.getByRole('region', { name: /^Бросок: / });
const total = () => modal().querySelector('[data-part="total"] span') as HTMLElement;
const dice = () => Array.from(modal().querySelectorAll('[data-part="die"]')) as HTMLElement[];
const mod = () => modal().querySelector('[data-part="mod"]') as HTMLElement | null;
const outcome = () => modal().querySelector('[data-part="outcome"]') as HTMLElement | null;
const history = () => screen.queryByRole('list', { name: 'Последние броски' });

describe('проекции лога', () => {
  it('rollHistoryOf: только DICE_ROLLED, новые первыми, отменённый через undoes пропущен, компенсации не строки, redoes возвращает', () => {
    const r1 = rollOf({ label: 'Bo · атака', dice: [20], total: 28, formula: '1d20+8' });
    const r2 = rollOf({ label: 'Lyra · Arcana', dice: [11], mod: 5, total: 16, formula: '1d20+5', hidden: true });
    const r3 = rollOf({ label: 'Урон', dice: [3, 5], mod: 2, total: 10, formula: '2d6+2' });
    const events = [ev('a', r1), damage('d1'), ev('b', r2), ev('c', r3), ev('u1', r3, { undoes: 'c' })];
    expect(rollHistoryOf(events).map(h => h.id)).toEqual(['b', 'a']);
    expect(rollHistoryOf(events)[1]).toEqual({ id: 'a', label: 'Bo · атака', formula: '1d20+8', total: 28, outcome: 'crit', hidden: false });
    expect(rollHistoryOf(events)[0]).toMatchObject({ id: 'b', hidden: true, outcome: null });
    const redone = [...events, ev('r1', r3, { redoes: 'c' })];
    expect(rollHistoryOf(redone).map(h => h.id)).toEqual(['c', 'b', 'a']);
    expect(rollHistoryOf(redone)[0]).toMatchObject({ outcome: null, formula: '2d6+2', total: 10 });
    expect(rollHistoryOf([])).toEqual([]);
    expect(rollHistoryOf([damage('x')])).toEqual([]);
  });

  it('rollHistoryOf: срез limit — по умолчанию десять из двенадцати, limit 3 — три', () => {
    const events = Array.from({ length: 12 }, (_, i) => ev(`e${i}`, rollOf({ total: i })));
    const ten = rollHistoryOf(events);
    expect(ten).toHaveLength(HISTORY_MAX);
    expect(ten[0].id).toBe('e11');
    expect(ten.at(-1)!.id).toBe('e2');
    expect(rollHistoryOf(events, 3).map(h => h.id)).toEqual(['e11', 'e10', 'e9']);
  });

  it('lastRollOf: последний действующий бросок; отмена откатывает к предыдущему; без бросков — null', () => {
    const r1 = rollOf({ total: 1 });
    const r2 = rollOf({ total: 2 });
    const events = [ev('a', r1), ev('b', r2), damage('d')];
    expect(lastRollOf(events)).toEqual({ id: 'b', roll: r2 });
    expect(lastRollOf([...events, ev('u', r2, { undoes: 'b' })])).toEqual({ id: 'a', roll: r1 });
    expect(lastRollOf([...events, ev('u', r2, { undoes: 'b' }), ev('r', r2, { redoes: 'b' })])).toEqual({ id: 'b', roll: r2 });
    expect(lastRollOf([damage('d')])).toBeNull();
    expect(lastRollOf([])).toBeNull();
  });

  it('diceSides: сторона кости из формулы', () => {
    expect(diceSides('1d20+8')).toBe(20);
    expect(diceSides('2d6')).toBe(6);
    expect(diceSides('d100')).toBe(100);
    expect(diceSides('')).toBeNull();
  });
});

describe('RollModal', () => {
  it('обычный бросок: section «Бросок: подпись», кость gd 24, подпись type-num-12 uppercase t2, формула, итог type-num-32 tx, бирки', () => {
    render(<RollModal roll={rollOf()} />);
    const m = modal();
    expect(m.tagName).toBe('SECTION');
    expect(m).toHaveAttribute('aria-label', 'Бросок: DEX · Скрытность');
    expect(m).toHaveClass('w-80', 'bg-pn', 'shadow-bevel', 'p-3');
    const die = within(m).getByRole('img', { name: 'Бросок' });
    expect(die).toHaveAttribute('width', '24');
    expect(die.querySelector('path[fill="var(--gd)"]')).not.toBeNull();
    expect(within(m).getByTitle('DEX · Скрытность')).toHaveClass('type-num-12', 'uppercase', 'text-t2');
    expect(m.querySelector('[data-part="formula"]')).toHaveTextContent('1d20+8');
    expect(m.querySelector('[data-part="formula"]')).toHaveClass('type-body-sm', 'text-t2');
    expect(total()).toHaveTextContent('22');
    expect(total()).toHaveClass('type-num-32', 'text-tx');
    expect(dice().map(d => d.textContent)).toEqual(['14']);
    expect(dice()[0]).toHaveAttribute('title', 'd20: 14');
    expect(dice()[0]).toHaveClass('type-num-12', 'px-1', 'bg-cd', 'shadow-bevel', 'text-t2');
    expect(mod()).toHaveTextContent('+8');
    expect(mod()).toHaveClass('type-num-12', 'bg-cd', 'shadow-bevel', 'text-t2');
    expect(outcome()).toBeNull();
    expect(m).not.toHaveAttribute('data-outcome');
    expect(history()).toBeNull();
    // Сам бросок не скрыт — метки у итога нет; иконка переключателя — одна.
    expect(within(m).queryByRole('img', { name: /игроки не видели/ })).toBeNull();
    expect(m.textContent).not.toMatch(EMOJI);
  });

  it('крит: итог и бирка 20 — золото, строка «Крит» uppercase; исход по d20Outcome, если не передан', () => {
    render(<RollModal roll={rollOf({ dice: [20], total: 28 })} />);
    expect(modal()).toHaveAttribute('data-outcome', 'crit');
    expect(total()).toHaveClass('text-gd');
    expect(dice()[0]).toHaveClass('text-gd');
    expect(outcome()).toHaveTextContent('Крит');
    expect(outcome()).toHaveClass('type-num-12', 'uppercase', 'text-gd');
  });

  it('провал: итог и бирка 1 — цвет урона, строка «Провал»; переданный outcome главнее вычисленного', () => {
    const { rerender } = render(<RollModal roll={rollOf({ dice: [1], total: 9 })} />);
    expect(modal()).toHaveAttribute('data-outcome', 'fail');
    expect(total()).toHaveClass('text-fx-damage-hi');
    expect(dice()[0]).toHaveClass('text-fx-damage-hi');
    expect(outcome()).toHaveTextContent('Провал');
    expect(outcome()).toHaveClass('text-fx-damage-hi');
    rerender(<RollModal roll={rollOf({ dice: [1], total: 9 })} outcome={null} />);
    expect(outcome()).toBeNull();
    expect(total()).toHaveClass('text-tx');
    rerender(<RollModal roll={rollOf({ dice: [14] })} outcome="crit" />);
    expect(outcome()).toHaveTextContent('Крит');
  });

  it('несколько костей и минус: 2d6−1 — две бирки «d6: …», модификатор «−1» с U+2212, ни крита, ни провала; без модификатора бирки нет', () => {
    const { rerender } = render(<RollModal roll={rollOf({ formula: '2d6-1', dice: [6, 1], mod: -1, total: 6, label: 'Урон' })} />);
    expect(dice().map(d => d.textContent)).toEqual(['6', '1']);
    expect(dice().map(d => d.title)).toEqual(['d6: 6', 'd6: 1']);
    for (const d of dice()) expect(d).toHaveClass('text-t2');
    expect(mod()).toHaveTextContent(`${MINUS}1`);
    expect(outcome()).toBeNull();
    rerender(<RollModal roll={rollOf({ formula: '1d20', dice: [20], mod: 0, total: 20, label: '' })} />);
    expect(mod()).toBeNull();
    // Без подписи в шапке стоит формула, и отдельной строкой она не повторяется.
    expect(modal()).toHaveAttribute('aria-label', 'Бросок: 1d20');
    expect(modal().querySelector('[data-part="formula"]')).toBeNull();
    expect(within(modal()).getByTitle('1d20')).toHaveTextContent('1d20');
  });

  it('скрытый бросок: метка у итога иконкой hidden цветом src-players; переключатель — про будущее, отдельно', () => {
    const onHiddenChange = vi.fn();
    const { rerender } = render(<RollModal roll={rollOf({ hidden: true })} hidden={false} onHiddenChange={onHiddenChange} />);
    const mark = within(modal().querySelector('[data-part="total"]') as HTMLElement).getByRole('img', { name: /Скрытый бросок/ });
    expect(mark).toHaveAttribute('width', '16');
    expect(mark.querySelector('path[fill*="--src-players"]')).not.toBeNull();
    const box = screen.getByRole('checkbox', { name: /скрытый бросок/ });
    expect(box).not.toBeChecked();
    expect(box).toHaveClass('appearance-none', 'bg-wl', 'shadow-bevel-in', 'checked:bg-gd');
    fireEvent.click(box);
    expect(onHiddenChange).toHaveBeenCalledWith(true);
    // Компонент не хранит положение: пока страница не передала hidden, флажок остаётся снятым.
    expect(box).not.toBeChecked();
    rerender(<RollModal roll={rollOf({ hidden: false })} hidden onHiddenChange={onHiddenChange} />);
    expect(screen.getByRole('checkbox', { name: /скрытый бросок/ })).toBeChecked();
    expect(within(modal().querySelector('[data-part="total"]') as HTMLElement).queryByRole('img')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /скрытый бросок/ }));
    expect(onHiddenChange).toHaveBeenLastCalledWith(false);
    expect(within(screen.getByText('скрытый бросок').closest('label')!).getByRole('img', { name: 'Скрыт от игроков' })).toBeInTheDocument();
  });

  it('история: не больше десяти строк, «подпись … итог», крит золотом, провал уроном, скрытый — с иконкой; шов сверху', () => {
    const items: RollHistoryItem[] = Array.from({ length: 12 }, (_, i) => ({
      id: `h${i}`, label: `Бросок ${i}`, formula: '1d20+1', total: 10 + i, outcome: i === 0 ? 'crit' : i === 1 ? 'fail' : null, hidden: i === 2,
    }));
    render(<RollModal roll={rollOf()} history={items} />);
    const list = history()!;
    expect(list).not.toBeNull();
    expect(list).toHaveClass('pt-2');
    expect(list.className).toContain('inset_0_1px_0_var(--lo)');
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(HISTORY_MAX);
    expect(rows.map(r => r.textContent)).toEqual(items.slice(0, HISTORY_MAX).map(h => `${h.label}${h.hidden ? 'Скрытый бросок' : ''}${h.total}`));
    for (const r of rows) expect(r).toHaveClass('type-body-sm', 'text-t2');
    const totalOf = (r: HTMLElement) => r.querySelector('[data-part="history-total"]') as HTMLElement;
    expect(totalOf(rows[0])).toHaveClass('text-gd');
    expect(totalOf(rows[1])).toHaveClass('text-fx-damage-hi');
    expect(totalOf(rows[2])).toHaveClass('text-tx');
    expect(within(rows[2]).getByRole('img', { name: 'Скрытый бросок' })).toBeInTheDocument();
    expect(within(rows[3]).queryByRole('img')).toBeNull();
    expect(within(list).queryByText('Бросок 10')).toBeNull();
    expect(within(rows[0]).getByTitle('Бросок 0 · 1d20+1')).toHaveClass('truncate');
  });

  it('пустая история — списка нет вовсе', () => {
    render(<RollModal roll={rollOf()} history={[]} />);
    expect(history()).toBeNull();
  });

  it('переброс: бирка «R» — кнопка с тултипом клавиши только при onReroll; крестик «Закрыть бросок» только при onClose', () => {
    const onReroll = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(<RollModal roll={rollOf()} />);
    expect(screen.queryByTitle('Перебросить · R')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Закрыть бросок' })).toBeNull();
    rerender(<RollModal roll={rollOf()} onReroll={onReroll} onClose={onClose} />);
    const r = screen.getByRole('button', { name: 'R' });
    expect(r).toHaveAttribute('title', 'Перебросить · R');
    expect(r).toHaveClass('type-key', 'text-t2', 'bg-cd', 'shadow-bevel-in', 'px-1');
    fireEvent.click(r);
    expect(onReroll).toHaveBeenCalledTimes(1);
    const x = screen.getByRole('button', { name: 'Закрыть бросок' });
    expect(within(x).getByRole('img', { name: 'Закрыть' })).toBeInTheDocument();
    fireEvent.click(x);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('сторож: нет эмодзи, нет text-t3, нет hex-цветов и радиусов в классах; у каждой иконки title', () => {
    const { container } = render(
      <RollModal
        roll={rollOf({ dice: [20], total: 28, hidden: true })}
        history={[{ id: 'h', label: 'x', formula: '1d20', total: 1, outcome: 'fail', hidden: true }]}
        onReroll={() => {}}
        onClose={() => {}}
      />
    );
    expect(container.innerHTML).not.toMatch(EMOJI);
    for (const el of [modal(), ...modal().querySelectorAll('*')]) {
      const cls = el.getAttribute('class') ?? '';
      expect(cls).not.toMatch(/(^|\s)text-t3(\s|$)/);
      expect(cls).not.toMatch(/#[0-9a-f]{3,6}\b/i);
      expect(cls).not.toMatch(/rounded/);
    }
    for (const icon of modal().querySelectorAll('svg')) expect(icon.querySelector('title')?.textContent).toBeTruthy();
  });
});
