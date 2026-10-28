// Великое колесо для уровней лестницы «космология» и «план» (HANDOFF §3): внешние планы кольцом по мировоззрению,
// Outlands с Sigil в середине и города-врата к каждому плану, Материальный с переходными, параллельными и
// внутренними планами. Факты — карточки {{Plane}} Forgotten Realms Wiki (CC BY-SA 3.0, см. LICENSE.md), импорт —
// scripts/import-planes.py. Место плана на кольце — его сетка мировоззрения: закон слева, хаос справа, добро сверху,
// зло снизу; раскладка своя.
import raw from '../../content/cosmos/great-wheel.json';
import treeRaw from '../../content/cosmos/world-tree.json';

export type PlaneKind = 'outer' | 'realm' | 'transitive' | 'material' | 'parallel' | 'inner' | 'energy'
  /** Великое древо: небесные, нейтральные, дьявольские и вне Древа. */
  | 'celestial' | 'neutral' | 'fiendish' | 'outside';

/** Значение свойства: дословно из вики и по-русски по словарю импорта. */
export interface Trait { en: string; ru: string }

export interface Plane {
  id: string;
  /** Латиницей, как в книгах. */
  name: string;
  kind: PlaneKind;
  url: string;
  /** Ячейки сетки мировоззрения: LG, NG, CG, LN, N, CN, LE, NE, CE. */
  alignment: readonly string[];
  /** Мировоззрение словами, где вики не даёт сетку (Великое древо: «слабо добрый»). */
  alignmentText?: Trait;
  /** Место небесного плана на Великом древе. */
  place?: 'root' | 'trunk' | 'branch' | 'top';
  shape?: Trait;
  gravity?: Trait;
  time?: Trait;
  morphic?: Trait;
  elements?: Trait;
  magic?: Trait;
  layers?: readonly string[];
  /** Где лежит (Sigil — в Outlands). */
  location?: string;
  refs: readonly string[];
  /** Карточка по-русски из ночной разметки L4, где готова. */
  card?: { what?: string; ruler?: string; danger?: string; summary?: string };
}

export interface PlaneLink { from: string; to: string; kind: 'astral' | 'ethereal' | 'echo' | 'portal' | 'intermittent'; quote: string; url: string; ref: string | null }

/** Цитата статьи о модели: что она утверждает и где. */
export interface Quote { quote: string; url: string; ref: string | null }

export interface GateTown { town: string; plane: string; url: string }

export interface GreatWheel {
  planes: readonly Plane[];
  links: readonly PlaneLink[];
  outlands: { gates: readonly GateTown[]; quote: string; travelQuote: string; travelDays: readonly [number, number]; url: string; ref: string | null; travelRef: string | null };
  attribution: string;
  note: string;
}

export const GREAT_WHEEL: GreatWheel = raw as unknown as GreatWheel;

export const PLANE_KIND_LABEL: Readonly<Record<PlaneKind, string>> = {
  outer: 'внешний план', realm: 'владение', transitive: 'переходный план', material: 'Материальный план',
  parallel: 'план-отражение', inner: 'внутренний план', energy: 'план энергии',
  celestial: 'небесный план', neutral: 'нейтральный план', fiendish: 'дьявольский план', outside: 'вне Древа',
};

export const ALIGNMENT_LABEL: Readonly<Record<string, string>> = {
  LG: 'законно-добрый', NG: 'нейтрально-добрый', CG: 'хаотично-добрый', LN: 'законно-нейтральный', N: 'нейтральный',
  CN: 'хаотично-нейтральный', LE: 'законно-злой', NE: 'нейтрально-злой', CE: 'хаотично-злой',
};

/** Свойства плана в порядке карточки. */
export const TRAIT_ROWS: readonly (readonly ['shape' | 'gravity' | 'time' | 'morphic' | 'elements' | 'magic', string])[] = [
  ['shape', 'Форма'], ['gravity', 'Гравитация'], ['time', 'Время'], ['morphic', 'Изменчивость'], ['elements', 'Стихии и энергия'], ['magic', 'Магия'],
];

