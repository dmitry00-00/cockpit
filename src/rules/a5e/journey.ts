// Поход по правилам A5E SRD (CC BY 4.0, см. LICENSE.md) — надстройка над темпом SRD 5.1 (решение владельца 27.10.2026:
// «правила путешествий A5E как основа режима похода по карте»). Мили и дни считает SRD (src/rules/srd/travel.ts:
// у A5E медленный и быстрый темп — 16 и 32 мили, у SRD — 18 и 30; продукт держится SRD). От A5E — то, чего в SRD нет:
// путь как цепочка регионов с уровнем опасности, DC занятий в пути по уровню, хотя бы одна встреча на регион,
// таблицы встреч d100, погода d20 на регион и припасы (Supply). Тексты правил — дословно в content/a5e/journey.json.
// С 28.10.2026 (ROADMAP 0.5) данные — отдельный кусок: loadJourney() заполняет те же экспорты; до загрузки они пусты.
import type { MapPoint } from '../../map/projection';
import { nearRoad, terrainAt, type RouteOverlay, type SettlementMark, type TerrainCode, type TerrainGrid } from '../../map/terrain';
import { DIFFICULT_TERRAIN_FACTOR, TRAVEL_PACES, type TravelPaceId } from '../srd/travel';

export type RegionTier = 0 | 1 | 2 | 3 | 4;
export type EncounterType = 'monster' | 'challenge' | 'social' | 'scenery';

export interface EncounterRow {
  from: number;
  to: number;
  /** Имя как в таблице A5E: «Bandit captain», «Quicksand», «Travel scenery». */
  name: string;
  type: EncounterType;
  /** Сноска таблицы: на нечётном броске — гигантская версия существа. */
  giant?: boolean;
  /** Имени нет в тексте SRD (таблица сайта новее или с опечаткой) — показываем с пометкой. */
  unverified?: boolean;
}

export interface JourneyRegion {
  id: string;
  name: string;
  description: string;
  /** Поля блока региона дословно: Terrains, Tiers, Journey Activities и особенности («Heavy Undergrowth»…). */
  fields: Readonly<Record<string, string>>;
  /** Погода d20 (зимой +5, кроме тёплых краёв) — описательная, на героев не влияет. */
  weather: readonly { from: number; to: number; weather: string }[];
  /** Уровень 0–4 → строки таблицы встреч d100. */
  encounters: Readonly<Record<string, readonly EncounterRow[]>>;
  gaps?: Readonly<Record<string, readonly number[]>>;
  overlaps?: Readonly<Record<string, readonly number[]>>;
}

export interface JourneyActivity {
  id: string;
  name: string;
  skills: readonly string[];
  text: string;
  outcomes: { criticalFailure?: string; failure?: string; success?: string; criticalSuccess?: string };
}

interface JourneyFile {
  source: string;
  attribution: string;
  activityDc: Record<string, number>;
  dcModifiers: { name: string; dc: number }[];
  rules: Record<string, string>;
  activities: JourneyActivity[];
  regions: JourneyRegion[];
}

const DATA: JourneyFile = { source: '', attribution: '', activityDc: {}, dcModifiers: [], rules: {}, activities: [], regions: [] };
const regions: Record<string, JourneyRegion> = {};

/** Источник с лицензией; пуст до loadJourney(). */
export const JOURNEY_META: { readonly source: string; readonly attribution: string } = DATA;
export const JOURNEY_RULES: Readonly<Record<string, string>> = DATA.rules;
export const JOURNEY_ACTIVITIES: readonly JourneyActivity[] = DATA.activities;
export const JOURNEY_REGIONS: Readonly<Record<string, JourneyRegion>> = regions;
export const DC_MODIFIERS: readonly { name: string; dc: number }[] = DATA.dcModifiers;

let loading: Promise<void> | null = null;

