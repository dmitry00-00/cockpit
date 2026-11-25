// Производные персонажа по SRD: характеристики → модификаторы → хиты, AC, пассивное внимание.
// Чистые функции без стора. Числа §13 отсюда ВЫВОДЯТСЯ, а не вбиваются: если формула или компендиум
// изменятся, seed.test.ts упадёт — это и есть контроль.
import { ABILITY_IDS, SKILL_IDS, SKILLS, type AbilityId, type SkillId } from '../rules/srd/abilities';
import { ARMOR, MAGE_ARMOR, MEDIUM_ARMOR_DEX_CAP, SHIELD, type ArmorCategory, type ArmorId } from '../rules/srd/armor';
import { ABILITY_SCORE_CAP, SRD_CLASSES, isSrdClassId, type SrdClass } from '../rules/srd/classes';
import { srdRaceSize, srdRaceSpeed } from '../rules/srd/races';
import { backgroundById, classById, featById, raceById, type Asi, type AsiChoice, type CharacterClass, type Feat, type Race, type Subrace, type Trait } from '../rules/compendium';
import { CLASS_START, armorIdOfItem, ITEMS } from '../rules/srd/equipment';
import { SPELLS } from '../rules/srd/spells';
import type { PortraitRef } from '../art/portrait';
import {
  attacksOf, classChoicesOf, raceCantripChoice, raceSkillChoice, spellcastingOf, srdIdOf,
  type Attack, type FeatureChoice, type InventoryLine, type SpellListKind,
} from './build';

export type AbilityScores = Readonly<Record<AbilityId, number>>;

export class DeriveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeriveError';
  }
}

/** SRD: «subtract 10 from the ability score and then divide the total by 2 (round down)». */
export function abilityMod(score: number): number {
  if (!Number.isInteger(score) || score < 1 || score > 30) throw new DeriveError(`характеристика 1–30, получено ${score}`);
  return Math.floor((score - 10) / 2);
}

/** Бонус мастерства — из таблицы класса в компендиуме (колонка «Бонус мастерства»), не из формулы. */
export function proficiencyBonusOf(cls: CharacterClass, level: number): number {
  const row = cls.levels.find(l => l.level === level);
  if (!row) throw new DeriveError(`у класса ${cls.name} нет уровня ${level}`);
  if (row.proficiencyBonus === null) throw new DeriveError(`у класса ${cls.name} на уровне ${level} не задан бонус мастерства`);
  return row.proficiencyBonus;
}

/**
 * Максимум хитов по SRD: на 1-м уровне кость целиком + CON, дальше среднее (кость/2 + 1) + CON за уровень.
 * perLevelBonus — «+1 за уровень» вроде Dwarven Toughness; он тоже считается с 1-го уровня.
 */
export function maxHp(hitDie: number, level: number, conMod: number, perLevelBonus = 0): number {
  if (!Number.isInteger(level) || level < 1 || level > 20) throw new DeriveError(`уровень 1–20, получено ${level}`);
  const average = hitDie / 2 + 1;
  return hitDie + (level - 1) * average + level * (conMod + perLevelBonus);
}

export interface ArmorChoice {
  armor?: ArmorId | null;
  shield?: boolean;
  /** Mage Armor: базовый AC 13 + DEX; вместе с доспехом не бывает — заклинание кончается, когда его надевают. */
  mageArmor?: boolean;
}

/** AC по правилам категорий SRD (ARMOR_RULES): лёгкий — весь DEX, средний — DEX до +2, тяжёлый — без DEX. */
export function armorClass(dexMod: number, choice: ArmorChoice = {}): number {
  if (choice.mageArmor && choice.armor) throw new DeriveError('Mage Armor и доспех вместе не бывают: заклинание кончается, когда цель надевает доспех');
  let base: number;
  if (choice.mageArmor) base = MAGE_ARMOR.baseAc + dexMod;
  else if (choice.armor) {
    const a = ARMOR[choice.armor];
    const dex: Record<ArmorCategory, number> = { light: dexMod, medium: Math.min(dexMod, MEDIUM_ARMOR_DEX_CAP), heavy: 0 };
    base = a.baseAc + dex[a.category];
  } else base = 10 + dexMod;
  return base + (choice.shield ? SHIELD.acBonus : 0);
}

/** Пассивная проверка SRD: 10 + все модификаторы проверки. Преимущество (+5) и помеху (−5) не ведём. */
export function passivePerception(wisMod: number, proficient: boolean, proficiencyBonus: number): number {
  return 10 + wisMod + (proficient ? proficiencyBonus : 0);
}

/** Увеличение характеристик на уровне класса: +2 к одной или +1 к двум (SRD, ASI_RULE). */
export interface Improvement { level: number; asi: Asi }

