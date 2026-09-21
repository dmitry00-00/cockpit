// Классы 5e SRD 5.1: кость хитов и уровни Ability Score Improvement (CC-BY-4.0, см. LICENSE.md).
// Сверено с https://www.dnd5eapi.co/api/2014/classes/<id> и /classes/<id>/levels, снято 2026-09-18.
// Таблицы компендиума (content/compendium/classes.json) костей хитов не содержат, а строку 4-го уровня
// оставляют пустой — оба факта SRD, поэтому живут здесь, а не в хоумбрю. Ключ — английское имя класса
// в нижнем регистре: так к записи компендиума (`CharacterClass.name`) добирается src/campaign/derive.ts.

export const SRD_CLASS_IDS = [
  'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk',
  'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard',
] as const;
export type SrdClassId = (typeof SRD_CLASS_IDS)[number];

export interface SrdClass {
  id: SrdClassId;
  name: string;
  /** Грани кости хитов: «Hit Dice: 1d10 per fighter level». */
  hitDie: number;
  /** Уровни, на которых класс даёт Ability Score Improvement. У воина и плута их больше. */
  asiLevels: readonly number[];
}

const ASI_DEFAULT = [4, 8, 12, 16, 19] as const;

export const SRD_CLASSES: Readonly<Record<SrdClassId, SrdClass>> = {
  barbarian: { id: 'barbarian', name: 'Barbarian', hitDie: 12, asiLevels: ASI_DEFAULT },
  bard: { id: 'bard', name: 'Bard', hitDie: 8, asiLevels: ASI_DEFAULT },
  cleric: { id: 'cleric', name: 'Cleric', hitDie: 8, asiLevels: ASI_DEFAULT },
  druid: { id: 'druid', name: 'Druid', hitDie: 8, asiLevels: ASI_DEFAULT },
  fighter: { id: 'fighter', name: 'Fighter', hitDie: 10, asiLevels: [4, 6, 8, 12, 14, 16, 19] },
  monk: { id: 'monk', name: 'Monk', hitDie: 8, asiLevels: ASI_DEFAULT },
  paladin: { id: 'paladin', name: 'Paladin', hitDie: 10, asiLevels: ASI_DEFAULT },
  ranger: { id: 'ranger', name: 'Ranger', hitDie: 10, asiLevels: ASI_DEFAULT },
  rogue: { id: 'rogue', name: 'Rogue', hitDie: 8, asiLevels: [4, 8, 10, 12, 16, 19] },
  sorcerer: { id: 'sorcerer', name: 'Sorcerer', hitDie: 6, asiLevels: ASI_DEFAULT },
  warlock: { id: 'warlock', name: 'Warlock', hitDie: 8, asiLevels: ASI_DEFAULT },
  wizard: { id: 'wizard', name: 'Wizard', hitDie: 6, asiLevels: ASI_DEFAULT },
};

/** Правила хитов и ASI дословно — чтобы формула в derive.ts была сверяема с текстом. */
export const HIT_POINTS_RULE = {
  text: [
    'Hit Points at 1st Level: 10 + your Constitution modifier',
    'Hit Points at Higher Levels: 1d10 (or 6) + your Constitution modifier per fighter level after 1st',
  ],
  source: 'SRD 5.1, Classes: Fighter, Class Features (CC-BY-4.0); у других классов — своя кость, форма та же',
} as const;

export const ASI_RULE = {
  text: [
    "When you reach 4th level, and again at 8th, 12th, 16th, and 19th level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
  ],
  source: 'SRD 5.1, Classes: Ability Score Improvement (CC-BY-4.0)',
} as const;

/** SRD не даёт поднять характеристику выше 20 этим умением. */
export const ABILITY_SCORE_CAP = 20;

export function isSrdClassId(value: string): value is SrdClassId {
  return (SRD_CLASS_IDS as readonly string[]).includes(value);
}
