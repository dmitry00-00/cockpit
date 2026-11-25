/** A5E SRD Adventuring §8 Craft tables, CC BY 4.0. */
export type A5eCraftQuality = 'poor' | 'normal' | 'fine' | 'masterwork';
export type A5eCraftCategory =
  | 'dual-wielding-weapons'
  | 'simple-or-martial-weapon'
  | 'heavy-weapon'
  | 'ammunition'
  | 'light-armor'
  | 'medium-armor'
  | 'heavy-armor'
  | 'tool-or-equipment';
export type A5eCraftFailureChoice = 'lower-quality' | 'salvage';

export interface A5eCraftQualitySpec {
  dc: number;
  timeMultiplier: 0.5 | 1 | 2 | 5;
  materialNumerator: 1;
  materialDenominator: 8 | 4 | 2 | 1;
  productionCostGp: 0 | 25 | 125;
  /** Narrative/rules benefit only; the inventory model does not enforce it. */
  benefit: 'broken-after-use' | 'none' | 'enchantable-uncommon' | 'no-damage-vulnerabilities-and-enchantable-any-rarity';
}

const QUALITY: Readonly<Record<A5eCraftQuality, A5eCraftQualitySpec>> = {
  poor: { dc: 10, timeMultiplier: 0.5, materialNumerator: 1, materialDenominator: 8, productionCostGp: 0, benefit: 'broken-after-use' },
  normal: { dc: 15, timeMultiplier: 1, materialNumerator: 1, materialDenominator: 4, productionCostGp: 0, benefit: 'none' },
  fine: { dc: 20, timeMultiplier: 2, materialNumerator: 1, materialDenominator: 2, productionCostGp: 25, benefit: 'enchantable-uncommon' },
  masterwork: { dc: 25, timeMultiplier: 5, materialNumerator: 1, materialDenominator: 1, productionCostGp: 125, benefit: 'no-damage-vulnerabilities-and-enchantable-any-rarity' },
};

export interface A5eCraftCategorySpec {
  /** Exactly one base-time field is present: per-item weeks or a full-workweek output cap. */
  weeksPerItem?: 1 | 2 | 4;
  itemsPerWeek?: 2 | 50;
}

const CATEGORY: Readonly<Record<A5eCraftCategory, A5eCraftCategorySpec>> = {
  // The SRD prints these as throughput: two weapons, 50 ammunition, or two tools/equipment per week.
  'dual-wielding-weapons': { itemsPerWeek: 2 },
  'simple-or-martial-weapon': { weeksPerItem: 1 },
  'heavy-weapon': { weeksPerItem: 2 },
  ammunition: { itemsPerWeek: 50 },
  'light-armor': { weeksPerItem: 1 },
  'medium-armor': { weeksPerItem: 2 },
  'heavy-armor': { weeksPerItem: 4 },
  'tool-or-equipment': { itemsPerWeek: 2 },
};

export interface A5eCraftSpec extends A5eCraftQualitySpec {
  quality: A5eCraftQuality;
  category: A5eCraftCategory;
  itemCount: number;
  baseWorkWeeks: number;
  workWeeks: number;
  specialMaterials: boolean;
  totalBasePriceCopperPieces: number;
  materialCostCopperPieces: number;
  productionCostCopperPieces: number;
  totalCostCopperPieces: number;
}

export function isA5eCraftQuality(value: unknown): value is A5eCraftQuality {
  return typeof value === 'string' && Object.hasOwn(QUALITY, value);
}

export function isA5eCraftCategory(value: unknown): value is A5eCraftCategory {
  return typeof value === 'string' && Object.hasOwn(CATEGORY, value);
}

/** Return the sourced quality DC, time, material fraction, production fee, and narrative benefit. */
export function a5eCraftQualitySpec(quality: A5eCraftQuality): A5eCraftQualitySpec {
  return QUALITY[quality];
}

/** A5E SRD base crafting-time table, before quality multiplier. */
export function a5eCraftCategorySpec(category: A5eCraftCategory): A5eCraftCategorySpec {
  return CATEGORY[category];
}

/**
 * Calculate one material batch from unit price and item count, plus its work time.
 * Price input/output uses integer copper pieces. If the SRD fraction lands between copper pieces,
 * this function rejects it rather than inventing a rounding rule the source does not give.
 */
