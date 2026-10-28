// Звёздная система Realmspace для уровня лестницы «система» (HANDOFF §3, F4.3): солнце, восемь планет и спутники
// Toril — факты Forgotten Realms Wiki (CC BY-SA 3.0, см. LICENSE.md) со ссылками на книги, импорт —
// scripts/import-spelljammer.py. Где тело стоит на орбите в данный день, книги не говорят: начальные углы — свои
// (PHASE0), дальше тело идёт по своему году. Расстояния от солнца — по вики, на схеме кольца ровные, по порядку.
import raw from '../../content/cosmos/realmspace.json';

export interface CelestialBody {
  id: string;
  name: string;
  url: string;
  /** Sun, Planet, Moon, Asteroid cluster — как в карточке вики. */
  type: string;
  size?: string;
  shape?: string;
  /** Стихия тела: earth, air, water, fire. */
  element?: string;
  /** Чей спутник: «The sun», «Toril». */
  parent?: string;
  satellites?: string;
  distanceMi?: number;
  radiusMi?: number;
  day?: string;
  year?: string;
  /** Год в днях Toril (месяц — 30 дней). */
  yearDays?: number;
  population?: string;
  refs: readonly string[];
}

export interface StarSystem {
  sphere: { id: string; name: string; url: string; radiusMi: number | null; refs: readonly string[] };
  bodies: readonly CelestialBody[];
  attribution: string;
  note: string;
}

export const REALMSPACE: StarSystem = raw as StarSystem;

export const BODY_TYPE_LABEL: Readonly<Record<string, string>> = {
  Sun: 'солнце', Planet: 'планета', Moon: 'луна', 'Asteroid cluster': 'скопление астероидов',
};

export const ELEMENT_LABEL: Readonly<Record<string, string>> = { earth: 'земля', air: 'воздух', water: 'вода', fire: 'огонь' };

const sun = (b: CelestialBody) => b.type === 'Sun';
const orbitsSun = (b: CelestialBody) => !sun(b) && /sun/i.test(b.parent ?? '');

/** Планеты по удалённости от солнца. */
export function planetsOf(sys: StarSystem): CelestialBody[] {
  return sys.bodies.filter(orbitsSun).sort((a, b) => (a.distanceMi ?? 0) - (b.distanceMi ?? 0));
}

/** Спутники тела: Selûne и Tears of Selûne у Toril. */
export function moonsOf(sys: StarSystem, body: CelestialBody): CelestialBody[] {
  return sys.bodies.filter(b => b.parent === body.name);
}

export function sunOf(sys: StarSystem): CelestialBody | undefined {
  return sys.bodies.find(sun);
}

/** Условный угол на орбите в день 0 (1 Hammer 1492 DR), в долях оборота: тела разведены, чтобы не слипались. */
const PHASE0: Readonly<Record<string, number>> = {
  anadia: 0.05, coliar: 0.6, toril: 0.3, selune: 0, tears: 0.5, karpri: 0.85, chandos: 0.15, glyth: 0.45, garden: 0.7,
  hcatha: 0.95,
};

/** Угол тела на орбите в день `day` (радианы, 0 — вправо, против часовой). Без года — стоит на месте. */
export function orbitAngle(body: CelestialBody, day: number): number {
  const turns = (PHASE0[body.id] ?? 0) + (body.yearDays ? day / body.yearDays : 0);
  return 2 * Math.PI * (turns - Math.floor(turns));
}

/** Расстояние между двумя планетами в день `day`, миль: по их радиусам орбит и углам. */
export function distanceBetween(a: CelestialBody, b: CelestialBody, day: number): number {
  const ra = a.distanceMi ?? 0, rb = b.distanceMi ?? 0;
  const d = orbitAngle(a, day) - orbitAngle(b, day);
  return Math.sqrt(ra * ra + rb * rb - 2 * ra * rb * Math.cos(d));
}

export interface Approach {
  body: CelestialBody;
  /** Через сколько дней от `day` расстояние меньше всего (в окне `horizon`). */
  inDays: number;
  miles: number;
}

/**
 * Ближайшее сближение `from` с другими планетами в окне `horizon` дней: для каждой — день минимума расстояния,
 * из всех — самое близкое по милям. Шаг — день.
 */
export function nearestApproach(sys: StarSystem, from: CelestialBody, day: number, horizon = 365): Approach | null {
  let best: Approach | null = null;
  for (const b of planetsOf(sys)) {
    if (b.id === from.id) continue;
    for (let t = 0; t <= horizon; t++) {
      const miles = distanceBetween(from, b, day + t);
      if (!best || miles < best.miles) best = { body: b, inDays: t, miles };
    }
  }
  return best;
}

/** «300 млн миль», «1,6 млрд миль». */
export function milesLabel(mi: number): string {
  if (mi >= 1e9) return `${(mi / 1e9).toFixed(1).replace('.', ',').replace(/,0$/, '')} млрд миль`;
  return `${Math.round(mi / 1e6)} млн миль`;
}
