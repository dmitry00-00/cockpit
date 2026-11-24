/** Currency data from SRD 5.1 Standard Exchange Rates (CC-BY-4.0). One pound per 50 standard coins. */
export const COINS = [
  { id: 'coin:cp', code: 'cp', name: 'Медная', short: 'мм', copperValue: 1 },
  { id: 'coin:sp', code: 'sp', name: 'Серебряная', short: 'см', copperValue: 10 },
  { id: 'coin:ep', code: 'ep', name: 'Электрумовая', short: 'эм', copperValue: 50 },
  { id: 'coin:gp', code: 'gp', name: 'Золотая', short: 'зм', copperValue: 100 },
  { id: 'coin:pp', code: 'pp', name: 'Платиновая', short: 'пм', copperValue: 1_000 },
] as const;

export type CoinId = (typeof COINS)[number]['id'];
export const COIN_BY_ID = Object.fromEntries(COINS.map(coin => [coin.id, coin])) as Readonly<Record<CoinId, (typeof COINS)[number]>>;
export const isCoinId = (id: string): id is CoinId => Object.hasOwn(COIN_BY_ID, id);
export const COIN_WEIGHT_PER_POUND = 50;
