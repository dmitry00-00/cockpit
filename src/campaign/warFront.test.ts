// @vitest-environment node
import { expect, it } from 'vitest';
import type { Kingdom } from '../world/kingdoms';
import { parseGraph } from '../world/graph';
import type { CaravanResources } from './caravan';
import { previewWarFront, warPlaces } from './warFront';

const kingdoms = new Map<string, Kingdom>([
  ['empire', { id: 'empire', name: 'Empire', title: 'Empire', type: 'Empire', capitalPlace: 'capital-a', places: ['capital-a', 'city-a'] }],
  ['kingdom', { id: 'kingdom', name: 'Kingdom', title: 'Kingdom', type: 'Kingdom', capitalPlace: 'capital-b', places: ['capital-b'] }],
]);
const resources: CaravanResources = {
  graph: parseGraph({
    map: 'toril',
    nodes: [['capital-a', 0, 0, 0], ['mid', 5, 0, 0], ['capital-b', 10, 0, 0], ['city-a', 1, 1, 0]],
    edges: [[0, 1, 'road', 10], [1, 2, 'land', 20, 0.5], [0, 2, 'water', 1], [0, 3, 'road', 3]],
  }),
  places: new Map([
    ['capital-a', { id: 'capital-a', name: 'A capital', x: 0, y: 0 }], ['mid', { id: 'mid', name: 'Middle', x: 5, y: 0 }],
    ['capital-b', { id: 'capital-b', name: 'B capital', x: 10, y: 0 }], ['city-a', { id: 'city-a', name: 'A city', x: 1, y: 1 }],
  ]),
  econ: {} as CaravanResources['econ'], kingdoms,
};

it('defaults to each capital and finds a walking route even when water is shorter', () => {
  const result = previewWarFront(resources, 'empire', 'kingdom', 1492);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.front).toMatchObject({ fromPlace: 'capital-a', toPlace: 'capital-b', miles: 30, tier: 3 });
  expect(result.front.nodes.map(node => node.id)).toEqual(['capital-a', 'mid', 'capital-b']);
  expect(warPlaces(resources, 'empire', 1492)[0].id).toBe('capital-a');
});

it('supports explicitly chosen kingdom-linked places and reports missing walking routes', () => {
  const alternative = previewWarFront(resources, 'empire', 'kingdom', 1492, 'city-a', 'capital-b');
  expect(alternative.ok && alternative.front.fromPlace).toBe('city-a');
  expect(previewWarFront(resources, 'empire', 'kingdom', 1492, 'mid', 'capital-b')).toMatchObject({ ok: false });
});
