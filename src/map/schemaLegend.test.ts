import { describe, expect, it } from 'vitest';
import { schemaLegend } from './schemaLegend';
import { TERRAIN_NAMES } from './terrain';

describe('легенда схемы (M16)', () => {
  it('классы местности — подписями TERRAIN_NAMES и токенами terrain-*, в порядке заливки; потом вода, берег, реки, дороги', () => {
    const items = schemaLegend({ land: [[0, 0, 1, 0, 1, 1]], regions: { m: [[0, 0, 1, 0, 1, 1]], d: [[0, 0, 1, 0, 1, 1]] }, roads: [[0, 0, 1, 1]], rivers: [[0, 1, 1, 0]], borders: [[0, 0, 1, 0]] });
    expect(items.map(i => i.key)).toEqual(['g', 'd', 'm', 'o', 'coast', 'river', 'border', 'road']);
    expect(items.find(i => i.key === 'border')).toMatchObject({ label: 'граница', token: 'map-border', shape: 'dash' });
    expect(items.find(i => i.key === 'river')).toMatchObject({ label: 'река', token: 'terrain-o', shape: 'line' });
    expect(items.find(i => i.key === 'm')).toMatchObject({ label: TERRAIN_NAMES.m, token: 'terrain-m', shape: 'fill' });
    expect(items.find(i => i.key === 'road')).toMatchObject({ label: 'дорога', token: 'gd', shape: 'line' });
    expect(items.every(i => i.title.length > 0)).toBe(true);
  });

  it('нет класса, дорог, границ или суши — нет и строки', () => {
    expect(schemaLegend({ land: [], regions: { f: [] }, roads: [] }).map(i => i.key)).toEqual(['o']);
    expect(schemaLegend({ land: [], regions: {}, roads: [], borders: [] }).map(i => i.key)).toEqual(['o']);
  });
});
