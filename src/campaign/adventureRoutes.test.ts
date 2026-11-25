// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adventureRoutesForMap, authoredRoutePaths, planAdventureRoute } from './adventureRoutes';
import { parseAdventureBundle, type AdventureBundle } from '../packages/adventure';
import type { AdventureRouteState } from '../engine/state';

const bundle = () => parseAdventureBundle(JSON.parse(readFileSync(new URL('../../research/content-phandelver/first-vertical.json', import.meta.url), 'utf8')) as AdventureBundle);

describe('authored route topology', () => {
  it('keeps the source order and plans only its directed links, without distances', () => {
    const graph = bundle();
    const plan = planAdventureRoute(graph, {}, 'neverwinter', 'phandalin');
    expect(plan).toEqual({ locationIds: ['neverwinter', 'high-road', 'triboar-trail', 'phandalin'], routeIds: ['supply-route'] });
    expect(plan).not.toHaveProperty('miles');
    expect(planAdventureRoute(graph, {}, 'phandalin', 'neverwinter')).toBeNull();
  });

  it('excludes closed route edges and reports unreachable destinations', () => {
    const graph = bundle();
    const states: Record<string, AdventureRouteState> = { 'supply-route': { status: 'closed', causeId: 'event-1', reason: 'мост разрушен', proposedSec: 1 } };
    expect(planAdventureRoute(graph, states, 'neverwinter', 'phandalin')).toBeNull();
    expect(authoredRoutePaths(graph, states).find(route => route.id === 'supply-route')).toMatchObject({ status: 'closed', locationIds: ['neverwinter', 'high-road', 'triboar-trail', 'phandalin'] });
  });

  it('shows map status only on a map explicitly named by a location anchor', () => {
    const graph = bundle();
    expect(adventureRoutesForMap(graph, {}, 'toril').map(route => route.id)).toContain('supply-route');
    expect(adventureRoutesForMap(graph, {}, 'unmapped').map(route => route.id)).toEqual([]);
  });
});
