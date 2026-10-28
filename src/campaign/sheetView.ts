// Лист персонажа числами для стола: модификаторы характеристик, спасбросков и навыков, инициатива, кости хитов —
// одна проекция на карточку, сводку партии и лист сравнения, чтобы «Скрытность +6» не разошлась по трём местам.
// Там же паспорт данных (откуда запись и чего в ней нет) и сводка партии: лучший и худший в групповой проверке,
// запас ячеек и костей хитов, пробелы листов. Чистые функции над Actor и журналом; стор не читают.
import type { Actor, DomainEvent } from '../engine';
import { classById, raceById, type Source } from '../rules/compendium';
import { ABILITY_IDS, SKILL_IDS, SKILLS, type AbilityId, type SkillId } from '../rules/srd/abilities';
import { abilityMod, srdClassOf } from './derive';
import { initiativeMod } from './encounter';
import { resourcePoolsOf } from './resources';
import { hitDiceOf } from './rest';

/** Владение навыком: компетентность удваивает бонус мастерства. */
export type Proficiency = 'none' | 'proficient' | 'expert';

export interface AbilityView {
  id: AbilityId;
  score: number;
  mod: number;
  save: number;
  saveProficient: boolean;
}

export interface SkillView {
  id: SkillId;
  ability: AbilityId;
  mod: number;
  proficiency: Proficiency;
}

export interface SheetView {
  abilities: AbilityView[];
  skills: SkillView[];
  initiative: number;
  proficiencyBonus: number;
  /** Кости хитов по классу SRD; у класса из книги кости нет — поля нет. */
  hitDice?: { die: number; available: number; total: number };
}

/** Владение спасбросками по классу SRD; класс вне SRD — никаких. */
export function saveProficiencies(classId: string): readonly AbilityId[] {
  const cls = classById(classId);
  if (!cls) return [];
  try { return srdClassOf(cls).saves; } catch { return []; }
}

/** Актёр с листом → числа листа; без листа (монстр, NPC без листа) — undefined. */
export function sheetViewOf(actor: Actor): SheetView | undefined {
  const sheet = actor.sheet;
  if (!sheet) return undefined;
  const pb = sheet.proficiencyBonus;
  const saves = saveProficiencies(sheet.classId);
  const mods = Object.fromEntries(ABILITY_IDS.map(id => [id, abilityMod(sheet.abilities[id])])) as Record<AbilityId, number>;
  const abilities = ABILITY_IDS.map(id => {
    const saveProficient = saves.includes(id);
    return { id, score: sheet.abilities[id], mod: mods[id], save: mods[id] + (saveProficient ? pb : 0), saveProficient };
  });
  const skills = SKILL_IDS.map(id => {
    const proficiency: Proficiency = !sheet.skills.includes(id) ? 'none' : sheet.expertise?.includes(id) ? 'expert' : 'proficient';
    const bonus = proficiency === 'expert' ? pb * 2 : proficiency === 'proficient' ? pb : 0;
    return { id, ability: SKILLS[id].ability, mod: mods[SKILLS[id].ability] + bonus, proficiency };
  });
  const hd = hitDiceOf(actor);
  return {
    abilities,
    skills,
    initiative: initiativeMod(actor),
    proficiencyBonus: pb,
    ...(hd ? { hitDice: { die: hd.die, available: hd.available, total: hd.total } } : {}),
  };
}

/* ---------- Паспорт данных: можно ли верить записи — до первого скролла ---------- */

export const SOURCE_LABEL: Readonly<Record<Source, string>> = { srd: 'SRD', book: 'книга', hb: 'хоумбрю' };

export interface Passport {
  /** «сид кампании» или «создан за столом» — первым звеном. */
  origin: string;
  /** Звенья по порядку: раса и класс с источником, черты, заклинания, снаряжение. */
  parts: string[];
  /** Чего на листе нет — словами поля; пусто — паспорт без тревоги. */
  missing: string[];
}

/** Пустые поля листа, которые видны на бумажной карточке: мировоззрение, тело, предыстория. */
export function missingFieldsOf(actor: Actor): string[] {
  const sheet = actor.sheet;
  if (!sheet) return ['лист'];
  const out: string[] = [];
  if (!sheet.alignment) out.push('мировоззрение');
  const bio = sheet.bio ?? {};
  const body = [!bio.height && 'рост', !bio.weight && 'вес', bio.age === undefined && 'возраст'].filter((x): x is string => Boolean(x));
  if (body.length === 3) out.push('рост, вес, возраст');
  else out.push(...body);
  if (!sheet.backgroundId) out.push('предыстория');
  return out;
}

