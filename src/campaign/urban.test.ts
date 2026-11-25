// @vitest-environment node
import { expect, it } from 'vitest';
import { emptyState, SECONDS_PER_DAY, type Process, type State, type WorldDelta } from '../engine/state';
import { applyWorldPatch } from '../engine/reduce';
import { createEngineStore } from '../engine/store';
import { memoryStore } from '../engine/persist';
import { d20 } from './rng';
import { simulateProcesses } from './processes';
import { ref } from '../entities/ref';
import {
  blockadeEndProposal, blockadeProposal, cityFactionProposal, cityTradeFlow, confirmedTempleTreatment, epidemicExposurePatch, epidemicKind, epidemicProposal, factionRelationProposal, famineCapitalOrderFor, famineKind, famineProposal,
  isCityTradeBlocked, revoltKind, revoltSecessionFor, URBAN_RULES,
} from './urban';

const TENDAY = 10 * SECONDS_PER_DAY;

function processFrom(delta: WorldDelta): Process {
  if (delta.patch?.kind === 'process') return delta.patch.process;
  if (delta.patch?.kind === 'batch') {
    const patch = delta.patch.patches.find(item => item.kind === 'process');
    if (patch?.kind === 'process') return patch.process;
  }
  throw new Error('proposal did not contain a process');
}

function farTownState(): State {
  const state = emptyState();
  state.world.locations.home = { id: 'home', name: 'Home', scale: 'settlement', population: 500 };
  state.world.locations['far-town'] = { id: 'far-town', name: 'Far Town', scale: 'settlement', population: 1_000, order: 6, stock: { food: 0 } };
  return state;
}

it('uses daily famine checks nearby and applies the documented loss once per ten days', () => {
  const state = emptyState();
  state.world.locations.city = { id: 'city', name: 'City', scale: 'settlement', population: 1_000, order: 6, stock: { food: 0 } };
  const initial = processFrom(famineProposal(state, 'city', 'famine-start'));
  expect(initial.nextSec).toBe(SECONDS_PER_DAY);

  state.world.processes = { [initial.id]: initial };
  const result = simulateProcesses({ state, fromSec: 0, toSec: 10 * SECONDS_PER_DAY, timeEventId: 'famine-ten-days' }, new Map([['famine', famineKind]]));
  const delta = result.find(item => item.subject === 'Голод · City')!;
  expect(delta.cause).toContain('порядок 6 → 5');
  expect(delta.cause).toContain('население 1000 → 990');
  expect(delta.patch?.kind).toBe('batch');
  if (delta.patch?.kind !== 'batch') throw new Error('expected a batch patch');
  expect(delta.patch.patches).toEqual(expect.arrayContaining([
    { kind: 'population', id: 'city', value: 990 },
    { kind: 'order', id: 'city', value: 5 },
  ]));
});

it('continues an active version-1 famine with its saved ten-day cadence', () => {
  const state = emptyState();
  state.world.locations.city = { id: 'city', name: 'City', scale: 'settlement', population: 1_000, order: 6, stock: { food: 0 } };
  const legacy: Process = {
    id: 'legacy-famine', kind: 'famine', name: 'City', scale: 'settlement', stage: 'shortage', parties: ['city'], at: 'city',
    startedSec: 0, nextSec: TENDAY, vars: { emptyTendays: 0 },
    data: { version: 1, kind: 'famine', ruleVersion: 'dm-cockpit-urban/1', ruleSource: 'legacy table rule' },
  };
  state.world.processes = { [legacy.id]: legacy };
  const result = simulateProcesses({ state, fromSec: 0, toSec: TENDAY, timeEventId: 'legacy-famine-tick' }, new Map([['famine', famineKind]]));
  const delta = result.find(item => item.subject === 'Голод · City')!;
  expect(delta.now).not.toContain('ошибка данных');
  if (delta.patch?.kind !== 'batch') throw new Error('expected legacy famine batch');
  expect(delta.patch.patches).toEqual(expect.arrayContaining([
    { kind: 'population', id: 'city', value: 990 },
    { kind: 'order', id: 'city', value: 5 },
  ]));
});

