// Подписи слоя вида: русские имена характеристик и навыков (в rules/srd их нет — там SRD по-английски).
// Одна таблица на стол и редактор персонажа, чтобы «Уход за животными» не разошёлся по двум написаниям.
import { ABILITY_IDS, SKILL_IDS, SKILLS, type AbilityId, type SkillId } from '../rules/srd/abilities';
import type { GoodsId } from '../engine/state';

export const ABILITY_LABEL: Readonly<Record<AbilityId, string>> = {
  str: 'Сила',
  dex: 'Ловкость',
  con: 'Телосложение',
  int: 'Интеллект',
  wis: 'Мудрость',
  cha: 'Харизма',
};

export const SKILL_LABEL: Readonly<Record<SkillId, string>> = {
  'acrobatics': 'Акробатика',
  'animal-handling': 'Уход за животными',
  'arcana': 'Магия',
  'athletics': 'Атлетика',
  'deception': 'Обман',
  'history': 'История',
  'insight': 'Проницательность',
  'intimidation': 'Запугивание',
  'investigation': 'Анализ',
  'medicine': 'Медицина',
  'nature': 'Природа',
  'perception': 'Внимательность',
  'performance': 'Выступление',
  'persuasion': 'Убеждение',
  'religion': 'Религия',
  'sleight-of-hand': 'Ловкость рук',
  'stealth': 'Скрытность',
  'survival': 'Выживание',
};

/** Навыки в порядке характеристик SRD (STR, DEX, CON, INT, WIS, CHA): цветная грань плитки группирует их сама. */
export const SKILLS_BY_ABILITY: readonly SkillId[] = ABILITY_IDS.flatMap(ab => SKILL_IDS.filter(id => SKILLS[id].ability === ab));

/** Товары цен мест (ROADMAP 3.3): разделы таблиц снаряжения SRD — словами стола. */
export const GOODS_LABEL: Readonly<Record<GoodsId, string>> = {
  weapons: 'оружие', armor: 'доспехи', gear: 'снаряжение', food: 'еда и ночлег', mounts: 'верховые и повозки', potions: 'зелья',
};

/** Отношение фракций −3…+3 словами: число со знаком стоит рядом, цвет не единственный носитель смысла. */
export const RELATION_LABEL: Readonly<Record<number, string>> = {
  3: 'союз', 2: 'союзники', 1: 'тепло', 0: 'ровно', [-1]: 'настороженно', [-2]: 'враги', [-3]: 'война',
};

/** «+2», «−1», «+10%»: знак минуса — типографский. */
export const signed = (n: number, unit = ''): string => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}${unit}`;
