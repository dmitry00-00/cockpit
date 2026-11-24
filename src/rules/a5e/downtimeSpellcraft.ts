/** A5E SRD Adventuring §8, Spellcraft (CC BY 4.0): https://static1.squarespace.com/static/63d11ec201a57a0efa51a168/t/64cc354730b0096d29223001/1691104583719/a5e_srd_6_adventuring.pdf */
export type A5eSpellLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type A5eSpellcraftModification = 'altered-effect' | 'lingering-effect' | 'additional-effect' | 'additional-target';
export type A5eSpellcraftCheckResult = 'success' | 'success-by-5' | 'failure' | 'failure-by-5';

export interface A5eSpellcraftLevelSpec {
  dc: number;
  costGpPerWeek: number;
  successfulWeeks: number;
}

export interface A5eSpellcraftModificationSpec {
  dcModifier: number;
  label: string;
}

export interface A5eSpellcraftSpec extends A5eSpellcraftLevelSpec {
  spellLevel: A5eSpellLevel;
  modification: A5eSpellcraftModification;
  dc: number;
}

export interface A5eSpellcraftWeekResult {
  checkResult: A5eSpellcraftCheckResult;
  beforeWeeks: number;
  /** Signed change to project progress; a failure by 5 or more removes one week. */
  progressDeltaWeeks: -1 | 0 | 1 | 2;
  afterWeeks: number;
  requiredWeeks: number;
  completes: boolean;
  /** Materials are spent for every weekly check, regardless of its result. */
  materialsConsumedGp: number;
}

const SPELL_LEVEL_SPECS: Readonly<Record<A5eSpellLevel, A5eSpellcraftLevelSpec>> = {
  1: { dc: 15, costGpPerWeek: 100, successfulWeeks: 2 },
  2: { dc: 16, costGpPerWeek: 150, successfulWeeks: 3 },
  3: { dc: 17, costGpPerWeek: 200, successfulWeeks: 4 },
  4: { dc: 18, costGpPerWeek: 300, successfulWeeks: 5 },
  5: { dc: 19, costGpPerWeek: 500, successfulWeeks: 6 },
  6: { dc: 20, costGpPerWeek: 1_000, successfulWeeks: 7 },
  7: { dc: 21, costGpPerWeek: 1_500, successfulWeeks: 8 },
  8: { dc: 22, costGpPerWeek: 3_000, successfulWeeks: 9 },
  9: { dc: 23, costGpPerWeek: 5_000, successfulWeeks: 10 },
};

const SPELLCRAFT_MODIFICATIONS: Readonly<Record<A5eSpellcraftModification, A5eSpellcraftModificationSpec>> = {
  'altered-effect': { dcModifier: 0, label: 'Изменённый эффект' },
  'lingering-effect': { dcModifier: 1, label: 'Продолжительный эффект' },
  'additional-effect': { dcModifier: 2, label: 'Дополнительный эффект' },
  'additional-target': { dcModifier: 2, label: 'Дополнительная цель' },
};

/** A5E SRD Adventuring §8 Rare Spell Crafting table (levels 1–9). */
export function a5eSpellcraftLevelSpec(level: A5eSpellLevel): A5eSpellcraftLevelSpec {
  if (!isA5eSpellLevel(level)) throw new RangeError('A5E Spellcraft spell level must be 1–9');
  return SPELL_LEVEL_SPECS[level];
}

export function isA5eSpellLevel(value: unknown): value is A5eSpellLevel {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 1 && value <= 9;
}

/** A5E SRD Adventuring §8 Rare Spell Modifications table. */
export function a5eSpellcraftModificationSpec(modification: A5eSpellcraftModification): A5eSpellcraftModificationSpec {
  if (!isA5eSpellcraftModification(modification)) throw new RangeError('Unknown A5E Spellcraft modification');
  return SPELLCRAFT_MODIFICATIONS[modification];
}

export function isA5eSpellcraftModification(value: unknown): value is A5eSpellcraftModification {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SPELLCRAFT_MODIFICATIONS, value);
}

/**
 * Resolve a known-spell rare-crafting project. The source requires Narrator approval for
 * the chosen modification/effect; this function calculates only its table-based check.
 */
export function a5eSpellcraftSpec(level: A5eSpellLevel, modification: A5eSpellcraftModification): A5eSpellcraftSpec {
  const base = a5eSpellcraftLevelSpec(level);
  const adjustment = a5eSpellcraftModificationSpec(modification).dcModifier;
  return { spellLevel: level, modification, ...base, dc: base.dc + adjustment };
}

export function a5eSpellcraftCheckResult(total: number, dc: number): A5eSpellcraftCheckResult {
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(dc) || dc < 1) {
    throw new RangeError('A5E Spellcraft requires an integer check total and positive DC');
  }
  if (total >= dc + 5) return 'success-by-5';
  if (total >= dc) return 'success';
  if (total <= dc - 5) return 'failure-by-5';
  return 'failure';
}

/**
 * Resolve one Spellcraft workweek. A failure by 5 removes one week of accumulated progress;
 * the result is floored at zero because the SRD does not specify negative successful weeks.
 */
export function resolveA5eSpellcraftWeek(
  level: A5eSpellLevel,
  modification: A5eSpellcraftModification,
  completedWeeks: number,
  total: number,
): A5eSpellcraftWeekResult {
  const spec = a5eSpellcraftSpec(level, modification);
  if (!Number.isSafeInteger(completedWeeks) || completedWeeks < 0 || completedWeeks >= spec.successfulWeeks) {
    throw new RangeError('A5E Spellcraft needs an unfinished project with non-negative successful weeks');
  }
  const checkResult = a5eSpellcraftCheckResult(total, spec.dc);
  const progressDeltaWeeks: A5eSpellcraftWeekResult['progressDeltaWeeks'] = checkResult === 'success-by-5' ? 2
    : checkResult === 'success' ? 1
      : checkResult === 'failure-by-5' ? -1 : 0;
  const afterWeeks = Math.min(spec.successfulWeeks, Math.max(0, completedWeeks + progressDeltaWeeks));
  return {
    checkResult,
    beforeWeeks: completedWeeks,
    progressDeltaWeeks,
    afterWeeks,
    requiredWeeks: spec.successfulWeeks,
    completes: afterWeeks >= spec.successfulWeeks,
    materialsConsumedGp: spec.costGpPerWeek,
  };
}