it('uses ten-day famine and epidemic steps for settlements far from the party', () => {
  const state = farTownState();
  expect(processFrom(famineProposal(state, 'far-town', 'famine-far')).nextSec).toBe(TENDAY);
  expect(processFrom(epidemicProposal(state, 'far-town', 10, 1.5, 'epidemic-far')).nextSec).toBe(TENDAY);

  const epidemic = processFrom(epidemicProposal(state, 'far-town', 10, 1.5, 'epidemic-far-again'));
  state.world.processes = { [epidemic.id]: epidemic };
  const result = simulateProcesses({ state, fromSec: 0, toSec: TENDAY, timeEventId: 'epidemic-far-tick' }, new Map([['epidemic', epidemicKind]]));
  const delta = result.find(item => item.subject === 'Эпидемия · Far Town')!;
  if (delta.patch?.kind !== 'batch') throw new Error('expected epidemic batch');
  const updated = delta.patch.patches.find(item => item.kind === 'epidemicState');
  if (updated?.kind !== 'epidemicState') throw new Error('expected updated epidemic');
  expect(updated.process.vars.days).toBe(10);
});

it('reduces confirmed campaign order once when famine begins in an explicit capital', () => {
  const state = emptyState();
  state.world.locations.capital = { id: 'capital', name: 'Capital', scale: 'settlement', ref: ref('place', 'capital-place'), population: 1_000, order: 5, stock: { food: 0 } };
  state.world.kingdomOrder = { cormyr: { value: 4, source: 'master-confirmed campaign order' } };
  const capitalCandidates = [{ id: 'cormyr', capitalPlace: 'capital-place', founded: 1000 }];
  expect(famineCapitalOrderFor(state, 'capital', capitalCandidates, 1492)).toEqual({ kingdomId: 'cormyr' });
  expect(famineCapitalOrderFor(state, 'capital', capitalCandidates, 900)).toBeUndefined();
  expect(famineCapitalOrderFor(state, 'capital', [...capitalCandidates, { id: 'rival', capitalPlace: 'capital-place' }], 1492)).toBeUndefined();
  const delta = famineProposal(state, 'capital', 'capital-famine', undefined, { kingdomId: 'cormyr' });
  expect(delta.patch).toMatchObject({ kind: 'batch', patches: expect.arrayContaining([
    { kind: 'kingdomOrder', kingdomId: 'cormyr', value: 3, source: expect.stringContaining('§4.4') },
  ]) });
  expect(delta.cause).toContain('столице');
  const store = createEngineStore(state, { persist: memoryStore() });
  store.getState().propose(delta); store.getState().accept(delta.id);
  expect(store.getState().state.world.kingdomOrder?.cormyr?.value).toBe(3);
  store.getState().undo();
  expect(store.getState().state.world.kingdomOrder?.cormyr?.value).toBe(4);

  const pendingOrder = structuredClone(state);
  pendingOrder.deltas['pending-kingdom-order'] = {
    id: 'pending-kingdom-order', scale: 'continent', subject: 'Порядок · Cormyr', was: '4', now: '5', cause: 'ручная настройка',
    causeId: 'pending-order-note', status: 'pending', patch: { kind: 'kingdomOrder', kingdomId: 'cormyr', value: 5, source: 'GM' },
  };
  expect(() => famineProposal(pendingOrder, 'capital', 'famine-order-conflict', undefined, { kingdomId: 'cormyr' }))
    .toThrow(/сначала разрешите ожидающее изменение порядка/);

  const unknownOrder = emptyState();
  unknownOrder.world.locations.capital = state.world.locations.capital!;
  const withoutEvidence = famineProposal(unknownOrder, 'capital', 'unconfirmed-capital-famine', undefined, { kingdomId: 'unknown-polity' });
  const withoutEvidencePatches = withoutEvidence.patch?.kind === 'batch' ? withoutEvidence.patch.patches : withoutEvidence.patch ? [withoutEvidence.patch] : [];
  expect(withoutEvidencePatches.some(patch => patch.kind === 'kingdomOrder')).toBe(false);
});

it('keeps city relationship changes pending and writes them symmetrically through the world patch', () => {
  const state = emptyState();
  state.world.factions.a = { id: 'a', name: 'A', renown: 0 };
  state.world.factions.b = { id: 'b', name: 'B', renown: 0 };
  const delta = factionRelationProposal(state, 'b', 'a', -3, 'relation-note');
  expect(delta.status).toBe('pending');
  expect(state.world.factions.a.relations).toBeUndefined();
  const persist = memoryStore();
  const store = createEngineStore(state, { persist });
  store.getState().propose(delta);
  expect(store.getState().state.world.factions.a.relations).toBeUndefined();
  store.getState().accept(delta.id);
  const updated = store.getState().state;
  expect(updated.world.factions.a.relations?.b).toBe(-3);
  expect(updated.world.factions.b.relations?.a).toBe(-3);
  const replay = createEngineStore(state, { persist });
  expect(replay.getState().state).toEqual(updated);
  replay.getState().undo();
  expect(replay.getState().state.world.factions.a.relations).toBeUndefined();
  expect(() => factionRelationProposal(state, 'a', 'a', 1, 'bad-relation')).toThrow(/самой себе/);
  expect(() => factionRelationProposal(state, 'a', 'b', 4, 'bad-range')).toThrow(/от −3 до \+3/);
});

