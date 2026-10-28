// Темп похода SRD 5.1: таблица Travel Pace и дни пути по милям.
import { describe, expect, it } from 'vitest';
import { TRAVEL_PACES, TRAVEL_PACE_IDS, travelDays } from './travel';

describe('Travel Pace', () => {
  it('быстрый 30, обычный 24, медленный 18 миль в день — и футы в минуту по таблице', () => {
    expect(TRAVEL_PACE_IDS.map(id => TRAVEL_PACES[id].milesPerDay)).toEqual([30, 24, 18]);
    expect(TRAVEL_PACE_IDS.map(id => TRAVEL_PACES[id].feetPerMinute)).toEqual([400, 300, 200]);
    expect(TRAVEL_PACES.fast.effect).toBe('−5 penalty to passive Wisdom (Perception) scores');
    expect(TRAVEL_PACES.slow.effect).toBe('Able to use stealth');
    expect(TRAVEL_PACES.normal.effect).toBeNull();
  });

  it('72 мили — три дня обычным темпом, 2,4 быстрым, 4 медленным', () => {
    expect(travelDays(72, 'normal')).toBe(3);
    expect(travelDays(72, 'fast')).toBe(2.4);
    expect(travelDays(72, 'slow')).toBe(4);
  });

  it('трудная местность — вдвое медленнее: 72 мили обычным темпом — 6 дней', () => {
    expect(travelDays(72, 'normal', true)).toBe(6);
    expect(travelDays(72, 'fast', true)).toBe(4.8);
  });
});
