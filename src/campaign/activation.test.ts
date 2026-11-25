import { describe, expect, it } from 'vitest';
import { applyWorldPatch } from '../engine/reduce';
import { planReferenceActivation, isMonsterReference } from './activation';
import { seedState } from './seed';
import { LOCATION } from './world';

describe('typed reference activation plans', () => {
  it('creates monster actor snapshots without mutating state; the desk owns ACTOR_SPAWNED', () => {
    const state = seedState();
    const actorIds = Object.keys(state.actors);
    expect(isMonsterReference('bandit')).toBe(true);
    expect(isMonsterReference('not-a-monster')).toBe(false);

    const plan = planReferenceActivation(state, { kind: 'monster', monsterId: 'bandit', name: 'Bandit', count: 2 });

    expect(plan).toMatchObject({ kind: 'actors', reference: 'monster:bandit' });
    if (plan.kind !== 'actors') throw new Error('ожидался план создания актёров');
    expect(plan.actors.map(actor => actor.id)).toEqual(['bandit-4', 'bandit-5']);
    expect(Object.keys(state.actors)).toEqual(actorIds);
  });

  it('creates a place patch plan without activating the imported place; existing places resolve without a patch', () => {
    const state = seedState();
    const waterdeep = { id: 'e37dd71f-f84a-4ba1-a21c-2c98f6ad3cc2', name: 'Waterdeep', x: 8770, y: 3045 };
    const plan = planReferenceActivation(state, { kind: 'place', place: waterdeep, map: 'toril' });

    expect(plan).toMatchObject({ kind: 'location', reference: `place:${waterdeep.id}`, patch: { kind: 'newLocation' } });
    expect(Object.values(state.world.locations).some(location => location.ref === `place:${waterdeep.id}`)).toBe(false);
    if (plan.kind !== 'location' || !plan.patch) throw new Error('ожидался план нового места');
    const proposedState = applyWorldPatch(state, plan.patch);
    expect(proposedState.world.locations[plan.location.id]?.ref).toBe(`place:${waterdeep.id}`);

    const existing = planReferenceActivation(state, {
      kind: 'place', place: { id: '7e243b80-8918-42fa-b60e-03cec8bdb184', name: 'Neverwinter', x: 8522, y: 2610 }, map: 'toril',
    });
    expect(existing).toEqual({ kind: 'location', reference: 'place:7e243b80-8918-42fa-b60e-03cec8bdb184', location: state.world.locations[LOCATION.neverwinter] });
  });
});
