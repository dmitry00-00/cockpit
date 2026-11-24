// @vitest-environment node
import { createEngineStore } from '../engine/store';
import { memoryStore } from '../engine/persist';
import { emptyState, type Process, type State, type WorldDelta } from '../engine/state';
import { expect, it } from 'vitest';
import { ref } from '../entities/ref';
import { parseGraph } from '../world/graph';
import { d20 } from './rng';
import { harptos, MONTHS, secOf } from './calendar';
import { simulateProcesses, TICK_SEC } from './processes';
import { isWarFrontPlace, warDangerAtPlace, warDeterminationSuggestion, warFrontAtPlace, warKind, warProposal, warSettlementProposal, warStrengthSuggestion, warTerritoryProposal, WAR_RULES, type WarOrder } from './war';
import { blockadeProposal, isPlaceBlockaded, siegeKind, siegeProposal } from './urban';
import { caravanProposal, type CaravanResources } from './caravan';
import { loadJourney } from '../rules/a5e/journey';
import { sceneOf } from './scene';
import type { WarStrengthEvidence } from './l8Military';

const order: WarOrder = {
  sideA: { id: 'luskan', name: 'Luskan' }, sideB: { id: 'neverwinter', name: 'Neverwinter' },
  strengthA: 8, strengthB: 2, determinationA: 7, determinationB: 5,
};
const front = {
  version: 1 as const, map: 'toril', fromPlace: 'start', toPlace: 'end',
  nodes: [{ id: 'start', name: 'Start', x: 10, y: 10 }, { id: 'front-town', name: 'Front Town', x: 20, y: 20 }, { id: 'end', name: 'End', x: 30, y: 30 }],
  miles: 80, days: 4, tier: 2 as const, sideAPlaceIds: ['start'], sideBPlaceIds: ['end'],
};

function initialState() {
  const state = emptyState();
  state.time = { sec: secOf({ year: 1492, month: 'Mirtul', day: 15, hour: 8 }), tempo: 'hour' };
  return state;
}

it('suggests war strength only from population dated to the selected year, then falls back to polity type', () => {
  expect(warStrengthSuggestion('1,360,800 (as of 1372 DR)', undefined, 1372)).toMatchObject({
    value: 7.1, source: expect.stringContaining('§4.2.2'),
  });
  expect(warStrengthSuggestion('1,360,800 (as of 1372 DR)', undefined, 1492)).toBeUndefined();
  expect(warStrengthSuggestion('1,360,800 (as of 1372 DR)', 'Kingdom', 1492)).toMatchObject({ value: 6 });
  expect(warStrengthSuggestion('about 1,360,800 in 1492 DR', 'Empire', 1492)).toMatchObject({ value: 8 });
  expect(warStrengthSuggestion('24,632 in -339 DR', undefined, -339)?.value).toBe(1.3);
});

it('suggests initial polity order only from the documented base and government bonus', () => {
  expect(warDeterminationSuggestion(undefined)).toMatchObject({ value: 6, source: expect.stringContaining('§4.0.1, §4.2.3') });
  expect(warDeterminationSuggestion('Oligarchic magocracy')).toMatchObject({ value: 8, source: expect.stringContaining('+2 за магократию/теократию') });
  expect(warDeterminationSuggestion('Theocracy')).toMatchObject({ value: 8 });
  expect(warDeterminationSuggestion('Monarchy')).toMatchObject({ value: 6 });
});

function acceptedWar(input = order) {
  const initial = initialState();
  if (input.front) initial.world.locations['front-region'] = { id: 'front-region', name: 'Faerûn', scale: 'continent', geo: { map: 'toril', x: 0, y: 0, r: 500 } };
  const persist = memoryStore();
  const store = createEngineStore(initial, { persist });
  const proposal = warProposal(initial, input, 'war-start-note');
  store.getState().propose(proposal);
  if (store.getState().state.world.processes) throw new Error('proposal mutated process state');
  store.getState().accept(proposal.id);
  const accepted = store.getState().state;
  const process = Object.values(accepted.world.processes ?? {}).find(candidate => candidate.kind === 'war')!;
  return { initial, persist, store, accepted, process, proposal };
}

function processFrom(delta: WorldDelta): Process {
  if (delta.patch?.kind !== 'batch') throw new Error('expected a batch simulation patch');
  const patch = delta.patch.patches.find(candidate => candidate.kind === 'process');
  if (patch?.kind !== 'process') throw new Error('expected process update in simulation patch');
  return patch.process;
}

