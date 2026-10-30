// PartyFooter, припасы: число и сколько унесут в «Запасе», на сколько дней хватит; сверх сил — подсвечено; запись —
// количество и причина, «потеряно» больше, чем есть, — нельзя; в строке покоя — остаток.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PartyFooter, type PartySummaryData } from './PartyFooter';

const SUMMARY: PartySummaryData = {
  count: 4, levels: { min: 4, max: 4 }, hp: { current: 150, max: 180 }, hitDice: { available: 12, total: 16 }, leaders: [], gaps: [],
};
const footer = (supply: Parameters<typeof PartyFooter>[0]['supply']) =>
  render(<PartyFooter total={4} selected={0} summary={SUMMARY} onCompare={() => {}} onClear={() => {}} defaultOpen supply={supply} />);

describe('PartyFooter · припасы', () => {
  it('число/унесут, хватит на дни, остаток в строке покоя; без листа у кого-то — без «унесут»', () => {
    const { unmount } = footer({ value: 9, capacity: 50, perDay: 4 });
    expect(screen.getByText('9/50')).toBeInTheDocument();
    expect(screen.getByText('2 дн')).toBeInTheDocument();
    expect(screen.getByText(/· припасы 9/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Записать' })).toBeNull();
    unmount();
    footer({ value: 9, capacity: null, perDay: 4 });
    expect(screen.getByText('9')).toHaveAttribute('title', 'Сколько унесут — не у всех есть лист');
  });

  it('сверх сил — подсвечено', () => {
    footer({ value: 60, capacity: 50, perDay: 4 });
    expect(screen.getByText('60/50').className).toMatch(/text-fx-debuff-hi/);
  });

  it('запись: количество и причина; «потеряно» больше, чем есть, — выключено', () => {
    const onChange = vi.fn();
    footer({ value: 3, capacity: 50, perDay: 4, onChange });
    fireEvent.change(screen.getByRole('textbox', { name: 'Сколько припасов' }), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Записать' }));
    expect(onChange).toHaveBeenCalledWith('bought', 5);
    fireEvent.change(screen.getByRole('textbox', { name: 'Сколько припасов' }), { target: { value: '4' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Причина' }), { target: { value: 'lost' } });
    expect(screen.getByRole('button', { name: 'Записать' })).toBeDisabled();
  });
});