/** Описание персонажа игрока: всё, что не выводится. Фон (background) не ведём — в компендиуме его нет. */
export interface PcSpec {
  id: string;
  name: string;
  /** Built-in asset id or a compact user-supplied portrait stored with the campaign. */
  portrait?: PortraitRef;
  raceId: string;
  subraceId?: string;
  classId: string;
  /** Подкласс — только если класс даёт его на этом уровне (gainedAt ≤ level). */
  subclassId?: string;
  /** Предыстория — два навыка сверх выбора класса; совпавший с выбором класса не удваивается. */
  backgroundId?: string;
  level: number;
  /** Базовые характеристики до расовых бонусов. */
  base: AbilityScores;
  improvements: readonly Improvement[];
  armor: ArmorId | null;
  shield: boolean;
  mageArmor?: boolean;
  /** Навыки, выбранные у класса; расовые добавляются сами (см. TRAIT_EFFECTS). */
  skills: readonly SkillId[];
  /** Мировоззрение и биография — как игрок написал на листе; выводить их не из чего. */
  alignment?: string;
  /** Божество (E8): id справочника богов и имя латиницей. */
  deity?: { id: string; name: string };
  bio?: { height?: string; weight?: string; age?: number };
  /** Гибкие бонусы расы, распределённые игроком (Q11): «+1 к двум на выбор» полуэльфа → { dex: 1, con: 1 }. */
  asiChoice?: Asi;
  /**
   * Выборы умений класса и расы: id выбора (build.ts: 'fighting-style', 'favored-enemy', 'terrain', 'dragon-ancestor',
   * 'metamagic', 'expertise', 'race-skills') → id вариантов. Нет поля — лист из сида, выборы не ведутся и не проверяются.
   */
  choices?: Readonly<Record<string, readonly string[]>>;
  /** Заклинания SRD по id: заговоры и заклинания 1-го круга и выше (известные, подготовленные или в книге). Нет поля — не ведутся. */
  spells?: readonly string[];
  /** Снаряжение — предметы SRD по id с количеством; доспех и щит на персонаже должны быть отсюда. Нет поля — не ведётся. */
  equipment?: readonly InventoryLine[];
  /**
   * Черты (feats) из таблицы владельца: «race» — черта расы (у человека таблицы — «Одна черта на выбор»), число —
   * уровень ASI, на котором вместо увеличения взята черта. asi — характеристика +1, если черта её даёт.
   */
  feats?: readonly FeatPick[];
}

export interface FeatPick { at: 'race' | number; id: string; asi?: AbilityId }

/** Что персонаж выбрал в умении — с подписями вариантов для листа. */
export interface ChosenFeature { id: string; label: string; values: readonly { id: string; name: string; at?: number; source?: 'srd' | 'book' | 'hb'; ruleset?: { id: string; version: string; layer: string } }[] }

/** Заклинательство на листе: характеристика, Сл и бонус атаки по SRD, выбранное и «всегда подготовленное». */
export interface SheetSpellcasting {
  ability: AbilityId;
  /** SRD: Spell save DC = 8 + your proficiency bonus + your … modifier. */
  saveDc: number;
  /** SRD: Spell attack modifier = your proficiency bonus + your … modifier. */
  attack: number;
  kind: SpellListKind;
  maxLevel: number;
  cantrips: readonly string[];
  spells: readonly string[];
  always: readonly string[];
}

export interface DerivedCharacter {
  race: Race;
  subrace?: Subrace;
  cls: CharacterClass;
  srdClass: SrdClass;
  abilities: AbilityScores;
  mods: AbilityScores;
  proficiencyBonus: number;
  hpMax: number;
  ac: number;
  passivePerception: number;
  skills: readonly SkillId[];
  features: readonly { id: string; name: string; level: number }[];
  traits: readonly { id: string; name: string }[];
  /** Скорость ходьбы по расе SRD; раса вне SRD — undefined. Тяжёлый доспех без нужной Силы — на 10 меньше. */
  speed?: number;
  /** Гибкие бонусы расы, которые предлагает таблица (что распределять). */
  asiChoice?: AsiChoice;
  /** Выборы умений, которые даёт уровень, и сделанное в них. */
  featureChoices: readonly FeatureChoice[];
  chosen: readonly ChosenFeature[];
  /** Компетентность: навыки (и воровские инструменты) с удвоенным бонусом мастерства. */
  expertise: readonly string[];
  spellcasting?: SheetSpellcasting;
  equipment: readonly InventoryLine[];
  attacks: readonly Attack[];
  /** Пояснения листа: «тяжёлый доспех без STR 15 — скорость −10». */
  notes: readonly string[];
  /** Черты: что взято, где и с каким +1. */
  feats: readonly { id: string; name: string; at: 'race' | number; asi?: AbilityId }[];
  /** Сколько черт даёт раса (у человека таблицы — одна). */
  raceFeats: number;
}

