// Дерево вывода числа листа (ROADMAP 5.4, DESIGN Д1): AC 18 — это «кольчуга 16 + щит 2», и у каждого шага — строка SRD,
// откуда он. Считается над листом актёра (в логе лежит лист, а не PcSpec) по тем же правилам, что derive.ts; тест сверяет
// сумму шагов с числом листа у всей партии сида и у персонажей редактора. Разойдётся (старый лист, правка руками) —
// разница отдельным шагом с пометкой mismatch, а не тихой подгонкой. Чистые функции, без React.
import type { Actor } from '../engine';
import { classById } from '../rules/compendium';
import type { LayerId } from '../rules/layers';
import { ABILITIES, ABILITY_IDS, SKILLS, type AbilityId, type SkillId } from '../rules/srd/abilities';
import { ARMOR, ARMOR_RULES, MAGE_ARMOR, MEDIUM_ARMOR_DEX_CAP, SHIELD, isArmorId } from '../rules/srd/armor';
import { ITEMS } from '../rules/srd/equipment';
import {
  SHEET_RULES, hpFirstLevelRule, hpHigherLevelsRule, spellAttackRule, spellDcRule,
} from '../rules/srd/sheetRules';
import { srdIdOf, weaponAbility } from './build';
import { ARCHERY_STYLE, DEFENSE_STYLE, DRACONIC_SUBCLASS, TRAIT_EFFECTS, UNARMORED_DEFENSE, abilityMod, srdClassOf } from './derive';
import { saveProficiencies } from './sheetView';

/** Шаг вывода: подпись, вклад в число и строка SRD, откуда он. */
export interface DeriveStep {
  label: string;
  value: number;
  rule?: string;
  /** Слой правил (Д7): строка SRD — «srd», черта из таблицы владельца без строки SRD — «owner»; у расхождения слоя нет. */
  layer?: LayerId;
  /** Шаг — не правило, а расхождение с числом листа. */
  mismatch?: true;
}

export interface Explanation {
  total: number;
  steps: readonly DeriveStep[];
}

export type ExplainKey =
  | 'ac' | 'initiative' | 'hp' | 'pp' | 'spellDc' | 'spellAttack'
  | `save:${AbilityId}` | `skill:${SkillId}` | `attack:${string}`;

const code = (ab: AbilityId) => ABILITIES[ab].code;

/** Модификатор характеристики шагом: «DEX 16 → +3». */
const modStep = (ab: AbilityId, score: number): DeriveStep => ({ label: `${code(ab)} ${score}`, value: abilityMod(score), rule: SHEET_RULES.abilityMod });

/** Шаги → вывод; сумма не сошлась с числом листа — разница отдельным шагом. */
function close(steps: DeriveStep[], shown?: number): Explanation {
  const sum = steps.reduce((s, x) => s + x.value, 0);
  const layered: DeriveStep[] = steps.map(x => ({ ...x, layer: x.layer ?? (x.rule ? 'srd' : 'owner') }));
  if (shown !== undefined && shown !== sum) layered.push({ label: 'не из правил листа', value: shown - sum, mismatch: true });
  return { total: shown ?? sum, steps: layered };
}

