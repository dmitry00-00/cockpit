import type { AdventureBundle, AdventureNode } from './adventure';

export interface AdventureSceneRunSheet {
  scene: AdventureNode;
  places: AdventureNode[];
  plans: AdventureNode[];
  participants: AdventureNode[];
  threads: AdventureNode[];
  facts: AdventureNode[];
  items: AdventureNode[];
  proposals: AdventureNode[];
}

const targetsFor = (bundle: AdventureBundle, node: AdventureNode, relation: string) =>
  node.links.flatMap(link => link.relation === relation
    ? bundle.nodes.filter(candidate => candidate.id === link.target)
    : []);

/** Build a DM-only, source-linked scene view from explicit graph edges. It never guesses names or creates state. */
export function adventureSceneRunSheet(bundle: AdventureBundle, sceneId: string): AdventureSceneRunSheet | undefined {
  const scene = bundle.nodes.find(node => node.id === sceneId && node.kind === 'scene');
  if (!scene) return undefined;

  const byId = new Map(bundle.nodes.map(node => [node.id, node]));
  const places = [...new Set([
    ...targetsFor(bundle, scene, 'at'),
    ...targetsFor(bundle, scene, 'within'),
  ].filter(node => node.kind === 'location'))];

  // Walk only explicit containment edges to find parent places; this connects keyed rooms to their floor plan.
  const placeContext = new Map(places.map(place => [place.id, place]));
  const queue = [...places];
  while (queue.length) {
    const current = queue.shift()!;
    for (const parent of targetsFor(bundle, current, 'within')) {
      if (parent.kind === 'location' && !placeContext.has(parent.id)) {
        placeContext.set(parent.id, parent);
        queue.push(parent);
      }
    }
  }

  const placeIds = new Set(placeContext.keys());
  const plans = bundle.nodes.filter(node => node.kind === 'plan' && (
    node.links.some(link => link.relation === 'depicts' && placeIds.has(link.target)) ||
    [...placeContext.values()].some(place => place.links.some(link => link.relation === 'plan' && link.target === node.id))
  ));
  const participants = targetsFor(bundle, scene, 'participant');
  const threads = targetsFor(bundle, scene, 'thread');
  const facts = bundle.nodes.filter(node => node.kind === 'fact' && (
    scene.links.some(link => link.relation === 'fact' && link.target === node.id) ||
    node.links.some(link => link.relation === 'discover-in' && link.target === scene.id)
  ));

  const itemIds = new Set<string>();
  const itemRelations = new Set(['contains', 'carries', 'refers-to-item']);
  for (const source of [scene, ...placeContext.values(), ...participants, ...facts]) {
    for (const link of source.links) if (itemRelations.has(link.relation) && byId.get(link.target)?.kind === 'item') itemIds.add(link.target);
  }
  for (const item of bundle.nodes.filter(node => node.kind === 'item')) {
    if (item.links.some(link => link.relation === 'unlocks' && placeIds.has(link.target))) itemIds.add(item.id);
  }
  const items = bundle.nodes.filter(node => itemIds.has(node.id));
  const proposals = bundle.nodes.filter(node => node.kind === 'proposal' &&
    node.links.some(link => link.relation === 'after-scene' && link.target === scene.id));

  return { scene, places, plans, participants, threads, facts, items, proposals };
}
