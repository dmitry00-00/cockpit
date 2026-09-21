// Доспехи 5e SRD 5.1, таблица Armor и правила категорий (CC-BY-4.0, см. LICENSE.md).
// Таблица сверена с https://www.dnd5eapi.co/api/2014/equipment/<id>, абзацы категорий —
// с https://api.open5e.com/v1/sections/armor/, снято 2026-09-18. Только данные: как складывается AC —
// в src/campaign/derive.ts, по правилам ниже. Без доспеха и щита AC = 10 + DEX (общее правило SRD).

export type ArmorCategory = 'light' | 'medium' | 'heavy';

export const ARMOR_IDS = [
  'padded', 'leather', 'studded-leather',
  'hide', 'chain-shirt', 'scale-mail', 'breastplate', 'half-plate',
  'ring-mail', 'chain-mail', 'splint', 'plate',
] as const;
export type ArmorId = (typeof ARMOR_IDS)[number];

export interface Armor {
  id: ArmorId;
  /** Английское имя SRD. */
  name: string;
  category: ArmorCategory;
  /** Базовый AC из таблицы; DEX прибавляется по правилу категории (см. ARMOR_RULES). */
  baseAc: number;
  /** Требование к Силе у тяжёлых доспехов; без него — null. */
  strength: number | null;
  /** Колонка Stealth: помеха на проверки Ловкости (Скрытность). */
  stealthDisadvantage: boolean;
  cost: string;
  weight: string;
}

export const ARMOR: Readonly<Record<ArmorId, Armor>> = {
  'padded': { id: 'padded', name: 'Padded', category: 'light', baseAc: 11, strength: null, stealthDisadvantage: true, cost: '5 gp', weight: '8 lb.' },
  'leather': { id: 'leather', name: 'Leather', category: 'light', baseAc: 11, strength: null, stealthDisadvantage: false, cost: '10 gp', weight: '10 lb.' },
  'studded-leather': { id: 'studded-leather', name: 'Studded leather', category: 'light', baseAc: 12, strength: null, stealthDisadvantage: false, cost: '45 gp', weight: '13 lb.' },
  'hide': { id: 'hide', name: 'Hide', category: 'medium', baseAc: 12, strength: null, stealthDisadvantage: false, cost: '10 gp', weight: '12 lb.' },
  'chain-shirt': { id: 'chain-shirt', name: 'Chain shirt', category: 'medium', baseAc: 13, strength: null, stealthDisadvantage: false, cost: '50 gp', weight: '20 lb.' },
  'scale-mail': { id: 'scale-mail', name: 'Scale mail', category: 'medium', baseAc: 14, strength: null, stealthDisadvantage: true, cost: '50 gp', weight: '45 lb.' },
  'breastplate': { id: 'breastplate', name: 'Breastplate', category: 'medium', baseAc: 14, strength: null, stealthDisadvantage: false, cost: '400 gp', weight: '20 lb.' },
  'half-plate': { id: 'half-plate', name: 'Half plate', category: 'medium', baseAc: 15, strength: null, stealthDisadvantage: true, cost: '750 gp', weight: '40 lb.' },
  'ring-mail': { id: 'ring-mail', name: 'Ring mail', category: 'heavy', baseAc: 14, strength: null, stealthDisadvantage: true, cost: '30 gp', weight: '40 lb.' },
  'chain-mail': { id: 'chain-mail', name: 'Chain mail', category: 'heavy', baseAc: 16, strength: 13, stealthDisadvantage: true, cost: '75 gp', weight: '55 lb.' },
  'splint': { id: 'splint', name: 'Splint', category: 'heavy', baseAc: 17, strength: 15, stealthDisadvantage: true, cost: '200 gp', weight: '60 lb.' },
  'plate': { id: 'plate', name: 'Plate', category: 'heavy', baseAc: 18, strength: 15, stealthDisadvantage: true, cost: '1,500 gp', weight: '65 lb.' },
};

/** Щит — строка той же таблицы: «+2» к AC, категория своя. */
export const SHIELD = { name: 'Shield', acBonus: 2, cost: '10 gp', weight: '6 lb.' } as const;

/** Потолок DEX у средних доспехов; у лёгких потолка нет, у тяжёлых DEX не считается вовсе. */
export const MEDIUM_ARMOR_DEX_CAP = 2;

/** Как категория обращается с модификатором Ловкости — дословно, по этому написан armorClass(). */
export const ARMOR_RULES = {
  light: 'Light Armor: Made from supple and thin materials, light armor favors agile adventurers since it offers some protection without sacrificing mobility. If you wear light armor, you add your Dexterity modifier to the base number from your armor type to determine your Armor Class.',
  medium: 'Medium Armor: Medium armor offers more protection than light armor, but it also impairs movement more. If you wear medium armor, you add your Dexterity modifier, to a maximum of +2, to the base number from your armor type to determine your Armor Class.',
  heavy: "Heavy Armor: Of all the armor categories, heavy armor offers the best protection. These suits of armor cover the entire body and are designed to stop a wide range of attacks. Only proficient warriors can manage their weight and bulk. Heavy armor doesn't let you add your Dexterity modifier to your Armor Class, but it also doesn't penalize you if your Dexterity modifier is negative.",
  shield: 'Shields: A shield is made from wood or metal and is carried in one hand. Wielding a shield increases your Armor Class by 2. You can benefit from only one shield at a time.',
  source: 'SRD 5.1, Equipment: Armor and Shields (CC-BY-4.0)',
} as const;

/** Mage Armor — заклинание SRD; здесь только то, что нужно для AC. */
export const MAGE_ARMOR = {
  name: 'Mage Armor',
  baseAc: 13,
  text: "You touch a willing creature who isn't wearing armor, and a protective magical force surrounds it until the spell ends. The target's base AC becomes 13 + its Dexterity modifier. The spell ends if the target dons armor or if you dismiss the spell as an action.",
  durationSec: 8 * 3600,
  source: 'SRD 5.1, Spells: Mage Armor (CC-BY-4.0)',
} as const;

export function isArmorId(value: string): value is ArmorId {
  return (ARMOR_IDS as readonly string[]).includes(value);
}