function acSteps(actor: Actor): DeriveStep[] {
  const sheet = actor.sheet!;
  const dex = sheet.abilities.dex;
  const dexMod = abilityMod(dex);
  const steps: DeriveStep[] = [];
  const armor = sheet.armor && isArmorId(sheet.armor) ? ARMOR[sheet.armor] : undefined;
  if (armor) {
    steps.push({ label: `${armor.name}, ${armor.category === 'light' ? 'лёгкий' : armor.category === 'medium' ? 'средний' : 'тяжёлый'}`, value: armor.baseAc, rule: ARMOR_RULES[armor.category] });
    if (armor.category === 'light') steps.push({ ...modStep('dex', dex), rule: ARMOR_RULES.light });
    if (armor.category === 'medium') steps.push({ label: dexMod > MEDIUM_ARMOR_DEX_CAP ? `${code('dex')} ${dex}, у среднего не больше +${MEDIUM_ARMOR_DEX_CAP}` : `${code('dex')} ${dex}`, value: Math.min(dexMod, MEDIUM_ARMOR_DEX_CAP), rule: ARMOR_RULES.medium });
  } else {
    // Без доспеха — лучшая из формул, как в derive.ts: 10 + DEX, Mage Armor, защита без доспехов, драконья устойчивость.
    const cls = classById(sheet.classId);
    const srd = cls ? srdIdOf(cls) : undefined;
    const unarmored = srd ? UNARMORED_DEFENSE[srd] : undefined;
    const options: DeriveStep[][] = [[{ label: 'без доспеха', value: 10, rule: SHEET_RULES.armorBase }, modStep('dex', dex)]];
    if (sheet.mageArmor) options.push([{ label: 'Mage Armor', value: MAGE_ARMOR.baseAc, rule: MAGE_ARMOR.text }, modStep('dex', dex)]);
    if (unarmored && !(unarmored.noShield && sheet.shield)) {
      const rule = srd === 'monk' ? SHEET_RULES.unarmoredMonk : SHEET_RULES.unarmoredBarbarian;
      options.push([{ label: 'защита без доспехов', value: 10, rule }, modStep('dex', dex), { ...modStep(unarmored.ability, sheet.abilities[unarmored.ability]), rule }]);
    }
    if (sheet.subclassId === DRACONIC_SUBCLASS) options.push([{ label: 'драконья чешуя', value: 13, rule: SHEET_RULES.draconicAc }, modStep('dex', dex)]);
    const sum = (o: DeriveStep[]) => o.reduce((s, x) => s + x.value, 0);
    steps.push(...options.reduce((best, o) => (sum(o) > sum(best) ? o : best)));
  }
  if (sheet.shield) steps.push({ label: 'щит', value: SHIELD.acBonus, rule: ARMOR_RULES.shield });
  const style = sheet.choices?.find(c => c.id === 'fighting-style')?.values[0]?.id;
  if (style === DEFENSE_STYLE && armor) steps.push({ label: 'боевой стиль «Оборона»', value: 1, rule: SHEET_RULES.defense });
  return steps;
}

function hpSteps(actor: Actor): DeriveStep[] {
  const sheet = actor.sheet!;
  const cls = classById(sheet.classId);
  if (!cls) return [];
  const srd = srdClassOf(cls);
  const die = srd.hitDie;
  const level = sheet.level;
  const con = abilityMod(sheet.abilities.con);
  const steps: DeriveStep[] = [{ label: `1-й уровень: d${die} целиком`, value: die, rule: hpFirstLevelRule(die) }];
  if (level > 1) steps.push({ label: `уровни 2–${level}: среднее ${die / 2 + 1} × ${level - 1}`, value: (die / 2 + 1) * (level - 1), rule: `${hpHigherLevelsRule(die, srd.name)}. ${SHEET_RULES.hpFixed}` });
  steps.push({ label: `${code('con')} ${con >= 0 ? '+' : '−'}${Math.abs(con)} × ${level}`, value: con * level, rule: SHEET_RULES.conChange });
  for (const t of sheet.traits) {
    const per = TRAIT_EFFECTS[t.id]?.hpPerLevel;
    if (per) steps.push({ label: `${t.name}: +${per} × ${level}`, value: per * level, ...(t.id === 'dvarfskaa-vyderjka' ? { rule: SHEET_RULES.dwarvenToughness } : {}) });
  }
  if (sheet.subclassId === DRACONIC_SUBCLASS) steps.push({ label: `драконья устойчивость: +1 × ${level}`, value: level, rule: SHEET_RULES.draconicHp });
  return steps;
}

/** Модификатор навыка шагами: характеристика, владение или компетентность. */
function skillSteps(actor: Actor, skill: SkillId): DeriveStep[] {
  const sheet = actor.sheet!;
  const ab = SKILLS[skill].ability;
  const steps = [modStep(ab, sheet.abilities[ab])];
  if (sheet.skills.includes(skill)) {
    steps.push(sheet.expertise?.includes(skill)
      ? { label: `компетентность: владение +${sheet.proficiencyBonus} × 2`, value: sheet.proficiencyBonus * 2, rule: SHEET_RULES.expertise }
      : { label: 'владение навыком', value: sheet.proficiencyBonus, rule: SHEET_RULES.skillProficiency });
  }
  return steps;
}

