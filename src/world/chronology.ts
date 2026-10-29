// Хронология канона и слепок мира на год (DESIGN Д5, идея владельца 29.10.2026): статьи-годы Forgotten Realms Wiki
// (CC BY-SA 3.0), импорт — scripts/import-chronology.py. Строки событий — английские, как в вики (решение владельца
// 29.10). Индекс лет (≈0,26 МБ) и десять кусков событий грузятся по требованию — только когда открыта хронология.
//
// Слепок — проекция, не хранимый дамп: из справочника (NPC, организации) и событий на выбранный год. Годов у записи
// нет — статус «без дат», а не «жив»: слепок не догадывается. Год — линза, не событие: состояние кампании он не меняет.
import { eraOf, type Era } from '../campaign/era';
import type { Organization } from './organizations';
import type { Person } from './people';

export type ChronoKind =
  | 'politics' | 'conflicts' | 'deaths' | 'births' | 'misc' | 'magic' | 'people' | 'environment' | 'organizations'
  | 'publications' | 'migrations' | 'deities' | 'realmspace' | 'abeir' | 'wildlife';

export const CHRONO_KIND_LABEL: Readonly<Record<ChronoKind, string>> = {
  politics: 'политика', conflicts: 'войны и конфликты', deaths: 'смерти', births: 'рождения', misc: 'прочее',
  magic: 'магия', people: 'люди', environment: 'природа', organizations: 'организации',
  publications: 'изданное об этом годе', migrations: 'переселения', deities: 'боги', realmspace: 'Realmspace',
  abeir: 'Abeir', wildlife: 'звери',
};

/** Событие канона: строка вики по-английски, дата Харптоса — если вики её пишет. */
export interface ChronoEvent {
  id: string;
  year: number;
  kind: ChronoKind;
  text: string;
  /** Месяц Харптоса 1–12 и день; праздник — вместо месяца. */
  month?: number;
  day?: number;
  festival?: string;
  /** Дата словами вики: «2 Mirtul», «Late Eleint». */
  when?: string;
  /** Подзаголовок раздела: «Novels», «Adventures». */
  group?: string;
  /** Вложенная строка — к какому событию. */
  parent?: string;
  /** Ссылки строки: заголовок статьи и, если нашлась, сущность справочника «вид:id». */
  links?: readonly { t: string; ref?: string }[];
  /** Источники сносок: «The Grand History of the Realms, с. 153». */
  cites?: readonly string[];
}

export interface ChronoYear {
  year: number;
  /** Имя года в Roll of Years: «Year of the Ageless One». */
  name?: string;
  /** Метка эпохи статьи-года как в вики (бывает непоследовательной — см. eras). */
  age?: string;
  counts?: Partial<Record<ChronoKind, number>>;
}

/** Эпоха канона: границы — по большинству меток статей-годов (import-chronology.py, eras_of). */
export interface CanonEra { name: string; from: number; to: number }

export interface ChronoIndex {
  attribution: string;
  license: string;
  eras: readonly CanonEra[];
  chunks: readonly { n: number; from: number; to: number; events: number }[];
  years: readonly ChronoYear[];
}

// Куски событий — каждый свой файл сборки; путь строкой, чтобы сборщик их видел.
const CHUNKS: readonly (() => Promise<{ default: unknown }>)[] = [
  () => import('../../content/chronology/events/0.json'), () => import('../../content/chronology/events/1.json'),
  () => import('../../content/chronology/events/2.json'), () => import('../../content/chronology/events/3.json'),
  () => import('../../content/chronology/events/4.json'), () => import('../../content/chronology/events/5.json'),
  () => import('../../content/chronology/events/6.json'), () => import('../../content/chronology/events/7.json'),
  () => import('../../content/chronology/events/8.json'), () => import('../../content/chronology/events/9.json'),
];

let index: Promise<ChronoIndex> | null = null;
/** Индекс хронологии: годы, эпохи, куски; повторный вызов — тот же промис. */
export function loadChronoIndex(): Promise<ChronoIndex> {
  index ??= import('../../content/chronology/index.json').then(m => m.default as unknown as ChronoIndex);
  return index;
}

const chunkCache = new Map<number, Promise<readonly ChronoEvent[]>>();
const loadChunk = (n: number): Promise<readonly ChronoEvent[]> => {
  if (!chunkCache.has(n)) chunkCache.set(n, CHUNKS[n]().then(m => (m.default as { events: ChronoEvent[] }).events));
  return chunkCache.get(n)!;
};

/** События лет from…to включительно — грузятся только нужные куски; порядок — по году и дате. */
export async function loadEvents(from: number, to: number): Promise<ChronoEvent[]> {
  const idx = await loadChronoIndex();
  const parts = await Promise.all(idx.chunks.filter(c => c.to >= from && c.from <= to).map(c => loadChunk(c.n)));
  return parts.flat().filter(e => e.year >= from && e.year <= to);
}

/** Эпоха канона года; до первой и после последней — undefined. */
export function canonEraOf(eras: readonly CanonEra[], year: number): CanonEra | undefined {
  return eras.find(e => year >= e.from && year <= e.to);
}

