import type { WorldMaterialDraft, WorldNodeDraft } from '../rules/generation/localWorldMaterialDraft';

export const DUNGEON_TACTICAL_FORMAT = 'cockpit.dungeon-tactical/1' as const;
export const DUNGEON_TACTICAL_LAYOUT_VERSION = 'p7-dungeon-tactical-v1' as const;
export const DUNGEON_TACTICAL_GRID_FEET = 5 as const;

type Side = 'north' | 'east' | 'south' | 'west';
export interface DungeonGridCell { x: number; y: number }
export interface DungeonGridPoint { x: number; y: number }
export interface DungeonTacticalRoom { id: string; name: string; x: number; y: number; width: number; height: number }
export interface DungeonTacticalCorridor { id: string; connects: [string, string]; cells: readonly DungeonGridCell[] }
export interface DungeonTacticalDoor {
  id: string;
  roomId: string | 'outside';
  side: Side;
  corridorIds: readonly string[];
  a: DungeonGridPoint;
  b: DungeonGridPoint;
  open: boolean;
}
export interface DungeonTacticalWall { a: DungeonGridPoint; b: DungeonGridPoint }
export interface DungeonTacticalGeometry {
  format: typeof DUNGEON_TACTICAL_FORMAT;
  layoutVersion: typeof DUNGEON_TACTICAL_LAYOUT_VERSION;
  coordinateSpace: 'grid-cells';
  gridFeet: typeof DUNGEON_TACTICAL_GRID_FEET;
  bounds: { width: number; height: number };
  defaults: {
    roomWidthCells: 4;
    roomHeightCells: 4;
    corridorWidthCells: 1;
    doorPlacement: 'edge-midpoint';
    doorState: 'open-by-default';
    attribution: 'procedural-table-rule';
  };
  rooms: readonly DungeonTacticalRoom[];
  corridors: readonly DungeonTacticalCorridor[];
  doors: readonly DungeonTacticalDoor[];
  walls: readonly DungeonTacticalWall[];
}

interface RoomPlacement { room: DungeonTacticalRoom; depth: number; row: number }
interface Edge { a: string; b: string; id: string }
type DungeonDraft = Extract<WorldMaterialDraft, { kind: 'dungeon' }>;

const ROOM_W = 4;
const ROOM_H = 4;
const GAP_X = 6;
const GAP_Y = 4;
const PAD_X = 5;
const PAD_Y = 5;
const MAP_EXTRA = 12;
const MAX_SIDE = 512;
const MAX_CELLS = 180_000;

function assertDungeonDraft(draft: WorldMaterialDraft): asserts draft is DungeonDraft {
  if (draft.kind !== 'dungeon') throw new Error('Tactical floor geometry is available only for dungeons.');
}

function sourceNodes(draft: WorldMaterialDraft): WorldNodeDraft[] {
  assertDungeonDraft(draft);
  return [...draft.areas];
}

function graphEdges(draft: WorldMaterialDraft): Edge[] {
  const pairs = new Map<string, Edge>();
  for (const node of sourceNodes(draft)) for (const target of node.links) {
    const [a, b] = [node.id, target].sort((left, right) => left.localeCompare(right));
    pairs.set(`${a}\u0000${b}`, { a, b, id: `corridor-${a}-${b}` });
  }
  return [...pairs.values()].sort((left, right) => left.a.localeCompare(right.a) || left.b.localeCompare(right.b));
}

function graphLayout(draft: WorldMaterialDraft): RoomPlacement[] {
  assertDungeonDraft(draft);
  const nodes = sourceNodes(draft);
  const adjacency = new Map(nodes.map(node => [node.id, new Set<string>()]));
  for (const node of nodes) for (const id of node.links) {
    adjacency.get(node.id)!.add(id);
    adjacency.get(id)!.add(node.id);
  }
  const depth = new Map<string, number>([[draft.entrance, 0]]);
  const queue = [draft.entrance];
  while (queue.length) {
    const id = queue.shift()!;
    for (const next of [...adjacency.get(id)!].sort()) {
      if (depth.has(next)) continue;
      depth.set(next, depth.get(id)! + 1);
      queue.push(next);
    }
  }
  if (depth.size !== nodes.length) throw new Error('Tactical map requires a connected dungeon graph.');
  const columns = new Map<number, WorldNodeDraft[]>();
  for (const node of nodes) {
    const level = depth.get(node.id)!;
    const column = columns.get(level) ?? [];
    column.push(node);
    columns.set(level, column);
  }
  const placements: RoomPlacement[] = [];
  for (const [level, column] of columns) {
    column.sort((a, b) => a.id.localeCompare(b.id));
    for (const [row, node] of column.entries()) placements.push({
      depth: level,
      row,
      room: { id: node.id, name: node.name, x: PAD_X + level * (ROOM_W + GAP_X), y: PAD_Y + row * (ROOM_H + GAP_Y), width: ROOM_W, height: ROOM_H },
    });
  }
  return placements;
}

