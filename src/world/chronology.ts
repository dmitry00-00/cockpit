// Хронология канона и слепок мира на год (DESIGN Д5, идея владельца 29.10.2026): статьи-годы Forgotten Realms Wiki
// (CC BY-SA 3.0), импорт — scripts/import-chronology.py. Строки событий — английские, как в вики (решение владельца
// 29.10). Индекс лет (≈0,26 МБ) и десять кусков событий грузятся по требованию — только когда открыта хронология.
//
// Слепок — проекция, не хранимый дамп: из справочника (NPC, организации) и событий на выбранный год. Годов у записи
// нет — статус «без дат», а не «жив»: слепок не догадывается. Год — линза, не событие: состояние кампании он не меняет.
import { eraOf, type Era } from '../campaign/era';
import { DEFAULT_SETTING_PACKAGE, loadPackageJson, loadSettingJson, packageLayerPaths, loadCachedPromise } from '../packages/registry';
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
  /** Строки слоя летописей, схлопнутые с тем же событием статей-годов. */
  articleSources?: readonly { title: string; section?: string; how: string }[];
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
const CHUNKS = packageLayerPaths(DEFAULT_SETTING_PACKAGE, 'content/chronology/events')
  .map(path => () => loadPackageJson(DEFAULT_SETTING_PACKAGE, path));

let index: Promise<ChronoIndex> | null = null;
/** Индекс хронологии: годы, эпохи, куски; повторный вызов — тот же промис. */
export function loadChronoIndex(): Promise<ChronoIndex> {
  index ??= loadSettingJson('content/chronology/index.json').then(raw => raw as ChronoIndex).catch(error => { index = null; throw error; });
  return index;
}

const chunkCache = new Map<string, Promise<readonly ChronoEvent[]>>();
const loadChunk = (n: number): Promise<readonly ChronoEvent[]> => {
  return loadCachedPromise(chunkCache, String(n), () => CHUNKS[n]().then(raw => (raw as { events: ChronoEvent[] }).events));
};

/** События лет from…to включительно — грузятся только нужные куски; порядок — по году и дате. */
export async function loadEvents(from: number, to: number): Promise<ChronoEvent[]> {
  const idx = await loadChronoIndex();
  const parts = await Promise.all(idx.chunks.filter(c => c.to >= from && c.from <= to).map(c => loadChunk(c.n)));
  return parts.flat().filter(e => e.year >= from && e.year <= to);
}

// Слой статей (scripts/import-chronology-articles.py, 30.10.2026): летописи списком, карточки Conflict и Event, предложения
// разделов History держав — сверх статей-годов. Свой индекс и десять кусков; `same` — id совпадающего события статей-годов.
export interface ArticleEvent extends Omit<ChronoEvent, 'kind'> {
  kind?: ChronoKind;
  /** Editorial metadata; never a new canonical fact or campaign event. Source-native kinds have no annotation. */
  classification?: {
    version: 'chronology-primary-topic/1';
    origin: 'editorial' | 'canonical-match';
    assignedKind: ChronoKind;
    fingerprint: string;
    reason: string;
    evidence?: string;
    matchedEventId?: string;
    matchedFingerprint?: string;
  };
  /** Конец конфликта, если вики даёт отрезок. */
  to?: number;
  same?: string;
  /** Откуда строка: статья, раздел, способ (timeline · history · conflict · event). */
  src: { title: string; section?: string; how: string };
}

const ARTICLE_CHUNKS = packageLayerPaths(DEFAULT_SETTING_PACKAGE, 'content/chronology/articles')
  .map(path => () => loadPackageJson(DEFAULT_SETTING_PACKAGE, path));

let articleIndex: Promise<{ chunks: readonly { n: number; from: number; to: number }[] }> | null = null;
const articleCache = new Map<string, Promise<readonly ArticleEvent[]>>();

/** События слоя статей за годы from…to включительно — только нужные куски. */
export async function loadArticleEvents(from: number, to: number): Promise<ArticleEvent[]> {
  articleIndex ??= loadSettingJson('content/chronology/articles/index.json').then(raw => raw as { chunks: { n: number; from: number; to: number }[] }).catch(error => { articleIndex = null; throw error; });
  const idx = await articleIndex;
  const parts = await Promise.all(idx.chunks.filter(c => c.to >= from && c.from <= to).map(c => {
    return loadCachedPromise(articleCache, String(c.n), () => ARTICLE_CHUNKS[c.n]().then(raw => (raw as { events: ArticleEvent[] }).events));
  }));
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

/** Слепок на год: имя, эпоха, редакция, события и их места, счётчики статусов NPC и организаций. */
export interface CanonSnapshot {
  year: number;
  name?: string;
  era?: CanonEra;
  /** Редакция полей вики для карточек (3e / 4e / 5e) — та же, что у кампании (campaign/era.ts). */
  edition: Era;
  events: readonly ChronoEvent[];
  /** Места, упомянутые в событиях выбранного года; год относится к событию, не к существованию места. */
  placeMentions: readonly PlaceMention[];
  people: Readonly<Record<LifeStatus, number>>;
  organizations: Readonly<Record<OrgStatus, number>>;
}

export interface PlaceMention {
  ref: string;
  names: readonly string[];
  /** Ссылки на включённые события; год — дата записи события в хронологии. */
  events: readonly { id: string; year: number }[];
}

function placeMentions(events: readonly Pick<ChronoEvent, 'id' | 'year' | 'links'>[]): PlaceMention[] {
  const mentions = new Map<string, { names: Set<string>; events: Map<string, number> }>();
  for (const event of events) {
    for (const link of event.links ?? []) {
      if (!link.ref?.startsWith('place:')) continue;
      const mention = mentions.get(link.ref) ?? { names: new Set<string>(), events: new Map<string, number>() };
      if (link.t.trim()) mention.names.add(link.t.trim());
      mention.events.set(event.id, event.year);
      mentions.set(link.ref, mention);
    }
  }
  return [...mentions.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([ref, mention]) => ({
    ref,
    names: [...mention.names].sort((a, b) => a.localeCompare(b)),
    events: [...mention.events.entries()].map(([id, year]) => ({ id, year })).sort((a, b) => a.year - b.year || a.id.localeCompare(b.id)),
  }));
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
    placeMentions: placeMentions(data.events.filter(e => e.year === year)),
    people,
    organizations,
  };
}

