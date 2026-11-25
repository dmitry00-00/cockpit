// UI draft identity, outside the event log: renewed only for a different campaign file/reset.
const KEY='dm-cockpit:level-plan:campaign';
export function campaignPlanScope(fresh=false):string {
 try { const existing=localStorage.getItem(KEY);if(existing&&!fresh)return existing;
  const id=crypto.randomUUID();localStorage.setItem(KEY,id);return id;
 }catch{return crypto.randomUUID();}
}
