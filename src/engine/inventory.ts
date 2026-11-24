import { attacksOf, srdIdOf } from '../campaign/build';
import { abilityMod, ARCHERY_STYLE, srdClassOf, TRAIT_EFFECTS } from '../campaign/derive';
import { sheetAc } from '../campaign/explain';
import { classById, raceById } from '../rules/compendium';
import { armorIdOfItem } from '../rules/srd/equipment';
import { srdRaceSize } from '../rules/srd/races';
import type { Actor, InventoryStack, State } from './state';

/** Stable ID for a row in the pre-E7 CharacterSheet.equipment representation. */
export const legacyStackId = (actorId: string, row: number): string => `legacy:${encodeURIComponent(actorId)}:${row}`;

/** Deterministic, lossless bridge for old sheets. Rows remain distinct even when they reference the same item. */
export function legacyStacksForActor(actor: Actor): InventoryStack[] {
  const lines = actor.sheet?.equipment ?? [];
  let armorRow = -1;
  if (actor.sheet?.armor) armorRow = lines.findIndex(line => armorIdOfItem(line.id) === actor.sheet!.armor);
  const shieldRow = actor.sheet?.shield ? lines.findIndex(line => line.id === 'shield') : -1;
  return lines.map((line, row) => ({
    id: legacyStackId(actor.id, row),
    itemId: line.id,
    qty: line.qty,
    owner: { kind: 'actor', id: actor.id },
    storage: { kind: 'actor', id: actor.id },
    visibility: 'players',
    ...(row === armorRow ? { wornAs: 'armor' as const } : {}),
    ...(row === shieldRow ? { wornAs: 'shield' as const } : {}),
  }));
}

/** Evaluate only restrictions represented by the current character sheet; unknown prose stays an explicit review case. */
export function attunementRequirement(actor: Actor, by?: string, when?: string): 'eligible' | 'ineligible' | 'unsupported' {
  if (when) return 'unsupported'; // The state has no location/time context for situational attunement clauses yet.
  if (!by) return 'eligible';
  const restriction = by.toLocaleLowerCase().normalize('NFKC').trim();
  if (restriction === 'a dwarf' || restriction === 'dwarf') {
    const race = actor.sheet && raceById(actor.sheet.raceId);
    return actor.sheet?.raceId === 'dvarf' || race?.name.toLocaleLowerCase() === 'dwarf' ? 'eligible' : 'ineligible';
  }
  if (restriction === 'a creature of good alignment' || restriction === 'creature of good alignment') {
    const alignment = alignmentKind(actor.sheet?.alignment);
    return alignment === null ? 'unsupported' : alignment === 'good' ? 'eligible' : 'ineligible';
  }
  if (restriction === 'a creature of evil alignment' || restriction === 'creature of evil alignment') {
    const alignment = alignmentKind(actor.sheet?.alignment);
    return alignment === null ? 'unsupported' : alignment === 'evil' ? 'eligible' : 'ineligible';
  }
  const srdClass = actor.sheet && classById(actor.sheet.classId);
  if (!srdClass) return 'unsupported';
  const classNames: Readonly<Record<string, string>> = {
    barbarian: 'Barbarian', bard: 'Bard', cleric: 'Cleric', druid: 'Druid', fighter: 'Fighter', monk: 'Monk',
    paladin: 'Paladin', ranger: 'Ranger', rogue: 'Rogue', sorcerer: 'Sorcerer', warlock: 'Warlock', wizard: 'Wizard',
  };
  const allowed = restriction.match(/\b(barbarian|bard|cleric|druid|fighter|monk|paladin|ranger|rogue|sorcerer|warlock|wizard)\b/g);
  if (restriction === 'a spellcaster' || restriction === 'spellcaster') {
    return ['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Warlock', 'Wizard'].includes(srdClass.name) ? 'eligible' : 'ineligible';
  }
  if (!allowed?.length) return 'unsupported';
  return allowed.some(id => classNames[id] === srdClass.name) ? 'eligible' : 'ineligible';
}

