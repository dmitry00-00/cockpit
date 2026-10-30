// Реестр поселений (пользователь 30.10.2026): все города и поселения справочника карты строкой — что о месте уже
// известно и что пусто: карта города (план M10), карточка ночной разметки, статья вики, держава, товары, жители, вера,
// организации, связь в графе мира. Плюс замечания о корректности: позиция по GIS (на растре не найдено), тёзки,
// поселение вне графа. И поселения GIS, которых в справочнике нет вовсе (content/maps/<id>-missing.json,
// scripts/missing-places.py), — с причиной. Чистый расчёт по готовым данным — грузит их таблица «Поселения» компендиума.
import type { GazetteerPlace } from '../map/gazetteer';
import { econOfPlace, type Econ } from './econ';
import type { WorldGraph } from './graph';
import { kingdomsOfPlace, type Kingdom } from './kingdoms';
import type { PlaceFaith } from './organizations';
import type { Resident } from './people';

/** Классы мест, где живут: GIS и карточки ночной разметки. Руины, урочища и природа — не поселения. */
export const SETTLEMENT_KINDS: ReadonlySet<string> = new Set([
  'City', 'Town', 'Village', 'Fortification', 'Temple', 'Monastic Site', 'Mine', 'Inn', 'Oasis',
  'settlement', 'fortress', 'temple', 'mine',
]);

export type GraphLink = 'road' | 'harbour' | 'land' | 'none';

/** Почему поселения GIS нет в справочнике (статусы map-registry.py). */
export type MissingStatus = 'misread' | 'far' | 'absent' | 'underdark' | 'outside';
export const MISSING_LABEL: Readonly<Record<MissingStatus, string>> = {
  misread: 'подпись прочитана иначе', far: 'подпись далеко от подсказки', absent: 'на растре не найдено',
  underdark: 'Подземье', outside: 'вне растра',
};
/** Строка content/maps/<id>-missing.json: [id, имя, класс, причина, x, y, прочитано рядом?]. */
export type MissingPlace = readonly [id: string, name: string, kind: string, status: MissingStatus, x: number, y: number, ocr?: string];

export interface PlaceRow {
  id: string;
  name: string;
  kind: string;
  /** Первая держава места на год (своя — первой). */
  kingdom?: string;
  plan: boolean;
  card: boolean;
  wiki: boolean;
  /** Товаров в вывозе — своих или державы. */
  goods: number;
  residents: number;
  faith: boolean;
  orgs: number;
  /** Связь в графе: дорога, пристань, напрямик, нет; графа нет — undefined. */
  graph?: GraphLink;
  approx: boolean;
  /** Нет в справочнике карты: почему; позиция — подсказка GIS. */
  missing?: MissingStatus;
  /** Что OCR прочёл рядом (misread). */
  ocr?: string;
  /** Замечания о корректности словами. */
  issues: string[];
}

