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

export interface SubraceSpell {
  level: number;
  name: string;
  /** Связи для разветвлённых таблиц: круг Земли по местности, покровитель Гений по виду. */
  terrain?: string;
  variant?: string;
  source?: Source;
  srdId?: string;
  nameEn?: string;
  sourceCell?: string;
  optionCell?: string;
}

/**
 * Гибкие бонусы расы (Q11): «+1 к N характеристикам на выбор из from». Импортёр читает их из строки таблицы
 * («+2 к одной и 1 во всех остальных пяти» — +2 и +1 к одной на выбор) и из правила SRD (полуэльф: две по +1).
 */
export interface AsiChoice { count: number; amount: number; from: Ability[] }

export interface Subrace {
  id: string;
  name: string;
  nameRu: string;
  source: Source;
  asi: Asi;
  asiChoice?: AsiChoice;
  traits: Trait[];
  spells: SubraceSpell[];
}

export interface Race {
  id: string;
  name: string;
  nameRu: string;
  source: Source;
  asi?: Asi;
  asiChoice?: AsiChoice;
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
  /** Уточнение происхождения, если исходная таблица не сохранила маркировку (например, «HB»). */
  sourceRef?: string;
  /**
   * Требования: abilities — колонки таблицы (13 или выше в одной из них), spellcasting — колонка «заклинания»;
   * остальное импортёр снимает со строки «Требование: …» текста: уровень, порог характеристики, владение
   * доспехами или воинским оружием, заговор. text — строка как в таблице.
   */
  prerequisites: {
    abilities: Ability[];
    spellcasting: boolean;
    text?: string;
    level?: number;
    minScore?: Partial<Record<Ability, number>>;
    armor?: 'light' | 'medium' | 'heavy';
    weapons?: 'martial';
    cantrip?: boolean;
  };
  /** Какие характеристики черта позволяет повысить на 1. */
  asi: Ability[];
  effects: Partial<Record<FeatEffectKind, string>>;
  text: string;
}

export interface ClassFeature {
  id: string;
  name: string;
  text: string;
  /** Место выбора: в таблице стоял вариант блока («Сражение большим оружием») — это выбор из блока с этим id. */
  choice?: string;
}
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
  /**
   * Заклинания подкласса из таблицы (домены, клятвы, покровители): русские имена как в таблице. level — строка таблицы:
   * уровень класса (spellLevel: 'class') или круг заклинания у колдуна ('spell'). С SRD по имени пока не связаны.
   */
  spells?: SubraceSpell[];
  spellLevel?: 'class' | 'spell';
  /** Подписи колонок над первым умением («Заклинания клятвы», «Ячейки заклинаний») — не умения. */
  labels?: string[];
  /** Строка «Предрасположенность» под таблицей: расы, места, покровители, которым подкласс подходит. */
  affinity?: string[];
  /** «Спутник/ Гримуар»: имя и текст спутника подкласса. */
  companion?: { name: string; text: string };
}

/** Вариант из списка выбора под таблицей класса: боевой стиль, приём, метамагия, инфузия, руна. */
export interface ClassOption {
  id: string;
  name: string;
  text: string;
  source: Source;
  /** Имя в SRD 5.1, если вариант оттуда (Defense, Careful Spell). */
  srdName?: string;
  cell?: string;
}

/** Список выбора: заголовок блока под таблицей уровней и варианты под ним; у подкласса — subclassId. */
export interface ClassOptionBlock {
  id: string;
  name: string;
  text: string;
  /** Number of choices explicitly stated by the source for each acquisition of this option block. */
  choose?: number;
  subclassId?: string;
  items: ClassOption[];
}

/** Structured display of the imported starting-equipment row; it is not a character selection. */
export interface ClassStartingEquipmentPlan {
  sourceSheet: string;
  sourceCell: string;
  granted: string[];
  choices: { name: string; options: string[] }[];
  wholeSetAlternative: string;
  raw: string;
}

export interface CharacterClass {
  id: string;
  name: string;
  nameRu: string;
  source: Source;
  proficiencies: Partial<Record<'asiRule' | 'skills' | 'armor' | 'weapons' | 'tools' | 'equipment', string>>;
  startingEquipmentPlan?: ClassStartingEquipmentPlan;
  levels: ClassLevel[];
  subclasses: Subclass[];
  /** Списки выбора под таблицей (боевой стиль, приёмы, метамагия…); импортёр переносит блок, стоящий не на своём листе. */
  options?: ClassOptionBlock[];
}

export interface CompendiumMeta {
  importedAt: string;
  importer: string;
  sources: Record<string, string>;
  license: string;
}
