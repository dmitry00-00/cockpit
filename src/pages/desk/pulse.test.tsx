// «Пульс мира» (F5, Q8): W открывает вид мастера — календарь, граф фракций, боги партии, индексы цен, веса встреч;
// ждущее — рядом бирюзой, принятие делает его нынешним; у игроков вида нет; событий вид не пишет.
import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { cardOf, mount } from './testkit';

const pulse = () => screen.getByRole('region', { name: 'Пульс мира' });
const openPulse = () => fireEvent.keyDown(window, { key: 'w', code: 'KeyW' });

describe('пульс мира (Q8)', () => {
  it('W — вид мастера: календарь трёх десятидневок, граф фракций, боги партии, цены и встречи с ждущим рядом; узел открывает фракцию; сам вид событий не пишет — одно событие здесь от принятия', () => {
    const { store } = mount();
    const before = store.getState().events.length;
    openPulse();
    const view = pulse();
    const calendar = within(view).getByRole('region', { name: 'Календарь' });
    expect(within(calendar).getByRole('group', { name: '15 Mirtul — 24 Mirtul' })).toHaveTextContent('Полнолуние Selûne18 Mirtul · через 3 дня');
    expect(calendar).toHaveTextContent('Old Owl Well: след остынет');

    const graph = within(view).getByRole('img', { name: /^Отношения фракций/ });
    expect(graph.querySelector('[data-edge="fac-harpers|fac-zhentarim"]')).toHaveAttribute('data-value', '-2');
    expect(graph.querySelector('[data-edge="fac-harpers|fac-lords-alliance"]')).toHaveAttribute('data-value', '2');
    expect(within(view).getByRole('region', { name: 'Боги партии' })).toHaveTextContent('молятся: Brother Aldric');

    // Neverwinter: индекс 110 (надбавка места), оружие ждёт +10 — «→ 120» рядом.
    const prices = within(view).getByRole('region', { name: 'Цены' });
    const weapons = prices.querySelector('[data-place="loc-neverwinter"] [data-goods="weapons"]')!;
    expect(weapons).toHaveTextContent('110 ▲ → 120');
    expect(within(view).getByRole('group', { name: 'Встречи: Neverwinter Wood' })).toHaveTextContent('Werewolf×1 → ×2');

    act(() => { store.getState().accept('d-iron-prices'); });
    expect(prices.querySelector('[data-place="loc-neverwinter"] [data-goods="weapons"]')).toHaveTextContent(/^120 ▲$/);

    fireEvent.click(within(graph).getByRole('button', { name: 'Открыть: Harpers' }));
    expect(cardOf('Harpers')).toBeInTheDocument();
    expect(store.getState().events.length).toBe(before + 1);
  });

  it('у игроков вида нет: кнопки «Пульс» нет, W ничего не открывает', () => {
    mount();
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP' });
    expect(screen.queryByRole('button', { name: /Пульс/ })).toBeNull();
    openPulse();
    expect(screen.queryByRole('region', { name: 'Пульс мира' })).toBeNull();
  });
});