it('stores only the selected L8 citation metadata on a GM-confirmed historical war input', () => {
  const initial = initialState();
  initial.time.sec = secOf({ year: 1370, month: 'Mirtul', day: 15, hour: 8 });
  const evidence: WarStrengthEvidence = {
    kind: 'l8-candidate', factAccepted: false, usage: 'gm-selected-for-war',
    candidateId: 'LUSKAN_ARMY_1370', kingdomId: 'luskan', kingdomName: 'Luskan',
    year: 1370, amount: 300, amountRaw: '300', unitRaw: 'spearmen', value: 1.6,
    sourceTitle: 'Luskan', sourceUrl: 'https://forgottenrealms.fandom.com/wiki/Luskan', revisionId: '1102198',
    sourceTimestamp: '2026-08-08T18:59:31Z', sourceLicense: 'Forgotten Realms Wiki, CC BY-SA 3.0',
    sourceLicenseId: 'CC BY-SA 3.0', sourceWikitextSha256: 'a'.repeat(64), sourceCitations: ['VoloN-p112-113'],
    ruleSource: 'research/world-models.md §4.2.2',
  };
  const selected = { ...order, strengthA: 1.6, strengthEvidenceA: evidence };
  const proposal = warProposal(initial, selected, 'war-start-note');
  const process = processFrom(proposal);
  expect(process.data).toMatchObject({ strengthEvidenceA: evidence, sideA: { id: 'luskan', name: 'Luskan' } });
  expect(process.data?.sideA).not.toHaveProperty('l8StrengthCandidates');
  expect(() => warProposal(initial, { ...selected, strengthA: 1.7 }, 'war-start-note-mismatch')).toThrow(/источник силы L8/);
  const wrongYear = initialState();
  expect(() => warProposal(wrongYear, selected, 'war-start-note-wrong-year')).toThrow(/источник силы L8/);
  const persist = memoryStore();
  const store = createEngineStore(initial, { persist });
  store.getState().propose(proposal);
  store.getState().accept(proposal.id);
  expect(processFrom(proposal).data).toMatchObject({ strengthEvidenceA: evidence });
  const replay = createEngineStore(initial, { persist });
  expect(Object.values(replay.getState().state.world.processes ?? {})[0]?.data).toMatchObject({ strengthEvidenceA: evidence });
  replay.getState().undo();
  expect(Object.values(replay.getState().state.world.processes ?? {})).toHaveLength(0);
});

it('keeps a war proposal pending until acceptance and replays and undoes the accepted process', () => {
  const initial = initialState();
  const persist = memoryStore();
  const store = createEngineStore(initial, { persist });
  const delta = warProposal(initial, order, 'war-start-note');

  expect(delta).toMatchObject({ status: 'pending', subject: 'Война · Luskan — Neverwinter' });
  const startPatches = delta.patch?.kind === 'batch' ? delta.patch.patches : [];
  expect(startPatches).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'kingdomOrder', kingdomId: 'luskan', value: 7, source: expect.stringContaining('§4.0.1, §4.2.3') }),
    expect.objectContaining({ kind: 'kingdomOrder', kingdomId: 'neverwinter', value: 5 }),
    expect.objectContaining({ kind: 'process', process: expect.objectContaining({ stage: 'mobilization', kind: 'war' }) }),
  ]));
  expect(store.getState().state.world.processes).toBeUndefined();
  expect(store.getState().state.world.kingdomOrder).toBeUndefined();
  store.getState().propose(delta);
  expect(store.getState().state.world.processes).toBeUndefined();
  expect(store.getState().state.world.kingdomOrder).toBeUndefined();
  store.getState().accept(delta.id);
  const accepted = store.getState().state;
  const process = Object.values(accepted.world.processes ?? {})[0];
  expect(process).toMatchObject({ stage: 'mobilization', vars: { strengthA: 8, strengthB: 2, mobilizationTicks: 0 } });
  expect(process?.data).toMatchObject({
    ruleVersion: WAR_RULES.version, ruleSource: WAR_RULES.ruleSource, strengthSource: 'gm-provided',
  });
  expect(accepted.world.kingdomOrder).toMatchObject({ luskan: { value: 7 }, neverwinter: { value: 5 } });

  const replay = createEngineStore(initial, { persist });
  expect(replay.getState().state).toEqual(accepted);
  replay.getState().undo();
  expect(Object.keys(replay.getState().state.world.processes ?? {})).toEqual([]);
  expect(replay.getState().state.world.kingdomOrder).toBeUndefined();
  expect(replay.getState().state.deltas[delta.id].status).toBe('pending');
});

it('does not create a second pending proposal for the same two sides', () => {
  const state = initialState();
  const first = warProposal(state, order, 'war-start-note');
  state.deltas[first.id] = first;
  expect(() => warProposal(state, order, 'war-start-note-2')).toThrow(/уже ждёт решения/);
});

