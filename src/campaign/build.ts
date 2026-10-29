// Сборка персонажа: что раса и класс дают выбрать на уровне листа — из таблиц владельца (компендиум) и из SRD.
// Чистые функции без стора; их читают derive.ts (проверка листа) и редактор (что предложить и сколько осталось).
//
// Откуда что берётся:
//   • выборы умений класса — списки под таблицами владельца (боевой стиль, метамагия; content/compendium, блоки
//     options) и SRD (избранный враг, местность, предок дракона; content/srd/equipment.json), компетентность — правило SRD;
//   • заклинания — списки классов SRD (content/srd/spells.json), число заговоров и известных — SRD по уровням,
//     подготовленные — формула SRD, предельный круг — строка таблицы класса в компендиуме (колонки ячеек);
//   • снаряжение — стартовые наборы SRD с выборами (a)/(b)/(c).
// У классов и подклассов из книг (Изобретатель, Мистический рыцарь…) списков заклинаний и наборов в SRD нет —
// функции честно возвращают «нет данных», а не придумывают.
import type { AbilityId, SkillId } from '../rules/srd/abilities';
import { SKILL_IDS } from '../rules/srd/abilities';
import { isSrdClassId, type SrdClassId } from '../rules/srd/classes';
import {
  CHOICE_FEATURES, CLASS_START, ITEMS, classWeaponProficient, type ClassStart, type Item, type KitPart,
} from '../rules/srd/equipment';
import { SPELLS, SRD_SUBCLASS_SPELLS, classSpellList, type Spell } from '../rules/srd/spells';
import type { CharacterClass, ClassLevel, Source } from '../rules/compendium';

const normKey = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, '');

/** Класс компендиума → id класса SRD по английскому имени; у книжных классов — undefined. */
export function srdIdOf(cls: CharacterClass): SrdClassId | undefined {
  const id = cls.name.toLowerCase();
  return isSrdClassId(id) ? id : undefined;
}

/* ---------- Выборы умений класса и расы ---------- */

export interface ChoiceOption {
  id: string;
  name: string;
  text?: string;
  source: Source;
}

export interface FeatureChoice {
  /** Ключ выбора в PcSpec.choices: 'fighting-style', 'favored-enemy', 'terrain', 'dragon-ancestor', 'metamagic', 'expertise', 'race-skills'. */
  id: string;
  label: string;
  /** Сколько выбрать на уровне листа (с ростом уровня — больше: избранный враг на 6 и 14). */
  count: number;
  options: ChoiceOption[];
  /** Уровень, с которого выбор появляется. */
  level: number;
  /** Пояснение: текст SRD дословно или абзац таблицы. */
  text?: string;
  /** Варианты — навыки: подписи даёт слой вида. */
  skills?: boolean;
}

/** Рост числа выборов по уровню: [[1, 1], [6, 1], [14, 1]] → сколько всего на уровне level. */
const countAt = (steps: readonly (readonly [number, number])[], level: number) => steps.reduce((s, [l, n]) => (l <= level ? s + n : s), 0);

/** Когда класс SRD получает боевой стиль (SRD 5.1: Fighter 1st, Paladin 2nd, Ranger 2nd). */
const FIGHTING_STYLE_LEVEL: Partial<Record<SrdClassId, number>> = { fighter: 1, paladin: 2, ranger: 2 };
/** Метамагия чародея: два варианта на 3-м, ещё по одному на 10-м и 17-м (SRD 5.1, Sorcerer: Metamagic). */
const METAMAGIC_STEPS = [[3, 2], [10, 1], [17, 1]] as const;
/** Избранный враг — 1-й, 6-й, 14-й; местность — 1-й, 6-й, 10-й (SRD 5.1, Ranger). */
const FAVORED_ENEMY_STEPS = [[1, 1], [6, 1], [14, 1]] as const;
const TERRAIN_STEPS = [[1, 1], [6, 1], [10, 1]] as const;
/** Компетентность: плут — 2 на 1-м и 2 на 6-м, бард — 2 на 3-м и 2 на 10-м (SRD 5.1, Expertise). */
const EXPERTISE_STEPS: Partial<Record<SrdClassId, readonly (readonly [number, number])[]>> = { rogue: [[1, 2], [6, 2]], bard: [[3, 2], [10, 2]] };
/** Подкласс SRD с выбором предка дракона. */
const DRACONIC_SUBCLASS = 'carodey-nasledie-drakon-ey-krovi';

