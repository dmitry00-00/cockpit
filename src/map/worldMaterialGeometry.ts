import type { WorldMaterialDraft, WorldNodeDraft } from '../rules/generation/localWorldMaterialDraft';

export const WORLD_MATERIAL_GEOMETRY_FORMAT = 'cockpit.world-material-map/1' as const;
export const WORLD_MATERIAL_LAYOUT_VERSION = 'p7-graph-layout-v1' as const;

export interface WorldMaterialMapNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: 'room' | 'site';
}

export interface WorldMaterialMapEdge {
  id: string;
  from: string;
  to: string;
  points: readonly { x: number; y: number }[];
}

export interface WorldMaterialGeometry {
  format: typeof WORLD_MATERIAL_GEOMETRY_FORMAT;
  layoutVersion: typeof WORLD_MATERIAL_LAYOUT_VERSION;
  coordinateSpace: 'abstract-grid';
  bounds: { width: number; height: number };
  nodes: readonly WorldMaterialMapNode[];
  edges: readonly WorldMaterialMapEdge[];
}

function nodesOf(draft: WorldMaterialDraft): readonly WorldNodeDraft[] {
  return draft.kind === 'dungeon' ? draft.areas : draft.features;
}

function edgesOf(nodes: readonly WorldNodeDraft[]): Array<[string, string]> {
  const pairs = new Map<string, [string, string]>();
  for (const node of nodes) for (const target of node.links) {
    const [from, to] = [node.id, target].sort((a, b) => a.localeCompare(b));
    pairs.set(`${from}\u0000${to}`, [from, to]);
  }
  return [...pairs.values()].sort(([a, b], [c, d]) => a.localeCompare(c) || b.localeCompare(d));
}

