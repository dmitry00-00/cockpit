// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEngineStore } from '../engine/store';
import { memoryStore } from '../engine/persist';
import type { Process } from '../engine/state';
import { ref } from '../entities/ref';
import { parseGraph } from '../world/graph';
import { caravanPlaces, caravanProposal, caravanKind, previewCaravanRoute, tradeLineEndProposal, tradeLineKind, tradeLineProposal, type CaravanResources } from './caravan';
import { seedState } from './seed';
import { LOCATION } from './world';
import { TEMPO_SECONDS } from '../engine/events';
import { d20, rollOf } from './rng';
import { simulateProcesses } from './processes';
import { priceOfStock } from './trade';

const mockedLoader = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('./caravan', async importOriginal => {
  const actual = await importOriginal<typeof import('./caravan')>();
  return { ...actual, loadCaravanResources: mockedLoader.load };
});

const WATERDEEP = 'e37dd71f-f84a-4ba1-a21c-2c98f6ad3cc2';
const NEVERWINTER = '7e243b80-8918-42fa-b60e-03cec8bdb184';
const SILVERYMOON = '16f47dee-5685-4185-a916-b77ac232fe10';
const BALDURS_GATE = '0543bb91-3dd2-43f0-aea9-889787538ad4';

function resources(): CaravanResources {
  const graph = parseGraph({
    map: 'toril',
    nodes: [
      [WATERDEEP, 8770, 3045, 0],
      [NEVERWINTER, 8522, 2610, 0],
      [SILVERYMOON, 9427, 2377, 0],
    ],
    edges: [[0, 1, 'road', 100, 0.1]],
  });
  return {
    graph,
    places: new Map([
      [WATERDEEP, { id: WATERDEEP, name: 'Waterdeep', x: 8770, y: 3045 }],
      [NEVERWINTER, { id: NEVERWINTER, name: 'Neverwinter', x: 8522, y: 2610 }],
      [SILVERYMOON, { id: SILVERYMOON, name: 'Silverymoon', x: 9427, y: 2377 }],
      [BALDURS_GATE, { id: BALDURS_GATE, name: "Baldur's Gate", x: 9143, y: 3906 }],
    ]),
    econ: {} as CaravanResources['econ'],
    kingdoms: new Map(),
  };
}

function multimodeResources(): CaravanResources {
  const graph = parseGraph({
    map: 'toril',
    nodes: [
      [WATERDEEP, 8770, 3045, 1],
      [NEVERWINTER, 8522, 2610, 1],
      [SILVERYMOON, 9427, 2377, 1],
    ],
    edges: [
      [0, 1, 'road', 80], [1, 2, 'road', 80], [0, 2, 'road', 400], [0, 2, 'water', 100],
    ],
  });
  return {
    graph,
    places: new Map([
      [WATERDEEP, { id: WATERDEEP, name: 'Waterdeep', x: 8770, y: 3045 }],
      [NEVERWINTER, { id: NEVERWINTER, name: 'Neverwinter', x: 8522, y: 2610 }],
      [SILVERYMOON, { id: SILVERYMOON, name: 'Silverymoon', x: 9427, y: 2377 }],
    ]),
    econ: {} as CaravanResources['econ'],
    kingdoms: new Map(),
  };
}

function campaignState() {
  const state = structuredClone(seedState());
  state.world.locations[LOCATION.neverwinter].stock = { cloth: 2 };
  state.world.locations['loc-waterdeep-test'] = {
    id: 'loc-waterdeep-test', name: 'Waterdeep', scale: 'settlement', parentId: LOCATION.faerun,
    ref: ref('place', WATERDEEP), geo: { map: 'toril', x: 8770, y: 3045, r: 20 }, stock: { cloth: 5 },
  };
  return state;
}

function delayedArrivalFixture() {
  const loaded = resources();
  const state = campaignState();
  state.world.locations[LOCATION.neverwinter].danger = 'high';
  const departure = caravanProposal(state, loaded, { from: WATERDEEP, to: NEVERWINTER, goods: 'cloth', timeEventId: 'delay-fixture' });
  if (departure.patch?.kind !== 'batch') throw new Error('expected departure patch');
  const processPatch = departure.patch.patches.find(p => p.kind === 'process');
  if (processPatch?.kind !== 'process') throw new Error('expected departure process');
  const process = processPatch.process;
  const delayDay = TEMPO_SECONDS.day;
  let sec: number | undefined;
  for (let offset = 0; offset < 100_000; offset++) {
    const candidate = process.nextSec + offset;
    const roll = d20(process.id, String(candidate), 'region:1');
    if (roll < 7 || roll > 10) continue;
    const delay = rollOf(4, process.id, String(candidate), 'delay:1');
    if (d20(process.id, String(candidate + delay * delayDay), 'region:1') < 7) { sec = candidate; break; }
  }
  if (sec === undefined) throw new Error('could not find deterministic delayed arrival fixture');
  const delayDays = rollOf(4, process.id, String(sec), 'delay:1');
  const active = { ...process, nextSec: sec };
  state.world.processes = { [active.id]: active };
  return { loaded, state, active, sec, delayDays, due: sec + delayDays * delayDay };
}

