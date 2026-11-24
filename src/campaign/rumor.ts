// С8: слух проходит по выбранному мастером пути; на прибытии предложение добавляет открываемый игрокам факт.
// Скорость новостей — ручное правило стола, поскольку источник не задаёт универсальную скорость.
import type { Fact, Process, State, WorldDelta, WorldPatch } from '../engine/state';
import { SECONDS_PER_DAY } from '../engine/state';
import { walkDays, route, type GraphEdge } from '../world/graph';
import type { CaravanResources, CaravanPlaceOption } from './caravan';
import { placeLocation } from './worldGraph';
import type { ProcessKind, TickContext, TickResult } from './processes';

export const RUMOR_RULES = {
  version: 'dm-cockpit-rumor/1',
  source: 'table rule; no universal source-backed news speed found',
  maximumTextLength: 500,
} as const;

export interface RumorRequestInput {
  from: string;
  to: string;
  checkpoints?: readonly string[];
  text: string;
  speedMilesPerDay: number;
  timeEventId: string;
}

interface RumorEdge { from: string; to: string; miles: number }
export interface RumorRoutePreview {
  from: CaravanPlaceOption;
  to: CaravanPlaceOption;
  nodes: readonly string[];
  edges: readonly GraphEdge[];
  miles: number;
}
interface RumorData {
  version: 1;
  kind: 'rumor';
  ruleVersion: string;
  ruleSource: string;
  fromName: string;
  toName: string;
  text: string;
  speedMilesPerDay: number;
  route: readonly RumorEdge[];
  factId: string;
  locationId: string;
}

const dayFor = (edge: RumorEdge, speed: number) => {
  const seconds = Math.max(1, Math.ceil(edge.miles / speed * SECONDS_PER_DAY));
  if (!Number.isSafeInteger(seconds)) throw new Error('скорость слишком мала: срок пути нельзя представить точно');
  return seconds;
};

export function previewRumorRoute(resources: CaravanResources, fromId: string, toId: string, checkpoints: readonly string[] = []): RumorRoutePreview | null {
  const from = resources.places.get(fromId), to = resources.places.get(toId);
  const stops = [fromId, ...checkpoints, toId];
  if (!from || !to || fromId === toId || new Set(stops).size !== stops.length || stops.some(id => !resources.places.has(id) || !resources.graph.nodes.has(id))) return null;
  const nodes: string[] = [];
  const edges: GraphEdge[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const leg = route(resources.graph, stops[i]!, stops[i + 1]!, walkDays('normal'));
    if (!leg) return null;
    nodes.push(...(i ? leg.nodes.slice(1) : leg.nodes));
    edges.push(...leg.edges);
  }
  return { from, to, nodes, edges, miles: Math.round(edges.reduce((sum, edge) => sum + edge.miles, 0) * 10) / 10 };
}
const dataOf = (p: Process): RumorData | null => {
  const data = p.data;
  return data?.kind === 'rumor' && data.version === 1 && data.ruleVersion === RUMOR_RULES.version
    && Array.isArray(data.route) && typeof data.text === 'string' ? data as unknown as RumorData : null;
};

function validateInput(input: RumorRequestInput): void {
  if (!input.from || !input.to || input.from === input.to) throw new Error('выберите два разных поселения');
  if (!input.timeEventId.trim()) throw new Error('укажите причину начала слуха');
  if (!input.text.trim() || input.text.trim().length > RUMOR_RULES.maximumTextLength) throw new Error(`текст слуха: от 1 до ${RUMOR_RULES.maximumTextLength} знаков`);
  if (!Number.isFinite(input.speedMilesPerDay) || input.speedMilesPerDay <= 0) {
    throw new Error('укажите положительную скорость слуха в милях в день — правило стола');
  }
}

function processId(from: string, to: string, sec: number, text: string, speed: number, checkpoints: readonly string[]): string {
  const signature = JSON.stringify([text, speed, checkpoints]);
  let hash = 2166136261;
  for (let i = 0; i < signature.length; i++) hash = Math.imul(hash ^ signature.charCodeAt(i), 16777619);
  return `proc-rumor-${from}-${to}-${sec}-${(hash >>> 0).toString(36)}`;
}

function pendingProcess(state: State, processId: string): boolean {
  const matches = (patch: WorldPatch) => patch.kind === 'process' && patch.process.id === processId;
  return Object.values(state.deltas).some(delta => {
    if (delta.status !== 'pending' || !delta.patch) return false;
    return delta.patch.kind === 'batch' ? delta.patch.patches.some(matches) : matches(delta.patch);
  });
}