/** Год как «1479 DR», до нулевого — «−339 DR». */
export const drLabel = (year: number) => `${year < 0 ? '−' : ''}${Math.abs(year)} DR`;

/** События, где упомянута сущность («place:…», «person:…»), — по ссылкам строки. */
export function eventsAbout(events: readonly ChronoEvent[], ref: string): ChronoEvent[] {
  return events.filter(e => e.links?.some(l => l.ref === ref));
}

/** Статус записи справочника на год. undated — у записи нет ни одного года: слепок не догадывается. */
export type LifeStatus = 'alive' | 'dead' | 'unborn' | 'undated';
export type OrgStatus = 'exists' | 'disbanded' | 'notYet' | 'undated';

export function personStatus(p: Pick<Person, 'born' | 'died'>, year: number): LifeStatus {
  if (p.born !== undefined && p.born > year) return 'unborn';
  if (p.died !== undefined && p.died <= year) return 'dead';
  return p.born === undefined && p.died === undefined ? 'undated' : 'alive';
}

export function orgStatus(o: Pick<Organization, 'formed' | 'disbanded'>, year: number): OrgStatus {
  if (o.formed !== undefined && o.formed > year) return 'notYet';
  if (o.disbanded !== undefined && o.disbanded <= year) return 'disbanded';
  return o.formed === undefined && o.disbanded === undefined ? 'undated' : 'exists';
}

/** Слепок мира на год: имя года, эпоха канона, редакция полей, события года и счётчики статусов справочника. */
export interface CanonSnapshot {
  year: number;
  name?: string;
  era?: CanonEra;
  /** Редакция полей вики для карточек (3e / 4e / 5e) — та же, что у кампании (campaign/era.ts). */
  edition: Era;
  events: readonly ChronoEvent[];
  people: Readonly<Record<LifeStatus, number>>;
  organizations: Readonly<Record<OrgStatus, number>>;
}

export function snapshotAt(year: number, data: {
  index: Pick<ChronoIndex, 'eras' | 'years'>;
  events: readonly ChronoEvent[];
  people?: Iterable<Pick<Person, 'born' | 'died'>>;
  organizations?: Iterable<Pick<Organization, 'formed' | 'disbanded'>>;
}): CanonSnapshot {
  const people: Record<LifeStatus, number> = { alive: 0, dead: 0, unborn: 0, undated: 0 };
  for (const p of data.people ?? []) people[personStatus(p, year)] += 1;
  const organizations: Record<OrgStatus, number> = { exists: 0, disbanded: 0, notYet: 0, undated: 0 };
  for (const o of data.organizations ?? []) organizations[orgStatus(o, year)] += 1;
  const y = data.index.years.find(x => x.year === year);
  const era = canonEraOf(data.index.eras, year);
  return {
    year,
    ...(y?.name ? { name: y.name } : {}),
    ...(era ? { era } : {}),
    edition: eraOf(year),
    events: data.events.filter(e => e.year === year),
    people,
    organizations,
  };
}

/** Схема выгрузки слепка: меняется — меняется номер. */
export const SNAPSHOT_SCHEMA = 'cockpit.canon-snapshot/1';

/**
 * Слепок для машинной обработки (подсказки модели, аналитика, подготовка к сессии): события периода и записи
 * справочника со статусом на год. Записи без дат не выгружаются как живые — статус undated. Авторство вики — в шапке.
 */
export function snapshotExport(year: number, data: {
  index: Pick<ChronoIndex, 'eras' | 'years' | 'attribution' | 'license'>;
  events: readonly ChronoEvent[];
  people?: Iterable<Person>;
  organizations?: Iterable<Organization>;
  /** Сколько лет истории до года брать в события; 0 — только сам год. */
  history?: number;
}) {
  const history = data.history ?? 0;
  const snap = snapshotAt(year, { index: data.index, events: data.events });
  return {
    schema: SNAPSHOT_SCHEMA,
    year,
    label: drLabel(year),
    ...(snap.name ? { name: snap.name } : {}),
    ...(snap.era ? { era: snap.era.name } : {}),
    edition: snap.edition,
    source: { attribution: data.index.attribution, license: data.index.license },
    events: data.events.filter(e => e.year <= year && e.year >= year - history),
    people: [...(data.people ?? [])].map(p => ({
      id: p.id, name: p.name, status: personStatus(p, year),
      ...(p.born !== undefined ? { born: p.born } : {}), ...(p.died !== undefined ? { died: p.died } : {}),
      ...(p.place ? { place: p.place } : {}), ...(p.orgs?.length ? { orgs: p.orgs } : {}),
    })),
    organizations: [...(data.organizations ?? [])].map(o => ({
      id: o.id, name: o.name, status: orgStatus(o, year),
      ...(o.formed !== undefined ? { formed: o.formed } : {}), ...(o.disbanded !== undefined ? { disbanded: o.disbanded } : {}),
      ...(o.places?.length ? { places: o.places } : {}),
    })),
  };
}
