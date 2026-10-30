// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { TEMPO_SECONDS } from '../engine/events';
import { SECONDS_PER_DAY, emptyState } from '../engine/state';
import { createEngineStore } from '../engine/store';
import {
  DAYS_PER_YEAR, FESTIVALS, MONTHS, daysInYear, festivalAfter, formatHarptos, harptos, monthBefore, monthDays, nextFestival, sameDayIn, secOf, yearSlots, yearStartDay,
} from './calendar';
import { SEED_SEC } from './seed';
import { stepTime } from './simulation';

const day = (n: number) => n * SECONDS_PER_DAY;

describe('календарь Харптоса (заготовка шага 8)', () => {
  it('эпоха: sec 0 — 1 Hammer 1492 DR 00:00; 12 месяцев, 5 праздников, 365 дней — как TEMPO_SECONDS.year', () => {
    expect(harptos(0)).toEqual({ year: 1492, month: 'Hammer', festival: null, day: 1, hour: 0, minute: 0 });
    expect(MONTHS).toHaveLength(12);
    expect(FESTIVALS).toHaveLength(5);
    expect(DAYS_PER_YEAR).toBe(365);
    expect(TEMPO_SECONDS.year).toBe(day(DAYS_PER_YEAR));
  });

  it('праздники стоят между своими месяцами: 30 Hammer → Midwinter → 1 Alturiak, и так пять раз; 1492 — год Shieldmeet', () => {
    expect(harptos(day(29)).day).toBe(30);
    expect(harptos(day(30))).toMatchObject({ month: null, festival: 'Midwinter', day: 1 });
    expect(harptos(day(31))).toMatchObject({ month: 'Alturiak', day: 1 });
    expect(harptos(day(121))).toMatchObject({ festival: 'Greengrass' });
    expect(harptos(day(212))).toMatchObject({ festival: 'Midsummer' });
    // Shieldmeet — сразу за Midsummer; дальше всё на день позже обычного года.
    expect(harptos(day(213))).toMatchObject({ festival: 'Shieldmeet', month: null });
    expect(harptos(day(214))).toMatchObject({ month: 'Eleasis', day: 1 });
    expect(harptos(day(274))).toMatchObject({ festival: 'Highharvestide' });
    expect(harptos(day(335))).toMatchObject({ festival: 'Feast of the Moon' });
    expect(harptos(day(365))).toMatchObject({ month: 'Nightal', day: 30 });
    expect(harptos(day(366))).toMatchObject({ year: 1493, month: 'Hammer', day: 1 });
    // 1493 — обычный: за Midsummer сразу Eleasis.
    expect(harptos(day(366 + 212))).toMatchObject({ year: 1493, festival: 'Midsummer' });
    expect(harptos(day(366 + 213))).toMatchObject({ year: 1493, month: 'Eleasis', day: 1 });
    // 1491 — обычный, кончается 30 Nightal; 1488 — снова Shieldmeet.
    expect(harptos(-1)).toMatchObject({ year: 1491, month: 'Nightal', day: 30, hour: 23, minute: 59 });
    expect(harptos(secOf({ year: 1488, festival: 'Shieldmeet' }))).toMatchObject({ year: 1488, festival: 'Shieldmeet' });
    expect(yearStartDay(1488)).toBe(-(365 * 3 + 366));
    expect(yearStartDay(1496)).toBe(366 + 365 * 3);
  });

  it('secOf обратна harptos на каждом дне года и бракует то, чего в календаре нет', () => {
    for (let d = 0; d < daysInYear(1492) + DAYS_PER_YEAR; d++) {
      const sec = day(d) + 13 * 3600 + 7 * 60;
      const h = harptos(sec);
      const back = h.festival ? secOf({ year: h.year, festival: h.festival, hour: h.hour, minute: h.minute }) : secOf({ year: h.year, month: h.month!, day: h.day, hour: h.hour, minute: h.minute });
      expect(back).toBe(sec);
    }
    expect(secOf({ year: 1493, month: 'Hammer', day: 1 })).toBe(day(366));
    expect(() => secOf({ year: 1493, festival: 'Shieldmeet' })).toThrow(/нет Shieldmeet/);
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

describe('календарь на экране: год, месяц, праздники (часы Харптоса, 28.10.2026)', () => {
  it('год — 12 месяцев и 5 праздников по порядку (в год Shieldmeet — шесть), дни подряд без дыр; сезоны по месяцу', () => {
    const slots = yearSlots(1492);
    expect(slots).toHaveLength(18);
    expect(slots.map(s => s.month ?? s.festival)).toEqual([
      'Hammer', 'Midwinter', 'Alturiak', 'Ches', 'Tarsakh', 'Greengrass', 'Mirtul', 'Kythorn', 'Flamerule', 'Midsummer', 'Shieldmeet',
      'Eleasis', 'Eleint', 'Highharvestide', 'Marpenoth', 'Uktar', 'Feast of the Moon', 'Nightal',
    ]);
    expect(slots.reduce((n, s) => n + s.days, 0)).toBe(366);
    for (let i = 1; i < slots.length; i++) expect(slots[i].startSec).toBe(slots[i - 1].startSec + day(slots[i - 1].days));
    expect(slots[0].startSec).toBe(0);
    expect(yearSlots(1493)[0].startSec).toBe(day(366));
    expect(yearSlots(1493)).toHaveLength(17);
    expect(yearSlots(1493).reduce((n, s) => n + s.days, 0)).toBe(DAYS_PER_YEAR);
    expect(slots.find(s => s.festival === 'Shieldmeet')!.season).toBe('summer');
    expect(slots.find(s => s.month === 'Mirtul')!.season).toBe('spring');
    expect(slots.find(s => s.festival === 'Midsummer')!.season).toBe('summer');
  });

  it('праздник после месяца и месяц перед праздником — взаимно обратны', () => {
    for (const f of FESTIVALS) expect(festivalAfter(monthBefore(f))).toBe(f);
    expect(festivalAfter('Mirtul')).toBeNull();
    expect(monthBefore('Greengrass')).toBe('Tarsakh');
  });

  it('Mirtul 1492: 30 дней по три десятидневки, полнолуние 18-го (§13), новолуние в середине цикла', () => {
    const days = monthDays(1492, 'Mirtul');
    expect(days).toHaveLength(30);
    expect(days.map(d => d.tenday)).toEqual([...Array(10).fill(1), ...Array(10).fill(2), ...Array(10).fill(3)]);
    expect(days[0].sec).toBe(secOf({ year: 1492, month: 'Mirtul', day: 1 }));
    expect(days[17]).toMatchObject({ day: 18, moon: 'full' });
    // Полная ±1 день вокруг 18-го, новая — ±1 день вокруг середины цикла (3-е, за 15 дней до полной).
    expect(days.filter(d => d.moon === 'full').map(d => d.day)).toEqual([17, 18, 19]);
    expect(days.filter(d => d.moon === 'new').map(d => d.day)).toEqual([2, 3, 4]);
    expect(harptos(days[29].sec)).toMatchObject({ month: 'Mirtul', day: 30 });
  });
});


describe('Shieldmeet и год как шаг (решение владельца 29.10.2026)', () => {
  it('та же дата в другом году; Shieldmeet в обычный год — Midsummer; шаг «год» — по календарю', () => {
    const mirtul = secOf({ year: 1492, month: 'Mirtul', day: 15, hour: 8 });
    expect(formatHarptos(sameDayIn(mirtul, 1493))).toBe('15 Mirtul 1493 DR, 08:00');
    expect(formatHarptos(sameDayIn(mirtul, 1372))).toBe('15 Mirtul 1372 DR, 08:00');
    expect(formatHarptos(sameDayIn(secOf({ year: 1492, festival: 'Shieldmeet', hour: 12 }), 1493))).toBe('Midsummer 1493 DR, 12:00');
    const s = emptyState();
    s.time.sec = mirtul;
    const store = createEngineStore(s);
    const { event } = stepTime(store.getState(), 'year', 1);
    expect(event.payload.toSec - event.payload.fromSec).toBe(366 * SECONDS_PER_DAY);
    expect(formatHarptos(store.getState().state.time.sec)).toBe('15 Mirtul 1493 DR, 08:00');
  });
});