it('does not start the same active conflict again under a later process id', () => {
  const { accepted, store } = acceptedWar();
  const later = structuredClone(accepted);
  later.time.sec += TICK_SEC.continent;
  expect(() => warProposal(later, order, 'war-start-note-later')).toThrow(/уже идёт война/);
  expect(Object.keys(store.getState().state.world.processes ?? {})).toHaveLength(1);
});

it('completes three mobilization ticks as one reversible proposal without mutating the current world', () => {
  const { store, accepted, process } = acceptedWar();
  const toSec = process.nextSec + 2 * TICK_SEC.continent;
  const simulated = simulateProcesses({ state: accepted, fromSec: process.startedSec, toSec, timeEventId: 'war-mobilization' }, new Map([['war', warKind]]));
  const delta = simulated.find(candidate => candidate.subject === 'Война · Luskan — Neverwinter')!;

  expect(process.vars.mobilizationTicks).toBe(0);
  expect(process.stage).toBe('mobilization');
  expect(processFrom(delta)).toMatchObject({
    stage: 'campaign', vars: { strengthA: 9, strengthB: 3, mobilizationTicks: WAR_RULES.mobilizationTicks },
  });
  expect(store.getState().state.world.processes?.[process.id]).toEqual(process);
  store.getState().propose(delta);
  expect(store.getState().state.world.processes?.[process.id]).toEqual(process);
  store.getState().accept(delta.id);
  expect(store.getState().state.world.processes?.[process.id]).toMatchObject({ stage: 'campaign', vars: { mobilizationTicks: 3 } });
});

it('resolves a deterministic campaign battle from the chosen rule layer', () => {
  const { accepted, process } = acceptedWar();
  const firstChesDay = secOf({ year: 1492, month: 'Ches', day: 1 });
  const battleSec = Array.from({ length: 250 }, (_, offset) => firstChesDay + offset * 86_400)
    .find(sec => {
      const month = harptos(sec).month;
      const monthNumber = month ? MONTHS.indexOf(month) + 1 : 0;
      return monthNumber >= WAR_RULES.campaignMonths[0] && monthNumber <= WAR_RULES.campaignMonths[1]
        && d20(process.id, String(sec), 'battle-encounter') >= WAR_RULES.battleEncounterThreshold
        && d20(process.id, String(sec), 'battle') >= 18;
    });
  if (battleSec === undefined) throw new Error('no battle encounter fixture in Ches');
  const campaign: Process = {
    ...process, stage: 'campaign', nextSec: battleSec,
    vars: { ...process.vars, strengthA: 8, strengthB: 2, initialA: 8, initialB: 2, mobilizationTicks: 3 },
  };
  const state: State = { ...accepted, world: { ...accepted.world, processes: { [campaign.id]: campaign } } };
  const input = { state, fromSec: battleSec - TICK_SEC.continent, toSec: battleSec, timeEventId: 'war-battle' };
  const first = simulateProcesses(input, new Map([['war', warKind]]));
  const replayed = simulateProcesses(input, new Map([['war', warKind]]));
  const delta = first[0];
  if (!delta) throw new Error('expected war battle proposal');
  const after = processFrom(delta);

  expect(replayed).toEqual(first);
  expect(delta.cause).toContain('разгром: Luskan');
  const battleRoll = d20(process.id, String(battleSec), 'battle');
  expect(delta.cause).toContain(`d20 ${battleRoll} + 12 = ${battleRoll + 12} против 11`);
  expect(after.vars).toMatchObject({ score: 25, battles: 1, strengthA: 7.9, strengthB: 1, determinationB: 4 });
  expect(delta.patch).toMatchObject({ kind: 'batch', patches: expect.arrayContaining([
    { kind: 'kingdomOrder', kingdomId: 'neverwinter', value: 4, source: expect.stringContaining('−1 после проигранного разгрома') },
  ]) });

  const store = createEngineStore(state, { persist: memoryStore() });
  store.getState().propose(delta);
  store.getState().accept(delta.id);
  expect(store.getState().state.world.kingdomOrder?.neverwinter).toMatchObject({ value: 4 });
  store.getState().undo();
  expect(store.getState().state.world.kingdomOrder).toEqual(accepted.world.kingdomOrder);
});

