import type { RegionTier } from './journey';

const PRESTIGE_AREAS = [
  'неизвестен', 'местность', 'деревня', 'городок', 'город', 'регион', 'страна',
  'континент', 'мир', 'план', 'мультивселенная', 'мультивселенная', 'мультивселенная', 'мультивселенная',
] as const;

/** Область известности из A5E SRD §8, таблица Prestige Rating. */
export function prestigeAreaLabel(rating: number): string {
  if (!Number.isSafeInteger(rating) || rating < 0) throw new RangeError('A5E Prestige rating must be a non-negative integer');
  return rating >= 14 ? 'божественный масштаб' : PRESTIGE_AREAS[rating] ?? 'мультивселенная';
}

/** A5E SRD §8: PCs start at Prestige 1 and gain +1 at levels 5, 11, and 17. */
export function prestigeFromLevel(level: number): number {
  if (!Number.isSafeInteger(level) || level < 1 || level > 20) throw new RangeError('A5E Prestige level must be an integer from 1 to 20');
  return 1 + Number(level >= 5) + Number(level >= 11) + Number(level >= 17);
}

/** A5E SRD §8: check an already-derived rating (level milestones plus any explicit awards). */
export function prestigeCheck(rating: number, regionTier: RegionTier, outsidePrestigeArea: boolean, extremelyFar = false): {
  rating: number;
  dc: number;
  mode: 'normal' | 'disadvantage';
} {
  if (!Number.isSafeInteger(rating) || rating < 0) throw new RangeError('A5E Prestige rating must be a non-negative integer');
  if (![0, 1, 2, 3, 4].includes(regionTier)) throw new RangeError('A5E Prestige region tier must be 0–4');
  return {
    rating,
    dc: 12 + (extremelyFar ? 3 : 2) * regionTier,
    mode: outsidePrestigeArea ? 'disadvantage' : 'normal',
  };
}
