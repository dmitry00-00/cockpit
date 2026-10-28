// Блоки статов 5e SRD 5.1 (CC-BY-4.0, см. LICENSE.md) — content/srd/monsters.json, который пишет
// scripts/import-srd-monsters.mjs с открытого API (https://www.dnd5eapi.co/api/2014/monsters/<id>): текст умений,
// действий и реакций дословно, на английском; числа — из блока, не пересчитаны. Первые два блока (Bandit, Bandit Captain)
// сняты 2026-09-18 руками и совпали с импортом 2026-09-21 — сверка «число ↔ текст» в src/campaign/derive.test.ts.
// Здесь только форма и доступ: JSON руками не правится, набор расширяется списком в импортёре.
// С 27.10.2026 рядом с SRD — две открытые библиотеки (решение владельца: «для разнообразия встреч»): Black Flag SRD
// (Kobold Press) и A5E Monstrous Menagerie (EN Publishing), обе CC BY 4.0, через Open5e —
// scripts/import-open5e-monsters.mjs; id с приставкой «bf-» и «a5e-», у блока origin. «Только SRD» — фильтр по origin.
// С 28.10.2026 (ROADMAP 0.5) библиотеки грузятся отдельными кусками: в старте только SRD, Black Flag и A5E (2,2 МБ)
// дописываются в те же MONSTERS, MONSTER_IDS и MONSTER_LIST после loadMonsterLibraries().
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
  /** Бонусные действия — у блоков Black Flag и A5E; в SRD 5.1 их нет. */
  bonusActions?: readonly MonsterAction[];
  /** Легендарные действия: имя со стоимостью «(Costs 2 Actions)». */
  legendary?: readonly MonsterAction[];
  /** Библиотека: SRD 5.1, Black Flag SRD, A5E SRD; нет поля — SRD. */
  origin?: MonsterOrigin;
  source: string;
}

export type MonsterOrigin = 'srd' | 'bf' | 'a5e';

/** Подписи библиотек за столом. */
export const MONSTER_ORIGIN_LABEL: Readonly<Record<MonsterOrigin, string>> = { srd: 'SRD', bf: 'Black Flag', a5e: 'A5E' };

/** Id блока — индекс SRD API («bandit-captain», «werewolf-hybrid»). Строка: набор задаётся импортёром, не типом. */
export type MonsterId = string;

// JSON выводит `range` как number[], а не кортеж — через unknown, как и компендиум; форму держит тест derive.test.ts.
type Library = { source: string; fetchedAt: string; attribution?: string; monsters: Record<string, Monster> };
const DATA = raw as unknown as Library;

/** Реестр блоков: SRD сразу, библиотеки — после loadMonsterLibraries(). Снаружи только чтение. */
const registry: Record<MonsterId, Monster> = { ...DATA.monsters };
export const MONSTERS: Readonly<Record<MonsterId, Monster>> = registry;

/** Блоки SRD 5.1 в порядке импортёра: сначала стартовые (люди и NPC, гоблиноиды, звери, ликантропы, нежить, великаны). */
export const SRD_MONSTER_IDS: readonly MonsterId[] = Object.keys(DATA.monsters);

/** Все загруженные блоки: SRD, затем Black Flag и A5E по имени — так же в списке «Добавить». */
const ids: MonsterId[] = Object.keys(registry);
export const MONSTER_IDS: readonly MonsterId[] = ids;

export const monsterOrigin = (m: Monster): MonsterOrigin => m.origin ?? 'srd';

const list: Monster[] = ids.map(id => registry[id]);
export const MONSTER_LIST: readonly Monster[] = list;

/** Откуда и когда снята библиотека SRD. */
export const MONSTERS_SOURCE = { source: DATA.source, fetchedAt: DATA.fetchedAt } as const;

export interface MonsterLibrary { origin: Exclude<MonsterOrigin, 'srd'>; source: string; fetchedAt: string; attribution: string }

/** Источники загруженных библиотек не из SRD с текстом авторства CC BY: Black Flag, затем A5E. */
const libraries: MonsterLibrary[] = [];
export const MONSTER_LIBRARIES: readonly MonsterLibrary[] = libraries;

let loading: Promise<void> | null = null;

/** Догрузить Black Flag и A5E в реестр; повторный вызов — тот же промис. */
export function loadMonsterLibraries(): Promise<void> {
  loading ??= Promise.all([
    import('../../../content/bf/monsters.json').then(m => ['bf', m.default] as const),
    import('../../../content/a5e/monsters.json').then(m => ['a5e', m.default] as const),
  ]).then(libs => {
    for (const [origin, raw] of libs) {
      const lib = raw as unknown as Library;
      Object.assign(registry, lib.monsters);
      libraries.push({ origin, source: lib.source, fetchedAt: lib.fetchedAt, attribution: lib.attribution ?? '' });
    }
    ids.splice(0, ids.length, ...Object.keys(registry));
    list.splice(0, list.length, ...ids.map(id => registry[id]));
  });
  return loading;
}

export const monsterLibrariesLoaded = (): boolean => libraries.length > 0;

/** Блок из библиотеки, которая ещё не загружена: id с приставкой «bf-»/«a5e-», а в реестре его нет. */
export const needsMonsterLibraries = (monsterIds: readonly (MonsterId | undefined)[]): boolean =>
  monsterIds.some(id => id !== undefined && !Object.hasOwn(registry, id) && /^(bf|a5e)-/.test(id));

export function isMonsterId(value: string): value is MonsterId {
  return Object.hasOwn(MONSTERS, value);
}