export interface RegistryData {
  places: readonly GazetteerPlace[];
  /** Поселения GIS не в справочнике. */
  missing?: readonly MissingPlace[];
  kingdoms: Iterable<Kingdom>;
  econ: Econ;
  residents: Readonly<Record<string, readonly Resident[]>>;
  faiths: Readonly<Record<string, PlaceFaith>>;
  /** Организации с базой в месте: id места → число. */
  orgs: ReadonlyMap<string, number>;
  /** Есть ли план места (паспорт карты с plan.place). */
  hasPlan: (placeId: string) => boolean;
  graph: WorldGraph | null;
  year: number;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function linkOf(g: WorldGraph, id: string): GraphLink {
  if (!g.nodes.has(id)) return 'none';
  const modes = new Set((g.adj.get(id) ?? []).map(e => e.mode));
  return modes.has('road') ? 'road' : modes.has('water') ? 'harbour' : modes.has('land') ? 'land' : 'none';
}

export function placeRegistry(d: RegistryData): PlaceRow[] {
  const kingdoms = [...d.kingdoms];
  const known = new Set(d.places.map(p => p.id));
  const list: (Pick<GazetteerPlace, 'id' | 'name' | 'kind' | 'approx' | 'card' | 'sources'> & { missing?: MissingStatus; ocr?: string })[] = [
    ...d.places.filter(p => SETTLEMENT_KINDS.has(p.kind)),
    // Реестр карты старше карточек: место, что ночная разметка уже поставила по GIS, — в справочнике, не пропущено.
    ...(d.missing ?? []).filter(([id]) => !known.has(id)).map(([id, name, kind, missing, , , ocr]) => ({ id, name, kind, missing, ...(ocr ? { ocr } : {}) })),
  ];
  const names = new Map<string, number>();
  for (const p of list) names.set(fold(p.name), (names.get(fold(p.name)) ?? 0) + 1);
  return list.map(p => {
    const graph = d.graph ? linkOf(d.graph, p.id) : undefined;
    const k = kingdomsOfPlace(kingdoms, p.id, d.year)[0];
    const twins = (names.get(fold(p.name)) ?? 1) - 1;
    const issues = [
      ...(p.missing ? [`нет на карте: ${MISSING_LABEL[p.missing]}${p.ocr ? ` («${p.ocr}»)` : ''}`] : []),
      ...(p.approx ? ['позиция по GIS'] : []),
      ...(twins ? [`тёзки: ${twins}`] : []),
      ...(graph === 'none' && !p.missing ? ['вне графа'] : []),
    ];
    return {
      id: p.id, name: p.name, kind: p.kind,
      ...(k ? { kingdom: k.name } : {}),
      plan: d.hasPlan(p.id),
      card: !!p.card,
      wiki: !!p.sources?.some(s => s.startsWith('http')),
      goods: econOfPlace(d.econ, kingdoms, p.id, d.year).x?.length ?? 0,
      residents: d.residents[p.id]?.length ?? 0,
      faith: !!d.faiths[p.id],
      orgs: d.orgs.get(p.id) ?? 0,
      ...(graph ? { graph } : {}),
      approx: !!p.approx,
      ...(p.missing ? { missing: p.missing } : {}),
      ...(p.ocr ? { ocr: p.ocr } : {}),
      issues,
    };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** Поля заполненности: подпись и «заполнено ли». Графа нет — поле «в графе» не считается. */
export const REGISTRY_FIELDS: readonly { key: string; label: string; hint: string; filled: (r: PlaceRow) => boolean | undefined }[] = [
  { key: 'map', label: 'На карте', hint: 'место есть в справочнике карты (найдено на растре или поставлено по GIS)', filled: r => !r.missing },
  { key: 'plan', label: 'Карта города', hint: 'план места (M10): паспорт content/maps/<id>.json с plan.place', filled: r => r.plan },
  { key: 'card', label: 'Карточка', hint: 'карточка по-русски ночной разметки L3', filled: r => r.card },
  { key: 'wiki', label: 'Вики', hint: 'ссылка на статью Forgotten Realms Wiki', filled: r => r.wiki },
  { key: 'kingdom', label: 'Держава', hint: 'держава места на год: places, столица или само место', filled: r => r.kingdom !== undefined },
  { key: 'goods', label: 'Товары', hint: 'вывоз места или его державы (content/world/econ.json)', filled: r => r.goods > 0 },
  { key: 'residents', label: 'Жители', hint: 'NPC вики с домом здесь', filled: r => r.residents > 0 },
  { key: 'faith', label: 'Вера', hint: 'поле religion статьи о месте', filled: r => r.faith },
  { key: 'orgs', label: 'Организации', hint: 'организации вики с базой здесь', filled: r => r.orgs > 0 },
  { key: 'graph', label: 'Граф', hint: 'связь в графе мира: дорога, пристань или напрямик', filled: r => (r.graph === undefined ? undefined : r.graph !== 'none') },
  { key: 'position', label: 'Позиция', hint: 'место найдено на растре, а не предсказано по GIS', filled: r => !r.approx && !r.missing },
];

/** Строки реестра CSV (разделитель «;», как ждёт Excel с русской локалью). */
export function registryCsv(rows: readonly PlaceRow[]): string {
  const cell = (v: string | number | boolean | undefined) => {
    const s = v === undefined ? '' : typeof v === 'boolean' ? (v ? 'да' : '') : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['id', 'имя', 'класс', 'нет на карте', 'держава', 'карта города', 'карточка', 'вики', 'товары', 'жители', 'вера', 'организации', 'граф', 'позиция по GIS', 'замечания'];
  const body = rows.map(r => [r.id, r.name, r.kind, r.missing ? MISSING_LABEL[r.missing] : undefined, r.kingdom, r.plan, r.card, r.wiki, r.goods, r.residents, r.faith, r.orgs, r.graph, r.approx, r.issues.join(', ')].map(cell).join(';'));
  return [head.join(';'), ...body].join('\n') + '\n';
}
