// Ресурсы персонажа 5e SRD 5.1: что тратится и чем восстанавливается (CC-BY-4.0, см. LICENSE.md). Закрытый
// набор id — лог (RESOURCE_SPENT / RESOURCE_RESTORED, решение владельца 21.09.2026) хранит только id и числа,
// подпись и правило отдыха берутся отсюда. Максимумы двух родов: из таблиц компендиума (ячейки, ярость, ци,
// единицы чародейства, ячейки договора — колонки листов классов) и из текста умений SRD, где таблица числа не
// даёт (второе дыхание, всплеск действий, божественный канал, дикий облик, наложение рук…) — эти формулы здесь.
// Восстановление — по SRD: короткий отдых возвращает то, что умение так и называет («after a short or long
// rest»), долгий — всё. Вдохновение барда до 5-го уровня — долгий, с 5-го (Font of Inspiration) — короткий.
// С 29.10.2026 (Q13) здесь же легендарные действия монстра: те же события, максимум — из вводного абзаца блока
// (rules/srd/legendary.ts), возврат — не отдых, а начало своего хода.
import type { AbilityId } from './abilities';
import type { SrdClassId } from './classes';

export const RESOURCE_IDS = [
  'slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5', 'slot-6', 'slot-7', 'slot-8', 'slot-9',
  'pact-slots', 'rage', 'ki', 'sorcery',
  'second-wind', 'action-surge', 'indomitable', 'bardic-inspiration', 'channel-divinity', 'wild-shape',
  'lay-on-hands', 'divine-sense', 'arcane-recovery',
  'legendary-actions',
] as const;

export type ResourceId = (typeof RESOURCE_IDS)[number];

export type RestKindOf = 'short' | 'long';

/** Что возвращает ресурс целиком: отдых или, у легендарных действий, начало своего хода. */
export type RestoreOn = RestKindOf | 'turn';

export interface Resource {
  id: ResourceId;
  label: string;
  /** Отдых, который возвращает ресурс целиком (SRD); turn — начало своего хода (легендарные действия). */
  restore: RestoreOn;
  /** slots — ячейки заклинаний кругом; uses — применения умения; pool — запас (хиты наложения рук). */
  kind: 'slots' | 'uses' | 'pool';
  /** Круг ячеек — у slot-N; у ячеек договора круг растёт с уровнем и берётся из таблицы. */
  slotLevel?: number;
  /** Откуда максимум: table — колонка листа класса в компендиуме; feature — текст умения SRD (формула ниже); block — вводный абзац блока монстра. */
  maxFrom: 'table' | 'feature' | 'block';
  source: string;
}

const slot = (n: number): Resource => ({
  id: `slot-${n}` as ResourceId,
  label: `Ячейки ${n}-го круга`,
  restore: 'long',
  kind: 'slots',
  slotLevel: n,
  maxFrom: 'table',
  source: 'SRD 5.1, Spellcasting: Spell Slots — «You regain all expended spell slots when you finish a long rest»',
});

