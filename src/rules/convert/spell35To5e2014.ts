import spellData from '../../../content/srd/spells.json';
import {
  classifyConversionSource,
  requireSrdTargetClassification,
  type ConversionJudgment,
  type ConversionLedgerEntry,
  type ConversionLoss,
  type ConversionSourceClassification,
  type ConversionTargetClassification,
} from './conversionAudit';

interface TargetSrdSpell {
  id: string;
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: readonly string[];
  duration: string;
  concentration: boolean;
  ritual: boolean;
  text: string;
  higherLevel?: string;
  classes: readonly string[];
  source: string;
}

export interface Dnd35SpellInput {
  id: string;
  name: string;
  school: string;
  classLevels: Readonly<Record<string, number>>;
  components: readonly string[];
  castingTime: string;
  range: string;
  duration: string;
  savingThrow: string;
  spellResistance: boolean;
  targeting: {
    maxSeparationFeet?: number;
    maxTargetsAtMaximumProgression?: number;
  };
  progression?: {
    baseProjectiles: number;
    additionalProjectileEveryCasterLevels?: number;
    maxProjectiles?: number;
    additionalProjectilePerSlotLevel?: number;
    damagePerProjectile: string;
    damageType: string;
  };
  source: {
    title: string;
    url: string;
    license: string;
    attribution: string;
  };
}

export interface SpellConversionResult {
  status: 'converted';
  reviewStatus: 'pending-manual-review';
  profile: {
    id: 'dnd35-srd-to-dnd5e-2014-exact-spell-match-v0';
    status: 'draft-owner-policy-not-approved';
    sourceEdition: 'D&D 3.5 SRD';
    targetEdition: 'D&D 5e / 2014';
    matching: 'exact normalized name; no fuzzy matches';
  };
  source: Dnd35SpellInput['source'] & { edition: 'D&D 3.5 SRD' };
  sourceClassification: ConversionSourceClassification;
  targetClassification: ConversionTargetClassification;
  sourceRecord: Dnd35SpellInput;
  targetSource: {
    title: string;
    edition: 'D&D 5e / 2014';
    license: string;
    sourceRef: string;
  };
  distribution: 'internal-review';
  target: TargetSrdSpell;
  ledger: readonly ConversionLedgerEntry[];
  losses: readonly ConversionLoss[];
  judgments: readonly ConversionJudgment[];
}

const TARGET_SPELLS = (spellData as unknown as { spells: TargetSrdSpell[] }).spells
  .filter(spell => spell.source === 'srd');

const normalizeName = (name: string): string => name
  .normalize('NFKD')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const normalizeComparable = (value: string): string => value
  .normalize('NFKD')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/** Exact-name spell match from a normalized 3.5 SRD record to the local SRD 5.1 corpus. */