function alignmentKind(value?: string): 'good' | 'neutral' | 'evil' | null {
  const normalized = value?.toLocaleLowerCase().normalize('NFKC').trim();
  if (!normalized) return null;
  if (['good', 'lawful good', 'neutral good', 'chaotic good', 'добрый', 'законно-добрый', 'нейтрально-добрый', 'хаотично-добрый'].includes(normalized)) return 'good';
  if (['evil', 'lawful evil', 'neutral evil', 'chaotic evil', 'злой', 'законно-злой', 'нейтрально-злой', 'хаотично-злой'].includes(normalized)) return 'evil';
  if (['neutral', 'lawful neutral', 'chaotic neutral', 'true neutral', 'нейтральный', 'законно-нейтральный', 'хаотично-нейтральный', 'истинно-нейтральный'].includes(normalized)) return 'neutral';
  return null;
}

/** Migrate the legacy initial snapshot without adding a journal event or changing its old event sequence. */
export function migrateLegacyInventory(state: State): State {
  const inventory = { ...(state.inventory ?? {}) };
  let changed = false;
  for (const actor of Object.values(state.actors)) {
    for (const stack of legacyStacksForActor(actor)) {
      const existing = inventory[stack.id];
      if (!existing) {
        inventory[stack.id] = stack;
        changed = true;
      } else if (existing.visibility === undefined && existing.itemId === stack.itemId && existing.owner.kind === 'actor' && existing.owner.id === actor.id) {
        // Existing pre-visibility legacy rows came from the character sheet and were already player-visible.
        inventory[stack.id] = { ...existing, visibility: 'players' };
        changed = true;
      }
    }
  }
  return changed || state.inventory !== undefined ? { ...state, inventory } : state;
}

/** Refresh the legacy read projection used by existing cards and rule calculations. */
export function withActorInventory(actor: Actor, inventory: Readonly<Record<string, InventoryStack>>): Actor {
  if (!actor.sheet) return actor;
  const stacks = Object.values(inventory).filter(stack =>
    stack.owner.kind === 'actor' && stack.owner.id === actor.id &&
    stack.storage.kind === 'actor' && stack.storage.id === actor.id,
  );
  const quantities = new Map<string, number>();
  for (const stack of stacks) quantities.set(stack.itemId, (quantities.get(stack.itemId) ?? 0) + stack.qty);
  const equipment = [...quantities].map(([id, qty]) => ({ id, qty }));
  const sheet = { ...actor.sheet, equipment };
  const wornArmor = stacks.find(stack => stack.wornAs === 'armor');
  const wornShield = stacks.some(stack => stack.wornAs === 'shield');
  const armorId = wornArmor ? armorIdOfItem(wornArmor.itemId) : undefined;
  if (armorId) sheet.armor = armorId;
  else delete sheet.armor;
  if (wornShield) sheet.shield = true;
  else delete sheet.shield;

  const cls = classById(sheet.classId);
  const race = raceById(sheet.raceId);
  const srdClass = cls ? srdIdOf(cls) : undefined;
  const attacks = attacksOf(equipment, {
    mods: {
      str: abilityMod(sheet.abilities.str), dex: abilityMod(sheet.abilities.dex), con: abilityMod(sheet.abilities.con),
      int: abilityMod(sheet.abilities.int), wis: abilityMod(sheet.abilities.wis), cha: abilityMod(sheet.abilities.cha),
    },
    proficiencyBonus: sheet.proficiencyBonus,
    ...(cls && srdClass ? { srdClass: srdClassOf(cls).id } : {}),
    extraWeapons: sheet.traits.flatMap(trait => TRAIT_EFFECTS[trait.id]?.weapons ?? []),
    archery: sheet.choices?.some(choice => choice.id === 'fighting-style' && choice.values.some(value => value.id === ARCHERY_STYLE)) ?? false,
    ...(race ? { small: srdRaceSize(race.name) === 'Small' } : {}),
  });
  const next: Actor = { ...actor, sheet: { ...sheet, attacks } };
  if (next.ac !== sheetAc(next)) next.ac = sheetAc(next);
  return next;
}

/** Player-facing copy: omit private item stacks and recalculate sheet-derived item data from the visible set only. */
export function withPlayerVisibleInventory(actor: Actor, inventory: Readonly<Record<string, InventoryStack>>): Actor {
  const visible = Object.fromEntries(Object.entries(inventory).filter(([, stack]) => stack.visibility === 'players'));
  return withActorInventory(actor, visible);
}

