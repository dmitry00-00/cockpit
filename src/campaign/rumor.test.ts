import { describe, expect, it } from 'vitest';
import { emptyState } from '../engine/state';
import { applyWorldPatch } from '../engine/reduce';
import type { GraphEdge, GraphNode, WorldGraph } from '../world/graph';
import type { CaravanResources } from './caravan';
import { rumorKind, rumorProposal } from './rumor';
import { simulateProcesses } from './processes';
import { EventLog } from '../engine/log';

function fixture() {
  const nodes: GraphNode[] = [
    { id: 'a', x: 0, y: 0, harbour: false }, { id: 'b', x: 5, y: 0, harbour: false }, { id: 'c', x: 12, y: 0, harbour: false },
  ];
  const edges: GraphEdge[] = [
    { a: 'a', b: 'b', mode: 'road', miles: 5 }, { a: 'b', b: 'c', mode: 'road', miles: 7 },
    { a: 'a', b: 'c', mode: 'road', miles: 3 },
  ];
  const graph: WorldGraph = {
    map: 'toril', nodes: new Map(nodes.map(node => [node.id, node])), edges,
    adj: new Map(nodes.map(node => [node.id, edges.filter(edge => edge.a === node.id || edge.b === node.id)])),
  };
  const places = new Map(nodes.map(node => [node.id, { id: node.id, name: `Town ${node.id}`, x: node.x, y: node.y }]));
  const resources = { graph, places, econ: {}, kingdoms: new Map() } as unknown as CaravanResources;
  const state = emptyState();
  state.time.sec = 1_000;
  state.world.locations.region = { id: 'region', name: 'Sword Coast', scale: 'region', geo: { map: 'toril', x: 0, y: 0, r: 100 } };
  return { state, resources };
}

describe('С8 · распространение слуха', () => {
  it('создаёт только обратимое предложение; текст становится открытым фактом на конечном месте после прибытия', () => {
    const { state, resources } = fixture();
    const delta = rumorProposal(state, resources, {
      from: 'a', to: 'c', checkpoints: ['b'], text: 'У северных ворот слышали волков', speedMilesPerDay: 10, timeEventId: 'note-1',
    });
    expect(Object.keys(state.world.processes ?? {})).toHaveLength(0);
    expect(delta.status).toBe('pending');
    expect(delta.patch?.kind).toBe('batch');
    state.deltas[delta.id] = delta;
    expect(() => rumorProposal(state, resources, {
      from: 'a', to: 'c', checkpoints: ['b'], text: 'У северных ворот слышали волков', speedMilesPerDay: 10, timeEventId: 'duplicate-note',
    })).toThrow(/ожидает решения/);

    const started = applyWorldPatch(state, delta.patch!);
    let process = Object.values(started.world.processes ?? {}).find(item => item.kind === 'rumor')!;
    const first = rumorKind.tick(process, { state: started, sec: process.nextSec, roll: () => 10 });
    expect(first.process.ended).not.toBe(true);
    expect(first.patches).toBeUndefined();
    process = first.process;

    const arrival = rumorKind.tick(process, { state: started, sec: process.nextSec, roll: () => 10 });
    expect(arrival.process).toMatchObject({ ended: true, stage: 'arrived', at: 'loc-town-c' });
    expect(arrival.patches).toEqual([{
      kind: 'newFact', fact: expect.objectContaining({
        text: 'У северных ворот слышали волков', visibility: 'players', category: 'rumor', subjectId: 'loc-town-c',
      }),
    }]);
  });

  it('rejects invalid speed and impossible route without mutating campaign state', () => {
    const { state, resources } = fixture();
    const base = { from: 'a', to: 'c', text: 'весть', timeEventId: 'note-2' };
    expect(() => rumorProposal(state, resources, { ...base, speedMilesPerDay: 0 })).toThrow(/положительную скорость/);
    const disconnected = { ...resources, graph: { ...resources.graph, adj: new Map([...resources.graph.nodes.keys()].map(id => [id, []])), edges: [] } } as unknown as CaravanResources;
    expect(() => rumorProposal(state, disconnected, { ...base, speedMilesPerDay: 10 })).toThrow(/нет сухопутного пути/);
    expect(() => rumorProposal(state, resources, { ...base, speedMilesPerDay: Number.MIN_VALUE })).toThrow(/срок слишком велик|скорость слишком мала/);
    expect(Object.keys(state.world.processes ?? {})).toHaveLength(0);
  });

  it('accepts, replays, undoes and redoes the delivered rumor as one world patch', () => {
    const { state, resources } = fixture();
    const start = rumorProposal(state, resources, {
      from: 'a', to: 'c', checkpoints: ['b'], text: 'A messenger saw a sealed letter', speedMilesPerDay: 10, timeEventId: 'note-3',
    });
    const log = new EventLog(state, [], { clock: { now: () => 50 }, ids: { next: (() => { let id = 0; return () => `rumor-event-${++id}`; })() } });
    log.dispatch({ type: 'WORLD_DELTA_PROPOSED', payload: { delta: start } });
    log.dispatch({ type: 'WORLD_DELTA_ACCEPTED', payload: { deltaId: start.id, subject: start.subject, was: start.was, now: start.now, causeId: start.causeId } });
    const process = Object.values(log.state.world.processes ?? {}).find(item => item.kind === 'rumor')!;
    const arrivalSec = process.nextSec + Math.ceil(7 / 10 * 86_400);
    const arrival = simulateProcesses({ state: log.state, fromSec: log.state.time.sec, toSec: arrivalSec, timeEventId: 'step-1' }, new Map([['rumor', rumorKind]]))[0]!;
    log.dispatch({ type: 'WORLD_DELTA_PROPOSED', payload: { delta: arrival } });
    log.dispatch({ type: 'WORLD_DELTA_ACCEPTED', payload: { deltaId: arrival.id, subject: arrival.subject, was: arrival.was, now: arrival.now, causeId: arrival.causeId } });

    const factId = `fact-${process.id}`;
    expect(log.state.facts[factId]).toMatchObject({ text: 'A messenger saw a sealed letter', visibility: 'players', category: 'rumor' });
    log.undo();
    expect(log.state.facts[factId]).toBeUndefined();
    expect(log.state.world.processes?.[process.id]?.ended).not.toBe(true);
    log.redo();
    expect(log.state.facts[factId]).toBeDefined();
    expect(new EventLog(state, log.entries).state).toEqual(log.state);
  });
});
