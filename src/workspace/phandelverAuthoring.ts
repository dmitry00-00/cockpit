import type { AdventureBundle, AdventureNode } from '../packages/adventure';
import { getRuntimePlanGeometry } from '../packages/phandelverRuntimePlans';

export interface ResolvedMention { nodeId: string; label: string }
export interface AmbiguousMention { label: string; candidates: string[] }
export interface NarrativeResolution {
  mentions: ResolvedMention[];
  ambiguous: AmbiguousMention[];
  unknown: string[];
}
export interface PlanReferences {
  planIds: string[];
  /** Nodes explicitly pinned to an area in an existing runtime plan. */
  spatialIds: string[];
  /** Nodes inferred only through explicit BA23 links; these are contextual, not map placements. */
  contextIds: string[];
  /** Routes have ordered topology links but no route polyline in the selected plans. */
  routeIdsWithoutGeometry: string[];
}
export interface ReferenceSetComparison {
  sharedIds: string[];
  mapOnlyIds: string[];
  textOnlyIds: string[];
}

/** Compare exact stable graph IDs, preserving the order of each input for a readable review. */
export function compareReferenceSets(mapIds: readonly string[], textIds: readonly string[]): ReferenceSetComparison {
  const map = [...new Set(mapIds)];
  const text = [...new Set(textIds)];
  const mapSet = new Set(map);
  const textSet = new Set(text);
  return {
    sharedIds: map.filter(id => textSet.has(id)),
    mapOnlyIds: map.filter(id => !textSet.has(id)),
    textOnlyIds: text.filter(id => !mapSet.has(id)),
  };
}

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('ru').replace(/\s+/g, ' ').trim();
const word = (character: string | undefined) => !!character && /[\p{L}\p{N}]/u.test(character);

function aliasesFor(node: AdventureNode): string[] {
  return [node.name, node.id, node.id.replaceAll('-', ' '), ...(node.aliases ?? [])]
    .map(normalize).filter(Boolean);
}

function aliasIndex(bundle: AdventureBundle): Map<string, AdventureNode[]> {
  const index = new Map<string, AdventureNode[]>();
  for (const node of bundle.nodes) for (const alias of aliasesFor(node)) {
    const matches = index.get(alias) ?? [];
    if (!matches.some(match => match.id === node.id)) matches.push(node);
    index.set(alias, matches);
  }
  return index;
}

function aliasMatches(text: string, alias: string): boolean {
  let from = 0;
  while (from < text.length) {
    const at = text.indexOf(alias, from);
    if (at < 0) return false;
    const before = text[at - 1];
    const after = text[at + alias.length];
    if (!word(before) && !word(after)) return true;
    from = at + 1;
  }
  return false;
}

/** Exact, deterministic resolution against names already present in the BA23 graph. */
export function resolvePilotNarrative(bundle: AdventureBundle, narrative: string): NarrativeResolution {
  const text = normalize(narrative);
  const index = aliasIndex(bundle);
  const found = new Map<string, AdventureNode>();
  const ambiguousByAlias = new Map<string, string[]>();
  for (const [alias, candidates] of index) {
    if (!aliasMatches(text, alias)) continue;
    if (candidates.length > 1) {
      ambiguousByAlias.set(alias, candidates.map(node => node.id));
      continue;
    }
    found.set(candidates[0].id, candidates[0]);
  }

  const unknown = new Set<string>();
  const ambiguous = new Map<string, string[]>(ambiguousByAlias);
  for (const match of narrative.matchAll(/\[\[([^\]]+)\]\]|[«"“]([^»"”]+)[»"”]/g)) {
    const label = (match[1] ?? match[2]).trim();
    if (!label) continue;
    const candidates = index.get(normalize(label)) ?? [];
    if (!candidates.length) unknown.add(label);
    else if (candidates.length > 1) ambiguous.set(label, candidates.map(node => node.id));
    else found.set(candidates[0].id, candidates[0]);
  }

  const nodeOrder = new Map(bundle.nodes.map((node, position) => [node.id, position]));
  return {
    mentions: [...found.values()].sort((a, b) => nodeOrder.get(a.id)! - nodeOrder.get(b.id)!).map(node => ({ nodeId: node.id, label: node.name })),
    ambiguous: [...ambiguous].map(([label, candidates]) => ({ label, candidates: [...candidates] })),
    unknown: [...unknown],
  };
}

