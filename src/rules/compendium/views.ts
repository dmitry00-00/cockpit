// Матрицы компендиума — проекции данных в форму таблиц-первоисточников: «раса × фасет», «уровень × подкласс»,
// «черта × эффект». Здесь только данные и чистые функции; экран их рисует.
import type { Ability, Asi, CharacterClass, Feat, FeatEffectKind, Race, Source, Subclass, SubclassFeature, Subrace, Trait, TraitKind } from './schema';

export const ABILITIES: readonly Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ABILITY_LABELS: Readonly<Record<Ability, string>> = { str: 'СИЛ', dex: 'ЛОВ', con: 'ТЕЛ', int: 'ИНТ', wis: 'МДР', cha: 'ХАР' };

/** Порядок колонок листа «Кратко»; «прочее» — то, что таблица оставила прозой, в конце. */
export const TRAIT_KINDS: readonly TraitKind[] = [
  'vision', 'size', 'natural-armor', 'save', 'limbs', 'resistance', 'skill',
  'proficiency', 'weapon-armor', 'tool', 'unarmed', 'movement', 'spell', 'sense', 'other',
];
export const TRAIT_KIND_LABELS: Readonly<Record<TraitKind, string>> = {
  vision: 'Зрение', size: 'Размер', 'natural-armor': 'Природный доспех', save: 'Спасброски', limbs: 'Конечности',
  resistance: 'Сопротивления', skill: 'Навыки', proficiency: 'Владения', 'weapon-armor': 'Оружие и доспехи',
  tool: 'Инструменты', unarmed: 'Природное оружие', movement: 'Передвижение', spell: 'Заклинания', sense: 'Чувства', other: 'Прочее',
};

export const FEAT_EFFECT_KINDS: readonly FeatEffectKind[] = [
  'saves', 'advantage', 'tools', 'weapons-armor', 'skills', 'cantrips', 'spells',
  'damage', 'ac', 'hp', 'bonus', 'speed', 'attack-roll', 'initiative',
];
export const FEAT_EFFECT_LABELS: Readonly<Record<FeatEffectKind, string>> = {
  saves: 'Спасброски', advantage: 'Преимущество', tools: 'Инструменты', 'weapons-armor': 'Оружие и доспехи', skills: 'Навыки',
  cantrips: 'Заговоры', spells: 'Заклинания', damage: 'Урон', ac: 'КД', hp: 'Хиты', bonus: 'Бонусное действие',
  speed: 'Скорость', 'attack-roll': 'Бросок атаки', initiative: 'Инициатива',
};

export const SOURCES: readonly Source[] = ['srd', 'book', 'hb'];
export const SOURCE_LABELS: Readonly<Record<Source, string>> = { srd: 'SRD', book: 'книга', hb: 'HB' };

/** «+2 ЛОВ, +1 МДР» — ASI как строка в порядке характеристик; нули и пустые не печатаются. */
export function formatAsi(asi: Asi | undefined): { ability: Ability; value: number }[] {
  if (!asi) return [];
  return ABILITIES.flatMap(a => (asi[a] ? [{ ability: a, value: asi[a]! }] : []));
}

export interface RaceFacetRow {
  key: string;
  level: 'race' | 'subrace';
  id: string;
  name: string;
  nameRu: string;
  source: Source;
  asi: Asi | undefined;
  cells: Readonly<Record<TraitKind, readonly Trait[]>>;
  /** Серые отметки листа «Кратко» по фасетам: true — просто отмечено, строка — что именно («Когти»). Только у рас. */
  marks: Partial<Record<TraitKind, string | true>>;
  spells: Subrace['spells'];
}

function emptyCells(): Record<TraitKind, Trait[]> {
  const cells = {} as Record<TraitKind, Trait[]>;
  for (const k of TRAIT_KINDS) cells[k] = [];
  return cells;
}

/** «vision», «limbs: Когти» → { vision: true, limbs: 'Когти' }; неизвестный фасет пропускается молча — это отметка, не данные. */
export function marksOf(facetMarks: readonly string[]): Partial<Record<TraitKind, string | true>> {
  const marks: Partial<Record<TraitKind, string | true>> = {};
  for (const m of facetMarks) {
    const [kind, ...rest] = m.split(':');
    const k = kind.trim() as TraitKind;
    if (!TRAIT_KINDS.includes(k)) continue;
    const value = rest.join(':').trim();
    if (value) marks[k] = value;
    else marks[k] ??= true;
  }
  return marks;
}

function cellsOf(traits: readonly Trait[]): Record<TraitKind, Trait[]> {
  const cells = emptyCells();
  for (const t of traits) cells[t.kind].push(t);
  return cells;
}

/**
 * Строки матрицы «раса × фасет»: раса, под ней её подрасы. Подраса без собственного источника в списке
 * не показывается, а раса остаётся, если разрешён её источник или хоть одной её подрасы — иначе SRD-подраса
 * теряла бы родителя.
 */
export function raceFacetRows(races: readonly Race[], sources: readonly Source[]): RaceFacetRow[] {
  const allowed = new Set(sources);
  const rows: RaceFacetRow[] = [];
  for (const r of races) {
    const subs = r.subraces.filter(s => allowed.has(s.source));
    if (!allowed.has(r.source) && subs.length === 0) continue;
    rows.push({ key: r.id, level: 'race', id: r.id, name: r.name, nameRu: r.nameRu, source: r.source, asi: r.asi, cells: cellsOf(r.traits), marks: marksOf(r.facetMarks), spells: [] });
    for (const s of subs) {
      rows.push({ key: `${r.id}/${s.id}`, level: 'subrace', id: s.id, name: s.name, nameRu: s.nameRu, source: s.source, asi: s.asi, cells: cellsOf(s.traits), marks: {}, spells: s.spells });
    }
  }
  return rows;
}

