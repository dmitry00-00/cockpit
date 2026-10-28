// Снаряжение и старт классов 5e SRD 5.1 (CC-BY-4.0, см. LICENSE.md) — content/srd/equipment.json, который пишет
// scripts/import-srd-equipment.mjs с открытого API (https://www.dnd5eapi.co/api/2014): оружие, доспехи, наборы,
// фокусировки и инструменты; стартовое снаряжение классов — обязательное и выборы «(a) … or (b) …» с текстом SRD
// дословно; владение оружием по классу; известные заговоры и заклинания по уровням; умения с выбором (избранный
// враг, исследователь природы, предок дракона). Имена — английские, как в SRD (по ним ищут в книгах).
import raw from '../../../content/srd/equipment.json';
import type { AbilityId } from './abilities';
import type { ArmorId } from './armor';
import type { SrdClassId } from './classes';

export type ItemKind = 'weapon' | 'armor' | 'shield' | 'pack' | 'tool' | 'focus' | 'gear';

export interface WeaponStats {
  category: 'simple' | 'martial';
  range: 'melee' | 'ranged';
  /** Кость урона из таблицы Weapons: «1d8»; у сети урона нет — null. */
  damage: string | null;
  damageType: string | null;
  /** Свойства SRD: finesse, light, thrown, two-handed, versatile, heavy, reach, ammunition, loading, special. */
  properties: readonly string[];
  /** Урон двумя руками у универсального оружия. */
  versatile?: string;
  /** Нормальная и максимальная дистанция у дальнобойного и метательного. */
  rangeFt?: readonly [number, number];
}

export interface Item {
  id: string;
  name: string;
  kind: ItemKind;
  cost?: string;
  weight?: number;
  weapon?: WeaponStats;
  armor?: { category: string; baseAc: number; strength: number | null; stealthDisadvantage: boolean };
  /** Содержимое набора снаряжения. */
  contents?: readonly { id: string; qty: number }[];
  text?: string;
}

/** Часть варианта: предмет с количеством или «выбрать qty из категории» («any martial weapon»). */
export type KitPart = { item: string; qty: number; ifProficient?: boolean } | { pick: string; qty: number };

/** Выбор стартового снаряжения: текст SRD дословно («(a) a mace or (b) a warhammer (if proficient)») и варианты по буквам. */
export interface KitChoice { text: string; options: readonly (readonly KitPart[])[] }

export interface ClassStart {
  name: string;
  equipment: { fixed: readonly { item: string; qty: number }[]; choices: readonly KitChoice[] };
  /** Владение оружием: категории и отдельные виды (id предметов). */
  weapons: { categories: readonly ('simple' | 'martial')[]; items: readonly string[] };
  /** Заклинательная характеристика и уровень класса, с которого класс колдует. */
  spellcasting?: { ability: AbilityId; level: number };
  /** Уровень → известные заговоры и заклинания (у колдуна заговоры есть, в таблице компендиума их колонки нет). */
  spellsByLevel?: Readonly<Record<string, { cantrips?: number; known?: number }>>;
}

export interface ChoiceFeature {
  name: string;
  class: SrdClassId;
  subclass?: string;
  level: number;
  choose: number;
  text: string;
  options: readonly { id: string; name: string; text?: string }[];
}

const DATA = raw as unknown as {
  source: string;
  fetchedAt: string;
  items: Record<string, Item>;
  categories: Record<string, string[]>;
  classes: Record<SrdClassId, ClassStart>;
  features: Record<string, ChoiceFeature>;
};

export const ITEMS: Readonly<Record<string, Item>> = DATA.items;
export const ITEM_CATEGORIES: Readonly<Record<string, readonly string[]>> = DATA.categories;
export const CLASS_START: Readonly<Record<SrdClassId, ClassStart>> = DATA.classes;
export const CHOICE_FEATURES: Readonly<Record<string, ChoiceFeature>> = DATA.features;
export const EQUIPMENT_SOURCE = { source: DATA.source, fetchedAt: DATA.fetchedAt } as const;

export const isItemId = (id: string): boolean => Object.hasOwn(DATA.items, id);

/** Предмет-доспех API → id таблицы доспехов (src/rules/srd/armor.ts), по которой derive считает AC. */
const ARMOR_OF_ITEM: Readonly<Record<string, ArmorId>> = {
  'padded-armor': 'padded', 'leather-armor': 'leather', 'studded-leather-armor': 'studded-leather', 'hide-armor': 'hide',
  'chain-shirt': 'chain-shirt', 'scale-mail': 'scale-mail', 'breastplate': 'breastplate', 'half-plate-armor': 'half-plate',
  'ring-mail': 'ring-mail', 'chain-mail': 'chain-mail', 'splint-armor': 'splint', 'plate-armor': 'plate',
};
export const armorIdOfItem = (itemId: string): ArmorId | undefined => ARMOR_OF_ITEM[itemId];
export const itemIdOfArmor = (armor: ArmorId): string => Object.entries(ARMOR_OF_ITEM).find(([, a]) => a === armor)![0];

/** Категории выбора по-русски: «любое воинское оружие». */
export const CATEGORY_LABEL: Readonly<Record<string, string>> = {
  'simple-weapons': 'любое простое оружие',
  'martial-weapons': 'любое воинское оружие',
  'simple-melee-weapons': 'любое простое рукопашное оружие',
  'martial-melee-weapons': 'любое воинское рукопашное оружие',
  'simple-ranged-weapons': 'любое простое дальнобойное оружие',
  'martial-ranged-weapons': 'любое воинское дальнобойное оружие',
  'holy-symbols': 'священный символ',
  'druidic-foci': 'фокусировка друидов',
  'arcane-foci': 'магическая фокусировка',
  'musical-instruments': 'музыкальный инструмент',
};

/** Типы урона SRD — по-русски, как говорят за столом. */
export const DAMAGE_LABEL: Readonly<Record<string, string>> = {
  slashing: 'рубящий', piercing: 'колющий', bludgeoning: 'дробящий', acid: 'кислота', cold: 'холод', fire: 'огонь',
  force: 'силовое поле', lightning: 'электричество', necrotic: 'некротическая энергия', poison: 'яд', psychic: 'психическая энергия',
  radiant: 'излучение', thunder: 'звук',
};

/** Предметы категории, кроме тех, что уже названы в выборе («any other musical instrument» — кроме лютни). */
export function categoryItems(category: string): Item[] {
  return (ITEM_CATEGORIES[category] ?? []).map(id => ITEMS[id]).filter(Boolean);
}

/** Владеет ли класс SRD оружием: по категории или по виду. */
export function classWeaponProficient(classId: SrdClassId, itemId: string): boolean {
  const item = ITEMS[itemId];
  if (!item?.weapon) return false;
  const w = CLASS_START[classId].weapons;
  return w.categories.includes(item.weapon.category) || w.items.includes(itemId);
}
