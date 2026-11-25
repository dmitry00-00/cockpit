import type { AdventureBundle, AdventureNode } from '../packages/adventure';
import type { AdventureRouteState } from '../engine/state';

export interface AuthoredRoutePath {
  id: string;
  name: string;
  summary: string;
  locationIds: readonly string[];
  status: 'open' | 'closed';
  state?: AdventureRouteState;
}

export interface AdventureRoutePlan {
  locationIds: readonly string[];
  routeIds: readonly string[];
}

export interface AdventureRouteMapItem {
  id: string;
  name: string;
  status: 'open' | 'closed';
  places: readonly string[];
}

function authoredPath(node: AdventureNode): string[] | null {
  if (node.kind !== 'route') return null;
  const from = node.links.filter(link => link.relation === 'from');
  const via = node.links.filter(link => link.relation === 'via');
  const to = node.links.filter(link => link.relation === 'to');
  if (from.length !== 1 || to.length !== 1) return null;
  return [from[0].target, ...via.map(link => link.target), to[0].target];
}

/** Returns only explicitly authored route topology. It never infers direction, distance, or geometry. */
export function authoredRoutePaths(
  bundle: AdventureBundle,
  states: Readonly<Record<string, AdventureRouteState>> = {},
): AuthoredRoutePath[] {
  return bundle.nodes.flatMap(node => {
    if (node.kind !== 'route') return [];
    const locationIds = authoredPath(node);
    const state = states[node.id];
    return [{
      id: node.id,
      name: node.name,
      summary: node.summary,
      locationIds: locationIds ?? [],
      status: state?.status ?? 'open',
      ...(state ? { state } : {}),
    }];
  });
}

/** Selects route statuses for a map only when an authored endpoint names that map; it does not produce coordinates. */
export function adventureRoutesForMap(
  bundle: AdventureBundle,
  states: Readonly<Record<string, AdventureRouteState>>,
  mapId: string,
): AdventureRouteMapItem[] {
  const nodes = new Map(bundle.nodes.map(node => [node.id, node]));
  return authoredRoutePaths(bundle, states).filter(route => route.locationIds.some(id => {
    const place = nodes.get(id);
    return place?.kind === 'location' && place.mapRef?.mapId === mapId;
  })).map(route => ({
    id: route.id,
    name: route.name,
    status: route.status,
    places: route.locationIds.map(id => nodes.get(id)?.name ?? id),
  }));
}

/** Breadth-first topology planner over authored directed route paths; closed routes contribute no edges. */
export function planAdventureRoute(
  bundle: AdventureBundle,
  states: Readonly<Record<string, AdventureRouteState>>,
  fromId: string,
  toId: string,
): AdventureRoutePlan | null {
  if (!bundle.nodes.some(node => node.id === fromId && node.kind === 'location') ||
      !bundle.nodes.some(node => node.id === toId && node.kind === 'location')) return null;
  if (fromId === toId) return { locationIds: [fromId], routeIds: [] };

  const adjacency = new Map<string, Array<{ to: string; routeId: string }>>();
  for (const route of authoredRoutePaths(bundle, states)) {
    if (route.status !== 'open' || route.locationIds.length < 2) continue;
    for (let index = 1; index < route.locationIds.length; index++) {
      const from = route.locationIds[index - 1];
      const to = route.locationIds[index];
      const edges = adjacency.get(from) ?? [];
      edges.push({ to, routeId: route.id });
      adjacency.set(from, edges);
    }
  }

  const queue = [fromId];
  const previous = new Map<string, { from: string; routeId: string }>();
  const visited = new Set(queue);
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of adjacency.get(current) ?? []) {
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      previous.set(edge.to, { from: current, routeId: edge.routeId });
      if (edge.to === toId) {
        const locationIds = [toId];
        const routeIds: string[] = [];
        let cursor = toId;
        while (cursor !== fromId) {
          const step = previous.get(cursor);
          if (!step) return null;
          locationIds.unshift(step.from);
          if (routeIds.at(-1) !== step.routeId) routeIds.push(step.routeId);
          cursor = step.from;
        }
        routeIds.reverse();
        return { locationIds, routeIds };
      }
      queue.push(edge.to);
    }
  }
  return null;
}
