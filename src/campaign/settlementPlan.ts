import type { State, WorldDelta, Location, SettlementPlanRecord } from '../engine/state';
import { DEFAULT_SETTING_PACKAGE } from '../packages/settings';
import { generateSettlementDraft, settlementSeedKey, validateSettlementDraft, type SettlementDraft } from '../map/settlementDraft';

/** Generating/opening a preview is pure navigation. Only accepting its proposal writes a snapshot. */
export function settlementPreview(state: State, location: Location, mapId: string): Readonly<SettlementDraft> {
  const accepted=state.world.settlementPlans?.[location.id];
  if (accepted && accepted.settingPackageId===(state.settingPackageId??DEFAULT_SETTING_PACKAGE) && accepted.mapId===mapId) return accepted.draft;
  const seed=settlementSeedKey(state.settingPackageId??DEFAULT_SETTING_PACKAGE,mapId,location.ref??location.id);
  return generateSettlementDraft({seed,placeId:location.ref??location.id,population:location.population??null});
}
export function settlementPlanDelta(state: State, location: Location, mapId: string, draft: SettlementDraft): WorldDelta {
  validateSettlementDraft(draft);
  const plan: SettlementPlanRecord={locationId:location.id,settingPackageId:state.settingPackageId??DEFAULT_SETTING_PACKAGE,mapId,draft:structuredClone(draft)};
  const base=`d-plan-${location.id}`;
  let id=base;
  for(let n=2;state.deltas[id];n++)id=`${base}-${n}`;
  return {id,scale:'settlement',subject:`Авторский план · ${location.name}`,was:state.world.settlementPlans?.[location.id]?'закреплённый авторский план':'авторский план не закреплён',now:`${draft.buildings.length} зданий · сетка ${draft.gridFeet} футов`,cause:'мастер проверил авторский черновик; канонический план сохраняет приоритет',causeId:location.id,status:'pending',patch:{kind:'settlementPlan',plan}};
}
