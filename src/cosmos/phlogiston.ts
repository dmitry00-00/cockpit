// Течения флогистона вокруг Realmspace для уровня лестницы «план» (HANDOFF §3, F4.2): сферы и пути между ними —
// только то, что пишет Forgotten Realms Wiki (CC BY-SA 3.0, см. LICENSE.md), каждое ребро — с цитатой и книгой;
// импорт — scripts/import-spelljammer.py. Раскладка узлов — своя (LAYOUT), фанатские карты флогистона — только сверка.
import raw from '../../content/cosmos/phlogiston.json';

/** 'two' — течение в обе стороны, 'one' — только from → to, '' — путь назван, про обратный источник молчит. */
export type FlowWay = 'two' | 'one' | '';

export interface Flow {
  from: string;
  to: string;
  /** Дни пути: число, [мин, макс] или null — источник не называет. */
  days: number | readonly [number, number] | null;
  way: FlowWay;
  quote: string;
  url: string;
  ref: string | null;
}

/** kind: кристаллическая сфера или держава, что тянется через несколько сфер (Vodoni Empire). */
export interface Sphere { id: string; name: string; kind: 'sphere' | 'empire'; url?: string }

export interface FlowGroup { id: string; name: string; members: readonly string[]; quote: string; url: string; ref: string | null }

export interface Phlogiston {
  spheres: readonly Sphere[];
  flows: readonly Flow[];
  groups: readonly FlowGroup[];
  typicalDays: readonly [number, number];
  typicalQuote: string;
  typicalRef: string | null;
  attribution: string;
}

export const PHLOGISTON: Phlogiston = raw as unknown as Phlogiston;

/**
 * Своя раскладка в рамке 1000×600: треугольник Realmspace — Greyspace — Krynnspace в центре, Arcane Inner Flow —
 * цепочкой вправо, прочие соседи — вокруг Realmspace.
 */
export const LAYOUT: Readonly<Record<string, { x: number; y: number }>> = {
  realmspace: { x: 470, y: 300 },
  greyspace: { x: 290, y: 170 },
  krynnspace: { x: 290, y: 430 },
  refuge: { x: 640, y: 300 },
  pirtelspace: { x: 780, y: 300 },
  darnannon: { x: 920, y: 300 },
  moragspace: { x: 470, y: 90 },
  shadowspace: { x: 640, y: 140 },
  winterspace: { x: 470, y: 530 },
  clusterspace: { x: 640, y: 470 },
  vodoni: { x: 110, y: 300 },
};

/** «53 дня», «12–21 день», «?». */
export function daysLabel(days: Flow['days']): string {
  if (days === null) return '?';
  const n = Array.isArray(days) ? days[1] : (days as number);
  const m10 = n % 10, m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? 'день' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'дня' : 'дней';
  return Array.isArray(days) ? `${days[0]}–${days[1]} ${word}` : `${n} ${word}`;
}

export const WAY_LABEL: Readonly<Record<FlowWay, string>> = {
  two: 'течение в обе стороны',
  one: 'течение в одну сторону',
  '': 'путь известен, обратный — нет',
};

/** Пути из сферы и в неё: можно ли уйти (from или двусторонний) и прийти. */
export function flowsOf(ph: Phlogiston, id: string): { out: Flow[]; in: Flow[] } {
  const out = ph.flows.filter(f => f.from === id || (f.way === 'two' && f.to === id));
  const inn = ph.flows.filter(f => f.to === id || (f.way === 'two' && f.from === id));
  return { out, in: inn };
}

export function sphereByName(ph: Phlogiston, name: string): Sphere | undefined {
  return ph.spheres.find(s => s.name === name);
}
