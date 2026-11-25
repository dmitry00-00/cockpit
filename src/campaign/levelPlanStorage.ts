import type { LevelUpChoice } from './levelUp';
import { ABILITY_IDS } from '../rules/srd/abilities';

const PREFIX = 'dm-cockpit:level-plan:v1:';
export interface SavedLevelPlan { target: number; choices: LevelUpChoice[] }
export interface PlanStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

/** Stable identity for the sheet the plan was based on; any sheet edit invalidates its draft. */
export function levelPlanFingerprint(sheet: unknown): string {
  return JSON.stringify(sheet ?? null);
}

const keyFor = (actorId: string) => `${PREFIX}${encodeURIComponent(actorId)}`;
const validChoice = (v: unknown): v is LevelUpChoice => {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  if (Object.keys(c).some(key => !['hp', 'subclassId', 'asi', 'featId', 'spells', 'replaceSpell', 'replaceCantrip', 'featureChoices', 'featureChoiceReplacements'].includes(key))) return false;
  if (!c.hp || typeof c.hp !== 'object' || Array.isArray(c.hp)) return false;
  const hp = c.hp as Record<string, unknown>;
  if (hp.method === 'average') { if (Object.keys(hp).some(k => k !== 'method')) return false; }
  else if (hp.method === 'roll') {
    if (Object.keys(hp).some(k => !['method', 'roll'].includes(k)) || !Number.isInteger(hp.roll) || (hp.roll as number) < 1) return false;
  } else return false;
  if (c.subclassId !== undefined && (typeof c.subclassId !== 'string' || !c.subclassId)) return false;
  if (c.featId !== undefined && (typeof c.featId !== 'string' || !c.featId)) return false;
  if (c.asi !== undefined) {
    if (!c.asi || typeof c.asi !== 'object' || Array.isArray(c.asi)) return false;
    const asi = c.asi as Record<string, unknown>;
    if (Object.keys(asi).some(key => !(ABILITY_IDS as readonly string[]).includes(key)) || Object.values(asi).some(n => n !== 1 && n !== 2)) return false;
  }
  if (c.spells !== undefined && (!Array.isArray(c.spells) || c.spells.some(id => typeof id !== 'string' || !id) || new Set(c.spells).size !== c.spells.length)) return false;
  if (c.replaceSpell !== undefined) {
    if (!c.replaceSpell || typeof c.replaceSpell !== 'object' || Array.isArray(c.replaceSpell)) return false;
    const replacement = c.replaceSpell as Record<string, unknown>;
    if (Object.keys(replacement).some(key => !['from', 'to'].includes(key)) || typeof replacement.from !== 'string' || !replacement.from || typeof replacement.to !== 'string' || !replacement.to) return false;
  }
  if (c.replaceCantrip !== undefined) {
    if (!c.replaceCantrip || typeof c.replaceCantrip !== 'object' || Array.isArray(c.replaceCantrip)) return false;
    const replacement = c.replaceCantrip as Record<string, unknown>;
    if (Object.keys(replacement).some(key => !['from', 'to'].includes(key)) || typeof replacement.from !== 'string' || !replacement.from || typeof replacement.to !== 'string' || !replacement.to) return false;
  }
  if (c.featureChoices !== undefined) {
    if (!c.featureChoices || typeof c.featureChoices !== 'object' || Array.isArray(c.featureChoices)) return false;
    const choices = c.featureChoices as Record<string, unknown>;
    if (Object.values(choices).some(ids => !Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length)) return false;
  }
  if (c.featureChoiceReplacements !== undefined) {
    if (!c.featureChoiceReplacements || typeof c.featureChoiceReplacements !== 'object' || Array.isArray(c.featureChoiceReplacements)) return false;
    const replacements = c.featureChoiceReplacements as Record<string, unknown>;
    if (Object.entries(replacements).some(([id, value]) => {
      if (!id || !value || typeof value !== 'object' || Array.isArray(value)) return true;
      const replacement = value as Record<string, unknown>;
      return Object.keys(replacement).some(key => !['from', 'to'].includes(key))
        || typeof replacement.from !== 'string' || !replacement.from
        || typeof replacement.to !== 'string' || !replacement.to;
    })) return false;
  }
  return true;
};

function browserStorage(): PlanStorage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; }
}

export function loadLevelPlan(storage: PlanStorage | undefined, actorId: string, fingerprint: string, currentLevel: number): SavedLevelPlan | undefined {
  if (!storage) return undefined;
  const key = keyFor(actorId);
  try {
    const raw = storage.getItem(key);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as { version?: unknown; fingerprint?: unknown; target?: unknown; choices?: unknown };
    const stale = value.version !== 1 || value.fingerprint !== fingerprint || !Number.isInteger(value.target) ||
      (value.target as number) <= currentLevel || (value.target as number) > 20 || !Array.isArray(value.choices) ||
      value.choices.length > (value.target as number) - currentLevel || !value.choices.every(validChoice);
    if (stale) { storage.removeItem(key); return undefined; }
    return { target: value.target as number, choices: value.choices as LevelUpChoice[] };
  } catch {
    try { storage.removeItem(key); } catch { /* storage may be disabled */ }
    return undefined;
  }
}

export function saveLevelPlan(storage: PlanStorage | undefined, actorId: string, fingerprint: string, plan: SavedLevelPlan | undefined): boolean {
  if (!storage) return false;
  const key = keyFor(actorId);
  try {
    if (!plan) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify({ version: 1, fingerprint, ...plan }));
    return true;
  } catch { return false; }
}

export const loadBrowserLevelPlan = (actorId: string, fingerprint: string, currentLevel: number) =>
  loadLevelPlan(browserStorage(), actorId, fingerprint, currentLevel);
export const saveBrowserLevelPlan = (actorId: string, fingerprint: string, plan: SavedLevelPlan | undefined) =>
  saveLevelPlan(browserStorage(), actorId, fingerprint, plan);
