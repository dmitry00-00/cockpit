// Карта персонажа на столе (Д9): персонаж с листом открывается картой; хиты с боковой кромки — тот же попап,
// бросок навыка — в журнал; «Лист» — полная карточка, «Карта» — обратно; монстр — карточкой, как был.
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { seedEngine } from '../../campaign';
import { memoryStore } from '../../engine';
import { fixed, hpOf, lastEvent, mount } from './testkit';

const cardMount = () => mount(seedEngine({ persist: memoryStore(), ...fixed() }), undefined, 'card');

describe('карта персонажа на столе', () => {
  it('Bo по умолчанию — картой; урон с боковой кромки через попап; бросок навыка — событие', () => {
    const { store } = cardMount();
    const card = screen.getByRole('article', { name: 'Карта персонажа: Bo Tambernack' });
    fireEvent.click(within(card).getByRole('button', { name: /^Хиты 41 из 49$/ }));
    const dialog = screen.getByRole('dialog', { name: 'Хиты: Bo Tambernack' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Величина' }), { target: { value: '8' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Урон' }));
    expect(hpOf(store, 'bo').current).toBe(33);
    expect(within(screen.getByRole('article', { name: 'Карта персонажа: Bo Tambernack' })).getByRole('button', { name: /^Хиты 33 из 49$/ })).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: /^Скрытность / }));
    expect(lastEvent(store)).toMatchObject({ type: 'DICE_ROLLED', payload: { label: 'Скрытность · Bo Tambernack' } });
  });

  it('«Лист» — карточка с вкладками, «Карта» — обратно; монстр — карточкой', () => {
    cardMount();
    fireEvent.click(screen.getByRole('button', { name: 'Лист' }));
    expect(screen.queryByRole('article', { name: /^Карта персонажа/ })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Обзор' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Карта' }));
    expect(screen.getByRole('article', { name: 'Карта персонажа: Bo Tambernack' })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('group', { name: 'Противники' })).getAllByRole('button')[0]);
    expect(screen.queryByRole('article', { name: /^Карта персонажа/ })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Обзор' })).toBeInTheDocument();
  });
});
