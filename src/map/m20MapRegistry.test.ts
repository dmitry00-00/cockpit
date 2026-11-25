import { describe, expect, it } from 'vitest';
import {
  M20_DEFAULT_CORRIDOR_RADIUS_MILES,
  M20_ROUTE_SEGMENTS,
  corridorPreview,
  gapsForRoute,
  initialGapScores,
  initialRouteScores,
  sortByPriority,
  sourcesForRoute,
} from './m20MapRegistry';

describe('M20 route coverage register', () => {
  it('keeps route anchors in the source raster pixel system', () => {
    const route = M20_ROUTE_SEGMENTS.find(item => item.id === 'high-road-waterdeep-neverwinter')!;
    expect(route.stops.map(stop => stop.name)).toEqual(['Waterdeep', 'Leilon', 'Neverwinter']);
    expect(route.stops[0]).toMatchObject({ x: 8770, y: 3045 });
    expect(route.geometryNote).toContain('схематичен');
  });

  it('builds a tile-backed corridor around the selected route and radius', () => {
    const route = M20_ROUTE_SEGMENTS[0];
    const preview = corridorPreview(route, M20_DEFAULT_CORRIDOR_RADIUS_MILES);
    expect(preview.radiusPixels).toBeCloseTo(16 / 0.37);
    expect(preview.tiles.length).toBeGreaterThan(0);
    expect(preview.tiles.every(tile => tile.url.startsWith('/maps/tiles/toril/7/'))).toBe(true);
    expect(preview.x).toBeLessThan(route.stops[2].x);
    expect(preview.x + preview.width).toBeGreaterThan(route.stops[0].x);
  });

  it('matches endpoint-specific sources without treating generic assets as georeferenced', () => {
    const route = M20_ROUTE_SEGMENTS.find(item => item.id === 'high-road-leilon-neverwinter')!;
    const sources = sourcesForRoute(route);
    expect(sources.some(source => source.id === 'neverwinter-plan')).toBe(true);
    expect(sources.some(source => source.id === 'neverwinter-uvtt')).toBe(true);
    expect(sources.some(source => source.id === 'local-generic-assets')).toBe(false);
    const westernLeg = M20_ROUTE_SEGMENTS.find(item => item.id === 'high-road-waterdeep-leilon')!;
    expect(sourcesForRoute(westernLeg).some(source => source.id === 'neverwinter-plan')).toBe(false);
  });

  it('filters nearby POI work by corridor radius and sorts the two axes independently', () => {
    const route = M20_ROUTE_SEGMENTS.find(item => item.id === 'high-road-leilon-neverwinter')!;
    const scores = initialGapScores();
    const narrow = gapsForRoute(route, 8, scores, 'world');
    expect(narrow.some(gap => gap.id === 'nearby-settlements')).toBe(false);
    const expanded = gapsForRoute(route, 16, scores, 'table');
    expect(expanded.some(gap => gap.id === 'nearby-settlements')).toBe(true);
    expect(expanded[0].priorityTable).toBe(5);
    expect(gapsForRoute(route, 16, scores, 'world')[0].priorityWorld).toBe(4);
  });

  it('sorts route candidates using only the selected priority axis first', () => {
    const scores = initialRouteScores();
    scores['high-road-luskan-neverwinter'] = { world: 5, table: 1 };
    scores['high-road-waterdeep-neverwinter'] = { world: 2, table: 5 };
    scores['high-road-leilon-neverwinter'] = { world: 3, table: 2 };
    expect(sortByPriority(M20_ROUTE_SEGMENTS, scores, 'world')[0].id).toBe('high-road-luskan-neverwinter');
    expect(sortByPriority(M20_ROUTE_SEGMENTS, scores, 'table')[0].id).toBe('high-road-waterdeep-neverwinter');
  });
});