/** Подписи вариантов SRD по-русски: типы существ, местности, цвета драконов. */
export const ENEMY_LABEL: Readonly<Record<string, string>> = {
  aberrations: 'аберрации', beasts: 'звери', celestials: 'небожители', constructs: 'конструкты', dragons: 'драконы',
  elementals: 'элементали', fey: 'феи', fiends: 'исчадия', giants: 'великаны', monstrosities: 'монстры', oozes: 'слизи',
  plants: 'растения', undead: 'нежить', humanoids: 'гуманоиды (два вида)',
};
export const TERRAIN_LABEL: Readonly<Record<string, string>> = {
  arctic: 'арктика', coast: 'побережье', desert: 'пустыня', forest: 'лес', grassland: 'луга', mountain: 'горы', swamp: 'болото',
};
const DRAGON_COLOR: Readonly<Record<string, string>> = {
  black: 'чёрный', blue: 'синий', brass: 'латунный', bronze: 'бронзовый', copper: 'медный', gold: 'золотой', green: 'зелёный',
  red: 'красный', silver: 'серебряный', white: 'белый',
};
const DRAGON_DAMAGE: Readonly<Record<string, string>> = { acid: 'кислота', lightning: 'электричество', fire: 'огонь', poison: 'яд', cold: 'холод' };

function srdChoice(featureId: string, label: (id: string, name: string) => string): { options: ChoiceOption[]; text: string } {
  const f = CHOICE_FEATURES[featureId];
  return { text: f.text, options: f.options.map(o => ({ id: o.id, name: label(o.id, o.name), text: o.text, source: 'srd' as const })) };
}

/** Блок вариантов из таблицы владельца по имени («Боевой стиль», «Метамагия»). */
function tableBlock(cls: CharacterClass, name: string) {
  return cls.options?.find(b => normKey(b.name) === normKey(name) && !b.subclassId);
}

/**
 * Выборы умений класса на уровне листа. proficient — навыки, которыми персонаж уже владеет (для компетентности);
 * thievesTools — владеет ли воровскими инструментами (у плута — да).
 */
export function classChoicesOf(cls: CharacterClass, level: number, subclassId: string | undefined, proficient: readonly SkillId[]): FeatureChoice[] {
  const srd = srdIdOf(cls);
  if (!srd) return [];
  const out: FeatureChoice[] = [];
  const style = FIGHTING_STYLE_LEVEL[srd];
  const styles = tableBlock(cls, 'Боевой стиль');
  if (style !== undefined && level >= style && styles) {
    out.push({ id: 'fighting-style', label: 'Боевой стиль', count: 1, level: style, text: styles.text || undefined, options: styles.items.map(i => ({ id: i.id, name: i.name, text: i.text, source: i.source })) });
  }
  if (srd === 'ranger') {
    const enemy = srdChoice('favored-enemy-1-type', id => ENEMY_LABEL[id] ?? id);
    out.push({ id: 'favored-enemy', label: 'Избранный враг', count: countAt(FAVORED_ENEMY_STEPS, level), level: 1, ...enemy });
    const terrain = srdChoice('natural-explorer-1-terrain-type', id => TERRAIN_LABEL[id] ?? id);
    out.push({ id: 'terrain', label: 'Исследователь природы · местность', count: countAt(TERRAIN_STEPS, level), level: 1, ...terrain });
  }
  if (srd === 'sorcerer' && level >= 3) {
    const meta = tableBlock(cls, 'Метамагия');
    if (meta) out.push({ id: 'metamagic', label: 'Метамагия', count: countAt(METAMAGIC_STEPS, level), level: 3, options: meta.items.map(i => ({ id: i.id, name: i.name, text: i.text, source: i.source })) });
  }
  if (subclassId === DRACONIC_SUBCLASS) {
    const anc = srdChoice('dragon-ancestor', (_id, name) => {
      const [color, dmg] = name.toLowerCase().split(/\s+-\s+/);
      return `${DRAGON_COLOR[color] ?? color} · ${DRAGON_DAMAGE[dmg.replace(/\s*damage$/, '')] ?? dmg}`;
    });
    out.push({ id: 'dragon-ancestor', label: 'Предок дракона', count: 1, level: 1, ...anc });
  }
  const exp = EXPERTISE_STEPS[srd];
  const expCount = exp ? countAt(exp, level) : 0;
  if (expCount > 0) {
    const options: ChoiceOption[] = proficient.map(id => ({ id, name: id, source: 'srd' as const }));
    if (srd === 'rogue') options.push({ id: 'thieves-tools', name: "Thieves' tools", source: 'srd' });
    out.push({ id: 'expertise', label: 'Компетентность', count: expCount, level: exp![0][0], options, skills: true });
  }
  return out;
}