it('shows both winter-council rolls and continues the war when either side refuses peace', () => {
  const { accepted, process } = acceptedWar();
  const score = 35;
  const determinationA = 10, determinationB = 10;
  const councilSec = Array.from({ length: 10 * 10 }, (_, index) => {
    const year = 1492 + Math.floor(index / 10), day = index % 10 + 1;
    return secOf({ year, month: 'Hammer', day });
  }).find(sec => {
    const bonusA = score < 0 ? Math.abs(score) / 10 : 0;
    const bonusB = score > 0 ? Math.abs(score) / 10 : 0;
    return d20(process.id, String(sec), 'winter-council:side-a') + bonusA < 10 + determinationA
      || d20(process.id, String(sec), 'winter-council:side-b') + bonusB < 10 + determinationB;
  });
  if (councilSec === undefined) throw new Error('no winter-council continuation fixture found');
  const campaign: Process = {
    ...process, stage: 'campaign', nextSec: councilSec,
    vars: { ...process.vars, strengthA: 6, strengthB: 5, initialA: 8, initialB: 7, score, determinationA, determinationB },
  };
  const state: State = { ...accepted, world: { ...accepted.world, processes: { [campaign.id]: campaign } } };
  const delta = simulateProcesses({ state, fromSec: councilSec - TICK_SEC.continent, toSec: councilSec, timeEventId: 'war-winter-council-continue' }, new Map([['war', warKind]]))[0];
  if (!delta) throw new Error('expected a winter-council proposal');

  const updated = processFrom(delta);
  expect(delta.cause).toContain('зимний совет: Luskan');
  expect(delta.cause).toContain('Neverwinter');
  expect(delta.cause).toContain('продолжает');
  expect(delta.cause).toContain('зимняя пауза');
  expect(updated).toMatchObject({ stage: 'campaign', vars: { winterCouncilYear: harptos(councilSec).year, strengthA: 6.25, strengthB: 5.25 } });
  expect(updated.ended).not.toBe(true);
});

it('accumulates the documented quarter-point winter recovery exactly across tendays', () => {
  const { accepted, process } = acceptedWar();
  const startSec = Array.from({ length: 10 * 10 }, (_, index) => {
    const year = 1492 + Math.floor(index / 10), day = index % 10 + 1;
    return secOf({ year, month: 'Hammer', day });
  }).find(sec => d20(process.id, String(sec), 'winter-council:side-a') < 20
    || d20(process.id, String(sec), 'winter-council:side-b') < 20);
  if (startSec === undefined) throw new Error('no winter-recovery fixture without peace found');
  const campaign: Process = {
    ...process, stage: 'campaign', nextSec: startSec,
    vars: { ...process.vars, strengthA: 6, strengthB: 5, initialA: 8, initialB: 7, determinationA: 10, determinationB: 10 },
  };
  const state: State = { ...accepted, world: { ...accepted.world, processes: { [campaign.id]: campaign } } };
  const toSec = startSec + 3 * TICK_SEC.continent;
  const delta = simulateProcesses({ state, fromSec: startSec - TICK_SEC.continent, toSec, timeEventId: 'war-winter-recovery' }, new Map([['war', warKind]]))[0];
  if (!delta) throw new Error('expected a winter-recovery proposal');

  expect(delta.cause).toContain('зимний совет: Luskan');
  expect(delta.cause).toContain('продолжает');
  expect(processFrom(delta).vars).toMatchObject({ strengthA: 7, strengthB: 6 });
});

it('turns a depleted protracted campaign into a raid without spending more strength', () => {
  const { accepted, process } = acceptedWar({ ...order, front });
  const firstChesDay = secOf({ year: 1492, month: 'Ches', day: 1 });
  const raidSec = Array.from({ length: 100 }, (_, offset) => firstChesDay + offset * TICK_SEC.continent)
    .find(sec => {
      const month = harptos(sec).month;
      const monthNumber = month ? MONTHS.indexOf(month) + 1 : 0;
      return monthNumber >= WAR_RULES.campaignMonths[0] && monthNumber <= WAR_RULES.campaignMonths[1]
        && d20(process.id, String(sec), 'battle-encounter') >= WAR_RULES.battleEncounterThreshold;
    });
  if (raidSec === undefined) throw new Error('no campaign raid fixture found');
  const protracted: Process = {
    ...process, stage: 'protracted', nextSec: raidSec,
    vars: { ...process.vars, strengthA: 4, strengthB: 3, initialA: 8, initialB: 7, score: 0, mobilizationTicks: 3 },
  };
  const state: State = { ...accepted, world: { ...accepted.world, processes: { [protracted.id]: protracted } } };
  const delta = simulateProcesses({ state, fromSec: raidSec - TICK_SEC.continent, toSec: raidSec, timeEventId: 'war-protracted-raid' }, new Map([['war', warKind]]))[0];
  if (!delta) throw new Error('expected a protracted-raid proposal');

  expect(delta.cause).toContain('набег');
  const raidRoll = d20(process.id, String(raidSec), 'raid');
  expect(delta.cause).toContain(`d20 ${raidRoll} + 2 = ${raidRoll + 2} против 11`);
  expect(processFrom(delta)).toMatchObject({
    stage: 'protracted', vars: { strengthA: 4, strengthB: 3, battles: 1 },
  });
  expect(Math.abs(processFrom(delta).vars.score ?? 0)).toBe(5);
  expect(warDangerAtPlace({ ...state, world: { ...state.world, processes: { [protracted.id]: processFrom(delta) } } }, 'front-town')).toBe('high');
});

