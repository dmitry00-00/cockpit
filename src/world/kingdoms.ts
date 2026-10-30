// Державы мира (решение пользователя 30.10.2026 — свой вид сущности `kingdom:`): поля статей-держав Forgotten Realms
// Wiki (CC BY-SA 3.0), импорт — scripts/import-kingdoms.py → content/world/kingdoms.json. Строки — как в вики
// (английские), годы — DR. Отдельным куском, только когда нужна карточка державы. Файла нет (импорт не запускался) —
// справочник пуст, а не ошибка: файл читается через import.meta.glob.
import { WIKI } from './people';
import type { ArticleEvent, ChronoEvent } from './chronology';

export interface KingdomRuler {
  /** Как в вики: «King Foril Obarskyr». */
  t: string;
  /** Когда словами вики: «1479 DR–present». */
  when?: string;
  /** Годы DR, если вики их даёт числом. */
  from?: number;
  to?: number;
  /** Год, на который вики называет правителя («in 1372 DR»), — срока правления нет. */
  at?: number;
  /** Титул из инфобокса: «Queen». */
  role?: string;
  /** NPC справочника. */
  person?: string;
}

export interface Kingdom {
  id: string;
  /** Латиницей, как в вики. */
  name: string;
  /** Заголовок статьи вики. */
  title: string;
  aliases?: readonly string[];
  /** Тип словами вики: «Kingdom», «Empire», «City-state». */
  type?: string;
  capital?: string;
  /** Столица — место справочника карты. */
  capitalPlace?: string;
  government?: string;
  rulers?: readonly KingdomRuler[];
  population?: string;
  languages?: readonly string[];
  /** Боги — id справочника богов; не нашлись — текстом поля. */
  deities?: readonly string[];
  deityText?: string;
  races?: string;
  currency?: string;
  exports?: string;
  imports?: string;
  /** Союзники и враги: державы и организации. */
  allies?: readonly string[];
  enemies?: readonly string[];
  allyOrgs?: readonly string[];
  enemyOrgs?: readonly string[];
  founded?: number;
  dissolved?: number;
  region?: string;
  /** Места справочника карты внутри. */
  places?: readonly string[];
  /** Подпись схемы карты (content/maps/toril-labels.json). */
  label?: string;
  /** Первый абзац статьи как есть. */
  summary?: string;
  refs?: readonly string[];
  /** Годы хронологии, где держава упомянута. */
  years?: readonly number[];
  /** id событий хронологии (статьи-годы и летописи) о державе. */
  events?: readonly string[];
  continent?: string;
  /** Как зовут жителей: «Cormyrean». */
  demonym?: string;
  /** Держава, в которую входит (Silverymoon → Luruar), предшественники и наследники — id держав. */
  within?: readonly string[];
  predecessors?: readonly string[];
  successors?: readonly string[];
  /** Организации, чья статья в категории «Organizations in …» державы. */
  orgs?: readonly string[];
  /** Сама держава — место справочника карты. */
  place?: string;
  /** События инфобокса: «Founding of Airspur», год числом, если вики его даёт. */
  milestones?: readonly { t: string; when?: string; year?: number }[];
}

export const kingdomUrl = (k: Pick<Kingdom, 'title'>) => WIKI + encodeURIComponent(k.title.replace(/ /g, '_')).replace(/%2F/g, '/');

/** Есть в год кампании: основана не позже, не распалась к нему; годы неизвестны — есть. */
export const kingdomExistsIn = (k: Pick<Kingdom, 'founded' | 'dissolved'>, year: number): boolean =>
  (k.founded === undefined || k.founded <= year) && (k.dissolved === undefined || k.dissolved > year);

/** Правитель на год: тот, чьи годы его покрывают; без чисел — не угадываем. Несколько (соправители) — все. */
export function rulersIn(k: Pick<Kingdom, 'rulers'>, year: number): KingdomRuler[] {
  return (k.rulers ?? []).filter(r => r.from !== undefined && r.from <= year && (r.to === undefined || r.to >= year));
}

export const rulerName = (r: KingdomRuler) => (r.role && !r.t.startsWith(r.role) ? `${r.role} ${r.t}` : r.t);

/** С какого года правитель инфобокса без дат считается правящим (решение пользователя 30.10.2026): статья описывает
 *  последнюю редакцию, поэтому «по статье» — только в срезе 1492 DR; в 3e и 4e он был бы чужим (Raedra в 1372 DR). */
export const ARTICLE_RULER_FROM = 1492;

/** Кого показать правителем на год (решение кокпита 30.10.2026): срок правления покрывает год — он; иначе последний,
 *  кого вики называет «на N DR» не позже года, с пометкой года; иначе, с ARTICLE_RULER_FROM, правитель инфобокса без
 *  дат — «по статье»; раньше — никого.
 *  Пометка обязательна: «на 1357 DR» не значит, что он правит и в год кампании. */
