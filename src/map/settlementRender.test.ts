import { describe, expect, it } from 'vitest';
import { generateSettlementDraft } from './settlementDraft';
import { settlementDraftToUvtt, settlementDoorGeometry } from './settlementUvtt';
import { settlementCanvasSize, settlementGridPoint } from './settlementRender';

const draft = generateSettlementDraft({ placeId: 'place:neverwinter', seed: 'settlement-render-test' });
function png(width: number, height: number): string {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([0, 0, 0, 13], 8); bytes.set([73, 72, 68, 82], 12);
  const write = (n: number, offset: number) => {
    bytes[offset] = (n >>> 24) & 255; bytes[offset + 1] = (n >>> 16) & 255;
    bytes[offset + 2] = (n >>> 8) & 255; bytes[offset + 3] = n & 255;
  };
  write(width, 16); write(height, 20);
  return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
}

describe('settlement plan rendering geometry', () => {
  it('bounds PNG export to 4096px while preserving the draft aspect ratio', () => {
    const size = settlementCanvasSize(draft);
    expect(size.width).toBeLessThanOrEqual(4096);
    expect(size.height).toBeLessThanOrEqual(4096);
    expect(size.width / size.height).toBeCloseTo(draft.bounds.width / draft.bounds.height, 3);
    expect(size.scale*5).toBeGreaterThanOrEqual(9);
    expect(Number.isInteger(size.scale*5)).toBe(true);
    expect(()=>settlementCanvasSize(draft,100)).toThrow(/at least 9/);
  });

  it('uses the same 5ft grid coordinates for doors and UVTT walls', () => {
    const building = draft.buildings[0];
    const sourceDoor = building.doors[0];
    const exportedDoor = settlementDoorGeometry(draft).find(door => door.doorId === sourceDoor.id)!;
    expect(settlementGridPoint(sourceDoor.a, draft.gridFeet)).toEqual(exportedDoor.a);
    expect(settlementGridPoint(sourceDoor.b, draft.gridFeet)).toEqual(exportedDoor.b);

    const size = settlementCanvasSize(draft);
    const uvtt = settlementDraftToUvtt(draft, png(size.width, size.height));
    expect(uvtt.resolution.map_size).toEqual({ x: draft.bounds.width / 5, y: draft.bounds.height / 5 });
    expect(uvtt.resolution.pixels_per_grid).toBeCloseTo(size.width / (draft.bounds.width / 5));
    const wallPoints = new Set(uvtt.line_of_sight.flatMap(([a, b]) => [`${a.x},${a.y}`, `${b.x},${b.y}`]));
    const corner = settlementGridPoint(building.outline[0], draft.gridFeet);
    expect(wallPoints.has(`${corner.x},${corner.y}`)).toBe(true);
  });
});
