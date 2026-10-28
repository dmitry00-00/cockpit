import { describe, expect, it } from 'vitest';
import { LAYOUT, PHLOGISTON, daysLabel, flowsOf } from './phlogiston';
import { REALMSPACE, distanceBetween, milesLabel, moonsOf, nearestApproach, orbitAngle, planetsOf, sunOf } from './realmspace';

describe('Realmspace', () => {
  it('восемь планет по удалённости от солнца, у каждой — расстояние, год и книга', () => {
    const planets = planetsOf(REALMSPACE);
    expect(planets.map(p => p.name)).toEqual(['Anadia', 'Coliar', 'Toril', 'Karpri', 'Chandos', 'Glyth', 'Garden', "H'Catha"]);
    for (const p of planets) {
      expect(p.distanceMi).toBeGreaterThan(0);
      expect(p.yearDays).toBeGreaterThan(0);
      expect(p.refs[0]).toMatch(/^Realmspace, с\. \d/);
    }
    expect(planets.find(p => p.id === 'toril')).toMatchObject({ distanceMi: 200_000_000, yearDays: 365 });
    expect(sunOf(REALMSPACE)?.element).toBe('Fire');
    expect(REALMSPACE.sphere.radiusMi).toBe(3_200_000_000);
  });

  it('у Toril — Selûne и Tears of Selûne', () => {
    const toril = REALMSPACE.bodies.find(b => b.id === 'toril')!;
    expect(moonsOf(REALMSPACE, toril).map(b => b.name)).toEqual(['Selûne', 'Tears of Selûne']);
  });

  it('за свой год тело возвращается на тот же угол; расстояние — по закону косинусов', () => {
    const [anadia, , toril] = planetsOf(REALMSPACE);
    expect(orbitAngle(toril, 365)).toBeCloseTo(orbitAngle(toril, 0));
    expect(orbitAngle(anadia, 15)).not.toBeCloseTo(orbitAngle(anadia, 0));
    const d = distanceBetween(anadia, toril, 0);
    expect(d).toBeGreaterThanOrEqual(150_000_000 - 1);
    expect(d).toBeLessThanOrEqual(250_000_000 + 1);
  });

  it('ближайшее сближение Toril — не дальше суммы радиусов и в пределах окна', () => {
    const toril = REALMSPACE.bodies.find(b => b.id === 'toril')!;
    const a = nearestApproach(REALMSPACE, toril, 0, 365)!;
    expect(a.body.id).not.toBe('toril');
    expect(a.inDays).toBeGreaterThanOrEqual(0);
    expect(a.inDays).toBeLessThanOrEqual(365);
    expect(a.miles).toBeLessThan(200_000_000);
    expect(milesLabel(300_000_000)).toBe('300 млн миль');
    expect(milesLabel(1_600_000_000)).toBe('1,6 млрд миль');
    expect(milesLabel(3_000_000_000)).toBe('3 млрд миль');
  });
});

describe('Флогистон', () => {
  it('у каждой сферы есть место на схеме, у каждого ребра — концы среди сфер и цитата', () => {
    const ids = new Set(PHLOGISTON.spheres.map(s => s.id));
    for (const s of PHLOGISTON.spheres) expect(LAYOUT[s.id], s.id).toBeDefined();
    for (const f of PHLOGISTON.flows) {
      expect(ids.has(f.from) && ids.has(f.to), `${f.from} → ${f.to}`).toBe(true);
      expect(f.quote.length).toBeGreaterThan(20);
    }
  });

  it('треугольник: Realmspace ↔ Greyspace, Greyspace → Krynnspace, Krynnspace → Realmspace за 53 дня', () => {
    const f = (a: string, b: string) => PHLOGISTON.flows.find(x => x.from === a && x.to === b);
    expect(f('realmspace', 'greyspace')?.way).toBe('two');
    expect(f('greyspace', 'krynnspace')?.way).toBe('one');
    expect(f('krynnspace', 'realmspace')).toMatchObject({ way: 'one', days: 53, ref: 'Into the Void, с. 168' });
    // Из Realmspace в Krynnspace напрямую не уйти.
    expect(flowsOf(PHLOGISTON, 'realmspace').out.some(x => x.to === 'krynnspace' || x.from === 'krynnspace')).toBe(false);
    expect(flowsOf(PHLOGISTON, 'realmspace').in.some(x => x.from === 'krynnspace')).toBe(true);
  });

  it('подписи дней', () => {
    expect(daysLabel(53)).toBe('53 дня');
    expect(daysLabel(7)).toBe('7 дней');
    expect(daysLabel(21)).toBe('21 день');
    expect(daysLabel([12, 21])).toBe('12–21 день');
    expect(daysLabel(null)).toBe('?');
  });
});