/** Схема выгрузки слепка: меняется — меняется номер. */
export const SNAPSHOT_SCHEMA = 'cockpit.canon-snapshot/2';

/**
 * Слепок для машинной обработки (подсказки модели, аналитика, подготовка к сессии): события периода и записи
 * справочника со статусом на год. Записи без дат не выгружаются как живые — статус undated. Места перечислены только
 * как ссылки из этих событий: годы ниже датируют упоминания, а не появление, существование или владение местом.
 * Авторство вики — в шапке.
 */
export function snapshotExport(year: number, data: {
  index: Pick<ChronoIndex, 'eras' | 'years' | 'attribution' | 'license'>;
  events: readonly ChronoEvent[];
  people?: Iterable<Person>;
  organizations?: Iterable<Organization>;
  articleEvents?: readonly ArticleEvent[];
  /** Сколько лет истории до года брать в события; 0 — только сам год. */
  history?: number;
}) {
  const history = data.history ?? 0;
  const includedEvents = data.events.filter(e => e.year <= year && e.year >= year - history);
  const includedArticles = (data.articleEvents ?? []).filter(e => e.year <= year && e.year >= year - history);
  const snap = snapshotAt(year, { index: data.index, events: data.events });
  return {
    schema: SNAPSHOT_SCHEMA,
    year,
    label: drLabel(year),
    ...(snap.name ? { name: snap.name } : {}),
    ...(snap.era ? { era: snap.era.name } : {}),
    edition: snap.edition,
    source: { attribution: data.index.attribution, license: data.index.license },
    events: includedEvents,
    articleEvents: includedArticles,
    placeMentions: placeMentions([...includedEvents, ...includedArticles]),
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

/** Столбик шкалы: годы from…to и сколько в них событий (по выбранным видам). */
export interface DensityBin { from: number; to: number; count: number }

/** Шаг столбика по ширине окна: тысячелетие, век, десятилетие, год — чтобы столбиков было не больше max. */
export function binSize(from: number, to: number, max = 60): number {
  return [1, 10, 100, 1000, 10000].find(s => Math.ceil((to - from + 1) / s) <= max) ?? 10000;
}

/**
 * Плотность событий на шкале: окно from…to столбиками binSize, границы — круглые (1470–1479, 1400–1499), крайние
 * обрезаны окном. kinds — какие виды считать; нет — все, кроме изданного (оно не событие мира).
 */
export function densityBins(years: readonly ChronoYear[], from: number, to: number, kinds?: ReadonlySet<ChronoKind>): DensityBin[] {
  const size = binSize(from, to);
  const start = Math.floor(from / size) * size;
  const bins: DensityBin[] = [];
  for (let b = start; b <= to; b += size) bins.push({ from: Math.max(from, b), to: Math.min(to, b + size - 1), count: 0 });
  for (const y of years) {
    if (y.year < from || y.year > to || !y.counts) continue;
    const n = Object.entries(y.counts).reduce((s, [k, c]) => s + (kinds ? (kinds.has(k as ChronoKind) ? c : 0) : k === 'publications' ? 0 : c), 0);
    bins[Math.floor((y.year - start) / size)].count += n;
  }
  return bins;
}

/** Окно шире на ступень: год/десятилетие → век, век → эпоха, эпоха → вся хронология. */
export function widerRange(eras: readonly CanonEra[], from: number, to: number): { from: number; to: number } {
  const all = { from: eras[0]?.from ?? from, to: eras[eras.length - 1]?.to ?? to };
  const span = to - from + 1;
  if (span <= 10) {
    const c = Math.floor(from / 100) * 100;
    return { from: Math.max(all.from, c), to: Math.min(all.to, c + 99) };
  }
  const era = canonEraOf(eras, from);
  if (span <= 100 && era && (era.from !== from || era.to !== to)) return { from: era.from, to: era.to };
  return all;
}

/** Окно эпохи, в которой год; вне эпох — вся хронология. */
export function rangeOfYear(eras: readonly CanonEra[], year: number): { from: number; to: number } {
  const era = canonEraOf(eras, year);
  return era ? { from: era.from, to: era.to } : { from: eras[0]?.from ?? year, to: eras[eras.length - 1]?.to ?? year };
}