/**
 * Паспорт листа: создан ли персонаж событием за столом (ACTOR_SPAWNED) или пришёл с сидом, из каких источников
 * раса и класс (SRD, книга, хоумбрю — CLAUDE.md: «только SRD» — один фильтр), сколько черт, заклинаний и
 * предметов, чего не хватает.
 */
export function passportOf(actor: Actor, events: readonly DomainEvent[] = []): Passport | undefined {
  const sheet = actor.sheet;
  if (!sheet) return undefined;
  const spawned = events.some(e => e.type === 'ACTOR_SPAWNED' && (e as DomainEvent<'ACTOR_SPAWNED'>).payload.actor.id === actor.id);
  const race = raceById(sheet.raceId);
  const sub = race?.subraces.find(s => s.id === sheet.subraceId);
  const cls = classById(sheet.classId);
  const parts: string[] = [];
  parts.push(`раса ${SOURCE_LABEL[(sub ?? race)?.source ?? 'hb']}`);
  parts.push(`класс ${SOURCE_LABEL[cls?.source ?? 'hb']}`);
  const feats = sheet.feats?.length ?? 0;
  if (feats > 0) parts.push(`черт ${feats}`);
  const sc = sheet.spellcasting;
  const spells = sc ? sc.cantrips.length + sc.spells.length + sc.always.length : 0;
  if (spells > 0) parts.push(`заклинаний ${spells}`);
  const items = sheet.equipment?.length ?? 0;
  if (items > 0) parts.push(`предметов ${items}`);
  return { origin: spawned ? 'создан за столом' : 'сид кампании', parts, missing: missingFieldsOf(actor) };
}

/* ---------- Сводка партии: та же выборка, что в списке, а не видимая часть ---------- */

/** Проверки, которые за столом бросают всей группой или «кто лучше» — порядок частоты, а не алфавит. */
export const GROUP_CHECKS: readonly SkillId[] = ['perception', 'stealth', 'insight', 'survival', 'investigation', 'persuasion', 'athletics', 'arcana'];

export interface SkillLeader {
  skill: SkillId;
  best: { id: string; name: string; mod: number };
  worst: { id: string; name: string; mod: number };
}

export interface PartySummary {
  count: number;
  /** Уровни выборки: одно число, когда все равны. */
  levels: { min: number; max: number };
  hp: { current: number; max: number };
  hitDice: { available: number; total: number };
  /** Ячейки заклинаний (обычные и колдовские) — нет ни у кого, поля нет. */
  slots?: { available: number; max: number };
  leaders: SkillLeader[];
  /** Пробелы листов: поле → чьи листы без него. Пусто — секции нет. */
  gaps: { field: string; names: string[] }[];
}

const isSlot = (id: string) => id.startsWith('slot-') || id === 'pact-slots';

export function partySummaryOf(actors: readonly Actor[]): PartySummary {
  const views = actors.map(a => ({ actor: a, view: sheetViewOf(a) }));
  const levels = actors.map(a => a.sheet?.level).filter((n): n is number => n !== undefined);
  let slotsAvail = 0;
  let slotsMax = 0;
  let hdAvail = 0;
  let hdTotal = 0;
  for (const { actor, view } of views) {
    if (view?.hitDice) { hdAvail += view.hitDice.available; hdTotal += view.hitDice.total; }
    for (const p of resourcePoolsOf(actor)) if (isSlot(p.id)) { slotsAvail += p.available; slotsMax += p.max; }
  }
  const leaders: SkillLeader[] = [];
  for (const skill of GROUP_CHECKS) {
    const rows = views.flatMap(({ actor, view }) => {
      const s = view?.skills.find(x => x.id === skill);
      return s ? [{ id: actor.id, name: actor.name, mod: s.mod }] : [];
    });
    if (rows.length === 0) continue;
    // Равные — в порядке партии: первый лучший и последний худший, без случайной перестановки.
    const best = rows.reduce((a, b) => (b.mod > a.mod ? b : a));
    const worst = rows.reduce((a, b) => (b.mod <= a.mod ? b : a));
    leaders.push({ skill, best, worst });
  }
  const gapMap = new Map<string, string[]>();
  for (const a of actors) for (const f of missingFieldsOf(a)) gapMap.set(f, [...(gapMap.get(f) ?? []), a.name]);
  return {
    count: actors.length,
    levels: { min: levels.length ? Math.min(...levels) : 0, max: levels.length ? Math.max(...levels) : 0 },
    hp: actors.reduce((s, a) => ({ current: s.current + a.hp.current, max: s.max + a.hp.max }), { current: 0, max: 0 }),
    hitDice: { available: hdAvail, total: hdTotal },
    ...(slotsMax > 0 ? { slots: { available: slotsAvail, max: slotsMax } } : {}),
    leaders,
    gaps: [...gapMap].map(([field, names]) => ({ field, names })),
  };
}
