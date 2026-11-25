// Справочник мест карты (M12): поиск по имени и место под щелчком. Источники — content/maps/<id>-places.json
// (Toril GIS: имена, классы, позиции значков растра) и <id>-cards.json (карточки по-русски из ночной разметки L3,
// CC BY-SA 3.0 Forgotten Realms Wiki). Это справка мастера, не состояние: место из справочника становится местом
// мира только через предложение с patch. Файлы тяжёлые — грузятся отдельным куском, когда открыта карта.
import type { MapBox, MapPoint } from './projection';
import { loadCachedPromise, loadPackageJson, packageHasLayer, settingPackageForMap } from '../packages/registry';

export interface PlaceCardText {
  what?: string;
  ruler?: string;
  danger?: string;
  summary?: string;
}

export interface GazetteerPlace extends MapPoint {
  id: string;
  /** Латиницей, как в книгах. */
  name: string;
  /** Русское имя GIS — только для поиска, на экран не выводится. */
  nameRu?: string;
  /** Проверенные варианты написания (например, опечатка в GIS). */
  aliases?: readonly string[];
  /** Класс GIS (City, Ruins, Temperate Forest) или класс подписи L1 (road, sea). */
  kind: string;
  /** Позиция — предсказание по GIS: на растре место не нашли. */
  approx?: boolean;
  /** Позиция — середина подписи растра, а не значок: щелчок ловится по всей подписи. */
  label?: boolean;
  card?: PlaceCardText;
  /** «Toril GIS» и ссылки на статьи вики. */
  sources?: readonly string[];
}

interface PlacesFile { places: readonly { id: string; name: string; nameRu?: string; class: string; x: number; y: number }[] }
interface CardsFile { license: string; places: readonly (Omit<GazetteerPlace, 'nameRu'>)[] }
export interface RasterClassification {
  id: string;
  role: string;
  kind: string;
  origin: string;
}

/** Справочник карты: места GIS с карточками поверх и места, что есть только в карточках. */
export function mergeGazetteer(places: PlacesFile, cards: CardsFile, corrections: readonly GazetteerPlace[] = [], classifications: readonly RasterClassification[] = []): GazetteerPlace[] {
  const byId = new Map<string, GazetteerPlace>();
  const rasterKinds = new Map(classifications.filter(c => c.role === 'feature' && c.origin === 'editorial').map(c => [c.id, c.kind]));
  for (const p of places.places) byId.set(p.id, { id: p.id, name: p.name, nameRu: p.nameRu, kind: p.class, x: p.x, y: p.y });
  for (const c of cards.places) byId.set(c.id, { ...byId.get(c.id), ...c, kind: rasterKinds.get(c.id) ?? c.kind, x: c.x, y: c.y });
  for (const c of corrections) {
    const old = byId.get(c.id);
    byId.set(c.id, { ...old, ...c, sources: [...new Set([...(old?.sources ?? []), ...(c.sources ?? [])])] });
  }
  return [...byId.values()];
}

const cache = new Map<string, Promise<GazetteerPlace[]>>();

/** Справочник карты или пустой список, если у карты его нет. Один раз на сеанс. */
export function loadGazetteer(mapId: string): Promise<GazetteerPlace[]> {
  if (!cache.has(mapId)) {
    const pkg = settingPackageForMap(mapId);
    const placesPath = `content/maps/${mapId}-places.json`;
    const cardsPath = `content/maps/${mapId}-cards.json`;
    const correctionsPath = `content/maps/${mapId}-raster-corrections.json`;
    const classificationPath = `content/maps/${mapId}-ocr-classification.json`;
    if (!pkg || !packageHasLayer(pkg.id, placesPath) || !packageHasLayer(pkg.id, cardsPath)) return Promise.resolve([]);
    return loadCachedPromise(cache, mapId, () => Promise.all([
      loadPackageJson(pkg.id, placesPath), loadPackageJson(pkg.id, cardsPath),
      packageHasLayer(pkg.id, correctionsPath) ? loadPackageJson(pkg.id, correctionsPath) : Promise.resolve({ places: [] }),
      packageHasLayer(pkg.id, classificationPath) ? loadPackageJson(pkg.id, classificationPath) : Promise.resolve({ labels: [] }),
    ]).then(([places, cards, corrections, classifications]) => mergeGazetteer(places as PlacesFile, cards as CardsFile,
      (corrections as { places: GazetteerPlace[] }).places, (classifications as { labels: RasterClassification[] }).labels)));
  }
  return cache.get(mapId)!;
}

/** Для сравнения: без регистра и диакритики (Selûne = selune), ё = е, апостроф один. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ё/g, 'е').replace(/[’`]/g, "'");
}

/**
 * Места по запросу: имя целиком, начало имени, начало слова, вхождение — в этом порядке; внутри — сначала с
 * карточкой, потом по имени. Русское имя GIS ищется так же.
 */
