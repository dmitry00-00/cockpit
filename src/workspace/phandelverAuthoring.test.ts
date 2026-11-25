import { expect, it } from 'vitest';
import pilotData from '../../research/content-phandelver/first-vertical.json';
import { parseAdventureBundle } from '../packages/adventure';
import { compareReferenceSets, PHANDELVER_PILOT_PLANS, PHANDELVER_PILOT_RECAP, resolvePilotNarrative, resolvePlanReferences } from './phandelverAuthoring';

const bundle = parseAdventureBundle(pilotData);

it('compares exact map and text reference sets, preserving agreement and both kinds of mismatch', () => {
  expect(compareReferenceSets(['arrival', 'ambush'], ['ambush', 'arrival']))
    .toEqual({ sharedIds: ['arrival', 'ambush'], mapOnlyIds: [], textOnlyIds: [] });
  expect(compareReferenceSets(['ambush', 'arrival', 'town-plan'], ['arrival', 'ambush']))
    .toEqual({ sharedIds: ['ambush', 'arrival'], mapOnlyIds: ['town-plan'], textOnlyIds: [] });
  expect(compareReferenceSets(['ambush', 'arrival'], ['arrival', 'supply-route']))
    .toEqual({ sharedIds: ['arrival'], mapOnlyIds: ['ambush'], textOnlyIds: ['supply-route'] });
});

it('resolves the authored opening recap to stable BA23 IDs without inferring outcomes', () => {
  const resolved = resolvePilotNarrative(bundle, PHANDELVER_PILOT_RECAP);
  const ids = resolved.mentions.map(mention => mention.nodeId);
  expect(ids).toEqual(expect.arrayContaining(['supply-route', 'delivery-thread', 'arrival', 'ambush', 'trail', 'goblin-route', 'cragmaw-hideout']));
  expect(resolved.ambiguous).toEqual([]);
  expect(resolved.unknown).toEqual([]);
  expect(PHANDELVER_PILOT_RECAP).toContain('исходы пока не заданы');
});

it('keeps exact plan pins separate from graph context and reports routes without drawn geometry', () => {
  const resolved = resolvePlanReferences(bundle, PHANDELVER_PILOT_PLANS);
  expect(resolved.spatialIds).toContain('cragmaw-hideout');
  expect(resolved.contextIds).toEqual(expect.arrayContaining(['arrival', 'ambush', 'trail', 'goblin-route', 'supply-route', 'delivery-thread']));
  expect(resolved.routeIdsWithoutGeometry).toEqual(expect.arrayContaining(['goblin-route', 'supply-route']));
});

it('surfaces ambiguous matches and explicitly marked unknown names instead of resolving heuristically', () => {
  const duplicate = { ...bundle.nodes.find(node => node.id === 'ambush')!, id: 'ambush-copy' };
  const synthetic = { ...bundle, nodes: [...bundle.nodes, duplicate] };
  const resolved = resolvePilotNarrative(synthetic, '«Засада на дороге», [[Новый дозорный]], «Воронья башня»');
  expect(resolved.ambiguous).toContainEqual({ label: 'засада на дороге', candidates: ['ambush', 'ambush-copy'] });
  expect(resolved.unknown).toEqual(['Новый дозорный', 'Воронья башня']);
});
