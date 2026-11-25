// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adventureForPlayers, parseAdventureBundle, type AdventureBundle } from './adventure';
import { parseContentImport } from '../import/content';
import { createEngineStore } from '../engine/store';
import { emptyState } from '../engine/state';
import { memoryStore } from '../engine/persist';
const raw = () => JSON.parse(readFileSync(new URL('../../research/content-phandelver/first-vertical.json', import.meta.url), 'utf8')) as AdventureBundle;

describe('source-indexed adventure graph', () => {
  it('selected local vertical has sourced paths from entry to scenes, participants, facts and consequences', () => {
    const bundle = parseAdventureBundle(raw());
    expect(bundle.campaignYear).toBeNull();
    const counts = Object.fromEntries(['location','route','npc','creature','scene','thread','fact','plan','handout','proposal'].map(k => [k,bundle.nodes.filter(n => n.kind === k).length]));
    expect(counts).toEqual({ location:41,route:4,npc:23,creature:11,scene:20,thread:6,fact:17,plan:4,handout:2,proposal:4 });
    for (const scene of bundle.nodes.filter(n => n.kind === 'scene')) {
      expect(scene.links.some(l => l.relation === 'at')).toBe(true);
      expect(scene.links.some(l => l.relation === 'thread')).toBe(true);
    }
    const reached = new Set([bundle.entry]);
    for (let i=0; i<bundle.nodes.length; i++) for (const n of bundle.nodes) for (const l of n.links) {
      if (reached.has(n.id)) reached.add(l.target);
      if (reached.has(l.target)) reached.add(n.id);
    }
    expect([...reached].sort()).toEqual(bundle.nodes.map(n => n.id).sort());
    const proposals = bundle.nodes.filter(n => n.kind === 'proposal');
    expect(proposals.every(n => n.evidence.every(e => e.source === 'hb'))).toBe(true);
    // Limits are recorded rather than silently substituting SRD stats or imagined map positions.
    expect(bundle.nodes.filter(n => n.kind === 'creature' || n.kind === 'plan').every(n => n.preparation)).toBe(true);
  });
  it.each([
    ['dangling link', (b: AdventureBundle) => { b.nodes[0].links.push({relation:'at',target:'absent-reference'}); }],
    ['wrong target kind', (b: AdventureBundle) => { b.nodes[0].links.push({relation:'at',target:'gundren'}); }],
    ['duplicate id', (b: AdventureBundle) => { b.nodes[1].id = b.nodes[0].id; }],
    ['invalid source page', (b: AdventureBundle) => { b.nodes[0].evidence[0].pages = [65]; }],
    ['missing book page', (b: AdventureBundle) => { b.nodes[0].evidence[0].pages = []; }],
    ['source laundering', (b: AdventureBundle) => { b.distribution = 'open'; }],
    ['unknown evidence source', (b: AdventureBundle) => { b.nodes[0].evidence[0].source = 'missing'; }],
    ['non-scene entry', (b: AdventureBundle) => { b.entry = 'neverwinter'; }],
  ])('rejects %s before import', (_name, mutate) => {
    const bundle = raw(); mutate(bundle);
    expect(() => parseContentImport('adventure.json', JSON.stringify(bundle))).toThrow(/Приключение/);
  });
  it('player projection omits secret graph, metadata and incoming links, even with a known location', () => {
    const bundle = parseAdventureBundle(raw());
    expect(adventureForPlayers(bundle).nodes.map(n => n.id)).toEqual(['delivery-note','town-leads']);
    const view = adventureForPlayers(bundle, new Set(['phandalin','job','arrival']));
    expect(view.nodes.map(n => n.id)).toEqual(['phandalin','arrival','job','delivery-note','town-leads']);
    expect(view.nodes.find(n => n.id === 'phandalin')?.links).toEqual([]); // hidden plan is not revealed with the town
    expect(view.nodes.find(n => n.id === 'arrival')?.links).toEqual([]); // hidden place/NPC/thread stay hidden
    expect(view.nodes.find(n => n.id === 'job')?.links).toEqual([{relation:'discover-in',target:'arrival'}]);
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/Ярно|Стеклянного|source|evidence|sha256|preparation|gundren-map/);
  });
  it('catalog acceptance/undo/reload retains the whole graph without activating actors or world locations', () => {
    const [candidate] = parseContentImport('adventure.json', JSON.stringify(raw()));
    expect(candidate.kind).toBe('adventure');
    expect(candidate.worldLocation).toBeUndefined();
    const persisted = memoryStore();
    let counter = 0;
    const fixed = { ids: {next: () => `e${++counter}`}, clock:{now:() => 1000+counter} };
    const store = createEngineStore(emptyState(), {persist:persisted,...fixed});
    const api = store.getState();
    const cause = api.note('Локальная подготовка приключения', [], 'settlement');
    api.propose({id:'adventure-import',scale:'settlement',subject:candidate.name,was:'не импортировано',now:'каталог',cause:'локальный файл',causeId:cause.id,status:'pending',patch:{kind:'importedContent',content:candidate}});
    expect(store.getState().state.world.importedContent?.[candidate.id]).toBeUndefined();
    api.accept('adventure-import');
    expect(store.getState().state.world.importedContent?.[candidate.id].data).toEqual(raw());
    expect(store.getState().state.actors).toEqual({});
    expect(store.getState().state.world.locations).toEqual({});
    const restored = createEngineStore(emptyState(),{persist:persisted,...fixed});
    expect(restored.getState().state.world.importedContent).toEqual(store.getState().state.world.importedContent);
    restored.getState().undo();
    expect(restored.getState().state.world.importedContent?.[candidate.id]).toBeUndefined();
    const undone = createEngineStore(emptyState(),{persist:persisted,...fixed});
    expect(undone.getState().state.world.importedContent?.[candidate.id]).toBeUndefined();
    expect(undone.getState().state.deltas['adventure-import'].status).toBe('pending');
  });
});
