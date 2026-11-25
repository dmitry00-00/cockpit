import { describe, expect, it } from 'vitest';
import { seedEngine } from './seed';
import { LOCATION } from './world';
import { settlementPlanDelta, settlementPreview } from './settlementPlan';
import { parseLog, serializeLog, type EventStore } from '../engine/persist';
import { levelMap } from '../map/levelMap';
import { projectPlayer } from '../player/projection';
import { planOf } from '../map/maps';
import type { DomainEvent } from '../engine/events';

const fixed=()=>{let n=0;return {clock:{now:()=>1000+n},ids:{next:()=>`plan-e${++n}`}};};
describe('accepted settlement plan snapshots',()=>{
  it('preview and proposal do not activate geometry; acceptance survives reload, undo and redo without regeneration',()=>{
    let saved:DomainEvent[]|null=null;
    const persist:EventStore={load:()=>saved,save:events=>{saved=parseLog(serializeLog(events));},clear:()=>{saved=null;}};
    const store=seedEngine({...fixed(),persist}),api=()=>store.getState();
    const location=api().state.world.locations[LOCATION.neverwinter];
    const before=api().events.length;
    const draft=settlementPreview(api().state,location,'toril');
    expect(settlementPreview(api().state,location,'toril')).toEqual(draft);
    expect(api().events).toHaveLength(before);
    const proposal=settlementPlanDelta(api().state,location,'toril',draft);
    api().propose(proposal);
    expect(api().state.world.settlementPlans?.[location.id]).toBeUndefined();
    api().accept(proposal.id);
    expect(api().state.world.settlementPlans?.[location.id].draft).toEqual(draft);
    expect(api().state.world.locations[location.id]).toEqual(location);
    expect(JSON.stringify(projectPlayer(api().state,'bo'))).not.toContain('generatorVersion');
    expect(JSON.stringify(projectPlayer(api().state,'bo'))).not.toContain(draft.seed);
    api().undo();
    expect(api().state.world.settlementPlans?.[location.id]).toBeUndefined();
    api().redo();
    const loaded=seedEngine({...fixed(),persist});
    expect(loaded.getState().state.world.settlementPlans?.[location.id].draft).toEqual(draft);
    // Canonical package plan remains the default even with accepted authored geometry.
    const canonical=planOf(location.ref)!;
    const ladder={level:'settlement' as const,path:{settlement:location.id}};
    expect(levelMap(loaded.getState().state,ladder)?.passport.id).toBe(canonical.id);
  });
  it('rejects mismatched place/setting geometry and restores the previous full snapshot after replacement undo',()=>{
    const store=seedEngine(fixed()),api=()=>store.getState();
    const location=api().state.world.locations[LOCATION.neverwinter];
    const original=settlementPreview(api().state,location,'toril');
    const p=settlementPlanDelta(api().state,location,'toril',original);
    api().propose(p);api().accept(p.id);
    const changed=structuredClone(original);changed.buildings[0].name='Авторская постройка';
    const replacement=settlementPlanDelta(api().state,location,'toril',changed);
    api().propose(replacement);api().accept(replacement.id);
    expect(api().state.world.settlementPlans?.[location.id].draft.buildings[0].name).toBe(changed.buildings[0].name);
    api().undo();
    expect(api().state.world.settlementPlans?.[location.id].draft).toEqual(original);
    const wrong=settlementPlanDelta(api().state,location,'toril',{...original,placeId:'other-place'});
    api().propose(wrong);
    expect(()=>api().accept(wrong.id)).toThrow(/другого места/);
    expect(api().state.world.settlementPlans?.[location.id].draft).toEqual(original);
  });
});