/** Resolve selected Plans to explicit area pins and a separate, link-derived context set. */
export function resolvePlanReferences(bundle: AdventureBundle, planIds: readonly string[]): PlanReferences {
  const nodes = new Map(bundle.nodes.map(node => [node.id, node]));
  const validPlans = [...new Set(planIds)].filter(id => nodes.get(id)?.kind === 'plan');
  const spatial = new Set<string>();
  for (const planId of validPlans) {
    const plan = nodes.get(planId)!;
    const geometry = getRuntimePlanGeometry(plan, bundle);
    for (const area of geometry?.areas ?? []) if (area.targetNodeId && nodes.has(area.targetNodeId)) spatial.add(area.targetNodeId);
  }

  const context = new Set<string>();
  const selectedLocations = new Set(spatial);
  const add = (id: string) => { if (nodes.has(id)) context.add(id); };
  for (const planId of validPlans) add(planId);

  // BA23 is a typed relation graph. Follow only explicit plan, place, route, scene and thread links.
  for (const node of bundle.nodes) {
    if (node.kind === 'location' && node.links.some(link => link.relation === 'plan' && validPlans.includes(link.target))) {
      selectedLocations.add(node.id);
      add(node.id);
    }
  }
  const childLocations = new Set<string>();
  for (const node of bundle.nodes) if (node.kind === 'location' && node.links.some(link =>
    ['within', 'on'].includes(link.relation) && selectedLocations.has(link.target))) {
    childLocations.add(node.id);
    add(node.id);
  }
  for (const id of childLocations) selectedLocations.add(id);

  const selectedRoutes: AdventureNode[] = [];
  for (const node of bundle.nodes) if (node.kind === 'route' && node.links.some(link =>
    ['from', 'via', 'to'].includes(link.relation) && selectedLocations.has(link.target))) {
    selectedRoutes.push(node);
    add(node.id);
    for (const link of node.links) if (['from', 'via', 'to'].includes(link.relation)) {
      selectedLocations.add(link.target);
      add(link.target);
    }
  }

  const scenes: AdventureNode[] = [];
  for (const node of bundle.nodes) if (node.kind === 'scene' && node.links.some(link => link.relation === 'at' && selectedLocations.has(link.target))) {
    scenes.push(node);
    add(node.id);
    for (const link of node.links) if (link.relation === 'thread') add(link.target);
  }
  // Routes reveal only their linked endpoints/topology. Scenes at a route endpoint are contextual.
  for (const node of bundle.nodes) if (node.kind === 'scene' && node.links.some(link => link.relation === 'at' &&
    selectedRoutes.some(route => route.links.some(edge => ['from', 'via', 'to'].includes(edge.relation) && edge.target === link.target)))) {
    scenes.push(node);
    add(node.id);
    for (const link of node.links) if (link.relation === 'thread') add(link.target);
  }

  const position = new Map(bundle.nodes.map((node, index) => [node.id, index]));
  const sort = (ids: Set<string>) => [...ids].sort((a, b) => position.get(a)! - position.get(b)!);
  const spatialIds = sort(spatial);
  const contextIds = sort(new Set([...context].filter(id => !spatial.has(id))));
  const routeIdsWithoutGeometry = sort(new Set([...selectedRoutes.map(route => route.id)].filter(id => !spatial.has(id))));
  return { planIds: validPlans, spatialIds, contextIds, routeIdsWithoutGeometry };
}

export const PHANDELVER_PILOT_PLANS = ['town-plan', 'hideout-plan'] as const;

/** Short authored recap uses only names/IDs in the selected BA23 opening graph. */
export const PHANDELVER_PILOT_RECAP = 'Начало связывает маршрут «Доставка припасов» к Фандалину с задачей «Доставить груз и найти Гандрена» и передачей груза в сцене «Сдача припасов». Для мастера подготовлены «Засада на дороге», «По следам похитителей», маршрут «Тропа к пещере» и место «Убежище Каменных Пастей». Это схема подготовки: игровые события и их исходы пока не заданы.';