/** Как derive реагирует на несходящееся: строго — бросает, мягко — копит «что осталось» и считает дальше. */
type Issue = (message: string) => void;
const strict: Issue = message => { throw new DeriveError(message); };

/**
 * Механика расовых черт, которую компендиум пока держит прозой (схема обещает типизированные Effect вторым
 * проходом). Ключ — id черты в content/compendium/races.json; derive.test.ts проверяет, что каждый ключ там есть.
 */
export const TRAIT_EFFECTS: Readonly<Record<string, { hpPerLevel?: number; skills?: readonly SkillId[]; skillChoice?: number; featChoice?: number; cantripFrom?: SrdClass['id']; weapons?: readonly string[] }>> = {
  /** Dwarven Toughness (Hill Dwarf): +1 хит за уровень. */
  'dvarfskaa-vyderjka': { hpPerLevel: 1 },
  /** Keen Senses (Elf): владение Внимательностью. */
  'obostrennye-cuvstva': { skills: ['perception'] },
  /** Elf Weapon Training (SRD: High Elf): «proficiency with the longsword, shortsword, shortbow, and longbow». */
  'vladenie-el-fiyskim-orujiem': { weapons: ['longsword', 'shortsword', 'shortbow', 'longbow'] },
  /** Dwarven Combat Training: «proficiency with the battleaxe, handaxe, light hammer, and warhammer». */
  'dvarfskaa-boevaa-trenirovka': { weapons: ['battleaxe', 'handaxe', 'light-hammer', 'warhammer'] },
  /** Skill Versatility (Half-Elf): «proficiency in two skills of your choice» — в таблице «Владение двумя навыками на выбор». */
  'universal-nost-navykov': { skillChoice: 2 },
  /** Человек в таблице владельца: «Один навык на выбор» (в SRD у человека его нет — так решила таблица). */
  'navyki': { skillChoice: 1 },
  /** Человек в таблице владельца: «Одна черта на выбор» (вариант человека книги игрока). */
  'certa': { featChoice: 1 },
  /** Cantrip (SRD: High Elf): «You know one cantrip of your choice from the wizard spell list». */
  'zagovor': { cantripFrom: 'wizard' },
};

/**
 * Механика умений классов и подклассов SRD, которую таблицы держат прозой: защита без доспехов, драконья
 * устойчивость, бонусное владение домена Жизни, боевой стиль «Оборона». Ключи — id классов SRD и подклассов компендиума.
 */
export const UNARMORED_DEFENSE: Partial<Record<string, { ability: AbilityId; noShield: boolean }>> = {
  /** Barbarian, Unarmored Defense: «10 + your Dexterity modifier + your Constitution modifier. You can use a shield». */
  barbarian: { ability: 'con', noShield: false },
  /** Monk, Unarmored Defense: «wearing no armor and not wielding a shield … 10 + Dexterity modifier + Wisdom modifier». */
  monk: { ability: 'wis', noShield: true },
};
/** Draconic Resilience (Draconic Bloodline): +1 хит за уровень; без доспеха AC 13 + DEX. */
export const DRACONIC_SUBCLASS = 'carodey-nasledie-drakon-ey-krovi';
/** Life Domain, Bonus Proficiency: «you gain proficiency with heavy armor». */
const LIFE_DOMAIN = 'jrec-jizni';
/** Fighting Style: Defense — «While you are wearing armor, you gain a +1 bonus to AC». id — из таблицы владельца. */
export const DEFENSE_STYLE = 'oborona';
/** Fighting Style: Archery — «+2 bonus to attack rolls you make with ranged weapons». */
export const ARCHERY_STYLE = 'strel-ba';

/** Русские имена навыков в текстах компендиума → id SRD. Длинные — первыми, чтобы «Уход за животными» не рассыпался. */
const SKILL_RU: readonly (readonly [string, SkillId])[] = [
  ['Обращение с животными', 'animal-handling'], ['Уход за животными', 'animal-handling'], ['Ловкость рук', 'sleight-of-hand'],
  ['Акробатика', 'acrobatics'], ['Анализ', 'investigation'], ['Атлетика', 'athletics'], ['Внимательность', 'perception'],
  ['Выживание', 'survival'], ['Выступление', 'performance'], ['Запугивание', 'intimidation'], ['История', 'history'],
  ['Магия', 'arcana'], ['Медицина', 'medicine'], ['Обман', 'deception'], ['Природа', 'nature'],
  ['Проницательность', 'insight'], ['Религия', 'religion'], ['Скрытность', 'stealth'], ['Убеждение', 'persuasion'],
];

const COUNT_RU: Readonly<Record<string, number>> = { один: 1, два: 2, три: 3, четыре: 4 };

