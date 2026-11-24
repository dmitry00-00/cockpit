// Караван (SIMULATION.md С3): чистый вид процесса. Тяжёлые данные мира загружаются только по явному async prepare;
// этот модуль и его граф не попадают в начальный кусок. Процесс хранит версионированный снимок пути.
import type { WorldDelta, WorldPatch, Process } from '../engine/state';
import { MAPS } from '../map/maps';
import { seasonOf, harptos } from './calendar';
import { equilibrium, priceOfStock } from './trade';
import { locationOfPlace, placeLocation, type PlaceStub } from './worldGraph';
import { d20, rollOf } from './rng';
import { loadEcon, econOfPlace, type Econ } from '../world/econ';
import { loadKingdoms } from '../world/kingdoms';
import { loadGraph, route, type GraphEdge, type WorldGraph } from '../world/graph';
import { loadGazetteer } from '../map/gazetteer';
import { TEMPO_SECONDS } from '../engine/events';
import type { ProcessKind, TickContext, TickResult } from './processes';
import { GOODS, type GoodsId, type Location, type State } from '../engine/state';
import { cityTradeFlow, isCityTradeBlocked, isPlaceBlockaded } from './urban';
import { confirmedTempleTreatment, epidemicExposurePatch, URBAN_RULES } from './urban';
import { isWarFrontPlace } from './war';
import type { Organization, PlaceFaith } from '../world/organizations';
import { loadOrganizations, loadPlaceFaiths } from '../world/organizations';

const DAY = TEMPO_SECONDS.day;
const MAP_ID = 'toril';
const CARAVAN_SPEED = 16; // A5E Slow/Wagon, миль/день.
const WATER_SPEED = 48; // SRD sailing ship 2 mph × 24 часа.
const REST_FACTOR = 5 / 4; // правило стола: стоянка каждый пятый день, калибровка к медиане канона.
const routeClosed = (state: import('../engine/state').State, placeId: string) => isPlaceBlockaded(state, placeId) ? 'блокада' : isWarFrontPlace(state, placeId) ? 'фронт войны' : undefined;

export interface CaravanRoute {
  /** Route schema version. Missing means the original v1 process snapshot format. */
  version?: 1;
  map: string;
  nodes: readonly string[];
  edges: readonly GraphEdge[];
  miles: number;
  days: number;
  /** Optional policy/checkpoints; absent on old route snapshots. */
  transport?: CaravanTransport;
  checkpoints?: readonly string[];
}
export type CaravanTransport = 'any' | 'land' | 'water';
export interface CaravanRouteOptions {
  transport?: CaravanTransport;
  /** Ordered intermediate settlements; they are ordinary route nodes, not extra market stops. */
  checkpoints?: readonly string[];
}
export interface CaravanPlaceOption {
  id: string;
  name: string;
  x: number;
  y: number;
}
export type CaravanRoutePreview =
  | { ok: true; from: CaravanPlaceOption; to: CaravanPlaceOption; route: CaravanRoute }
  | { ok: false; reason: 'resources-unavailable' | 'same-place' | 'unknown-place' | 'not-in-graph' | 'invalid-checkpoint' | 'invalid-transport' | 'no-route'; message: string };
export interface CaravanRequestInput {
  from: string;
  to: string;
  goods: GoodsId;
  quantity?: number;
  escort?: number;
  transport?: CaravanTransport;
  checkpoints?: readonly string[];
  timeEventId: string;
}
export interface TradeLineRequestInput extends Omit<CaravanRequestInput, 'timeEventId'> {
  intervalDays: number;
  timeEventId: string;
}
interface CaravanData {
  version: 1;
  kind: 'caravan';
  map: string;
  fromPlace: string;
  toPlace: string;
  goods: GoodsId;
  quantity: number;
  escort: number;
  route: CaravanRoute;
  transport?: CaravanTransport;
  checkpoints?: readonly string[];
  tradeLineId?: string;
  contagion?: CaravanContagion;
}
interface CaravanContagion {
  id: string;
  sourceProcessId: string;
  departureSec: number;
  infectionRoll: number;
  infectedShare: number;
  transmitted: boolean;
  incubationDays: number;
  r0: number;
}
interface TradeLineData {
  version: 1;
  kind: 'trade-line';
  map: string;
  fromPlace: string;
  toPlace: string;
  goods: GoodsId;
  quantity: number;
  escort: number;
  intervalDays: number;
  transport: CaravanTransport;
  checkpoints: readonly string[];
  route: CaravanRoute;
}

export interface CaravanResources {
  graph: WorldGraph;
  places: ReadonlyMap<string, PlaceStub>;
  econ: Econ;
  kingdoms: ReadonlyMap<string, import('../world/kingdoms').Kingdom>;
  organizations?: ReadonlyMap<string, Organization>;
  placeFaiths?: Readonly<Record<string, PlaceFaith>>;
}

