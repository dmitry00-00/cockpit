// Журнал сессии и нити: входящие предложения, принятые дельты, связь с фактами.
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, cardOf, lastEvent, startCombat, journalView, inbox, deltaCard, openJournal } from './testkit';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

/* ---------- Журнал и нити (шаг 7): принятая дельта в журнале связана с породившим её фактом по causeId ---------- */

describe('журнал и нити', () => {
  it('J открывает журнал сессии: четыре записи сида, фильтр по нити «The Missing Caravan» оставляет заметку о прибытии; карточка нити выбрана; Esc возвращает стол', () => {
    mount();
    expect(screen.queryByRole('region', { name: 'Журнал сессии' })).toBeNull();
    openJournal();
    const view = journalView();
    expect(within(view).getByText('Записей: 4 из 4')).toBeInTheDocument();
    expect(within(view).getAllByRole('article')).toHaveLength(4);
    fireEvent.click(within(view).getByRole('button', { name: /#The Missing Caravan/ }));
    expect(within(view).getByText('Записей: 1 из 4')).toBeInTheDocument();
    const entry = within(view).getByRole('article');
    expect(entry).toHaveAttribute('aria-label', 'Партия прибыла в Neverwinter через Triboar Trail #The Missing Caravan');
    expect(entry).toHaveTextContent('Партия прибыла в @Neverwinter через @Triboar Trail #The Missing Caravan');
    expect(within(entry).getByRole('button', { name: 'Открыть карточку: Neverwinter' })).toBeInTheDocument();
    expect(within(entry).getByRole('button', { name: 'Нить: The Missing Caravan' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Нить: The Missing Caravan' })).toHaveAttribute('data-thread', 'thr-missing-caravan');
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Журнал сессии' })).toBeNull();
    expect(cardOf('Bo Tambernack')).toBeInTheDocument();
  });

  it('заметка — NOTE_ADDED с нитями фильтра и масштабом; упоминание актёра в записи открывает его карточку', () => {
    const { store } = mount();
    openJournal();
    const view = journalView();
    fireEvent.click(within(view).getByRole('button', { name: /#Old Owl Well/ }));
    const input = within(view).getByRole('textbox', { name: 'Заметка' });
    fireEvent.change(input, { target: { value: 'Korrin Battlehammer расспрашивает о Zhentarim' } });
    fireEvent.submit(input.closest('form')!);
    expect(lastEvent(store)).toMatchObject({ type: 'NOTE_ADDED', payload: { text: 'Korrin Battlehammer расспрашивает о Zhentarim', threadIds: ['thr-old-owl-well'], scale: 'settlement' } });
    expect(input).toHaveValue('');
    const entry = within(view).getAllByRole('article').at(-1)!;
    expect(within(entry).getByRole('button', { name: 'Открыть карточку: Zhentarim' })).toBeInTheDocument();
    fireEvent.click(within(entry).getByRole('button', { name: 'Открыть карточку: Korrin Battlehammer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Стол' }));
    expect(cardOf('Korrin Battlehammer')).toBeInTheDocument();
  });

  it('Q1: заметка без «Игрокам» — без флага (секрет мастера); с «Игрокам» — visible: true, после записи переключатель снимается', () => {
    const { store } = mount();
    openJournal();
    const view = journalView();
    const input = within(view).getByRole('textbox', { name: 'Заметка' });
    const toggle = within(view).getByRole('button', { name: 'Игрокам' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.change(input, { target: { value: 'Тайный план Zhentarim' } });
    fireEvent.submit(input.closest('form')!);
    expect(lastEvent(store).payload).not.toHaveProperty('visible');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(input, { target: { value: 'Партия решила идти к Triboar Trail' } });
    fireEvent.submit(input.closest('form')!);
    expect(lastEvent(store)).toMatchObject({ type: 'NOTE_ADDED', payload: { text: 'Партия решила идти к Triboar Trail', visible: true } });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('входящие: «Принять» слух → WORLD_DELTA_ACCEPTED в журнале стола; в журнале сессии запись несёт каскад «факт → предложение»; карточка нити показывает каскад; Ctrl+Z возвращает предложение во входящие', () => {
    const { store } = mount();
    expect(within(inbox()).getAllByRole('listitem')).toHaveLength(4);
    const rumor = deltaCard('Слух в таверне · Neverwinter');
    expect(rumor).toHaveTextContent('тишина');
    fireEvent.click(within(rumor).getByRole('button', { name: 'Принять' }));
    expect(lastEvent(store)).toMatchObject({ type: 'WORLD_DELTA_ACCEPTED', payload: { deltaId: 'd-owl-well-rumor', causeId: 'f-owl-well-undead', was: 'тишина' } });
    expect(within(inbox()).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('list', { name: 'Записи журнала' })).toHaveTextContent('Принято: Слух в таверне · @Neverwinter — тишина → у @Old Owl Well видели восставших мертвецов');

    openJournal();
    const view = journalView();
    const cascade = within(view).getByRole('list', { name: 'Каскад' });
    const steps = within(cascade).getAllByRole('listitem').map(li => li.textContent);
    expect(steps[0]).toContain('У Old Owl Well видели восставших мертвецов');
    expect(steps[1]).toContain('Слух в таверне · Neverwinter: тишина → у Old Owl Well видели восставших мертвецов');
    const thread = screen.getByRole('region', { name: 'Нить: Old Owl Well' });
    expect(thread).toHaveTextContent('каскад');
    expect(thread).toHaveTextContent('У Old Owl Well видели восставших мертвецов → Слух в таверне');

    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(screen.getByRole('status')).toHaveTextContent('Отменено: Принято: Слух в таверне · Neverwinter');
    expect(store.getState().state.deltas['d-owl-well-rumor'].status).toBe('pending');
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(within(inbox()).getAllByRole('listitem')).toHaveLength(4);
  });

  it('«Отклонить» — секрет мастера: запись есть на столе мастера и отсутствует в журнале игроков; «Переброс» — следующий вариант', () => {
    const { store } = mount();
    fireEvent.click(within(deltaCard('Zhentarim · Triboar Trail')).getByRole('button', { name: 'Переброс' }));
    expect(lastEvent(store)).toMatchObject({ type: 'WORLD_DELTA_REROLLED', payload: { deltaId: 'd-zhentarim-trail', variantId: 'v2' } });
    expect(deltaCard('Zhentarim · Triboar Trail')).toHaveTextContent('Harpers перехватили курьера');
    expect(within(deltaCard('Цены на железо и оружие · Neverwinter')).queryByRole('button', { name: 'Переброс' })).toBeNull();

    fireEvent.click(within(deltaCard('Цены на железо и оружие · Neverwinter')).getByRole('button', { name: 'Отклонить' }));
    expect(lastEvent(store).type).toBe('WORLD_DELTA_REJECTED');
    openJournal();
    const secret = within(journalView()).getAllByRole('article').at(-1)!;
    expect(secret).toHaveAttribute('data-secret');
    expect(secret).toHaveTextContent('Отклонено');
    cleanup();

    mount(store, false);
    openJournal();
    expect(within(journalView()).queryAllByRole('article').some(a => a.hasAttribute('data-secret'))).toBe(false);
    expect(within(journalView()).getByText(/Записей: 4 из 4/)).toBeInTheDocument();
  });

  it('напоминания о секретах: «Позже» прячет до перезагрузки, «Раскрыть» → FACT_REVEALED и запись «Открыто игрокам»', () => {
    const { store } = mount();
    openJournal();
    const view = journalView();
    expect(within(view).getAllByRole('group', { name: 'Напоминание' })).toHaveLength(2);
    const agent = within(view).getAllByRole('group', { name: 'Напоминание' }).find(g => g.textContent?.includes('Агент Zhentarim'))!;
    fireEvent.click(within(agent).getByRole('button', { name: 'Позже' }));
    expect(within(view).getAllByRole('group', { name: 'Напоминание' })).toHaveLength(1);
    fireEvent.click(within(view).getByRole('button', { name: 'Раскрыть' }));
    expect(lastEvent(store)).toMatchObject({ type: 'FACT_REVEALED', payload: { factId: 'f-owl-well-undead', audience: 'players' } });
    expect(within(view).queryAllByRole('group', { name: 'Напоминание' })).toHaveLength(0);
    expect(within(view).getAllByRole('article').at(-1)).toHaveTextContent('Открыто игрокам: У @Old Owl Well видели восставших мертвецов');
  });

  it('масштаб: урон в бою — «Бой»; фильтр по уровню оставляет только записи боя', () => {
    const { store } = mount();
    startCombat();
    act(() => store.getState().damage('bandit-1', 3));
    openJournal();
    const view = journalView();
    fireEvent.click(within(view).getByRole('button', { name: /Бой/ }));
    const texts = within(view).getAllByRole('article').map(a => a.getAttribute('aria-label'));
    expect(texts.some(t => t?.startsWith('Бой начался'))).toBe(true);
    expect(texts.some(t => t?.startsWith('Урон 3'))).toBe(true);
    expect(texts.some(t => t?.startsWith('Партия прибыла'))).toBe(false);
  });
});