/** Выбор навыков расы («Владение двумя навыками на выбор» у полуэльфа) — из черт с числом навыков. */
export function raceSkillChoice(count: number): FeatureChoice | null {
  if (count <= 0) return null;
  return { id: 'race-skills', label: 'Навыки расы', count, level: 1, skills: true, options: SKILL_IDS.map(id => ({ id, name: id, source: 'srd' as const })) };
}

/** Заговор расы (SRD: High Elf — «one cantrip of your choice from the wizard spell list»): варианты — заговоры класса SRD. */
export function raceCantripChoice(from: SrdClassId): FeatureChoice {
  return {
    id: 'race-cantrip', label: 'Заговор расы', count: 1, level: 1,
    options: classSpellList(from, 0).map(s => ({ id: s.id, name: s.name, text: s.text, source: 'srd' as const })),
  };
}

/* ---------- Заклинания ---------- */

export type SpellListKind = 'known' | 'prepared' | 'spellbook';

export interface SpellPlan {
  kind: 'plan';
  classId: SrdClassId;
  ability: AbilityId;
  /** Сколько заговоров выбрать. */
  cantrips: number;
  /** Сколько заклинаний 1-го круга и выше: известных, подготовленных или в книге. */
  leveled: number;
  leveledKind: SpellListKind;
  /** Старший круг, ячейки которого есть на уровне листа. */
  maxLevel: number;
  /** Из чего выбирать: список класса до maxLevel (+ расширенный список покровителя). */
  options: Spell[];
  /** Всегда подготовлены и не считаются (заклинания домена, клятвы). */
  always: string[];
  /** Заклинания подкласса из таблицы владельца, не связанные с SRD: только имена. */
  tableOnly?: { level: number; name: string }[];
}

export type SpellcastingOf =
  | { kind: 'none' }
  | { kind: 'nodata'; reason: string; tableOnly?: { level: number; name: string }[] }
  | SpellPlan;

/** Подкласс компендиума (SRD) → индекс подкласса в SRD API для заклинаний подкласса. */
const SUBCLASS_SPELL_INDEX: Readonly<Record<string, string>> = {
  'jrec-jizni': 'life', 'paladin-predannosti': 'devotion', 'druid-zemli': 'land', 'koldun-iscadie': 'fiend',
};
/** Покровитель колдуна даёт не «всегда подготовленные», а расширенный список выбора (SRD 5.1, Expanded Spell List). */
const EXPANDED_LIST = new Set(['fiend']);

const KIND_OF: Readonly<Record<SrdClassId, SpellListKind | null>> = {
  bard: 'known', sorcerer: 'known', warlock: 'known', ranger: 'known', wizard: 'spellbook', cleric: 'prepared', druid: 'prepared', paladin: 'prepared',
  barbarian: null, fighter: null, monk: null, rogue: null,
};

/** Старший круг ячеек в строке таблицы класса: колонки «1»…«9», у колдуна — «Уровень ячеек». */
export function maxSlotLevel(row: ClassLevel | undefined): number {
  if (!row) return 0;
  const pact = Number(row.resources['Уровень ячеек']);
  if (Number.isInteger(pact) && pact > 0) return pact;
  let max = 0;
  for (let n = 1; n <= 9; n++) if (/^\d+$/.test(row.resources[String(n)] ?? '') && Number(row.resources[String(n)]) > 0) max = n;
  return max;
}

