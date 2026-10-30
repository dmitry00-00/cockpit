import { describe, expect, it } from 'vitest';
import { SCHEMA_ORDER, parseSchema } from './schema';
import { TERRAIN_CODES } from './terrain';

describe('схема карты (M16)', () => {
  it('разбор: кольца и линии — пары чисел; битый файл — ошибка с причиной', () => {
    const ok = parseSchema({ land: [[0, 0, 10, 0, 10, 10]], regions: { f: [[1, 1, 2, 1, 2, 2]] }, roads: [] });
    expect(ok.regions.f).toHaveLength(1);
    expect(() => parseSchema({ land: [[0, 0, 1]], regions: {}, roads: [] })).toThrow(/парами чисел/);
    expect(() => parseSchema({ land: [], roads: [] })).toThrow(/regions/);
    expect(() => parseSchema(null)).toThrow();
  });
  it('реки (с 30.10) — линии парами чисел; в схеме без них — пусто, битые — ошибка', () => {
    expect(parseSchema({ land: [], regions: {}, roads: [] }).rivers).toEqual([]);
    expect(parseSchema({ land: [], regions: {}, roads: [], rivers: [[0, 0, 4, 4]] }).rivers).toHaveLength(1);
    expect(() => parseSchema({ land: [], regions: {}, roads: [], rivers: [[0, 0, 4]] })).toThrow(/rivers/);
  });
  it('границы держав — линии парами чисел; в схеме без них (файлы до границ) — пусто, битые — ошибка', () => {
    expect(parseSchema({ land: [], regions: {}, roads: [], rivers: [] }).borders).toEqual([]);
    expect(parseSchema({ land: [], regions: {}, roads: [], borders: [[0, 0, 4, 4, 8, 0]] }).borders).toEqual([[0, 0, 4, 4, 8, 0]]);
    expect(() => parseSchema({ land: [], regions: {}, roads: [], borders: [[0, 0, 4]] })).toThrow(/парами чисел/);
    expect(() => parseSchema({ land: [], regions: {}, roads: [], borders: 'x' })).toThrow(/парами чисел/);
  });
  it('порядок заливки — все классы суши, кроме равнины (её цвет — подложка суши) и воды (фон)', () => {
    expect([...SCHEMA_ORDER].sort()).toEqual(TERRAIN_CODES.filter(c => c !== 'o' && c !== 'g').sort());
  });
});
