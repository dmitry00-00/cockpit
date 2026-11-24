// @vitest-environment node
import { expect, it } from 'vitest';
import { emptyState, SECONDS_PER_DAY, type State } from '../engine/state';
import { createEngineStore } from '../engine/store';
import { memoryStore } from '../engine/persist';
import type { GreatWheel, Plane, WorldTree } from '../cosmos/planes';
import type { StarSystem } from '../cosmos/realmspace';
import { LOCATION } from './world';
import { cosmicFieldsAt, cosmicKind, cosmicProposal, cosmicTargets } from './cosmic';
import { simulateProcesses } from './processes';

const abyss: Plane = {
  id: 'abyss', name: 'Abyss', kind: 'outer', url: 'https://example.invalid/abyss', alignment: ['CE'], refs: ['Planar Handbook · 21'],
};
const greatWheel = {
  planes: [abyss], links: [], outlands: { gates: [], quote: '', travelQuote: '', travelDays: [1, 2], url: '', ref: null, travelRef: null },
  attribution: 'test catalog', note: 'test',
} as unknown as GreatWheel;
const worldTree = { planes: [], attribution: 'test catalog', note: 'test' } as unknown as WorldTree;
const realmspace: StarSystem = {
  sphere: { id: 'realmspace', name: 'Realmspace', url: 'https://example.invalid/realmspace', radiusMi: null, refs: ['Spelljammer · 5'] },
  bodies: [
    { id: 'sun', name: 'The Sun', url: '', type: 'Sun', refs: ['Spelljammer · 6'] },
    { id: 'toril', name: 'Toril', url: '', type: 'Planet', parent: 'The Sun', refs: ['Spelljammer · 9'] },
    { id: 'selune', name: "Selûne", url: '', type: 'Moon', parent: 'Toril', refs: ['Spelljammer · 10'] },
  ], attribution: 'test', note: 'test',
};

function stateWithCosmicLadder(): State {
  const state = emptyState();
  state.world.locations[LOCATION.greatWheel] = { id: LOCATION.greatWheel, name: 'Великое Колесо', scale: 'cosmology' };
  state.world.locations[LOCATION.material] = { id: LOCATION.material, name: 'Материальный', scale: 'plane', parentId: LOCATION.greatWheel };
  state.world.locations[LOCATION.realmspace] = { id: LOCATION.realmspace, name: 'Realmspace', scale: 'system', parentId: LOCATION.material };
  state.world.locations[LOCATION.toril] = { id: LOCATION.toril, name: 'Toril', scale: 'planet', parentId: LOCATION.realmspace };
  return state;
}

const targets = cosmicTargets({ realmspace, greatWheel, worldTree });

it('offers targets from the planar and planetary catalogs with their scale and citations', () => {
  expect(targets).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'plane:great-wheel:abyss', scale: 'plane', refs: ['Planar Handbook · 21'] }),
    expect.objectContaining({ id: 'body:toril', locationId: LOCATION.toril, scale: 'planet', refs: ['Spelljammer · 9'] }),
    expect.objectContaining({ id: 'body:selune', parentId: LOCATION.toril, scale: 'planet' }),
    expect.objectContaining({ id: 'sphere:realmspace', scale: 'system', refs: ['Spelljammer · 5'] }),
  ]));
});

it('starts an authored planar process only after acceptance and proposes a source-linked result at its deadline', () => {
  const initial = stateWithCosmicLadder();
  const persist = memoryStore();
  const store = createEngineStore(initial, { persist });
  const delta = cosmicProposal(initial, targets, {
    targetId: 'plane:great-wheel:abyss', eventKind: 'blood-war', text: 'Avernus front moves toward the gate towns',
    durationDays: 90, playerVisible: true, timeEventId: 'cosmic-start-cause',
  });

  expect(delta.status).toBe('pending');
  expect(delta.patch?.kind).toBe('batch');
  expect(store.getState().state.world.locations['loc-cosmic-plane-great-wheel-abyss']).toBeUndefined();
  expect(store.getState().state.world.processes).toBeUndefined();
  store.getState().propose(delta);
  store.getState().accept(delta.id);

  const accepted = store.getState().state;
  const process = Object.values(accepted.world.processes ?? {}).find(item => item.kind === 'cosmic')!;
  expect(accepted.world.locations[process.at!]).toMatchObject({ scale: 'plane', parentId: LOCATION.greatWheel, ref: 'plane:abyss' });
  expect((process.data as { sourceRefs: readonly string[] }).sourceRefs).toEqual(['Planar Handbook · 21']);
  expect(Object.keys(accepted.facts)).toHaveLength(0);
  const projection = structuredClone(accepted);
  projection.world.locations['loc-test-planet'] = { id: 'loc-test-planet', name: 'Test Planet', scale: 'planet', parentId: process.at };
  projection.world.locations['loc-test-city'] = { id: 'loc-test-city', name: 'Test City', scale: 'settlement', parentId: 'loc-test-planet' };
  expect(cosmicFieldsAt(projection, 'loc-test-city')).toMatchObject([{
    processId: process.id, targetName: 'Abyss', targetScale: 'plane', eventKind: 'blood-war', distance: 2,
    sourceRefs: ['Planar Handbook · 21'], ruleVersion: 'dm-cockpit-cosmic/1',
  }]);
  expect(cosmicFieldsAt(projection, LOCATION.toril)).toEqual([]);

  const finish = simulateProcesses({
    state: accepted, fromSec: accepted.time.sec, toSec: accepted.time.sec + 90 * SECONDS_PER_DAY, timeEventId: 'cosmic-deadline',
  }, new Map([['cosmic', cosmicKind]]))[0]!;
  expect(finish.status).toBe('pending');
  expect(finish.patch?.kind).toBe('batch');
  store.getState().propose(finish);
  expect(Object.keys(store.getState().state.facts)).toHaveLength(0);
  store.getState().accept(finish.id);

  const completed = store.getState().state;
  const fact = Object.values(completed.facts)[0]!;
  expect(fact).toMatchObject({ visibility: 'players', scale: 'plane', subjectId: process.at });
  expect(fact.text).toContain('Война Крови · Abyss');
  expect(completed.world.processes?.[process.id]?.ended).toBe(true);
  const completedProjection = structuredClone(projection);
  completedProjection.world.processes = completed.world.processes;
  expect(cosmicFieldsAt(completedProjection, 'loc-test-city')).toEqual([]);
  store.getState().undo();
  expect(store.getState().state.facts).toEqual({});
  expect(store.getState().state.world.processes?.[process.id]).toMatchObject({ stage: 'ongoing' });
  expect(store.getState().state.world.processes?.[process.id]).not.toHaveProperty('ended');
});

it('rejects unknown catalog targets and invalid duration without changing campaign state', () => {
  const state = stateWithCosmicLadder();
  const input = { targetId: 'body:missing', eventKind: 'canon-cataclysm' as const, text: 'Named event', durationDays: 1, playerVisible: false, timeEventId: 'cause' };
  expect(() => cosmicProposal(state, targets, input)).toThrow(/цель отсутствует/);
  expect(() => cosmicProposal(state, targets, { ...input, targetId: 'body:toril', durationDays: 0 })).toThrow(/длительность/);
  expect(state.world.processes).toBeUndefined();
});
