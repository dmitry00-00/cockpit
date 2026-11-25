// @vitest-environment node
// Погода — проекция календаря: 15 Mirtul 1492 даёт погоду §13, тот же день — та же погода, соседние дни разные,
// зимой мороз, летом жара, за год встречаются все четыре неба; направление ветра детерминировано отдельно.
import { describe, expect, it } from 'vitest';
import { secOf } from './calendar';
import { SEED_SEC } from './seed';
import { weatherLabel, weatherOf, type Sky } from './weather';

describe('погода', () => {
  it('15 Mirtul 1492 DR — «Облачно, +14 °C, лёгкий ветер» (§13); в другой час дня погода та же', () => {
    expect(weatherOf(SEED_SEC)).toMatchObject({ sky: 'cloudy', tempC: 14, wind: 'light' });
    expect(weatherLabel(weatherOf(SEED_SEC))).toBe('Облачно, +14 °C, лёгкий ветер');
    expect(weatherOf(SEED_SEC + 10 * 3600)).toEqual(weatherOf(SEED_SEC));
  });

  it('детерминирована, по сезону: Hammer холоднее Flamerule; за год — все состояния неба и ветра; гроза всегда с сильным ветром', () => {
    const skies = new Set<Sky>();
    const winds = new Set<string>();
    const directions = new Set<string>();
    let hammer = 0, flamerule = 0;
    for (let d = 1; d <= 30; d++) {
      hammer += weatherOf(secOf({ year: 1492, month: 'Hammer', day: d })).tempC;
      flamerule += weatherOf(secOf({ year: 1492, month: 'Flamerule', day: d })).tempC;
    }
    expect(hammer / 30).toBeLessThan(0);
    expect(flamerule / 30).toBeGreaterThan(18);
    for (let day = 0; day < 365; day++) {
      const w = weatherOf(day * 86_400);
      skies.add(w.sky);
      winds.add(w.wind);
      directions.add(w.windFrom);
      if (w.sky === 'storm') expect(w.wind).toBe('strong');
      expect(weatherOf(day * 86_400)).toEqual(w);
    }
    expect([...skies].sort()).toEqual(['clear', 'cloudy', 'rain', 'storm']);
    expect(winds.size).toBe(3);
    expect(directions.size).toBe(8);
    expect(weatherLabel({ sky: 'storm', tempC: -7, wind: 'strong', windFrom: 'n' })).toBe('Гроза, −7 °C, сильный ветер');
    expect(weatherOf(secOf({ year: 1492, festival: 'Midwinter' })).tempC).toBeLessThan(5);
  });
});