it('ends the war at the winter council when both sides agree, preserving score-based outcome', () => {
  const { accepted, process } = acceptedWar();
  const score = 60;
  const determinationA = 0, determinationB = 0;
  const councilSec = Array.from({ length: 10 * 10 }, (_, index) => {
    const year = 1492 + Math.floor(index / 10), day = index % 10 + 1;
    return secOf({ year, month: 'Hammer', day });
  }).find(sec => {
    const bonusA = score < 0 ? Math.abs(score) / 10 : 0;
    const bonusB = score > 0 ? Math.abs(score) / 10 : 0;
    return d20(process.id, String(sec), 'winter-council:side-a') + bonusA >= 10 + determinationA
      && d20(process.id, String(sec), 'winter-council:side-b') + bonusB >= 10 + determinationB;
  });
  if (councilSec === undefined) throw new Error('no winter-council peace fixture found');
  const campaign: Process = {
    ...process, stage: 'campaign', nextSec: councilSec,
    vars: { ...process.vars, strengthA: 6, strengthB: 5, initialA: 8, initialB: 7, score, determinationA, determinationB },
  };
  const state: State = { ...accepted, world: { ...accepted.world, processes: { [campaign.id]: campaign } } };
  const delta = simulateProcesses({ state, fromSec: councilSec - TICK_SEC.continent, toSec: councilSec, timeEventId: 'war-winter-council-peace' }, new Map([['war', warKind]]))[0];
  if (!delta) throw new Error('expected a winter-council peace proposal');

  expect(delta.cause).toContain('обе стороны согласились');
  expect(delta.cause).toContain('мир с победителем');
  expect(processFrom(delta)).toMatchObject({ stage: 'peace', ended: true, data: { outcome: 'side-a' } });
});

it('materializes an accepted walking front and routes its settlements into the A5E Wartorn Kingdom scene', async () => {
  await loadJourney();
  const { accepted, process } = acceptedWar({ ...order, front });
  const current = { ...process, stage: 'campaign' };
  const state: State = { ...accepted, world: { ...accepted.world, processes: { [current.id]: current } } };
  const record = current.data?.front as { locationIds: string[]; nodes: { id: string }[]; tier: number };
  expect(record).toMatchObject({ tier: 2, nodes: [{ id: 'start' }, { id: 'front-town' }, { id: 'end' }] });
  expect(record.locationIds).toHaveLength(3);
  const location = state.world.locations[record.locationIds[1]];
  expect(location.ref).toBe(ref('place', 'front-town'));
  expect(isWarFrontPlace(state, 'front-town')).toBe(true);
  expect(warDangerAtPlace(state, 'front-town')).toBe('high');
  expect(warFrontAtPlace(state, 'front-town')?.process.id).toBe(current.id);

  const scene = sceneOf(state, { location: location.id }, state.time.sec, {
    place: { id: 'front-town', kind: 'City' }, based: [], churchesOf: () => [], org: () => undefined, deityName: () => undefined,
  });
  const aroundFront = scene.sections.find(section => section.id === 'around')?.rows[0];
  expect(aroundFront?.label).toBe('Wartorn Kingdom');
  expect(aroundFront?.note).toContain('уровень опасности 2');
  expect(aroundFront?.note).toContain('опасность места высокая');
  expect(sceneOf(state, { location: location.id }, state.time.sec, undefined, { players: true }).sections.some(section => section.id === 'around')).toBe(false);

  const controlled: State = { ...state, world: { ...state.world, territoryControl: { 'front-town': { kingdomId: 'luskan', kingdomName: 'Luskan' } } } };
  const controlledScene = sceneOf(controlled, { location: location.id }, state.time.sec);
  expect(controlledScene.sections.flatMap(section => section.rows).find(row => row.label === 'Контроль территории · Luskan')?.note).toContain('справочник держав не изменён');
  expect(sceneOf(controlled, { location: location.id }, state.time.sec, undefined, { players: true }).sections.flatMap(section => section.rows).some(row => row.label.includes('Контроль территории'))).toBe(false);

  const ended = { ...current, stage: 'peace', ended: true };
  const postwar: State = { ...state, world: { ...state.world, processes: { [ended.id]: ended } } };
  expect(warDangerAtPlace(postwar, 'front-town')).toBeUndefined();
});