export function searchPlaces(list: readonly GazetteerPlace[], query: string, limit = 8): GazetteerPlace[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  const score = (p: GazetteerPlace) => {
    let best = 9;
    for (const n of [p.name, p.nameRu, ...(p.aliases ?? [])]) {
      if (!n) continue;
      const f = fold(n);
      const s = f === q ? 0 : f.startsWith(q) ? 1 : f.split(/[\s'-]+/).some(w => w.startsWith(q)) ? 2 : f.includes(q) ? 3 : 9;
      best = Math.min(best, s);
    }
    return best;
  };
  return list
    .map(p => ({ p, s: score(p) }))
    .filter(x => x.s < 9)
    .sort((a, b) => a.s - b.s || Number(!a.p.card) - Number(!b.p.card) || a.p.name.localeCompare(b.p.name))
    .slice(0, limit)
    .map(x => x.p);
}

/**
 * Очередь класса на слое «Справочник» (29.10): поселения — первыми, затем крепости, руины и храмы, затем местность.
 * Только порядок прореживания, не важность места в мире.
 */
export function kindRank(kind: string): number {
  const k = kind.toLowerCase();
  if (/city|capital|metropolis/.test(k)) return 0;
  if (/town|settlement/.test(k)) return 1;
  if (/fort|castle|keep|ruin|temple|tower|monast|tomb|mine|village|inn/.test(k)) return 2;
  return 3;
}

/**
 * Места слоя «Справочник» в рамке исходника: только с карточкой (наработанные ночной разметкой), в очереди класса,
 * не больше limit — при отдалении остаются города, при приближении появляется остальное.
 */
export function layerPlaces(list: readonly GazetteerPlace[], box: MapBox, limit = 150): GazetteerPlace[] {
  return list
    .filter(p => p.card && p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1)
    .sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * Место под щелчком: значок — не дальше r пикселей исходника, подпись (label) — не дальше labelR. Из попавших —
 * ближайшее относительно своего радиуса: значок рядом с чужой подписью побеждает.
 */
export function placeNear(list: readonly GazetteerPlace[], at: MapPoint, r: number, labelR = r): GazetteerPlace | undefined {
  let best: GazetteerPlace | undefined;
  let bestK = 1;
  for (const p of list) {
    const k = Math.hypot(p.x - at.x, p.y - at.y) / (p.label ? labelR : r);
    if (k <= bestK) {
      best = p;
      bestK = k;
    }
  }
  return best;
}

/** Класс места по-русски: GIS и подписи L1. Нет в таблице — без подписи класса. */
export const KIND_LABEL: Readonly<Record<string, string>> = {
  City: 'город', Town: 'городок', Village: 'деревня', Fortification: 'крепость', Ruins: 'руины', Tomb: 'гробница',
  Temple: 'храм', 'Monastic Site': 'монастырь', Mine: 'шахта', Inn: 'постоялый двор', 'Water Source': 'источник',
  Oasis: 'оазис', Island: 'остров', Mountain: 'гора', Mountains: 'горы', Volcano: 'вулкан', Pass: 'перевал',
  Bay: 'залив', Hill: 'холм', Hills: 'холмы', Chasm: 'пропасть', Plateau: 'плато', temple: 'храм', 'Temperate Forest': 'лес', 'Boreal Forest': 'северный лес', 'Tropical Forest': 'джунгли',
  Forest: 'лес', Swamp: 'болото', Marsh: 'болото', Desert: 'пустыня', Lake: 'озеро', River: 'река', Sea: 'море',
  Region: 'область', Subregion: 'область', Macroregion: 'край', Continent: 'континент', Country: 'страна',
  Plain: 'равнина', Plains: 'равнины', Grassland: 'степь', Sand: 'пески', Wastes: 'пустоши', Moor: 'пустошь',
  Glacier: 'ледник', Cave: 'пещера', Rift: 'разлом', Valley: 'долина', Depression: 'впадина',
  'Blackened Earth': 'выжженная земля', 'Lake island': 'остров на озере', 'Coastal Sea': 'море',
  'Water/Coastal sea': 'море', 'Water/Oceanic expanse': 'океан',
  settlement: 'поселение', fortress: 'крепость', ruins: 'руины', mountain: 'горы', hills: 'холмы', forest: 'лес',
  swamp: 'болото', desert: 'пустыня', lake: 'озеро', river: 'река', sea: 'море', island: 'остров', pass: 'перевал',
  road: 'дорога', region: 'область', country: 'страна', mine: 'шахта',
  bay: 'залив', archipelago: 'архипелаг', reef: 'риф', peninsula: 'полуостров', bridge: 'мост', glacier: 'ледник',
};

/** Ссылка на статью вики из источников карточки. */
export const wikiUrl = (p: GazetteerPlace): string | undefined => p.sources?.find(s => s.startsWith('http'));
