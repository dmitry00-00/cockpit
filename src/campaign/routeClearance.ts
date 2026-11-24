import type { State } from '../engine/state';

export interface CaravanRouteClearance {
  blockaded: boolean;
  front: boolean;
}

/**
 * The exact campaign processes that make a map place closed to a caravan.
 * Kept independent from the reducer and process registry so proposals can
 * capture and compare this read dependency without introducing an import cycle.
 */
export function caravanRouteClearanceSnapshot(state: State, placeId: string): CaravanRouteClearance {
  const blockades: string[] = [];
  const fronts: string[] = [];
  for (const process of Object.values(state.world.processes ?? {})) {
    const data = process.data as Record<string, unknown> | undefined;
    if (process.kind === 'blockade' && !process.ended && data?.kind === 'blockade'
      && data.version === 1 && !Array.isArray(data.relationFactions) && data.targetPlaceId === placeId) {
      blockades.push(process.id);
      continue;
    }
    const front = data?.front as { nodes?: readonly { id?: unknown }[] } | undefined;
    if (process.kind === 'war' && !process.ended && ['campaign', 'protracted'].includes(process.stage)
      && data?.kind === 'war' && data.version === 1 && data.ruleVersion === 'dm-cockpit-war/1'
      && data.sideA && data.sideB && Array.isArray(front?.nodes)
      && front.nodes.some(node => node?.id === placeId)) {
      fronts.push(process.id);
    }
  }
  // routeClosed short-circuits on a blockade, so a front is a dependency only
  // when no blockade already closes the place.
  return { blockaded: blockades.length > 0, front: blockades.length === 0 && fronts.length > 0 };
}