/**
 * Порядок колонок фасетов: чем чаще фасет встречается во всём компендиуме, тем левее — заполненные
 * колонки видны без прокрутки, а порядок не скачет от фильтра. «Прочее» всегда последнее.
 */
export function traitKindOrder(races: readonly Race[]): TraitKind[] {
  const count = new Map<TraitKind, number>(TRAIT_KINDS.map(k => [k, 0]));
  for (const r of races) for (const t of [...r.traits, ...r.subraces.flatMap(s => s.traits)]) count.set(t.kind, (count.get(t.kind) ?? 0) + 1);
  const named: TraitKind[] = TRAIT_KINDS.filter(k => k !== 'other');
  named.sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0) || TRAIT_KINDS.indexOf(a) - TRAIT_KINDS.indexOf(b));
  return [...named, 'other'];
}

/** Колонки фасетов, в которых хоть у кого-то из строк что-то есть — пустые столбцы таблицу только растягивают. */
export function usedTraitKinds(rows: readonly RaceFacetRow[], order: readonly TraitKind[] = TRAIT_KINDS): TraitKind[] {
  return order.filter(k => rows.some(r => r.cells[k].length > 0 || r.marks[k] !== undefined));
}

/** «+1 ко всем» у человека вместо шести чипов; иначе — список ненулевых. */
export const isFlatAsi = (asi: Asi | undefined): boolean =>
  !!asi && ABILITIES.every(a => asi[a] !== undefined && asi[a] === asi.str);

export interface ClassLevelRow {
  level: number;
  proficiencyBonus: number | null;
  resources: Readonly<Record<string, string>>;
  features: CharacterClass['levels'][number]['features'];
  bySubclass: Readonly<Record<string, readonly SubclassFeature[]>>;
}

export interface ClassLevelGrid {
  /** Заголовки колонок ресурсов в порядке первого появления; ячейки заклинаний — цифрами «0»…«9». */
  resourceKeys: string[];
  subclasses: Subclass[];
  rows: ClassLevelRow[];
}

/** Сетка «уровень × подкласс» одного класса: 20 строк, ресурсы и умения класса слева, подклассы справа. */
export function classLevelGrid(cls: CharacterClass, sources: readonly Source[]): ClassLevelGrid {
  const allowed = new Set(sources);
  const subclasses = cls.subclasses.filter(s => allowed.has(s.source));
  const resourceKeys: string[] = [];
  for (const lv of cls.levels) for (const k of Object.keys(lv.resources)) if (!resourceKeys.includes(k)) resourceKeys.push(k);
  const rows = cls.levels.map(lv => ({
    level: lv.level,
    proficiencyBonus: lv.proficiencyBonus,
    resources: lv.resources,
    features: lv.features,
    bySubclass: Object.fromEntries(subclasses.map(s => [s.id, s.features.filter(f => f.level === lv.level)])),
  }));
  return { resourceKeys, subclasses, rows };
}

/** Ключ ресурса — уровень ячейки заклинаний? Цифра «0» — заговоры. */
export const isSlotKey = (key: string) => /^\d$/.test(key);

export interface FeatRow {
  feat: Feat;
  /** Колонки эффектов, где у черты что-то стоит. */
  effectKinds: FeatEffectKind[];
}

export function featRows(feats: readonly Feat[], sources: readonly Source[], query = ''): FeatRow[] {
  const allowed = new Set(sources);
  const q = query.trim().toLowerCase();
  return feats
    .filter(f => allowed.has(f.source))
    .filter(f => !q || f.name.toLowerCase().includes(q) || f.nameRu.toLowerCase().includes(q) || f.text.toLowerCase().includes(q))
    .map(feat => ({ feat, effectKinds: FEAT_EFFECT_KINDS.filter(k => feat.effects[k]) }));
}

/** Колонки эффектов, занятые хоть одной чертой во всём компендиуме, чаще — левее; порядок не зависит от фильтра. */
export function effectKindOrder(feats: readonly Feat[]): FeatEffectKind[] {
  const count = (k: FeatEffectKind) => feats.filter(f => f.effects[k]).length;
  return [...FEAT_EFFECT_KINDS].sort((a, b) => count(b) - count(a) || FEAT_EFFECT_KINDS.indexOf(a) - FEAT_EFFECT_KINDS.indexOf(b));
}

/** Колонки эффектов, занятые хоть одной чертой в выборке. */
export function usedEffectKinds(rows: readonly FeatRow[], order: readonly FeatEffectKind[] = FEAT_EFFECT_KINDS): FeatEffectKind[] {
  return order.filter(k => rows.some(r => r.effectKinds.includes(k)));
}

/**
 * Уровни повышения характеристик по SRD 5.1: у всех классов 4, 8, 12, 16, 19; воин добавляет 6 и 14, плут — 10.
 * Таблица этих клеток не содержит, поэтому — правило, а не данные; ключи — id классов компендиума.
 */
export function asiLevels(classId: string): ReadonlySet<number> {
  const base = [4, 8, 12, 16, 19];
  if (classId === 'voin') return new Set([...base, 6, 14]);
  if (classId === 'plut') return new Set([...base, 10]);
  return new Set(base);
}