/** Ячейки по краю сетки по часовой стрелке от левой верхней: LG сверху слева, NG сверху, … LN слева. */
const EDGE: Readonly<Record<string, number>> = { LG: 0, NG: 1, CG: 2, CN: 3, CE: 4, NE: 5, LE: 6, LN: 7 };

/**
 * Угол плана на кольце (радианы, экранные: 0 — вправо, по часовой — вниз): добро сверху, хаос справа, зло снизу,
 * закон слева. План на двух ячейках (Bytopia — LG и NG) — посередине между ними.
 */
export function ringAngle(p: Plane): number {
  const cells = p.alignment.filter(a => a in EDGE);
  let x = 0;
  let y = 0;
  for (const c of cells) {
    const a = ((-135 + 45 * EDGE[c]) * Math.PI) / 180;
    x += Math.cos(a);
    y += Math.sin(a);
  }
  return Math.atan2(y, x);
}

/** Внешние планы кольца по часовой стрелке от Mount Celestia (сверху слева). */
export function ringPlanes(w: GreatWheel = GREAT_WHEEL): Plane[] {
  const turn = (p: Plane) => (ringAngle(p) - (-135 * Math.PI) / 180 + 4 * Math.PI) % (2 * Math.PI);
  return w.planes.filter(p => p.kind === 'outer' && p.id !== 'outlands').sort((a, b) => turn(a) - turn(b));
}

export const planeById = (id: string, w: GreatWheel = GREAT_WHEEL): Plane | undefined => w.planes.find(p => p.id === id);

/** Мировоззрение словами: «законно-добрый / нейтрально-добрый». */
export const alignmentLabel = (p: Plane): string => p.alignment.map(a => ALIGNMENT_LABEL[a] ?? a).join(' / ');

/** Город-врата Outlands к плану. */
export const gateOf = (planeId: string, w: GreatWheel = GREAT_WHEEL): GateTown | undefined => w.outlands.gates.find(g => g.plane === planeId);

/** Имя места мира (сид, лестница) → план: латиница вики или русское имя понятия, как в сиде. */
const PLANE_ALIASES: Readonly<Record<string, readonly string[]>> = { material: ['Материальный', 'Материальный план'] };
export const COSMOLOGY_NAMES: readonly string[] = ['Великое Колесо', 'Great Wheel'];

export function planeOfLocation(name: string, w: GreatWheel = GREAT_WHEEL): Plane | undefined {
  return w.planes.find(p => p.name === name || PLANE_ALIASES[p.id]?.includes(name));
}

/**
 * Великое древо (World Tree, модель 1372 DR): небесные планы на самом Древе, дьявольские — по River of Blood,
 * нейтральные — только на ветвях Astral; Cynosure и Fugue Plane — вне Древа. Все ветви Astral ведут через
 * Материальный: между двумя внешними или внутренними планами — только через него или порталом.
 */
export interface WorldTree {
  planes: readonly Plane[];
  links: readonly PlaneLink[];
  tree: Quote;
  river: Quote & { order: readonly string[] };
  notes: Readonly<Record<'astral' | 'inner' | 'neutral' | 'outside' | 'ethereal' | 'shadow', Quote>>;
  attribution: string;
  note: string;
}

export const WORLD_TREE: WorldTree = treeRaw as unknown as WorldTree;

export const PLACE_LABEL: Readonly<Record<NonNullable<Plane['place']>, string>> = {
  root: 'корни Древа', trunk: 'ствол Древа', branch: 'ветви Древа', top: 'вершина Древа',
};

/** Соседи по River of Blood: откуда река приходит и куда уходит. */
export function riverOf(id: string, t: WorldTree = WORLD_TREE): { from?: string; to?: string } | undefined {
  const i = t.river.order.indexOf(id);
  if (i < 0) return undefined;
  return { from: t.river.order[i - 1], to: t.river.order[i + 1] };
}

/** Порталы плана на Великом древе: другой конец и цитата. */
export function portalsOf(id: string, t: WorldTree = WORLD_TREE): { other: string; link: PlaneLink }[] {
  return t.links.filter(l => l.from === id || l.to === id).map(l => ({ other: l.from === id ? l.to : l.from, link: l }));
}