/** Deterministic schematic layout; coordinates are abstract grid units, never feet or canonical geography. */
export function layoutWorldMaterial(draft: WorldMaterialDraft): WorldMaterialGeometry {
  const sourceNodes = nodesOf(draft);
  const neighbors = new Map(sourceNodes.map(node => [node.id, new Set(node.links)]));
  for (const node of sourceNodes) for (const id of node.links) neighbors.get(id)?.add(node.id);
  const root = draft.kind === 'dungeon' ? draft.entrance : sourceNodes[0]?.id;
  if (!root || !neighbors.has(root)) throw new Error('World material map has no valid root node.');
  const depth = new Map<string, number>([[root, 0]]);
  const queue = [root];
  while (queue.length) {
    const id = queue.shift()!;
    for (const next of [...(neighbors.get(id) ?? [])].sort()) {
      if (depth.has(next)) continue;
      depth.set(next, depth.get(id)! + 1);
      queue.push(next);
    }
  }
  if (depth.size !== sourceNodes.length) throw new Error('World material map graph is disconnected.');

  const columns = new Map<number, WorldNodeDraft[]>();
  for (const node of sourceNodes) {
    const level = depth.get(node.id)!;
    const list = columns.get(level) ?? [];
    list.push(node);
    columns.set(level, list);
  }
  for (const list of columns.values()) list.sort((a, b) => a.id.localeCompare(b.id));
  const boxWidth = 9, boxHeight = 5, gapX = 5, gapY = 3, pad = 4;
  const maxColumnCount = Math.max(...[...columns.values()].map(column => column.length));
  const maxDepth = Math.max(...columns.keys());
  const width = pad * 2 + (maxDepth + 1) * boxWidth + maxDepth * gapX;
  const height = pad * 2 + maxColumnCount * boxHeight + (maxColumnCount - 1) * gapY;
  const positions = new Map<string, WorldMaterialMapNode>();
  for (const [level, list] of columns) for (const [row, node] of list.entries()) {
    positions.set(node.id, {
      id: node.id,
      x: pad + level * (boxWidth + gapX),
      y: pad + row * (boxHeight + gapY),
      width: boxWidth,
      height: boxHeight,
      shape: draft.kind === 'dungeon' ? 'room' : 'site',
    });
  }

  const edges = edgesOf(sourceNodes).map(([from, to]): WorldMaterialMapEdge => {
    const a = positions.get(from)!, b = positions.get(to)!;
    const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
    const bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    let points: { x: number; y: number }[];
    if (a.x < b.x) {
      const mid = (a.x + a.width + b.x) / 2;
      points = [{ x: a.x + a.width, y: ac.y }, { x: mid, y: ac.y }, { x: mid, y: bc.y }, { x: b.x, y: bc.y }];
    } else if (b.x < a.x) {
      const mid = (b.x + b.width + a.x) / 2;
      points = [{ x: b.x + b.width, y: bc.y }, { x: mid, y: bc.y }, { x: mid, y: ac.y }, { x: a.x, y: ac.y }];
    } else {
      // Keep same-depth links in the gutter after their column; routes must not cut through rooms/sites.
      const gutter = a.x + boxWidth + gapX / 2;
      points = [{ x: a.x + boxWidth, y: ac.y }, { x: gutter, y: ac.y }, { x: gutter, y: bc.y }, { x: b.x + boxWidth, y: bc.y }];
    }
    return { id: `edge-${from}-${to}`, from, to, points };
  });
  const geometry: WorldMaterialGeometry = {
    format: WORLD_MATERIAL_GEOMETRY_FORMAT,
    layoutVersion: WORLD_MATERIAL_LAYOUT_VERSION,
    coordinateSpace: 'abstract-grid',
    bounds: { width, height },
    nodes: [...positions.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges,
  };
  validateWorldMaterialGeometry(geometry, draft);
  return geometry;
}

/** Validate bounded geometry and ensure its topology still matches the source graph. */
export function validateWorldMaterialGeometry(value: unknown, draft: WorldMaterialDraft): asserts value is WorldMaterialGeometry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('World material geometry must be an object.');
  const map = value as Record<string, unknown>;
  if (map.format !== WORLD_MATERIAL_GEOMETRY_FORMAT || map.layoutVersion !== WORLD_MATERIAL_LAYOUT_VERSION || map.coordinateSpace !== 'abstract-grid') throw new Error('Unsupported world material map version.');
  const bounds = map.bounds as Record<string, unknown> | null;
  if (!bounds || typeof bounds.width !== 'number' || typeof bounds.height !== 'number' || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width <= 0 || bounds.height <= 0 || bounds.width > 2_000 || bounds.height > 2_000) throw new Error('World material map bounds are invalid.');
  const source = nodesOf(draft);
  if (!Array.isArray(map.nodes) || map.nodes.length !== source.length || !Array.isArray(map.edges)) throw new Error('World material map does not match its source graph.');
  const sourceIds = new Set(source.map(node => node.id));
  const layout = new Map<string, WorldMaterialMapNode>();
  for (const raw of map.nodes) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('World material map node is invalid.');
    const node = raw as Record<string, unknown>;
    if (typeof node.id !== 'string' || !sourceIds.has(node.id) || layout.has(node.id) ||
        !['room', 'site'].includes(String(node.shape)) || node.shape !== (draft.kind === 'dungeon' ? 'room' : 'site') ||
        ![node.x, node.y, node.width, node.height].every(number => typeof number === 'number' && Number.isFinite(number)) ||
        (node.x as number) < 0 || (node.y as number) < 0 || (node.width as number) <= 0 || (node.height as number) <= 0 ||
        (node.x as number) + (node.width as number) > bounds.width || (node.y as number) + (node.height as number) > bounds.height) throw new Error('World material map node is outside bounded geometry.');
    layout.set(node.id, node as unknown as WorldMaterialMapNode);
  }
  const placed = [...layout.values()];
  for (let index = 0; index < placed.length; index++) for (let other = index + 1; other < placed.length; other++) {
    const a = placed[index], b = placed[other];
    if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) throw new Error('World material map nodes overlap.');
  }
  const expectedEdges = new Set(edgesOf(source).map(([from, to]) => `${from}\u0000${to}`));
  const actualEdges = new Set<string>();
  const edgeIds = new Set<string>();
  for (const raw of map.edges) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('World material map edge is invalid.');
    const edge = raw as Record<string, unknown>;
    if (typeof edge.id !== 'string' || edgeIds.has(edge.id) || typeof edge.from !== 'string' || typeof edge.to !== 'string' || !layout.has(edge.from) || !layout.has(edge.to) || edge.from === edge.to || !Array.isArray(edge.points) || edge.points.length < 2 || edge.points.length > 8) throw new Error('World material map edge is malformed.');
    edgeIds.add(edge.id);
    const [from, to] = [edge.from, edge.to].sort((a, b) => a.localeCompare(b));
    const key = `${from}\u0000${to}`;
    if (!expectedEdges.has(key) || actualEdges.has(key)) throw new Error('World material map topology differs from the source graph.');
    actualEdges.add(key);
    const route: Array<{ x: number; y: number }> = [];
    for (const rawPoint of edge.points) {
      if (!rawPoint || typeof rawPoint !== 'object' || Array.isArray(rawPoint)) throw new Error('World material map route point is invalid.');
      const point = rawPoint as Record<string, unknown>;
      if (typeof point.x !== 'number' || typeof point.y !== 'number' || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x > bounds.width || point.y > bounds.height) throw new Error('World material map route leaves its bounds.');
      route.push({ x: point.x, y: point.y });
    }
    const endpointIds = new Set([edge.from, edge.to]);
    for (let index = 1; index < route.length; index++) {
      const start = route[index - 1], end = route[index];
      if (start.x !== end.x && start.y !== end.y) throw new Error('World material map routes must use orthogonal segments.');
      for (const node of placed) {
        if (endpointIds.has(node.id)) continue;
        const crossesInterior = start.y === end.y
          ? start.y > node.y && start.y < node.y + node.height && Math.max(Math.min(start.x, end.x), node.x) < Math.min(Math.max(start.x, end.x), node.x + node.width)
          : start.x > node.x && start.x < node.x + node.width && Math.max(Math.min(start.y, end.y), node.y) < Math.min(Math.max(start.y, end.y), node.y + node.height);
        if (crossesInterior) throw new Error('World material map route crosses another node.');
      }
    }
    const touchesBoundary = (point: { x: number; y: number }, node: WorldMaterialMapNode) =>
      (point.x === node.x || point.x === node.x + node.width) && point.y >= node.y && point.y <= node.y + node.height ||
      (point.y === node.y || point.y === node.y + node.height) && point.x >= node.x && point.x <= node.x + node.width;
    if (![edge.from, edge.to].every(id => route.some(point => touchesBoundary(point, layout.get(id)!)))) throw new Error('World material map route does not touch both connected nodes.');
  }
  if (actualEdges.size !== expectedEdges.size) throw new Error('World material map omits source graph connections.');
}
