import { parseSettlementDraft, type DraftPoint, type SettlementDraft } from './settlementDraft';

export interface UvttPoint { x: number; y: number }
export interface SettlementDoorGeometry { buildingId: string; doorId: string; a: UvttPoint; b: UvttPoint; open: boolean; connects: [string, string] }
export interface SettlementUvtt {
  format: 0.2;
  resolution: { map_origin: UvttPoint; map_size: UvttPoint; pixels_per_grid: number };
  line_of_sight: [UvttPoint, UvttPoint][];
  portals: { bounds: [UvttPoint,UvttPoint]; closed: boolean; position: UvttPoint }[];
  lights: never[];
  environment: { baked_lighting: false; ambient_light: string };
  image: string;
  metadata: { source: 'DM Cockpit authored table-rule draft'; placeId: string; seed: string; generatorVersion: string; provenance: 'table-rule' };
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const MAX_PNG_BASE64_CHARS = 28_000_000;
const MAX_PNG_EDGE = 16_384;

function decodeBase64(value: string): Uint8Array {
  const payload = value.startsWith('data:') ? value.slice(value.indexOf(',') + 1) : value;
  if (!payload || payload.length > MAX_PNG_BASE64_CHARS || payload.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) {
    throw new Error('image must be bounded base64 PNG data');
  }
  let binary: string;
  try { binary = atob(payload); } catch { throw new Error('image is not valid base64'); }
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  if (bytes.length < 24 || PNG_SIGNATURE.some((byte, i) => bytes[i] !== byte) || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') {
    throw new Error('image must be a PNG with IHDR');
  }
  return bytes;
}
function u32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}
/** Door endpoints in grid units; `outside` marks an exterior connection. */
export function settlementDoorGeometry(value: unknown): SettlementDoorGeometry[] {
  const draft: Readonly<SettlementDraft> = parseSettlementDraft(value);
  const unit = draft.gridFeet;
  return draft.buildings.flatMap(building => building.doors.map(door => ({
    buildingId: building.id, doorId: door.id,
    a: { x: door.a.x / unit, y: door.a.y / unit }, b: { x: door.b.x / unit, y: door.b.y / unit },
    open: door.open, connects: [...door.connects] as [string, string],
  })));
}

/** Wall segments in grid coordinates, split around open doorways; closed doors remain blocked. */
export function settlementLineOfSight(value: unknown, portalDoors = false): [UvttPoint, UvttPoint][] {
  const draft: Readonly<SettlementDraft> = parseSettlementDraft(value);
  const unit = draft.gridFeet;
  const result: [UvttPoint, UvttPoint][] = []; const seen = new Set<string>();
  for (const building of draft.buildings) {
    const openings = building.doors.filter(d => portalDoors || d.open).map(d => ({
      a: { x: d.a.x / unit, y: d.a.y / unit }, b: { x: d.b.x / unit, y: d.b.y / unit },
    }));
    const addPolygon = (points: readonly DraftPoint[]) => {
      for (let i = 1; i < points.length; i++) {
        const a = { x: points[i - 1].x / unit, y: points[i - 1].y / unit };
        const b = { x: points[i].x / unit, y: points[i].y / unit };
        const horizontal = a.y === b.y; const low = horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y); const high = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
        const intervals = openings.filter(o => horizontal ? o.a.y === a.y && o.b.y === a.y : o.a.x === a.x && o.b.x === a.x)
          .map(o => ({ lo: horizontal ? Math.min(o.a.x, o.b.x) : Math.min(o.a.y, o.b.y), hi: horizontal ? Math.max(o.a.x, o.b.x) : Math.max(o.a.y, o.b.y) }))
          .filter(o => o.hi > low && o.lo < high).sort((x, y) => x.lo - y.lo);
        const emit = (from: number, to: number) => {
          if (to <= from) return;
          const p: UvttPoint = horizontal ? { x: from, y: a.y } : { x: a.x, y: from };
          const q: UvttPoint = horizontal ? { x: to, y: a.y } : { x: a.x, y: to };
          const key = p.x < q.x || (p.x === q.x && p.y <= q.y) ? `${p.x},${p.y}|${q.x},${q.y}` : `${q.x},${q.y}|${p.x},${p.y}`;
          if (!seen.has(key)) { seen.add(key); result.push([p, q]); }
        };
        let cursor = low;
        for (const gap of intervals) {
          emit(cursor, Math.min(high, gap.lo)); cursor = Math.max(cursor, gap.hi);
        }
        emit(cursor, high);
      }
    };
    addPolygon(building.outline);
    for (const room of building.rooms) addPolygon(room.outline);
  }
  // Authored tactical walls add opaque LOS segments only; they create no portals or movement rules.
  for (const wall of draft.walls ?? []) for (let i = 1; i < wall.points.length; i++) {
    const a = { x: wall.points[i - 1].x / unit, y: wall.points[i - 1].y / unit };
    const b = { x: wall.points[i].x / unit, y: wall.points[i].y / unit };
    const key = a.x < b.x || (a.x === b.x && a.y <= b.y) ? `${a.x},${a.y}|${b.x},${b.y}` : `${b.x},${b.y}|${a.x},${a.y}`;
    if (!seen.has(key)) { seen.add(key); result.push([a, b]); }
  }
  return result;
}

/** Serialize an authored draft and a caller-rendered PNG as a UVTT-shaped export. */
export function settlementDraftToUvtt(value: unknown, pngBase64: string): SettlementUvtt {
  const draft: Readonly<SettlementDraft> = parseSettlementDraft(value);
  if (typeof pngBase64 !== 'string') throw new Error('image must be base64 PNG');
  const bytes = decodeBase64(pngBase64);
  const pxWidth = u32(bytes, 16); const pxHeight = u32(bytes, 20);
  if (!pxWidth || !pxHeight || pxWidth > MAX_PNG_EDGE || pxHeight > MAX_PNG_EDGE) throw new Error('PNG dimensions out of range');
  const gridWidth = Math.ceil(draft.bounds.width / draft.gridFeet); const gridHeight = Math.ceil(draft.bounds.height / draft.gridFeet);
  const pxPerGrid = pxWidth / gridWidth;
  const expectedHeight = gridHeight * pxPerGrid;
  if (!Number.isInteger(pxPerGrid) || pxPerGrid < 9 || expectedHeight !== pxHeight) {
    throw new Error('PNG aspect ratio must match settlement bounds and pixels per grid must be an integer of at least 9 for MapTool');
  }
  const los = settlementLineOfSight(draft, true);
  // MapTool 1.18.7 decodes this field directly; a data URI prefix is invalid.
  const image = pngBase64.startsWith('data:') ? pngBase64.slice(pngBase64.indexOf(',') + 1) : pngBase64;
  return {
    format: 0.2,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: gridWidth, y: gridHeight }, pixels_per_grid: pxPerGrid },
    line_of_sight: los,
    portals: settlementDoorGeometry(draft).map(d=>({bounds:[d.a,d.b],closed:!d.open,position:{x:(d.a.x+d.b.x)/2,y:(d.a.y+d.b.y)/2}})), lights: [], environment: { baked_lighting: false, ambient_light: '#ffffff' }, image,
    metadata: { source: 'DM Cockpit authored table-rule draft', placeId: draft.placeId, seed: draft.seed, generatorVersion: draft.generatorVersion, provenance: draft.provenance },
  };
}