/** Догрузить правила похода в экспорты модуля; повторный вызов — тот же промис. */
export function loadJourney(): Promise<void> {
  loading ??= import('../../../content/a5e/journey.json').then(m => {
    const raw = m.default as unknown as JourneyFile;
    DATA.source = raw.source;
    DATA.attribution = raw.attribution;
    Object.assign(DATA.activityDc, raw.activityDc);
    Object.assign(DATA.rules, raw.rules);
    DATA.dcModifiers.push(...raw.dcModifiers);
    DATA.activities.push(...raw.activities);
    DATA.regions.push(...raw.regions);
    for (const r of raw.regions) regions[r.id] = r;
  });
  return loading;
}

export const journeyLoaded = (): boolean => DATA.regions.length > 0;

/** «The DC of a journey activity is based on the region’s tier: tier 0 — DC 10, tier 1 — DC 12 … tier 4 — DC 18». */
export function activityDc(tier: RegionTier, modifiers: readonly string[] = []): number {
  return DATA.activityDc[String(tier)] + modifiers.reduce((s, n) => s + (DATA.dcModifiers.find(m => m.name === n)?.dc ?? 0), 0);
}

/**
 * Класс местности карты → регион A5E. Решение кокпита, не правило: «Combined Regions… The Narrator may choose either
 * region». Равнина и холмы — Rolling Grasslands («These plains and hills…»), вода — Restless Sea; «не нанесено» — нет.
 */
export const REGION_OF_TERRAIN: Readonly<Record<TerrainCode, string | null>> = {
  o: 'restless-sea', g: 'rolling-grasslands', h: 'rolling-grasslands', f: 'tangled-forest', m: 'lofty-mountains',
  s: 'unrelenting-marsh', d: 'parched-sands', i: 'frozen-wastes', u: null,
};

/** Уровень опасности по умолчанию — ступень игры партии: 1–4 → 1, 5–10 → 2, 11–16 → 3, 17–20 → 4. Мастер меняет. */
export function tierOfLevel(level: number): RegionTier {
  return level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1;
}

export interface JourneyLeg {
  region: JourneyRegion;
  miles: number;
  /** Дни по темпу SRD; трудная местность SRD (лес, болото, горы, лёд) — каждая миля за две. */
  days: number;
  dc: number;
  /** «…it’s recommended that the party has at least one encounter… in every region they journey through». */
  minEncounters: 1;
}

/**
 * Open Roads, Fast Travel: «Adventurers move one mile per hour faster when traveling along open roads». Темп SRD — мили в
 * час и в день; на дороге час даёт на милю больше, поэтому миля дороги стоит mph / (mph + 1) мили темпа: обычным
 * темпом 32 мили дороги — день, как 24 мили без дороги.
 */
export function roadMilesAsPace(miles: number, pace: TravelPaceId): number {
  const mph = TRAVEL_PACES[pace].milesPerHour;
  return (miles * mph) / (mph + 1);
}

/**
 * Поселения справочника карты → регион A5E и круг вокруг значка, где путь идёт им. Регион — как у сцены места
 * (campaign/scene.ts REGION_OF_KIND): Urban Township — «from mighty sprawling cities to smaller bustling towns», Country
 * Shire — «small villages and rural communities, often surrounded by a patchwork of farms». Радиус — решение кокпита:
 * город — 2 мили, городок — миля, деревня с полями вокруг — 3 мили.
 */
export const SETTLEMENT_REGION: Readonly<Record<string, { region: string; miles: number }>> = {
  City: { region: 'urban-township', miles: 2 },
  Town: { region: 'urban-township', miles: 1 },
  Village: { region: 'country-shire', miles: 3 },
};

/** Значки справочника — круги поселений на пути; места «по GIS» (на растре не найдены) не идут. */
export function settlementMarks(places: readonly (MapPoint & { kind: string; approx?: boolean })[], milesPerPixel: number): SettlementMark[] {
  return places.flatMap(p => {
    const s = SETTLEMENT_REGION[p.kind];
    return s && !p.approx ? [{ x: p.x, y: p.y, r: s.miles / milesPerPixel, region: s.region }] : [];
  });
}

/**
 * Регион A5E точки карты — тем же порядком, что путь (routeTerrain): круг поселения, затем дорога, затем класс
 * местности. Нужен слоям карты (ROADMAP 6.4): где какая таблица встреч и погоды.
 */
