// Темп похода 5e SRD 5.1, таблица Travel Pace (CC-BY-4.0, см. LICENSE.md). Только данные: сколько дней
// займёт путь по карте — в src/map/, по милям из паспорта карты.

export type TravelPaceId = 'fast' | 'normal' | 'slow';

export interface TravelPace {
  id: TravelPaceId;
  /** Подпись за столом. */
  label: string;
  feetPerMinute: number;
  milesPerHour: number;
  milesPerDay: number;
  /** Колонка Effect, дословно; у обычного темпа её нет. */
  effect: string | null;
}

export const TRAVEL_PACE_IDS: readonly TravelPaceId[] = ['fast', 'normal', 'slow'];

export const TRAVEL_PACES: Readonly<Record<TravelPaceId, TravelPace>> = {
  fast: { id: 'fast', label: 'быстрый', feetPerMinute: 400, milesPerHour: 4, milesPerDay: 30, effect: '−5 penalty to passive Wisdom (Perception) scores' },
  normal: { id: 'normal', label: 'обычный', feetPerMinute: 300, milesPerHour: 3, milesPerDay: 24, effect: null },
  slow: { id: 'slow', label: 'медленный', feetPerMinute: 200, milesPerHour: 2, milesPerDay: 18, effect: 'Able to use stealth' },
};

/**
 * SRD, Difficult Terrain: «The travel speeds given in the Travel Pace table assume relatively simple terrain…
 * dense forests, deep swamps, rubble-filled ruins, steep mountains, and ice-covered ground — all considered
 * difficult terrain. You move at half speed in difficult terrain».
 */
export const DIFFICULT_TERRAIN_FACTOR = 2;

/** Дни пути с округлением до десятых: 72 мили обычным темпом — 3 дня; по трудной местности — вдвое дольше. */
export function travelDays(miles: number, pace: TravelPaceId, difficult = false): number {
  return Math.round(((miles * (difficult ? DIFFICULT_TERRAIN_FACTOR : 1)) / TRAVEL_PACES[pace].milesPerDay) * 10) / 10;
}

/**
 * Дни пути, когда трудная только часть: SRD Difficult Terrain — вдвое медленнее, то есть каждая трудная миля идёт
 * за две. 72 мили, из них 12 по лесу, обычным темпом — (72 + 12) / 24 = 3,5 дня. До десятых, как travelDays.
 */
export function travelDaysOver(miles: number, difficultMiles: number, pace: TravelPaceId): number {
  const rough = Math.min(Math.max(difficultMiles, 0), miles);
  return Math.round(((miles + rough * (DIFFICULT_TERRAIN_FACTOR - 1)) / TRAVEL_PACES[pace].milesPerDay) * 10) / 10;
}
