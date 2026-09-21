// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { TEMPO_SECONDS } from '../engine/events';
import { SECONDS_PER_DAY } from '../engine/state';
import { DAYS_PER_YEAR, FESTIVALS, MONTHS, formatHarptos, harptos, nextFestival, secOf } from './calendar';
import { SEED_SEC } from './seed';

const day = (n: number) => n * SECONDS_PER_DAY;

describe('календарь Харптоса (заготовка шага 8)', () => {
  it('эпоха: sec 0 — 1 Hammer 1492 DR 00:00; 12 месяцев, 5 праздников, 365 дней — как TEMPO_SECONDS.year', () => {
    expect(harptos(0)).toEqual({ year: 1492, month: 'Hammer', festival: null, day: 1, hour: 0, minute: 0 });
    expect(MONTHS).toHaveLength(12);
    expect(FESTIVALS).toHaveLength(5);
    expect(DAYS_PER_YEAR).toBe(365);
    expect(TEMPO_SECONDS.year).toBe(day(DAYS_PER_YEAR));
  });

  it('праздники стоят между своими месяцами: 30 Hammer → Midwinter → 1 Alturiak, и так пять раз', () => {
    expect(harptos(day(29)).day).toBe(30);
    expect(harptos(day(30))).toMatchObject({ month: null, festival: 'Midwinter', day: 1 });
    expect(harptos(day(31))).toMatchObject({ month: 'Alturiak', day: 1 });
    expect(harptos(day(121))).toMatchObject({ festival: 'Greengrass' });
    expect(harptos(day(212))).toMatchObject({ festival: 'Midsummer' });
    expect(harptos(day(273))).toMatchObject({ festival: 'Highharvestide' });
    expect(harptos(day(334))).toMatchObject({ festival: 'Feast of the Moon' });
    expect(harptos(day(364))).toMatchObject({ month: 'Nightal', day: 30 });
    expect(harptos(day(365))).toMatchObject({ year: 1493, month: 'Hammer', day: 1 });
    expect(harptos(-1)).toMatchObject({ year: 1491, month: 'Nightal', day: 30, hour: 23, minute: 59 });
  });

  it('secOf обратна harptos на каждом дне года и бракует то, чего в календаре нет', () => {
    for (let d = 0; d < DAYS_PER_YEAR; d++) {
      const sec = day(d) + 13 * 3600 + 7 * 60;
      const h = harptos(sec);
      const back = h.festival ? secOf({ year: h.year, festival: h.festival, hour: h.hour, minute: h.minute }) : secOf({ year: h.year, month: h.month!, day: h.day, hour: h.hour, minute: h.minute });
      expect(back).toBe(sec);
    }
    expect(secOf({ year: 1493, month: 'Hammer', day: 1 })).toBe(day(365));
    expect(() => secOf({ year: 1492, month: 'Hammer', day: 31 })).toThrow(/вне месяца/);
    expect(() => secOf({ year: 1492, month: 'Hammer', day: 1, hour: 24 })).toThrow(/вне суток/);
  });

  it('формат — как в книгах: «15 Mirtul 1492 DR, 08:00», праздник без числа', () => {
    expect(formatHarptos(secOf({ year: 1492, month: 'Mirtul', day: 15, hour: 8 }))).toBe('15 Mirtul 1492 DR, 08:00');
    expect(formatHarptos(secOf({ year: 1492, festival: 'Greengrass', hour: 6, minute: 5 }))).toBe('Greengrass 1492 DR, 06:05');
    expect(formatHarptos(0)).toBe('1 Hammer 1492 DR, 00:00');
  });

  it('сид стоит ровно на 15 Mirtul 1492 DR, утро', () => {
    expect(harptos(SEED_SEC)).toEqual({ year: 1492, month: 'Mirtul', festival: null, day: 15, hour: 8, minute: 0 });
    expect(formatHarptos(SEED_SEC)).toBe('15 Mirtul 1492 DR, 08:00');
    // Утро — до полудня; весна — Mirtul стоит между Greengrass и Midsummer.
    expect(harptos(SEED_SEC).hour).toBeLessThan(12);
    expect(MONTHS.indexOf('Mirtul')).toBeGreaterThan(MONTHS.indexOf('Tarsakh'));
  });
});

describe('nextFestival', () => {
  it('15 Mirtul 1492 → Midsummer (16 дней Mirtul + 30 Kythorn + 30 Flamerule = 76); в сам праздник — сегодня; после Feast of the Moon — Midwinter следующего года (28 дней Nightal + 30 Hammer + сам день)', () => {
    const mirtul15 = secOf({ year: 1492, month: 'Mirtul', day: 15, hour: 8 });
    const midsummer = secOf({ year: 1492, festival: 'Midsummer' });
    expect(nextFestival(mirtul15)).toEqual({ festival: 'Midsummer', sec: midsummer, days: 76 });
    expect(nextFestival(midsummer + 3600)).toEqual({ festival: 'Midsummer', sec: midsummer, days: 0 });
    const afterFeast = secOf({ year: 1492, month: 'Nightal', day: 2 });
    expect(nextFestival(afterFeast)).toMatchObject({ festival: 'Midwinter', days: 59 });
    expect(nextFestival(afterFeast).sec).toBe(secOf({ year: 1493, festival: 'Midwinter' }));
  });
});
