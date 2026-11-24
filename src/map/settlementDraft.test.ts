import { describe, expect, it } from 'vitest';
import { exteriorDoorGeometry, exteriorDoorSides, generateSettlementDraft, inferSettlementFeatureSide, inferSettlementPattern, inferSettlementRiverRoute, inferSettlementSiteFeature, parseSettlementDraft, settlementSeedKey, validateSettlementDraft, type SettlementDraft } from './settlementDraft';

const make = (seed = 'm19-pilot-seed') => generateSettlementDraft({ placeId: 'place:neverwinter', seed });
const closedBounds = (polygon: { x: number; y: number }[]) => ({
  x0: Math.min(...polygon.map(p => p.x)), x1: Math.max(...polygon.map(p => p.x)),
  y0: Math.min(...polygon.map(p => p.y)), y1: Math.max(...polygon.map(p => p.y)),
});
const overlaps = (a: ReturnType<typeof closedBounds>, b: ReturnType<typeof closedBounds>) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

describe('settlement draft', () => {
  it('is reproducible and versioned by setting/map/place/version seed material', () => {
    expect(JSON.stringify(make())).toBe(JSON.stringify(make()));
    expect(JSON.stringify(make().streets)).not.toBe(JSON.stringify(make('different-seed').streets));
    expect(settlementSeedKey('forgotten-realms', 'toril', 'place:neverwinter'))
      .not.toBe(settlementSeedKey('forgotten-realms', 'toril', 'place:waterdeep'));
    expect(settlementSeedKey('fr', 'toril', 'a|b')).not.toBe(settlementSeedKey('fr', 'toril|a', 'b'));
    expect(() => generateSettlementDraft({ placeId: 'p', seed: 'x', version: 'future-unknown' })).toThrow(/unsupported/);
    expect(() => settlementSeedKey('fr', 'toril', 'p', 'future-unknown')).toThrow(/unsupported/);
  });

  it('creates 12–30 bounded, non-overlapping footprints and accessible street corridors', () => {
    for (let i = 0; i < 200; i++) {
      const d = generateSettlementDraft({ placeId: `place:${i}`, seed: `seed-${i}` });
      expect(d.provenance).toBe('table-rule');
      expect(d.buildings.length).toBeGreaterThanOrEqual(12);
      expect(d.buildings.length).toBeLessThanOrEqual(30);
      expect(d.bounds.width % d.gridFeet).toBe(0);
      expect(d.bounds.height % d.gridFeet).toBe(0);
      const bounds = d.buildings.map(b => closedBounds(b.outline));
      for (let a = 0; a < bounds.length; a++) for (let b = a + 1; b < bounds.length; b++) expect(overlaps(bounds[a], bounds[b])).toBe(false);
      for (const street of d.streets) {
        expect(street.length).toBeGreaterThanOrEqual(2);
        for (const building of bounds) {
          const vertical = street.every((p, j) => j === 0 || p.x === street[0].x);
          const horizontal = street.every((p, j) => j === 0 || p.y === street[0].y);
          if (vertical) expect(street[0].x <= building.x0 || street[0].x >= building.x1).toBe(true);
          if (horizontal) expect(street[0].y <= building.y0 || street[0].y >= building.y1).toBe(true);
        }
      }
      for (const building of d.buildings) for (const room of building.rooms) {
        const outer = closedBounds(building.outline); const inner = closedBounds(room.outline);
        expect(inner.x0).toBeGreaterThanOrEqual(outer.x0); expect(inner.x1).toBeLessThanOrEqual(outer.x1);
        expect(inner.y0).toBeGreaterThanOrEqual(outer.y0); expect(inner.y1).toBeLessThanOrEqual(outer.y1);
        expect(inner.x1 - inner.x0).toBeGreaterThan(0); expect(inner.y1 - inner.y0).toBeGreaterThan(0);
      }
      for (let b = 0; b < d.buildings.length; b++) {
        const outer = bounds[b]; const area = d.buildings[b].rooms.reduce((sum, room) => {
          const inner = closedBounds(room.outline); return sum + (inner.x1 - inner.x0) * (inner.y1 - inner.y0);
        }, 0);
        expect(area).toBe((outer.x1 - outer.x0) * (outer.y1 - outer.y0));
      }
    }
  });

  it('uses explicit population bands and a small description vocabulary as reproducible table-rule inputs', () => {
    const small = generateSettlementDraft({ placeId: 'place:sample', seed: 'fixed', population: 500 });
    const large = generateSettlementDraft({ placeId: 'place:sample', seed: 'fixed', population: 50_000 });
    const linear = generateSettlementDraft({ placeId: 'place:sample', seed: 'fixed', population: 50_000, description: 'поселение вдоль реки' });
    const compact = generateSettlementDraft({ placeId: 'place:sample', seed: 'fixed', description: 'компактный город' });
    expect(small.generationProfile).toEqual({ description: '', population: 500, pattern: 'grid', siteFeature: null, featureSide: null });
    expect(small.bounds.width).toBeLessThan(large.bounds.width);
    expect(small.buildings.length).toBeGreaterThanOrEqual(6);
    expect(small.buildings.length).toBeLessThanOrEqual(12);
    expect(large.buildings.length).toBeGreaterThanOrEqual(18);
    expect(large.buildings.length).toBeLessThanOrEqual(30);
    expect(linear.generationProfile?.pattern).toBe('linear');
    expect(linear.bounds.width).toBeLessThan(linear.bounds.height);
    expect(compact.generationProfile?.pattern).toBe('compact');
    expect(JSON.stringify(compact.streets)).not.toBe(JSON.stringify(make('fixed').streets));
    expect(inferSettlementPattern('компактный город')).toBe('compact');
    expect(inferSettlementPattern('город вдоль старого тракта')).toBe('linear');
    expect(JSON.stringify(large)).toBe(JSON.stringify(generateSettlementDraft({ placeId: 'place:sample', seed: 'fixed', population: 50_000 })));
    expect(large.bounds.height).toBeGreaterThan(small.bounds.height);
    expect(() => generateSettlementDraft({ placeId: 'p', seed: 's', population: -1 })).toThrow(/population/);
    expect(() => validateSettlementDraft({ ...small, generationProfile: { description: '', population: -1, pattern: 'grid' } })).toThrow(/profile|population/);
  });

  it('turns explicit river/coast descriptions into a bounded non-canonical map feature', () => {
    const river = generateSettlementDraft({ placeId: 'place:sample', seed: 'water', population: 700, description: 'компактное поселение у реки на севере' });
    expect(inferSettlementSiteFeature('старый город у реки')).toBe('river');
    expect(inferSettlementSiteFeature('порт на побережье')).toBe('coast');
    expect(inferSettlementFeatureSide('город на западе у реки', 'river')).toBe('west');
    expect(river.generationProfile).toMatchObject({ siteFeature: 'river', featureSide: 'north', pattern: 'compact' });
    expect(river.waterFeatures).toEqual([{ id: 'water-river', kind: 'river', side: 'north', width: 60 }]);
    expect(river.buildings.every(building => Math.min(...building.outline.map(point => point.y)) >= 80)).toBe(true);
    expect(river.streets.every(street => street[0].y >= 77 && street.at(-1)!.y >= 77)).toBe(true);
    expect(parseSettlementDraft(JSON.stringify(river)).waterFeatures).toEqual(river.waterFeatures);
    expect(JSON.stringify(river)).toBe(JSON.stringify(generateSettlementDraft({ placeId: 'place:sample', seed: 'water', population: 700, description: 'компактное поселение у реки на севере' })));
  });

  it('routes an explicitly through-town river across the plan and keeps building footprints clear', () => {
    const input = { placeId: 'place:sample', seed: 'river-route', population: 20_000, description: 'река протекает через город' };
    const river = generateSettlementDraft(input);
    const repeat = generateSettlementDraft(input);
    const feature = river.waterFeatures?.[0];
    expect(inferSettlementRiverRoute(input.description)).toBe(true);
    expect(inferSettlementRiverRoute('город у реки на севере')).toBe(false);
    expect(feature).toMatchObject({ kind: 'river', side: null, width: 60 });
    expect(feature?.route).toHaveLength(4);
    expect(JSON.stringify(river)).toBe(JSON.stringify(repeat));
    const route = feature!.route!;
    for (const building of river.buildings) {
      const bounds = closedBounds(building.outline);
      for (let segment = 1; segment < route.length; segment++) {
        const a = route[segment - 1]; const b = route[segment];
        for (let step = 0; step <= 32; step++) {
          const t = step / 32;
          const x = a.x + (b.x - a.x) * t; const y = a.y + (b.y - a.y) * t;
          expect(x >= bounds.x0 - 30 && x <= bounds.x1 + 30 && y >= bounds.y0 - 30 && y <= bounds.y1 + 30).toBe(false);
        }
      }
    }
    expect(parseSettlementDraft(JSON.stringify(river)).waterFeatures).toEqual(river.waterFeatures);
  });

  it('freezes generated and parsed snapshots', () => {
    const d = make();
    expect(Object.isFrozen(d)).toBe(true);
    expect(Object.isFrozen(d.buildings)).toBe(true);
    expect(Object.isFrozen(d.buildings[0].outline[0])).toBe(true);
    expect(() => { (d.buildings[0].outline[0] as { x: number }).x = -1; }).toThrow();
    const parsed = parseSettlementDraft(JSON.stringify(d));
    expect(Object.isFrozen(parsed.buildings[0].rooms)).toBe(true);
    const old = JSON.parse(JSON.stringify(d)); old.generatorVersion = 'm19-city-v0';
    expect(parseSettlementDraft(old).generatorVersion).toBe('m19-city-v0');
  });

  it('gives every room a connected open-door path to the outside', () => {
    for (let i = 0; i < 40; i++) {
      const d = generateSettlementDraft({ placeId: `place:${i}`, seed: `doors-${i}` });
      for (const building of d.buildings) {
        const roomIds = new Set(building.rooms.map(r => r.id));
        const adj = new Map([...roomIds].map(id => [id, new Set<string>()]));
        const exterior = building.doors.filter(door => door.connects.includes('outside'));
        expect(exterior).toHaveLength(1); expect(exterior[0].open).toBe(true);
        for (const door of building.doors) {
          expect(door.open).toBe(true);
          if (door.connects[0] !== 'outside' && door.connects[1] !== 'outside') {
            adj.get(door.connects[0])!.add(door.connects[1]); adj.get(door.connects[1])!.add(door.connects[0]);
          }
        }
        const seen = new Set<string>(); const queue = [exterior[0].connects.find(id => id !== 'outside')!];
        while (queue.length) { const id = queue.shift()!; if (seen.has(id)) continue; seen.add(id); queue.push(...adj.get(id)!); }
        expect(seen).toEqual(roomIds);
        expect(building.doors.filter(d => !d.connects.includes('outside')).length).toBeGreaterThanOrEqual(building.rooms.length - 1);
      }
    }
  });

  it('places the single exterior door only on a selected room wall that meets the building boundary', () => {
    const base = make();
    const building = base.buildings[0];
    const exterior = building.doors.find(door => door.connects.includes('outside'))!;
    const originalRoomId = exterior.connects.find(id => id !== 'outside')!;
    const target = building.rooms.map(room => ({ room, sides: exteriorDoorSides(building, room.id) }))
      .find(item => item.room.id !== originalRoomId && item.sides.length > 0)!;
    const geometry = exteriorDoorGeometry(building, target.room.id, target.sides[0])!;
    expect(geometry).not.toBeNull();
    const updated = {
      ...base,
      buildings: base.buildings.map((item, index) => index === 0 ? {
        ...item,
        doors: item.doors.map(door => door.id === exterior.id
          ? { ...door, ...geometry, connects: [target.room.id, 'outside'] as [string, string] }
          : door),
      } : item),
    };
    expect(() => validateSettlementDraft(updated)).not.toThrow();
    expect(exteriorDoorGeometry(building, target.room.id, target.sides[0])).toEqual(geometry);
    const invalidSide = (['north', 'east', 'south', 'west'] as const).find(side => !target.sides.includes(side));
    if (invalidSide) expect(exteriorDoorGeometry(building, target.room.id, invalidSide)).toBeNull();
  });

  it('accepts multiple manually added exterior doors but always requires one exit per building', () => {
    const base = make();
    const building = base.buildings[0];
    const existingRoomId = building.doors.find(door => door.connects.includes('outside'))!.connects.find(id => id !== 'outside')!;
    const target = building.rooms.map(room => ({ room, sides: exteriorDoorSides(building, room.id) }))
      .find(item => item.room.id !== existingRoomId && item.sides.length > 0)!;
    const geometry = exteriorDoorGeometry(building, target.room.id, target.sides[0])!;
    const updated = JSON.parse(JSON.stringify(base)) as SettlementDraft;
    updated.buildings[0].doors.push({
      id: 'manual-exterior-door', ...geometry, open: false, connects: [target.room.id, 'outside'],
    });
    expect(() => validateSettlementDraft(updated)).not.toThrow();
    updated.buildings[0].doors = updated.buildings[0].doors.filter(door => !door.connects.includes('outside'));
    expect(() => validateSettlementDraft(updated)).toThrow(/at least one exterior door/);
  });

  it('rejects malformed, out-of-bounds, oversized and non-finite snapshots', () => {
    const d = JSON.parse(JSON.stringify(make()));
    expect(() => validateSettlementDraft({ ...d, format: 'other' })).toThrow();
    expect(() => validateSettlementDraft(JSON.stringify(d))).toThrow(/object/);
    expect(() => parseSettlementDraft(JSON.stringify(d))).not.toThrow();
    const badPoint = JSON.parse(JSON.stringify(d)); badPoint.streets[0][0].x = Infinity;
    expect(() => validateSettlementDraft(badPoint)).toThrow(/non-finite/);
    const outside = JSON.parse(JSON.stringify(d)); outside.buildings[0].outline[0].x = outside.bounds.width + 1;
    expect(() => validateSettlementDraft(outside)).toThrow(/outside bounds/);
    const badBounds = JSON.parse(JSON.stringify(d)); badBounds.bounds.width = Infinity;
    expect(() => validateSettlementDraft(badBounds)).toThrow(/bounds/);
    const concave = JSON.parse(JSON.stringify(d)); concave.buildings[0].outline = [
      { x: 10, y: 10 }, { x: 100, y: 10 }, { x: 60, y: 50 }, { x: 100, y: 100 }, { x: 10, y: 100 }, { x: 10, y: 10 },
    ];
    expect(() => validateSettlementDraft(concave)).toThrow(/rectangles/);
    const overlapRooms = JSON.parse(JSON.stringify(d)); overlapRooms.buildings[0].rooms[1].outline = overlapRooms.buildings[0].rooms[0].outline;
    expect(() => validateSettlementDraft(overlapRooms)).toThrow(/overlapping rooms/);
    const disconnected = JSON.parse(JSON.stringify(d));
    for (const door of disconnected.buildings[0].doors.filter((item: { connects: string[] }) => !item.connects.includes('outside'))) {
      door.connects = [door.connects[0], door.connects[0]];
    }
    expect(() => validateSettlementDraft(disconnected)).toThrow(/connected graph/);
    const tooMany = JSON.parse(JSON.stringify(d)); tooMany.buildings = Array.from({ length: 129 }, (_, i) => ({ ...tooMany.buildings[0], id: `b${i}` }));
    expect(() => validateSettlementDraft(tooMany)).toThrow(/invalid buildings/);
    expect(() => parseSettlementDraft('x'.repeat(2_000_001))).toThrow(/size limit/);
  });
});
