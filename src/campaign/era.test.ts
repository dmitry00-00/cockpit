// @vitest-environment node
// Год кампании — фильтр канона (ROADMAP 0.6): эпоха по году, порядок редакций, космология по умолчанию.
import { describe, expect, it } from 'vitest';
import { EDITION_ORDER, cosmologyOf, eraOf } from './era';

describe('эпоха кампании по году', () => {
  it('1372 DR — 3e и Великое древо; 1479 — 4e; 1492 — 5e и Великое колесо; границы включительно', () => {
    expect([eraOf(1372), eraOf(1384), eraOf(1385), eraOf(1479), eraOf(1487), eraOf(1488), eraOf(1492)]).toEqual(['3e', '3e', '4e', '4e', '4e', '5e', '5e']);
    expect(cosmologyOf(1372)).toBe('tree');
    expect(cosmologyOf(1479)).toBe('wheel');
    expect(cosmologyOf(1492)).toBe('wheel');
  });

  it('редакции полей: своя первой, затем старшие, поле без редакции — последним', () => {
    expect(EDITION_ORDER['5e'].slice(0, 2)).toEqual(['5eR', '5e']);
    expect(EDITION_ORDER['3e']).toEqual(['3e', '2e', '1e', '']);
    for (const order of Object.values(EDITION_ORDER)) expect(order.at(-1)).toBe('');
  });
});