/** «2 навыка из следующих: Атлетика История…» → сколько и какие; «3 любых» → options: null. */
export function classSkillChoices(cls: CharacterClass): { count: number; options: readonly SkillId[] | null } {
  const text = cls.proficiencies.skills;
  if (!text) throw new DeriveError(`у класса ${cls.name} не описаны навыки`);
  const m = /^\s*(\d+|[а-яё]+)\s+(.*)$/is.exec(text);
  if (!m) throw new DeriveError(`не разобрать навыки класса ${cls.name}: «${text}»`);
  const count = /^\d+$/.test(m[1]) ? Number(m[1]) : COUNT_RU[m[1].toLowerCase()];
  if (!count) throw new DeriveError(`не разобрать число навыков класса ${cls.name}: «${text}»`);
  if (/любых/i.test(m[2])) return { count, options: null };
  let rest = m[2].replace(/^[^:]*:/, '');
  const options: SkillId[] = [];
  for (const [ru, id] of SKILL_RU) {
    if (rest.includes(ru)) { options.push(id); rest = rest.replace(ru, ''); }
  }
  const leftover = rest.replace(/[\s,]/g, '');
  if (leftover) throw new DeriveError(`в навыках класса ${cls.name} неизвестное слово: «${leftover}»`);
  return { count, options };
}

/** «Лёгкие средние щиты» / «Все виды щиты» → категории доспехов и щит. Пусто — класс доспехов не носит. */
export function classArmorProficiency(cls: CharacterClass): ReadonlySet<ArmorCategory | 'shield'> {
  const text = cls.proficiencies.armor ?? '';
  const out = new Set<ArmorCategory | 'shield'>();
  if (/все виды/i.test(text)) { out.add('light'); out.add('medium'); out.add('heavy'); }
  if (/л[её]гкие/i.test(text)) out.add('light');
  if (/средние/i.test(text)) out.add('medium');
  if (/тяж[её]лые/i.test(text)) out.add('heavy');
  if (/щиты/i.test(text)) out.add('shield');
  return out;
}

function addAsi(scores: Record<AbilityId, number>, asi: Asi, what: string) {
  for (const [ab, v] of Object.entries(asi) as [AbilityId, number][]) {
    if (!ABILITY_IDS.includes(ab)) throw new DeriveError(`${what}: нет характеристики ${ab}`);
    scores[ab] += v;
  }
}

/** База + бонусы расы (у подрасы в компендиуме — уже сумма с расой) + увеличения по уровням, с проверкой правила ASI. */
export function abilityScores(spec: PcSpec, race: Race, subrace: Subrace | undefined, srdClass: SrdClass, issue: Issue = strict): AbilityScores {
  const scores = { ...spec.base } as Record<AbilityId, number>;
  for (const ab of ABILITY_IDS) if (!Number.isInteger(scores[ab])) throw new DeriveError(`${spec.name}: нет базовой характеристики ${ab}`);
  const racial = subrace ? subrace.asi : race.asi;
  if (!racial) throw new DeriveError(`${spec.name}: у расы ${race.name} нет бонусов без подрасы`);
  addAsi(scores, racial, `${spec.name}, раса`);
  const flex = (subrace ?? race).asiChoice ?? (subrace ? undefined : race.asiChoice);
  const given = spec.asiChoice ?? {};
  if (flex) {
    const picked = Object.entries(given).filter(([, v]) => v);
    for (const [ab, v] of picked) {
      if (!flex.from.includes(ab as AbilityId)) issue(`${spec.name}: бонус расы на выбор не идёт в ${ab.toUpperCase()}`);
      else if (v !== flex.amount) issue(`${spec.name}: бонус расы на выбор — по +${flex.amount}`);
    }
    if (picked.length > flex.count) issue(`${spec.name}: бонус расы на выбор — к ${flex.count}, выбрано ${picked.length}`);
    else if (picked.length < flex.count) issue(`распределить бонус расы: +${flex.amount} ещё к ${flex.count - picked.length}`);
    addAsi(scores, Object.fromEntries(picked.filter(([ab]) => flex.from.includes(ab as AbilityId))) as Asi, `${spec.name}, раса на выбор`);
  } else if (Object.values(given).some(Boolean)) issue(`${spec.name}: у расы ${race.name} нет бонусов на выбор`);
  // Черты: +1 к характеристике, если черта её даёт («Сила или Ловкость +1»); черта на уровне ASI заменяет увеличение.
  for (const pick of spec.feats ?? []) {
    const where = pick.at === 'race' ? 'расы' : `на ${pick.at}-м уровне`;
    if (!pick.id) { issue(`выбрать черту ${where}`); continue; }
    const feat = featById(pick.id);
    if (!feat) { issue(`${spec.name}: нет черты ${pick.id}`); continue; }
    if (typeof pick.at === 'number') {
      if (!srdClass.asiLevels.includes(pick.at) || pick.at > spec.level) issue(`${spec.name}: на уровне ${pick.at} увеличения нет — черту не взять`);
      if (spec.improvements.some(i => i.level === pick.at)) issue(`${spec.name}: на ${pick.at}-м уровне и увеличение, и черта — нужно одно`);
    }
    if (feat.asi.length > 0) {
      if (!pick.asi) issue(`черта «${feat.nameRu}»: выбрать характеристику +1`);
      else if (!feat.asi.includes(pick.asi)) issue(`${spec.name}: черта «${feat.nameRu}» не поднимает ${pick.asi.toUpperCase()}`);
      else {
        scores[pick.asi] += 1;
        if (scores[pick.asi] > ABILITY_SCORE_CAP) { issue(`${spec.name}: ${pick.asi} выше ${ABILITY_SCORE_CAP} через черту`); scores[pick.asi] = ABILITY_SCORE_CAP; }
      }
    } else if (pick.asi) issue(`${spec.name}: черта «${feat.nameRu}» характеристик не поднимает`);
  }
  for (const imp of spec.improvements) {
    if (!srdClass.asiLevels.includes(imp.level)) { issue(`${spec.name}: ${srdClass.name} не даёт увеличение на уровне ${imp.level}`); continue; }
    if (imp.level > spec.level) { issue(`${spec.name}: увеличение на уровне ${imp.level} выше уровня ${spec.level}`); continue; }
    const values = Object.values(imp.asi);
    const total = values.reduce((s, v) => s + v, 0);
    if (total !== 2 || values.some(v => v !== 1 && v !== 2)) {
      issue(total < 2 && values.every(v => v === 1)
        ? `увеличение на ${imp.level}-м уровне не распределено`
        : `${spec.name}: увеличение на уровне ${imp.level} — +2 к одной или +1 к двум, получено ${JSON.stringify(imp.asi)}`);
    }
    addAsi(scores, imp.asi, `${spec.name}, уровень ${imp.level}`);
    for (const ab of ABILITY_IDS) if (scores[ab] > ABILITY_SCORE_CAP) { issue(`${spec.name}: ${ab} выше ${ABILITY_SCORE_CAP} через увеличение`); scores[ab] = ABILITY_SCORE_CAP; }
  }
  const missed = srdClass.asiLevels.filter(l => l <= spec.level && !spec.improvements.some(i => i.level === l) && !(spec.feats ?? []).some(f => f.at === l));
  if (missed.length) issue(`${spec.name}: не выбрано увеличение на уровне ${missed.join(', ')}`);
  return scores;
}

