// Слои карты по регионам A5E (ROADMAP 6.4): какой регион под каждым кусочком экрана — тем же порядком, что путь
// похода (поселение → дорога → местность, rules/a5e/journey.ts regionAt). Чистая выборка по сетке экрана; рисует и
// подписывает RegionLayer.tsx.
import { regionAt } from '../rules/a5e/journey';
import { isExplored, type Explored } from './fog';
import { ROAD_TOLERANCE_PX, type RouteOverlay, type TerrainGrid } from './terrain';
import { toMap, type MapView, type Viewport } from './projection';

/** Шаг выборки, px экрана: клетка подкраски. */
export const REGION_STEP = 10;

export interface RegionSample {
  cols: number;
  rows: number;
  step: number;
  /** Регион клетки построчно; undefined — не нанесено, вне карты или закрыто туманом. */
  ids: (string | undefined)[];
  /** Сколько клеток у региона на экране — по убыванию. */
  shares: { id: string; cells: number }[];
}

/**
 * Регионы видимого окна. Дороги и поселения учитываются, только когда их видно на шаге выборки: при отдалении клетка
 * шире дороги, и пунктир лёг бы на неё случайно — тогда клетка идёт местностью под ним. explored — стол игроков:
 * закрытое туманом не подкрашивается и не считается.
 */
export function sampleRegions(grid: TerrainGrid, overlay: RouteOverlay, vp: Viewport, view: MapView, explored?: Explored, step = REGION_STEP): RegionSample {
  const cols = Math.ceil(vp.w / step);
  const rows = Math.ceil(vp.h / step);
  const src = step / view.scale;
  const a = toMap(view, vp, { x: 0, y: 0 });
  const b = toMap(view, vp, { x: vp.w, y: vp.h });
  const near: RouteOverlay = {
    ...(overlay.roads && src <= 2 * ROAD_TOLERANCE_PX ? { roads: overlay.roads } : {}),
    settlements: (overlay.settlements ?? []).filter(s => s.r * 2 >= src && s.x + s.r >= a.x && s.x - s.r <= b.x && s.y + s.r >= a.y && s.y - s.r <= b.y),
  };
  const ids: (string | undefined)[] = new Array(cols * rows);
  const count = new Map<string, number>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = toMap(view, vp, { x: (c + 0.5) * step, y: (r + 0.5) * step });
      const id = explored && !isExplored(explored, p) ? undefined : regionAt(grid, p, near);
      ids[r * cols + c] = id;
      if (id) count.set(id, (count.get(id) ?? 0) + 1);
    }
  }
  const shares = [...count.entries()].map(([id, cells]) => ({ id, cells })).sort((x, y) => y.cells - x.cells);
  return { cols, rows, step, ids, shares };
}

/** Подкраска региона — токены темы: местность — цвета маски планеты, дорога — золото, поселения и Подземье — свои. */
export const REGION_TINT: Readonly<Record<string, string>> = {
  'rolling-grasslands': '--terrain-g', 'tangled-forest': '--terrain-f', 'lofty-mountains': '--terrain-m', 'parched-sands': '--terrain-d',
  'frozen-wastes': '--terrain-i', 'restless-sea': '--terrain-o', 'unrelenting-marsh': '--src-sim', 'open-roads': '--gd',
  'urban-township': '--ent-faction', 'country-shire': '--hp-high', 'underland-realm': '--ab-wis',
};