/** Что класс даёт по заклинаниям на уровне листа. mods — итоговые модификаторы (подготовленные зависят от них). */
export function spellcastingOf(cls: CharacterClass, level: number, subclassId: string | undefined, mods: Readonly<Record<AbilityId, number>>): SpellcastingOf {
  const sub = cls.subclasses.find(s => s.id === subclassId);
  const tableOnly = sub?.spells?.length && sub.source !== 'srd'
    ? sub.spells.filter(s => (sub.spellLevel === 'spell' ? s.level <= maxSlotLevel(cls.levels.find(l => l.level === level)) : s.level <= level))
    : undefined;
  const srd = srdIdOf(cls);
  const row = cls.levels.find(l => l.level === level);
  if (!srd) {
    return maxSlotLevel(row) > 0
      ? { kind: 'nodata', reason: `у класса ${cls.nameRu} нет списка заклинаний в SRD — в таблицах только ячейки`, tableOnly }
      : { kind: 'none' };
  }
  const start: ClassStart = CLASS_START[srd];
  const kind = KIND_OF[srd];
  if (!kind || !start.spellcasting || level < start.spellcasting.level) {
    return tableOnly?.length ? { kind: 'nodata', reason: `заклинания подкласса ${sub!.name} — из книги, списка SRD нет`, tableOnly } : { kind: 'none' };
  }
  const ability = start.spellcasting.ability;
  const counts = start.spellsByLevel?.[String(level)] ?? {};
  const maxLevel = maxSlotLevel(row);
  const leveled = kind === 'known' ? counts.known ?? 0
    : kind === 'spellbook' ? 6 + 2 * (level - 1)
      : Math.max(1, mods[ability] + (srd === 'paladin' ? Math.floor(level / 2) : level));
  const options = classSpellList(srd, maxLevel);
  const always: string[] = [];
  const apiSub = subclassId ? SUBCLASS_SPELL_INDEX[subclassId] : undefined;
  if (apiSub && apiSub !== 'land') {
    const list = SRD_SUBCLASS_SPELLS[apiSub].spells.filter(s => s.classLevel <= level).map(s => SPELLS[s.id]).filter(s => s.level <= maxLevel);
    if (EXPANDED_LIST.has(apiSub)) {
      for (const s of list) if (!options.some(o => o.id === s.id)) options.push(s);
      options.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    } else always.push(...list.map(s => s.id));
  }
  return { kind: 'plan', classId: srd, ability, cantrips: counts.cantrips ?? 0, leveled, leveledKind: kind, maxLevel, options, always, ...(tableOnly?.length ? { tableOnly } : {}) };
}

/* ---------- Снаряжение ---------- */

/** Выбор по одному вопросу стартового набора: буква варианта и предметы, взятые из категорий («any martial weapon»). */
export interface KitSelection { option: number; picks: readonly string[] }

export interface InventoryLine { id: string; qty: number }

/** Стартовый набор класса SRD; у книжного класса — null (набор в таблице текстом, предметов SRD за ним нет). */
export function startingKitOf(cls: CharacterClass): ClassStart['equipment'] | null {
  const srd = srdIdOf(cls);
  return srd ? CLASS_START[srd].equipment : null;
}

/** Сколько предметов нужно взять из категорий в варианте. */
export const picksNeeded = (parts: readonly KitPart[]): number => parts.reduce((s, p) => s + ('pick' in p ? p.qty : 0), 0);

/**
 * Инвентарь из стартового набора: обязательное + выбранные варианты + взятое из категорий. Невыбранное — в missing
 * («выбрать вариант 2», «выбрать 1 предмет»), чтобы лист показывал, что осталось.
 */