/** Класс SRD для записи компендиума — по английскому имени; для классов из книг (Изобретатель) его нет. */
export function srdClassOf(cls: CharacterClass): SrdClass {
  const id = cls.name.toLowerCase();
  if (!isSrdClassId(id)) throw new DeriveError(`класс ${cls.name} не из SRD: нет кости хитов`);
  return SRD_CLASSES[id];
}

const traitsOf = (race: Race, subrace?: Subrace): Trait[] => [...race.traits, ...(subrace?.traits ?? [])];

/** Все производные разом. Бросает DeriveError на всё, чего нет в компендиуме или что противоречит SRD. */
export function deriveCharacter(spec: PcSpec): DerivedCharacter {
  return deriveWith(spec, strict);
}

/**
 * Мягкий вывод для редактора: лист считается и показывается, пока выборы не сделаны; всё несходящееся — в issues
 * («выбрать ещё 2 навыка класса»). Бросает только на то, чего нет вовсе (раса, класс, подкласс не из компендиума).
 */
export function deriveDraft(spec: PcSpec): { derived: DerivedCharacter; issues: string[] } {
  const issues: string[] = [];
  const derived = deriveWith(spec, m => { if (!issues.includes(m)) issues.push(m); });
  return { derived, issues };
}

const plural = (n: number, forms: readonly [string, string, string]) => {
  const m10 = n % 10, m100 = n % 100;
  return forms[m10 === 1 && m100 !== 11 ? 0 : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 1 : 2];
};