export function rulersShown(k: Pick<Kingdom, 'rulers'>, year: number): { rulers: KingdomRuler[]; note?: string } {
  const span = rulersIn(k, year);
  if (span.length) return { rulers: span };
  const all = k.rulers ?? [];
  const at = Math.max(-Infinity, ...all.flatMap(r => (r.at !== undefined && r.at <= year ? [r.at] : [])));
  if (at > -Infinity) return { rulers: all.filter(r => r.at === at), note: `на ${at} DR` };
  const undated = all.filter(r => r.from === undefined && r.to === undefined && r.at === undefined);
  return undated.length && year >= ARTICLE_RULER_FROM ? { rulers: undated, note: 'по статье' } : { rulers: [] };
}

/** Правитель строкой: имена через «; » и пометка в скобках; никого — undefined. */
export function rulersLine(k: Pick<Kingdom, 'rulers'>, year: number): string | undefined {
  const { rulers, note } = rulersShown(k, year);
  if (!rulers.length) return undefined;
  const names = [...new Set(rulers.map(rulerName))].join('; ');
  return note ? `${names} (${note})` : names;
}

const FILES = import.meta.glob<{ default: unknown }>('../../content/world/kingdoms.json');

let all: Promise<ReadonlyMap<string, Kingdom>> | null = null;
/** Все державы; повторный вызов — тот же промис; файла нет — пусто. */
export function loadKingdoms(): Promise<ReadonlyMap<string, Kingdom>> {
  const load = Object.values(FILES)[0];
  all ??= load
    ? load().then(m => new Map((m.default as { kingdoms: Kingdom[] }).kingdoms.map(k => [k.id, k])))
    : Promise.resolve(new Map());
  return all;
}

/**
 * Державы места справочника карты на год: в чьих `places` оно есть, чья это столица или само место-держава; только
 * те, что в этот год есть. Город-государство внутри державы даёт обе — сначала та, чья это столица или сама держава.
 */
export function kingdomsOfPlace(all: Iterable<Kingdom>, placeId: string, year: number): Kingdom[] {
  const own = (k: Kingdom) => k.capitalPlace === placeId || k.place === placeId;
  return [...all]
    .filter(k => (own(k) || k.places?.includes(placeId)) && kingdomExistsIn(k, year))
    .sort((a, b) => Number(own(b)) - Number(own(a)) || a.id.localeCompare(b.id));
}

/** Люди в торговле державы (решение пользователя 30.10.2026): рабы и наёмники из полей экспорта и импорта вики —
 *  признак державы, а не товар рынка; цены у людей нет. Читают С4 (наёмники) и С5 (рабы — причина бунта). Игрокам
 *  сам по себе не виден: слухи С8 показывают его, только если мастер включил тему в кампании. */
export type PeopleTrade = 'slaves' | 'mercenaries';
export interface PeopleTradeLine { kind: PeopleTrade; side: 'export' | 'import'; /** Поле вики как есть. */ cite: string }

const PEOPLE: Readonly<Record<PeopleTrade, RegExp>> = { slaves: /slave/i, mercenaries: /mercenar/i };

export function peopleTrade(k: Pick<Kingdom, 'exports' | 'imports'>): PeopleTradeLine[] {
  return (['export', 'import'] as const).flatMap(side => {
    const cite = side === 'export' ? k.exports : k.imports;
    return cite ? (Object.keys(PEOPLE) as PeopleTrade[]).filter(kind => PEOPLE[kind].test(cite)).map(kind => ({ kind, side, cite })) : [];
  });
}

/** Строка истории державы: событие статей-годов или слоя статей. */
export interface KingdomHistoryLine { id: string; year: number; to?: number; text: string; when?: string; cite?: string }

/** История державы на год (линза): события из её списка `events` в обоих слоях хронологии, не позже года, по году.
 *  Строка слоя статей с парой (`same`), которая уже в истории, не повторяется. Позже года — только счётчик. */
export function kingdomHistoryOf(k: Pick<Kingdom, 'events'>, year: number, base: readonly ChronoEvent[], articles: readonly ArticleEvent[]):
  { lines: KingdomHistoryLine[]; later: number } {
  const ids = new Set(k.events ?? []);
  const main = base.filter(e => ids.has(e.id));
  const shown = new Set(main.map(e => e.id));
  const all: KingdomHistoryLine[] = [
    ...main.map(e => ({ id: e.id, year: e.year, text: e.text, when: e.when, cite: e.cites?.join('; ') })),
    ...articles.filter(e => ids.has(e.id) && !(e.same && shown.has(e.same))).map(e => ({
      id: e.id, year: e.year, to: e.to, text: e.text, when: e.when,
      cite: [e.src.section ? `${e.src.title} · ${e.src.section}` : e.src.title, ...(e.cites ?? [])].join('; '),
    })),
  ].sort((a, b) => a.year - b.year || a.id.localeCompare(b.id, 'en', { numeric: true }));
  const lines = all.filter(l => l.year <= year);
  return { lines, later: all.length - lines.length };
}

/** Загрузить события державы: только куски лет, где она упомянута (`years`). */
export async function loadKingdomHistory(k: Pick<Kingdom, 'events' | 'years'>, year: number) {
  if (!k.events?.length || !k.years?.length) return { lines: [], later: 0 };
  const from = Math.min(...k.years), to = Math.max(...k.years);
  const { loadEvents, loadArticleEvents } = await import('./chronology');
  const [base, articles] = await Promise.all([loadEvents(from, to), loadArticleEvents(from, to)]);
  return kingdomHistoryOf(k, year, base, articles);
}
