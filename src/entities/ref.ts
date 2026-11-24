// Адресация сущностей (ROADMAP 0.2): у каждой сущности — ссылка-строка «вид:id». По ней карточка, поиск, упоминания
// в журнале и связи между сущностями находят одно и то же. Составные id — через точку: подраса «elf.high», умение
// «klass.umenie», черта расы «rasa.cherta» и «rasa.podrasa.cherta» (id умений и черт уникальны только внутри своего
// класса и расы).

/** Справочные виды — из content/, только чтение, с источником. */
export const REFERENCE_KINDS = [
  'condition', 'ability', 'skill', 'resource', 'spell', 'item', 'monster',
  'race', 'subrace', 'trait', 'class', 'subclass', 'feature', 'feat', 'background',
  'plane', 'body', 'sphere', 'deity', 'pantheon', 'place', 'person', 'organization', 'kingdom', 'event',
] as const;

/** Виды состояния — из State, меняются событиями. */
export const STATE_KINDS = ['actor', 'location', 'faction', 'thread'] as const;

export type ReferenceKind = (typeof REFERENCE_KINDS)[number];
export type StateKind = (typeof STATE_KINDS)[number];
export type EntityKind = ReferenceKind | StateKind;
export type EntityRef = `${EntityKind}:${string}`;

export const KIND_LABEL: Readonly<Record<EntityKind, string>> = {
  condition: 'Состояние',
  ability: 'Характеристика',
  skill: 'Навык',
  resource: 'Ресурс',
  spell: 'Заклинание',
  item: 'Предмет',
  monster: 'Чудовище',
  race: 'Раса',
  subrace: 'Подраса',
  trait: 'Особенность расы',
  class: 'Класс',
  subclass: 'Подкласс',
  feature: 'Умение класса',
  feat: 'Черта',
  background: 'Предыстория',
  plane: 'План',
  body: 'Небесное тело',
  sphere: 'Хрустальная сфера',
  deity: 'Божество',
  pantheon: 'Пантеон',
  place: 'Место',
  person: 'NPC',
  organization: 'Организация',
  // Держава — свой вид (решение пользователя 30.10.2026): у неё правители по годам, население, торговля и история,
  // которых нет ни у места карты, ни у организации.
  kingdom: 'Держава',
  event: 'Событие',
  actor: 'Персонаж',
  location: 'Место кампании',
  faction: 'Фракция',
  thread: 'Нить',
};

const KINDS: ReadonlySet<string> = new Set<string>([...REFERENCE_KINDS, ...STATE_KINDS]);

export const isStateKind = (kind: EntityKind): kind is StateKind => (STATE_KINDS as readonly string[]).includes(kind);

export function ref(kind: EntityKind, ...id: readonly string[]): EntityRef {
  return `${kind}:${id.join('.')}`;
}

/** «spell:bless» → { kind: 'spell', id: 'bless' }; неизвестный вид или пустой id — null. */
export function parseRef(value: string): { kind: EntityKind; id: string } | null {
  const i = value.indexOf(':');
  if (i <= 0 || i === value.length - 1) return null;
  const kind = value.slice(0, i);
  return KINDS.has(kind) ? { kind: kind as EntityKind, id: value.slice(i + 1) } : null;
}

export const isEntityRef = (value: string): value is EntityRef => parseRef(value) !== null;
