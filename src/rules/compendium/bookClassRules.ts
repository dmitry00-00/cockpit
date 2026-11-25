/** Explicit, table-only class rules that are not part of SRD 5.1. */
import { SPELL_LIST } from '../srd/spells';

export interface BookClassRuleProfile {
  classId: string;
  hitDie: number;
  asiLevels?: readonly number[];
  ruleset: { id: string; version: string; layer: 'book' };
  reference: string;
  spellcasting?: {
    ability: 'int';
    cantripsByLevel: readonly { level: number; total: number }[];
    cantripsConfirmedThrough: number;
    spellListCantrips: readonly string[];
    prepared: { ability: 'int'; halfLevel: 'floor'; minimum: number };
    spellListReference: string;
  };
}

export interface BookCantripCatalog {
  options: readonly { id: string; name: string; level: number }[];
  unavailableNames: readonly string[];
}

const ARTIFICER_CANTRIPS = [
  'Acid splash', 'Booming blade', 'Create bonfire', 'Dancing lights', 'Fire bolt', 'Frostbite',
  'Green-flame blade', 'Guidance', 'Light', 'Lightning lure', 'Mage hand', 'Magic stone',
  'Mending', 'Message', 'Poison spray', 'Prestidigitation', 'Ray of frost', 'Resistance',
  'Shocking grasp', 'Spare the dying', 'Sword burst', 'Thorn whip', 'Thunderclap',
] as const;

const normalizeSpellName = (name: string): string => name.normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('en-US')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/**
 * Artificer is from Tasha's Cauldron of Everything (2020), not SRD 5.1.
 * Keep this separate from SRD_CLASSES so a book rule can never be mislabeled as SRD.
 */
export const BOOK_CLASS_RULES: Readonly<Record<string, BookClassRuleProfile>> = {
  izobretatel: {
    classId: 'izobretatel',
    hitDie: 8,
    asiLevels: [4, 8, 12, 16, 19],
    ruleset: { id: 'tashas-cauldron-of-everything', version: '2020', layer: 'book' },
    reference: 'Tasha’s Cauldron of Everything (2020), p. 10 (The Artificer table)',
    spellcasting: {
      ability: 'int',
      cantripsByLevel: [{ level: 1, total: 2 }, { level: 10, total: 3 }, { level: 14, total: 4 }],
      cantripsConfirmedThrough: 20,
      spellListCantrips: ARTIFICER_CANTRIPS,
      prepared: { ability: 'int', halfLevel: 'floor', minimum: 1 },
      spellListReference: 'Tasha’s Cauldron of Everything (2020), pp. 12–13 (Spellcasting; Artificer Spell List)',
    },
  },
};

/** Names come from the selected book; only options present in the local spell catalog are selectable. */
export function bookCantripCatalog(classId: string): BookCantripCatalog {
  const names = BOOK_CLASS_RULES[classId]?.spellcasting?.spellListCantrips ?? [];
  const byName = new Map(SPELL_LIST.filter(spell => spell.level === 0).map(spell => [normalizeSpellName(spell.name), spell] as const));
  const options: { id: string; name: string; level: number }[] = [];
  const unavailableNames: string[] = [];
  for (const name of names) {
    const spell = byName.get(normalizeSpellName(name));
    if (spell) options.push({ id: spell.id, name: spell.name, level: spell.level });
    else unavailableNames.push(name);
  }
  return { options, unavailableNames };
}

/** Level-dependent values from the book profile; the full leveled spell list is still absent locally. */
export function bookSpellcastingAt(
  classId: string,
  level: number,
  abilityModifier: number,
  maxSpellLevel: number,
): { ability: 'int'; cantrips: number | null; cantripsConfirmedThrough: number; prepared: number; maxSpellLevel: number; ruleset: BookClassRuleProfile['ruleset']; reference: string; spellListReference: string } | undefined {
  const profile = BOOK_CLASS_RULES[classId];
  const spellcasting = profile?.spellcasting;
  if (!profile || !spellcasting || !Number.isInteger(level) || level < 1 || level > 20) return undefined;
  const cantrips = level <= spellcasting.cantripsConfirmedThrough
    ? spellcasting.cantripsByLevel.reduce((total, row) => level >= row.level ? row.total : total, 0)
    : null;
  const prepared = Math.max(spellcasting.prepared.minimum, abilityModifier + Math.floor(level / 2));
  return {
    ability: spellcasting.ability,
    cantrips,
    cantripsConfirmedThrough: spellcasting.cantripsConfirmedThrough,
    prepared,
    maxSpellLevel,
    ruleset: profile.ruleset,
    reference: profile.reference,
    spellListReference: spellcasting.spellListReference,
  };
}
