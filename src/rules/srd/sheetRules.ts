// Правила чисел листа персонажа по 5e SRD 5.1 — дословно (CC-BY-4.0, см. LICENSE.md), для дерева вывода (ROADMAP 5.4):
// у каждого шага числа — строка, откуда он. Сняты с https://api.open5e.com/v1/sections/ (abilities, attacking, armor,
// saving-throws, spellcasting, weapons, leveling-up), /v1/classes/ и /v1/races/ (hill-dwarf) 2026-10-29. Строки хитов и Сл заклинаний у классов
// SRD одной формы («Hit Points at 1st Level: 10 + your Constitution modifier»), меняются только кость, имя класса и
// характеристика — поэтому здесь шаблоны, а не двенадцать копий.
import type { AbilityId } from './abilities';

export const SHEET_RULES_SOURCE = 'SRD 5.1: Using Ability Scores, Combat, Equipment, Spellcasting, Classes (CC-BY-4.0)';

export const SHEET_RULES = {
  abilityMod: 'To determine an ability modifier without consulting the table, subtract 10 from the ability score and then divide the total by 2 (round down).',
  saveProficiency: 'As with skill proficiencies, proficiency in a saving throw lets a character add his or her proficiency bonus to saving throws made using a particular ability score.',
  skillProficiency: 'In either case, proficiency in a skill means an individual can add his or her proficiency bonus to ability checks that involve that skill.',
  expertise: "Occasionally, your proficiency bonus might be multiplied or divided (doubled or halved, for example) before you apply it. For example, the rogue's Expertise feature doubles the proficiency bonus for certain ability checks.",
  passive: "Here's how to determine a character's total for a passive check: 10 + all modifiers that normally apply to the check.",
  initiative: 'At the beginning of every combat, you roll initiative by making a Dexterity check.',
  attackAbility: 'The ability modifier used for a melee weapon attack is Strength, and the ability modifier used for a ranged weapon attack is Dexterity. Weapons that have the finesse or thrown property break this rule.',
  finesse: 'When making an attack with a finesse weapon, you use your choice of your Strength or Dexterity modifier for the attack and damage rolls.',
  weaponProficiency: 'You add your proficiency bonus to your attack roll when you attack using a weapon with which you have proficiency, as well as when you attack with a spell.',
  archery: 'You gain a +2 bonus to attack rolls you make with ranged weapons.',
  defense: 'While you are wearing armor, you gain a +1 bonus to AC.',
  armorBase: 'The armor (and shield) you wear determines your base Armor Class.',
  unarmoredBarbarian: 'While you are not wearing any armor, your Armor Class equals 10 + your Dexterity modifier + your Constitution modifier. You can use a shield and still gain this benefit.',
  unarmoredMonk: 'Beginning at 1st level, while you are wearing no armor and not wielding a shield, your AC equals 10 + your Dexterity modifier + your Wisdom modifier.',
  draconicAc: "When you aren't wearing armor, your AC equals 13 + your Dexterity modifier.",
  draconicHp: 'At 1st level, your hit point maximum increases by 1 and increases by 1 again whenever you gain a level in this class.',
  hpFixed: 'Alternatively, you can use the fixed value shown in your class entry, which is the average result of the die roll (rounded up).',
  dwarvenToughness: 'Dwarven Toughness. Your hit point maximum increases by 1, and it increases by 1 every time you gain a level.',
  conChange: 'If your Constitution modifier changes, your hit point maximum changes as well, as though you had the new modifier from 1st level.',
} as const;

const ABILITY_NAME: Readonly<Record<AbilityId, string>> = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
};

/** «Hit Points at 1st Level: 10 + your Constitution modifier» — строка класса SRD. */
export const hpFirstLevelRule = (die: number) => `Hit Points at 1st Level: ${die} + your Constitution modifier`;

/** «Hit Points at Higher Levels: 1d10 (or 6) + your Constitution modifier per fighter level after 1st». */
export const hpHigherLevelsRule = (die: number, className: string) =>
  `Hit Points at Higher Levels: 1d${die} (or ${die / 2 + 1}) + your Constitution modifier per ${className.toLowerCase()} level after 1st`;

/** «Spell save DC = 8 + your proficiency bonus + your Wisdom modifier». */
export const spellDcRule = (ability: AbilityId) => `Spell save DC = 8 + your proficiency bonus + your ${ABILITY_NAME[ability]} modifier`;

/** «Spell attack modifier = your proficiency bonus + your Wisdom modifier». */
export const spellAttackRule = (ability: AbilityId) => `Spell attack modifier = your proficiency bonus + your ${ABILITY_NAME[ability]} modifier`;