/** Creates a private, pending route proposal. The rumor is absent from player facts until arrival is accepted. */
export function rumorProposal(state: State, resources: CaravanResources, input: RumorRequestInput): WorldDelta {
  validateInput(input);
  const from = resources.places.get(input.from), to = resources.places.get(input.to);
  if (!from || !to || !resources.graph.nodes.has(input.from) || !resources.graph.nodes.has(input.to)) throw new Error('начало или конец слуха отсутствует в графе');
  const found = previewRumorRoute(resources, input.from, input.to, input.checkpoints);
  if (!found || found.edges.length === 0) throw new Error(`между ${from.name} и ${to.name} нет сухопутного пути для слуха`);
  const fromLocation = placeLocation(state, from, resources.graph.map);
  const toLocation = placeLocation(state, to, resources.graph.map);
  const checkpoints = input.checkpoints ?? [];
  const id = processId(input.from, input.to, state.time.sec, input.text.trim(), input.speedMilesPerDay, checkpoints);
  if (state.world.processes?.[id] && !state.world.processes[id].ended) throw new Error('этот слух уже распространяется');
  if (pendingProcess(state, id)) throw new Error('этот слух уже ожидает решения');
  const factId = `fact-${id}`;
  if (state.facts[factId]) throw new Error('этот слух уже стал фактом кампании');
  const routeEdges: RumorEdge[] = found.edges.map((edge: GraphEdge, i) => ({ from: found.nodes[i]!, to: found.nodes[i + 1]!, miles: edge.miles }));
  const segmentDurations = routeEdges.map(edge => dayFor(edge, input.speedMilesPerDay));
  const totalDuration = segmentDurations.reduce((sum, seconds) => sum + seconds, 0);
  if (!Number.isSafeInteger(totalDuration) || !Number.isSafeInteger(state.time.sec + totalDuration)) {
    throw new Error('срок слуха слишком велик для точного расчёта');
  }
  const process: Process = {
    id, kind: 'rumor', name: `${from.name} → ${to.name}`, scale: 'region', stage: 'travel',
    parties: [fromLocation.location.id, toLocation.location.id], at: toLocation.location.id,
    startedSec: state.time.sec, nextSec: state.time.sec + segmentDurations[0]!,
    vars: { routeIndex: 0 },
    data: {
      version: 1, kind: 'rumor', ruleVersion: RUMOR_RULES.version, ruleSource: RUMOR_RULES.source,
      fromName: from.name, toName: to.name, text: input.text.trim(), speedMilesPerDay: input.speedMilesPerDay,
      route: routeEdges, factId, locationId: toLocation.location.id,
    } satisfies RumorData,
  };
  const patches: WorldPatch[] = [
    ...(fromLocation.patch ? [fromLocation.patch] : []),
    ...(toLocation.patch && toLocation.location.id !== fromLocation.location.id ? [toLocation.patch] : []),
    { kind: 'process', process },
  ];
  return {
    id: `sim-${input.timeEventId}-${id}`, scale: 'region', subject: `Слух · ${from.name} → ${to.name}`,
    was: 'весть не отправлена', now: `в пути · ${found.miles} мили`,
    cause: `мастер отправил весть; скорость ${input.speedMilesPerDay} миль в день — правило стола`,
    causeId: input.timeEventId, status: 'pending', patch: { kind: 'batch', patches },
  };
}

function tick(p: Process, ctx: TickContext): TickResult {
  const data = dataOf(p);
  if (!data) return { process: { ...p, ended: true, stage: 'invalid' }, line: 'неподдерживаемая версия маршрута слуха' };
  const index = Math.max(0, Math.floor(p.vars.routeIndex ?? 0));
  const edge = data.route[index];
  if (!edge) return { process: { ...p, ended: true, stage: 'invalid' }, line: 'маршрут слуха повреждён' };
  const nextIndex = index + 1;
  if (nextIndex >= data.route.length) {
    const fact: Fact = {
      id: data.factId, text: data.text, visibility: 'players', category: 'rumor', scale: 'settlement', subjectId: data.locationId,
    };
    return {
      process: { ...p, stage: 'arrived', ended: true, vars: { ...p.vars, routeIndex: nextIndex }, at: data.locationId },
      patches: [{ kind: 'newFact', fact }],
      line: `слух достиг ${data.toName}; текст станет известен игрокам после принятия предложения`,
    };
  }
  const nextEdge = data.route[nextIndex];
  return {
    process: { ...p, nextSec: ctx.sec + dayFor(nextEdge, data.speedMilesPerDay), vars: { ...p.vars, routeIndex: nextIndex } },
    line: `весть прошла ${edge.to}`,
  };
}

export const rumorKind: ProcessKind = {
  kind: 'rumor', label: 'Слух',
  stages: { travel: 'в пути', arrived: 'дошёл', invalid: 'ошибка данных' },
  progress: p => {
    const data = dataOf(p);
    if (!data) return undefined;
    return { segments: data.route.length, filled: Math.min(data.route.length, Math.max(0, Math.floor(p.vars.routeIndex ?? 0))) };
  },
  tick,
};

export function rumorPlaces(resources: CaravanResources): readonly CaravanPlaceOption[] {
  return [...resources.places.values()].flatMap(place => {
    const node = resources.graph.nodes.get(place.id);
    return node ? [{ id: node.id, name: place.name, x: node.x, y: node.y }] : [];
  }).sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id));
}
