import { describe, expect, it } from 'vitest';
import { levelPlanFingerprint, loadLevelPlan, saveLevelPlan, type PlanStorage } from './levelPlanStorage';

function memory(): PlanStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return { values, getItem: k => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); }, removeItem: k => { values.delete(k); } };
}
const draft = { target: 7, choices: [{ hp: { method: 'average' as const } }] };

describe('local level plan persistence', () => {
  it('round trips per actor and sheet fingerprint', () => {
    const store = memory(); const fingerprint = levelPlanFingerprint({ level: 5, classId: 'fighter' });
    const withFeatureReplacement = { target: 7, choices: [{ hp: { method: 'average' as const }, featureChoiceReplacements: { 'battle-maneuver': { from: 'trip', to: 'riposte' } } }] };
    expect(saveLevelPlan(store, 'actor-a', fingerprint, withFeatureReplacement)).toBe(true);
    expect(loadLevelPlan(store, 'actor-a', fingerprint, 5)).toEqual(withFeatureReplacement);
    expect(loadLevelPlan(store, 'actor-b', fingerprint, 5)).toBeUndefined();
  });
  it('discards drafts when the base sheet changes or stored data is malformed', () => {
    const store = memory(); const fingerprint = levelPlanFingerprint({ level: 5 });
    saveLevelPlan(store, 'a', fingerprint, draft);
    expect(loadLevelPlan(store, 'a', levelPlanFingerprint({ level: 6 }), 6)).toBeUndefined();
    saveLevelPlan(store, 'a', fingerprint, draft);
    store.values.set('dm-cockpit:level-plan:v1:a', '{broken');
    expect(loadLevelPlan(store, 'a', fingerprint, 5)).toBeUndefined();
  });
  it('rejects malformed nested choice fields instead of returning corrupt objects', () => {
    const store = memory(); const fingerprint = levelPlanFingerprint({ level: 5 });
    const key = 'dm-cockpit:level-plan:v1:a';
    for (const choice of [
      { hp: { method: 'roll', roll: '6' } },
      { hp: { method: 'average', roll: 2 } },
      { hp: { method: 'average' }, asi: { wisdom: '2' } },
      { hp: { method: 'average' }, spells: [null] },
      { hp: { method: 'average' }, featureChoices: { expertise: 'arcana' } },
      { hp: { method: 'average' }, replaceSpell: { from: 'x', to: 5 } },
      { hp: { method: 'average' }, featureChoiceReplacements: { '': { from: 'x', to: 'y' } } },
      { hp: { method: 'average' }, featureChoiceReplacements: { maneuver: { from: 'x', to: '' } } },
      { hp: { method: 'average' }, featureChoiceReplacements: { maneuver: { from: 'x', to: 'y', note: true } } },
    ]) {
      store.values.set(key, JSON.stringify({ version: 1, fingerprint, target: 7, choices: [choice] }));
      expect(loadLevelPlan(store, 'a', fingerprint, 5)).toBeUndefined();
      expect(store.values.has(key)).toBe(false);
    }
  });
  it('handles storage exceptions without throwing', () => {
    const broken: PlanStorage = { getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('full'); }, removeItem: () => { throw Error('denied'); } };
    expect(loadLevelPlan(broken, 'a', 'fp', 1)).toBeUndefined();
    expect(saveLevelPlan(broken, 'a', 'fp', draft)).toBe(false);
  });
});

it('preserves target-only drafts before the first complete step', () => {
 const store=memory();const fingerprint=levelPlanFingerprint({level:5});
 expect(saveLevelPlan(store,'target-only',fingerprint,{target:20,choices:[]})).toBe(true);
 expect(loadLevelPlan(store,'target-only',fingerprint,5)).toEqual({target:20,choices:[]});
});