function attackSteps(actor: Actor, id: string): DeriveStep[] | undefined {
  const sheet = actor.sheet!;
  const attack = sheet.attacks?.find(a => a.id === id);
  const w = ITEMS[id]?.weapon;
  if (!attack || !w) return undefined;
  const mods = Object.fromEntries(ABILITY_IDS.map(ab => [ab, abilityMod(sheet.abilities[ab])])) as Record<AbilityId, number>;
  const cls = classById(sheet.classId);
  const how = weaponAbility(id, mods, cls ? srdIdOf(cls) : undefined);
  if (!how) return undefined;
  const why = how.why === 'finesse' ? ', фехтовальное — лучшая из STR и DEX' : how.why === 'monk' ? ', оружие монаха — лучшая из STR и DEX' : '';
  const steps: DeriveStep[] = [{ ...modStep(how.ability, sheet.abilities[how.ability]), label: `${code(how.ability)} ${sheet.abilities[how.ability]}${why}`, rule: how.why === 'finesse' ? SHEET_RULES.finesse : SHEET_RULES.attackAbility }];
  if (attack.proficient) steps.push({ label: 'владение оружием', value: sheet.proficiencyBonus, rule: SHEET_RULES.weaponProficiency });
  const style = sheet.choices?.find(c => c.id === 'fighting-style')?.values[0]?.id;
  if (style === ARCHERY_STYLE && w.range === 'ranged') steps.push({ label: 'боевой стиль «Стрельба»', value: 2, rule: SHEET_RULES.archery });
  return steps;
}

/**
 * Из чего сложено число листа. Нет листа или числа (нет заклинательства, нет такой атаки) — undefined.
 * Итог — число, которое показывает лист; шаги — правила SRD над листом.
 */
export function explain(actor: Actor, key: ExplainKey): Explanation | undefined {
  const sheet = actor.sheet;
  if (!sheet) return undefined;
  if (key === 'ac') return close(acSteps(actor), actor.ac);
  if (key === 'hp') {
    const steps = hpSteps(actor);
    return steps.length ? close(steps, actor.hp.max) : undefined;
  }
  if (key === 'initiative') return close([{ ...modStep('dex', sheet.abilities.dex), rule: SHEET_RULES.initiative }]);
  if (key === 'pp') {
    return close([{ label: 'пассивная проверка', value: 10, rule: SHEET_RULES.passive }, ...skillSteps(actor, 'perception')], actor.passivePerception);
  }
  if (key === 'spellDc' || key === 'spellAttack') {
    const sc = sheet.spellcasting;
    if (!sc) return undefined;
    const steps: DeriveStep[] = [
      { label: 'бонус мастерства', value: sheet.proficiencyBonus, rule: key === 'spellDc' ? spellDcRule(sc.ability) : spellAttackRule(sc.ability) },
      modStep(sc.ability, sheet.abilities[sc.ability]),
    ];
    if (key === 'spellDc') steps.unshift({ label: 'основа', value: 8, rule: spellDcRule(sc.ability) });
    return close(steps, key === 'spellDc' ? sc.saveDc : sc.attack);
  }
  const [kind, id] = key.split(':') as ['save' | 'skill' | 'attack', string];
  if (kind === 'save') {
    const ab = id as AbilityId;
    const steps = [modStep(ab, sheet.abilities[ab])];
    if (saveProficiencies(sheet.classId).includes(ab)) steps.push({ label: 'владение спасброском', value: sheet.proficiencyBonus, rule: SHEET_RULES.saveProficiency });
    return close(steps);
  }
  if (kind === 'skill') return close(skillSteps(actor, id as SkillId));
  const steps = attackSteps(actor, id);
  return steps ? close(steps, sheet.attacks!.find(a => a.id === id)!.toHit) : undefined;
}

/** AC по правилам над листом — сумма шагов вывода; повышение уровня пересчитывает им AC нового листа. */
export const sheetAc = (actor: Actor): number => acSteps(actor).reduce((n, x) => n + x.value, 0);

/** Итог со знаком, как модификатор на листе: «+4», «−1». */
export const signedTotal = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);

/** Вывод одной строкой для подсказки: «18 = 16 (Chain mail, тяжёлый) + 2 (щит)»; модификатор — «+6 = 3 (DEX 16) + 3 (…)». */
export function explainText(e: Explanation, signed = false): string {
  const term = (n: number, first: boolean) => (first ? (n < 0 ? `−${-n}` : String(n)) : n < 0 ? `− ${-n}` : `+ ${n}`);
  return `${signed ? signedTotal(e.total) : e.total} = ${e.steps.map((s, i) => `${term(s.value, i === 0)} (${s.label})`).join(' ')}`;
}