function cellKey(cell: DungeonGridCell): string { return `${cell.x},${cell.y}`; }
function edgeKey(a: DungeonGridPoint, b: DungeonGridPoint): string {
  const left = `${a.x},${a.y}`, right = `${b.x},${b.y}`;
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}
function wall(a: DungeonGridPoint, b: DungeonGridPoint): DungeonTacticalWall {
  return edgeKey(a, b).startsWith(`${a.x},${a.y}|`) ? { a, b } : { a: b, b: a };
}
function manhattan(a: DungeonGridCell, b: DungeonGridCell): number { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
function roomCells(room: DungeonTacticalRoom): DungeonGridCell[] {
  const cells: DungeonGridCell[] = [];
  for (let y = room.y; y < room.y + room.height; y++) for (let x = room.x; x < room.x + room.width; x++) cells.push({ x, y });
  return cells;
}

function doorSegment(room: DungeonTacticalRoom, side: Side): { a: DungeonGridPoint; b: DungeonGridPoint } {
  if (side === 'north' || side === 'south') {
    const x = room.x + Math.floor(room.width / 2);
    const y = side === 'north' ? room.y : room.y + room.height;
    return { a: { x, y }, b: { x: x + 1, y } };
  }
  const x = side === 'west' ? room.x : room.x + room.width;
  const y = room.y + Math.floor(room.height / 2);
  return { a: { x, y }, b: { x, y: y + 1 } };
}

function outsideCell(room: DungeonTacticalRoom, side: Side): DungeonGridCell {
  if (side === 'north') return { x: room.x + Math.floor(room.width / 2), y: room.y - 1 };
  if (side === 'south') return { x: room.x + Math.floor(room.width / 2), y: room.y + room.height };
  if (side === 'west') return { x: room.x - 1, y: room.y + Math.floor(room.height / 2) };
  return { x: room.x + room.width, y: room.y + Math.floor(room.height / 2) };
}

function sidesForEdge(a: RoomPlacement, b: RoomPlacement): [Side, Side] {
  if (a.depth < b.depth) return ['east', 'west'];
  if (a.depth > b.depth) return ['west', 'east'];
  return a.row < b.row ? ['south', 'north'] : ['north', 'south'];
}

function findPath(
  start: DungeonGridCell,
  goal: DungeonGridCell,
  blockedRooms: ReadonlySet<string>,
  occupiedCorridors: ReadonlySet<string>,
  width: number,
  height: number,
): DungeonGridCell[] {
  const startKey = cellKey(start), goalKey = cellKey(goal);
  const queue = [start];
  const previous = new Map<string, string | null>([[startKey, null]]);
  const moves: readonly DungeonGridCell[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
  for (let cursor = 0; cursor < queue.length && !previous.has(goalKey); cursor++) {
    const current = queue[cursor];
    for (const move of moves) {
      const next = { x: current.x + move.x, y: current.y + move.y };
      const key = cellKey(next);
      if (next.x < 0 || next.y < 0 || next.x >= width || next.y >= height || previous.has(key) || blockedRooms.has(key)) continue;
      if (occupiedCorridors.has(key) && key !== goalKey) continue;
      previous.set(key, cellKey(current));
      queue.push(next);
    }
  }
  if (!previous.has(goalKey)) throw new Error('A corridor could not be routed without crossing a room or another passage.');
  const path: DungeonGridCell[] = [];
  let cursor: string | null = goalKey;
  while (cursor) {
    const [x, y] = cursor.split(',').map(Number);
    path.push({ x, y });
    cursor = previous.get(cursor) ?? null;
  }
  return path.reverse();
}

function collectDoors(rooms: ReadonlyMap<string, DungeonTacticalRoom>, corridors: readonly DungeonTacticalCorridor[], draft: DungeonDraft, placements: ReadonlyMap<string, RoomPlacement>): DungeonTacticalDoor[] {
  const bySegment = new Map<string, DungeonTacticalDoor>();
  const add = (roomId: string | 'outside', side: Side, corridorId: string) => {
    const room = roomId === 'outside' ? undefined : rooms.get(roomId);
    const segment = room ? doorSegment(room, side) : { a: { x: 0, y: PAD_Y + Math.floor(ROOM_H / 2) }, b: { x: 0, y: PAD_Y + Math.floor(ROOM_H / 2) + 1 } };
    const key = `${roomId}|${edgeKey(segment.a, segment.b)}`;
    const existing = bySegment.get(key);
    if (existing) {
      if (!existing.corridorIds.includes(corridorId)) existing.corridorIds = [...existing.corridorIds, corridorId].sort();
      return;
    }
    bySegment.set(key, {
      id: `door-${roomId}-${side}-${segment.a.x}-${segment.a.y}`,
      roomId, side, corridorIds: [corridorId], ...segment, open: true,
    });
  };
  const entrance = rooms.get(draft.kind === 'dungeon' ? draft.entrance : '')!;
  const entranceCorridor = corridors.find(corridor => corridor.id === 'corridor-entrance')!;
  add('outside', 'west', entranceCorridor.id);
  add(entrance.id, 'west', entranceCorridor.id);
  for (const corridor of corridors.filter(item => item.id !== 'corridor-entrance')) {
    const placementA = placements.get(corridor.connects[0])!;
    const placementB = placements.get(corridor.connects[1])!;
    const [sideA, sideB] = sidesForEdge(placementA, placementB);
    add(placementA.room.id, sideA, corridor.id);
    add(placementB.room.id, sideB, corridor.id);
  }
  return [...bySegment.values()].map(door => ({ ...door, corridorIds: [...door.corridorIds] })).sort((a, b) => a.id.localeCompare(b.id));
}

function buildWalls(rooms: readonly DungeonTacticalRoom[], corridors: readonly DungeonTacticalCorridor[], doors: readonly DungeonTacticalDoor[]): DungeonTacticalWall[] {
  const cells = new Map<string, string>();
  for (const room of rooms) for (const cell of roomCells(room)) cells.set(cellKey(cell), `room:${room.id}`);
  // All passage cells share one walkable region so joined paths do not gain artificial seam walls.
  for (const corridor of corridors) for (const cell of corridor.cells) if (!cells.has(cellKey(cell))) cells.set(cellKey(cell), 'corridor');
  const openings = new Set(doors.map(door => edgeKey(door.a, door.b)));
  const walls = new Map<string, DungeonTacticalWall>();
  const directions = [
    { dx: 0, dy: -1, a: (x: number, y: number) => ({ x, y }), b: (x: number, y: number) => ({ x: x + 1, y }) },
    { dx: 1, dy: 0, a: (x: number, y: number) => ({ x: x + 1, y }), b: (x: number, y: number) => ({ x: x + 1, y: y + 1 }) },
    { dx: 0, dy: 1, a: (x: number, y: number) => ({ x, y: y + 1 }), b: (x: number, y: number) => ({ x: x + 1, y: y + 1 }) },
    { dx: -1, dy: 0, a: (x: number, y: number) => ({ x, y }), b: (x: number, y: number) => ({ x, y: y + 1 }) },
  ];
  for (const [key, region] of cells) {
    const [x, y] = key.split(',').map(Number);
    for (const direction of directions) {
      if (cells.get(cellKey({ x: x + direction.dx, y: y + direction.dy })) === region) continue;
      const a = direction.a(x, y), b = direction.b(x, y);
      const normalized = edgeKey(a, b);
      if (openings.has(normalized)) continue;
      walls.set(normalized, wall(a, b));
    }
  }
  return [...walls.values()].sort((a, b) => edgeKey(a.a, a.b).localeCompare(edgeKey(b.a, b.b)));
}

/** Create one non-canonical tactical proposal from the dungeon's linked room graph. */
export function generateDungeonTacticalGeometry(draft: WorldMaterialDraft): DungeonTacticalGeometry {
  assertDungeonDraft(draft);
  const placements = graphLayout(draft);
  const roomById = new Map(placements.map(placement => [placement.room.id, placement.room]));
  const placementById = new Map(placements.map(placement => [placement.room.id, placement]));
  const blockedRooms = new Set(placements.flatMap(placement => roomCells(placement.room).map(cellKey)));
  const maxRight = Math.max(...placements.map(placement => placement.room.x + placement.room.width));
  const maxBottom = Math.max(...placements.map(placement => placement.room.y + placement.room.height));
  const bounds = { width: maxRight + MAP_EXTRA, height: maxBottom + MAP_EXTRA };
  if (bounds.width * bounds.height > MAX_CELLS || bounds.width > MAX_SIDE || bounds.height > MAX_SIDE) throw new Error('Dungeon tactical geometry exceeds layout limits.');
  const corridors: DungeonTacticalCorridor[] = [];
  const entrance = roomById.get(draft.entrance)!;
  const entranceY = entrance.y + Math.floor(entrance.height / 2);
  corridors.push({
    id: 'corridor-entrance', connects: ['outside', draft.entrance],
    cells: Array.from({ length: entrance.x }, (_, x) => ({ x, y: entranceY })),
  });
  const occupiedCorridors = new Set(corridors[0].cells.map(cellKey));
  for (const edge of graphEdges(draft)) {
    const a = placementById.get(edge.a)!; const b = placementById.get(edge.b)!;
    const [sideA, sideB] = sidesForEdge(a, b);
    const start = outsideCell(a.room, sideA); const goal = outsideCell(b.room, sideB);
    const cells = findPath(start, goal, blockedRooms, occupiedCorridors, bounds.width, bounds.height);
    const corridor: DungeonTacticalCorridor = { id: edge.id, connects: [edge.a, edge.b], cells };
    corridors.push(corridor);
    for (const cell of cells) occupiedCorridors.add(cellKey(cell));
  }
  const doors = collectDoors(roomById, corridors, draft, placementById);
  const rooms = placements.map(placement => placement.room).sort((a, b) => a.id.localeCompare(b.id));
  const geometry: DungeonTacticalGeometry = {
    format: DUNGEON_TACTICAL_FORMAT,
    layoutVersion: DUNGEON_TACTICAL_LAYOUT_VERSION,
    coordinateSpace: 'grid-cells',
    gridFeet: DUNGEON_TACTICAL_GRID_FEET,
    bounds,
    defaults: {
      roomWidthCells: ROOM_W,
      roomHeightCells: ROOM_H,
      corridorWidthCells: 1,
      doorPlacement: 'edge-midpoint',
      doorState: 'open-by-default',
      attribution: 'procedural-table-rule',
    },
    rooms,
    corridors,
    doors,
    walls: buildWalls(rooms, corridors, doors),
  };
  validateDungeonTacticalGeometry(geometry, draft);
  return geometry;
}

function assertPoint(value: unknown, label: string, bounds: DungeonTacticalGeometry['bounds']): asserts value is DungeonGridPoint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}: invalid point`);
  const point = value as Record<string, unknown>;
  if (!Number.isInteger(point.x) || !Number.isInteger(point.y) || Number(point.x) < 0 || Number(point.y) < 0 || Number(point.x) > bounds.width || Number(point.y) > bounds.height) throw new Error(`${label}: point outside tactical map`);
}

/** Validate room/corridor footprints, graph connections, door openings and the wall shell before preview/export. */
export function validateDungeonTacticalGeometry(value: unknown, draft: WorldMaterialDraft): asserts value is DungeonTacticalGeometry {
  assertDungeonDraft(draft);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Dungeon tactical geometry must be an object.');
  const map = value as Record<string, unknown>;
  if (map.format !== DUNGEON_TACTICAL_FORMAT || map.layoutVersion !== DUNGEON_TACTICAL_LAYOUT_VERSION || map.coordinateSpace !== 'grid-cells' || map.gridFeet !== DUNGEON_TACTICAL_GRID_FEET) throw new Error('Unsupported dungeon tactical geometry version.');
  const bounds = map.bounds as Record<string, unknown> | null;
  if (!bounds || !Number.isInteger(bounds.width) || !Number.isInteger(bounds.height) || Number(bounds.width) < 1 || Number(bounds.height) < 1 || Number(bounds.width) > MAX_SIDE || Number(bounds.height) > MAX_SIDE || Number(bounds.width) * Number(bounds.height) > MAX_CELLS) throw new Error('Invalid tactical map bounds.');
  const size = { width: Number(bounds.width), height: Number(bounds.height) };
  const defaults = map.defaults as Record<string, unknown> | null;
  if (!defaults || defaults.roomWidthCells !== ROOM_W || defaults.roomHeightCells !== ROOM_H || defaults.corridorWidthCells !== 1 || defaults.doorPlacement !== 'edge-midpoint' || defaults.doorState !== 'open-by-default' || defaults.attribution !== 'procedural-table-rule') throw new Error('Tactical geometry defaults lack explicit attribution.');
  const nodes = sourceNodes(draft);
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  if (!Array.isArray(map.rooms) || map.rooms.length !== nodes.length || !Array.isArray(map.corridors) || !Array.isArray(map.doors) || !Array.isArray(map.walls)) throw new Error('Tactical geometry does not match its source graph.');
  const rooms = map.rooms as DungeonTacticalRoom[];
  const roomById = new Map<string, DungeonTacticalRoom>();
  for (const raw of rooms) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || roomById.has(raw.id) || !nodeById.has(raw.id) || raw.name !== nodeById.get(raw.id)!.name || ![raw.x, raw.y, raw.width, raw.height].every(Number.isInteger) || raw.x < 0 || raw.y < 0 || raw.width !== ROOM_W || raw.height !== ROOM_H || raw.x + raw.width > size.width || raw.y + raw.height > size.height) throw new Error('Tactical room is invalid or mismatched.');
    roomById.set(raw.id, raw);
  }
  const occupiedRooms = new Set<string>();
  for (const room of rooms) for (const cell of roomCells(room)) {
    const key = cellKey(cell);
    if (occupiedRooms.has(key)) throw new Error('Tactical rooms overlap.');
    occupiedRooms.add(key);
  }
  const edges = graphEdges(draft);
  if (map.corridors.length !== edges.length + 1) throw new Error('Tactical corridor count differs from the source graph.');
  const corridors = map.corridors as DungeonTacticalCorridor[];
  const corridorById = new Map<string, DungeonTacticalCorridor>();
  for (const corridor of corridors) {
    if (!corridor || typeof corridor.id !== 'string' || corridorById.has(corridor.id) || !Array.isArray(corridor.connects) || corridor.connects.length !== 2 || !Array.isArray(corridor.cells) || corridor.cells.length < 1 || corridor.cells.length > size.width * size.height) throw new Error('Tactical corridor is invalid.');
    corridorById.set(corridor.id, corridor);
    if (corridor.id === 'corridor-entrance') {
      if (corridor.connects[0] !== 'outside' || corridor.connects[1] !== draft.entrance) throw new Error('Entrance corridor is mismatched.');
    } else {
      const edge = edges.find(item => item.id === corridor.id);
      if (!edge || corridor.connects[0] !== edge.a || corridor.connects[1] !== edge.b) throw new Error('Tactical corridor does not match a source graph edge.');
    }
    const pathCells = new Set<string>();
    let previous: DungeonGridCell | undefined;
    for (const cell of corridor.cells) {
      if (!cell || !Number.isInteger(cell.x) || !Number.isInteger(cell.y) || cell.x < 0 || cell.y < 0 || cell.x >= size.width || cell.y >= size.height || occupiedRooms.has(cellKey(cell)) || pathCells.has(cellKey(cell))) throw new Error('Tactical corridor leaves bounds, overlaps a room, or repeats a cell.');
      if (previous && manhattan(previous, cell) !== 1) throw new Error('Tactical corridor path is disconnected.');
      pathCells.add(cellKey(cell));
      previous = cell;
    }
  }
  const doors = map.doors as DungeonTacticalDoor[];
  const doorIds = new Set<string>(); const doorEdges = new Set<string>();
  for (const door of doors) {
    if (!door || typeof door.id !== 'string' || doorIds.has(door.id) || !['north', 'east', 'south', 'west'].includes(door.side) || !Array.isArray(door.corridorIds) || !door.corridorIds.length || typeof door.open !== 'boolean') throw new Error('Tactical door is invalid.');
    doorIds.add(door.id);
    assertPoint(door.a, 'door.a', size); assertPoint(door.b, 'door.b', size);
    if (manhattan(door.a, door.b) !== 1 || doorEdges.has(edgeKey(door.a, door.b))) throw new Error('Tactical door segment is invalid or duplicated.');
    doorEdges.add(edgeKey(door.a, door.b));
    if (door.corridorIds.some(id => !corridorById.has(id))) throw new Error('Tactical door references an unknown corridor.');
    if (door.roomId === 'outside') {
      if (door.side !== 'west' || door.a.x !== 0 || door.b.x !== 0 || !door.corridorIds.includes('corridor-entrance')) throw new Error('Outside door must open to the entrance corridor at the map edge.');
    } else {
      const room = roomById.get(door.roomId);
      if (!room) throw new Error('Tactical door references an unknown room.');
      const expected = doorSegment(room, door.side);
      if (edgeKey(expected.a, expected.b) !== edgeKey(door.a, door.b)) throw new Error('Tactical door is not on its room boundary.');
      for (const corridorId of door.corridorIds) {
        const corridor = corridorById.get(corridorId)!;
        if (!corridor.connects.includes(door.roomId)) throw new Error('Tactical door corridor does not connect to its room.');
        if (!corridor.cells.some(cell => cellKey(cell) === cellKey(outsideCell(room, door.side)))) throw new Error('Tactical door does not touch its corridor.');
      }
    }
  }
  for (const corridor of corridors) for (const endpoint of corridor.connects) {
    if (endpoint === 'outside') {
      if (!doors.some(door => door.roomId === 'outside' && door.corridorIds.includes(corridor.id))) throw new Error('Entrance corridor has no outside portal.');
      continue;
    }
    if (!doors.some(door => door.roomId === endpoint && door.corridorIds.includes(corridor.id))) throw new Error(`Tactical corridor ${corridor.id} has no room portal for ${endpoint}.`);
  }
  const entranceCorridor = corridorById.get('corridor-entrance');
  const outsideDoor = doors.find(door => door.roomId === 'outside' && door.corridorIds.includes('corridor-entrance'));
  if (!entranceCorridor || !outsideDoor || !entranceCorridor.cells.some(cell => cell.x === 0 && cell.y === outsideDoor.a.y && cell.y === outsideDoor.b.y - 1)) throw new Error('Entrance passage does not meet its exterior portal.');
  const expectedWalls = buildWalls(rooms, corridors, doors);
  const expectedKeys = new Set(expectedWalls.map(segment => edgeKey(segment.a, segment.b)));
  const actualKeys = new Set<string>();
  for (const segment of map.walls as DungeonTacticalWall[]) {
    if (!segment || typeof segment !== 'object') throw new Error('Tactical wall segment is invalid.');
    assertPoint(segment.a, 'wall.a', size); assertPoint(segment.b, 'wall.b', size);
    if (manhattan(segment.a, segment.b) !== 1) throw new Error('Tactical wall must be a one-cell orthogonal segment.');
    const key = edgeKey(segment.a, segment.b);
    if (actualKeys.has(key) || !expectedKeys.has(key)) throw new Error('Tactical walls differ from room, corridor and door geometry.');
    actualKeys.add(key);
  }
  if (actualKeys.size !== expectedKeys.size) throw new Error('Tactical wall geometry is incomplete.');
}

export interface DungeonUvtt {
  format: 0.2;
  resolution: { map_origin: { x: number; y: number }; map_size: { x: number; y: number }; pixels_per_grid: number };
  line_of_sight: [{ x: number; y: number }, { x: number; y: number }][];
  portals: { bounds: [{ x: number; y: number }, { x: number; y: number }]; closed: boolean; position: { x: number; y: number } }[];
  lights: never[];
  environment: { baked_lighting: false; ambient_light: string };
  image: string;
  metadata: {
    source: 'DM Cockpit procedural tactical draft';
    materialId: string;
    edition: string;
    layer: 'HB';
    layoutVersion: typeof DUNGEON_TACTICAL_LAYOUT_VERSION;
    gridFeet: typeof DUNGEON_TACTICAL_GRID_FEET;
    roomSizeFeet: { width: number; height: number };
    corridorWidthFeet: number;
    doorPlacement: 'edge-midpoint';
    defaultsAttribution: 'procedural-table-rule';
    model: string;
    promptVersion: string;
    generatedAt: string;
  };
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
function pngDimensions(value: string): { width: number; height: number; payload: string } {
  const payload = value.startsWith('data:') ? value.slice(value.indexOf(',') + 1) : value;
  if (!payload || payload.length % 4 !== 0 || payload.length > 28_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) throw new Error('UVTT image must be bounded base64 PNG data.');
  const bytes = Uint8Array.from(atob(payload), char => char.charCodeAt(0));
  if (bytes.length < 24 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte) || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') throw new Error('UVTT image must be a PNG.');
  const read = (offset: number) => (bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
  return { width: read(16), height: read(20), payload };
}

/** Serialize only a validated, authored tactical proposal; map_size is measured in 5-foot grid cells. */
export function dungeonTacticalToUvtt(
  value: unknown,
  draft: WorldMaterialDraft,
  pngBase64: string,
  provenance: { materialId: string; edition: string; layer: 'HB'; model: string; promptVersion: string; generatedAt: string },
  doorStates: Readonly<Record<string, boolean>> = {},
): DungeonUvtt {
  validateDungeonTacticalGeometry(value, draft);
  const geometry = value;
  const image = pngDimensions(pngBase64);
  if (!image.width || !image.height || image.width > 4096 || image.height > 4096 || image.width !== geometry.bounds.width * 10 || image.height !== geometry.bounds.height * 10) throw new Error('UVTT PNG dimensions must match the tactical grid at 10 pixels per cell and stay within 4096 px.');
  return {
    format: 0.2,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: geometry.bounds.width, y: geometry.bounds.height }, pixels_per_grid: 10 },
    line_of_sight: geometry.walls.map(segment => [segment.a, segment.b]),
    portals: geometry.doors.map(door => ({ bounds: [door.a, door.b], closed: !(doorStates[door.id] ?? door.open), position: { x: (door.a.x + door.b.x) / 2, y: (door.a.y + door.b.y) / 2 } })),
    lights: [],
    environment: { baked_lighting: false, ambient_light: '#ffffff' },
    image: image.payload,
    metadata: {
      source: 'DM Cockpit procedural tactical draft',
      materialId: provenance.materialId,
      edition: provenance.edition,
      layer: provenance.layer,
      layoutVersion: geometry.layoutVersion,
      gridFeet: geometry.gridFeet,
      roomSizeFeet: { width: geometry.defaults.roomWidthCells * geometry.gridFeet, height: geometry.defaults.roomHeightCells * geometry.gridFeet },
      corridorWidthFeet: geometry.defaults.corridorWidthCells * geometry.gridFeet,
      doorPlacement: geometry.defaults.doorPlacement,
      defaultsAttribution: geometry.defaults.attribution,
      model: provenance.model,
      promptVersion: provenance.promptVersion,
      generatedAt: provenance.generatedAt,
    },
  };
}

/** Browser-only PNG renderer; UVTT requires an image whose dimensions align exactly with the grid. */
export function dungeonTacticalPng(value: unknown, doorStates?: Readonly<Record<string, boolean>>): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Tactical geometry is required.');
  const geometry = value as DungeonTacticalGeometry;
  const width = geometry.bounds.width * 10, height = geometry.bounds.height * 10;
  if (width < 1 || height < 1 || width > 4096 || height > 4096) throw new Error('Tactical map PNG exceeds 4096 pixels per side.');
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  ctx.fillStyle = '#27252b'; ctx.fillRect(0, 0, width, height);
  for (const corridor of geometry.corridors) {
    ctx.fillStyle = '#8a8278';
    for (const cell of corridor.cells) ctx.fillRect(cell.x * 10, cell.y * 10, 10, 10);
  }
  for (const room of geometry.rooms) {
    ctx.fillStyle = '#d6c7a7'; ctx.fillRect(room.x * 10, room.y * 10, room.width * 10, room.height * 10);
    ctx.fillStyle = '#27252b'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(room.id, (room.x + room.width / 2) * 10, (room.y + room.height / 2) * 10, room.width * 10 - 4);
  }
  ctx.strokeStyle = '#231d22'; ctx.lineWidth = 2; ctx.lineCap = 'square';
  for (const segment of geometry.walls) {
    ctx.beginPath(); ctx.moveTo(segment.a.x * 10, segment.a.y * 10); ctx.lineTo(segment.b.x * 10, segment.b.y * 10); ctx.stroke();
  }
  for (const door of geometry.doors) {
    const open = doorStates?.[door.id] ?? door.open;
    ctx.beginPath(); ctx.moveTo(door.a.x * 10, door.a.y * 10); ctx.lineTo(door.b.x * 10, door.b.y * 10);
    ctx.strokeStyle = open ? '#d9ae52' : '#582f36'; ctx.lineWidth = 4; ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(35,29,34,.16)'; ctx.lineWidth = 0.5;
  for (let x = 0; x <= width; x += 10) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = 0; y <= height; y += 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  return canvas.toDataURL('image/png');
}

