// Подземье Toril GIS под путём (ROADMAP 6.3): кольца в пикселях растра, области — в порядке входа пути.
import { describe, expect, it } from 'vitest';
import { loadUnderdark, loadUnderdarkAtlas, underdarkAlong, type UnderdarkRegion } from './underdark';

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

  it('Toril atlas separates the three source-defined levels and keeps passage geometry unknown', async () => {
    const atlas = await loadUnderdarkAtlas('toril');
    expect(atlas?.levels.map(level => level.id)).toEqual(['Upperdark', 'Middledark', 'Lowerdark']);
    expect(atlas?.levels.map(level => [level.minDepthMiles, level.maxDepthMiles])).toEqual([[0, 3], [3, 10], [10, null]]);
    expect(atlas?.levels.map(level => level.sourcePages)).toEqual(['117', '118', '120']);
    expect(atlas?.regions.length).toBe(40);
    expect(atlas?.sites.length).toBe(87);
    expect(atlas?.regions.every(region => region.featureLevels?.length)).toBe(true);
    expect(atlas?.sites.every(site => site.featureLevels.length > 0 && Number.isFinite(site.x) && Number.isFinite(site.y))).toBe(true);
    expect([atlas?.coordinateSystem.medianErrorPx, atlas?.coordinateSystem.p90ErrorPx]).toEqual([37, 110]);
    expect(atlas?.connections.map(connection => connection.id)).toEqual([
      'firelands-peaks-lava-tubes',
      'lake-of-shadows-lake-thoroot-river',
      'fardrimm-lowroad',
      'undrek-thoz-portal-web',
    ]);
    expect(atlas?.connections.every(connection => connection.geometry === null && connection.sources.length > 0 && connection.routeLevels.length === 0)).toBe(true);
    expect(atlas?.connections.find(connection => connection.surfaceAccess)?.surfaceAccess).toBe(true);
    expect(atlas?.connections.find(connection => connection.id === 'lake-of-shadows-lake-thoroot-river')?.levelContext).toEqual([
      expect.objectContaining({ place: 'Lake of Shadows', featureLevels: ['Middledark'] }),
    ]);
    expect(atlas?.provenance.confidence).toMatch(/no per-feature numeric confidence score/i);
  });
});
