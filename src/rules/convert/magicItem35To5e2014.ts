import magicItemData from '../../../content/srd/magic-items.json';
import {
  classifyConversionSource,
  requireSrdTargetClassification,
  type ConversionJudgment,
  type ConversionLedgerEntry,
  type ConversionLoss,
  type ConversionSourceClassification,
  type ConversionTargetClassification,
} from './conversionAudit';

interface TargetSrdMagicItem {
  id: string;
  name: string;
  category: string;
  typeLine: string;
  rarity: string;
  attunement: { required: boolean };
  variants: readonly string[];
  text: string;
  source: string;
}

export interface Dnd35ProtectionRingInput {
  id: string;
  name: string;
  slot: 'ring';
  enhancementBonus: number;
  bonusType: 'deflection';
  treasureCategory: 'minor' | 'medium' | 'major';
  marketPriceGp: number;
  source: {
    title: string;
    url: string;
    license: string;
    attribution: string;
  };
}

export interface MagicItemConversionResult {
  status: 'converted';
  reviewStatus: 'pending-manual-review';
  profile: {
    id: 'dnd35-srd-to-dnd5e-2014-explicit-item-alias-v0';
    status: 'draft-owner-policy-not-approved';
    sourceEdition: 'D&D 3.5 SRD';
    targetEdition: 'D&D 5e / 2014';
    matching: 'explicit alias only; no fuzzy matching';
  };
  source: Dnd35ProtectionRingInput['source'] & { edition: 'D&D 3.5 SRD' };
  sourceClassification: ConversionSourceClassification;
  targetClassification: ConversionTargetClassification;
  sourceRecord: Dnd35ProtectionRingInput;
  distribution: 'internal-review';
  target: TargetSrdMagicItem;
  ledger: readonly ConversionLedgerEntry[];
  losses: readonly ConversionLoss[];
  judgments: readonly ConversionJudgment[];
}

const TARGET_ITEMS = (magicItemData as unknown as { items: Record<string, TargetSrdMagicItem> }).items;
const EXPLICIT_ITEM_ALIASES: Readonly<Record<string, string>> = {
  'protection-1': 'ring-of-protection',
};

const normalizeName = (name: string): string => name
  .normalize('NFKD')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

/** A single reviewed alias pilot: 3.5 Protection +1 → local 5.1 Ring of Protection. */
export function convert35ProtectionRingTo5e2014(source: Dnd35ProtectionRingInput): MagicItemConversionResult {
  const targetId = EXPLICIT_ITEM_ALIASES[normalizeName(source.name)];
  if (!targetId) throw new Error(`No explicit 3.5 SRD item alias for: ${source.name}`);
  if (source.enhancementBonus !== 1) throw new Error('This pilot only maps the +1 protection ring.');
  if (source.bonusType !== 'deflection') throw new Error(`Unsupported protection bonus type: ${source.bonusType}`);

  const targetRecord = TARGET_ITEMS[targetId];
  if (!targetRecord || targetRecord.source.split(' · ')[0] !== 'SRD 5.1 (CC-BY-4.0)') {
    throw new Error(`No local SRD 5.1 target record for ${targetId}`);
  }
  const target = structuredClone(targetRecord);
  const targetClassification = requireSrdTargetClassification('magic-item', target.id);
  const ledger: ConversionLedgerEntry[] = [];
  const losses: ConversionLoss[] = [];
  const judgments: ConversionJudgment[] = [];
  const addLedger = (entry: ConversionLedgerEntry) => ledger.push(entry);
  const lose = (sourceField: string, sourceValue: string | number, reason: string) => losses.push({ sourceField, sourceValue, reason });
  const judge = (sourceField: string, proposedHandling: string, reason: string) =>
    judgments.push({ sourceField, proposedHandling, reason, approval: 'pending' });

  addLedger({
    sourceField: 'name', targetField: 'name', treatment: 'mapped',
    sourceValue: source.name, targetValue: target.name,
    ruleSource: 'Explicit alias registry; exact normalized key, no fuzzy matching.',
  });
  addLedger({
    sourceField: 'slot', targetField: 'category', treatment: 'mapped',
    sourceValue: source.slot, targetValue: target.category,
    ruleSource: 'Ring slot maps to the SRD 5.1 ring category.',
  });
  addLedger({
    sourceField: 'enhancementBonus', targetField: 'text', treatment: 'mapped',
    sourceValue: source.enhancementBonus, targetValue: '+1 AC',
    ruleSource: 'The target SRD record explicitly grants +1 AC.',
    note: 'The source bonus type is deflection; the target record does not express that type.',
  });
  lose('bonusType', source.bonusType, 'The 5e target records a generic AC bonus and does not preserve the 3.5 deflection classification.');
  lose('marketPriceGp', source.marketPriceGp, 'The target SRD record has no item-price field; cross-edition prices are not inferred.');
  lose('treasureCategory', source.treasureCategory, 'The target record uses rarity, for which this pilot has no approved mapping from the 3.5 treasure table category.');
  judge('target.savingThrows', 'Keep the target SRD item text only after review.', 'The target grants +1 to saving throws, an effect not present in the source ring entry.');
  judge('target.attunement', 'Keep the target SRD attunement requirement only after review.', 'The source edition has no attunement system; the 3.5 general ring rules allow use by anyone.');

  addLedger({
    sourceField: 'targetRecord', targetField: 'target', treatment: 'mapped',
    sourceValue: source.name, targetValue: target.name,
    ruleSource: 'Target wording and properties come only from the local SRD 5.1 record; source-edition prose is not copied.',
  });

  return {
    status: 'converted',
    reviewStatus: 'pending-manual-review',
    profile: {
      id: 'dnd35-srd-to-dnd5e-2014-explicit-item-alias-v0',
      status: 'draft-owner-policy-not-approved',
      sourceEdition: 'D&D 3.5 SRD',
      targetEdition: 'D&D 5e / 2014',
      matching: 'explicit alias only; no fuzzy matching',
    },
    source: { ...source.source, edition: 'D&D 3.5 SRD' },
    sourceClassification: classifyConversionSource('magic-item', 'Magic Rings', 'D&D 3.5 SRD', source.source),
    targetClassification,
    sourceRecord: structuredClone(source),
    distribution: 'internal-review',
    target,
    ledger,
    losses,
    judgments,
  };
}