function deriveWith(spec: PcSpec, issue: Issue): DerivedCharacter {
  const race = raceById(spec.raceId);
  if (!race) throw new DeriveError(`${spec.name}: нет расы ${spec.raceId}`);
  const subrace = spec.subraceId ? race.subraces.find(s => s.id === spec.subraceId) : undefined;
  if (spec.subraceId && !subrace) throw new DeriveError(`${spec.name}: у расы ${race.name} нет подрасы ${spec.subraceId}`);
  // Подрасы того же источника, что раса, — обязательный выбор (SRD: «choose one of these subraces»); книжные
  // подрасы у SRD-расы (человек) — опция. Без этого race.asi у эльфа — просто строка первой подрасы в таблице.
  if (!subrace && race.subraces.some(s => s.source === race.source)) issue(`${spec.name}: у расы ${race.name} нужно выбрать подрасу`);
  const cls = classById(spec.classId);
  if (!cls) throw new DeriveError(`${spec.name}: нет класса ${spec.classId}`);
  const srdClass = srdClassOf(cls);
  const subclass = spec.subclassId ? cls.subclasses.find(x => x.id === spec.subclassId) : undefined;
  if (spec.subclassId && !subclass) throw new DeriveError(`${spec.name}: у класса ${cls.name} нет подкласса ${spec.subclassId}`);
  if (subclass && subclass.gainedAt !== null && subclass.gainedAt > spec.level) issue(`${spec.name}: ${subclass.name} — с ${subclass.gainedAt}-го уровня, а уровень ${spec.level}`);
  const background = spec.backgroundId ? backgroundById(spec.backgroundId) : undefined;
  if (spec.backgroundId && !background) throw new DeriveError(`${spec.name}: нет предыстории ${spec.backgroundId}`);

  const abilities = abilityScores(spec, race, subrace, srdClass, issue);
  const mods = Object.fromEntries(ABILITY_IDS.map(ab => [ab, abilityMod(abilities[ab])])) as Record<AbilityId, number>;
  const proficiencyBonus = proficiencyBonusOf(cls, spec.level);
  const notes: string[] = [];

  const traits = traitsOf(race, subrace);
  const effects = traits.map(t => TRAIT_EFFECTS[t.id]).filter((e): e is NonNullable<typeof e> => Boolean(e));
  const draconic = subclass?.id === DRACONIC_SUBCLASS && (subclass.gainedAt ?? 1) <= spec.level;
  const hpPerLevel = effects.reduce((s, e) => s + (e.hpPerLevel ?? 0), 0) + (draconic ? 1 : 0);

  const choices = classSkillChoices(cls);
  if (spec.skills.length !== choices.count) {
    const left = choices.count - spec.skills.length;
    issue(left > 0 ? `выбрать ещё ${left} ${plural(left, ['навык', 'навыка', 'навыков'])} класса` : `${spec.name}: ${cls.name} даёт ${choices.count} навыка, выбрано ${spec.skills.length}`);
  }
  for (const s of spec.skills) {
    if (!SKILL_IDS.includes(s)) issue(`${spec.name}: нет навыка ${s}`);
    else if (choices.options && !choices.options.includes(s)) issue(`${spec.name}: ${cls.name} не предлагает ${SKILLS[s].name}`);
  }
  const tracked = spec.choices !== undefined;
  const chosenOf = (id: string) => spec.choices?.[id] ?? [];
  const raceChoice = raceSkillChoice(effects.reduce((s, e) => s + (e.skillChoice ?? 0), 0));
  const raceSkills = (raceChoice && tracked ? chosenOf('race-skills') : []).filter((s): s is SkillId => SKILL_IDS.includes(s as SkillId));
  const skills = [...new Set([...spec.skills, ...(background?.skills ?? []), ...effects.flatMap(e => e.skills ?? []), ...raceSkills])];

  // Выборы умений: что даёт уровень (build.ts) против того, что выбрано. Лист из сида без поля choices — не проверяется.
  const cantripFrom = effects.find(e => e.cantripFrom)?.cantripFrom;
  const featureChoices = [
    ...(raceChoice ? [raceChoice] : []),
    ...(cantripFrom ? [raceCantripChoice(cantripFrom)] : []),
    ...classChoicesOf(cls, spec.level, subclass?.id, skills),
  ];
  const chosen: ChosenFeature[] = [];
  if (tracked) {
    for (const fc of featureChoices) {
      const picked = chosenOf(fc.id);
      const known = picked.filter(id => fc.options.some(o => o.id === id));
      for (const id of picked) if (!known.includes(id)) issue(`${spec.name}: в «${fc.label}» нет варианта ${id}`);
      if (new Set(known).size !== known.length) issue(`${spec.name}: в «${fc.label}» вариант выбран дважды`);
      if (known.length < fc.count) issue(`выбрать: ${fc.label}${fc.count > 1 ? ` (ещё ${fc.count - known.length})` : ''}`);
      if (known.length > fc.count) issue(`${spec.name}: «${fc.label}» — ${fc.count}, выбрано ${known.length}`);
      if (known.length) chosen.push({ id: fc.id, label: fc.label, values: known.map(id => {
        const option = fc.options.find(o => o.id === id)!;
        return { id, name: option.name, source: option.source, ...(option.source === 'srd' ? { ruleset: { id: 'dnd5e', version: 'SRD 5.1', layer: 'srd' } } : {}) };
      }) });
    }
    for (const id of Object.keys(spec.choices!)) if ((spec.choices![id]?.length ?? 0) > 0 && !featureChoices.some(fc => fc.id === id)) issue(`${spec.name}: выбор «${id}» на этом уровне не даётся`);
  }
  const expertise = tracked ? [...chosenOf('expertise')] : [];
  const style = tracked ? chosenOf('fighting-style')[0] : undefined;

  const armorProf = new Set(classArmorProficiency(cls));
  if (subclass?.id === LIFE_DOMAIN) armorProf.add('heavy');
  if (spec.armor && !armorProf.has(ARMOR[spec.armor].category)) issue(`${spec.name}: ${cls.name} не владеет доспехом ${ARMOR[spec.armor].name}`);
  if (spec.shield && !armorProf.has('shield')) issue(`${spec.name}: ${cls.name} не владеет щитом`);
  if (spec.equipment) {
    for (const line of spec.equipment) if (!ITEMS[line.id]) issue(`${spec.name}: нет предмета ${line.id}`);
    if (spec.armor && !spec.equipment.some(l => armorIdOfItem(l.id) === spec.armor)) issue(`${spec.name}: ${ARMOR[spec.armor].name} нет в снаряжении`);
    if (spec.shield && !spec.equipment.some(l => l.id === 'shield')) issue(`${spec.name}: щита нет в снаряжении`);
  }
  if (spec.mageArmor && spec.armor) issue('Mage Armor и доспех вместе не бывают: заклинание кончается, когда цель надевает доспех');
  // SRD, Armor table: «the armor reduces the wearer's speed by 10 feet unless the wearer has a Strength score equal to
  // or higher than the listed score» — надеть можно, но скорость меньше.
  const strNeed = spec.armor ? ARMOR[spec.armor].strength : null;
  let speed = srdRaceSpeed(race.name);
  if (strNeed !== null && abilities.str < strNeed) {
    // SRD, Dwarf: «Your speed is not reduced by wearing heavy armor».
    if (race.name === 'Dwarf') notes.push(`${ARMOR[spec.armor!].name} требует STR ${strNeed}, есть ${abilities.str}: дварфа тяжёлый доспех не замедляет`);
    else {
      notes.push(`${ARMOR[spec.armor!].name} требует STR ${strNeed}, есть ${abilities.str}: скорость на 10 футов меньше`);
      if (speed !== undefined) speed -= 10;
    }
  }

  // AC: доспех по категории; без доспеха — лучшая из формул (10 + DEX, Mage Armor, защита без доспехов, драконья устойчивость).
  const unarmored = UNARMORED_DEFENSE[srdClass.id];
  let ac: number;
  if (spec.armor) ac = armorClass(mods.dex, { armor: spec.armor, shield: spec.shield });
  else {
    const bases = [10 + mods.dex];
    if (spec.mageArmor) bases.push(13 + mods.dex);
    if (unarmored && !(unarmored.noShield && spec.shield)) bases.push(10 + mods.dex + mods[unarmored.ability]);
    if (draconic) bases.push(13 + mods.dex);
    ac = Math.max(...bases) + (spec.shield ? SHIELD.acBonus : 0);
  }
  if (style === DEFENSE_STYLE && spec.armor) ac += 1;

  const features = [
    ...cls.levels.filter(l => l.level <= spec.level).flatMap(l => l.features.map(f => ({ id: f.id, name: f.name, level: l.level }))),
    ...(subclass?.features ?? []).filter(f => f.level <= spec.level).map(f => ({ id: f.id, name: f.name, level: f.level })),
  ].sort((a, b) => a.level - b.level);

  const srdId = srdIdOf(cls);
  // Заклинания: что даёт класс на уровне листа против выбранного. Лист из сида без поля spells — не проверяется.
  let spellcasting: SheetSpellcasting | undefined;
  const plan = spellcastingOf(cls, spec.level, subclass?.id, mods);
  if (plan.kind === 'plan') {
    const picked = spec.spells ?? [];
    const cantrips = picked.filter(id => SPELLS[id]?.level === 0);
    const leveled = picked.filter(id => (SPELLS[id]?.level ?? 0) > 0);
    if (spec.spells) {
      for (const id of picked) {
        if (!SPELLS[id]) issue(`${spec.name}: нет заклинания ${id}`);
        else if (!plan.options.some(o => o.id === id)) issue(`${spec.name}: ${SPELLS[id].name} нет в списке класса до ${plan.maxLevel}-го круга`);
        else if (plan.always.includes(id)) issue(`${spec.name}: ${SPELLS[id].name} и так всегда подготовлено`);
      }
      const leftC = plan.cantrips - cantrips.length;
      if (leftC > 0) issue(`выбрать ещё ${leftC} ${plural(leftC, ['заговор', 'заговора', 'заговоров'])}`);
      if (leftC < 0) issue(`${spec.name}: заговоров ${cantrips.length}, класс даёт ${plan.cantrips}`);
      const leftL = plan.leveled - leveled.length;
      const what = plan.leveledKind === 'spellbook' ? 'в книгу' : plan.leveledKind === 'prepared' ? 'подготовить' : 'выучить';
      if (leftL > 0) issue(`заклинания ${what}: ещё ${leftL}`);
      if (leftL < 0) issue(`${spec.name}: заклинаний ${leveled.length}, класс даёт ${plan.leveled}`);
    }
    const ab = plan.ability;
    spellcasting = {
      ability: ab, saveDc: 8 + proficiencyBonus + mods[ab], attack: proficiencyBonus + mods[ab], kind: plan.leveledKind, maxLevel: plan.maxLevel,
      cantrips, spells: leveled, always: plan.always,
      ...(plan.leveledKind === 'prepared' ? { preparedLimit: plan.leveled } : {}),
    };
  } else if (spec.spells?.length) issue(`${spec.name}: ${cls.nameRu} на ${spec.level}-м уровне заклинаний из SRD не даёт`);

  // Черты: что даёт раса, требования таблицы (порог характеристики, уровень, владение, заклинания).
  const raceFeats = effects.reduce((s, e) => s + (e.featChoice ?? 0), 0);
  const picks = spec.feats ?? [];
  const racePicks = picks.filter(p => p.at === 'race');
  if (racePicks.length > raceFeats) issue(`${spec.name}: раса ${race.name} черт не даёт`);
  if (spec.feats !== undefined && racePicks.length < raceFeats) issue('выбрать черту расы');
  const feats: { id: string; name: string; at: 'race' | number; asi?: AbilityId }[] = [];
  for (const p of picks) {
    const feat = p.id ? featById(p.id) : undefined;
    if (!feat) continue;
    const why = featBlocked(feat, { abilities, level: spec.level, armorProf, martial: srdId ? classWeaponMartial(srdId) : false, casts: plan.kind === 'plan', cantrips: plan.kind === 'plan' && plan.cantrips > 0 });
    if (why) issue(`черта «${feat.nameRu}»: ${why}`);
    feats.push({ id: feat.id, name: feat.nameRu, at: p.at, ...(p.asi ? { asi: p.asi } : {}) });
  }

  const equipment = [...(spec.equipment ?? [])];
  const attacks = attacksOf(equipment, {
    mods, proficiencyBonus, srdClass: srdId, extraWeapons: effects.flatMap(e => e.weapons ?? []), archery: style === ARCHERY_STYLE,
    small: srdRaceSize(race.name) === 'Small',
  });

  return {
    race, subrace, cls, srdClass, abilities, mods, proficiencyBonus,
    hpMax: maxHp(srdClass.hitDie, spec.level, mods.con, hpPerLevel),
    ac,
    passivePerception: passivePerception(mods.wis, skills.includes('perception'), proficiencyBonus) + (expertise.includes('perception') ? proficiencyBonus : 0),
    skills,
    features,
    traits: traits.map(t => ({ id: t.id, name: t.name })),
    speed,
    asiChoice: (subrace ?? race).asiChoice ?? (subrace ? undefined : race.asiChoice),
    featureChoices, chosen, expertise, spellcasting, equipment, attacks, notes, feats, raceFeats,
  };
}

