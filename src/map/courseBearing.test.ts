import { describe, expect, it } from 'vitest';
import { courseBearing } from './courseBearing';

describe('courseBearing', () => {
  it.each([
    { from: { x: 0, y: 0 }, to: { x: 0, y: -10 }, degrees: 0, direction: 'север' },
    { from: { x: 0, y: 0 }, to: { x: 10, y: -10 }, degrees: 45, direction: 'северо-восток' },
    { from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, degrees: 90, direction: 'восток' },
    { from: { x: 0, y: 0 }, to: { x: 0, y: 10 }, degrees: 180, direction: 'юг' },
    { from: { x: 0, y: 0 }, to: { x: -10, y: 0 }, degrees: 270, direction: 'запад' },
    { from: { x: 0, y: 0 }, to: { x: -10, y: -10 }, degrees: 315, direction: 'северо-запад' },
  ])('$direction is $degrees°', ({ from, to, degrees, direction }) => {
    expect(courseBearing(from, to)).toEqual({ degrees, direction });
  });

  it('returns no bearing for a zero-length target', () => {
    expect(courseBearing({ x: 4, y: 8 }, { x: 4, y: 8 })).toBeNull();
  });
});