export function inventoryOf(kit: ClassStart['equipment'], selections: Readonly<Record<number, KitSelection>>): { items: InventoryLine[]; missing: number[] } {
  const lines = new Map<string, number>();
  const add = (id: string, qty: number) => lines.set(id, (lines.get(id) ?? 0) + qty);
  for (const f of kit.fixed) add(f.item, f.qty);
  const missing: number[] = [];
  kit.choices.forEach((ch, i) => {
    const sel = selections[i];
    const parts = sel ? ch.options[sel.option] : undefined;
    if (!parts) { missing.push(i); return; }
    let k = 0;
    for (const p of parts) {
      if ('item' in p) add(p.item, p.qty);
      else for (let n = 0; n < p.qty; n++) {
        const pick = sel!.picks[k++];
        if (pick) add(pick, 1);
      }
    }
    if (sel!.picks.filter(Boolean).length < picksNeeded(parts)) missing.push(i);
  });
  return { items: [...lines].map(([id, qty]) => ({ id, qty })), missing };
}

/* ---------- Атаки ---------- */

export interface Attack {
  id: string;
  name: string;
  /** Бонус к попаданию. */
  toHit: number;
  /** «1d8 + 3» или «1d8 + 3 / 1d10 + 3» у универсального. */
  damage: string;
  damageType: string;
  proficient: boolean;
  /** Дистанция «20/60» у метательного и дальнобойного. */
  range?: string;
  /** Атака всегда с помехой — почему: «тяжёлое у Маленького». */
  disadvantage?: string;
}

/** SRD 5.1, Weapon Properties (CC-BY-4.0), дословно. */
export const HEAVY_RULE = "Heavy. Small creatures have disadvantage on attack rolls with heavy weapons. A heavy weapon's size and bulk make it too large for a Small creature to use effectively.";

const dmg = (dice: string, mod: number) => (mod === 0 ? dice : `${dice} ${mod > 0 ? '+' : '−'} ${Math.abs(mod)}`);

/**
 * Атаки оружием из инвентаря (SRD: бросок атаки = модификатор + бонус мастерства при владении; урон = кость + тот же
 * модификатор). Фехтовальное — лучшая из STR и DEX, дальнобойное — DEX, остальное — STR; монах с оружием монаха —
 * лучшая из STR и DEX (Martial Arts). Боевой стиль «Стрельба» — +2 к попаданию дальнобойным (Archery). Маленький
 * с тяжёлым оружием — с помехой (HEAVY_RULE): у полурослика-следопыта длинный лук из стартового набора.
 */
export function attacksOf(
  items: readonly InventoryLine[],
  ctx: { mods: Readonly<Record<AbilityId, number>>; proficiencyBonus: number; srdClass?: SrdClassId; extraWeapons: readonly string[]; archery: boolean; small?: boolean },
): Attack[] {
  const out: Attack[] = [];
  for (const line of items) {
    const item: Item | undefined = ITEMS[line.id];
    const w = item?.weapon;
    if (!w || !w.damage) continue;
    const finesse = w.properties.includes('finesse');
    const monk = ctx.srdClass === 'monk' && (line.id === 'shortsword' || (w.category === 'simple' && w.range === 'melee' && !w.properties.includes('two-handed') && !w.properties.includes('heavy')));
    const ability: AbilityId = w.range === 'ranged' ? 'dex' : finesse || monk ? (ctx.mods.dex > ctx.mods.str ? 'dex' : 'str') : 'str';
    const mod = ctx.mods[ability];
    const proficient = (ctx.srdClass ? classWeaponProficient(ctx.srdClass, line.id) : false) || ctx.extraWeapons.includes(line.id);
    const toHit = mod + (proficient ? ctx.proficiencyBonus : 0) + (ctx.archery && w.range === 'ranged' ? 2 : 0);
    const damage = w.versatile ? `${dmg(w.damage, mod)} / ${dmg(w.versatile, mod)}` : dmg(w.damage, mod);
    out.push({ id: line.id, name: item.name, toHit, damage, damageType: w.damageType ?? '', proficient, ...(w.rangeFt ? { range: `${w.rangeFt[0]}/${w.rangeFt[1]}` } : {}), ...(ctx.small && w.properties.includes('heavy') ? { disadvantage: 'тяжёлое у Маленького' } : {}) });
  }
  return out;
}
