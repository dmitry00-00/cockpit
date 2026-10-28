// Поход по правилам A5E SRD (CC BY 4.0, см. LICENSE.md) — надстройка над темпом SRD 5.1 (решение владельца 27.10.2026:
// «правила путешествий A5E как основа режима похода по карте»). Мили и дни считает SRD (src/rules/srd/travel.ts:
// у A5E медленный и быстрый темп — 16 и 32 мили, у SRD — 18 и 30; продукт держится SRD). От A5E — то, чего в SRD нет:
// путь как цепочка регионов с уровнем опасности, DC занятий в пути по уровню, хотя бы одна встреча на регион,
// таблицы встреч d100, погода d20 на регион и припасы (Supply). Тексты правил — дословно в content/a5e/journey.json.
import raw from '../../../content/a5e/journey.json';
import type { TerrainCode } from '../../map/terrain';
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

const DATA = raw as unknown as {
  source: string;
  attribution: string;
  activityDc: Record<string, number>;
  dcModifiers: { name: string; dc: number }[];
  rules: Record<string, string>;
  activities: JourneyActivity[];
  regions: JourneyRegion[];
};

export const JOURNEY_SOURCE = DATA.source;
export const JOURNEY_RULES: Readonly<Record<string, string>> = DATA.rules;
export const JOURNEY_ACTIVITIES: readonly JourneyActivity[] = DATA.activities;
export const JOURNEY_REGIONS: Readonly<Record<string, JourneyRegion>> = Object.fromEntries(DATA.regions.map(r => [r.id, r]));
export const DC_MODIFIERS: readonly { name: string; dc: number }[] = DATA.dcModifiers;

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
 * Путь по клеткам местности → отрезки по регионам A5E в порядке убывания миль. Мили — из routeTerrain; классы,
 * которые ложатся в один регион (равнина и холмы), складываются. Отрезки короче полумили не показываются.
 */
export function journeyLegs(miles: Partial<Record<TerrainCode, number>>, pace: TravelPaceId, tier: RegionTier,
  difficult: ReadonlySet<TerrainCode>): JourneyLeg[] {
  const by = new Map<string, { miles: number; rough: number }>();
  for (const [code, m] of Object.entries(miles) as [TerrainCode, number][]) {
    const id = REGION_OF_TERRAIN[code];
    if (!id || !m) continue;
    const cur = by.get(id) ?? { miles: 0, rough: 0 };
    cur.miles += m;
    if (difficult.has(code)) cur.rough += m;
    by.set(id, cur);
  }
  const perDay = TRAVEL_PACES[pace].milesPerDay;
  return [...by.entries()]
    .filter(([, v]) => v.miles >= 0.5)
    .sort((a, b) => b[1].miles - a[1].miles)
    .map(([id, v]) => ({
      region: JOURNEY_REGIONS[id],
      miles: Math.round(v.miles * 10) / 10,
      days: Math.round(((v.miles + v.rough * (DIFFICULT_TERRAIN_FACTOR - 1)) / perDay) * 10) / 10,
      dc: activityDc(tier),
      minEncounters: 1 as const,
    }));
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

/** Подписи видов встреч за столом. */
export const ENCOUNTER_TYPE_LABEL: Readonly<Record<EncounterType, string>> = {
  monster: 'противник', challenge: 'испытание', social: 'встреча с людьми', scenery: 'пейзаж',
};
