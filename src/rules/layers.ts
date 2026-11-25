// Правила как слои (Д7, DESIGN): манифест кампании — какая механика стола из какого источника, — и расхождения таблиц
// владельца с SRD. Манифест описывает то, что код делает сейчас, а не выбор: сменить слой механики нельзя, пока второго
// слоя для неё нет в данных. Таблицы владельца — переводы книг для его стола: экран правил только мастеру, вовне не уходит.
// Бонусы рас SRD 5.1 (Racial Traits: Ability Score Increase) — те же числа, что у сверки импортёра
// (scripts/import-compendium.py, SRD_RACE_ASI): здесь они для показа расхождения, не для подмены.
import { RACES, type Race } from './compendium';
import type { AbilityId } from './srd/abilities';

export type LayerId = 'srd' | 'a5e' | 'bf' | 'owner' | 'wiki' | 'table';

export interface Layer {
  label: string;
  /** Откуда и под какой лицензией. */
  cite: string;
  /** Можно ли показывать вовне стола владельца. */
  public: boolean;
}

export const LAYERS: Readonly<Record<LayerId, Layer>> = {
  srd: { label: 'SRD', cite: 'System Reference Document 5.1, Wizards of the Coast (CC-BY-4.0)', public: true },
  a5e: { label: 'A5E', cite: 'A5E System Reference Document, EN Publishing (CC-BY-4.0)', public: true },
  bf: { label: 'Black Flag', cite: 'Black Flag SRD, Kobold Press (CC-BY-4.0), через Open5e', public: true },
  owner: { label: 'таблицы владельца', cite: 'компендиум: переводы книг WotC и хоумбрю — только для своего стола', public: false },
  // CC BY-SA — только внутри, вовне никогда, даже для тестов (решение пользователя 30.10.2026; И6 нашёл расхождение).
  wiki: { label: 'вики', cite: 'Forgotten Realms Wiki (CC-BY-SA)', public: false },
  table: { label: 'правило стола', cite: 'решение стола в коде: правила такого нет ни в одном источнике', public: true },
};

export interface Mechanic {
  id: string;
  label: string;
  /** Слои, из которых механика собрана сейчас, по порядку: первый — основа. */
  layers: readonly LayerId[];
  detail: string;
}