export function convert35SpellTo5e2014(source: Dnd35SpellInput): SpellConversionResult {
  const matches = TARGET_SPELLS.filter(spell => normalizeName(spell.name) === normalizeName(source.name));
  if (matches.length !== 1) {
    throw new Error(matches.length === 0
      ? `No exact SRD 5.1 spell match for: ${source.name}`
      : `Ambiguous exact SRD 5.1 spell match for: ${source.name}`);
  }

  const target = structuredClone(matches[0]);
  const targetClassification = requireSrdTargetClassification('spell', target.id);
  const ledger: ConversionLedgerEntry[] = [];
  const losses: ConversionLoss[] = [];
  const judgments: ConversionJudgment[] = [];
  const sourcePolicy = 'Draft exact-name 3.5 SRD → local SRD 5.1 mapping; semantic differences remain reviewable.';
  const addLedger = (entry: ConversionLedgerEntry) => ledger.push(entry);
  const lose = (sourceField: string, sourceValue: string | number, reason: string) => losses.push({ sourceField, sourceValue, reason });
  const judge = (sourceField: string, proposedHandling: string, reason: string) =>
    judgments.push({ sourceField, proposedHandling, reason, approval: 'pending' });

  addLedger({ sourceField: 'name', targetField: 'name', treatment: 'mapped', sourceValue: source.name, targetValue: target.name, ruleSource: 'Exact normalized name match; unique in local SRD 5.1.' });

  const sourceLevels = Object.values(source.classLevels);
  const sourceClasses = Object.keys(source.classLevels).map(normalizeName).sort();
  const targetClasses = target.classes.map(normalizeName).sort();
  const classListsMatch = sourceClasses.length === targetClasses.length && sourceClasses.every((name, index) => name === targetClasses[index]);
  if (sourceLevels.length && sourceLevels.every(level => level === target.level) && classListsMatch) {
    addLedger({ sourceField: 'classLevels', targetField: 'level/classes', treatment: 'mapped', sourceValue: sourceLevels.join(', '), targetValue: target.level, ruleSource: 'Mapped to the exact-name SRD 5.1 record; class lists and all source spell levels agree.' });
  } else {
    lose('classLevels', sourceLevels.join(', ') || 'missing', 'A single target spell level cannot preserve the source class-level table, or the class lists differ.');
    if (!classListsMatch) lose('classes', sourceClasses.join(', ') || 'missing', `Target classes are ${targetClasses.join(', ') || 'none'}.`);
    judge('classLevels', `Use target SRD 5.1 level ${target.level} and class list.`, 'The source and target class-level entries or class lists do not all agree.');
  }

  const sourceSchool = source.school.toLowerCase();
  if (sourceSchool === target.school.toLowerCase()) {
    addLedger({ sourceField: 'school', targetField: 'school', treatment: 'mapped', sourceValue: source.school, targetValue: target.school, ruleSource: 'School label matches after case normalization.' });
  } else {
    lose('school', source.school, `Target school is ${target.school}; school change requires review.`);
    judge('school', `Use target school ${target.school}.`, 'The school labels differ between editions.');
  }

  const sourceComponents = [...source.components].sort().join(',');
  const targetComponents = [...target.components].sort().join(',');
  if (sourceComponents === targetComponents) {
    addLedger({ sourceField: 'components', targetField: 'components', treatment: 'copied', sourceValue: sourceComponents, targetValue: targetComponents, ruleSource: sourcePolicy });
  } else {
    lose('components', sourceComponents, `Target components are ${targetComponents || 'none'}.`);
    judge('components', `Use target components ${targetComponents || 'none'}.`, 'A component change can alter access, counterplay, and item interaction.');
  }

  const sourceCasting = normalizeComparable(source.castingTime);
  const castingTimeMap: Readonly<Record<string, string>> = {
    '1 standard action': '1 action',
  };
  const mappedCastingTime = castingTimeMap[sourceCasting] ?? source.castingTime;
  if (normalizeComparable(mappedCastingTime) === normalizeComparable(target.castingTime)) {
    addLedger({ sourceField: 'castingTime', targetField: 'castingTime', treatment: sourceCasting === normalizeComparable(target.castingTime) ? 'copied' : 'mapped', sourceValue: source.castingTime, targetValue: target.castingTime, ruleSource: 'Explicit 3.5 standard action → 5e action mapping.' });
  } else {
    lose('castingTime', source.castingTime, `Target casting time is ${target.castingTime}.`);
    judge('castingTime', `Use target casting time ${target.castingTime}.`, 'No approved mapping exists for this action economy.');
  }

  if (normalizeComparable(source.range) === normalizeComparable(target.range)) {
    addLedger({ sourceField: 'range', targetField: 'range', treatment: 'copied', sourceValue: source.range, targetValue: target.range, ruleSource: sourcePolicy });
  } else {
    lose('range', source.range, `Target range is ${target.range}; source range scaling/units are not carried through automatically.`);
    judge('range', `Use target range ${target.range}.`, 'Range scaling can change both reach and level progression.');
  }

  if (normalizeComparable(source.duration) === normalizeComparable(target.duration)) {
    addLedger({ sourceField: 'duration', targetField: 'duration', treatment: 'copied', sourceValue: source.duration, targetValue: target.duration, ruleSource: sourcePolicy });
  } else {
    lose('duration', source.duration, `Target duration is ${target.duration}.`);
    judge('duration', `Use target duration ${target.duration}.`, 'Duration differs between editions.');
  }

  const targetText = normalizeComparable(target.text);
  if (source.savingThrow.toLowerCase() === 'none' && !/\b(save|saving throw)\b/.test(targetText)) {
    addLedger({ sourceField: 'savingThrow', targetField: 'text', treatment: 'mapped', sourceValue: source.savingThrow, targetValue: 'no saving throw field found in target text', ruleSource: 'Source says no save; target text contains no save instruction.' });
  } else {
    judge('savingThrow', 'Review the target spell text for save semantics.', 'The structured target record does not provide a saving-throw field.');
  }

  if (source.progression) {
    const damageToken = source.progression.damagePerProjectile.replace(/\s+/g, '').toLowerCase();
    const targetTextWithoutWhitespace = target.text.toLowerCase().replace(/\s+/g, '');
    const damageMatches = targetTextWithoutWhitespace.includes(damageToken) &&
      targetText.includes(source.progression.damageType.toLowerCase());
    if (damageMatches) {
      addLedger({ sourceField: 'progression.damagePerProjectile', targetField: 'text', treatment: 'mapped', sourceValue: `${source.progression.damagePerProjectile} ${source.progression.damageType}`, targetValue: 'same damage formula and type found in target SRD text', ruleSource: 'Exact formula/type token check against target SRD record.' });
    } else {
      judge('progression.damagePerProjectile', 'Review target damage formula and type.', 'The target text does not contain the same formula/type tokens.');
    }

    if (source.progression.additionalProjectileEveryCasterLevels !== undefined) {
      lose('progression.casterLevel', `+1 projectile / ${source.progression.additionalProjectileEveryCasterLevels} caster levels`, 'The 3.5 caster-level progression is replaced by the target SRD slot progression.');
      judge('progression.casterLevel', target.higherLevel ? 'Use target SRD higher-level text after review.' : 'No target upcasting rule is present.', 'Caster-level scaling and spell-slot scaling are different progression systems.');
    }
  }

  if (source.spellResistance) {
    lose('spellResistance', 'yes', 'The target spell schema has no spell-resistance field and the matched 5e spell does not preserve it.');
    judge('spellResistance', 'Do not import spell resistance into the 5e candidate.', 'The 5e rules use different defenses and the SRD target has no such field.');
  }
  if (source.targeting.maxSeparationFeet !== undefined) {
    lose('targeting.maxSeparationFeet', source.targeting.maxSeparationFeet, 'The target spell does not preserve the source restriction on distance between targets.');
    judge('targeting.maxSeparationFeet', 'Use target SRD target selection after review.', 'The old restriction is not represented in the target spell record.');
  }
  if (source.targeting.maxTargetsAtMaximumProgression !== undefined) {
    lose('targeting.maxTargetsAtMaximumProgression', source.targeting.maxTargetsAtMaximumProgression, 'The target spell uses a different projectile progression and targeting model.');
  }

  addLedger({ sourceField: 'targetRecord', targetField: 'target', treatment: 'mapped', sourceValue: source.name, targetValue: target.name, ruleSource: 'Target text, range, and upcasting come from the local SRD 5.1 record; source-edition prose is not copied.' });

  return {
    status: 'converted',
    reviewStatus: 'pending-manual-review',
    profile: {
      id: 'dnd35-srd-to-dnd5e-2014-exact-spell-match-v0',
      status: 'draft-owner-policy-not-approved',
      sourceEdition: 'D&D 3.5 SRD',
      targetEdition: 'D&D 5e / 2014',
      matching: 'exact normalized name; no fuzzy matches',
    },
    source: { ...source.source, edition: 'D&D 3.5 SRD' },
    sourceClassification: classifyConversionSource('spell', 'Spells', 'D&D 3.5 SRD', source.source),
    targetClassification,
    sourceRecord: structuredClone(source),
    targetSource: {
      title: targetClassification.source,
      edition: 'D&D 5e / 2014',
      license: targetClassification.license,
      sourceRef: targetClassification.sourceRef,
    },
    distribution: 'internal-review',
    target,
    ledger,
    losses,
    judgments,
  };
}
