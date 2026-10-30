// Хроника по дням и стол на прошлый день (Д5): записи журнала под заголовками дней мира; «Стол на этот день» —
// реплей лога до конца дня в памяти: плашка, мир того дня, сделанное там в сессию не попадает; «Вернуться к
// сегодня» — стол сессии как был. Игрокам и на самом прошлом столе кнопки нет.
import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatHarptos } from '../../campaign';
import { mount, journalView, openJournal } from './testkit';

const days = () => [...journalView().querySelectorAll<HTMLElement>('li[data-day]')];

describe('хроника по дням и стол прошлого дня (Д5)', () => {
  it('заголовки дней; «Стол на этот день» — мир до конца дня; правки там не в сессии; «Вернуться»', () => {
    const { store } = mount();
    const firstDay = formatHarptos(store.getState().state.time.sec).replace(/,.*$/, '');
    act(() => { store.getState().note('Вчерашняя заметка', [], 'settlement'); });
    act(() => { store.getState().advanceTime('day'); });
    act(() => { store.getState().note('Сегодняшняя заметка', [], 'settlement'); });
    const sessionEvents = store.getState().events.length;
    openJournal();
    expect(days().map(d => d.querySelector('.type-h-15')?.textContent)).toEqual([firstDay, formatHarptos(store.getState().state.time.sec).replace(/,.*$/, '')]);
    // Сегодня — без кнопки: стол сегодняшнего дня и есть этот стол.
    expect(within(days()[1]).queryByRole('button', { name: 'Стол на этот день' })).toBeNull();
    fireEvent.click(within(days()[0]).getByRole('button', { name: 'Стол на этот день' }));

    const banner = document.querySelector('[data-part="past-view"]');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveTextContent(`Стол на ${firstDay} — реплей журнала до конца дня`);
    openJournal();
    expect(within(journalView()).getByText('Вчерашняя заметка')).toBeInTheDocument();
    expect(within(journalView()).queryByText('Сегодняшняя заметка')).toBeNull();
    expect(within(journalView()).queryByRole('button', { name: 'Стол на этот день' })).toBeNull();
    const input = within(journalView()).getByRole('textbox', { name: 'Заметка' });
    fireEvent.change(input, { target: { value: 'Заметка в прошлом' } });
    fireEvent.submit(input.closest('form')!);
    expect(within(journalView()).getByText('Заметка в прошлом')).toBeInTheDocument();
    expect(store.getState().events.length).toBe(sessionEvents);

    fireEvent.click(screen.getByRole('button', { name: 'Вернуться к сегодня' }));
    expect(document.querySelector('[data-part="past-view"]')).toBeNull();
    openJournal();
    expect(within(journalView()).getByText('Сегодняшняя заметка')).toBeInTheDocument();
    expect(within(journalView()).queryByText('Заметка в прошлом')).toBeNull();
  });

  it('игрокам кнопки «Стол на этот день» нет', () => {
    const { store } = mount(undefined, false);
    act(() => { store.getState().note('Видно всем', [], 'settlement', true); });
    act(() => { store.getState().advanceTime('day'); });
    openJournal();
    expect(days().length).toBeGreaterThan(0);
    expect(within(journalView()).queryByRole('button', { name: 'Стол на этот день' })).toBeNull();
  });
});
