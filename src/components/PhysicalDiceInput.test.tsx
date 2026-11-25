import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhysicalDiceInput } from './PhysicalDiceInput';

afterEach(cleanup);

describe('physical dice input', () => {
  it('records the observed die face, modifier and label, then announces the result', () => {
    const onRoll = vi.fn();
    render(<PhysicalDiceInput hidden={false} onRoll={onRoll} />);
    fireEvent.click(screen.getByRole('button', { name: /Физический дайс/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Тип физической кости' }), { target: { value: '20' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Верхняя грань физической кости' }), { target: { value: '20' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Модификатор физического броска' }), { target: { value: '5' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Подпись физического броска' }), { target: { value: 'Атака' } });
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить физический бросок' }));

    expect(onRoll).toHaveBeenCalledWith({ sides: 20, face: 20, modifier: 5, label: 'Атака' });
    expect(screen.getByRole('status')).toHaveTextContent('d20: 20 + 5 = 25');
    expect(within(screen.getByRole('status')).getByText('25')).toBeInTheDocument();
  });

  it('rejects an observed face outside the selected die and does not emit a roll', () => {
    const onRoll = vi.fn();
    render(<PhysicalDiceInput hidden={false} onRoll={onRoll} />);
    fireEvent.click(screen.getByRole('button', { name: /Физический дайс/ }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Верхняя грань физической кости' }), { target: { value: '21' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Подтвердить физический бросок' }).closest('form')!);
    expect(onRoll).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('applies the current hidden-roll mode and closes with Escape', () => {
    render(<PhysicalDiceInput hidden onRoll={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Физический дайс/ }));
    expect(screen.getByText(/режим скрытых бросков применится/)).toBeInTheDocument();
    const label = screen.getByRole('textbox', { name: 'Подпись физического броска' });
    label.focus();
    fireEvent.keyDown(label, { key: 'Escape' });
    expect(screen.getByRole('button', { name: /Физический дайс/ })).toHaveAttribute('aria-expanded', 'false');
  });
});