export const RESOURCES: Readonly<Record<ResourceId, Resource>> = {
  'slot-1': slot(1), 'slot-2': slot(2), 'slot-3': slot(3), 'slot-4': slot(4), 'slot-5': slot(5),
  'slot-6': slot(6), 'slot-7': slot(7), 'slot-8': slot(8), 'slot-9': slot(9),
  'pact-slots': { id: 'pact-slots', label: 'Ячейки договора', restore: 'short', kind: 'slots', maxFrom: 'table', source: 'SRD 5.1, Warlock: Pact Magic — «You regain all expended spell slots when you finish a short or long rest»' },
  rage: { id: 'rage', label: 'Ярость', restore: 'long', kind: 'uses', maxFrom: 'table', source: 'SRD 5.1, Barbarian: Rage — «you must finish a long rest before you can rage again»' },
  ki: { id: 'ki', label: 'Очки ци', restore: 'short', kind: 'uses', maxFrom: 'table', source: 'SRD 5.1, Monk: Ki — «you regain all of your expended ki points» after a short or long rest' },
  sorcery: { id: 'sorcery', label: 'Единицы чародейства', restore: 'long', kind: 'uses', maxFrom: 'table', source: 'SRD 5.1, Sorcerer: Font of Magic — «You regain all spent sorcery points when you finish a long rest»' },
  'second-wind': { id: 'second-wind', label: 'Второе дыхание', restore: 'short', kind: 'uses', maxFrom: 'feature', source: 'SRD 5.1, Fighter: Second Wind — once, «you must finish a short or long rest before you can use it again»' },
  'action-surge': { id: 'action-surge', label: 'Всплеск действий', restore: 'short', kind: 'uses', maxFrom: 'feature', source: 'SRD 5.1, Fighter: Action Surge — once (twice from 17th), short or long rest' },
  indomitable: { id: 'indomitable', label: 'Несокрушимость', restore: 'long', kind: 'uses', maxFrom: 'feature', source: 'SRD 5.1, Fighter: Indomitable — once (twice from 13th, three times from 17th), long rest' },
  'bardic-inspiration': { id: 'bardic-inspiration', label: 'Вдохновение барда', restore: 'long', kind: 'uses', maxFrom: 'feature', source: 'SRD 5.1, Bard: Bardic Inspiration — Charisma modifier (minimum of once), long rest; Font of Inspiration (5th) — short or long rest' },
  'channel-divinity': { id: 'channel-divinity', label: 'Божественный канал', restore: 'short', kind: 'uses', maxFrom: 'feature', source: 'SRD 5.1, Cleric: Channel Divinity — once (twice from 6th, three times from 18th), short or long rest; Paladin — once from 3rd' },
  'wild-shape': { id: 'wild-shape', label: 'Дикий облик', restore: 'short', kind: 'uses', maxFrom: 'feature', source: 'SRD 5.1, Druid: Wild Shape — twice, short or long rest; unlimited from 20th' },
  'lay-on-hands': { id: 'lay-on-hands', label: 'Наложение рук', restore: 'long', kind: 'pool', maxFrom: 'feature', source: 'SRD 5.1, Paladin: Lay on Hands — pool of hit points equal to five times paladin level, long rest' },
  'divine-sense': { id: 'divine-sense', label: 'Божественное чувство', restore: 'long', kind: 'uses', maxFrom: 'feature', source: 'SRD 5.1, Paladin: Divine Sense — 1 + Charisma modifier times, long rest' },
  'arcane-recovery': { id: 'arcane-recovery', label: 'Магическое восстановление', restore: 'long', kind: 'uses', maxFrom: 'feature', source: 'SRD 5.1, Wizard: Arcane Recovery — once per day, after a short rest' },
  'legendary-actions': { id: 'legendary-actions', label: 'Легендарные действия', restore: 'turn', kind: 'uses', maxFrom: 'block', source: 'SRD 5.1, Legendary Creatures: Legendary Actions — «A creature regains its spent legendary actions at the start of its turn»' },
};

export function isResourceId(value: string): value is ResourceId {
  return (RESOURCE_IDS as readonly string[]).includes(value);
}

/** Круг ячеек по id: slot-3 → 3; иные — undefined. */
export function slotLevelOf(id: ResourceId): number | undefined {
  return RESOURCES[id].slotLevel;
}

/** Отдых, который возвращает ресурс на этом уровне: вдохновение барда с 5-го — короткий. */
export function restoreOn(id: ResourceId, level: number): RestoreOn {
  if (id === 'bardic-inspiration' && level >= 5) return 'short';
  return RESOURCES[id].restore;
}

export interface FeatureResource { id: ResourceId; max: number }

/** Максимумы ресурсов из текста умений SRD — того, что таблица класса числом не даёт. Уровень 0 или ниже — пусто. */
export function featureResources(cls: SrdClassId, level: number, mods: Readonly<Record<AbilityId, number>>): FeatureResource[] {
  if (level < 1) return [];
  const out: FeatureResource[] = [];
  switch (cls) {
    case 'fighter':
      out.push({ id: 'second-wind', max: 1 });
      if (level >= 2) out.push({ id: 'action-surge', max: level >= 17 ? 2 : 1 });
      if (level >= 9) out.push({ id: 'indomitable', max: level >= 17 ? 3 : level >= 13 ? 2 : 1 });
      break;
    case 'bard':
      out.push({ id: 'bardic-inspiration', max: Math.max(1, mods.cha) });
      break;
    case 'cleric':
      if (level >= 2) out.push({ id: 'channel-divinity', max: level >= 18 ? 3 : level >= 6 ? 2 : 1 });
      break;
    case 'druid':
      // С 20-го дикий облик без счёта (Archdruid) — тратить нечего.
      if (level >= 2 && level < 20) out.push({ id: 'wild-shape', max: 2 });
      break;
    case 'paladin':
      out.push({ id: 'lay-on-hands', max: 5 * level }, { id: 'divine-sense', max: 1 + Math.max(0, mods.cha) });
      if (level >= 3) out.push({ id: 'channel-divinity', max: 1 });
      break;
    case 'wizard':
      out.push({ id: 'arcane-recovery', max: 1 });
      break;
    default:
      break;
  }
  return out;
}