/** Асинхронная граница подготовки: этот вызов должен закончиться до TIME_ADVANCED. */
export async function loadCaravanResources(): Promise<CaravanResources | null> {
  const map = MAPS[MAP_ID];
  if (!map?.graph?.url) return null;
  const [graph, gazetteer, econ, kingdoms, organizations, placeFaiths] = await Promise.all([
    loadGraph(map.graph.url), loadGazetteer(MAP_ID), loadEcon(), loadKingdoms(),
    loadOrganizations().catch(() => undefined), loadPlaceFaiths().catch(() => undefined),
  ]);
  if (!graph) return null;
  return {
    graph,
    places: new Map(gazetteer.map(p => [p.id, { id: p.id, name: p.name, x: p.x, y: p.y }])),
    econ,
    kingdoms,
    organizations,
    placeFaiths,
  };
}

const routeCost = (edge: GraphEdge) => {
  const base = edge.mode === 'water'
    ? edge.miles / WATER_SPEED
    : (edge.miles * (1 + (edge.mode === 'land' ? edge.rough ?? 0 : 0))) / CARAVAN_SPEED;
  return base * REST_FACTOR;
};

function routeFor(resources: CaravanResources, from: string, to: string, options: CaravanRouteOptions = {}): CaravanRoute | null {
  const transport = options.transport ?? 'any';
  const checkpoints = [...(options.checkpoints ?? [])];
  const stops = [from, ...checkpoints, to];
  if (new Set(stops).size !== stops.length || stops.some(id => !resources.graph.nodes.has(id))) return null;
  const nodes: string[] = [];
  const edges: GraphEdge[] = [];
  let miles = 0, days = 0;
  const canUse = (edge: GraphEdge) => {
    if (transport === 'land' && edge.mode === 'water') return false;
    if (transport === 'water' && edge.mode !== 'water') return false;
    if (edge.mode === 'water' && (!resources.graph.nodes.get(edge.a)?.harbour || !resources.graph.nodes.get(edge.b)?.harbour)) return false;
    return true;
  };
  for (let i = 0; i < stops.length - 1; i++) {
    const part = route(resources.graph, stops[i], stops[i + 1], edge => canUse(edge) ? routeCost(edge) : undefined);
    if (!part) return null;
    nodes.push(...(i ? part.nodes.slice(1) : part.nodes));
    edges.push(...part.edges);
    miles += part.miles;
    days += part.cost;
  }
  return Object.freeze({
    version: 1 as const, map: resources.graph.map,
    nodes: Object.freeze(nodes), edges: Object.freeze(edges.map(edge => Object.freeze({ ...edge }))),
    miles, days: Math.round(days * 10) / 10,
    ...(transport !== 'any' ? { transport } : {}),
    ...(checkpoints.length ? { checkpoints: Object.freeze(checkpoints) } : {}),
  });
}

