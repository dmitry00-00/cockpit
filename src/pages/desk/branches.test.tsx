// Ветки «что если» на столе (Д4): в «Пульсе» открыть ветку, в ней принять ждущее и шагнуть на три десятидневки —
// основная линия та же, разница рядом; вторая ветка — третья колонка; «Оставить» — события ветки в журнал, ветки
// закрыты; «Отбросить» — ветки нет; ушла основная линия — «Оставить» выключено.
import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mount } from './testkit';

const openPulse = () => fireEvent.keyDown(window, { key: 'w', code: 'KeyW' });
const panel = () => screen.getByRole('region', { name: 'Ветки «что если»' });
const branch = (name: string) => within(panel()).getByRole('region', { name: `Ветка: ${name}` });

describe('ветки «что если» (Д4)', () => {
  it('открыть, принять в ветке, три десятидневки: основная та же, разница рядом; «Оставить» — в журнал', () => {
    const { store } = mount();
    openPulse();
    const before = store.getState().events.length;
    fireEvent.click(within(panel()).getByRole('button', { name: 'Открыть ветку' }));
    const b = branch('Если партия поможет');
    const pendingId = Object.values(store.getState().state.deltas).find(d => d.status === 'pending')!.id;
    const subject = store.getState().state.deltas[pendingId].subject;
    const row = within(within(b).getByRole('list', { name: /^Ждёт решения/ })).getAllByRole('listitem').find(li => li.textContent?.startsWith(subject))!;
    fireEvent.click(within(row).getByRole('button', { name: 'Принять' }));
    fireEvent.click(within(b).getByRole('button', { name: 'Три десятидневки' }));
    expect(store.getState().events.length).toBe(before);
    const diff = within(panel()).getByRole('table', { name: 'Разница с основной линией' });
    expect(diff.querySelector('[data-diff="time"]')).toHaveTextContent(/Mirtul.*Kythorn/);

    fireEvent.click(within(panel()).getByRole('button', { name: 'Открыть ветку' }));
    expect(within(diff).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Что', 'Основная', 'Если партия поможет', 'Если нет']);
    expect(within(panel()).queryByRole('button', { name: 'Открыть ветку' })).toBeNull();

    const n = store.getState().events.length;
    fireEvent.click(within(branch('Если партия поможет')).getByRole('button', { name: 'Оставить' }));
    expect(store.getState().events.length).toBeGreaterThan(n);
    expect(store.getState().state.deltas[pendingId].status).toBe('accepted');
    expect(store.getState().toast).toMatch(/^Ветка оставлена/);
    expect(within(panel()).queryByRole('region', { name: /^Ветка:/ })).toBeNull();
  });

  it('основная линия ушла — «Оставить» выключено; «Отбросить» — ветки нет', () => {
    const { store } = mount();
    openPulse();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Открыть ветку' }));
    fireEvent.click(within(branch('Если партия поможет')).getByRole('button', { name: 'Три десятидневки' }));
    act(() => { store.getState().changeSupply('bought', 1); });
    expect(within(branch('Если партия поможет')).getByRole('button', { name: 'Оставить' })).toBeDisabled();
    fireEvent.click(within(branch('Если партия поможет')).getByRole('button', { name: 'Отбросить' }));
    expect(within(panel()).queryByRole('region', { name: /^Ветка:/ })).toBeNull();
  });
});
