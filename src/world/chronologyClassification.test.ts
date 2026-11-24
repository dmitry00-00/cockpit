import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import report from '../../research/chronology/classification-report.json';
import { CHRONO_KIND_LABEL, loadArticleEvents, snapshotExport, type ChronoIndex } from './chronology';

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([key,v]) => [key,ordered(v)]));
  return value;
}
describe('reviewed chronology primary topics', () => {
  it('covers the complete article layer, preserves source facts, and keeps provenance on export', async () => {
    const events = await loadArticleEvents(-1_000_000,1_000_000);
    expect(events).toHaveLength(1581);
    expect(new Set(events.map(e=>e.id)).size).toBe(1581);
    expect(events.every(e=>e.kind && e.kind in CHRONO_KIND_LABEL)).toBe(true);
    expect(events.filter(e=>e.classification?.origin==='editorial')).toHaveLength(900);
    expect(events.filter(e=>e.classification?.origin==='canonical-match')).toHaveLength(553);
    expect(events.filter(e=>!e.classification)).toHaveLength(128);
    for (const event of events) {
      if (event.classification?.evidence) expect(event.text).toContain(event.classification.evidence);
      if (event.classification) expect(event.classification.assignedKind).toBe(event.kind);
    }
    const facts=[...events].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(e=>Object.fromEntries(Object.entries(e).filter(([key])=>key!=='kind'&&key!=='classification')));
    expect(createHash('sha256').update(JSON.stringify(ordered(facts))).digest('hex')).toBe(report.sourceFactsSha256);
    const index: ChronoIndex={attribution:'Forgotten Realms Wiki contributors',license:'CC BY-SA 3.0',eras:[],chunks:[],years:[]};
    const exported=snapshotExport(1492,{index,events:[],articleEvents:events});
    expect(exported.articleEvents.find(e=>e.id==='a1492-3')?.classification?.origin).toBe('editorial');
    expect(exported.articleEvents.every(e=>e.year===1492)).toBe(true);
  });
  it('does not confuse names with celestial events or in-world writing with publications about a year', async () => {
    const events=await loadArticleEvents(-1_000_000,1_000_000);
    const byId=new Map(events.map(e=>[e.id,e]));
    expect(byId.get('a-23600-2')?.kind).toBe('politics');
    expect(byId.get('a-22900-1')?.kind).not.toBe('realmspace');
    expect(byId.get('a-25000-2')?.kind).toBe('politics');
    expect(byId.get('a1259-3')?.kind).toBe('politics');
    expect(byId.get('a112-1')?.kind).toBe('people');
    expect(byId.get('a1372-24')).toMatchObject({kind:'misc',classification:{origin:'editorial'}});
  });
});
