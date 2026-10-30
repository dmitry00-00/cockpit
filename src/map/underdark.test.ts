// Подземье Toril GIS под путём (ROADMAP 6.3): кольца в пикселях растра, области — в порядке входа пути.
import { describe, expect, it } from 'vitest';
import { loadUnderdark, underdarkAlong, type UnderdarkRegion } from './underdark';

const square = (id: string, x0: number, y0: number, s: number): UnderdarkRegion => ({
  id, name: id, kind: 'Domain', rings: [[x0, y0, x0 + s, y0, x0 + s, y0 + s, x0, y0 + s]],
});

describe('Подземье под путём', () => {
  it('области в порядке входа; та, что в стороне, — нет', () => {
    const regions = [square('Old Shanatar', 100, 0, 100), square('Northdark', 0, 0, 100), square('Glimmersea', 0, 500, 50)];
    expect(underdarkAlong(regions, [{ x: 10, y: 50 }, { x: 190, y: 50 }]).map(r => r.name)).toEqual(['Northdark', 'Old Shanatar']);
    expect(underdarkAlong(regions, [{ x: 300, y: 300 }, { x: 400, y: 300 }])).toEqual([]);
  });

  it('Toril: владения из GIS без «Underdark» целиком; под Silverymoon — Northdark, под Calimport — Old Shanatar', async () => {
    const regions = await loadUnderdark('toril');
    expect(regions.some(r => r.kind === 'Macroregion')).toBe(false);
    expect(underdarkAlong(regions, [{ x: 9427, y: 2377 }, { x: 9428, y: 2377 }]).map(r => r.name)).toEqual(['Northdark']);
    expect(underdarkAlong(regions, [{ x: 9479, y: 5860 }, { x: 9480, y: 5860 }]).map(r => r.name)).toEqual(['Old Shanatar']);
    expect(await loadUnderdark('нет-такой')).toEqual([]);
  });
});
