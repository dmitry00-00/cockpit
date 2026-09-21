// Блоки статов 5e SRD 5.1 (CC-BY-4.0, см. LICENSE.md) — content/srd/monsters.json, который пишет
// scripts/import-srd-monsters.mjs с открытого API (https://www.dnd5eapi.co/api/2014/monsters/<id>): текст умений,
// действий и реакций дословно, на английском; числа — из блока, не пересчитаны. Первые два блока (Bandit, Bandit Captain)
// сняты 2026-09-18 руками и совпали с импортом 2026-09-21 — сверка «число ↔ текст» в src/campaign/derive.test.ts.
// Здесь только форма и доступ: JSON руками не правится, набор расширяется списком в импортёре.
import raw from '../../../content/srd/monsters.json';
import type { AbilityId, SkillId } from './abilities';

export interface MonsterAttack {
  toHit: number;
  /** Досягаемость в футах у ближней атаки. */
  reach?: number;
  /** Нормальная и максимальная дальность в футах у дальней. */
  range?: readonly [number, number];
  /** «1d6 + 1» и среднее из блока; у атаки без урона (паутина) их нет. */
  damage?: string;
  average?: number;
  damageType?: string;
}

export interface MonsterAction {
  /** Имя с пометкой использования, как печатает SRD: «Web (Recharge 5–6)», «Leadership (Recharges after a Short or Long Rest)». */
  name: string;
  /** Абзац SRD дословно. */
  text: string;
  attack?: MonsterAttack;
}

export interface Monster {
  id: string;
  /** Английское имя SRD — по нему ищут в книгах. */
  name: string;
  size: string;
  type: string;
  alignment: string;
  ac: { value: number; source: string };
  hp: { average: number; formula: string };
  /** Скорость ходьбы в футах; полная строка блока — speedText («30 ft., fly 60 ft.»). */
  speed: number;
  speedText: string;
  abilities: Readonly<Record<AbilityId, number>>;
  savingThrows: Partial<Record<AbilityId, number>>;
  skills: Partial<Record<SkillId, number>>;
  damageVulnerabilities: readonly string[];
  damageResistances: readonly string[];
  damageImmunities: readonly string[];
  conditionImmunities: readonly string[];
  senses: string;
  languages: string;
  cr: string;
  xp: number;
  /** Бонус мастерства по CR — не печатается в блоке SRD 5.1, но из него сложены атаки и спасброски. */
  proficiencyBonus: number;
  /** Особенности (special abilities): Pack Tactics, Undead Fortitude, Shapechanger… */
  traits: readonly MonsterAction[];
  actions: readonly MonsterAction[];
  reactions: readonly MonsterAction[];
  source: string;
}

/** Id блока — индекс SRD API («bandit-captain», «werewolf-hybrid»). Строка: набор задаётся импортёром, не типом. */
export type MonsterId = string;

// JSON выводит `range` как number[], а не кортеж — через unknown, как и компендиум; форму держит тест derive.test.ts.
const DATA = raw as unknown as { source: string; fetchedAt: string; monsters: Record<string, Monster> };

export const MONSTERS: Readonly<Record<MonsterId, Monster>> = DATA.monsters;

/** В порядке импортёра: люди и NPC, гоблиноиды, звери, ликантропы, нежить, великаны — так же в списке «Добавить». */
export const MONSTER_IDS: readonly MonsterId[] = Object.keys(DATA.monsters);

export const MONSTER_LIST: readonly Monster[] = MONSTER_IDS.map(id => MONSTERS[id]);

/** Откуда и когда снята библиотека. */
export const MONSTERS_SOURCE = { source: DATA.source, fetchedAt: DATA.fetchedAt } as const;

export function isMonsterId(value: string): value is MonsterId {
  return Object.hasOwn(DATA.monsters, value);
}
