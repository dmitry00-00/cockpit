import { describe, expect, it } from 'vitest';
import { exteriorDoorGeometry, exteriorDoorSides, generateSettlementDraft, type SettlementDraft } from './settlementDraft';
import { settlementDraftToUvtt, settlementDoorGeometry, settlementLineOfSight, type UvttPoint } from './settlementUvtt';

function png(width: number, height: number): string {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([73, 72, 68, 82], 12);
  const write = (n: number, offset: number) => {
    bytes[offset] = (n >>> 24) & 255; bytes[offset + 1] = (n >>> 16) & 255;
    bytes[offset + 2] = (n >>> 8) & 255; bytes[offset + 3] = n & 255;
  };
  write(width, 16); write(height, 20);
  return btoa(String.fromCharCode(...bytes));
}
const midpoint = (a: UvttPoint, b: UvttPoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const blockedBy = (point: UvttPoint, segment: [UvttPoint, UvttPoint]) => {
  const [a, b] = segment;
  if (a.x === b.x && point.x === a.x) return point.y > Math.min(a.y, b.y) && point.y < Math.max(a.y, b.y);
  if (a.y === b.y && point.y === a.y) return point.x > Math.min(a.x, b.x) && point.x < Math.max(a.x, b.x);
  return false;
};

describe('settlement draft UVTT export', () => {
  it('embeds only rendered draft PNG and maps building and room walls into grid units', () => {
    const draft = generateSettlementDraft({ placeId: 'place:neverwinter', seed: 'uvtt-test' });
    const pxPerGrid = 10;
    const result = settlementDraftToUvtt(draft, png(draft.bounds.width / 5 * pxPerGrid, draft.bounds.height / 5 * pxPerGrid));
    expect(result.format).toBe(0.2);
    expect(result.resolution).toEqual({
      map_origin: { x: 0, y: 0 }, map_size: { x: draft.bounds.width / 5, y: draft.bounds.height / 5 }, pixels_per_grid: pxPerGrid,
    });
    expect(result.image).toBe(png(draft.bounds.width / 5 * pxPerGrid, draft.bounds.height / 5 * pxPerGrid));
    expect(result.portals).toHaveLength(settlementDoorGeometry(draft).length);
    expect(result.portals[0]).toMatchObject({closed:!draft.buildings[0].doors[0].open});
    expect(result.metadata).toMatchObject({ placeId: 'place:neverwinter', seed: 'uvtt-test', generatorVersion: draft.generatorVersion, provenance: 'table-rule' });
    expect(result.line_of_sight.length).toBeGreaterThan(draft.buildings.length * 4);
    for (const [a, b] of result.line_of_sight) for (const p of [a, b]) {
      expect(Number.isFinite(p.x)).toBe(true); expect(Number.isFinite(p.y)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(0); expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(draft.bounds.width / 5); expect(p.y).toBeLessThanOrEqual(draft.bounds.height / 5);
    }
  });

  it('rejects non-PNG and mismatched render dimensions', () => {
    const draft = generateSettlementDraft({ placeId: 'place:neverwinter', seed: 'bad-png' });
    expect(() => settlementDraftToUvtt(draft, btoa('not a png'))).toThrow(/PNG/);
    expect(() => settlementDraftToUvtt(draft, png(800, 400))).toThrow(/aspect ratio/);
    expect(()=>settlementDraftToUvtt(draft,png(draft.bounds.width/5*8,draft.bounds.height/5*8))).toThrow(/at least 9/);
  });

  it('exports door geometry in grid coordinates and leaves open gaps in wall segments', () => {
    const draft = generateSettlementDraft({ placeId: 'place:neverwinter', seed: 'doors-test' });
    const doors = settlementDoorGeometry(draft);
    const walls = settlementLineOfSight(draft);
    expect(doors.length).toBeGreaterThan(draft.buildings.length);
    for (const door of doors.filter(d => d.open)) {
      const center = midpoint(door.a, door.b);
      expect(walls.some(segment => blockedBy(center, segment))).toBe(false);
    }
    const closed = JSON.parse(JSON.stringify(draft));
    const internal = closed.buildings[0].doors.find((door: { connects: string[] }) => !door.connects.includes('outside'))!;
    internal.open = false;
    const closedDraft = settlementLineOfSight(closed);
    const closedDoor = settlementDoorGeometry(closed).find(d => d.doorId === internal.id)!;
    expect(closedDraft.some(segment => blockedBy(midpoint(closedDoor.a, closedDoor.b), segment))).toBe(true);
  });

  it('exports manually added exterior doors as portals at their selected wall coordinates', () => {
    const draft = JSON.parse(JSON.stringify(generateSettlementDraft({ placeId: 'place:neverwinter', seed: 'multiple-exits' }))) as SettlementDraft;
    const building = draft.buildings[0];
    const currentRoomId = building.doors.find(door => door.connects.includes('outside'))!.connects.find(id => id !== 'outside')!;
    const target = building.rooms.map(room => ({ room, sides: exteriorDoorSides(building, room.id) }))
      .find(item => item.room.id !== currentRoomId && item.sides.length > 0)!;
    const geometry = exteriorDoorGeometry(building, target.room.id, target.sides[0])!;
    building.doors.push({ id: 'manual-exterior', ...geometry, open: false, connects: [target.room.id, 'outside'] });
    const doors = settlementDoorGeometry(draft);
    const manual = doors.find(door => door.doorId === 'manual-exterior')!;
    const result = settlementDraftToUvtt(draft, png(draft.bounds.width / 5 * 10, draft.bounds.height / 5 * 10));
    expect(doors.filter(door => door.connects.includes('outside'))).toHaveLength(draft.buildings.length + 1);
    expect(result.portals).toHaveLength(doors.length);
    expect(result.portals).toContainEqual({
      bounds: [manual.a, manual.b], closed: true,
      position: midpoint(manual.a, manual.b),
    });
  });
});