/** Манифест кампании: что стол считает и откуда. */
export const CAMPAIGN_RULES: readonly Mechanic[] = [
  { id: 'races', label: 'Расы и черты рас', layers: ['owner', 'srd'], detail: 'бонусы, черты и подрасы — из таблицы владельца; скорость и размер рас SRD — из SRD (в таблице прозой); гибкие бонусы полуэльфа — по правилу SRD' },
  { id: 'classes', label: 'Классы и подклассы', layers: ['owner', 'srd'], detail: 'умения по уровням, подклассы, блоки выбора — из таблицы владельца; кость хитов, спасброски, стартовое снаряжение и заклинательство — SRD' },
  { id: 'feats', label: 'Черты', layers: ['owner'], detail: 'список и требования — из таблицы владельца (в SRD одна черта)' },
  { id: 'sheet', label: 'Числа листа', layers: ['srd'], detail: 'модификаторы, владение, AC, хиты, Сл и атака заклинаний — формулы SRD; вывод числа показывает слой у каждого шага' },
  { id: 'spells', label: 'Заклинания', layers: ['srd'], detail: '319 заклинаний SRD 5.1 дословно; списки классов SRD' },
  { id: 'equipment', label: 'Снаряжение', layers: ['srd'], detail: 'предметы, доспехи, оружие и стартовые наборы SRD' },
  { id: 'monsters', label: 'Монстры', layers: ['srd', 'bf', 'a5e'], detail: 'блоки SRD; рядом библиотеки Black Flag и A5E Monstrous Menagerie — «только SRD» фильтром' },
  { id: 'lairActions', label: 'Действия логова', layers: ['owner'], detail: 'D&D Basic Rules (2014), Adult Red Dragon; книжные варианты видны только мастеру, выбор и игровые последствия вручную' },
  { id: 'conditions', label: 'Состояния', layers: ['srd', 'a5e'], detail: 'состояния и истощение SRD; A5E Fatigue и Strife — отдельные шкалы. При включённой теме стресса Strife автоматически даёт помеху mental checks и спасброску на концентрацию' },
  { id: 'influence', label: 'Влияние NPC', layers: ['srd'], detail: 'Influence SRD 5.2.1: Deception, Intimidation, Performance, Persuasion или Animal Handling для Beast/Monstrosity; DC max(15, INT цели); Friendly — преимущество, Indifferent — обычно, Hostile — помеха; одинаковая неудачная просьба повторяется не раньше чем через 24 часа' },
  { id: 'travel', label: 'Поход', layers: ['srd', 'a5e'], detail: 'темп и мили в день — SRD; занятия в пути, Сл регионов, встречи и погода регионов — A5E' },
  { id: 'supply', label: 'Припасы', layers: ['a5e'], detail: 'общий запас партии — Supply A5E: 1 на существо в день, съедается на длинном отдыхе' },
  { id: 'rest', label: 'Отдых', layers: ['srd'], detail: 'SRD выбран по умолчанию; A5E выбирается на кампанию. В A5E действуют Haven/Supply, отдельные Fatigue/Strife, лимит долгого отдыха раз в 24 часа и Roughing it (половина обычного восстановления костей хитов, Fatigue/Strife не снижаются). Долгий отдых восстанавливает HP и ресурсы. Haven записан у места с временным override для отдельной ночёвки.' },
  { id: 'calendar', label: 'Календарь', layers: ['wiki'], detail: 'Харптос: 12 месяцев по 30 дней, пять праздников и Shieldmeet раз в четыре года после Midsummer; святые дни богов — по вики' },
  { id: 'weather', label: 'Погода полосы часов', layers: ['table'], detail: 'температура по месяцу для Sword Coast North, небо — хешем дня' },
  { id: 'knowledge', label: 'Проверка знаний', layers: ['srd', 'table'], detail: 'Сл — таблица типичных DC SRD; какой навык у какой сущности — правило стола' },
  { id: 'tensions', label: 'Напряжения', layers: ['wiki', 'table'], detail: 'вражда, базы и члены организаций — по вики; порог «сила растёт» (отношение ≤ −2, известность от 5) — правило стола' },
];

type Asi = Partial<Record<AbilityId, number>>;
const ALL_ONE: Asi = { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 };
const SRD_RACE_ASI: Readonly<Record<string, Asi>> = {
  Human: ALL_ONE, Dragonborn: { str: 2, cha: 1 }, 'Half-Elf': { cha: 2 }, 'Half-Orc': { str: 2, con: 1 }, Tiefling: { cha: 2, int: 1 },
};
const SRD_SUBRACE_ASI: Readonly<Record<string, Asi>> = {
  'High Elf': { dex: 2, int: 1 }, 'Hill Dwarf': { con: 2, wis: 1 }, 'Rock Gnome': { int: 2, con: 1 }, Lightfoot: { dex: 2, cha: 1 },
};

export const asiText = (a: Asi | undefined): string =>
  Object.entries(a ?? {}).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(', ') || 'нет';

const same = (a: Asi | undefined, b: Asi) => {
  const ka = Object.keys(a ?? {}), kb = Object.keys(b);
  return ka.length === kb.length && kb.every(k => a?.[k as AbilityId] === b[k as AbilityId]);
};

/** Расхождение таблицы владельца с SRD: что, у кого, как в таблице (её и считает лист), как в SRD. */
export interface Divergence { mechanic: string; subject: string; owner: string; srd: string }

/** Бонусы характеристик рас SRD в таблице владельца против SRD 5.1. */
export function raceDivergences(races: readonly Race[] = RACES): Divergence[] {
  const out: Divergence[] = [];
  for (const r of races) {
    if (r.source !== 'srd') continue;
    const srd = SRD_RACE_ASI[r.name];
    if (srd && !same(r.asi, srd)) out.push({ mechanic: 'races', subject: r.nameRu, owner: asiText(r.asi), srd: asiText(srd) });
    for (const s of r.subraces) {
      const sub = SRD_SUBRACE_ASI[s.name];
      if (sub && !same(s.asi, sub)) out.push({ mechanic: 'races', subject: `${r.nameRu} · ${s.nameRu}`, owner: asiText(s.asi), srd: asiText(sub) });
    }
  }
  return out;
}
