/** Deterministic, original geometry for an explicitly non-canonical settlement draft (M19). */

export const SETTLEMENT_DRAFT_FORMAT = 'cockpit.settlement-draft/1' as const;
export const SETTLEMENT_GENERATOR_VERSION = 'm19-city-v4';
export const SETTLEMENT_GRID_FEET = 5 as const;

export interface DraftPoint { x: number; y: number }
export interface DraftRoom { id: string; name?: string; outline: DraftPoint[] }
export interface DraftDoor { id: string; a: DraftPoint; b: DraftPoint; open: boolean; connects: [string, string] }
export interface DraftBridge { id: string; waterFeatureId: string; a: DraftPoint; b: DraftPoint; widthFeet: number }
export interface DraftWall { id: string; points: DraftPoint[] }
export interface DraftReliefContour { id: string; elevationFeet: number; points: DraftPoint[] }
export interface DraftBuilding { id: string; name: string; outline: DraftPoint[]; rooms: DraftRoom[]; doors: DraftDoor[] }
export type ExteriorDoorSide = 'north' | 'east' | 'south' | 'west';
export type SettlementPattern = 'grid' | 'linear' | 'compact';
export type SettlementSiteFeature = 'river' | 'coast';
export interface DraftWaterFeature { id: string; kind: SettlementSiteFeature; side: ExteriorDoorSide | null; width: number; route?: DraftPoint[] }
export interface SettlementGenerationProfile {
  description: string;
  population: number | null;
  pattern: SettlementPattern;
  siteFeature?: SettlementSiteFeature | null;
  featureSide?: ExteriorDoorSide | null;
}
export interface SettlementDraft {
  format: typeof SETTLEMENT_DRAFT_FORMAT;
  generatorVersion: string;
  seed: string;
  placeId: string;
  provenance: 'table-rule';
  bounds: { width: number; height: number };
  gridFeet: 5;
  streets: DraftPoint[][];
  buildings: DraftBuilding[];
  /** Water explicitly named in the author description; this is a table-rule proposal. */
  waterFeatures?: DraftWaterFeature[];
  /** Explicitly authored plank crossings over a route-based river; visual only, no travel mechanics. */
  bridges?: DraftBridge[];
  /** Explicitly authored opaque tactical lines; these affect exported line of sight only. */
  walls?: DraftWall[];
  /** Explicitly authored elevation contours; visual annotations only, not terrain rules. */
  reliefContours?: DraftReliefContour[];
  /** Explicit inputs and the table-rule interpretation that produced this draft. */
  generationProfile?: SettlementGenerationProfile;
  landmarks?: { id: string; name: string; position: DraftPoint }[];
}

/** A room can host an exterior door only on a wall it shares with the building boundary. */
export function exteriorDoorSides(building: DraftBuilding, roomId: string): ExteriorDoorSide[] {
  const room = building.rooms.find(item => item.id === roomId);
  if (!room) return [];
  const bounds = (outline: readonly DraftPoint[]) => ({
    x0: Math.min(...outline.map(point => point.x)), x1: Math.max(...outline.map(point => point.x)),
    y0: Math.min(...outline.map(point => point.y)), y1: Math.max(...outline.map(point => point.y)),
  });
  const outer = bounds(building.outline); const inner = bounds(room.outline);
  return [
    ...(inner.y0 === outer.y0 ? ['north' as const] : []),
    ...(inner.x1 === outer.x1 ? ['east' as const] : []),
    ...(inner.y1 === outer.y1 ? ['south' as const] : []),
    ...(inner.x0 === outer.x0 ? ['west' as const] : []),
  ];
}

/** Places a standard 5 ft exterior door segment on a selected room's valid boundary wall. */
export function exteriorDoorGeometry(building: DraftBuilding, roomId: string, side: ExteriorDoorSide): { a: DraftPoint; b: DraftPoint } | null {
  const room = building.rooms.find(item => item.id === roomId);
  if (!room || !exteriorDoorSides(building, roomId).includes(side)) return null;
  const bounds = (outline: readonly DraftPoint[]) => ({
    x0: Math.min(...outline.map(point => point.x)), x1: Math.max(...outline.map(point => point.x)),
    y0: Math.min(...outline.map(point => point.y)), y1: Math.max(...outline.map(point => point.y)),
  });
  const inner = bounds(room.outline);
  const span = (length: number) => Math.min(5, Math.floor(length));
  const centeredStart = (minimum: number, maximum: number) => {
    const length = Math.floor(maximum - minimum);
    const doorLength = span(length);
    if (doorLength < 1) return null;
    return Math.max(minimum, Math.min(maximum - doorLength, Math.round(minimum + (length - doorLength) / 2)));
  };
  if (side === 'north' || side === 'south') {
    const start = centeredStart(inner.x0, inner.x1);
    if (start === null) return null;
    const y = side === 'north' ? inner.y0 : inner.y1;
    return { a: { x: start, y }, b: { x: start + span(Math.floor(inner.x1 - inner.x0)), y } };
  }
  const start = centeredStart(inner.y0, inner.y1);
  if (start === null) return null;
  const x = side === 'west' ? inner.x0 : inner.x1;
  return { a: { x, y: start }, b: { x, y: start + span(Math.floor(inner.y1 - inner.y0)) } };
}

const MAX_TEXT = 256;
const MAX_COORD = 100_000;
const MAX_BUILDINGS = 128;
const MAX_ROOMS = 1_024;
const MAX_POINTS = 20_000;
const MAX_JSON_CHARS = 2_000_000;
const MAX_WALLS = 128;
const MAX_WALL_POINTS = 256;
const MAX_WALL_SEGMENTS = 2_048;
const MAX_RELIEF_CONTOURS = 128;
const MAX_RELIEF_POINTS = 256;
const MAX_RELIEF_SEGMENTS = 4_096;