const classWeaponMartial = (id: string) => CLASS_START[id as keyof typeof CLASS_START]?.weapons.categories.includes('martial') ?? false;

/** Почему черта недоступна — словами; доступна — null. Требования — из таблицы владельца (колонки и строка «Требование»). */
export function featBlocked(feat: Feat, ctx: { abilities: AbilityScores; level: number; armorProf: ReadonlySet<string>; martial: boolean; casts: boolean; cantrips: boolean }): string | null {
  const pre = feat.prerequisites;
  if (pre.abilities.length && !pre.abilities.some(ab => ctx.abilities[ab] >= 13)) return `нужно 13+ в ${pre.abilities.map(ab => ab.toUpperCase()).join(' или ')}`;
  if (pre.minScore && !Object.entries(pre.minScore).some(([ab, n]) => ctx.abilities[ab as AbilityId] >= (n ?? 0))) return `нужно ${Object.entries(pre.minScore).map(([ab, n]) => `${ab.toUpperCase()} ${n}`).join(' или ')}`;
  if (pre.level && ctx.level < pre.level) return `с ${pre.level}-го уровня`;
  if (pre.armor && !ctx.armorProf.has(pre.armor)) return `нужно владение ${pre.armor === 'light' ? 'лёгкими' : pre.armor === 'medium' ? 'средними' : 'тяжёлыми'} доспехами`;
  if (pre.weapons === 'martial' && !ctx.martial) return 'нужно владение воинским оружием';
  if (pre.cantrip && !ctx.cantrips) return 'нужен хотя бы один заговор';
  if (pre.spellcasting && !ctx.casts) return 'нужно уметь накладывать заклинания';
  return null;
}