async function freshPrepared(load: CaravanResources | null) {
  vi.resetModules();
  mockedLoader.load.mockReset().mockResolvedValue(load);
  const { prepareSimulation } = await import('./prepareSimulation');
  return prepareSimulation();
}

beforeEach(() => mockedLoader.load.mockReset());

describe('выбор маршрута каравана', () => {
  it('предлагает только реальные graph-place IDs в стабильном порядке и возвращает frozen v1 snapshot', () => {
    const loaded = resources();
    const options = caravanPlaces(loaded);
    expect(options.map(p => p.id)).toEqual([NEVERWINTER, SILVERYMOON, WATERDEEP]);
    expect(options.map(p => p.name)).toEqual(['Neverwinter', 'Silverymoon', 'Waterdeep']);
    expect(options.some(p => p.id === BALDURS_GATE)).toBe(false);

    const sourceEdge = loaded.graph.edges[0];
    const preview = previewCaravanRoute(loaded, WATERDEEP, NEVERWINTER);
    expect(preview).toMatchObject({ ok: true, route: { version: 1, map: 'toril', nodes: [WATERDEEP, NEVERWINTER], miles: 100 } });
    if (!preview.ok) throw new Error('expected route preview');
    expect(preview.route.edges[0]).not.toBe(sourceEdge);
    expect(Object.isFrozen(preview.route)).toBe(true);
    expect(Object.isFrozen(preview.route.nodes)).toBe(true);
    expect(Object.isFrozen(preview.route.edges)).toBe(true);
    expect(Object.isFrozen(preview.route.edges[0])).toBe(true);
    expect(Object.isFrozen(sourceEdge)).toBe(false);
  });

  it('объясняет одно место, неизвестный ID, место вне графа и отсутствие пути', () => {
    const loaded = resources();
    expect(previewCaravanRoute(loaded, WATERDEEP, WATERDEEP)).toMatchObject({ ok: false, reason: 'same-place' });
    expect(previewCaravanRoute(loaded, 'missing', NEVERWINTER)).toMatchObject({ ok: false, reason: 'unknown-place' });
    expect(previewCaravanRoute(loaded, BALDURS_GATE, NEVERWINTER)).toMatchObject({ ok: false, reason: 'not-in-graph' });
    expect(previewCaravanRoute(loaded, WATERDEEP, SILVERYMOON)).toMatchObject({ ok: false, reason: 'no-route' });
    expect(previewCaravanRoute(null, WATERDEEP, NEVERWINTER)).toMatchObject({ ok: false, reason: 'resources-unavailable' });
  });

  it('фильтрует путь по транспорту и соблюдает порядок контрольных точек', () => {
    const loaded = multimodeResources();
    const any = previewCaravanRoute(loaded, WATERDEEP, SILVERYMOON);
    const land = previewCaravanRoute(loaded, WATERDEEP, SILVERYMOON, { transport: 'land' });
    const water = previewCaravanRoute(loaded, WATERDEEP, SILVERYMOON, { transport: 'water' });
    const checkpoint = previewCaravanRoute(loaded, WATERDEEP, SILVERYMOON, { transport: 'land', checkpoints: [NEVERWINTER] });

    expect(any).toMatchObject({ ok: true, route: { nodes: [WATERDEEP, SILVERYMOON], edges: [{ mode: 'water' }] } });
    expect(land).toMatchObject({ ok: true, route: { nodes: [WATERDEEP, NEVERWINTER, SILVERYMOON], miles: 160 } });
    expect(water).toMatchObject({ ok: true, route: { nodes: [WATERDEEP, SILVERYMOON], edges: [{ mode: 'water' }] } });
    expect(checkpoint).toMatchObject({ ok: true, route: { nodes: [WATERDEEP, NEVERWINTER, SILVERYMOON], checkpoints: [NEVERWINTER] } });
    expect(previewCaravanRoute(loaded, WATERDEEP, SILVERYMOON, { transport: 'water', checkpoints: [NEVERWINTER] }))
      .toMatchObject({ ok: false, reason: 'no-route' });
    expect(previewCaravanRoute(loaded, WATERDEEP, SILVERYMOON, { checkpoints: [WATERDEEP] }))
      .toMatchObject({ ok: false, reason: 'invalid-checkpoint' });
  });

  it('не отправляет груз через отсутствующее промежуточное поселение', () => {
    const loaded = resources();
    loaded.graph = parseGraph({ map: 'toril', nodes: [[WATERDEEP, 0, 0, 0], [NEVERWINTER, 1, 0, 0], [SILVERYMOON, 2, 0, 0]],
      edges: [[0, 1, 'road', 10], [1, 2, 'road', 10]] });
    loaded.places = new Map([...loaded.places].filter(([id]) => id !== NEVERWINTER));
    expect(previewCaravanRoute(loaded, WATERDEEP, SILVERYMOON)).toMatchObject({ ok: false, reason: 'unknown-place' });
    expect(() => caravanProposal(campaignState(), loaded, { from: WATERDEEP, to: SILVERYMOON, goods: 'cloth', timeEventId: 't' })).toThrow(/части поселений/);
  });

  it('prepared API предлагает выбранную пару, оставляет preview/proposal вне event log и сохраняет legacy wrapper', async () => {
    const loaded = resources();
    const prepared = await freshPrepared(loaded);
    expect(prepared.ready).toBe(true);
    expect(prepared.caravanPlaces().map(p => p.id)).toEqual([NEVERWINTER, SILVERYMOON, WATERDEEP]);

    const initial = campaignState();
    const before = structuredClone(initial);
    const originPriceBefore = initial.world.locations['loc-waterdeep-test'].prices?.cloth ?? 0;
    const persist = memoryStore();
    const store = createEngineStore(initial, { persist });
    const input = { from: WATERDEEP, to: NEVERWINTER, goods: 'cloth' as const, quantity: 1, escort: 3, timeEventId: 'caravan-time' };
    expect(prepared.previewCaravanRoute(input.from, input.to)).toMatchObject({ ok: true, route: { version: 1 } });
    const proposal = prepared.proposeCaravan(store.getState().state, input)!;
    const legacy = prepared.waterdeepToNeverwinter(store.getState().state, input.timeEventId)!;
    expect(proposal).toEqual(legacy);
    expect(store.getState().state).toEqual(before);
    expect(store.getState().events).toHaveLength(0);

    store.getState().propose(proposal);
    expect(store.getState().state.world.locations['loc-waterdeep-test'].stock?.cloth).toBe(5);
    expect(store.getState().state.world.locations[LOCATION.neverwinter].stock?.cloth).toBe(2);
    expect(store.getState().state.world.processes).toBeUndefined();
    store.getState().accept(proposal.id);
    const accepted = store.getState().state;
    const processId = `proc-caravan-${WATERDEEP}-${NEVERWINTER}-cloth`;
    expect(accepted.world.locations['loc-waterdeep-test'].stock?.cloth).toBe(4);
    expect(accepted.world.locations['loc-waterdeep-test'].prices?.cloth).toBe(priceOfStock('cloth', 4));
    expect(accepted.world.locations[LOCATION.neverwinter].stock?.cloth).toBe(2);
    expect(accepted.world.locations[LOCATION.neverwinter].prices?.cloth ?? 0).toBe(before.world.locations[LOCATION.neverwinter].prices?.cloth ?? 0);
    expect((accepted.world.processes?.[processId].data?.route as { version?: number }).version).toBe(1);
    expect(accepted.world.processes?.[processId].clock).toEqual({ segments: 1, filled: 0 });

    const replay = createEngineStore(initial, { persist });
    expect(replay.getState().state).toEqual(accepted);
    replay.getState().undo();
    expect(replay.getState().state.deltas[proposal.id].status).toBe('pending');
    expect(replay.getState().state.world.processes?.[processId]).toBeUndefined();
    expect(replay.getState().state.world.locations['loc-waterdeep-test'].stock?.cloth).toBe(5);
    expect(replay.getState().state.world.locations['loc-waterdeep-test'].prices?.cloth ?? 0).toBe(originPriceBefore);
  });

  it('при недоступных ресурсах не показывает выбор и возвращает объяснимую ошибку', async () => {
    const prepared = await freshPrepared(null);
    expect(prepared.ready).toBe(false);
    expect(prepared.caravanPlaces()).toEqual([]);
    expect(prepared.previewCaravanRoute(WATERDEEP, NEVERWINTER)).toMatchObject({ ok: false, reason: 'resources-unavailable' });
    expect(prepared.proposeCaravan(campaignState(), { from: WATERDEEP, to: NEVERWINTER, goods: 'cloth', timeEventId: 't' })).toBeNull();
    expect(prepared.waterdeepToNeverwinter(campaignState(), 't')).toBeNull();
  });

  it('подключает к планировщику только точный кандидат L8 для державы и года из пилота', async () => {
    const prepared = await freshPrepared(null);
    const luskan1370 = prepared.warParties(1370).find(party => party.name === 'Luskan');
    expect(luskan1370?.l8StrengthCandidates).toMatchObject([{
      reviewId: 'LUSKAN_ARMY_1370', amount: 300, unitRaw: 'spearmen', value: 1.6,
      year: 1370, evidence: { kind: 'l8-candidate', candidateId: 'LUSKAN_ARMY_1370', factAccepted: false },
    }]);
    expect(prepared.warParties(1492).find(party => party.name === 'Luskan')?.l8StrengthCandidates).toBeUndefined();
    expect(prepared.warParties(1370).find(party => party.name === 'Cormyr')?.l8StrengthCandidates).toBeUndefined();
  });

  it('повторная подготовка после восстановления ресурсов не остаётся на старом ready=false', async () => {
    expect((await freshPrepared(null)).ready).toBe(false);
    mockedLoader.load.mockResolvedValue(resources());
    const { prepareSimulation } = await import('./prepareSimulation');
    const recovered = await prepareSimulation();
    expect(recovered.ready).toBe(true);
    expect(recovered.caravanPlaces()).toHaveLength(3);
    expect(mockedLoader.load).toHaveBeenCalledTimes(2);
  });

  it('завершённый рейс можно повторить; принятие и undo сохраняют прежний снимок процесса', () => {
    const loaded = resources(), initial = campaignState();
    const input = { from: WATERDEEP, to: NEVERWINTER, goods: 'cloth' as const, timeEventId: 'first' };
    const first = caravanProposal(initial, loaded, input);
    if (first.patch?.kind !== 'batch') throw new Error('expected departure patch');
    const part = first.patch.patches.find(p => p.kind === 'process');
    if (part?.kind !== 'process') throw new Error('expected process');
    initial.world.processes = { [part.process.id]: { ...part.process, stage: 'arrived', ended: true } };
    const old = structuredClone(initial.world.processes[part.process.id]);
    const proposal = caravanProposal(initial, loaded, { ...input, timeEventId: 'second' });
    expect(initial.world.processes[part.process.id]).toEqual(old);
    const store = createEngineStore(initial, { persist: memoryStore() });
    store.getState().propose(proposal);
    expect(() => caravanProposal(store.getState().state, loaded, { ...input, timeEventId: 'duplicate' })).toThrow(/ждёт решения/);
    store.getState().accept(proposal.id);
    expect(store.getState().state.world.processes?.[part.process.id].stage).toBe('transit');
    expect(() => caravanProposal(store.getState().state, loaded, { ...input, timeEventId: 'active-duplicate' })).toThrow(/уже существует/);
    store.getState().undo();
    expect(store.getState().state.world.processes?.[part.process.id]).toEqual(old);
  });

  it('отклоняет неизвестный груз до создания предложения и читает старый route snapshot без version', () => {
    const loaded = resources();
    const state = campaignState();
    expect(() => caravanProposal(state, loaded, {
      from: WATERDEEP, to: NEVERWINTER, goods: 'unlisted' as never, timeEventId: 'invalid-cargo',
    })).toThrow(/неизвестный груз каравана/);

    const oldProcess: Process = {
      id: 'old-caravan', kind: 'caravan', name: 'Waterdeep → Neverwinter (cloth)', scale: 'region', stage: 'transit',
      parties: ['loc-waterdeep-test', LOCATION.neverwinter], at: 'loc-waterdeep-test', startedSec: 0, nextSec: 86_400,
      vars: { routeIndex: 0 }, clock: { segments: 1, filled: 0, playerVisible: true, playerLabel: 'Караван в пути' },
      data: { version: 1, kind: 'caravan', map: 'toril', fromPlace: WATERDEEP, toPlace: NEVERWINTER, goods: 'cloth', quantity: 1, escort: 3,
        route: { map: 'toril', nodes: [WATERDEEP, NEVERWINTER], edges: [loaded.graph.edges[0]], miles: 100, days: 8 } },
    };
    const kind = caravanKind(loaded);
    const tick = kind.tick(oldProcess, { state, sec: oldProcess.nextSec, roll: () => 20 });
    expect(tick.process.clock).toMatchObject({ segments: 1, filled: 1, playerVisible: true, playerLabel: 'Караван в пути' });
    if (tick.process.vars.arrivalPending === 1) {
      expect(kind.tick(tick.process, { state, sec: tick.process.nextSec, roll: () => 1 }).process.stage).toBe('arrived');
    } else {
      expect(tick.process.stage).toBe('arrived');
    }
  });

  it('последняя задержка переносит груз до срока и сохраняется после reload и undo', () => {
    const { loaded, state, active, sec, delayDays, due } = delayedArrivalFixture();
    const destinationPriceBefore = state.world.locations[LOCATION.neverwinter].prices?.cloth ?? 0;
    const persist = memoryStore();
    const store = createEngineStore(state, { persist });
    const kind = caravanKind(loaded);
    const first = simulateProcesses({ state, fromSec: sec - 1, toSec: sec, timeEventId: 'delayed-last-edge' }, new Map([['caravan', kind]]))[0];
    expect(first).toBeDefined();
    store.getState().propose(first);
    store.getState().accept(first.id);
    const pending = store.getState().state.world.processes?.[active.id];
    expect(pending).toMatchObject({ stage: 'transit', nextSec: due, vars: { routeIndex: 1, arrivalPending: 1, delayDays } });
    expect(pending?.ended).not.toBe(true);
    expect(store.getState().state.world.locations[LOCATION.neverwinter].stock?.cloth).toBe(2);

    const reloaded = createEngineStore(state, { persist });
    expect(reloaded.getState().state.world.processes?.[active.id]).toEqual(pending);
    expect(simulateProcesses({ state: reloaded.getState().state, fromSec: sec, toSec: due - 1, timeEventId: 'before-arrival' }, new Map([['caravan', kind]]))).toEqual([]);
    const arrival = simulateProcesses({ state: reloaded.getState().state, fromSec: due - 1, toSec: due, timeEventId: 'delayed-arrival' }, new Map([['caravan', kind]]))[0];
    expect(arrival.patch).toMatchObject({ kind: 'batch', patches: expect.arrayContaining([
      expect.objectContaining({ kind: 'stock', id: LOCATION.neverwinter, goods: 'cloth', value: 3 }),
      expect.objectContaining({ kind: 'price', id: LOCATION.neverwinter, goods: 'cloth', value: priceOfStock('cloth', 3) }),
    ]) });
    reloaded.getState().propose(arrival);
    expect(reloaded.getState().state.world.locations[LOCATION.neverwinter].stock?.cloth).toBe(2);
    reloaded.getState().accept(arrival.id);
    expect(reloaded.getState().state.world.locations[LOCATION.neverwinter].stock?.cloth).toBe(3);
    expect(reloaded.getState().state.world.locations[LOCATION.neverwinter].prices?.cloth).toBe(priceOfStock('cloth', 3));
    expect(reloaded.getState().state.world.processes?.[active.id]).toMatchObject({ stage: 'arrived', ended: true, vars: { arrivalPending: 0 } });
    reloaded.getState().undo();
    expect(reloaded.getState().state.world.processes?.[active.id]).toEqual(pending);
    expect(reloaded.getState().state.world.locations[LOCATION.neverwinter].stock?.cloth).toBe(2);
    expect(reloaded.getState().state.world.locations[LOCATION.neverwinter].prices?.cloth ?? 0).toBe(destinationPriceBefore);
  });

  it('повторный расчёт ожидающего прибытия детерминирован и не бросает риск повторно', () => {
    const { loaded, state, active, sec, due } = delayedArrivalFixture();
    const kind = caravanKind(loaded);
    const first = kind.tick(active, { state, sec, roll: () => 20 });
    expect(first.process).toMatchObject({ stage: 'transit', nextSec: due, vars: { arrivalPending: 1 } });
    expect(first.process.ended).not.toBe(true);
    const waiting = first.process;
    const resumedState = structuredClone(state);
    resumedState.world.processes = { [waiting.id]: waiting };
    const a = kind.tick(waiting, { state: resumedState, sec: due, roll: () => 1 });
    const b = kind.tick(structuredClone(waiting), { state: structuredClone(resumedState), sec: due, roll: () => 20 });
    expect(a).toEqual(b);
    expect(a.process).toMatchObject({ stage: 'arrived', ended: true, vars: { arrivalPending: 0 } });
    expect(a.patches).toContainEqual(expect.objectContaining({ kind: 'stock', id: LOCATION.neverwinter, goods: 'cloth', value: 3 }));
    expect(a.patches).not.toContainEqual(expect.objectContaining({ kind: 'encounter' }));
  });

  it('создаёт регулярную линию предложением и отправляет каждый рейс отдельным принимаемым патчем', () => {
    const loaded = resources();
    const initial = campaignState();
    const persist = memoryStore();
    const store = createEngineStore(initial, { persist });
    const intervalDays = 2;
    const proposal = tradeLineProposal(store.getState().state, loaded, {
      from: WATERDEEP, to: NEVERWINTER, goods: 'cloth', quantity: 1, escort: 2, intervalDays, timeEventId: 'line-create',
    });
    expect(store.getState().state.world.processes).toBeUndefined();
    store.getState().propose(proposal);
    expect(store.getState().state.world.locations['loc-waterdeep-test'].stock?.cloth).toBe(5);
    store.getState().accept(proposal.id);

    const lineId = `trade-line-${WATERDEEP}-${NEVERWINTER}-cloth`;
    const line = store.getState().state.world.processes?.[lineId];
    expect(line).toMatchObject({ kind: 'trade-line', stage: 'scheduled', nextSec: initial.time.sec + intervalDays * TEMPO_SECONDS.day });
    expect(store.getState().state.world.locations['loc-waterdeep-test'].stock?.cloth).toBe(5);

    const due = line!.nextSec;
    const [departure] = simulateProcesses({ state: store.getState().state, fromSec: due - 1, toSec: due, timeEventId: 'line-cycle-1' }, new Map([['trade-line', tradeLineKind(loaded)]]));
    expect(departure).toMatchObject({ subject: 'Торговая линия · Waterdeep → Neverwinter (cloth)', status: 'pending', causeId: proposal.causeId });
    expect(store.getState().state.world.locations['loc-waterdeep-test'].stock?.cloth).toBe(5);
    store.getState().propose(departure);
    expect(store.getState().state.world.locations['loc-waterdeep-test'].stock?.cloth).toBe(5);
    store.getState().accept(departure.id);

    const after = store.getState().state;
    const updatedLine = after.world.processes?.[lineId];
    expect(updatedLine).toMatchObject({ nextSec: due + intervalDays * TEMPO_SECONDS.day, vars: { departures: 1 } });
    expect(after.world.locations['loc-waterdeep-test'].stock?.cloth).toBe(4);
    expect(Object.values(after.world.processes ?? {}).filter(process => process.kind === 'caravan'))
      .toHaveLength(1);

    const reloaded = createEngineStore(initial, { persist });
    expect(reloaded.getState().state).toEqual(after);
    reloaded.getState().undo();
    expect(reloaded.getState().state.world.locations['loc-waterdeep-test'].stock?.cloth).toBe(5);
    expect(reloaded.getState().state.world.processes?.[lineId]).toEqual(line);
    expect(reloaded.getState().state.world.processes?.[`proc-caravan-${lineId}-${due}`]).toBeUndefined();

    const [multiCycle] = simulateProcesses({
      state: after, fromSec: due, toSec: due + 2 * intervalDays * TEMPO_SECONDS.day, timeEventId: 'line-cycle-batch',
    }, new Map([['trade-line', tradeLineKind(loaded)]]));
    expect(multiCycle.cause).toContain('рейс 2 отправлен');
    expect(multiCycle.cause).toContain('рейс 3 отправлен');
    expect(multiCycle.patch).toMatchObject({ kind: 'batch', patches: expect.arrayContaining([
      expect.objectContaining({ kind: 'process', process: expect.objectContaining({ id: `proc-caravan-${lineId}-${due + intervalDays * TEMPO_SECONDS.day}` }) }),
      expect.objectContaining({ kind: 'process', process: expect.objectContaining({ id: `proc-caravan-${lineId}-${due + 2 * intervalDays * TEMPO_SECONDS.day}` }) }),
    ]) });
    store.getState().propose(multiCycle);
    store.getState().accept(multiCycle.id);
    expect(store.getState().state.world.locations['loc-waterdeep-test'].stock?.cloth).toBe(2);
    expect(store.getState().state.world.processes?.[lineId]).toMatchObject({ vars: { departures: 3 } });
  });

  it('пропускает цикл без запаса и продвигает расписание только после принятия предложения', () => {
    const loaded = resources();
    const initial = campaignState();
    initial.world.locations['loc-waterdeep-test'].stock = { cloth: 0 };
    const store = createEngineStore(initial, { persist: memoryStore() });
    const create = tradeLineProposal(store.getState().state, loaded, {
      from: WATERDEEP, to: NEVERWINTER, goods: 'cloth', intervalDays: 1, timeEventId: 'short-line',
    });
    store.getState().propose(create);
    store.getState().accept(create.id);
    const lineId = `trade-line-${WATERDEEP}-${NEVERWINTER}-cloth`;
    const line = store.getState().state.world.processes![lineId];
    const [skip] = simulateProcesses({ state: store.getState().state, fromSec: line.nextSec - 1, toSec: line.nextSec, timeEventId: 'line-shortage' }, new Map([['trade-line', tradeLineKind(loaded)]]));
    expect(skip.cause).toContain('недостаточно груза cloth');
    expect(skip.patch).toMatchObject({ kind: 'batch', patches: expect.arrayContaining([
      expect.objectContaining({ kind: 'process', process: expect.objectContaining({ id: lineId, vars: { departures: 0, skipped: 1 } }) }),
    ]) });
    if (skip.patch?.kind !== 'batch') throw new Error('expected a process proposal batch');
    expect(skip.patch.patches.some(patch => patch.kind === 'stock')).toBe(false);
    store.getState().propose(skip);
    expect(store.getState().state.world.processes?.[lineId]).toEqual(line);
    store.getState().accept(skip.id);
    expect(store.getState().state.world.locations['loc-waterdeep-test'].stock?.cloth).toBe(0);
    expect(store.getState().state.world.processes?.[lineId]).toMatchObject({ vars: { departures: 0, skipped: 1 }, nextSec: line.nextSec + TEMPO_SECONDS.day });
    expect(Object.values(store.getState().state.world.processes ?? {}).some(process => process.kind === 'caravan')).toBe(false);
  });

  it('applies city relation multipliers to scheduled trade volume and refuses a route at −3', () => {
    const loaded = resources();
    const initial = campaignState();
    const waterdeepFaction = { id: 'city-waterdeep', name: 'Waterdeep', renown: 0, ref: ref('place', WATERDEEP), relations: { 'city-neverwinter': -2 } };
    const neverwinterFaction = { id: 'city-neverwinter', name: 'Neverwinter', renown: 0, ref: ref('place', NEVERWINTER), relations: { 'city-waterdeep': -2 } };
    initial.world.factions[waterdeepFaction.id] = waterdeepFaction;
    initial.world.factions[neverwinterFaction.id] = neverwinterFaction;
    const store = createEngineStore(initial, { persist: memoryStore() });
    const created = tradeLineProposal(store.getState().state, loaded, {
      from: WATERDEEP, to: NEVERWINTER, goods: 'cloth', intervalDays: 2, timeEventId: 'city-relation-line',
    });
    store.getState().propose(created); store.getState().accept(created.id);
    const lineId = `trade-line-${WATERDEEP}-${NEVERWINTER}-cloth`;
    const line = store.getState().state.world.processes![lineId];
    const [departure] = simulateProcesses({
      state: store.getState().state, fromSec: line.nextSec - 1, toSec: line.nextSec, timeEventId: 'city-relation-half-flow',
    }, new Map([['trade-line', tradeLineKind(loaded)]]));
    expect(departure.cause).toContain('cloth 0.5 (отношение ×0.5)');
    if (departure.patch?.kind !== 'batch') throw new Error('expected a relation-modified departure batch');
    expect(departure.patch.patches).toEqual(expect.arrayContaining([
      { kind: 'stock', id: 'loc-waterdeep-test', goods: 'cloth', value: 4.5 },
      expect.objectContaining({ kind: 'process', process: expect.objectContaining({ kind: 'caravan', data: expect.objectContaining({ quantity: 0.5 }) }) }),
    ]));

    const blockedState = structuredClone(initial);
    blockedState.world.factions[waterdeepFaction.id]!.relations![neverwinterFaction.id] = -3;
    blockedState.world.factions[neverwinterFaction.id]!.relations![waterdeepFaction.id] = -3;
    expect(() => caravanProposal(blockedState, loaded, { from: WATERDEEP, to: NEVERWINTER, goods: 'cloth', timeEventId: 'blocked-city-route' })).toThrow(/дипломатическ/);
    expect(() => tradeLineProposal(blockedState, loaded, { from: WATERDEEP, to: NEVERWINTER, goods: 'cloth', intervalDays: 2, timeEventId: 'blocked-city-line' })).toThrow(/дипломатическ/);
  });

  it('останавливает расписание обратимым предложением, не затрагивая отправленный рейс', () => {
    const loaded = resources();
    const state = campaignState();
    const created = tradeLineProposal(state, loaded, {
      from: WATERDEEP, to: NEVERWINTER, goods: 'cloth', intervalDays: 1, timeEventId: 'stop-line-create',
    });
    if (created.patch?.kind !== 'process') throw new Error('expected single process patch');
    const line = created.patch.process;
    const dispatched: Process = { id: 'dispatched-caravan', kind: 'caravan', name: 'рейс', scale: 'region', stage: 'transit',
      parties: [], at: 'loc-waterdeep-test', startedSec: state.time.sec, nextSec: state.time.sec + TEMPO_SECONDS.day,
      vars: { routeIndex: 0 }, clock: { segments: 1, filled: 0 }, data: { version: 1, kind: 'caravan' } };
    state.world.processes = { [line.id]: line, [dispatched.id]: dispatched };
    const stop = tradeLineEndProposal(state, line.id, 'stop-line');
    expect(state.world.processes?.[line.id]).toEqual(line);
    const store = createEngineStore(state, { persist: memoryStore() });
    store.getState().propose(stop);
    store.getState().accept(stop.id);
    expect(store.getState().state.world.processes?.[line.id]).toMatchObject({ stage: 'stopped', ended: true });
    expect(store.getState().state.world.processes?.[dispatched.id]).toEqual(dispatched);
    expect(simulateProcesses({ state: store.getState().state, fromSec: line.nextSec - 1, toSec: line.nextSec, timeEventId: 'after-stop' }, new Map([['trade-line', tradeLineKind(loaded)]]))).toEqual([]);
    store.getState().undo();
    expect(store.getState().state.world.processes?.[line.id]).toEqual(line);
  });

  it('проверяет заражение при выходе и создаёт обратимый случай с остатком инкубации при прибытии', () => {
    const loaded = multimodeResources();
    loaded.graph = parseGraph({
      map: 'toril', nodes: [[WATERDEEP, 8770, 3045, 1], [NEVERWINTER, 8522, 2610, 1]],
      edges: [[0, 1, 'water', 100]],
    });
    loaded.organizations = new Map([['church-nw', {
      id: 'church-nw', name: 'Church of Helm', title: 'Church of Helm', church: true,
      places: [NEVERWINTER], deities: ['helm'],
    }]]);
    loaded.placeFaiths = { [NEVERWINTER]: { deities: ['helm'], text: 'Helm' } };
    const initial = campaignState();
    initial.world.locations['loc-waterdeep-test']!.population = 1_000;
    initial.world.locations[LOCATION.neverwinter]!.population = 10_000;
    initial.world.locations[LOCATION.neverwinter]!.danger = 'low';
    const source: Process = {
      id: 'plague-waterdeep', kind: 'epidemic', name: 'Waterdeep', scale: 'settlement', stage: 'outbreak', parties: ['loc-waterdeep-test'], at: 'loc-waterdeep-test',
      startedSec: 0, nextSec: Number.MAX_SAFE_INTEGER, vars: { population: 1_000, infected: 950, susceptible: 50, r0: 1.8 },
      data: { kind: 'epidemic', disease: 'Sewer Plague', ruleVersion: 'dm-cockpit-urban/3' },
    };
    initial.world.processes = { [source.id]: source };
    const caravanId = `proc-caravan-${WATERDEEP}-${NEVERWINTER}-cloth`;
    const sample = caravanProposal(initial, loaded, { from: WATERDEEP, to: NEVERWINTER, goods: 'cloth', transport: 'water', timeEventId: 'infection-sample' });
    if (sample.patch?.kind !== 'batch') throw new Error('expected sample departure batch');
    const sampleProcess = sample.patch.patches.find(patch => patch.kind === 'process');
    if (sampleProcess?.kind !== 'process') throw new Error('expected sample caravan process');
    const travelSec = sampleProcess.process.nextSec - initial.time.sec;
    const departureSec = [...Array(20_000)].map((_, sec) => sec).find(sec => {
      const chance = d20('зараза', caravanId, String(sec)) / 20 <= 0.95;
      const incubation = rollOf(4, 'зараза-инкубация', caravanId, String(sec)) === 4;
      const safeArrival = d20(caravanId, String(sec + travelSec), 'region:1') + 3 >= 10;
      return chance && incubation && safeArrival;
    });
    if (departureSec === undefined) throw new Error('could not find a seeded infected, delayed-free departure');
    initial.time.sec = departureSec;
    const departure = caravanProposal(initial, loaded, { from: WATERDEEP, to: NEVERWINTER, goods: 'cloth', transport: 'water', timeEventId: 'infection-departure' });
    expect(departure.cause).toContain('заражение караваном');
    expect(departure.cause).toContain('инкубирует 4 дн.');
    const persist = memoryStore();
    const store = createEngineStore(initial, { persist });
    store.getState().propose(departure); store.getState().accept(departure.id);
    const caravan = store.getState().state.world.processes?.[caravanId];
    expect((caravan?.data as { contagion?: { transmitted?: boolean } } | undefined)?.contagion?.transmitted).toBe(true);

    const arrivalSec = caravan!.nextSec;
    const [arrival] = simulateProcesses({ state: store.getState().state, fromSec: departureSec, toSec: arrivalSec, timeEventId: 'infection-arrival' }, new Map([['caravan', caravanKind(loaded)]]));
    expect(arrival.cause).toContain('Sewer Plague занесена в Neverwinter');
    expect(arrival.patch).toMatchObject({ kind: 'batch', patches: expect.arrayContaining([expect.objectContaining({ kind: 'epidemicExposure' })]) });
    store.getState().propose(arrival); store.getState().accept(arrival.id);
    const imported = Object.values(store.getState().state.world.processes ?? {}).find(process => process.kind === 'epidemic' && process.at === LOCATION.neverwinter)!;
    expect(imported.vars.incubating2).toBe(1);
    expect(imported.vars.infected).toBe(0);
    expect(imported.data).toMatchObject({ treatmentTemples: 1, treatmentPerDay: 2 });
    const reloaded = createEngineStore(initial, { persist });
    expect(reloaded.getState().state).toEqual(store.getState().state);
    reloaded.getState().undo();
    expect(Object.values(reloaded.getState().state.world.processes ?? {}).some(process => process.kind === 'epidemic' && process.at === LOCATION.neverwinter)).toBe(false);
  });

  it('takes a new contagion snapshot on each scheduled trade-line departure', () => {
    const loaded = resources();
    const initial = campaignState();
    initial.world.locations['loc-waterdeep-test']!.population = 1_000;
    const source: Process = {
      id: 'plague-waterdeep-schedule', kind: 'epidemic', name: 'Waterdeep', scale: 'settlement', stage: 'outbreak', parties: ['loc-waterdeep-test'], at: 'loc-waterdeep-test',
      startedSec: 0, nextSec: Number.MAX_SAFE_INTEGER, vars: { population: 1_000, infected: 950, susceptible: 50, r0: 1.5 },
      data: { kind: 'epidemic', disease: 'Sewer Plague', ruleVersion: 'dm-cockpit-urban/3' },
    };
    initial.world.processes = { [source.id]: source };
    const line = tradeLineProposal(initial, loaded, { from: WATERDEEP, to: NEVERWINTER, goods: 'cloth', intervalDays: 1, timeEventId: 'infected-line' });
    if (line.patch?.kind !== 'process') throw new Error('expected trade-line creation patch');
    const base = structuredClone(initial);
    base.world.processes![line.patch.process.id] = line.patch.process;
    const lineId = line.patch.process.id;
    const dueBase = line.patch.process.nextSec;
    const secOffset = [...Array(100)].map((_, sec) => sec).find(sec => {
      const due = dueBase + sec;
      const tripId = `proc-caravan-${lineId}-${due}`;
      return d20('зараза', tripId, String(due)) / 20 <= 0.95;
    });
    expect(secOffset).toBeDefined();
    base.time.sec += secOffset!;
    const activeLine = { ...base.world.processes![lineId]!, nextSec: base.time.sec + TEMPO_SECONDS.day };
    base.world.processes![lineId] = activeLine;
    const actualTripId = `proc-caravan-${lineId}-${activeLine.nextSec}`;
    const [departure] = simulateProcesses({ state: base, fromSec: activeLine.nextSec - 1, toSec: activeLine.nextSec, timeEventId: 'infected-line-cycle' }, new Map([['trade-line', tradeLineKind(loaded)]]));
    expect(departure.cause).toContain('заражение караваном');
    expect(departure.patch).toMatchObject({ kind: 'batch', patches: expect.arrayContaining([
      expect.objectContaining({ kind: 'process', process: expect.objectContaining({ id: actualTripId, data: expect.objectContaining({ contagion: expect.objectContaining({ transmitted: true }) }) }) }),
    ]) });
  });
});