it('adds campaign-season prices once per year and closes trade flow through active front nodes', () => {
  const { accepted, process } = acceptedWar({ ...order, front });
  const current = { ...process, stage: 'campaign', nextSec: secOf({ year: 1492, month: 'Ches', day: 10 }), vars: { ...process.vars, strengthA: 8, strengthB: 2 } };
  const state: State = { ...accepted, world: { ...accepted.world, processes: { [current.id]: current } } };
  const noBattleSec = current.nextSec + Array.from({ length: 100 }, (_, i) => i * TICK_SEC.continent)
    .find(offset => d20(current.id, String(current.nextSec + offset), 'battle-encounter') < WAR_RULES.battleEncounterThreshold)!;
  const delta = simulateProcesses({ state, fromSec: noBattleSec - TICK_SEC.continent, toSec: noBattleSec, timeEventId: 'front-price' }, new Map([['war', warKind]]))[0];
  expect(delta?.patch).toMatchObject({ kind: 'batch', patches: expect.arrayContaining([
    expect.objectContaining({ kind: 'price', goods: 'weapons', value: 15 }), expect.objectContaining({ kind: 'price', goods: 'armor', value: 15 }),
  ]) });
  expect(processFrom(delta!).vars.campaignPriceYear).toBe(1492);

  const resources: CaravanResources = {
    graph: parseGraph({ map: 'toril', nodes: [['start', 0, 0, 0], ['front-town', 10, 0, 0]], edges: [[0, 1, 'road', 10]] }),
    places: new Map([['start', { id: 'start', name: 'Start', x: 0, y: 0 }], ['front-town', { id: 'front-town', name: 'Front Town', x: 10, y: 0 }]]),
    econ: {} as CaravanResources['econ'], kingdoms: new Map(),
  };
  expect(() => caravanProposal(state, resources, { from: 'start', to: 'front-town', goods: 'food', timeEventId: 'front-trade' })).toThrow(/поток через фронт равен нулю/);
});

it('starts an explicit city siege on the front and depletes the recorded food-days one per day', () => {
  const { accepted, process } = acceptedWar({ ...order, front });
  const record = process.data?.front as { locationIds: string[]; nodes: { id: string }[] };
  const cityId = record.locationIds[1];
  const current = { ...process, stage: 'campaign' };
  const before: State = {
    ...accepted,
    world: { ...accepted.world, processes: { [current.id]: current }, locations: { ...accepted.world.locations, [cityId]: { ...accepted.world.locations[cityId], stock: { food: 2 } } } },
  };
  const proposal = siegeProposal(before, cityId, current.id, 'siege-note');
  const store = createEngineStore(before, { persist: memoryStore() });
  store.getState().propose(proposal);
  store.getState().accept(proposal.id);
  const active = store.getState().state;
  const siege = Object.values(active.world.processes ?? {}).find(candidate => candidate.kind === 'siege')!;
  const day1 = simulateProcesses({ state: active, fromSec: siege.startedSec, toSec: siege.nextSec, timeEventId: 'siege-day-1' }, new Map([['siege', siegeKind]]))[0];
  expect(day1.patch).toMatchObject({ kind: 'batch', patches: expect.arrayContaining([{ kind: 'stock', id: cityId, goods: 'food', value: 1 }]) });
  const day1State = structuredClone(active);
  day1State.world.locations[cityId].stock!.food = 1;
  day1State.world.processes![siege.id] = processFrom(day1);
  const day2 = simulateProcesses({ state: day1State, fromSec: siege.nextSec, toSec: siege.nextSec + TICK_SEC.settlement, timeEventId: 'siege-day-2' }, new Map([['siege', siegeKind]]))[0];
  expect(processFrom(day2)).toMatchObject({ stage: 'exhausted', ended: true });
  expect(day2.patch).toMatchObject({ kind: 'batch', patches: expect.arrayContaining([{ kind: 'stock', id: cityId, goods: 'food', value: 0 }]) });
});

