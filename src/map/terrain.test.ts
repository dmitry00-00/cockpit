import { describe, expect, it } from 'vitest';
import { travelDaysOver } from '../rules/srd/travel';
import { MAPS } from './maps';
import { DIFFICULT, TERRAIN_CODES, difficultLabel, nearRoad, routeTerrain, terrainAt, type RoadGrid, type TerrainGrid } from './terrain';

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

describe('дороги и поселения поверх местности (ROADMAP 6.3)', () => {
  // Лес 100×40 px клетками по 10; дорога — горизонталь y = 20 от x = 0 до 60, клетки по 4 px.
  const forest: TerrainGrid = { w: 10, h: 4, cell: 10, data: new Uint8Array(40).fill(code('f')) };
  const road: RoadGrid = { w: 25, h: 10, cell: 4, data: new Uint8Array(250) };
  for (let x = 0; x < 15; x++) road.data[5 * 25 + x] = 1;

  it('у дороги — в допуске 10 px; дальше — нет', () => {
    expect(nearRoad(road, { x: 30, y: 28 })).toBe(true);
    expect(nearRoad(road, { x: 30, y: 36 })).toBe(false);
    expect(nearRoad(road, { x: 80, y: 20 })).toBe(false);
  });

  it('путь вдоль дороги — дорога, не трудная местность; дальше дороги — лес', () => {
    const rt = routeTerrain(forest, passport, [{ x: 0, y: 22 }, { x: 60, y: 22 }, { x: 100, y: 22 }], { roads: road });
    expect(rt.road).toBeCloseTo(30 + 5); // допуск: до x = 70 от последней клетки дороги
    expect(rt.miles.f).toBeCloseTo(15);
    expect(rt.difficult).toBeCloseTo(15);
  });

  it('отрезок почти весь у дороги — весь дорога: путь мастера срезает изгибы', () => {
    const rt = routeTerrain(forest, passport, [{ x: 0, y: 22 }, { x: 80, y: 22 }], { roads: road });
    expect(rt.road).toBeCloseTo(40);
    expect(rt.miles.f).toBeUndefined();
  });

  it('в круге поселения — регион поселения, раньше дороги и местности', () => {
    const town = { x: 0, y: 22, r: 10, region: 'urban-township' };
    const rt = routeTerrain(forest, passport, [{ x: 0, y: 22 }, { x: 100, y: 22 }], { roads: road, settlements: [town] });
    expect(rt.settled['urban-township']).toBeCloseTo(5);
    expect(rt.road + (rt.miles.f ?? 0)).toBeCloseTo(45);
  });

  it('без дорог и поселений — как раньше: только местность', () => {
    const rt = routeTerrain(forest, passport, [{ x: 0, y: 22 }, { x: 100, y: 22 }]);
    expect(rt).toEqual({ miles: { f: 50 }, difficult: 50, road: 0, settled: {} });
  });
});