it('activates cities as factions and applies relation trade thresholds with reversible blockade start and end', () => {
  const state = emptyState();
  state.world.locations.cityA = { id: 'cityA', name: 'City A', scale: 'settlement', ref: ref('place', 'place-a') };
  state.world.locations.cityB = { id: 'cityB', name: 'City B', scale: 'settlement', ref: ref('place', 'place-b') };
  const persist = memoryStore();
  const store = createEngineStore(state, { persist });
  const activateA = cityFactionProposal(store.getState().state, 'cityA', 'activate-a');
  const activateB = cityFactionProposal(store.getState().state, 'cityB', 'activate-b');
  store.getState().propose(activateA); store.getState().accept(activateA.id);
  store.getState().propose(activateB); store.getState().accept(activateB.id);
  const a = Object.values(store.getState().state.world.factions).find(faction => faction.ref === 'place:place-a')!;
  const b = Object.values(store.getState().state.world.factions).find(faction => faction.ref === 'place:place-b')!;

  const hostile = factionRelationProposal(store.getState().state, a.id, b.id, -3, 'relation-blockade');
  expect(hostile.patch?.kind).toBe('batch');
  store.getState().propose(hostile); store.getState().accept(hostile.id);
  expect(cityTradeFlow(store.getState().state, 'place-a', 'place-b')).toMatchObject({ relation: -3, blocked: true, multiplier: 1 });
  expect(isCityTradeBlocked(store.getState().state, 'place-a', 'place-b')).toBe(true);
  const blockade = Object.values(store.getState().state.world.processes ?? {}).find(process => process.kind === 'blockade' && !process.ended)!;

  const manualBlockade = blockadeProposal(store.getState().state, 'cityB', 'manual-blockade-during-rivalry');
  store.getState().propose(manualBlockade); store.getState().accept(manualBlockade.id);
  const manualBlockadeProcess = Object.values(store.getState().state.world.processes ?? {}).find(process => process.kind === 'blockade'
    && process.data?.kind === 'blockade' && !Array.isArray((process.data as { relationFactions?: unknown }).relationFactions) && !process.ended)!;
  const blockedCaravan: Process = {
    id: 'blocked-city-caravan', kind: 'caravan', name: 'City A → City B', scale: 'region', stage: 'blocked',
    parties: ['cityA', 'cityB'], at: 'cityA', startedSec: 0, nextSec: Number.MAX_SAFE_INTEGER,
    vars: { blockedByRelation: 1, blockedRouteIndex: 1 },
    data: { fromPlace: 'place-a', toPlace: 'place-b', route: { nodes: ['place-a', 'place-b'] } },
  };
  const routeBase = structuredClone(store.getState().state);
  routeBase.world.processes![blockedCaravan.id] = blockedCaravan;
  const routePersist = memoryStore();
  const routeStore = createEngineStore(routeBase, { persist: routePersist });

  const rivalry = factionRelationProposal(routeStore.getState().state, a.id, b.id, -2, 'relation-rivalry');
  expect(rivalry.patch?.kind).toBe('batch');
  routeStore.getState().propose(rivalry); routeStore.getState().accept(rivalry.id);
  expect(routeStore.getState().state.world.processes?.[blockade.id]?.ended).toBe(true);
  expect(routeStore.getState().state.world.processes?.[blockedCaravan.id]).toMatchObject({ stage: 'blocked', vars: { blockedRouteIndex: 1 } });
  expect(routeStore.getState().state.world.processes?.[blockedCaravan.id]?.vars.blockedByRelation).toBeUndefined();
  expect(cityTradeFlow(routeStore.getState().state, 'place-a', 'place-b')).toMatchObject({ relation: -2, blocked: false, multiplier: 0.5 });

  const endManualBlockade = blockadeEndProposal(routeStore.getState().state, manualBlockadeProcess.id, 'manual-blockade-ended');
  routeStore.getState().propose(endManualBlockade); routeStore.getState().accept(endManualBlockade.id);
  expect(routeStore.getState().state.world.processes?.[blockedCaravan.id]).toMatchObject({ stage: 'transit', vars: {} });

  const alliance = factionRelationProposal(routeStore.getState().state, a.id, b.id, 2, 'relation-alliance');
  routeStore.getState().propose(alliance); routeStore.getState().accept(alliance.id);
  expect(cityTradeFlow(routeStore.getState().state, 'place-a', 'place-b')).toMatchObject({ relation: 2, multiplier: 1.5, blocked: false });
  const replay = createEngineStore(routeBase, { persist: routePersist });
  expect(replay.getState().state).toEqual(routeStore.getState().state);
  replay.getState().undo();
  expect(replay.getState().state.world.factions[a.id]?.relations?.[b.id]).toBe(-2);
});

