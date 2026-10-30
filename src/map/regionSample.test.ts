// Выборка регионов A5E по окну карты (ROADMAP 6.4): поселение → дорога → местность, как путь похода; дороги и
// поселения — только когда их видно на шаге; туман игроков закрывает клетки.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadJourney } from '../rules/a5e/journey';
import { sampleRegions } from './regionSample';
import { TERRAIN_CODES, type RoadGrid, type TerrainGrid } from './terrain';

beforeAll(() => loadJourney());

// 100×100 px: левая половина — лес, правая — равнина; дорога — горизонталь y = 50; город в (75, 20) радиусом 8 px.
const grid: TerrainGrid = { w: 10, h: 10, cell: 10, data: new Uint8Array(100).map((_, i) => TERRAIN_CODES.indexOf(i % 10 < 5 ? 'f' : 'g')) };
const roads: RoadGrid = { w: 25, h: 25, cell: 4, data: new Uint8Array(625) };
for (let x = 0; x < 25; x++) roads.data[12 * 25 + x] = 1;
const town = { x: 75, y: 20, r: 8, region: 'urban-township' };
const vp = { w: 100, h: 100 };
const view = { x: 50, y: 50, scale: 1 };

describe('регионы окна', () => {
  it('вблизи: лес, равнина, дорога и город — со своими долями', () => {
    const s = sampleRegions(grid, { roads, settlements: [town] }, vp, view);
    expect([s.cols, s.rows]).toEqual([10, 10]);
    const at = (x: number, y: number) => s.ids[Math.floor(y / 10) * 10 + Math.floor(x / 10)];
    expect(at(15, 15)).toBe('tangled-forest');
    expect(at(85, 85)).toBe('rolling-grasslands');
    expect(at(15, 55)).toBe('open-roads');
    expect(at(75, 15)).toBe('urban-township');
    expect(s.shares.map(x => x.id).sort()).toEqual(['open-roads', 'rolling-grasslands', 'tangled-forest', 'urban-township']);
  });

  it('издали дороги и города нет: клетка шире их, идёт местностью', () => {
    const s = sampleRegions(grid, { roads, settlements: [town] }, vp, { x: 50, y: 50, scale: 0.25 }, undefined, 10);
    expect(s.shares.map(x => x.id).sort()).toEqual(['rolling-grasslands', 'tangled-forest']);
  });

  it('стол игроков: закрытое туманом не подкрашено и не считается', () => {
    const explored = { circles: [{ x: 15, y: 15, r: 10 }], paths: [], sight: 5 };
    const s = sampleRegions(grid, { roads }, vp, view, explored);
    expect(s.shares).toEqual([{ id: 'tangled-forest', cells: 5 }]); // центр круга и четыре соседа на 10 px
  });
});
