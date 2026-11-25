import { describe, expect, it } from 'vitest';
import { marketGoodsOf, marketItemQuoteOf, srdBaseItemPriceOf } from './tradeQuote';

describe('SRD base item prices for trade context', () => {
  it('converts the published equipment cost using SRD coin exchange rates without applying a market modifier', () => {
    expect(srdBaseItemPriceOf('longsword')).toEqual({
      cost: '15 gp',
      copper: 1500,
      citation: 'SRD 5.1 · Equipment · Longsword',
    });
  });

  it('does not invent prices for items without an equipment-table cost', () => {
    expect(srdBaseItemPriceOf('potion-of-healing')).toBeUndefined();
    expect(srdBaseItemPriceOf('not-a-canonical-item')).toBeUndefined();
  });

  it('applies only the matching settlement goods index and rounds the total to copper', () => {
    expect(marketGoodsOf('longsword')).toBe('weapons');
    expect(marketItemQuoteOf({ itemId: 'longsword', qty: 2, locationId: 'town', locationName: 'Neverwinter', goods: 'weapons', index: 115 })).toMatchObject({
      copper: 1500, qty: 2, index: 115, priceCopper: 3450,
    });
    expect(marketItemQuoteOf({ itemId: 'longsword', qty: 2, locationId: 'town', locationName: 'Neverwinter', goods: 'gear', index: 115 })).toBeUndefined();
    expect(marketItemQuoteOf({ itemId: 'potion-of-healing', qty: 1, locationId: 'town', locationName: 'Neverwinter', goods: 'potions', index: 115 })).toBeUndefined();
  });
});