it('resolves an uprising with the documented garrison check after the revolt stage', () => {
  const state = emptyState();
  state.world.locations.city = { id: 'city', name: 'City', scale: 'settlement', population: 1_000_000, order: 2 };
  const processId = [...Array(1000)].map((_, i) => `revolt-${i}`).find(id => {
    const roll = d20(id, String(TENDAY), 'garrison');
    const strength = Math.round(Math.log2(10) * 10) / 10;
    return roll + 2 * strength >= URBAN_RULES.revoltGarrisonTarget(2);
  })!;
  const revolt: Process = {
    id: processId, kind: 'revolt', name: 'City', scale: 'settlement', stage: 'revolt', parties: ['city'], at: 'city',
    startedSec: 0, nextSec: TENDAY, vars: { tries: 1 },
    data: { version: 1, kind: 'revolt', ruleVersion: URBAN_RULES.version, ruleSource: URBAN_RULES.revoltSource },
  };
  state.world.processes = { [revolt.id]: revolt };
  const result = simulateProcesses({ state, fromSec: 0, toSec: TENDAY, timeEventId: 'revolt-garrison' }, new Map([['revolt', revoltKind()]]));
  const delta = result.find(item => item.subject === 'Волнения · City')!;
  expect(delta.now).toContain('подавлено');
  expect(delta.cause).toContain('против Сл 17');
});

it('counts only exact, dated church matches and applies two treatments per temple per day', () => {
  const treatment = confirmedTempleTreatment('place-a', 1492, [
    { id: 'church-a', name: 'Church A', title: 'A', church: true, places: ['place-a'], deities: ['helm'], formed: 1000 },
    { id: 'church-wrong-place', name: 'Church B', title: 'B', church: true, places: ['place-b'], deities: ['helm'] },
    { id: 'church-wrong-faith', name: 'Church C', title: 'C', church: true, places: ['place-a'], deities: ['tempus'] },
    { id: 'not-a-church', name: 'Guild', title: 'D', places: ['place-a'], deities: ['helm'] },
    { id: 'closed-church', name: 'Old Church', title: 'E', church: true, places: ['place-a'], deities: ['helm'], disbanded: 1492 },
  ], { 'place-a': { deities: ['helm'], text: 'Helm' } });
  expect(treatment).toMatchObject({ temples: 1, perDay: 2 });

  const state = emptyState();
  state.world.locations.home = { id: 'home', name: 'Home', scale: 'settlement', population: 1_000, stock: { food: 5 } };
  const start = processFrom(epidemicProposal(state, 'home', 5, 1.5, 'treated-outbreak', treatment));
  state.world.processes = { [start.id]: start };
  const [delta] = simulateProcesses({ state, fromSec: 0, toSec: SECONDS_PER_DAY, timeEventId: 'treated-outbreak-tick' }, new Map([['epidemic', epidemicKind]]));
  expect(delta?.cause).toContain('храмы лечат 2 из 2/день');
  if (delta?.patch?.kind !== 'batch') throw new Error('expected epidemic batch');
  expect(delta.patch.patches.some(patch => patch.kind === 'epidemicState')).toBe(true);
});

