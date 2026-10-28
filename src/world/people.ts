// NPC мира (E9): поля карточек {{Person}} Forgotten Realms Wiki (CC BY-SA 3.0), импорт — scripts/import-people.py.
// 20 тысяч записей — несколько мегабайт: восемь кусков по хэшу id грузятся вместе, только когда нужна карточка NPC;
// индекс «место → жители» — отдельно и меньше, его читает карточка места. Год кампании — фильтр «жив»: родился не
// позже и не умер к этому году; годы неизвестны — считается живым.

export interface Person {
  id: string;
  /** Латиницей, как в книгах. */
  name: string;
  /** Заголовок статьи вики. */
  title: string;
  /** Первый титул: «Open Lord of Waterdeep». */
  t?: string;
  race?: string;
  sex?: string;
  occ?: string;
  /** Дом словами вики: «Waterdeep, Sword Coast North». */
  home?: string;
  /** Место справочника карты по дому. */
  place?: string;
  /** Бог-покровитель — id справочника богов; не нашёлся — словами. */
  deity?: string;
  deityText?: string;
  /** Организации — id справочника организаций по категориям «Members of …» (состоял когда-либо). */
  orgs?: readonly string[];
  /** Годы DR. */
  born?: number;
  died?: number;
  refs?: readonly string[];
}

/** Житель места в индексе: id, имя, год рождения и смерти (DR) — null, если неизвестны. */
export type Resident = readonly [id: string, name: string, born: number | null, died: number | null];

export const WIKI = 'https://forgottenrealms.fandom.com/wiki/';
export const personUrl = (p: Person) => WIKI + encodeURIComponent(p.title.replace(/ /g, '_')).replace(/%2F/g, '/');

/** Жив в год кампании: годы неизвестны — жив. */
export const aliveIn = (born: number | null | undefined, died: number | null | undefined, year: number): boolean =>
  (born == null || born <= year) && (died == null || died > year);

// Восемь кусков по хэшу id (import-people.py, BUCKETS): каждый — свой файл сборки, путь — строкой, чтобы сборщик их видел.
const CHUNKS: readonly (() => Promise<{ default: unknown }>)[] = [
  () => import('../../content/world/people/0.json'), () => import('../../content/world/people/1.json'),
  () => import('../../content/world/people/2.json'), () => import('../../content/world/people/3.json'),
  () => import('../../content/world/people/4.json'), () => import('../../content/world/people/5.json'),
  () => import('../../content/world/people/6.json'), () => import('../../content/world/people/7.json'),
];

let all: Promise<ReadonlyMap<string, Person>> | null = null;
/** Все NPC — восемь кусков разом; повторный вызов — тот же промис. */
export function loadPeople(): Promise<ReadonlyMap<string, Person>> {
  all ??= Promise.all(CHUNKS.map(load => load()))
    .then(chunks => new Map(chunks.flatMap(c => (c.default as { people: Person[] }).people).map(p => [p.id, p])));
  return all;
}

let index: Promise<Readonly<Record<string, readonly Resident[]>>> | null = null;
/** Место справочника карты → жители. */
export function loadResidents(): Promise<Readonly<Record<string, readonly Resident[]>>> {
  index ??= import('../../content/world/people-index.json').then(m => (m.default as unknown as { places: Record<string, Resident[]> }).places);
  return index;
}

/** Жители места, живые в год кампании, по имени. */
export const residentsAlive = (list: readonly Resident[] | undefined, year: number): Resident[] =>
  (list ?? []).filter(([, , b, d]) => aliveIn(b, d, year)).sort((a, b) => a[1].localeCompare(b[1]));