/** Available choices are real gazetteer entries whose stable IDs also exist in this map graph. */
export function caravanPlaces(resources: CaravanResources): CaravanPlaceOption[] {
  return [...resources.places.values()]
    .flatMap(place => {
      const node = resources.graph.nodes.get(place.id);
      return node ? [{ id: node.id, name: place.name, x: node.x, y: node.y }] : [];
    })
    .sort((a, b) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

const previewFailure = (reason: Extract<CaravanRoutePreview, { ok: false }>['reason'], message: string): CaravanRoutePreview => ({ ok: false, reason, message });

/** Route-only preview. It reads prepared resources and returns a frozen snapshot without changing campaign state. */
export function previewCaravanRoute(resources: CaravanResources | null, from: string, to: string, options: CaravanRouteOptions = {}): CaravanRoutePreview {
  if (!resources) return previewFailure('resources-unavailable', 'данные торговых маршрутов ещё не загружены');
  if (!['any', 'land', 'water'].includes(options.transport ?? 'any')) return previewFailure('invalid-transport', 'неизвестный способ перевозки');
  if (from === to) return previewFailure('same-place', 'для каравана выберите два разных поселения');
  const fromPlace = resources.places.get(from), toPlace = resources.places.get(to);
  if (!fromPlace || !toPlace) return previewFailure('unknown-place', 'выбранное место отсутствует в справочнике карты');
  if (!resources.graph.nodes.has(from) || !resources.graph.nodes.has(to)) return previewFailure('not-in-graph', 'одно из мест отсутствует в графе маршрутов');
  const checkpoints = [...(options.checkpoints ?? [])];
  if (new Set([from, ...checkpoints, to]).size !== checkpoints.length + 2) {
    return previewFailure('invalid-checkpoint', 'контрольные точки должны быть уникальны и отличаться от начала и конца пути');
  }
  if (checkpoints.some(id => !resources.places.has(id) || !resources.graph.nodes.has(id))) {
    return previewFailure('invalid-checkpoint', 'контрольная точка должна быть поселением из графа торговых путей');
  }
  const route = routeFor(resources, from, to, options);
  if (!route || route.nodes.length < 2) return previewFailure('no-route', `между ${fromPlace.name} и ${toPlace.name} нет доступного маршрута`);
  if (route.nodes.some(id => !resources.places.has(id))) {
    return previewFailure('unknown-place', 'для части поселений на пути нет данных справочника; маршрут пока недоступен');
  }
  const nodeOption = (id: string, name: string): CaravanPlaceOption => {
    const node = resources.graph.nodes.get(id)!;
    return { id: node.id, name, x: node.x, y: node.y };
  };
  return { ok: true, from: nodeOption(from, fromPlace.name), to: nodeOption(to, toPlace.name), route };
}

function placeIn(state: State, resources: CaravanResources, placeId: string) {
  const stub = resources.places.get(placeId);
  if (!stub) throw new Error(`место графа ${placeId} отсутствует в справочнике`);
  const existing = locationOfPlace(state, placeId);
  if (existing) return { location: existing, patches: [] as WorldPatch[] };
  const placed = placeLocation(state, stub, MAP_ID);
  return { location: placed.location, patches: placed.patch ? [placed.patch] : [] };
}

function contagionAtDeparture(state: State, originLocationId: string, caravanId: string, sec: number): CaravanContagion | undefined {
  const source = Object.values(state.world.processes ?? {})
    .filter(process => process.kind === 'epidemic' && process.at === originLocationId && !process.ended
      && (process.data as { kind?: string; disease?: string } | undefined)?.kind === 'epidemic'
      && (process.data as { disease?: string } | undefined)?.disease === 'Sewer Plague')
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!source) return undefined;
  const population = state.world.locations[originLocationId]?.population ?? source.vars.population ?? 0;
  const infected = Math.max(0, source.vars.infected ?? 0);
  const infectedShare = population > 0 ? Math.min(1, infected / population) : 0;
  const infectionRoll = d20('зараза', caravanId, String(sec));
  const transmitted = infectionRoll / 20 <= infectedShare;
  return {
    id: `caravan-exposure-${caravanId}-${sec}`,
    sourceProcessId: source.id, departureSec: sec, infectionRoll, infectedShare, transmitted,
    incubationDays: transmitted ? rollOf(4, 'зараза-инкубация', caravanId, String(sec)) : 0,
    r0: Math.max(URBAN_RULES.minR0, Math.min(URBAN_RULES.maxR0, source.vars.r0 ?? URBAN_RULES.minR0)),
  };
}

function contagionNote(contagion: CaravanContagion | undefined): string {
  if (!contagion) return '';
  const chance = Math.round(contagion.infectedShare * 1000) / 10;
  return contagion.transmitted
    ? `; заражение караваном: d20 ${contagion.infectionRoll}/20 ≤ доле больных ${chance}% — случай инкубирует ${contagion.incubationDays} дн.`
    : `; заражение караваном: d20 ${contagion.infectionRoll}/20 > доле больных ${chance}% — переноса нет`;
}

function arrivalExposure(
  state: State,
  resources: CaravanResources,
  data: CaravanData,
  destination: Location,
  sec: number,
): { patch?: WorldPatch; note: string } {
  const contagion = data.contagion;
  if (!contagion?.transmitted) return { note: contagionNote(contagion) };
  const elapsedDays = Math.max(0, Math.floor((sec - contagion.departureSec) / DAY));
  const incubationDays = Math.max(0, contagion.incubationDays - elapsedDays);
  const treatment = confirmedTempleTreatment(data.toPlace, harptos(sec).year, resources.organizations?.values(), resources.placeFaiths);
  const exposure = {
    id: contagion.id,
    incubationDays,
    treatmentTemples: treatment.temples,
    treatmentPerDay: treatment.perDay,
    treatmentSource: treatment.source,
  };
  const patch = epidemicExposurePatch(state, destination.id, exposure, contagion.r0, sec, destination);
  if (!patch) return { note: `; носитель прибыл, но вспышка не заведена: население города не подтверждено` };
  const elapsed = contagion.incubationDays - incubationDays;
  const incubationNote = incubationDays > 0 ? `инкубация ещё ${incubationDays} дн.` : `инкубация ${elapsed} дн. завершилась в пути`;
  return { patch, note: `; Sewer Plague занесена в ${destination.name}: ${incubationNote}; подтверждённое лечение ${treatment.perDay}/день` };
}

function marketStock(state: State, resources: CaravanResources, locationId: string, placeId: string, goods: GoodsId, sec: number): number {
  const loc = state.world.locations[locationId];
  if (loc?.stock?.[goods] !== undefined) return loc.stock[goods]!;
  const year = harptos(sec).year;
  const market = econOfPlace(resources.econ, resources.kingdoms.values(), placeId, year);
  const base = equilibrium(goods, market, seasonOf(sec), false);
  if (goods !== 'food') return base;
  const blockadeLoss = Object.values(state.world.processes ?? {}).reduce((loss, process) => {
    if (process.kind !== 'blockade' || process.ended || process.data?.kind !== 'blockade') return loss;
    const data = process.data as { targetPlaceId?: string; relationPlaces?: readonly string[] };
    return data.targetPlaceId === placeId || data.relationPlaces?.includes(placeId)
      ? loss + (process.vars.foodEquilibriumLoss ?? 0) : loss;
  }, 0);
  return Math.max(0, base - blockadeLoss);
}

function patchStockAndPrice(locationId: string, goods: GoodsId, next: number): WorldPatch[] {
  return [
    { kind: 'stock', id: locationId, goods, value: next },
    { kind: 'price', id: locationId, goods, value: priceOfStock(goods, next) },
  ];
}

/** Предложение фиксированной первой вертикали или выбранного маршрута. Создание не меняет мир до Accept. */
export function caravanProposal(
  state: State,
  resources: CaravanResources,
  input: CaravanRequestInput,
): WorldDelta {
  const quantity = input.quantity ?? 1;
  const escort = input.escort ?? 3;
  if (!GOODS.includes(input.goods)) throw new Error(`неизвестный груз каравана: ${String(input.goods)}`);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('объём каравана должен быть больше нуля');
  if (!Number.isInteger(escort) || escort < 0 || escort > 5) throw new Error('охрана каравана — целое от 0 до 5');
  if (input.timeEventId.trim() === '') throw new Error('укажите причину отправки каравана');
  const transport = input.transport ?? 'any';
  if (!['any', 'land', 'water'].includes(transport)) throw new Error('неизвестный способ перевозки');
  const checkpoints = [...(input.checkpoints ?? [])];
  const preview = previewCaravanRoute(resources, input.from, input.to, { transport, checkpoints });
  if (!preview.ok) throw new Error(preview.message);
  if (isCityTradeBlocked(state, input.from, input.to)) throw new Error('между городами действует дипломатическая блокада: отношение фракций −3');
  const way = preview.route;
  const blocked = way.nodes.find(placeId => routeClosed(state, placeId));
  if (blocked) throw new Error(routeClosed(state, blocked) === 'блокада'
    ? `маршрут проходит через место под блокадой: ${resources.places.get(blocked)?.name ?? blocked}`
    : `торговый поток через фронт равен нулю: ${resources.places.get(blocked)?.name ?? blocked}`);
  const origin = placeIn(state, resources, input.from);
  const destination = placeIn(state, resources, input.to);
  const originStock = marketStock(state, resources, origin.location.id, input.from, input.goods, state.time.sec);
  const destinationStock = marketStock(state, resources, destination.location.id, input.to, input.goods, state.time.sec);
  if (originStock < quantity) throw new Error(`в ${origin.location.name} недостаточно ${input.goods}: запас ${originStock}, нужно ${quantity}`);
  if (input.goods !== 'food' && destinationStock + quantity > 10) throw new Error(`в ${destination.location.name} нет места для груза ${input.goods}`);

  const id = `proc-caravan-${input.from}-${input.to}-${input.goods}`;
  const previous = state.world.processes?.[id];
  const completed = previous?.kind === 'caravan' && previous.ended && (previous.stage === 'arrived' || previous.stage === 'lost');
  if ((previous && !completed) || Object.values(state.deltas).some(d => d.status === 'pending' && d.subject === `Караван · ${origin.location.name} → ${destination.location.name} (${input.goods})`)) {
    throw new Error(`караван ${origin.location.name} → ${destination.location.name} уже существует или ждёт решения`);
  }
  const contagion = contagionAtDeparture(state, origin.location.id, id, state.time.sec);
  const process: Process = {
    id, kind: 'caravan', name: `${origin.location.name} → ${destination.location.name} (${input.goods})`, scale: 'region', stage: 'transit',
    parties: [origin.location.id, destination.location.id], at: origin.location.id,
    startedSec: state.time.sec, nextSec: state.time.sec + Math.max(1, Math.ceil(routeCost(way.edges[0]) * DAY)),
    vars: { routeIndex: 0, delayDays: 0 },
    clock: { segments: Math.max(1, way.nodes.length - 1), filled: 0 },
    data: {
      version: 1, kind: 'caravan', map: MAP_ID, fromPlace: input.from, toPlace: input.to,
      goods: input.goods, quantity, escort, route: way,
      ...(transport !== 'any' ? { transport } : {}), ...(checkpoints.length ? { checkpoints } : {}),
      ...(contagion ? { contagion } : {}),
    } satisfies CaravanData,
  };
  const patches: WorldPatch[] = [
    ...origin.patches, ...destination.patches,
    ...patchStockAndPrice(origin.location.id, input.goods, originStock - quantity),
    { kind: 'process', process },
  ];
  const subject = `Караван · ${origin.location.name} → ${destination.location.name} (${input.goods})`;
  return {
    id: `sim-${input.timeEventId}-${id}`, scale: 'region', subject,
    was: 'караван не отправлен', now: `в пути · ${way.miles} мили · ${way.days} дня${contagionNote(contagion)}`,
    cause: `отправление из ${origin.location.name}; запас ${input.goods} уменьшен на ${quantity}${contagionNote(contagion)}`,
    causeId: input.timeEventId, status: 'pending', patch: { kind: 'batch', patches },
  };
}

const lineSubject = (p: Pick<Process, 'name'>) => `Торговая линия · ${p.name}`;
const lineName = (from: string, to: string, goods: GoodsId) => `${from} → ${to} (${goods})`;

function tradeLineDataOf(p: Process): TradeLineData | null {
  const data = p.data;
  if (!data || data.kind !== 'trade-line' || data.version !== 1
    || typeof data.fromPlace !== 'string' || typeof data.toPlace !== 'string'
    || !GOODS.includes(data.goods as GoodsId) || !Number.isFinite(data.quantity) || Number(data.quantity) <= 0
    || !Number.isInteger(data.escort) || Number(data.escort) < 0 || Number(data.escort) > 5
    || !Number.isSafeInteger(data.intervalDays) || Number(data.intervalDays) <= 0
    || !['any', 'land', 'water'].includes(String(data.transport))
    || !Array.isArray(data.checkpoints) || !data.checkpoints.every(id => typeof id === 'string')
    || !data.route || typeof data.route !== 'object'
    || !Array.isArray((data.route as Record<string, unknown>).nodes)
    || !Array.isArray((data.route as Record<string, unknown>).edges)) return null;
  return data as unknown as TradeLineData;
}

/** Stores a repeating route. The first cargo movement is proposed at its first scheduled departure. */
export function tradeLineProposal(state: State, resources: CaravanResources, input: TradeLineRequestInput): WorldDelta {
  if (input.timeEventId.trim() === '') throw new Error('укажите причину создания торговой линии');
  if (!Number.isSafeInteger(input.intervalDays) || input.intervalDays <= 0) throw new Error('интервал рейсов должен быть положительным числом дней');
  const nextSec = state.time.sec + input.intervalDays * DAY;
  if (!Number.isSafeInteger(nextSec)) throw new Error('дата первого рейса выходит за допустимый диапазон');
  if (!GOODS.includes(input.goods)) throw new Error(`неизвестный груз каравана: ${String(input.goods)}`);
  const quantity = input.quantity ?? 1, escort = input.escort ?? 3, transport = input.transport ?? 'any';
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('объём каравана должен быть больше нуля');
  if (!Number.isInteger(escort) || escort < 0 || escort > 5) throw new Error('охрана каравана — целое от 0 до 5');
  if (!['any', 'land', 'water'].includes(transport)) throw new Error('неизвестный способ перевозки');
  const checkpoints = [...(input.checkpoints ?? [])];
  const preview = previewCaravanRoute(resources, input.from, input.to, { transport, checkpoints });
  if (!preview.ok) throw new Error(preview.message);
  if (isCityTradeBlocked(state, input.from, input.to)) throw new Error('между городами действует дипломатическая блокада: отношение фракций −3');
  const blocked = preview.route.nodes.find(id => routeClosed(state, id));
  if (blocked) throw new Error(routeClosed(state, blocked) === 'блокада'
    ? `маршрут проходит через место под блокадой: ${resources.places.get(blocked)?.name ?? blocked}`
    : `торговый поток через фронт равен нулю: ${resources.places.get(blocked)?.name ?? blocked}`);
  const origin = placeIn(state, resources, input.from), destination = placeIn(state, resources, input.to);
  const id = `trade-line-${input.from}-${input.to}-${input.goods}`;
  const existing = state.world.processes?.[id];
  const name = lineName(origin.location.name, destination.location.name, input.goods);
  const subject = `Торговая линия · ${name}`;
  if ((existing && !existing.ended) || Object.values(state.deltas).some(delta => delta.status === 'pending' && delta.subject === subject)) {
    throw new Error(`торговая линия ${name} уже существует или ждёт решения`);
  }
  const process: Process = {
    id, kind: 'trade-line', name, scale: 'region', stage: 'scheduled',
    parties: [origin.location.id, destination.location.id], at: origin.location.id,
    startedSec: state.time.sec, nextSec, vars: { departures: 0, skipped: 0 },
    data: {
      version: 1, kind: 'trade-line', map: MAP_ID, fromPlace: input.from, toPlace: input.to,
      goods: input.goods, quantity, escort, intervalDays: input.intervalDays, transport, checkpoints, route: preview.route,
    } satisfies TradeLineData,
    causeId: input.timeEventId,
  };
  const patches: WorldPatch[] = [...origin.patches, ...destination.patches, { kind: 'process', process }];
  return {
    id: `sim-${input.timeEventId}-${id}`, scale: 'region', subject,
    was: 'линия не настроена', now: `первый рейс через ${input.intervalDays} дн.; затем каждые ${input.intervalDays} дн.`,
    cause: `мастер настроил повторяющийся маршрут ${origin.location.name} → ${destination.location.name}; расписание действует после принятия`,
    causeId: input.timeEventId, status: 'pending', patch: patches.length === 1 ? patches[0] : { kind: 'batch', patches },
  };
}

/** Stopping a schedule is an ordinary reversible process patch. */
export function tradeLineEndProposal(state: State, processId: string, timeEventId: string): WorldDelta {
  const process = state.world.processes?.[processId];
  if (!process || process.kind !== 'trade-line' || process.ended || !tradeLineDataOf(process)) throw new Error('активная торговая линия не найдена');
  if (!timeEventId.trim()) throw new Error('укажите причину остановки торговой линии');
  const subject = lineSubject(process);
  if (Object.values(state.deltas).some(delta => delta.status === 'pending' && delta.subject === subject)) {
    throw new Error('сначала разрешите ожидающее решение по этой торговой линии');
  }
  const stopped: Process = { ...process, stage: 'stopped', ended: true };
  return {
    id: `stop-${timeEventId}-${process.id}`, scale: process.scale, subject,
    was: 'расписание активно', now: 'остановлено', cause: 'мастер остановил повторяющиеся отправления',
    causeId: timeEventId, status: 'pending', patch: { kind: 'process', process: stopped },
  };
}

function routeProgress(p: Process, routeNodes: number): Process {
  const segments = Math.max(1, routeNodes - 1);
  return { ...p, clock: { ...p.clock, segments, filled: Math.min(segments, Math.max(0, Math.floor(p.vars.routeIndex ?? 0))) } };
}

/** Готовая первая демонстрация: Waterdeep → Neverwinter, ткани; граф и места берутся из пакета карты. */
export function waterdeepToNeverwinter(state: State, resources: CaravanResources, timeEventId: string): WorldDelta {
  const named = (name: string) => [...resources.places.values()].find(p => p.name.toLowerCase() === name.toLowerCase());
  const from = named('Waterdeep'), to = named('Neverwinter');
  if (!from || !to) throw new Error('в графе Toril отсутствует Waterdeep или Neverwinter');
  return caravanProposal(state, resources, { from: from.id, to: to.id, goods: 'cloth', quantity: 1, escort: 3, timeEventId });
}

function dataOf(p: Process): CaravanData | null {
  const data = p.data;
  const route = data?.route;
  if (!data || data.kind !== 'caravan' || data.version !== 1 || !route || typeof route !== 'object' || !Array.isArray((route as Record<string, unknown>).nodes) || !Array.isArray((route as Record<string, unknown>).edges) || ((route as Record<string, unknown>).version !== undefined && (route as Record<string, unknown>).version !== 1)) return null;
  return data as unknown as CaravanData;
}

function tick(p: Process, ctx: TickContext, resources: CaravanResources): TickResult {
  const data = dataOf(p);
  if (!data) return { process: { ...p, ended: true, stage: 'invalid' }, line: 'неизвестная версия маршрута каравана' };
  const index = Math.max(0, Math.floor(p.vars.routeIndex ?? 0));
  if (isCityTradeBlocked(ctx.state, data.fromPlace, data.toPlace)) {
    return {
      process: { ...p, stage: 'blocked', nextSec: Number.MAX_SAFE_INTEGER, vars: { ...p.vars, blockedByRelation: 1, blockedRouteIndex: Math.min(index + 1, data.route.nodes.length - 1) } },
      line: 'караван остановлен дипломатической блокадой между городами (отношение −3)',
    };
  }
  const destinationId = data.route.nodes.at(-1)!;
  // A delayed final leg is persisted as a pending arrival. Its risk was already
  // rolled on the previous tick, so resume/replay must only settle the cargo.
  if (p.vars.arrivalPending === 1) {
    const destination = resources.places.get(destinationId);
    if (!destination) return { process: { ...p, ended: true, stage: 'invalid' }, line: `место ${destinationId} отсутствует в справочнике карты` };
    const landedPlace = placeIn(ctx.state, resources, destinationId);
    const market = marketStock(ctx.state, resources, landedPlace.location.id, destinationId, data.goods, ctx.sec);
    const landed = data.goods === 'food' ? market + data.quantity : Math.min(10, market + data.quantity);
    const infection = arrivalExposure(ctx.state, resources, data, landedPlace.location, ctx.sec);
    return {
      process: routeProgress({ ...p, at: landedPlace.location.id, stage: 'arrived', ended: true, vars: { ...p.vars, arrivalPending: 0 } }, data.route.nodes.length),
      patches: [...landedPlace.patches, ...patchStockAndPrice(landedPlace.location.id, data.goods, landed), ...(infection.patch ? [infection.patch] : [])],
      line: `прибыл в ${landedPlace.location.name}: ${data.goods} +${data.quantity}; задержка завершена${infection.note}`,
    };
  }
  const nextNodeId = data.route.nodes[index + 1];
  if (!nextNodeId) return { process: { ...p, ended: true, stage: 'invalid' }, line: 'маршрут каравана повреждён' };
  const nextPlace = resources.places.get(nextNodeId);
  if (!nextPlace) return { process: { ...p, ended: true, stage: 'invalid' }, line: `место ${nextNodeId} отсутствует в справочнике карты` };
  const targetIndex = index + 1;
  if (routeClosed(ctx.state, nextNodeId)) {
    const closure = routeClosed(ctx.state, nextNodeId);
    return {
      process: { ...p, stage: 'blocked', nextSec: Number.MAX_SAFE_INTEGER, vars: { ...p.vars, blockedRouteIndex: targetIndex } },
      line: closure === 'блокада' ? `ожидает снятия блокады у ${nextPlace.name}` : `задержан на фронте у ${nextPlace.name}; торговый поток равен нулю`,
    };
  }
  const next = placeIn(ctx.state, resources, nextNodeId);
  const isArrival = nextNodeId === destinationId;
  const currentDanger = next.location.danger ?? 'medium';
  const dc = currentDanger === 'low' ? 10 : currentDanger === 'high' ? 14 : 12;
  const roll = d20(p.id, String(ctx.sec), `region:${targetIndex}`);
  const total = roll + data.escort;
  const gap = dc - total;
  const patches: WorldPatch[] = [...next.patches];
  if (gap >= 5) {
    const currentWeight = next.location.encounters?.Bandit ?? 1;
    patches.push({ kind: 'encounter', id: next.location.id, key: 'Bandit', value: Math.max(1.5, currentWeight * 1.5) });
    return {
      process: routeProgress({ ...p, at: next.location.id, stage: 'lost', ended: true, vars: { ...p.vars, routeIndex: targetIndex } }, data.route.nodes.length),
      patches, line: `потерян в ${next.location.name}: охрана ${total} против Сл ${dc}; «Bandit» ×1,5`,
    };
  }
  const delayDays = gap > 0 ? rollOf(4, p.id, String(ctx.sec), `delay:${targetIndex}`) : 0;
  if (isArrival) {
    if (delayDays > 0) {
      return {
        process: routeProgress({
          ...p, at: next.location.id, nextSec: ctx.sec + delayDays * DAY,
          vars: { ...p.vars, routeIndex: targetIndex, arrivalPending: 1, delayDays: (p.vars.delayDays ?? 0) + delayDays },
        }, data.route.nodes.length),
        patches,
        line: `достиг ${next.location.name}: задержка ${delayDays} дн.; груз ещё в пути`,
      };
    }
    const market = marketStock(ctx.state, resources, next.location.id, data.toPlace, data.goods, ctx.sec);
    const landed = data.goods === 'food' ? market + data.quantity : Math.min(10, market + data.quantity);
    patches.push(...patchStockAndPrice(next.location.id, data.goods, landed));
    const infection = arrivalExposure(ctx.state, resources, data, next.location, ctx.sec);
    if (infection.patch) patches.push(infection.patch);
    return {
      process: routeProgress({ ...p, at: next.location.id, stage: 'arrived', ended: true, vars: { ...p.vars, routeIndex: targetIndex, delayDays: (p.vars.delayDays ?? 0) + delayDays } }, data.route.nodes.length),
      patches, line: `прибыл в ${next.location.name}: ${data.goods} +${data.quantity}; охрана ${total} против Сл ${dc}${infection.note}`,
    };
  }
  const nextEdge = data.route.edges[targetIndex];
  const nextDays = nextEdge ? routeCost(nextEdge) : 1;
  return {
    process: routeProgress({
      ...p, at: next.location.id, nextSec: ctx.sec + Math.max(1, Math.ceil((nextDays + delayDays) * DAY)),
      vars: { ...p.vars, routeIndex: targetIndex, delayDays: (p.vars.delayDays ?? 0) + delayDays },
    }, data.route.nodes.length),
    patches,
    line: `прошёл ${next.location.name}: охрана ${total} против Сл ${dc}${delayDays ? `, задержка ${delayDays} дн.` : ''}`,
  };
}

export function caravanKind(resources: CaravanResources): ProcessKind {
  return {
    kind: 'caravan', label: 'Караван', stages: { transit: 'в пути', blocked: 'маршрут перекрыт', arrived: 'прибыл', lost: 'потерян', invalid: 'ошибка данных' },
    progress: process => {
      const data = dataOf(process);
      if (!data) return undefined;
      const segments = Math.max(1, data.route.nodes.length - 1);
      return { segments, filled: Math.min(segments, Math.max(0, Math.floor(process.vars.routeIndex ?? 0))) };
    },
    tick: (p, ctx) => tick(p, ctx, resources),
  };
}

function tickTradeLine(p: Process, ctx: TickContext, resources: CaravanResources): TickResult {
  const data = tradeLineDataOf(p);
  if (!data || data.map !== resources.graph.map) return { process: { ...p, ended: true, stage: 'invalid' }, line: 'неподдерживаемая версия торговой линии' };
  const nextSec = p.nextSec + data.intervalDays * DAY;
  if (!Number.isSafeInteger(nextSec) || nextSec <= ctx.sec) return { process: { ...p, ended: true, stage: 'invalid' }, line: 'расписание торговой линии вышло за допустимый диапазон' };
  const updated = (extra: Partial<Process> = {}) => ({
    ...p, ...extra, nextSec,
    vars: { ...p.vars, ...extra.vars },
  });
  const skip = (message: string): TickResult => ({
    process: updated({ vars: { skipped: (p.vars.skipped ?? 0) + 1 } }), line: `рейс пропущен: ${message}`,
  });
  const blocked = data.route.nodes.find(id => routeClosed(ctx.state, id));
  if (blocked) return skip(`${routeClosed(ctx.state, blocked)} у ${resources.places.get(blocked)?.name ?? blocked}; поток равен нулю`);
  const relationFlow = cityTradeFlow(ctx.state, data.fromPlace, data.toPlace);
  if (relationFlow.blocked) return skip('дипломатическая блокада между городами; отношение −3');
  const originStub = resources.places.get(data.fromPlace), destinationStub = resources.places.get(data.toPlace);
  if (!originStub || !destinationStub) return { process: { ...p, ended: true, stage: 'invalid' }, line: 'место линии отсутствует в справочнике карты' };
  const origin = placeIn(ctx.state, resources, data.fromPlace), destination = placeIn(ctx.state, resources, data.toPlace);
  const quantity = data.quantity * relationFlow.multiplier;
  const originStock = marketStock(ctx.state, resources, origin.location.id, data.fromPlace, data.goods, ctx.sec);
  const destinationStock = marketStock(ctx.state, resources, destination.location.id, data.toPlace, data.goods, ctx.sec);
  if (originStock < quantity) return skip(`в ${origin.location.name} недостаточно груза ${data.goods} для потока ×${relationFlow.multiplier}`);
  if (data.goods !== 'food' && destinationStock + quantity > 10) return skip(`в ${destination.location.name} нет места для груза ${data.goods}`);
  const firstEdge = data.route.edges[0];
  if (!firstEdge || data.route.nodes.length < 2) return { process: { ...p, ended: true, stage: 'invalid' }, line: 'маршрут торговой линии повреждён' };
  const departures = (p.vars.departures ?? 0) + 1;
  const tripId = `proc-caravan-${p.id}-${ctx.sec}`;
  const contagion = contagionAtDeparture(ctx.state, origin.location.id, tripId, ctx.sec);
  const trip: Process = {
    id: tripId, kind: 'caravan', name: `${p.name} · рейс ${departures}`, scale: 'region', stage: 'transit',
    parties: [origin.location.id, destination.location.id], at: origin.location.id,
    startedSec: ctx.sec, nextSec: ctx.sec + Math.max(1, Math.ceil(routeCost(firstEdge) * DAY)),
    vars: { routeIndex: 0, delayDays: 0 },
    clock: { segments: Math.max(1, data.route.nodes.length - 1), filled: 0 },
    data: {
      version: 1, kind: 'caravan', map: data.map, fromPlace: data.fromPlace, toPlace: data.toPlace,
      goods: data.goods, quantity, escort: data.escort, route: data.route,
      ...(data.transport !== 'any' ? { transport: data.transport } : {}),
      ...(data.checkpoints.length ? { checkpoints: data.checkpoints } : {}), tradeLineId: p.id,
      ...(contagion ? { contagion } : {}),
    } satisfies CaravanData,
    causeId: p.causeId,
  };
  return {
    process: updated({ vars: { departures } }),
    patches: [
      ...origin.patches, ...destination.patches,
      ...patchStockAndPrice(origin.location.id, data.goods, originStock - quantity),
      { kind: 'process', process: trip },
    ],
    line: `рейс ${departures} отправлен: ${origin.location.name} → ${destination.location.name}, ${data.goods} ${quantity}${relationFlow.multiplier !== 1 ? ` (отношение ×${relationFlow.multiplier})` : ''}${contagionNote(contagion)}`,
  };
}

export function tradeLineKind(resources: CaravanResources): ProcessKind {
  return {
    kind: 'trade-line', label: 'Торговая линия', stages: { scheduled: 'по расписанию', stopped: 'остановлена', invalid: 'ошибка данных' },
    tick: (p, ctx) => tickTradeLine(p, ctx, resources),
  };
}