it('merges an arriving incubating exposure with a concurrent v3 outbreak tick and undoes both exactly', () => {
  const state = emptyState();
  state.world.locations.home = { id: 'home', name: 'Home', scale: 'settlement', population: 1_000 };
  const initial = processFrom(epidemicProposal(state, 'home', 3, 1.5, 'outbreak-merge'));
  state.world.processes = { [initial.id]: initial };
  const tick = simulateProcesses({ state, fromSec: 0, toSec: SECONDS_PER_DAY, timeEventId: 'outbreak-merge-tick' }, new Map([['epidemic', epidemicKind]]))[0]!;
  const exposurePatch = epidemicExposurePatch(state, 'home', {
    id: 'caravan-arrival-1', incubationDays: 2, treatmentPerDay: 0, treatmentTemples: 0, treatmentSource: 'no confirmed temples',
  }, 1.5, SECONDS_PER_DAY);
  if (!exposurePatch || tick.patch?.kind !== 'batch') throw new Error('expected exposure and tick patches');
  const imported = applyWorldPatch(state, exposurePatch);
  const appliedTick = applyWorldPatch(imported, tick.patch);
  const after = appliedTick.world.processes![initial.id]!;
  expect(after.vars.incubating2).toBeGreaterThanOrEqual(1);
  expect(after.data?.exposureIds).toContain('caravan-arrival-1');
  expect(after.vars.susceptible).toBeLessThan(imported.world.processes![initial.id]!.vars.susceptible!);

  const store = createEngineStore(state, { persist: memoryStore() });
  const first = { id: 'exposure-1', scale: 'settlement' as const, subject: 'Arrival 1', was: 'no case', now: 'one incubating case', cause: 'caravan', causeId: 'caravan-1', status: 'pending' as const, patch: exposurePatch };
  store.getState().propose(first); store.getState().accept(first.id);
  const secondPatch = epidemicExposurePatch(store.getState().state, 'home', {
    id: 'caravan-arrival-2', incubationDays: 4, treatmentPerDay: 0, treatmentTemples: 0, treatmentSource: 'no confirmed temples',
  }, 1.5, 2 * SECONDS_PER_DAY)!;
  const second = { ...first, id: 'exposure-2', subject: 'Arrival 2', causeId: 'caravan-2', patch: secondPatch };
  store.getState().propose(second); store.getState().accept(second.id);
  expect(store.getState().state.world.processes![initial.id]!.vars.incubating2).toBe(1);
  expect(store.getState().state.world.processes![initial.id]!.vars.incubating4).toBe(1);
  store.getState().undo();
  expect(store.getState().state.world.processes![initial.id]!.vars.incubating4).toBe(0);
  store.getState().undo();
  expect(store.getState().state.world.processes![initial.id]!.data?.exposureIds).toBeUndefined();
});

it('secedes a city after a successful revolt only when one dated kingdom owns its places entry', () => {
  const state = emptyState();
  state.world.locations.city = { id: 'city', name: 'City', scale: 'settlement', ref: ref('place', 'place-city'), population: 100_000, order: 2 };
  const processId = [...Array(1000)].map((_, i) => `revolt-secession-${i}`).find(id => d20(id, String(TENDAY), 'garrison') < URBAN_RULES.revoltGarrisonTarget(2))!;
  const revolt: Process = {
    id: processId, kind: 'revolt', name: 'City', scale: 'settlement', stage: 'revolt', parties: ['city'], at: 'city',
    startedSec: 0, nextSec: TENDAY, vars: { tries: 1 },
    data: { version: 1, kind: 'revolt', ruleVersion: URBAN_RULES.version, ruleSource: URBAN_RULES.revoltSource },
  };
  state.world.processes = { [revolt.id]: revolt };
  const kingdoms = [{ id: 'parent', name: 'Parent Kingdom', places: ['place-city'], founded: 1000 }];
  expect(revoltSecessionFor(state, 'city', kingdoms, 1492, TENDAY)).toMatchObject({ kind: 'settlementPolity', value: { status: 'independent' } });
  expect(revoltSecessionFor(state, 'city', [...kingdoms, { id: 'second', name: 'Second', places: ['place-city'] }], 1492, TENDAY)).toBeUndefined();
  const delta = simulateProcesses({ state, fromSec: 0, toSec: TENDAY, timeEventId: 'revolt-secession' }, new Map([['revolt', revoltKind(kingdoms)]]))[0]!;
  expect(delta.cause).toContain('город вышел из состава Parent Kingdom');
  const persist = memoryStore();
  const store = createEngineStore(state, { persist });
  store.getState().propose(delta); store.getState().accept(delta.id);
  expect(store.getState().state.world.settlementPolity?.city?.separatedFrom.kingdomId).toBe('parent');
  const replay = createEngineStore(state, { persist });
  expect(replay.getState().state.world.settlementPolity).toEqual(store.getState().state.world.settlementPolity);
  replay.getState().undo();
  expect(replay.getState().state.world.settlementPolity).toBeUndefined();
});
