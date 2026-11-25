import { describe, expect, it } from 'vitest';
import { parseWatabouMfcgCity } from './watabouMfcg';

const ring = [[-5, -5], [15, -5], [15, 15], [-5, 15], [-5, -5]];
const exportFixture = () => ({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', id: 'values', generator: 'mfcg', version: '0.11.5', roadWidth: 8 },
    { type: 'Polygon', id: 'earth', coordinates: [ring] },
    { type: 'GeometryCollection', id: 'roads', geometries: [{ type: 'LineString', width: 8, coordinates: [[-5, 0], [5, 0], [15, 0]] }] },
    { type: 'MultiPolygon', id: 'buildings', coordinates: [[[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]]] },
    { type: 'GeometryCollection', id: 'districts', geometries: [{ type: 'Polygon', name: 'Old Town', coordinates: [ring] }] },
  ],
});

describe('Watabou MFCG export reader', () => {
  it('preserves layers, names, widths, bounds and generator units', () => {
    const city = parseWatabouMfcgCity(JSON.stringify(exportFixture()));
    expect(city).toMatchObject({
      version: '0.11.5', coordinateUnit: 'generator-unit',
      bounds: { minX: -5, minY: -5, maxX: 15, maxY: 15 },
      districtNames: ['Old Town'],
    });
    expect(city.layers.find(layer => layer.id === 'roads')?.geometries[0]).toEqual({
      type: 'LineString', coordinates: [[-5, 0], [5, 0], [15, 0]], width: 8,
    });
    expect(city.layers.find(layer => layer.id === 'buildings')?.geometries).toHaveLength(1);
  });

  it('normalizes open MFCG rings and rejects unsupported layers, degenerate rings and unbounded coordinates', () => {
    expect(() => parseWatabouMfcgCity({ type: 'FeatureCollection', features: [] })).toThrow(/FeatureCollection/);
    const unknownLayer = exportFixture(); unknownLayer.features.push({ type: 'Polygon', id: 'secret', coordinates: [ring] });
    expect(() => parseWatabouMfcgCity(unknownLayer)).toThrow(/unsupported or duplicate/);
    const openRing = exportFixture(); (openRing.features[1] as { coordinates: number[][][] }).coordinates = [[[0, 0], [2, 0], [2, 2], [0, 2]]];
    expect(parseWatabouMfcgCity(openRing).layers.find(layer => layer.id === 'earth')?.geometries[0]).toMatchObject({
      type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
    });
    const degenerate = exportFixture(); (degenerate.features[1] as { coordinates: number[][][] }).coordinates = [[[0, 0], [2, 0], [4, 0], [0, 0]]];
    expect(() => parseWatabouMfcgCity(degenerate)).toThrow(/zero-area/);
    const hugeCoordinate = exportFixture(); (hugeCoordinate.features[1] as { coordinates: number[][][] }).coordinates = [[[0, 0], [200_000, 0], [0, 0]]];
    expect(() => parseWatabouMfcgCity(hugeCoordinate)).toThrow(/outside supported range/);
  });
});
