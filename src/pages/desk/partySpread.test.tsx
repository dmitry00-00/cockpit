import { act, fireEvent, screen, within, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { seedEngine } from '../../campaign';
import { memoryStore } from '../../engine';
import { fixed, mount } from './testkit';

const setup = (count = 4) => {
  const store = seedEngine({ persist: memoryStore(), ...fixed() });
  for (let n = 5; n <= count; n++) {
    const actor = structuredClone(store.getState().state.actors.bo);
    store.getState().spawn({ ...actor, id: `party-${n}`, name: `Участник ${n}` }, true);
  }
  return mount(store, undefined, 'card');
};
const info = () => screen.getByRole('button', { name: /Информация о партии/ });
const spread = () => screen.getByRole('region', { name: /^(Линия|Карточки) партии$/ });

describe('Д17: раскладка реальной партии на столе', () => {
  it('карта не содержит полные карточки; корешок открывает всю партию, Karte мира возвращает карту, черновики сохраняются', () => {
    const { store } = setup();
    const before = store.getState().events;
    expect(screen.queryByRole('article', { name: /^Карта персонажа:/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Bo Tambernack' }));
    expect(screen.queryByRole('region', { name: 'Линия партии' })).toBeNull();
    expect(within(spread()).getAllByRole('article', { name: /^Карта персонажа:/ })).toHaveLength(4);
    expect(within(spread()).getByRole('region', { name: 'Состояние партии' })).toHaveTextContent('Общие припасы');
    const bo = within(spread()).getByRole('article', { name: 'Карта персонажа: Bo Tambernack' });
    const draft = within(bo).getByRole('spinbutton', { name: 'Сколько хитов' });
    fireEvent.change(draft, { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Карта мира' }));
    expect(screen.queryByRole('article', { name: /^Карта персонажа:/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Korrin Battlehammer' }));
    expect(within(spread()).getByRole('article', { name: 'Карта персонажа: Bo Tambernack' })).toBe(bo);
    expect(within(spread()).getAllByRole('article', { name: /^Карта персонажа:/ })).toHaveLength(4);
    expect(draft).toHaveValue(9);
    expect(within(bo).getByRole('spinbutton', { name: 'Сколько хитов' })).toHaveValue(9);
    expect(store.getState().events).toBe(before);
  });

  it('часы переходят в строку партии без дубля; Escape закрывает только календарь', async () => {
    const { store } = setup();
    const before = store.getState().events;
    expect(screen.getAllByRole('button', { name: 'Управление временем' })).toHaveLength(1);
    fireEvent.click(info());
    const context = within(spread()).getByRole('region', { name: 'Состояние партии' });
    const trigger = within(context).getByRole('button', { name: 'Управление временем' });
    expect(document.querySelector('.desk-world-clock-dock')).toBeNull();
    trigger.focus(); fireEvent.click(trigger);
    const calendar = await screen.findByRole('dialog', { name: 'Управление временем' });
    fireEvent.keyDown(calendar, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Управление временем' })).toBeNull());
    expect(info()).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(trigger).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'Карта мира' }));
    expect(screen.getAllByRole('button', { name: 'Управление временем' })).toHaveLength(1);
    expect(document.querySelector('.desk-world-clock-dock .desk-time-trigger')).not.toBeNull();
    expect(store.getState().events).toBe(before);
  });

  it('лист другого участника открывается поверх раскладки, возвращает фокус и не сбрасывает поля', async () => {
    const { store } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Korrin Battlehammer' }));
    const korrin = within(spread()).getByRole('article', { name: 'Карта персонажа: Korrin Battlehammer' });
    const amount = within(korrin).getByRole('spinbutton', { name: 'Сколько хитов' });
    fireEvent.change(amount, { target: { value: '4' } });
    const trigger = within(korrin).getByRole('button', { name: 'Лист' });
    trigger.focus(); fireEvent.click(trigger);
    const sheet = screen.getByRole('dialog', { name: 'Полный лист · Korrin Battlehammer' });
    expect(sheet.closest('[inert]')).toBeNull();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Закрыть' }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(amount).toHaveValue(4);
    fireEvent.click(within(korrin).getByRole('button', { name: 'Урон' }));
    expect(store.getState().events.at(-1)).toMatchObject({ type: 'DAMAGE_APPLIED', payload: { targetId: 'korrin', amount: 4 } });
  });

  it('режим игроков исключает редактирование хитов и секретные вкладки из всех карточек', () => {
    setup();
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });
    fireEvent.click(info());
    expect(within(spread()).queryByRole('spinbutton', { name: 'Сколько хитов' })).toBeNull();
    expect(within(spread()).queryByRole('tab', { name: 'DM' })).toBeNull();
    expect(within(spread()).queryByRole('button', { name: 'Урон' })).toBeNull();
  });
  it.each([6, 8])('%i участников: не более шести раскрытых, остальные доступны без записи навигации', count => {
    const { store } = setup(count);
    const before = store.getState().events;
    fireEvent.click(info());
    expect(within(spread()).getAllByRole('article', { name: /^Карта персонажа:/ })).toHaveLength(6);
    const bo = within(spread()).getByRole('article', { name: 'Карта персонажа: Bo Tambernack' });
    fireEvent.change(within(bo).getByRole('spinbutton', { name: 'Сколько хитов' }), { target: { value: '11' } });
    if (count === 8) {
      fireEvent.click(screen.getByRole('button', { name: 'Следующая страница участников' }));
      expect(within(spread()).getAllByRole('article', { name: /^Карта персонажа:/ })).toHaveLength(2);
      expect(within(spread()).getByRole('article', { name: 'Карта персонажа: Участник 8' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Предыдущая страница участников' }));
      expect(within(spread()).getByRole('article', { name: 'Карта персонажа: Bo Tambernack' })).toBe(bo);
      expect(within(bo).getByRole('spinbutton', { name: 'Сколько хитов' })).toHaveValue(11);
    }
    expect(store.getState().events).toBe(before);
  });

  it('выбывшие персонажи уходят из линии, пустая последняя страница исчезает; undo возвращает карточку', () => {
    const { store } = setup(8);
    fireEvent.click(info());
    fireEvent.click(screen.getByRole('button', { name: 'Следующая страница участников' }));
    act(() => { store.getState().remove('party-7'); store.getState().remove('party-8'); });
    expect(screen.queryByRole('button', { name: 'Следующая страница участников' })).toBeNull();
    expect(within(spread()).getByRole('article', { name: 'Карта персонажа: Bo Tambernack' })).toBeVisible();
    expect(within(spread()).getAllByRole('article', { name: /^Карта персонажа:/ })).toHaveLength(6);
    act(() => { store.getState().undo(); });
    expect(within(spread()).getByRole('article', { name: 'Карта персонажа: Bo Tambernack' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Следующая страница участников' }));
    expect(within(spread()).getByRole('article', { name: 'Карта персонажа: Участник 8' })).toBeVisible();
  });

  it('E7: предмет открывается из карточки партии, возврат сохраняет вкладку и черновик', async () => {
    const { store } = setup(); const before = store.getState().events;
    fireEvent.click(screen.getByRole('button', { name: 'Bo Tambernack' }));
    const bo = within(spread()).getByRole('article', { name: 'Карта персонажа: Bo Tambernack' });
    fireEvent.change(within(bo).getByRole('spinbutton', { name: 'Сколько хитов' }), { target: { value: '5' } });
    fireEvent.click(within(bo).getByRole('tab', { name: /Снаряжение/ }));
    fireEvent.click(within(bo).getByRole('button', { name: 'Открыть предмет: Longbow' }));
    const item = await screen.findByRole('region', { name: 'Longbow' });
    expect(item).toHaveTextContent('Цена');
    expect(item).toHaveTextContent('Вес');
    expect(document.querySelector('.desk-view-surface')).not.toHaveAttribute('inert');
    expect(screen.queryByRole('region', { name: 'Карточки партии' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Bo Tambernack' }));
    expect(within(bo).getByRole('tab', { name: /Снаряжение/ })).toHaveAttribute('aria-selected', 'true');
    expect(within(bo).getByRole('spinbutton', { name: 'Сколько хитов' })).toHaveValue(5);
    expect(store.getState().events).toBe(before);
  });

});
