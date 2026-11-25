import { COINS } from '../rules/srd/coins';
import { ITEMS } from '../rules/srd/equipment';
import type { GoodsId } from '../engine/state';

export interface SrdBaseItemPrice {
  cost: string;
  copper: number;
  citation: string;
}

export interface MarketItemQuote extends SrdBaseItemPrice {
  locationId: string;
  locationName: string;
  goods: GoodsId;
  index: number;
  qty: number;
  priceCopper: number;
}

/** Only equipment categories with a direct SRD market category are quoted. */
export function marketGoodsOf(itemId: string): GoodsId | undefined {
  const kind = ITEMS[itemId]?.kind;
  if (kind === 'weapon') return 'weapons';
  if (kind === 'armor' || kind === 'shield') return 'armor';
  if (kind === 'pack' || kind === 'tool' || kind === 'focus' || kind === 'gear') return 'gear';
  return undefined;
}

/** Current settlement index × SRD table cost. The total is rounded to the nearest copper piece. */
export function marketItemQuoteOf(input: {
  itemId: string; qty: number; locationId: string; locationName: string;
  goods: GoodsId; index: number;
}): MarketItemQuote | undefined {
  const base = srdBaseItemPriceOf(input.itemId);
  if (!base || marketGoodsOf(input.itemId) !== input.goods || !Number.isSafeInteger(input.qty) || input.qty <= 0 || !Number.isFinite(input.index) || input.index < 0) return undefined;
  const priceCopper = Math.round(base.copper * input.qty * input.index / 100);
  if (!Number.isSafeInteger(priceCopper) || priceCopper <= 0) return undefined;
  return { ...base, locationId: input.locationId, locationName: input.locationName, goods: input.goods, index: input.index, qty: input.qty, priceCopper };
}

/** Published SRD 5.1 equipment-table cost in copper pieces; no settlement or market modifier is applied. */
export function srdBaseItemPriceOf(itemId: string): SrdBaseItemPrice | undefined {
  const item = ITEMS[itemId];
  const match = item?.cost?.match(/^(\d+)\s+(cp|sp|ep|gp|pp)$/i);
  if (!item || !match) return undefined;
  const amount = Number(match[1]);
  const coin = COINS.find(entry => entry.code === match[2].toLowerCase());
  if (!coin || !Number.isSafeInteger(amount)) return undefined;
  return {
    cost: item.cost!,
    copper: amount * coin.copperValue,
    citation: `SRD 5.1 · Equipment · ${item.name}`,
  };
}
