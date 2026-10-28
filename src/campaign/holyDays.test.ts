// Святые дни (E4): правила импорта ложатся на календарь Харптоса, редакция — по эпохе, ближайший — только годовой.
import { describe, expect, it } from 'vitest';
import { FESTIVALS, MONTHS, secOf } from './calendar';
import { HOLY_DEITIES, holyDaysOn, holyLabel, holyList, holyRulesAt, nextHolyDay, nextHolyDayFor, partyDeitiesOf } from './holyDays';
import { seedState } from './seed';

const on = (sec: number, ...args: Parameters<typeof holyDaysOn> extends [number, ...infer R] ? R : never) =>
  holyDaysOn(sec, ...args).map(holyLabel);

describe('данные', () => {
  it('у каждого правила ровно один вид, даты и праздники существуют', () => {
    expect(HOLY_DEITIES.length).toBeGreaterThan(40);
    for (const h of HOLY_DEITIES) for (const [ed, v] of Object.entries(h.editions)) for (const r of v!.rules) {
      const where = `${h.deity} ${ed} ${JSON.stringify(r)}`;
      expect([r.festival, r.month, r.monthly, r.moon].filter(x => x !== undefined), where).toHaveLength(1);
      if (r.festival) expect(FESTIVALS, where).toContain(r.festival);
      if (r.month) {
        expect(MONTHS, where).toContain(r.month);
        expect(r.day, where).toBeGreaterThanOrEqual(1);
        expect(r.day, where).toBeLessThanOrEqual(30);
      }
      for (const d of r.monthly ?? []) expect(d, where).toBeLessThanOrEqual(30);
    }
  });
});

describe('календарь', () => {
  it('даты, праздники, равноденствия — по Calendar of Harptos', () => {
    expect(on(secOf({ year: 1492, month: 'Eleasis', day: 13 }), '5e')).toContain('Torm (The Divine Death)');
    expect(on(secOf({ year: 1492, festival: 'Greengrass' }), '5e')).toEqual(expect.arrayContaining(['Eldath (The Greening)', 'Sune', 'Silvanus']));
    expect(on(secOf({ year: 1492, month: 'Ches', day: 19 }), '5e')).toContain('Lathander (весеннее равноденствие)');
    expect(on(secOf({ year: 1372, month: 'Eleint', day: 21 }), '3e')).toContain('Lathander (осеннее равноденствие)');
    expect(on(secOf({ year: 1492, festival: 'Midwinter' }), '5e')).toEqual(expect.arrayContaining(['Auril', 'Red Knight (The Retreat)']));
  });

  it('каждый месяц и луна: Tyr — 1, 13, 22; в полнолуние — боги луны, но только в «все пантеоны»', () => {
    expect(on(secOf({ year: 1492, month: 'Mirtul', day: 13 }), '5e')).toContain('Tyr');
    expect(on(secOf({ year: 1492, month: 'Mirtul', day: 14 }), '5e')).not.toContain('Tyr');
    const full = secOf({ year: 1492, month: 'Mirtul', day: 18 });
    expect(on(full, '5e', 'all')).toContain('Sehanine Moonbow');
    expect(on(full, '5e')).not.toContain('Sehanine Moonbow');
  });

  it('редакция по эпохе: у Gruumsh в 4e — только «Gharfek\'taaz» текстом, новолуние — в 3e', () => {
    const g = HOLY_DEITIES.find(h => h.deity === 'gruumsh')!;
    expect(holyRulesAt(g, '5e')).toEqual([]);
    expect(holyRulesAt(g, '3e')).toEqual([{ moon: 'new' }]);
  });

  it('ближайший святой день — годовой: от 15 Mirtul 1492 — летнее солнцестояние 20 Kythorn; сегодняшний — сегодня', () => {
    const next = nextHolyDay(secOf({ year: 1492, month: 'Mirtul', day: 15, hour: 8 }), '5e')!;
    expect(next.sec).toBe(secOf({ year: 1492, month: 'Kythorn', day: 20 }));
    expect(next.days).toBe(35);
    expect(next.holy.map(holyLabel)).toEqual(expect.arrayContaining(['Amaunator (летнее солнцестояние)', 'Mielikki (летнее солнцестояние)']));
    expect(next.holy.some(h => h.deity === 'tyr')).toBe(false);
    expect(nextHolyDay(secOf({ year: 1492, month: 'Eleasis', day: 13, hour: 20 }), '5e')!.days).toBe(0);
  });

  it('список строкой: по именам дней, в группе первые три и «ещё N»', () => {
    const list = holyDaysOn(secOf({ year: 1492, festival: 'Midsummer' }), '5e');
    expect(list.length).toBeGreaterThan(4);
    expect(holyList(list)).toMatch(/ и ещё \d+$/);
    const solstice = nextHolyDay(secOf({ year: 1492, month: 'Mirtul', day: 15 }), '5e')!;
    expect(holyList(solstice.holy)).toBe('летнее солнцестояние: Amaunator, Mielikki');
    expect(holyList(holyDaysOn(secOf({ year: 1492, festival: 'Greengrass' }), '5e'))).toMatch(/^The Greening: Eldath; /);
  });

  it('боги партии (E8): с листов, без выбывших; ближайший — бога партии, нет его дней — боги Фаэруна', () => {
    const seed = seedState();
    expect(partyDeitiesOf(seed).size).toBe(0);
    const withTorm = { ...seed, actors: { ...seed.actors, aldric: { ...seed.actors.aldric, sheet: { ...seed.actors.aldric.sheet!, deity: { id: 'torm', name: 'Torm' } } } } };
    expect([...partyDeitiesOf(withTorm)]).toEqual([['torm', ['Brother Aldric']]]);
    const from = secOf({ year: 1492, month: 'Mirtul', day: 15 });
    expect(nextHolyDayFor(from, '5e', new Set(['torm']))).toMatchObject({ sec: secOf({ year: 1492, month: 'Eleasis', day: 13 }), party: true });
    // Бог без правил святых дней — обратно к богам Фаэруна, без пометки «бога партии».
    expect(nextHolyDayFor(from, '5e', new Set(['no-such-god']))).toMatchObject({ sec: secOf({ year: 1492, month: 'Kythorn', day: 20 }) });
    expect(nextHolyDayFor(from, '5e', new Set(['no-such-god']))!.party).toBeUndefined();
  });
});