it('lets the GM link a blockade to a war; blocked routes cannot dispatch supply', () => {
  const { accepted, process: war } = acceptedWar();
  const cityId = 'city-neverwinter', placeId = 'neverwinter';
  const before = structuredClone(accepted);
  before.world.locations[cityId] = {
    id: cityId, name: 'Neverwinter', scale: 'settlement', ref: ref('place', placeId), stock: { food: 2 },
  };
  const store = createEngineStore(before, { persist: memoryStore() });
  const blockade = blockadeProposal(store.getState().state, cityId, 'war-blockade-note', war.id);
  store.getState().propose(blockade);
  expect(isPlaceBlockaded(store.getState().state, placeId)).toBe(false);
  store.getState().accept(blockade.id);

  const state = store.getState().state;
  const blockadeProcess = Object.values(state.world.processes ?? {}).find(candidate => candidate.kind === 'blockade');
  expect(blockadeProcess?.data).toMatchObject({ kind: 'blockade', targetPlaceId: placeId, warProcessId: war.id });
  expect(isPlaceBlockaded(state, placeId)).toBe(true);

  const waterdeep = 'waterdeep';
  const resources: CaravanResources = {
    graph: parseGraph({ map: 'toril', nodes: [[waterdeep, 0, 0, 0], [placeId, 10, 0, 0]], edges: [[0, 1, 'road', 10]] }),
    places: new Map([
      [waterdeep, { id: waterdeep, name: 'Waterdeep', x: 0, y: 0 }],
      [placeId, { id: placeId, name: 'Neverwinter', x: 10, y: 0 }],
    ]),
    econ: {} as CaravanResources['econ'], kingdoms: new Map(),
  };
  const stockBefore = state.world.locations[cityId].stock?.food;
  expect(() => caravanProposal(state, resources, { from: waterdeep, to: placeId, goods: 'food', timeEventId: 'supply-through-blockade' }))
    .toThrow(/маршрут проходит через место под блокадой/);
  expect(state.world.locations[cityId].stock?.food).toBe(stockBefore);
});

it('ends war-linked blockades and resumes blocked routes away from a front when the war is settled', () => {
  const { accepted, process: war } = acceptedWar();
  const cityId = 'city-suzail', placeId = 'suzail';
  const initial = structuredClone(accepted);
  initial.world.locations[cityId] = { id: cityId, name: 'Suzail', scale: 'settlement', ref: ref('place', placeId) };
  const blockadeStore = createEngineStore(initial, { persist: memoryStore() });
  const blockade = blockadeProposal(blockadeStore.getState().state, cityId, 'war-linked-blockade', war.id);
  blockadeStore.getState().propose(blockade);
  blockadeStore.getState().accept(blockade.id);
  const blockadeProcess = Object.values(blockadeStore.getState().state.world.processes ?? {}).find(candidate => candidate.kind === 'blockade')!;
  const beforeSettlement = structuredClone(blockadeStore.getState().state);
  const caravan: Process = {
    id: 'caravan-blocked-at-suzail', kind: 'caravan', name: 'food shipment', scale: 'region', stage: 'blocked',
    parties: [], at: cityId, startedSec: beforeSettlement.time.sec, nextSec: Number.MAX_SAFE_INTEGER,
    vars: { blockedRouteIndex: 1 }, data: { route: { nodes: ['waterdeep', placeId, 'arabel'] } },
  };
  beforeSettlement.world.processes![caravan.id] = caravan;
  expect(isPlaceBlockaded(beforeSettlement, placeId)).toBe(true);

  const store = createEngineStore(beforeSettlement, { persist: memoryStore() });
  const settlement = warSettlementProposal(store.getState().state, war.id, 'status-quo', 'war-linked-blockade-settlement');
  store.getState().propose(settlement);
  store.getState().accept(settlement.id);

  expect(isPlaceBlockaded(store.getState().state, placeId)).toBe(false);
  expect(store.getState().state.world.processes?.[blockadeProcess.id]).toMatchObject({ stage: 'ended', ended: true });
  expect(store.getState().state.world.processes?.[caravan.id]).toMatchObject({ stage: 'transit', vars: {} });
  store.getState().undo();
  expect(isPlaceBlockaded(store.getState().state, placeId)).toBe(true);
  expect(store.getState().state.world.processes?.[caravan.id]).toMatchObject({ stage: 'blocked', vars: { blockedRouteIndex: 1 } });
});

