import { describe, expect, it } from 'vitest';
import { prestigeCheck, prestigeFromLevel } from './prestige';

describe('A5E Prestige', () => {
  it('increases at the published play-tier boundaries', () => {
    expect([1, 4, 5, 10, 11, 16, 17, 20].map(prestigeFromLevel)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(() => prestigeFromLevel(0)).toThrow(RangeError);
    expect(() => prestigeFromLevel(21)).toThrow(RangeError);
  });

  it('uses the region-tier DC and disadvantage outside the character\'s Prestige area', () => {
    expect(prestigeCheck(2, 2, false)).toEqual({ rating: 2, dc: 16, mode: 'normal' });
    expect(prestigeCheck(2, 2, true)).toEqual({ rating: 2, dc: 16, mode: 'disadvantage' });
    expect(prestigeCheck(7, 2, false)).toEqual({ rating: 7, dc: 16, mode: 'normal' });
    expect(prestigeCheck(4, 4, false, true)).toEqual({ rating: 4, dc: 24, mode: 'normal' });
    expect(() => prestigeCheck(-1, 2, false)).toThrow(RangeError);
    expect(() => prestigeCheck(1.5, 2, false)).toThrow(RangeError);
  });
});
