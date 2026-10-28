// Стол игроков: секретов мастера нет в DOM.
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, rowOf, bar, grid, tokenIn, journalView, inbox, openJournal, storeWithSecrets, expectNoSecrets } from './testkit';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

/* ---------- Глазами игроков (шаг 9): секретов нет в DOM — не скрыты стилями, а отсутствуют ---------- */

describe('глазами игроков', () => {
  it('P включает режим: рамка и бирка есть, стол назван столом игроков; P возвращает мастера — обёртки нет вовсе', () => {
    const { container } = mount();
    expect(container.querySelector('[data-player-view]')).toBeNull();
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });
    const frame = container.querySelector('[data-player-view]')!;
    expect(frame).not.toBeNull();
    expect(frame.querySelector('[data-part="ring"]')).not.toBeNull();
    expect(frame).toHaveTextContent('Глазами игроков · P');
    expect(screen.getByRole('main', { name: 'Стол игроков' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });
    expect(container.querySelector('[data-player-view]')).toBeNull();
    expect(screen.getByRole('main', { name: 'Стол' })).toBeInTheDocument();
    // Кнопка «Игроки» — тот же переключатель; на столе игроков её нет, назад — только P.
    fireEvent.click(screen.getByRole('button', { name: 'Игроки' }));
    expect(container.querySelector('[data-player-view]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Игроки' })).toBeNull();
  });

  it('на столе игроков ни один секрет не присутствует в DOM — в столе, в журнале сессии, в бою и во времени', () => {
    const { container, store } = mount(storeWithSecrets());
    // У мастера секреты на месте — иначе проверка ниже ничего не доказывает.
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toContain('DM');
    expect(document.body.textContent).toContain('Отклонено');
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });
    expectNoSecrets();
    // Что видно: партия, карточка Bo без вкладки DM, журнал без секретов, хроника с открытыми нитями, обычный бросок.
    expect(screen.getByRole('region', { name: 'Bo Tambernack' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map(t => t.textContent)).not.toContain('DM');
    expect(screen.getByLabelText('Хроника похода', { selector: 'aside' })).toHaveTextContent('The Missing Caravan');
    expect(screen.getByRole('list', { name: 'Записи журнала' })).toHaveTextContent('Партия прибыла');

    openJournal();
    expectNoSecrets();
    expect(within(journalView()).getByText(/Записей: 4 из 4/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

    // Вид «Время» игрокам недоступен; T, R и Space — клавиши мастера, здесь молчат; бросок с плитки виден без переключателя скрытости.
    expect(screen.queryByRole('button', { name: 'Время' })).toBeNull();
    const before = store.getState().events.length;
    fireEvent.keyDown(window, { key: 't', code: 'KeyT' });
    fireEvent.keyDown(window, { key: 'r', code: 'KeyR' });
    expect(store.getState().events).toHaveLength(before);
    fireEvent.click(screen.getByRole('button', { name: /^DEX/ }));
    const modal = screen.getByRole('region', { name: /^Бросок/ });
    expect(modal).toHaveTextContent('DEX · Bo Tambernack');
    expect(within(modal).queryByRole('checkbox')).toBeNull();
    expectNoSecrets();
    expect(container.querySelector('[data-player-view]')).not.toBeNull();
  });

  it('стол, поднятый с dmView=false, — сразу стол игроков; бой на нём тоже без секретов', () => {
    const store = storeWithSecrets();
    const { container } = mount(store, false);
    expect(container.querySelector('[data-player-view]')).not.toBeNull();
    act(() => store.getState().startEncounter());
    expectNoSecrets();
    expect(bar()).toBeInTheDocument();
    // Токен выбирает актёра, но попап хитов не открывает; Space ход не делает.
    fireEvent.click(tokenIn(grid(), 'captain')!);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(store.getState().state.encounter.turnIndex).toBe(0);
    expectNoSecrets();
    // Мастер вернулся — ничего не потерял: вкладка DM, входящие, тост.
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });
    fireEvent.click(rowOf('Bo Tambernack'));
    fireEvent.click(screen.getByRole('button', { name: 'Карточка' })); // в бою карточка — по кнопке
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toContain('DM');
    expect(inbox()).toBeInTheDocument();
  });
});
