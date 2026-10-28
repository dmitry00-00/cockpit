import { describe, expect, it } from 'vitest';
import { travelDaysOver } from '../rules/srd/travel';
import { MAPS } from './maps';
import { DIFFICULT, TERRAIN_CODES, difficultLabel, routeTerrain, terrainAt, type TerrainGrid } from './terrain';

const passport = { ...MAPS.toril, milesPerPixel: 0.5 };
// 4×1 клетки по 10 px: равнина, лес, лес, горы.
const code = (c: string) => TERRAIN_CODES.indexOf(c as never);
const grid: TerrainGrid = { w: 4, h: 1, cell: 10, data: new Uint8Array(['g', 'f', 'f', 'm'].map(code)) };

describe('местность карты', () => {
  it('клетка по точке исходника; за краем — ничего', () => {
    expect(terrainAt(grid, { x: 15, y: 5 })).toBe('f');
    expect(terrainAt(grid, { x: 45, y: 5 })).toBeUndefined();
  });

  it('трудная по SRD — лес, болото, горы, лёд; холмы и пустыня — нет', () => {
    expect([...DIFFICULT].sort()).toEqual(['f', 'i', 'm', 's']);
  });

  it('путь режется по клеткам: 40 px = 20 миль, из них 15 по лесу и горам', () => {
    const rt = routeTerrain(grid, passport, [{ x: 0, y: 5 }, { x: 40, y: 5 }]);
    expect(rt.miles.g).toBeCloseTo(5);
    expect(rt.miles.f).toBeCloseTo(10);
    expect(rt.miles.m).toBeCloseTo(5);
    expect(rt.difficult).toBeCloseTo(15);
    expect(difficultLabel(rt)).toBe('лес 10, горы 5');
  });

  it('дни: трудная миля идёт за две — 72 мили, из них 12 по лесу, обычным темпом 3,5 дня', () => {
    expect(travelDaysOver(72, 12, 'normal')).toBe(3.5);
    expect(travelDaysOver(72, 0, 'normal')).toBe(3);
    expect(travelDaysOver(72, 100, 'normal')).toBe(6); // трудных миль не больше пути
  });
});