export function regionAt(grid: TerrainGrid, p: MapPoint, overlay: RouteOverlay = {}): string | undefined {
  const town = overlay.settlements?.find(s => Math.hypot(s.x - p.x, s.y - p.y) <= s.r);
  if (town) return town.region;
  if (overlay.roads && nearRoad(overlay.roads, p)) return 'open-roads';
  const c = terrainAt(grid, p);
  return c ? REGION_OF_TERRAIN[c] ?? undefined : undefined;
}

/** Подпись броска погоды региона в логе (DICE_ROLLED): по ней слой «Погода» находит бросок дня. */
export const weatherRollLabel = (regionName: string): string => `Погода · ${regionName}`;

/** Поход под землёй — весь путь одним регионом: «a stretch of underground caverns» (A5E, Regions). */
export const UNDERGROUND_REGION = 'underland-realm';

/**
 * Путь по клеткам местности → отрезки по регионам A5E в порядке убывания миль. Мили — из routeTerrain; классы,
 * которые ложатся в один регион (равнина и холмы), складываются. over — мили, что легли не на местность: дорога
 * (Open Roads, дни — с Fast Travel), поселения, Подземье; трудной местности в них нет. Отрезки короче полумили не
 * показываются.
 */
export function journeyLegs(miles: Partial<Record<TerrainCode, number>>, pace: TravelPaceId, tier: RegionTier,
  difficult: ReadonlySet<TerrainCode>, over: Partial<Record<string, number>> = {}): JourneyLeg[] {
  const by = new Map<string, { miles: number; rough: number }>();
  const add = (id: string, m: number, rough: number) => {
    const cur = by.get(id) ?? { miles: 0, rough: 0 };
    cur.miles += m;
    cur.rough += rough;
    by.set(id, cur);
  };
  for (const [code, m] of Object.entries(miles) as [TerrainCode, number][]) {
    const id = REGION_OF_TERRAIN[code];
    if (id && m) add(id, m, difficult.has(code) ? m : 0);
  }
  for (const [id, m] of Object.entries(over)) if (m && JOURNEY_REGIONS[id]) add(id, m, 0);
  const perDay = TRAVEL_PACES[pace].milesPerDay;
  return [...by.entries()]
    .filter(([, v]) => v.miles >= 0.5)
    .sort((a, b) => b[1].miles - a[1].miles)
    .map(([id, v]) => {
      const paced = id === 'open-roads' ? roadMilesAsPace(v.miles, pace) : v.miles + v.rough * (DIFFICULT_TERRAIN_FACTOR - 1);
      return {
        region: JOURNEY_REGIONS[id],
        miles: Math.round(v.miles * 10) / 10,
        days: Math.round((paced / perDay) * 10) / 10,
        dc: activityDc(tier),
        minEncounters: 1 as const,
      };
    });
}

/**
 * Supply: «1 Supply consists of enough combined food and water to sustain a Small- or Medium-sized creature for a day.
 * Large-sized creatures require 2 Supply each day… Whenever a creature takes a long rest, it must consume Supply».
 * Ночёвок — по целым дням пути, округление вверх.
 */
export function supplyNeeded(days: number, members: { small: number; large?: number }): number {
  return Math.ceil(days) * (members.small + 2 * (members.large ?? 0));
}

/** Бросок d100 по таблице региона: строка, в которую попал бросок; в дыре таблицы — null (бросок повторяют). */
export function encounterAt(regionId: string, tier: RegionTier, roll: number): EncounterRow | null {
  return JOURNEY_REGIONS[regionId]?.encounters[String(tier)]?.find(r => roll >= r.from && roll <= r.to) ?? null;
}

/** «Roll a d20 for weather once for each region. In the winter season, add 5 to the roll» — шкала до 25. */
export function weatherAt(regionId: string, roll: number, winter = false): string | null {
  const total = Math.min(25, roll + (winter ? 5 : 0));
  return JOURNEY_REGIONS[regionId]?.weather.find(w => total >= w.from && total <= w.to)?.weather ?? null;
}

