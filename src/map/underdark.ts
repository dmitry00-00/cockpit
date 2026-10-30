// Подземье карты мира (ROADMAP 6.3): владения, бездны и сети пещер Toril GIS в пикселях растра
// (scripts/underdark-from-gis.py). На растре Подземья нет, поэтому это подсказка мастеру: под какими владениями лежит
// путь «под землёй». Привязка GIS к растру ошибается на десятки пикселей (медиана — в файле), владения — сотни.
// Данные карты, как справочник мест: отдельный кусок, грузится при первой карте.
import type { MapPoint } from './projection';

export interface UnderdarkRegion {
  id: string;
  name: string;
  /** Класс GIS: Domain, Abyss, Cavern Network, Fungal Forest, Subregion. */
  kind: string;
  /** Внешние кольца [x0, y0, x1, y1, …] в пикселях исходника. */
  rings: readonly (readonly number[])[];
}

interface UnderdarkFile { regions: readonly { id: string; name: string; class: string; rings: number[][] }[] }

const LOADERS: Readonly<Record<string, () => Promise<UnderdarkFile>>> = {
  toril: async () => (await import('../../content/maps/toril-underdark.json')).default as UnderdarkFile,
};
const cache = new Map<string, Promise<UnderdarkRegion[]>>();

export function loadUnderdark(mapId: string): Promise<UnderdarkRegion[]> {
  const load = LOADERS[mapId];
  if (!load) return Promise.resolve([]);
  if (!cache.has(mapId)) cache.set(mapId, load().then(f => f.regions.map(r => ({ id: r.id, name: r.name, kind: r.class, rings: r.rings }))));
  return cache.get(mapId)!;
}

/** Точка внутри кольца — чётность пересечений луча вправо. */
function inRing(ring: readonly number[], p: MapPoint): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [ring[i], ring[i + 1], ring[j], ring[j + 1]];
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Области Подземья под путём — в порядке, в каком путь в них входит; шаг проверки — step px исходника. */
export function underdarkAlong(regions: readonly UnderdarkRegion[], points: readonly MapPoint[], step = 16): UnderdarkRegion[] {
  const seen = new Set<string>();
  const out: UnderdarkRegion[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 0; k <= n; k++) {
      const p = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
      for (const r of regions) {
        if (!seen.has(r.id) && r.rings.some(ring => inRing(ring, p))) {
          seen.add(r.id);
          out.push(r);
        }
      }
    }
  }
  return out;
}
