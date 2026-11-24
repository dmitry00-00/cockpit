// C6 catalog boundary: the large planar/celestial catalogs load only when the GM opens the cosmic planner.
import type { State, WorldDelta } from '../engine/state';
import { registerProcessKind } from './processes';
import type { CosmicRequestInput, CosmicTargetOption } from './cosmic';

export interface PreparedCosmicSimulation {
  targets: () => readonly CosmicTargetOption[];
  propose: (state: State, input: CosmicRequestInput) => WorldDelta;
}

let prepared: Promise<PreparedCosmicSimulation> | null = null;

export function prepareCosmicSimulation(): Promise<PreparedCosmicSimulation> {
  prepared ??= Promise.all([
    import('./cosmic'),
    import('../cosmos/realmspace').catch(() => null),
    import('../cosmos/planes').catch(() => null),
  ]).then(([cosmic, realmspace, planes]) => {
    registerProcessKind(cosmic.cosmicKind);
    const options = cosmic.cosmicTargets({
      ...(realmspace ? { realmspace: realmspace.REALMSPACE } : {}),
      ...(planes ? { greatWheel: planes.GREAT_WHEEL, worldTree: planes.WORLD_TREE } : {}),
    });
    return {
      targets: () => options,
      propose: (state: State, input: CosmicRequestInput) => cosmic.cosmicProposal(state, options, input),
    };
  }).catch(error => {
    prepared = null;
    throw error;
  });
  return prepared;
}
