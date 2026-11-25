// Карта персонажа на столе (Д9): персонаж с листом открывается картой; хиты с боковой кромки — тот же попап,
// бросок навыка — в журнал; «Лист» — модальное окно с возвратом к карте; монстр — карточкой, как был.
import { fireEvent, screen, within, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { seedEngine } from '../../campaign';
import { memoryStore } from '../../engine';
import { fixed, hpOf, lastEvent, mount } from './testkit';

const cardMount = () => {
  const result = mount(seedEngine({ persist: memoryStore(), ...fixed() }), undefined, 'card');
  fireEvent.click(screen.getByRole('button', { name: 'Bo Tambernack' }));
  return result;
};

describe('карта персонажа на столе', () => {
  it('карта и партия взаимоисключаются; корешок открывает всю партию, смена участника сохраняет черновик', () => {
    mount(seedEngine({ persist: memoryStore(), ...fixed() }), undefined, 'card');
    expect(screen.queryByRole('article', { name: /^Карта персонажа:/ })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Карточки партии' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Bo Tambernack' }));
    const spread = screen.getByRole('region', { name: 'Карточки партии' });
    expect(within(spread).getAllByRole('article', { name: /^Карта персонажа:/ })).toHaveLength(4);
    const bo = within(spread).getByRole('article', { name: 'Карта персонажа: Bo Tambernack' });
    const draft = within(bo).getByRole('spinbutton', { name: 'Сколько хитов' });
    fireEvent.change(draft, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Карта мира' }));
    expect(screen.queryByRole('article', { name: /^Карта персонажа:/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Korrin Battlehammer' }));
    expect(screen.getByRole('region', { name: 'Карточки партии' })).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Карта персонажа: Bo Tambernack' })).getByRole('spinbutton', { name: 'Сколько хитов' })).toBe(draft);
    expect(draft).toHaveValue(12);
  });

  it('Bo раскрывается из корешка картой; урон с боковой кромки через попап; бросок навыка — событие', () => {
    const { store } = cardMount();
    const card = screen.getByRole('article', { name: 'Карта персонажа: Bo Tambernack' });
    fireEvent.click(within(card).getByRole('button', { name: /^Хиты 41 из 49$/ }));
    const dialog = screen.getByRole('dialog', { name: 'Хиты: Bo Tambernack' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Величина' }), { target: { value: '8' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Урон' }));
    expect(hpOf(store, 'bo').current).toBe(33);
    expect(within(screen.getByRole('article', { name: 'Карта персонажа: Bo Tambernack' })).getByRole('button', { name: /^Хиты 33 из 49$/ })).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: /Все навыки · 18 Показать/ }));
    fireEvent.click(within(card).getByRole('button', { name: /^Скрытность / }));
    expect(lastEvent(store)).toMatchObject({ type: 'DICE_ROLLED', payload: { label: 'Скрытность · Bo Tambernack' } });
  });

  it('«Лист» открывается модально; закрытие возвращает карточку и фокус без событий', async () => {
    const { store } = cardMount();
    const card = screen.getByRole('article', { name: 'Карта персонажа: Bo Tambernack' });
    const before = store.getState().events;
    const trigger = within(card).getByRole('button', { name: 'Лист' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Полный лист · Bo Tambernack' });
    expect(within(dialog).getByRole('tab', { name: 'Обзор' })).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: 'Путь' })).toBeInTheDocument();
    const profileTab = within(dialog).getByRole('tab', { name: /Профиль/ });
    fireEvent.click(profileTab);
    const profile = dialog.querySelector('[data-subject-profile="character"]');
    expect(profile).toBeInTheDocument();
    expect(profile).toHaveTextContent('Bo Tambernack');
    expect(store.getState().events).toBe(before);
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Обзор' }));
    // Background card stays mounted rather than being replaced by the full sheet.
    expect(document.querySelector('[aria-label="Карта персонажа: Bo Tambernack"]')).not.toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Закрыть' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Полный лист/ })).toBeNull());
    expect(screen.getByRole('article', { name: 'Карта персонажа: Bo Tambernack' })).toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(store.getState().events).toBe(before);
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('dialog', { name: /Полный лист/ }), {key:'Escape',code:'Escape'});
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Полный лист/ })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Карта мира' }));
    expect(screen.queryByRole('region', { name: 'Карточки партии' })).toBeNull();
    expect(screen.queryByRole('article', { name: /^Карта персонажа:/ })).toBeNull();
    expect(screen.queryByRole('article', { name: /^Карта персонажа/ })).toBeNull();
  });
  it('модальный лист сохраняет управление хитами и не показывает секретные вкладки игрокам', async () => {
    const { store } = cardMount();
    fireEvent.click(within(screen.getByRole('article', { name: 'Карта персонажа: Bo Tambernack' })).getByRole('button', { name: 'Лист' }));
    const sheet = screen.getByRole('dialog', { name: 'Полный лист · Bo Tambernack' });
    fireEvent.click(within(sheet).getByTitle('Хиты'));
    const hp = screen.getByRole('dialog', { name: 'Хиты: Bo Tambernack' });
    fireEvent.change(within(hp).getByRole('textbox', { name: 'Величина' }), {target:{value:'3'}});
    fireEvent.click(within(hp).getByRole('button', {name:'Урон'}));
    expect(hpOf(store,'bo').current).toBe(38);
    fireEvent.keyDown(hp,{key:'Escape',code:'Escape'});
    await waitFor(() => expect(screen.queryByRole('dialog', {name:'Хиты: Bo Tambernack'})).toBeNull());
    expect(screen.getByRole('dialog', {name:'Полный лист · Bo Tambernack'})).toHaveTextContent('38/49');
    fireEvent.click(within(sheet).getByRole('button', {name:'Закрыть'}));
    await waitFor(() => expect(screen.queryByRole('dialog',{name:/Полный лист/})).toBeNull());
    fireEvent.keyDown(window,{key:'p',code:'KeyP'});
    fireEvent.click(within(screen.getByRole('article', { name: 'Карта персонажа: Bo Tambernack' })).getByRole('button',{name:'Лист'}));
    const playerSheet = screen.getByRole('dialog',{name:/Полный лист/});
    expect(within(playerSheet).queryByRole('tab',{name:'Состояния'})).toBeNull();
    expect(within(playerSheet).queryByRole('tab',{name:'DM'})).toBeNull();
    expect(within(playerSheet).queryByRole('button',{name:/^HP /})).toBeNull();
  });

});
