import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EventLog } from '../../engine/log';
import { emptyState } from '../../engine/state';
import type { TradeCompleted, TradeOffer } from '../../engine/events';
import type { InventoryStack } from '../../engine/state';
import { TradePanel } from './TradePanel';

const inventory: InventoryStack[] = [
  { id: 'merchant-swords', itemId: 'longsword', qty: 2, owner: { kind: 'actor', id: 'merchant' }, storage: { kind: 'actor', id: 'merchant' } },
  { id: 'buyer-gold', itemId: 'coin:gp', qty: 3, owner: { kind: 'actor', id: 'bo' }, storage: { kind: 'actor', id: 'bo' } },
  { id: 'buyer-silver', itemId: 'coin:sp', qty: 2, owner: { kind: 'actor', id: 'bo' }, storage: { kind: 'actor', id: 'bo' } },
];

describe('party trade composer', () => {
  it('confirms a sourced partial purchase with mixed coin stacks as one atomic trade', () => {
    const onComplete = vi.fn();
    render(<TradePanel inventory={inventory} actors={[{ id: 'merchant', name: 'Торговец' }, { id: 'bo', name: 'Bo' }]} onComplete={onComplete} />);

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Количество предмета' }), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Оплатить: Золотая' }), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Оплатить: Серебряная' }), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Основание цены' }), { target: { value: 'rule' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Редакция правила' }), { target: { value: 'SRD 5.1' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Источник цены' }), { target: { value: 'Оружие, таблица цен' } });

    expect(screen.getByText('Итого: 110 мм')).toBeInTheDocument();
    const review = screen.getByRole('button', { name: 'Проверить условия' });
    expect(review).toBeEnabled();
    fireEvent.click(review);
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Проверка условий сделки' })).toHaveTextContent('Торговец');
    expect(screen.getByRole('region', { name: 'Проверка условий сделки' })).toHaveTextContent('Оружие, таблица цен');
    fireEvent.click(screen.getByRole('button', { name: 'Провести сделку' }));

    expect(onComplete).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      seller: { kind: 'actor', id: 'merchant' },
      buyer: { kind: 'actor', id: 'bo' },
      itemStackId: 'merchant-swords',
      itemQty: 1,
      itemSplitStackId: expect.stringMatching(/^item:bo:/),
      payments: [
        { stackId: 'buyer-gold', qty: 1, splitStackId: expect.stringMatching(/^item:merchant:/) },
        { stackId: 'buyer-silver', qty: 1, splitStackId: expect.stringMatching(/^item:merchant:/) },
      ],
      priceCopper: 110,
      priceSource: { kind: 'rule', edition: 'SRD 5.1', citation: 'Оружие, таблица цен' },
    }), expect.stringMatching(/^trade:/));
  });

  it('saves reviewed terms and later requires a second confirmation to accept the saved offer', () => {
    const onCreateOffer = vi.fn();
    const onComplete = vi.fn();
    const props = { inventory, actors: [{ id: 'merchant', name: 'Торговец' }, { id: 'bo', name: 'Bo' }], onCreateOffer, onComplete };
    const view = render(<TradePanel {...props} />);
    fireEvent.click(screen.getByText('Покупка и продажа'));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Оплатить: Золотая' }), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Источник цены' }), { target: { value: 'Согласованная цена' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить условия' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить предложение' }));
    expect(onCreateOffer).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^trade-offer:/), expect.objectContaining({
      seller: { kind: 'actor', id: 'merchant' }, buyer: { kind: 'actor', id: 'bo' }, itemStackId: 'merchant-swords',
      priceCopper: 100, priceSource: { kind: 'house-rule', citation: 'Согласованная цена' },
    }));
    expect(onComplete).not.toHaveBeenCalled();

    const [offerId, trade] = onCreateOffer.mock.calls[0] as [string, TradeCompleted];
    const offer: TradeOffer = { id: offerId, trade, status: 'open', createdSec: 0 };
    view.rerender(<TradePanel {...props} offers={[offer]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Проверить предложение' }));
    expect(screen.getByRole('region', { name: 'Проверка условий сделки' })).toHaveTextContent(offerId);
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Принять и провести' }));
    expect(onComplete).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ...trade, offerId }), expect.stringMatching(/^trade:/));
  });

  it('does not permit an unsourced trade or more than the buyer owns', () => {
    render(<TradePanel inventory={inventory} actors={[{ id: 'merchant', name: 'Торговец' }, { id: 'bo', name: 'Bo' }]} onComplete={vi.fn()} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Оплатить: Золотая' }), { target: { value: '4' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Источник цены' }), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Проверить условия' })).toBeDisabled();
  });

  it('can return from the review without completing the trade', () => {
    const onComplete = vi.fn();
    render(<TradePanel inventory={inventory} actors={[{ id: 'merchant', name: 'Торговец' }, { id: 'bo', name: 'Bo' }]} onComplete={onComplete} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Оплатить: Золотая' }), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Источник цены' }), { target: { value: 'Согласованная цена' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить условия' }));
    fireEvent.click(screen.getByRole('button', { name: 'Изменить условия' }));
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Проверить условия' })).toBeInTheDocument();
  });

  it('keeps the reviewed item and coin names stable if the inventory rerenders', () => {
    const onComplete = vi.fn();
    const props = { inventory, actors: [{ id: 'merchant', name: 'Торговец' }, { id: 'bo', name: 'Bo' }], onComplete };
    const view = render(<TradePanel {...props} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Оплатить: Золотая' }), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Источник цены' }), { target: { value: 'Согласованная цена' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить условия' }));

    view.rerender(<TradePanel {...props} inventory={inventory.filter(stack => stack.id !== 'merchant-swords')} />);

    const review = screen.getByRole('region', { name: 'Проверка условий сделки' });
    expect(review).toHaveTextContent('Longsword · 1 шт.');
    expect(review).toHaveTextContent('1 Золотая');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('rejects a reviewed trade if the seller loses the item before confirmation', () => {
    const state = emptyState();
    state.actors.merchant = { id: 'merchant', name: 'Торговец', kind: 'npc', hp: { current: 8, max: 8, temp: 0 }, ac: 10, passivePerception: 10, conditions: {} };
    state.actors.bo = { id: 'bo', name: 'Bo', kind: 'pc', hp: { current: 10, max: 10, temp: 0 }, ac: 10, passivePerception: 10, conditions: {} };
    const log = new EventLog(state);
    for (const stack of inventory) log.dispatch({ type: 'ITEM_GAINED', payload: { stack } });
    const onComplete = (trade: TradeCompleted) => log.dispatch({ type: 'TRADE_COMPLETED', payload: trade });
    const view = render(<TradePanel inventory={Object.values(log.state.inventory!)} actors={[{ id: 'merchant', name: 'Торговец' }, { id: 'bo', name: 'Bo' }]} onComplete={onComplete} />);

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Оплатить: Золотая' }), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Источник цены' }), { target: { value: 'Согласованная цена' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить условия' }));
    log.dispatch({ type: 'ITEM_LOST', payload: { stackId: 'merchant-swords', qty: 2 } });
    view.rerender(<TradePanel inventory={Object.values(log.state.inventory!)} actors={[{ id: 'merchant', name: 'Торговец' }, { id: 'bo', name: 'Bo' }]} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Провести сделку' }));

    expect(screen.getByRole('alert')).toHaveTextContent('нет стека вещи merchant-swords');
    expect(screen.getByRole('region', { name: 'Проверка условий сделки' })).toBeInTheDocument();
    expect(log.state.inventory?.['buyer-gold']).toMatchObject({ qty: 3, owner: { kind: 'actor', id: 'bo' } });
    expect(log.state.inventory?.['merchant-swords']).toBeUndefined();
    expect(log.entries.at(-1)?.type).toBe('ITEM_LOST');
  });

  it('keeps an empty trade surface collapsed until the DM opens it', () => {
    render(<TradePanel inventory={[]} actors={[]} onComplete={vi.fn()} />);
    expect(screen.getByText('Покупка и продажа')).toBeInTheDocument();
    expect(screen.getByText('Для сделки нужны предметы продавца и монеты покупателя.')).not.toBeVisible();
    fireEvent.click(screen.getByText('Покупка и продажа'));
    expect(screen.getByText('Для сделки нужны предметы продавца и монеты покупателя.')).toBeInTheDocument();
  });

  it('shows the current place market index as context and labels it as distinct from item price', () => {
    render(<TradePanel inventory={inventory} actors={[{ id: 'merchant', name: 'Торговец', kind: 'npc' }, { id: 'bo', name: 'Bo', kind: 'pc', inParty: true }]} market={{
      locationId: 'neverwinters-id', locationName: 'Neverwinter', goods: [{ id: 'weapons', index: 120, pending: 130 }],
    }} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByText('Индекс рынка · Neverwinter'));
    expect(screen.getByText('Индексы к базовому рынку; это не готовые цены отдельных предметов.')).toBeInTheDocument();
    expect(screen.getByText('оружие: 120% → 130% (ждёт решения)')).toBeInTheDocument();
  });

  it('shows the SRD base cost and applicable settlement quote for a party purchase from an NPC', () => {
    render(<TradePanel inventory={inventory} actors={[{ id: 'merchant', name: 'Торговец', kind: 'npc' }, { id: 'bo', name: 'Bo', kind: 'pc', inParty: true }]} market={{
      locationId: 'neverwinters-id', locationName: 'Neverwinter', goods: [{ id: 'weapons', index: 120 }],
    }} onComplete={vi.fn()} />);
    expect(screen.getByLabelText('Базовая цена предмета')).toHaveTextContent('SRD 5.1 · Equipment · Longsword: 15 gp (1 500 мм)');
    expect(screen.getByLabelText('Базовая цена предмета')).toHaveTextContent('Для 1 шт. в Neverwinter, индекс 120%: 1 800 мм');
  });

  it('prices from the current settlement index only when the exact SRD market payment is tendered', () => {
    const onComplete = vi.fn();
    const funded = inventory.map(stack => stack.id === 'buyer-gold' ? { ...stack, qty: 20 } : stack);
    render(<TradePanel inventory={funded} actors={[{ id: 'merchant', name: 'Торговец', kind: 'npc' }, { id: 'bo', name: 'Bo', kind: 'pc', inParty: true }]} market={{
      locationId: 'neverwinters-id', locationName: 'Neverwinter', goods: [{ id: 'weapons', index: 120 }],
    }} onComplete={onComplete} />);
    fireEvent.click(screen.getByText('Покупка и продажа'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Основание цены' }), { target: { value: 'market' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Оплатить: Золотая' }), { target: { value: '18' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить условия' }));
    expect(screen.getByRole('button', { name: 'Провести сделку' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Провести сделку' }));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      priceCopper: 1800,
      priceSource: { kind: 'market', edition: 'SRD 5.1', citation: 'Индекс 120% · Neverwinter', locationId: 'neverwinters-id', locationName: 'Neverwinter', goods: 'weapons', index: 120, baseCopper: 1500, itemQty: 1 },
    }), expect.any(String));
  });

  it('requires an explicit opt-in before a safe, already-visible NPC purchase enters the player journal', () => {
    const onComplete = vi.fn();
    const publicInventory = inventory.map(stack => stack.id === 'merchant-swords' ? { ...stack, visibility: 'players' as const } : stack);
    render(<TradePanel inventory={publicInventory} actors={[{ id: 'merchant', name: 'Секретный торговец', kind: 'npc' }, { id: 'bo', name: 'Bo', kind: 'pc', inParty: true }]} onComplete={onComplete} />);
    fireEvent.click(screen.getByText('Покупка и продажа'));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Оплатить: Золотая' }), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Источник цены' }), { target: { value: 'согласованная стоимость' } });
    const disclose = screen.getByRole('checkbox', { name: 'Показать игрокам факт покупки (без имени торговца и его остатков)' });
    expect(disclose).not.toBeChecked();
    fireEvent.click(disclose);
    fireEvent.click(screen.getByRole('button', { name: 'Проверить условия' }));
    fireEvent.click(screen.getByRole('button', { name: 'Провести сделку' }));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ playerVisible: true }), expect.any(String));
  });
});
