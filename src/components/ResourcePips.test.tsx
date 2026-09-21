import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResourcePips, parsePoolAmount } from './ResourcePips';

describe('ResourcePips', () => {
  it('пипки: закрашенные — остаток, утопленные — потрачено; клик по закрашенной тратит одну, по утопленной — возвращает одну', () => {
    const onSpend = vi.fn();
    const onRestore = vi.fn();
    render(<ResourcePips id="slot-1" label="Ячейки 1-го круга" max={4} spent={1} kind="slots" restoresOn="long" onSpend={onSpend} onRestore={onRestore} />);
    const group = screen.getByRole('group', { name: 'Ячейки 1-го круга: 3 из 4' });
    expect(group).toHaveAttribute('title', 'Ячейки 1-го круга: 3 из 4 · вернёт долгий отдых');
    const on = screen.getAllByRole('button', { name: 'Потратить: Ячейки 1-го круга' });
    const off = screen.getAllByRole('button', { name: 'Вернуть: Ячейки 1-го круга' });
    expect(on).toHaveLength(3);
    expect(off).toHaveLength(1);
    fireEvent.click(on[0]);
    expect(onSpend).toHaveBeenCalledWith(1);
    fireEvent.click(off[0]);
    expect(onRestore).toHaveBeenCalledWith(1);
  });

  it('без колбэков — только показ: кнопок нет, пипки помечены data-on', () => {
    const { container } = render(<ResourcePips id="ki" label="Очки ци" max={5} spent={5} kind="uses" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelectorAll('[data-on="false"]')).toHaveLength(5);
  });

  it('больше двенадцати — число и кнопки по одной; запас — поле «сколько», Enter тратит, «Вернуть» возвращает всё', () => {
    const onSpend = vi.fn();
    const onRestore = vi.fn();
    const { rerender } = render(<ResourcePips id="ki" label="Очки ци" max={20} spent={3} kind="uses" onSpend={onSpend} onRestore={onRestore} />);
    expect(screen.getByRole('group', { name: 'Очки ци: 17 из 20' })).toHaveTextContent('17 / 20');
    fireEvent.click(screen.getByRole('button', { name: 'Потратить: Очки ци' }));
    expect(onSpend).toHaveBeenLastCalledWith(1);
    rerender(<ResourcePips id="lay-on-hands" label="Наложение рук" max={25} spent={5} kind="pool" onSpend={onSpend} onRestore={onRestore} />);
    const input = screen.getByRole('textbox', { name: 'Сколько потратить: Наложение рук' });
    expect(screen.getByRole('button', { name: 'Потратить: Наложение рук' })).toBeDisabled();
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSpend).toHaveBeenLastCalledWith(7);
    expect(input).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Вернуть: Наложение рук' }));
    expect(onRestore).toHaveBeenLastCalledWith(5);
  });

  it('parsePoolAmount: 1…остаток, иначе null', () => {
    expect(parsePoolAmount('7', 20)).toBe(7);
    expect(parsePoolAmount('0', 20)).toBeNull();
    expect(parsePoolAmount('21', 20)).toBeNull();
    expect(parsePoolAmount('x', 20)).toBeNull();
  });
});
