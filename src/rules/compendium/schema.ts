// Компендиум: расы, черты, классы — модель, снятая с наработанных таблиц (см. scripts/import-compendium.py).
// Фасеты черт и вектор эффектов черт — структура таблиц; типизированные Effect для движка придут вторым проходом.

/** Откуда запись: SRD 5.1 (CC-BY-4.0) · перевод книги WotC (только для своего стола) · хоумбрю. */
export type Source = 'srd' | 'book' | 'hb';

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type Asi = Partial<Record<Ability, number>>;

/** Фасет расовой черты — колонки листа «Кратко» плюс то, что таблица оставила прозой. */
export type TraitKind =
  | 'vision' | 'size' | 'natural-armor' | 'save' | 'limbs' | 'resistance' | 'skill'
  | 'proficiency' | 'weapon-armor' | 'tool' | 'unarmed' | 'movement' | 'spell' | 'sense' | 'other';

export interface Trait {
  id: string;
  name: string;
  kind: TraitKind;
  /** fill — серая отметка в фасетной колонке таблицы; keyword — по названию черты; text — по началу текста (обе — эвристики импортёра). */
  kindSource: 'fill' | 'keyword' | 'text';
  text: string;
  /** Адрес клетки в исходной таблице — чтобы найти и поправить руками. */
  cell?: string;
}

export interface SubraceSpell { level: number; name: string }

export interface Subrace {
  id: string;
  name: string;
  nameRu: string;
  source: Source;
  asi: Asi;
  traits: Trait[];
  spells: SubraceSpell[];
}

export interface Race {
  id: string;
  name: string;
  nameRu: string;
  source: Source;
  asi?: Asi;
  traits: Trait[];
  subraces: Subrace[];
  /** Отметки фасетных колонок B–K: «vision», «unarmed: Когти». Заполнены не у всех рас. */
  facetMarks: string[];
}

/** Колонки эффектов листа «Нерасовые черты». */
export type FeatEffectKind =
  | 'saves' | 'advantage' | 'tools' | 'weapons-armor' | 'skills' | 'cantrips' | 'spells'
  | 'damage' | 'ac' | 'hp' | 'bonus' | 'speed' | 'attack-roll' | 'initiative';

export interface Feat {
  id: string;
  name: string;
  nameRu: string;
  source: Source;
  prerequisites: { abilities: Ability[]; spellcasting: boolean };
  /** Какие характеристики черта позволяет повысить на 1. */
  asi: Ability[];
  effects: Partial<Record<FeatEffectKind, string>>;
  text: string;
}

export interface ClassFeature { id: string; name: string; text: string }
export interface SubclassFeature extends ClassFeature { level: number }

export interface ClassLevel {
  level: number;
  proficiencyBonus: number | null;
  features: ClassFeature[];
  /** Ячейки заклинаний, известные заклинания, очки ци, урон ярости… — заголовок колонки → значение. */
  resources: Record<string, string>;
}

export interface Subclass {
  id: string;
  name: string;
  source: Source;
  gainedAt: number | null;
  features: SubclassFeature[];
}

export interface CharacterClass {
  id: string;
  name: string;
  nameRu: string;
  source: Source;
  proficiencies: Partial<Record<'asiRule' | 'skills' | 'armor' | 'weapons' | 'tools' | 'equipment', string>>;
  levels: ClassLevel[];
  subclasses: Subclass[];
}

export interface CompendiumMeta {
  importedAt: string;
  importer: string;
  sources: Record<string, string>;
  license: string;
}