export function a5eCraftSpec(input: {
  quality: A5eCraftQuality;
  category: A5eCraftCategory;
  itemCount: number;
  baseUnitPriceCopperPieces: number;
  specialMaterials?: boolean;
}): A5eCraftSpec {
  const { quality, category, itemCount, baseUnitPriceCopperPieces, specialMaterials = false } = input;
  if (!isA5eCraftQuality(quality)) throw new RangeError('A5E Craft needs a known item quality');
  if (!isA5eCraftCategory(category)) throw new RangeError('A5E Craft needs a known item category');
  if (!Number.isSafeInteger(itemCount) || itemCount < 1) throw new RangeError('A5E Craft item count must be a positive safe integer');
  if (!Number.isSafeInteger(baseUnitPriceCopperPieces) || baseUnitPriceCopperPieces < 0) throw new RangeError('A5E Craft unit base price must be a non-negative copper-piece integer');
  if (typeof specialMaterials !== 'boolean') throw new RangeError('A5E Craft special-material flag must be boolean');

  const qualitySpec = QUALITY[quality];
  const categorySpec = CATEGORY[category];
  const baseWorkWeeks = categorySpec.weeksPerItem !== undefined
    ? itemCount * categorySpec.weeksPerItem
    : Math.ceil(itemCount / categorySpec.itemsPerWeek!);
  const workWeeks = baseWorkWeeks * qualitySpec.timeMultiplier;
  if (!Number.isFinite(workWeeks) || workWeeks <= 0) throw new RangeError('A5E Craft work time is outside the supported range');

  const totalBasePriceCopperPieces = baseUnitPriceCopperPieces * itemCount;
  if (!Number.isSafeInteger(totalBasePriceCopperPieces)) throw new RangeError('A5E Craft batch base price exceeds the safe integer range');
  const materialCopperNumerator = totalBasePriceCopperPieces * qualitySpec.materialNumerator;
  const materialCostCopperPieces = materialCopperNumerator / qualitySpec.materialDenominator;
  if (!Number.isSafeInteger(materialCopperNumerator) || !Number.isSafeInteger(materialCostCopperPieces)) {
    throw new RangeError('A5E Craft material fraction does not resolve to whole copper pieces; the SRD gives no rounding rule');
  }
  const productionCostCopperPieces = qualitySpec.productionCostGp * 100;
  const totalCostCopperPieces = materialCostCopperPieces + productionCostCopperPieces;
  if (!Number.isSafeInteger(totalCostCopperPieces)) throw new RangeError('A5E Craft total cost exceeds the safe integer range');

  return {
    ...qualitySpec,
    dc: qualitySpec.dc + (specialMaterials ? 2 : 0),
    quality, category, itemCount, baseWorkWeeks, workWeeks, specialMaterials,
    totalBasePriceCopperPieces, materialCostCopperPieces, productionCostCopperPieces, totalCostCopperPieces,
  };
}

export type A5eCraftCheckOutcome = 'success' | 'failure' | 'failure-by-5';
export interface A5eCraftResolution {
  checkOutcome: A5eCraftCheckOutcome;
  itemQuality?: A5eCraftQuality;
  choiceRequired: boolean;
  availableChoices: readonly A5eCraftFailureChoice[];
  materialsConsumed?: boolean;
  /** `poor` items have the SRD's Broken-after-each-use rule, which this data model cannot apply. */
  brokenAfterEachUse?: boolean;
}

const LOWER_QUALITY: Readonly<Partial<Record<A5eCraftQuality, A5eCraftQuality>>> = {
  normal: 'poor', fine: 'normal', masterwork: 'fine',
};

/**
 * Resolve the check outcome. Ordinary failures require the Narrator to select a lower-quality item or salvage;
 * on a failure by 5+, the SRD mandates a poor item and consumption of the materials.
 */
export function a5eCraftResolution(
  spec: Pick<A5eCraftSpec, 'quality' | 'dc'>,
  total: number,
  choice?: A5eCraftFailureChoice,
): A5eCraftResolution {
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(spec.dc) || spec.dc < 1) {
    throw new RangeError('A5E Craft check needs integer total and positive DC');
  }
  if (!isA5eCraftQuality(spec.quality)) throw new RangeError('A5E Craft needs a known requested quality');

  if (total >= spec.dc) {
    if (choice !== undefined) throw new RangeError('A5E Craft success does not take a failure choice');
    return { checkOutcome: 'success', itemQuality: spec.quality, choiceRequired: false, availableChoices: [], materialsConsumed: true,
      ...(spec.quality === 'poor' ? { brokenAfterEachUse: true } : {}) };
  }

  if (total <= spec.dc - 5) {
    if (choice !== undefined) throw new RangeError('A5E Craft failure by 5 or more has a fixed poor-quality result');
    return { checkOutcome: 'failure-by-5', itemQuality: 'poor', choiceRequired: false, availableChoices: [], materialsConsumed: true, brokenAfterEachUse: true };
  }

  const lowerQuality = LOWER_QUALITY[spec.quality];
  const availableChoices: A5eCraftFailureChoice[] = lowerQuality ? ['lower-quality', 'salvage'] : ['salvage'];
  if (choice === undefined) return { checkOutcome: 'failure', choiceRequired: true, availableChoices };
  if (!availableChoices.includes(choice)) throw new RangeError('A5E Craft ordinary failure needs an available Narrator choice');
  if (choice === 'salvage') return { checkOutcome: 'failure', choiceRequired: false, availableChoices, materialsConsumed: false };
  const itemQuality = lowerQuality!;
  return { checkOutcome: 'failure', itemQuality, choiceRequired: false, availableChoices, materialsConsumed: true,
    ...(itemQuality === 'poor' ? { brokenAfterEachUse: true } : {}) };
}
