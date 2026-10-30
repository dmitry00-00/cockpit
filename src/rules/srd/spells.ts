// Заклинания 5e SRD 5.1 (CC-BY-4.0, см. LICENSE.md) — content/srd/spells.json, который пишет
// scripts/import-srd-spells.mjs с открытого API (https://www.dnd5eapi.co/api/2014/spells): 319 заклинаний, текст
// дословно, на английском (имена — по ним ищут в книгах; русские имена — открытый вопрос владельцу). Списки классов —
// поле classes; заклинания подклассов SRD (Life, Devotion, Land, Fiend) — subclassSpells с уровнем класса.
// Здесь только форма и доступ: JSON руками не правится.
// Ядро без текстов (ROADMAP 0.5): text и higherLevel догружает rules/texts.ts в эти же объекты.
import type { SrdClassId } from './classes';

const raw = (await import('../../../content/srd/spells.json?split=core')).default;

export type SpellSchool =
  | 'abjuration' | 'conjuration' | 'divination' | 'enchantment' | 'evocation' | 'illusion' | 'necromancy' | 'transmutation';

export interface Spell {
  id: string;
  name: string;
  /** 0 — заговор. */
  level: number;
  school: SpellSchool;
  castingTime: string;
  range: string;
  components: readonly ('V' | 'S' | 'M')[];
  material?: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  /** Абзацы SRD дословно, через пустую строку. */
  text: string;
  higherLevel?: string;
  classes: readonly SrdClassId[];
  source: 'srd';
}

export interface SubclassSpell { id: string; classLevel: number; terrain?: string }

const DATA = raw as unknown as {
  source: string;
  fetchedAt: string;
  spells: Spell[];
  subclassSpells: Record<string, { class: SrdClassId; name: string; spells: SubclassSpell[] }>;
};

export const SPELL_LIST: readonly Spell[] = DATA.spells;
export const SPELLS: Readonly<Record<string, Spell>> = Object.fromEntries(DATA.spells.map(s => [s.id, s]));
export const SPELLS_SOURCE = { source: DATA.source, fetchedAt: DATA.fetchedAt } as const;

/** Подкласс SRD с собственным списком: индекс API (life, devotion, land, fiend) → класс и заклинания. */
export const SRD_SUBCLASS_SPELLS = DATA.subclassSpells;

export const isSpellId = (id: string): boolean => Object.hasOwn(SPELLS, id);

/** Единицы срока SRD в секундах: раунд — 6 с (SRD, Combat Sequence: «A round represents about 6 seconds in the game world.»). */
const UNIT_SEC: Readonly<Record<string, number>> = { round: 6, minute: 60, hour: 3600, day: 86400 };

/**
 * Срок концентрации из поля duration SRD: «Up to 1 hour» → 3600. Не концентрация или срок не «Up to N …» — undefined.
 * Срок от ячейки выше (Hunter's Mark — 8 ч с 3-го круга) — в higherLevel текстом; здесь базовый.
 */
export function concentrationSec(spell: Spell): number | undefined {
  if (!spell.concentration) return undefined;
  const m = /^Up to (\d+) (round|minute|hour|day)s?$/i.exec(spell.duration.trim());
  return m ? Number(m[1]) * UNIT_SEC[m[2].toLowerCase()] : undefined;
}

/** Список заклинаний класса SRD до круга maxLevel включительно (заговоры — круг 0), по кругу и имени. */
export function classSpellList(classId: SrdClassId, maxLevel: number): Spell[] {
  return SPELL_LIST.filter(s => s.level <= maxLevel && s.classes.includes(classId));
}

/** Школы — по-русски, как в переводе книги игрока. */
export const SCHOOL_LABEL: Readonly<Record<SpellSchool, string>> = {
  abjuration: 'ограждение', conjuration: 'вызов', divination: 'прорицание', enchantment: 'очарование',
  evocation: 'воплощение', illusion: 'иллюзия', necromancy: 'некромантия', transmutation: 'преобразование',
};

/** «Заговор» или «1 круг» — подпись круга. */
export const spellLevelLabel = (level: number): string => (level === 0 ? 'заговор' : `${level} круг`);
