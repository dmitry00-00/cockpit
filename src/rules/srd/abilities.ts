// Характеристики и навыки 5e SRD 5.1, раздел Using Ability Scores (CC-BY-4.0, см. LICENSE.md).
// Только идентификаторы и таблица «навык → характеристика»; формулы — в src/campaign/derive.ts. Правила,
// по которым они написаны, дословно (https://www.dnd5eapi.co/api/2014/rule-sections/, снято 2026-09-18):
//   «To determine an ability modifier without consulting the table, subtract 10 from the ability score and
//    then divide the total by 2 (round down).»
//   «Here's how to determine a character's total for a passive check: 10 + all modifiers that normally
//    apply to the check. If the character has advantage on the check, add 5. For disadvantage, subtract 5.»

export const ABILITY_IDS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type AbilityId = (typeof ABILITY_IDS)[number];

/** Английские имена SRD — по ним ищут в книгах; код `STR` и т.п. — для интерфейса. */
export const ABILITIES: Readonly<Record<AbilityId, { name: string; code: string }>> = {
  str: { name: 'Strength', code: 'STR' },
  dex: { name: 'Dexterity', code: 'DEX' },
  con: { name: 'Constitution', code: 'CON' },
  int: { name: 'Intelligence', code: 'INT' },
  wis: { name: 'Wisdom', code: 'WIS' },
  cha: { name: 'Charisma', code: 'CHA' },
};

export const SKILL_IDS = [
  'acrobatics', 'animal-handling', 'arcana', 'athletics', 'deception', 'history', 'insight', 'intimidation',
  'investigation', 'medicine', 'nature', 'perception', 'performance', 'persuasion', 'religion',
  'sleight-of-hand', 'stealth', 'survival',
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

/** Восемнадцать навыков SRD и характеристика каждого — таблица из раздела Skills. */
export const SKILLS: Readonly<Record<SkillId, { name: string; ability: AbilityId }>> = {
  'acrobatics': { name: 'Acrobatics', ability: 'dex' },
  'animal-handling': { name: 'Animal Handling', ability: 'wis' },
  'arcana': { name: 'Arcana', ability: 'int' },
  'athletics': { name: 'Athletics', ability: 'str' },
  'deception': { name: 'Deception', ability: 'cha' },
  'history': { name: 'History', ability: 'int' },
  'insight': { name: 'Insight', ability: 'wis' },
  'intimidation': { name: 'Intimidation', ability: 'cha' },
  'investigation': { name: 'Investigation', ability: 'int' },
  'medicine': { name: 'Medicine', ability: 'wis' },
  'nature': { name: 'Nature', ability: 'int' },
  'perception': { name: 'Perception', ability: 'wis' },
  'performance': { name: 'Performance', ability: 'cha' },
  'persuasion': { name: 'Persuasion', ability: 'cha' },
  'religion': { name: 'Religion', ability: 'int' },
  'sleight-of-hand': { name: 'Sleight of Hand', ability: 'dex' },
  'stealth': { name: 'Stealth', ability: 'dex' },
  'survival': { name: 'Survival', ability: 'wis' },
};

export const ABILITIES_SOURCE = 'SRD 5.1, Using Ability Scores (CC-BY-4.0)';

export function isSkillId(value: string): value is SkillId {
  return (SKILL_IDS as readonly string[]).includes(value);
}
