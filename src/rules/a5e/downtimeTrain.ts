/**
 * Pure A5E SRD §8 calculations for the Train downtime activity.
 * Source: A5E SRD, Adventuring, “Train” (CC BY 4.0),
 * https://a5esrd.com/s/a5e_srd_6_adventuring.pdf
 * No character sheet is changed here; callers apply completed training explicitly.
 */

export type A5eTrainingTimeUnit = 'week' | 'month';

export interface A5eTrainingSpec {
  timeUnit: A5eTrainingTimeUnit;
  duration: number;
  /** Gold amount stated by the SRD; null means the SRD leaves this method’s cost unspecified. */
  costGp: number | null;
}

export type A5eLanguageOrToolTrainingMode = 'tutor' | 'reliable-alternative';

function safeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`A5E Train requires an integer ${label}`);
}

function spec(timeUnit: A5eTrainingTimeUnit, duration: number, costGp: number | null): A5eTrainingSpec {
  if (!Number.isSafeInteger(duration) || duration < 1 || (costGp !== null && (!Number.isSafeInteger(costGp) || costGp < 0))) {
    throw new RangeError('A5E Train produced an unsupported duration or cost');
  }
  return { timeUnit, duration, costGp };
}

/**
 * Language or tool proficiency: 12 − Intelligence modifier months with a tutor at 50 gp/month.
 * A reliable non-tutor method doubles the time; the SRD does not give its cost.
 */
export function a5eTrainLanguageOrTool(
  intelligenceModifier: number,
  mode: A5eLanguageOrToolTrainingMode = 'tutor',
): A5eTrainingSpec {
  safeInteger(intelligenceModifier, 'Intelligence modifier');
  if (mode !== 'tutor' && mode !== 'reliable-alternative') throw new RangeError('A5E Train has an unknown language/tool training mode');
  const baseMonths = 12 - intelligenceModifier;
  // SRD §8 gives no minimum duration for exceptional Intelligence modifiers.
  if (baseMonths < 1) throw new RangeError('A5E SRD does not specify a minimum duration when 12 − Intelligence modifier is below one month');
  const months = mode === 'tutor' ? baseMonths : baseMonths * 2;
  return spec('month', months, mode === 'tutor' ? months * 50 : null);
}

/** Weapon proficiency: 6 − the higher Strength/Dexterity modifier months, with a tutor at 50 gp/month. */
export function a5eTrainWeaponProficiency(strengthModifier: number, dexterityModifier: number): A5eTrainingSpec {
  safeInteger(strengthModifier, 'Strength modifier');
  safeInteger(dexterityModifier, 'Dexterity modifier');
  const months = 6 - Math.max(strengthModifier, dexterityModifier);
  // The source does not state a floor if the ability modifier makes the formula non-positive.
  if (months < 1) throw new RangeError('A5E SRD does not specify a minimum duration when 6 − the higher Strength/Dexterity modifier is below one month');
  return spec('month', months, months * 50);
}

/** Relearning a class feature is free; level 15 overlaps two ranges in the SRD table and is left unresolved. */
export function a5eTrainClassFeature(featureLevel: number): A5eTrainingSpec {
  safeInteger(featureLevel, 'feature level');
  if (featureLevel < 1 || featureLevel > 20) throw new RangeError('A5E Train feature level must be 1–20');
  if (featureLevel === 15) throw new RangeError('A5E SRD lists level 15 in both the 3-week and 4-week relearning ranges');
  const weeks = featureLevel <= 5 ? 1 : featureLevel <= 10 ? 2 : featureLevel <= 14 ? 3 : 4;
  return spec('week', weeks, 0);
}

/** Feat retraining: 8 − proficiency bonus months at 50 gp/month for materials and expert advice. */
export function a5eTrainFeat(proficiencyBonus: number): A5eTrainingSpec {
  safeInteger(proficiencyBonus, 'proficiency bonus');
  if (proficiencyBonus < 2 || proficiencyBonus > 6) throw new RangeError('A5E Train expects a character proficiency bonus from 2 through 6');
  const months = 8 - proficiencyBonus;
  return spec('month', months, months * 50);
}

/** Changing archetypes takes 12 weeks; the source gives no additional cost. */
export function a5eTrainArchetype(): A5eTrainingSpec {
  return spec('week', 12, 0);
}
