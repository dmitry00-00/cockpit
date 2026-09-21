// Производные персонажа по SRD: характеристики → модификаторы → хиты, AC, пассивное внимание.
// Чистые функции без стора. Числа §13 отсюда ВЫВОДЯТСЯ, а не вбиваются: если формула или компендиум
// изменятся, seed.test.ts упадёт — это и есть контроль.
import { ABILITY_IDS, SKILL_IDS, SKILLS, type AbilityId, type SkillId } from '../rules/srd/abilities';
import { ARMOR, MAGE_ARMOR, MEDIUM_ARMOR_DEX_CAP, SHIELD, type ArmorCategory, type ArmorId } from '../rules/srd/armor';
import { ABILITY_SCORE_CAP, SRD_CLASSES, isSrdClassId, type SrdClass } from '../rules/srd/classes';
import { srdRaceSpeed } from '../rules/srd/races';
import { classById, raceById, type Asi, type CharacterClass, type Race, type Subrace, type Trait } from '../rules/compendium';

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
  raceId: string;
  subraceId?: string;
  classId: string;
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
  bio?: { height?: string; weight?: string; age?: number };
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
  /** Скорость ходьбы по расе SRD; раса вне SRD — undefined. */
  speed?: number;
}

/**
 * Механика расовых черт, которую компендиум пока держит прозой (схема обещает типизированные Effect вторым
 * проходом). Ключ — id черты в content/compendium/races.json; derive.test.ts проверяет, что каждый ключ там есть.
 */
export const TRAIT_EFFECTS: Readonly<Record<string, { hpPerLevel?: number; skills?: readonly SkillId[] }>> = {
  /** Dwarven Toughness (Hill Dwarf): +1 хит за уровень. */
  'dvarfskaa-vyderjka': { hpPerLevel: 1 },
  /** Keen Senses (Elf): владение Внимательностью. */
  'obostrennye-cuvstva': { skills: ['perception'] },
};

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
export function abilityScores(spec: PcSpec, race: Race, subrace: Subrace | undefined, srdClass: SrdClass): AbilityScores {
  const scores = { ...spec.base } as Record<AbilityId, number>;
  for (const ab of ABILITY_IDS) if (!Number.isInteger(scores[ab])) throw new DeriveError(`${spec.name}: нет базовой характеристики ${ab}`);
  const racial = subrace ? subrace.asi : race.asi;
  if (!racial) throw new DeriveError(`${spec.name}: у расы ${race.name} нет бонусов без подрасы`);
  addAsi(scores, racial, `${spec.name}, раса`);
  for (const imp of spec.improvements) {
    if (!srdClass.asiLevels.includes(imp.level)) throw new DeriveError(`${spec.name}: ${srdClass.name} не даёт увеличение на уровне ${imp.level}`);
    if (imp.level > spec.level) throw new DeriveError(`${spec.name}: увеличение на уровне ${imp.level} выше уровня ${spec.level}`);
    const values = Object.values(imp.asi);
    const total = values.reduce((s, v) => s + v, 0);
    if (total !== 2 || values.some(v => v !== 1 && v !== 2)) throw new DeriveError(`${spec.name}: увеличение на уровне ${imp.level} — +2 к одной или +1 к двум, получено ${JSON.stringify(imp.asi)}`);
    addAsi(scores, imp.asi, `${spec.name}, уровень ${imp.level}`);
    for (const ab of ABILITY_IDS) if (scores[ab] > ABILITY_SCORE_CAP) throw new DeriveError(`${spec.name}: ${ab} выше ${ABILITY_SCORE_CAP} через увеличение`);
  }
  const missed = srdClass.asiLevels.filter(l => l <= spec.level && !spec.improvements.some(i => i.level === l));
  if (missed.length) throw new DeriveError(`${spec.name}: не выбрано увеличение на уровне ${missed.join(', ')}`);
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
  const race = raceById(spec.raceId);
  if (!race) throw new DeriveError(`${spec.name}: нет расы ${spec.raceId}`);
  const subrace = spec.subraceId ? race.subraces.find(s => s.id === spec.subraceId) : undefined;
  if (spec.subraceId && !subrace) throw new DeriveError(`${spec.name}: у расы ${race.name} нет подрасы ${spec.subraceId}`);
  // Подрасы того же источника, что раса, — обязательный выбор (SRD: «choose one of these subraces»); книжные
  // подрасы у SRD-расы (человек) — опция. Без этого race.asi у эльфа — просто строка первой подрасы в таблице.
  if (!subrace && race.subraces.some(s => s.source === race.source)) throw new DeriveError(`${spec.name}: у расы ${race.name} нужно выбрать подрасу`);
  const cls = classById(spec.classId);
  if (!cls) throw new DeriveError(`${spec.name}: нет класса ${spec.classId}`);
  const srdClass = srdClassOf(cls);

  const abilities = abilityScores(spec, race, subrace, srdClass);
  const mods = Object.fromEntries(ABILITY_IDS.map(ab => [ab, abilityMod(abilities[ab])])) as Record<AbilityId, number>;
  const proficiencyBonus = proficiencyBonusOf(cls, spec.level);

  const traits = traitsOf(race, subrace);
  const effects = traits.map(t => TRAIT_EFFECTS[t.id]).filter((e): e is NonNullable<typeof e> => Boolean(e));
  const hpPerLevel = effects.reduce((s, e) => s + (e.hpPerLevel ?? 0), 0);

  const choices = classSkillChoices(cls);
  if (spec.skills.length !== choices.count) throw new DeriveError(`${spec.name}: ${cls.name} даёт ${choices.count} навыка, выбрано ${spec.skills.length}`);
  for (const s of spec.skills) {
    if (!SKILL_IDS.includes(s)) throw new DeriveError(`${spec.name}: нет навыка ${s}`);
    if (choices.options && !choices.options.includes(s)) throw new DeriveError(`${spec.name}: ${cls.name} не предлагает ${SKILLS[s].name}`);
  }
  const skills = [...new Set([...spec.skills, ...effects.flatMap(e => e.skills ?? [])])];

  const armorProf = classArmorProficiency(cls);
  if (spec.armor && !armorProf.has(ARMOR[spec.armor].category)) throw new DeriveError(`${spec.name}: ${cls.name} не владеет доспехом ${ARMOR[spec.armor].name}`);
  if (spec.shield && !armorProf.has('shield')) throw new DeriveError(`${spec.name}: ${cls.name} не владеет щитом`);
  const strNeed = spec.armor ? ARMOR[spec.armor].strength : null;
  if (strNeed !== null && abilities.str < strNeed) throw new DeriveError(`${spec.name}: ${ARMOR[spec.armor!].name} требует STR ${strNeed}, есть ${abilities.str}`);

  const features = cls.levels
    .filter(l => l.level <= spec.level)
    .flatMap(l => l.features.map(f => ({ id: f.id, name: f.name, level: l.level })));

  return {
    race, subrace, cls, srdClass, abilities, mods, proficiencyBonus,
    hpMax: maxHp(srdClass.hitDie, spec.level, mods.con, hpPerLevel),
    ac: armorClass(mods.dex, { armor: spec.armor, shield: spec.shield, mageArmor: spec.mageArmor }),
    passivePerception: passivePerception(mods.wis, skills.includes('perception'), proficiencyBonus),
    skills,
    features,
    traits: traits.map(t => ({ id: t.id, name: t.name })),
    speed: srdRaceSpeed(race.name),
  };
}