it('settles a war by pending GM decision and atomically lifts its siege and resumes a blocked caravan', () => {
  const { accepted, process } = acceptedWar({ ...order, front });
  const current: Process = { ...process, stage: 'campaign', ended: false };
  const record = current.data?.front as { locationIds: string[] };
  const cityId = record.locationIds[1];
  const caravan: Process = {
    id: 'caravan-blocked', kind: 'caravan', name: 'Торговый рейс', scale: 'region', stage: 'blocked', ended: false, parties: [], at: cityId,
    startedSec: accepted.time.sec, nextSec: Number.MAX_SAFE_INTEGER, vars: { blockedRouteIndex: 1 },
    data: { route: { nodes: ['start', 'front-town', 'end'] } },
  };
  const before: State = {
    ...accepted,
    world: { ...accepted.world, processes: { ...accepted.world.processes, [current.id]: current, [caravan.id]: caravan },
      locations: { ...accepted.world.locations, [cityId]: { ...accepted.world.locations[cityId], stock: { food: 2 } } } },
  };
  const persist = memoryStore();
  const store = createEngineStore(before, { persist });
  const siege = siegeProposal(store.getState().state, cityId, current.id, 'siege-start');
  store.getState().propose(siege);
  store.getState().accept(siege.id);

  const beforeSettlement = store.getState().state;
  const settlement = warSettlementProposal(beforeSettlement, current.id, 'side-a', 'war-settlement', { 'front-town': 'neverwinter' });
  expect(settlement).toMatchObject({ status: 'pending', now: expect.stringContaining('мир с победой Luskan · изменён контроль поселений: Front Town → Neverwinter'), patch: { kind: 'batch' } });
  expect(() => warSettlementProposal(beforeSettlement, current.id, 'side-a', 'bad-place', { outside: 'neverwinter' })).toThrow(/не входит во фронт/);
  expect(() => warSettlementProposal(beforeSettlement, current.id, 'side-a', 'bad-side', { 'front-town': 'cormyr' })).toThrow(/только одной из держав-участниц/);
  store.getState().propose(settlement);
  expect(store.getState().state.world.processes?.[current.id]?.ended).toBe(false);
  expect(() => warSettlementProposal(store.getState().state, current.id, 'side-a', 'war-settlement-duplicate')).toThrow(/уже ждёт решения/);
  store.getState().accept(settlement.id);

  const resolved = store.getState().state;
  expect(resolved.world.processes?.[current.id]).toMatchObject({ stage: 'peace', ended: true, data: { outcome: 'side-a', resolution: { mode: 'gm-authored' } } });
  expect(resolved.world.territoryControl).toEqual({ 'front-town': { kingdomId: 'neverwinter', kingdomName: 'Neverwinter' } });
  expect(Object.values(resolved.world.processes ?? {}).find(candidate => candidate.kind === 'siege')).toMatchObject({ stage: 'lifted', ended: true });
  expect(resolved.world.processes?.[caravan.id]).toMatchObject({ stage: 'transit', ended: false });

  const replay = createEngineStore(before, { persist });
  expect(replay.getState().state).toEqual(resolved);
  replay.getState().undo();
  expect(replay.getState().state.world.territoryControl).toBeUndefined();
  expect(replay.getState().state.world.processes?.[current.id]).toMatchObject({ stage: 'campaign', ended: false });
  const restoredSiege = Object.values(replay.getState().state.world.processes ?? {}).find(candidate => candidate.kind === 'siege');
  expect(restoredSiege).toMatchObject({ stage: 'siege' });
  expect(restoredSiege?.ended).toBeFalsy();
  expect(replay.getState().state.world.processes?.[caravan.id]).toMatchObject({ stage: 'blocked' });
});

it('records front territory control only by an accepted GM proposal and restores it exactly on undo', () => {
  const { accepted, process } = acceptedWar({ ...order, front });
  const current: Process = { ...process, stage: 'campaign', ended: false };
  const before: State = { ...accepted, world: { ...accepted.world, processes: { ...accepted.world.processes, [current.id]: current } } };
  const persist = memoryStore();
  const store = createEngineStore(before, { persist });
  const proposal = warTerritoryProposal(before, current.id, 'front-town', 'luskan', 'territory-decision');

  expect(proposal).toMatchObject({ status: 'pending', was: 'отдельная запись контроля не задана', now: 'Luskan · решение мастера', patch: { kind: 'territoryControl', controller: { kingdomId: 'luskan' } } });
  expect(before.world.territoryControl).toBeUndefined();
  store.getState().propose(proposal);
  expect(store.getState().state.world.territoryControl).toBeUndefined();
  expect(() => warTerritoryProposal(store.getState().state, current.id, 'front-town', 'luskan', 'territory-duplicate')).toThrow(/уже ждёт решения/);
  expect(() => warTerritoryProposal(before, current.id, 'front-town', 'cormyr', 'territory-wrong-side')).toThrow(/только одной из держав-участниц/);
  expect(() => warTerritoryProposal(before, current.id, 'outside', 'luskan', 'territory-off-front')).toThrow(/не входит в принятый фронт/);

  store.getState().accept(proposal.id);
  const controlled = store.getState().state;
  expect(controlled.world.territoryControl).toEqual({ 'front-town': { kingdomId: 'luskan', kingdomName: 'Luskan' } });
  const replay = createEngineStore(before, { persist });
  expect(replay.getState().state).toEqual(controlled);
  replay.getState().undo();
  expect(replay.getState().state.world.territoryControl).toBeUndefined();
  replay.getState().redo();
  expect(replay.getState().state.world.territoryControl).toEqual(controlled.world.territoryControl);

  const clear = warTerritoryProposal(controlled, current.id, 'front-town', null, 'territory-clear');
  replay.getState().propose(clear);
  replay.getState().accept(clear.id);
  expect(replay.getState().state.world.territoryControl).toBeUndefined();
  replay.getState().undo();
  expect(replay.getState().state.world.territoryControl).toEqual(controlled.world.territoryControl);
});