function text(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TEXT) throw new Error(`${label}: invalid string`);
}
function point(value: unknown, label: string, width: number, height: number): asserts value is DraftPoint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}: invalid point`);
  const p = value as Record<string, unknown>;
  if (typeof p.x !== 'number' || !Number.isFinite(p.x) || typeof p.y !== 'number' || !Number.isFinite(p.y)) throw new Error(`${label}: non-finite point`);
  if (p.x < 0 || p.y < 0 || p.x > width || p.y > height) throw new Error(`${label}: point outside bounds`);
}
function distanceToSegment(point: DraftPoint, a: DraftPoint, b: DraftPoint): number {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}
function segmentsIntersect(a: DraftPoint, b: DraftPoint, c: DraftPoint, d: DraftPoint): boolean {
  const cross = (p: DraftPoint, q: DraftPoint, r: DraftPoint) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const onSegment = (p: DraftPoint, q: DraftPoint, r: DraftPoint) =>
    Math.min(p.x, r.x) - 1e-7 <= q.x && q.x <= Math.max(p.x, r.x) + 1e-7 &&
    Math.min(p.y, r.y) - 1e-7 <= q.y && q.y <= Math.max(p.y, r.y) + 1e-7;
  const abC = cross(a, b, c); const abD = cross(a, b, d); const cdA = cross(c, d, a); const cdB = cross(c, d, b);
  if (Math.abs(abC) < 1e-7 && onSegment(a, c, b)) return true;
  if (Math.abs(abD) < 1e-7 && onSegment(a, d, b)) return true;
  if (Math.abs(cdA) < 1e-7 && onSegment(c, a, d)) return true;
  if (Math.abs(cdB) < 1e-7 && onSegment(c, b, d)) return true;
  const oppositeSigns = (x: number, y: number) => (x > 1e-7 && y < -1e-7) || (x < -1e-7 && y > 1e-7);
  return oppositeSigns(abC, abD) && oppositeSigns(cdA, cdB);
}
function bridgeCrossesRiver(bridge: DraftBridge, river: DraftWaterFeature): boolean {
  if (!river.route || river.route.length < 2) return false;
  const bankRadius = (river.width + 5) / 2;
  const distanceToRiver = (p: DraftPoint) => Math.min(...river.route!.slice(1).map((end, i) => distanceToSegment(p, river.route![i], end)));
  if (distanceToRiver(bridge.a) <= bankRadius || distanceToRiver(bridge.b) <= bankRadius) return false;
  return river.route.slice(1).some((end, i) => segmentsIntersect(bridge.a, bridge.b, river.route![i], end));
}
function polygon(value: unknown, label: string, width: number, height: number, count: { n: number }): asserts value is DraftPoint[] {
  if (!Array.isArray(value) || value.length < 4 || value.length > 256) throw new Error(`${label}: invalid polygon`);
  for (const [i, p] of value.entries()) { point(p, `${label}[${i}]`, width, height); count.n++; }
  if (value[0].x !== value.at(-1)!.x || value[0].y !== value.at(-1)!.y) throw new Error(`${label}: polygon must be closed`);
  const area = value.slice(0, -1).reduce((sum, p, i) => sum + p.x * value[i + 1].y - value[i + 1].x * p.y, 0);
  if (Math.abs(area) < 1) throw new Error(`${label}: zero-area polygon`);
  const xs = [...new Set(value.map(p => p.x))]; const ys = [...new Set(value.map(p => p.y))];
  const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys);
  const forward = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  const reverse = [[x0, y0], [x0, y1], [x1, y1], [x1, y0], [x0, y0]];
  const matches = (candidate: number[][]) => value.length === candidate.length && value.every((p, i) => p.x === candidate[i][0] && p.y === candidate[i][1]);
  if (xs.length !== 2 || ys.length !== 2 || (!matches(forward) && !matches(reverse))) {
    throw new Error(`${label}: only axis-aligned rectangles are supported`);
  }
}

/** Throws on malformed or unbounded snapshots; accepts only plain JSON-shaped geometry. */
export function validateSettlementDraft(value: unknown): asserts value is SettlementDraft {
  const draft = value;
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) throw new Error('draft must be an object');
  const d = draft as Record<string, unknown>;
  if (d.format !== SETTLEMENT_DRAFT_FORMAT || d.provenance !== 'table-rule') throw new Error('unsupported draft format or provenance');
  text(d.generatorVersion, 'generatorVersion'); text(d.seed, 'seed'); text(d.placeId, 'placeId');
  const b = d.bounds as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b) || typeof b.width !== 'number' || typeof b.height !== 'number' ||
      !Number.isFinite(b.width) || !Number.isFinite(b.height) || b.width <= 0 || b.height <= 0 || b.width > MAX_COORD || b.height > MAX_COORD) {
    throw new Error('invalid bounds');
  }
  const width = b.width; const height = b.height;
  if (d.gridFeet !== SETTLEMENT_GRID_FEET) throw new Error('gridFeet must be 5');
  if (d.generationProfile !== undefined) {
    const profile = d.generationProfile as Record<string, unknown> | null;
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('invalid generation profile');
    if (typeof profile.description !== 'string' || profile.description.length > 2_000) throw new Error('invalid settlement description');
    if (profile.population !== null && (!Number.isSafeInteger(profile.population) || Number(profile.population) < 0 || Number(profile.population) > 1_000_000_000_000)) throw new Error('invalid settlement population');
    if (!['grid', 'linear', 'compact'].includes(String(profile.pattern))) throw new Error('invalid settlement pattern');
    if (profile.siteFeature !== undefined && profile.siteFeature !== null && !['river', 'coast'].includes(String(profile.siteFeature))) throw new Error('invalid generation site feature');
    if (profile.featureSide !== undefined && profile.featureSide !== null && !['north', 'east', 'south', 'west'].includes(String(profile.featureSide))) throw new Error('invalid generation feature side');
  }
  if (!Array.isArray(d.streets) || d.streets.length < 1 || d.streets.length > 256) throw new Error('invalid streets');
  if (!Array.isArray(d.buildings) || d.buildings.length < 1 || d.buildings.length > MAX_BUILDINGS) throw new Error('invalid buildings');
  const count = { n: 0 }; let rooms = 0;
  for (const [i, street] of d.streets.entries()) {
    if (!Array.isArray(street) || street.length < 2 || street.length > 256) throw new Error(`streets[${i}]: invalid polyline`);
    for (const [j, p] of street.entries()) { point(p, `streets[${i}][${j}]`, width, height); count.n++; }
  }
  const ids = new Set<string>();
  const buildingRects: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (const [i, item] of d.buildings.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`buildings[${i}]: invalid building`);
    const building = item as Record<string, unknown>;
    text(building.id, `buildings[${i}].id`); text(building.name, `buildings[${i}].name`);
    if (ids.has(building.id)) throw new Error('duplicate building id'); ids.add(building.id);
    polygon(building.outline, `buildings[${i}].outline`, width, height, count);
    const outer = building.outline as DraftPoint[];
    buildingRects.push({
      x0: Math.min(...outer.map(p => p.x)), y0: Math.min(...outer.map(p => p.y)),
      x1: Math.max(...outer.map(p => p.x)), y1: Math.max(...outer.map(p => p.y)),
    });
    if (!Array.isArray(building.rooms) || building.rooms.length < 1 || building.rooms.length > 64) throw new Error(`buildings[${i}]: invalid rooms`);
    if (!Array.isArray(building.doors) || building.doors.length < 2 || building.doors.length > 128) throw new Error(`buildings[${i}]: invalid doors`);
    const roomIds = new Set<string>();
    const roomRects: { id: string; x0: number; y0: number; x1: number; y1: number }[] = [];
    for (const [j, room] of building.rooms.entries()) {
      if (!room || typeof room !== 'object' || Array.isArray(room)) throw new Error(`rooms[${j}]: invalid room`);
      const r = room as Record<string, unknown>; text(r.id, `rooms[${j}].id`);
      if (r.name !== undefined) text(r.name, `rooms[${j}].name`);
      if (roomIds.has(r.id)) throw new Error('duplicate room id'); roomIds.add(r.id);
      polygon(r.outline, `rooms[${j}].outline`, width, height, count); rooms++;
      const inner = r.outline as DraftPoint[];
      const bounds = { x0: Math.min(...inner.map(p => p.x)), y0: Math.min(...inner.map(p => p.y)), x1: Math.max(...inner.map(p => p.x)), y1: Math.max(...inner.map(p => p.y)) };
      const parent = buildingRects[i];
      if (bounds.x0 < parent.x0 || bounds.y0 < parent.y0 || bounds.x1 > parent.x1 || bounds.y1 > parent.y1) throw new Error(`rooms[${j}]: outside building`);
      roomRects.push({ id: r.id, ...bounds });
    }
    for (let a = 0; a < roomRects.length; a++) for (let c = a + 1; c < roomRects.length; c++) {
      const xOverlap = Math.min(roomRects[a].x1, roomRects[c].x1) - Math.max(roomRects[a].x0, roomRects[c].x0);
      const yOverlap = Math.min(roomRects[a].y1, roomRects[c].y1) - Math.max(roomRects[a].y0, roomRects[c].y0);
      if (xOverlap > 0 && yOverlap > 0) throw new Error('overlapping rooms');
    }
    const roomArea = roomRects.reduce((sum, r) => sum + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
    if (roomArea !== (buildingRects[i].x1 - buildingRects[i].x0) * (buildingRects[i].y1 - buildingRects[i].y0)) throw new Error('rooms must cover building interior');
    const outerRect = buildingRects[i];
    const doorIds = new Set<string>(); const graph = new Map(roomRects.map(r => [r.id, new Set<string>()]));
    let exteriorDoors = 0;
    for (const [j, door] of building.doors.entries()) {
      if (!door || typeof door !== 'object' || Array.isArray(door)) throw new Error(`doors[${j}]: invalid door`);
      const doorRecord = door as Record<string, unknown>; text(doorRecord.id, `doors[${j}].id`);
      if (doorIds.has(doorRecord.id)) throw new Error('duplicate door id'); doorIds.add(doorRecord.id);
      if (typeof doorRecord.open !== 'boolean' || !Array.isArray(doorRecord.connects) || doorRecord.connects.length !== 2) throw new Error(`doors[${j}]: invalid state or connections`);
      const a = doorRecord.a as DraftPoint; const c = doorRecord.b as DraftPoint;
      point(a, `doors[${j}].a`, width, height); point(c, `doors[${j}].b`, width, height); count.n += 2;
      if ((a.x === c.x) === (a.y === c.y)) throw new Error(`doors[${j}]: door must be a non-zero axis-aligned segment`);
      const connection = doorRecord.connects as unknown[];
      for (const end of connection) if (typeof end !== 'string' || (end !== 'outside' && !roomIds.has(end))) throw new Error(`doors[${j}]: unknown room connection`);
      if (connection[0] === connection[1]) throw new Error(`doors[${j}]: connections must join distinct rooms or a room and outside`);
      const onEdge = (r: { x0: number; y0: number; x1: number; y1: number }, p: DraftPoint, q: DraftPoint) =>
        (p.x === q.x && (p.x === r.x0 || p.x === r.x1) && Math.min(p.y, q.y) >= r.y0 && Math.max(p.y, q.y) <= r.y1) ||
        (p.y === q.y && (p.y === r.y0 || p.y === r.y1) && Math.min(p.x, q.x) >= r.x0 && Math.max(p.x, q.x) <= r.x1);
      const [one, two] = connection as [string, string];
      if (one === 'outside' || two === 'outside') {
        exteriorDoors++;
        const roomId = one === 'outside' ? two : one; const room = roomRects.find(r => r.id === roomId)!;
        if (!onEdge(outerRect, a, c) || !onEdge(room, a, c)) throw new Error(`doors[${j}]: exterior door must join room to building boundary`);
      } else {
        const ra = roomRects.find(r => r.id === one)!; const rb = roomRects.find(r => r.id === two)!;
        if (!onEdge(ra, a, c) || !onEdge(rb, a, c)) throw new Error(`doors[${j}]: internal door must join adjacent rooms`);
        graph.get(one)!.add(two); graph.get(two)!.add(one);
      }
    }
    if (exteriorDoors < 1) throw new Error('each building must have at least one exterior door');
    const visited = new Set<string>(); const queue = [roomRects[0].id];
    while (queue.length) { const id = queue.shift()!; if (visited.has(id)) continue; visited.add(id); queue.push(...graph.get(id)!); }
    if (visited.size !== roomRects.length) throw new Error('room doors must form a connected graph');
  }
  for (let i = 0; i < buildingRects.length; i++) for (let j = i + 1; j < buildingRects.length; j++) {
    const a = buildingRects[i]; const c = buildingRects[j];
    if (a.x0 < c.x1 && c.x0 < a.x1 && a.y0 < c.y1 && c.y0 < a.y1) throw new Error('overlapping buildings');
  }
  if (rooms > MAX_ROOMS || count.n > MAX_POINTS) throw new Error('draft geometry exceeds limits');
  if (d.landmarks !== undefined) {
    if (!Array.isArray(d.landmarks) || d.landmarks.length > 128) throw new Error('invalid landmarks');
    for (const [i, lm] of d.landmarks.entries()) {
      if (!lm || typeof lm !== 'object' || Array.isArray(lm)) throw new Error(`landmarks[${i}]: invalid landmark`);
      const l = lm as Record<string, unknown>; text(l.id, `landmarks[${i}].id`); text(l.name, `landmarks[${i}].name`);
      point(l.position, `landmarks[${i}].position`, width, height); count.n++;
    }
  }
  if (d.waterFeatures !== undefined) {
    if (!Array.isArray(d.waterFeatures) || d.waterFeatures.length > 8) throw new Error('invalid water features');
    const featureIds = new Set<string>();
    for (const [i, value] of d.waterFeatures.entries()) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`waterFeatures[${i}]: invalid feature`);
      const feature = value as Record<string, unknown>; text(feature.id, `waterFeatures[${i}].id`);
      if (featureIds.has(feature.id)) throw new Error('duplicate water feature id'); featureIds.add(feature.id);
      if (!['river', 'coast'].includes(String(feature.kind)) ||
          (feature.side !== null && !['north', 'east', 'south', 'west'].includes(String(feature.side)))) throw new Error(`waterFeatures[${i}]: invalid kind or side`);
      if (typeof feature.width !== 'number' || !Number.isFinite(feature.width) || feature.width < 5 || feature.width > Math.min(width, height)) throw new Error(`waterFeatures[${i}]: invalid width`);
      if (feature.route !== undefined) {
        if (feature.kind !== 'river' || feature.side !== null || !Array.isArray(feature.route) || feature.route.length < 2 || feature.route.length > 32) throw new Error(`waterFeatures[${i}]: invalid route`);
        for (const [j, p] of feature.route.entries()) { point(p, `waterFeatures[${i}].route[${j}]`, width, height); count.n++; }
      } else if (feature.side === null) throw new Error(`waterFeatures[${i}]: route or side is required`);
    }
  }
  if (d.bridges !== undefined) {
    if (!Array.isArray(d.bridges) || d.bridges.length > 128) throw new Error('invalid bridges');
    const bridgeIds = new Set<string>();
    const waterFeatures = (d.waterFeatures ?? []) as DraftWaterFeature[];
    for (const [i, value] of d.bridges.entries()) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`bridges[${i}]: invalid bridge`);
      const bridge = value as Record<string, unknown>;
      text(bridge.id, `bridges[${i}].id`); text(bridge.waterFeatureId, `bridges[${i}].waterFeatureId`);
      if (bridgeIds.has(bridge.id)) throw new Error('duplicate bridge id'); bridgeIds.add(bridge.id);
      const river = waterFeatures.find(feature => feature.id === bridge.waterFeatureId && feature.kind === 'river' && feature.route);
      if (!river) throw new Error(`bridges[${i}]: bridge must reference a route-based river`);
      point(bridge.a, `bridges[${i}].a`, width, height); point(bridge.b, `bridges[${i}].b`, width, height); count.n += 2;
      if (bridge.a.x === bridge.b.x && bridge.a.y === bridge.b.y) throw new Error(`bridges[${i}]: crossing must have non-zero length`);
      if (typeof bridge.widthFeet !== 'number' || !Number.isFinite(bridge.widthFeet) || bridge.widthFeet < 5 || bridge.widthFeet > Math.min(width, height)) throw new Error(`bridges[${i}]: invalid deck width`);
      if (!bridgeCrossesRiver(bridge as unknown as DraftBridge, river)) throw new Error(`bridges[${i}]: crossing must pass through the selected river and end outside its banks`);
    }
  }
  if (d.walls !== undefined) {
    if (!Array.isArray(d.walls) || d.walls.length > MAX_WALLS) throw new Error('invalid walls');
    const wallIds = new Set<string>(); let wallSegments = 0;
    for (const [i, value] of d.walls.entries()) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`walls[${i}]: invalid wall`);
      const wall = value as Record<string, unknown>; text(wall.id, `walls[${i}].id`);
      if (wallIds.has(wall.id)) throw new Error('duplicate wall id'); wallIds.add(wall.id);
      if (!Array.isArray(wall.points) || wall.points.length < 2 || wall.points.length > MAX_WALL_POINTS) throw new Error(`walls[${i}]: invalid polyline`);
      for (const [j, valuePoint] of wall.points.entries()) {
        point(valuePoint, `walls[${i}].points[${j}]`, width, height); count.n++;
        if (j === 0) continue;
        const previous = wall.points[j - 1] as DraftPoint; const current = valuePoint as DraftPoint;
        if (previous.x === current.x && previous.y === current.y) throw new Error(`walls[${i}]: segments must have non-zero length`);
        wallSegments++;
        if (wallSegments > MAX_WALL_SEGMENTS) throw new Error('wall segment limit exceeded');
      }
    }
  }
  if (d.reliefContours !== undefined) {
    if (!Array.isArray(d.reliefContours) || d.reliefContours.length > MAX_RELIEF_CONTOURS) throw new Error('invalid relief contours');
    const contourIds = new Set<string>(); let contourSegments = 0;
    for (const [i, value] of d.reliefContours.entries()) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`reliefContours[${i}]: invalid contour`);
      const contour = value as Record<string, unknown>; text(contour.id, `reliefContours[${i}].id`);
      if (contourIds.has(contour.id)) throw new Error('duplicate relief contour id'); contourIds.add(contour.id);
      if (!Number.isSafeInteger(contour.elevationFeet) || Number(contour.elevationFeet) < -100_000 || Number(contour.elevationFeet) > 100_000) throw new Error(`reliefContours[${i}]: elevation must be a whole number of feet between -100000 and 100000`);
      if (!Array.isArray(contour.points) || contour.points.length < 2 || contour.points.length > MAX_RELIEF_POINTS) throw new Error(`reliefContours[${i}]: invalid polyline`);
      for (const [j, valuePoint] of contour.points.entries()) {
        point(valuePoint, `reliefContours[${i}].points[${j}]`, width, height); count.n++;
        if (j === 0) continue;
        const previous = contour.points[j - 1] as DraftPoint; const current = valuePoint as DraftPoint;
        if (previous.x === current.x && previous.y === current.y) throw new Error(`reliefContours[${i}]: segments must have non-zero length`);
        contourSegments++;
        if (contourSegments > MAX_RELIEF_SEGMENTS) throw new Error('relief contour segment limit exceeded');
      }
    }
  }
  if (count.n > MAX_POINTS) throw new Error('draft geometry exceeds point limit');
  try { if (JSON.stringify(draft).length > MAX_JSON_CHARS) throw new Error('draft exceeds size limit'); }
  catch (error) { if (error instanceof Error && error.message.includes('size limit')) throw error; throw new Error('draft is not JSON serializable'); }
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  }
  return value;
}

/** Parse and freeze a JSON snapshot so a displayed draft cannot mutate its source geometry. */
export function parseSettlementDraft(value: unknown): Readonly<SettlementDraft> {
  let parsed = value;
  if (typeof value === 'string') {
    if (value.length > MAX_JSON_CHARS) throw new Error('draft exceeds size limit');
    try { parsed = JSON.parse(value); } catch { throw new Error('draft is not valid JSON'); }
  }
  validateSettlementDraft(parsed);
  return freezeDeep(parsed as SettlementDraft);
}

/** Collision-safe seed material for a setting/map/place and generator version. */
export function settlementSeedKey(settingId: string, mapId: string, placeId: string, version = SETTLEMENT_GENERATOR_VERSION): string {
  for (const [label, value] of [['settingId', settingId], ['mapId', mapId], ['placeId', placeId], ['version', version]] as const) text(value, label);
  if (version !== SETTLEMENT_GENERATOR_VERSION) throw new Error(`unsupported settlement generator version: ${version}`);
  return `m19|${[settingId, mapId, placeId, version].map(part => `${part.length}:${part}`).join('|')}`;
}

function seedHash(textValue: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < textValue.length; i++) h = Math.imul(h ^ textValue.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
function random(seed: string): () => number {
  let state = seedHash(seed) || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}
const closedRect = (x0: number, y0: number, x1: number, y1: number): DraftPoint[] => [
  { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 },
];
interface Rect { x0: number; y0: number; x1: number; y1: number }
interface SplitLine { axis: 'x' | 'y'; value: number; start: number; end: number }
function splitRooms(rect: Rect, next: () => number, target: number): { leaves: Rect[]; cuts: SplitLine[] } {
  if (target <= 1) return { leaves: [rect], cuts: [] };
  const w = rect.x1 - rect.x0; const h = rect.y1 - rect.y0;
  const canSplitX = w >= 50; const canSplitY = h >= 50;
  if (!canSplitX && !canSplitY) return { leaves: [rect], cuts: [] };
  const vertical = canSplitX && (!canSplitY || w > h || (w === h && next() < 0.5));
  const span = vertical ? w : h;
  const fraction = 0.4 + next() * 0.2;
  const cut = Math.round((vertical ? rect.x0 : rect.y0) + span * fraction);
  const leftTarget = Math.floor(target / 2); const rightTarget = target - leftTarget;
  let first: { leaves: Rect[]; cuts: SplitLine[] }; let second: { leaves: Rect[]; cuts: SplitLine[] };
  if (vertical) {
    first = splitRooms({ ...rect, x1: cut }, next, leftTarget);
    second = splitRooms({ ...rect, x0: cut }, next, rightTarget);
  } else {
    first = splitRooms({ ...rect, y1: cut }, next, leftTarget);
    second = splitRooms({ ...rect, y0: cut }, next, rightTarget);
  }
  const line: SplitLine = vertical ? { axis: 'x', value: cut, start: rect.y0, end: rect.y1 } : { axis: 'y', value: cut, start: rect.x0, end: rect.x1 };
  return { leaves: [...first.leaves, ...second.leaves], cuts: [line, ...first.cuts, ...second.cuts] };
}

export interface GenerateSettlementDraftInput {
  placeId: string;
  seed: string;
  version?: string;
  description?: string;
  population?: number | null;
  pattern?: 'auto' | SettlementPattern;
}

const normalizeDescription = (description: string) => description.toLocaleLowerCase('ru').replace(/ё/g, 'е');

/** Explicit, bounded prose cues; unsupported prose remains attached without being guessed. */
export function inferSettlementPattern(description: string): SettlementPattern {
  const text = normalizeDescription(description);
  const clauses = text.split(/[.!?;,:]+/u);
  const hasLinearClause = clauses.some(clause => {
    const linearCue = /(?:^|[^\p{L}\p{N}_])линейн(?:ый|ая|ое|ые|ого|ой|ому|ым|ыми|ых|о)?(?=$|[^\p{L}\p{N}_])/u.test(clause);
    const roadCue = /(?:^|[^\p{L}\p{N}_])(?:дорога|дороги|дорогу|дороге|дорог|дорогам|дорогами|дорогах|тракт|тракта|тракту|трактом|тракте|трактов|трактам|трактами|трактах)(?=$|[^\p{L}\p{N}_])/u.test(clause);
    const roadNegation = ['без дороги', 'без дорог', 'нет дороги', 'нет дорог', 'дороги нет', 'дорог нет', 'не дорога', 'не дороги', 'no road', 'no roads', 'without a road', 'without roads', 'without road'].some(cue => clause.includes(cue));
    const linearNegation = ['не вдоль', 'не линейный', 'не линейная', 'не линейное', 'not along', 'not linear', 'not roadside'].some(cue => clause.includes(cue));
    return !linearNegation && (clause.includes('вдоль') || linearCue || clause.includes('протяжен') || (!roadNegation && roadCue) || /\b(?:linear|along|roadside)\b/.test(clause));
  });
  if (hasLinearClause) return 'linear';
  const hasCompactClause = clauses.some(clause => !['не компакт', 'не плотн', 'not compact', 'not dense'].some(cue => clause.includes(cue))
    && ['компакт', 'плотн', 'сгруппирован', 'compact', 'dense'].some(word => clause.includes(word)));
  if (hasCompactClause) return 'compact';
  return 'grid';
}

export function inferSettlementSiteFeature(description: string): SettlementSiteFeature | null {
  const text = normalizeDescription(description);
  const clauses = text.split(/[.!?;,:]+|\b(?:but|however)\b|(?:^|\s)(?:но|однако|а)(?=\s|$)/u).map(clause => clause.trim()).filter(Boolean);
  const negatedRiverCues = [
    'не у реки', 'не на реке', 'не рядом с рекой', 'не речной', 'без реки', 'нет реки', 'реки нет', 'нет рек', 'рек нет',
    'вдали от реки', 'далеко от реки', 'вдали от рек', 'далеко от рек',
    'not by the river', 'not on the river', 'not near the river', 'not a river town', 'without a river', 'no river', 'far from the river', 'away from the river',
    'not riverside', 'not a riverside town', 'not a riverside settlement',
  ];
  const negatedCoastCues = [
    'без побережья', 'не на побережье', 'не у побережья', 'не морской', 'не морская', 'не морское', 'не морские', 'не у моря', 'не на море', 'нет побережья', 'побережья нет', 'нет моря', 'моря нет',
    'not by the coast', 'not on the coast', 'not on coast', 'not at the coast', 'not near the coast', 'without a coast', 'no coast', 'not coastal', 'not a coastal town', 'not a coastal settlement', 'far from the coast', 'away from the coast',
    'not a harbor', 'not a harbour', 'not harbor', 'not harbour', 'not by the harbor', 'not by the harbour', 'no harbor', 'no harbour', 'without a harbor', 'without a harbour',
  ];
  const positiveRiverOverrides = ['не далеко от реки', 'не далеко от рек', 'не без реки', 'не без рек', 'not far from the river', 'not far from river', 'not without a river', 'not without river'];
  const hasRiver = clauses.some(clause => positiveRiverOverrides.some(cue => clause.includes(cue))
    || (!negatedRiverCues.some(cue => clause.includes(cue))
      && (/(?:^|[^\p{L}\p{N}_])(?:река|реки|рекой|реке|реках|речн(?:ый|ая|ое|ые|ого|ой|ому|ым|ыми|ых))(?=$|[^\p{L}\p{N}_])/u.test(clause)
        || /\b(?:river|rivers|riverside)\b/.test(clause)
        || inferSettlementRiverRoute(clause))));
  if (hasRiver) return 'river';
  const hasCoast = clauses.some(clause => {
    const positiveCoastOverride = ['не далеко от побережья', 'не далеко от моря', 'не без побережья', 'не без моря', 'not far from the coast', 'not far from coast', 'not without a coast', 'not without coast'].some(cue => clause.includes(cue));
    const negatedPort = ['не порт', 'без порта', 'нет порта', 'порта нет', 'not a port', 'no port', 'without a port'].some(cue => clause.includes(cue));
    const portCue = (/(?:^|[^\p{L}\p{N}_])порт(?:а|у|ом|е|ы|ов|ам|ами|ах)?(?=$|[^\p{L}\p{N}_])|(?:^|[^\p{L}\p{N}_])портов(?:ый|ая|ое|ые|ого|ой|ому|ым|ыми|ых)(?=$|[^\p{L}\p{N}_])/u.test(clause)
      || /\bports?\b/.test(clause)) && !negatedPort;
    const englishCoastCue = /\b(?:coast|coasts|coastal|coastline|coastlines|harbou?r|harbou?rs)\b/.test(clause);
    const coastCue = ['побереж', 'у моря', 'на море', 'морской'].some(word => clause.includes(word)) || englishCoastCue;
    return portCue || positiveCoastOverride || (!negatedCoastCues.some(cue => clause.includes(cue)) && coastCue);
  });
  if (hasCoast) return 'coast';
  return null;
}

/** Only an explicit through-town cue creates an interior river channel. */
export function inferSettlementRiverRoute(description: string): boolean {
  const text = normalizeDescription(description);
  const clauses = text.split(/[.!?;,:]+|\b(?:but|however)\b|(?:^|\s)(?:но|однако|а)(?=\s|$)/u);
  const russianRoute = /(?:^|[^\p{L}\p{N}_])(?:река|речка|ручей)(?:\s+[\p{L}-]+){0,2}\s+(?:(?:протекает|протекать|проходит|проходить|течет|течь|идет|идти)\s+(?:через|сквозь)\s+(?:город|поселени\p{L}*)|пересекает\s+(?:город|поселени\p{L}*))(?=$|[^\p{L}\p{N}_])|(?:^|[^\p{L}\p{N}_])(?:через|сквозь)\s+(?:город|поселени\p{L}*)\s+(?:протекает|проходит|течет|идет)\s+(?:река|речка|ручей)(?=$|[^\p{L}\p{N}_])/u;
  const englishRoute = /\b(?:the\s+)?(?:river|stream)\s+(?:(?:[\p{L}-]+)\s+){0,2}(?:flows?|runs?|passes?)\s+(?:through|across)\s+(?:the\s+)?(?:town|settlement)\b(?!(?:['’]s)?\s+(?:boundary|edge|border|limits?|line)\b)|\b(?:the\s+)?(?:river|stream)\s+(?:[\p{L}-]+\s+){0,2}crosses\s+(?:the\s+)?(?:town|settlement)\b(?!(?:['’]s)?\s+(?:boundary|edge|border|limits?|line)\b)|\b(?:through|across)\s+(?:the\s+)?(?:town|settlement)\s+(?:flows?|runs?|passes?)\s+(?:the\s+)?(?:river|stream)\b/iu;
  const negatedRussianRoute = /(?:^|[^\p{L}])не\s+(?:(?:будет|будут|будем|будете|должна|должен|должны|должно|может|мог|могла|могло|могли|сможет|смогут|сможем|сможете|смог|смогла|смогло|смогли)\s+)?(?:протекает|протекать|пересекает|пересекать|проходит|проходить|течет|течёт|течь|идет|идёт)(?=$|[^\p{L}])|(?:может|мог|могла|могло|могли|должна|должен|должны|будет|будут|сможет|смогут|сможем|сможете|смог|смогла|смогло|смогли)\s+не\s+(?:протекать|пересекать|проходить|течь|идти)\s+(?:через|сквозь)\s+(?:город|поселени)|(?:протекает|протекать|пересекает|пересекать|проходит|проходить|течет|течёт|течь|идет|идти)\s+не\s+(?:через|сквозь)\s+(?:город|поселени)/u;
  const negatedEnglishRoute = /\b(?:(?:may|might|can|could|should|will|would|must|shall|does|do|did)\s+not|cannot|can't|couldn't|won't|wouldn't|mustn't|shan't|doesn't|don't|didn't|never)\s+(?:flow|flows|run|runs|cross|crosses|pass|passes)\b|\b(?:is not|isn't)\s+(?:flowing|running)\b/iu;
  const uncertainRussianRoute = /\b(?:может|мог|могла|могло|могли)\s+(?:протекать|пересекать|проходить|течь|идти)\b/u;
  const uncertainEnglishRoute = /\b(?:may|might|can|could)\s+(?:flow|flows|run|runs|cross|crosses|pass|passes)\b|\b(?:maybe|perhaps|possibly)\b/iu;
  return clauses.some(clause =>
    (russianRoute.test(clause) && !negatedRussianRoute.test(clause) && !uncertainRussianRoute.test(clause))
    || (englishRoute.test(clause) && !negatedEnglishRoute.test(clause) && !uncertainEnglishRoute.test(clause)));
}

export function inferSettlementFeatureSide(description: string, feature: SettlementSiteFeature): ExteriorDoorSide {
  const clauses = normalizeDescription(description)
    .split(/[.!?;,:]+|\b(?:but|however)\b|(?:^|\s)(?:но|однако|а)(?=\s|$)/u)
    .map(clause => clause.trim())
    .filter(Boolean)
    .filter(clause => inferSettlementSiteFeature(clause) === feature);
  const hasCue = (cues: readonly RegExp[]) => clauses.some(clause => cues.some(cue => cue.test(clause)));
  const mapWords = '(?:карт(?:а|ы|е|у|ой)|план(?:а|е|у|ом)|схем(?:а|ы|е|у|ой))';
  const mapEdge = (direction: 'top' | 'right' | 'bottom' | 'left') => {
    const russian = direction === 'top'
      ? new RegExp(`(?:^|[^\\p{L}\\p{N}_])верх\\s+(?:(?:кра\\p{L}*|сторон\\p{L}*|част\\p{L}*|границ\\p{L}*)\\s+)?(?:(?:на|у|по|с)\\s+)?${mapWords}(?=$|[^\\p{L}\\p{N}_])|(?:^|[^\\p{L}\\p{N}_])верхн\\p{L}*\\s+(?:кра\\p{L}*|сторон\\p{L}*|част\\p{L}*|границ\\p{L}*)\\s+(?:(?:на|у|по|с)\\s+)?${mapWords}(?=$|[^\\p{L}\\p{N}_])|(?:^|[^\\p{L}\\p{N}_])(?:сверху|наверху|вверху)\\s+(?:(?:на|по)\\s+)?${mapWords}(?=$|[^\\p{L}\\p{N}_])|(?:^|[^\\p{L}\\p{N}_])${mapWords}\\s+(?:сверху|наверху|вверху)(?=$|[^\\p{L}\\p{N}_])`, 'u')
      : direction === 'bottom'
        ? new RegExp(`(?:^|[^\\p{L}\\p{N}_])низ\\s+(?:(?:кра\\p{L}*|сторон\\p{L}*|част\\p{L}*|границ\\p{L}*)\\s+)?(?:(?:на|у|по|с)\\s+)?${mapWords}(?=$|[^\\p{L}\\p{N}_])|(?:^|[^\\p{L}\\p{N}_])нижн\\p{L}*\\s+(?:кра\\p{L}*|сторон\\p{L}*|част\\p{L}*|границ\\p{L}*)\\s+(?:(?:на|у|по|с)\\s+)?${mapWords}(?=$|[^\\p{L}\\p{N}_])|(?:^|[^\\p{L}\\p{N}_])(?:снизу|внизу)\\s+(?:(?:на|по)\\s+)?${mapWords}(?=$|[^\\p{L}\\p{N}_])|(?:^|[^\\p{L}\\p{N}_])${mapWords}\\s+(?:снизу|внизу)(?=$|[^\\p{L}\\p{N}_])`, 'u')
        : direction === 'right'
          ? new RegExp(`(?:^|[^\\p{L}\\p{N}_])прав\\p{L}*\\s+(?:кра\\p{L}*|сторон\\p{L}*)\\s+(?:(?:на|у|по|с)\\s+)?${mapWords}(?=$|[^\\p{L}\\p{N}_])|(?:^|[^\\p{L}\\p{N}_])справа\\s+(?:на|по)\\s+${mapWords}(?=$|[^\\p{L}\\p{N}_])|(?:^|[^\\p{L}\\p{N}_])${mapWords}\\s+справа(?=$|[^\\p{L}\\p{N}_])`, 'u')
          : new RegExp(`(?:^|[^\\p{L}\\p{N}_])лев\\p{L}*\\s+(?:кра\\p{L}*|сторон\\p{L}*)\\s+(?:(?:на|у|по|с)\\s+)?${mapWords}(?=$|[^\\p{L}\\p{N}_])|(?:^|[^\\p{L}\\p{N}_])слева\\s+(?:на|по)\\s+${mapWords}(?=$|[^\\p{L}\\p{N}_])|(?:^|[^\\p{L}\\p{N}_])${mapWords}\\s+слева(?=$|[^\\p{L}\\p{N}_])`, 'u');
    const english = direction === 'top'
      ? /\b(?:(?:(?:on|at)\s+)?the\s+)?(?:top|upper)\s+(?:(?:edge|side|part)\s+of\s+|of\s+)(?:the\s+)?(?:map|plan|diagram)\b/iu
      : direction === 'right'
        ? /\b(?:(?:(?:on|at)\s+)?the\s+)?(?:right|right-hand)\s+(?:(?:edge|side|part)\s+of\s+|of\s+)(?:the\s+)?(?:map|plan|diagram)\b/iu
        : direction === 'bottom'
          ? /\b(?:(?:(?:on|at)\s+)?the\s+)?(?:bottom|lower)\s+(?:(?:edge|side|part)\s+of\s+|of\s+)(?:the\s+)?(?:map|plan|diagram)\b/iu
          : /\b(?:(?:(?:on|at)\s+)?the\s+)?(?:left|left-hand)\s+(?:(?:edge|side|part)\s+of\s+|of\s+)(?:the\s+)?(?:map|plan|diagram)\b/iu;
    return [russian, english];
  };
  const sideCues: Record<ExteriorDoorSide, readonly RegExp[]> = {
    north: [/(?:^|[^\p{L}\p{N}_])(?:север(?:а|у|ом|е|ный|ная|ное|ные|ного|ной|ному|ным|ными|ных)?|north(?:ern)?)(?=$|[^\p{L}\p{N}_])/u, ...mapEdge('top')],
    east: [/(?:^|[^\p{L}\p{N}_])(?:восток(?:а|у|ом|е|и|ов|ам|ами|ах)?|восточн(?:ый|ая|ое|ые|ого|ой|ому|ым|ыми|ых)|east(?:ern)?)(?=$|[^\p{L}\p{N}_])/u, ...mapEdge('right')],
    south: [/(?:^|[^\p{L}\p{N}_])(?:юг(?:а|у|ом|е)?|южн(?:ый|ая|ое|ые|ого|ой|ому|ым|ыми|ых)|south(?:ern)?)(?=$|[^\p{L}\p{N}_])/u, ...mapEdge('bottom')],
    west: [/(?:^|[^\p{L}\p{N}_])(?:запад(?:а|у|ом|е|ы|ов|ам|ами|ах)?|западн(?:ый|ая|ое|ые|ого|ой|ому|ым|ыми|ых)|west(?:ern)?)(?=$|[^\p{L}\p{N}_])/u, ...mapEdge('left')],
  };
  if (hasCue(sideCues.north)) return 'north';
  if (hasCue(sideCues.east)) return 'east';
  if (hasCue(sideCues.south)) return 'south';
  if (hasCue(sideCues.west)) return 'west';
  return feature === 'river' ? 'east' : 'south';
}

/** Generate only original, explicitly non-canonical layout geometry. */
export function generateSettlementDraft({ placeId, seed, version = SETTLEMENT_GENERATOR_VERSION, description = '', population = null, pattern = 'auto' }: GenerateSettlementDraftInput): Readonly<SettlementDraft> {
  text(placeId, 'placeId'); text(seed, 'seed'); text(version, 'version');
  if (version !== SETTLEMENT_GENERATOR_VERSION) throw new Error(`unsupported settlement generator version: ${version}`);
  if (description.length > 2_000) throw new Error('settlement description is too long');
  if (population !== null && (!Number.isSafeInteger(population) || population < 0 || population > 1_000_000_000_000)) throw new Error('settlement population must be a non-negative safe integer');
  const resolvedPattern = pattern === 'auto' ? inferSettlementPattern(description) : pattern;
  if (!['grid', 'linear', 'compact'].includes(resolvedPattern)) throw new Error('unsupported settlement pattern');
  const siteFeature = inferSettlementSiteFeature(description);
  const riverRoute = siteFeature === 'river' && inferSettlementRiverRoute(description);
  const featureSide = siteFeature && !riverRoute ? inferSettlementFeatureSide(description, siteFeature) : null;
  const profile: SettlementGenerationProfile = { description, population, pattern: resolvedPattern, siteFeature, featureSide };
  const next = random(`${version}|${placeId}|${seed}|${JSON.stringify(profile)}`);
  // Population selects a visible scale band, not a claim about canonical density or building counts.
  const scale = population === null ? 'default' : population < 1_000 ? 'small' : population < 10_000 ? 'medium' : 'large';
  const cols = resolvedPattern === 'linear' ? 2 : resolvedPattern === 'compact' ? (scale === 'small' ? 3 : 4) : scale === 'small' ? 3 : scale === 'medium' ? 4 : 5;
  const rowRange = resolvedPattern === 'linear'
    ? scale === 'small' ? [5, 7] : scale === 'medium' ? [7, 9] : scale === 'large' ? [9, 12] : [7, 9]
    : resolvedPattern === 'compact'
      ? scale === 'small' ? [3, 4] : scale === 'medium' ? [4, 5] : scale === 'large' ? [5, 7] : [4, 6]
      : scale === 'small' ? [3, 4] : scale === 'medium' ? [4, 5] : scale === 'large' ? [5, 6] : [5, 6];
  const rows = rowRange[0] + Math.floor(next() * (rowRange[1] - rowRange[0] + 1)) + (riverRoute ? 1 : 0);
  const block = resolvedPattern === 'compact' ? 135 : 150;
  const street = resolvedPattern === 'compact' ? 25 : resolvedPattern === 'linear' ? 30 : 40;
  const margin = siteFeature ? 80 : 30;
  const width = margin * 2 + cols * block + (cols - 1) * street;
  const height = margin * 2 + rows * block + (rows - 1) * street;
  const channel = riverRoute ? [
    { x: 0, y: height * .48 },
    { x: width * .32, y: height * (.48 + (next() - .5) * .1) },
    { x: width * .68, y: height * (.48 + (next() - .5) * .1) },
    { x: width, y: height * .48 },
  ] : undefined;
  const channelYAt = (x: number) => {
    if (!channel) return Number.NaN;
    for (let i = 1; i < channel.length; i++) {
      const start = channel[i - 1]; const end = channel[i];
      if (x <= end.x || i === channel.length - 1) {
        const ratio = end.x === start.x ? 0 : Math.max(0, Math.min(1, (x - start.x) / (end.x - start.x)));
        return start.y + (end.y - start.y) * ratio;
      }
    }
    return channel.at(-1)!.y;
  };
  const channelClearance = 60;
  const cells = Array.from({ length: cols * rows }, (_, i) => i).filter(cell => {
    if (!channel) return true;
    const col = cell % cols; const row = Math.floor(cell / cols);
    const x0 = margin + col * (block + street); const x1 = x0 + block;
    const y0 = margin + row * (block + street); const y1 = y0 + block;
    const samples = [channelYAt(x0), channelYAt(x1), ...channel.filter(point => point.x > x0 && point.x < x1).map(point => point.y)];
    const low = Math.min(...samples) - channelClearance;
    const high = Math.max(...samples) + channelClearance;
    return y1 <= low || y0 >= high;
  });
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  const [minimum, maximum] = scale === 'small' ? [6, 12] : scale === 'medium' ? [10, 22] : scale === 'large' ? [18, 30] : [12, 30];
  const countMinimum = Math.min(minimum, cells.length);
  const countMaximum = Math.min(maximum, cells.length);
  const effectiveMinimum = Math.min(countMinimum, countMaximum);
  const count = effectiveMinimum + Math.floor(next() * (countMaximum - effectiveMinimum + 1));
  const streets: DraftPoint[][] = [];
  const shoreRoadClearance = 17; // half of the 34 ft street stroke used in the plan view
  for (let c = 0; c <= cols; c++) {
    if ((featureSide === 'west' && c === 0) || (featureSide === 'east' && c === cols)) continue;
    const x = c === 0 ? margin / 2 : c === cols ? width - margin / 2 : margin + c * block + (c - 1) * street + street / 2;
    streets.push([{ x, y: featureSide === 'north' ? 60 + shoreRoadClearance : margin / 2 }, { x, y: featureSide === 'south' ? height - 60 - shoreRoadClearance : height - margin / 2 }]);
  }
  for (let r = 0; r <= rows; r++) {
    if ((featureSide === 'north' && r === 0) || (featureSide === 'south' && r === rows)) continue;
    const y = r === 0 ? margin / 2 : r === rows ? height - margin / 2 : margin + r * block + (r - 1) * street + street / 2;
    streets.push([{ x: featureSide === 'west' ? 60 + shoreRoadClearance : margin / 2, y }, { x: featureSide === 'east' ? width - 60 - shoreRoadClearance : width - margin / 2, y }]);
  }
  const buildings = cells.slice(0, count).map((cell, i): DraftBuilding => {
    const col = cell % cols; const row = Math.floor(cell / cols);
    const x0 = margin + col * (block + street) + 8 + Math.floor(next() * 11);
    const y0 = margin + row * (block + street) + 8 + Math.floor(next() * 11);
    const x1 = margin + col * (block + street) + block - 8 - Math.floor(next() * 11);
    const y1 = margin + row * (block + street) + block - 8 - Math.floor(next() * 11);
    const id = `building-${String(i + 1).padStart(2, '0')}`;
    const partition = splitRooms({ x0, y0, x1, y1 }, next, 3 + Math.floor(next() * 4));
    const roomIds = partition.leaves.map((_, j) => `${id}-room-${String(j + 1).padStart(2, '0')}`);
    const roomRects = partition.leaves.map((r, j) => ({ ...r, id: roomIds[j] }));
    const doors: DraftDoor[] = [];
    partition.cuts.forEach((cut, cutIndex) => {
      const adjacent: { a: typeof roomRects[number]; b: typeof roomRects[number]; start: number; end: number }[] = [];
      for (const a of roomRects) for (const b of roomRects) {
        if (cut.axis === 'x' && a.x1 === cut.value && b.x0 === cut.value) {
          const start = Math.max(a.y0, b.y0); const end = Math.min(a.y1, b.y1); if (end - start >= 5) adjacent.push({ a, b, start, end });
        } else if (cut.axis === 'y' && a.y1 === cut.value && b.y0 === cut.value) {
          const start = Math.max(a.x0, b.x0); const end = Math.min(a.x1, b.x1); if (end - start >= 5) adjacent.push({ a, b, start, end });
        }
      }
      adjacent.sort((a, b) => (b.end - b.start) - (a.end - a.start));
      const pair = adjacent[0];
      if (!pair) throw new Error('BSP split produced no adjacent rooms for a door');
      const center = (pair.start + pair.end) / 2; const half = 2.5;
      doors.push({
        id: `${id}-door-internal-${String(cutIndex + 1).padStart(2, '0')}`,
        a: cut.axis === 'x' ? { x: cut.value, y: center - half } : { x: center - half, y: cut.value },
        b: cut.axis === 'x' ? { x: cut.value, y: center + half } : { x: center + half, y: cut.value },
        open: true, connects: [pair.a.id, pair.b.id],
      });
    });
    // Some shallow BSP branches may leave a T-junction whose nominal split does not connect every leaf pair.
    // Add deterministic doors along remaining shared room edges until the floor plan is connected.
    const parent = new Map(roomRects.map(room => [room.id, room.id]));
    const root = (id: string): string => { const p = parent.get(id)!; if (p === id) return id; const r = root(p); parent.set(id, r); return r; };
    const join = (a: string, b: string): boolean => { const ra = root(a); const rb = root(b); if (ra === rb) return false; parent.set(rb, ra); return true; };
    for (const door of doors) if (!door.connects.includes('outside')) join(door.connects[0], door.connects[1]);
    const adjacentRooms: { a: typeof roomRects[number]; b: typeof roomRects[number]; start: number; end: number; axis: 'x' | 'y'; value: number }[] = [];
    for (let a = 0; a < roomRects.length; a++) for (let b = a + 1; b < roomRects.length; b++) {
      const one = roomRects[a]; const two = roomRects[b];
      if (one.x1 === two.x0 || two.x1 === one.x0) {
        const start = Math.max(one.y0, two.y0); const end = Math.min(one.y1, two.y1);
        if (end - start >= 5) adjacentRooms.push({ a: one.x1 === two.x0 ? one : two, b: one.x1 === two.x0 ? two : one, start, end, axis: 'x', value: one.x1 === two.x0 ? one.x1 : two.x1 });
      }
      if (one.y1 === two.y0 || two.y1 === one.y0) {
        const start = Math.max(one.x0, two.x0); const end = Math.min(one.x1, two.x1);
        if (end - start >= 5) adjacentRooms.push({ a: one.y1 === two.y0 ? one : two, b: one.y1 === two.y0 ? two : one, start, end, axis: 'y', value: one.y1 === two.y0 ? one.y1 : two.y1 });
      }
    }
    adjacentRooms.sort((a, b) => (b.end - b.start) - (a.end - a.start) || (a.a.id < b.a.id ? -1 : a.a.id > b.a.id ? 1 : 0) || (a.b.id < b.b.id ? -1 : a.b.id > b.b.id ? 1 : 0));
    let linkIndex = 0;
    for (const edge of adjacentRooms) if (join(edge.a.id, edge.b.id)) {
      const center = (edge.start + edge.end) / 2;
      doors.push({
        id: `${id}-door-link-${String(++linkIndex).padStart(2, '0')}`,
        a: edge.axis === 'x' ? { x: edge.value, y: center - 2.5 } : { x: center - 2.5, y: edge.value },
        b: edge.axis === 'x' ? { x: edge.value, y: center + 2.5 } : { x: center + 2.5, y: edge.value },
        open: true, connects: [edge.a.id, edge.b.id],
      });
    }
    const exteriorCandidates = roomRects.filter(r => r.y1 === y1).sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0));
    const entry = exteriorCandidates[0];
    const entryCenter = (entry.x0 + entry.x1) / 2;
    doors.push({ id: `${id}-door-exterior`, a: { x: entryCenter - 2.5, y: y1 }, b: { x: entryCenter + 2.5, y: y1 }, open: true, connects: [entry.id, 'outside'] });
    return {
      id, name: `Постройка ${String(i + 1).padStart(2, '0')}`,
      outline: closedRect(x0, y0, x1, y1),
      rooms: roomRects.map((r, index) => ({ id: r.id, name: `Комната ${String(index + 1).padStart(2, '0')}`, outline: closedRect(r.x0, r.y0, r.x1, r.y1) })), doors,
    };
  });
  const waterFeature: DraftWaterFeature | undefined = siteFeature
    ? { id: `water-${siteFeature}`, kind: siteFeature, side: riverRoute ? null : featureSide, width: 60, ...(channel ? { route: channel } : {}) }
    : undefined;
  const draft: SettlementDraft = {
    format: SETTLEMENT_DRAFT_FORMAT, generatorVersion: version, seed, placeId,
    provenance: 'table-rule', bounds: { width, height }, gridFeet: SETTLEMENT_GRID_FEET, streets, buildings, generationProfile: profile,
    ...(waterFeature ? { waterFeatures: [waterFeature] } : {}),
  };
  validateSettlementDraft(draft);
  return freezeDeep(draft);
}