/** Как регион меняет занятие: из поля «Journey Activities» блока региона. */
export type ActivityModKind = 'advantage' | 'disadvantage' | 'expertise' | 'impossible' | 'auto-success' | 'auto-failure';
export interface ActivityMod {
  kind: ActivityModKind;
  /** Фраза поля дословно — за столом читают её. */
  text: string;
  /** В фразе условие («if your deity…», «on the open sea»): мастер решает, действует ли. */
  conditional: boolean;
}

// Имена занятий в тексте регионов: «Hide Tracks» — то же, что Cover Tracks; «Busking» — Busk.
const ACTIVITY_WORDS: readonly [RegExp, string][] = [
  [/hunt and gather/i, 'hunt-and-gather'], [/gather components/i, 'gather-components'], [/befriend animal/i, 'befriend-animal'],
  [/(?:hide|cover) tracks/i, 'cover-tracks'], [/\bbusk(?:ing)?\b/i, 'busk'], [/\bchronicle\b/i, 'chronicle'], [/\bcook\b/i, 'cook'],
  [/\bentertain\b/i, 'entertain'], [/\bgossip\b/i, 'gossip'], [/\bharvest(?:ed)?\b/i, 'harvest'], [/\bpray\b/i, 'pray'],
  [/\brob\b/i, 'rob'], [/\bscout\b/i, 'scout'], [/\btrack\b/i, 'track'],
];

/**
 * Поле «Journey Activities» региона → поправки занятий: преимущество, помеха, кость компетентности, «нельзя»,
 * автоуспех и автопровал. Разбор по фразам; занятие без имени в фразе («tracks left in the snow») не угадывается —
 * мастер видит фразу дословно. Первая поправка фразы на занятие главнее («advantage … to Scout, but disadvantage …»
 * режется на две фразы по «, but»).
 */
export function regionActivityMods(region: Pick<JourneyRegion, 'fields'>): Record<string, ActivityMod> {
  const out: Record<string, ActivityMod> = {};
  const text = region.fields['Journey Activities'] ?? '';
  for (const sentence of text.split(/(?<=\.)\s+/).map(s => s.trim()).filter(Boolean)) {
    // Условие — у всего предложения: «…on the open sea automatically succeed, and those made to Track automatically fail».
    const conditional = /\bif\b|open sea|coastline/i.test(sentence);
    for (const c of sentence.split(/,\s+but\s+|,\s+and\s+those\s+/i)) {
      const kind: ActivityModKind | null = /not possible/i.test(c) ? 'impossible'
        : /automatically succeed/i.test(c) ? 'auto-success'
          : /automatically fail/i.test(c) ? 'auto-failure'
            : /expertise die/i.test(c) ? 'expertise'
              : /disadvantage/i.test(c) ? 'disadvantage'
                : /advantage/i.test(c) ? 'advantage' : null;
      if (!kind) continue;
      let rest = c;
      for (const [re, id] of ACTIVITY_WORDS) {
        if (!re.test(rest)) continue;
        rest = rest.replace(re, ' ');
        out[id] ??= { kind, text: sentence, conditional };
      }
    }
  }
  return out;
}

/** Исход проверки занятия: успех — DC и выше. Критический исход A5E SRD порогом не задаёт — при натуральных 20 и 1
 *  кокпит только предлагает его мастеру (`maybeCritical`), сам не выбирает. */
export function activityResult(natural: number, total: number, dc: number): { success: boolean; maybeCritical?: 'success' | 'failure' } {
  const success = total >= dc;
  const maybeCritical = natural === 20 ? 'success' as const : natural === 1 ? 'failure' as const : undefined;
  return maybeCritical ? { success, maybeCritical } : { success };
}

/** «…add 5 to the roll, unless the region is in a notably warm or tropical clime» — какие регионы тёплые, решение
 *  кокпита по описаниям A5E: пустыня и адский край. */
export const WARM_REGIONS: ReadonlySet<string> = new Set(['parched-sands', 'fiery-hellscape']);

/** Подписи видов встреч за столом. */
export const ENCOUNTER_TYPE_LABEL: Readonly<Record<EncounterType, string>> = {
  monster: 'противник', challenge: 'испытание', social: 'встреча с людьми', scenery: 'пейзаж',
};
