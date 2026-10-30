// Чистая карта (TASKS M17): растр той же карты без подписей и значков — подложка режима «Чистая», поверх неё подписи
// схемы (schemaLabels) и места справочника по координатам. Паспорт — content/maps/<id>-clean.json, отдельным куском
// по требованию (в основной кусок не идёт): стол зовёт этот модуль через import() из useMapData.
// Подложка обязана совпадать с растром карты по сетке — размеры исходника, тайл, пирамида и калибровка: вид карты
// (центр и масштаб в пикселях исходника) общий у всех режимов, и переключение не сдвигает карту. Не совпала — режима
// нет. Тайлы — на диске (maps/tiles/<id>-clean/, не в git: растр только для стола); их нет или нарезка не дошла до
// done.json — режима нет, без ошибки, как у карты без схемы.
import type { MapPassport } from './projection';

const LOADERS: Readonly<Record<string, () => Promise<unknown>>> = {
  toril: () => import('../../content/maps/toril-clean.json').then(m => m.default),
};

/** Поля паспорта, по которым сетка подложки обязана совпасть с растром карты. */
const GRID = ['width', 'height', 'tileSize', 'maxZoom', 'milesPerPixel'] as const;

/** Чем сетка чистой карты расходится с растром — поля через запятую; совпала — null. */
export function gridMismatch(base: MapPassport, clean: Partial<MapPassport>): string | null {
  const bad = GRID.filter(k => clean[k] !== base[k]);
  return bad.length ? bad.join(', ') : null;
}

/** Метка нарезки tile-map.py (`done.json` рядом с тайлами): она пишется последней, так что есть — пирамида целиком. */
interface TilesDone {
  width?: unknown;
  height?: unknown;
  maxZoom?: unknown;
}

/**
 * Паспорт чистой карты для растра base, если подложка есть на диске и совпадает с ним сеткой; иначе null. Не бросает:
 * нет паспорта, нет тайлов (404), битая метка, сеть — всё «режима нет». Расхождение сетки — ещё и предупреждение в
 * консоль: это ошибка нарезки, а не отсутствие файлов.
 */
export async function loadClean(base: MapPassport, get: typeof fetch = fetch): Promise<MapPassport | null> {
  const load = LOADERS[base.id];
  if (!load) return null;
  try {
    const clean = (await load()) as MapPassport;
    const bad = gridMismatch(base, clean);
    if (bad) {
      console.warn(`чистая карта ${clean.id}: сетка не совпадает с ${base.id} (${bad}) — режим «Чистая» выключен`);
      return null;
    }
    const res = await get(`${clean.tiles}/done.json`);
    if (!res.ok) return null;
    const done = (await res.json()) as TilesDone;
    if (done.width !== base.width || done.height !== base.height || done.maxZoom !== base.maxZoom) {
      console.warn(`чистая карта ${clean.id}: нарезка ${String(done.width)}×${String(done.height)}, z${String(done.maxZoom)} не сходится с паспортом`);
      return null;
    }
    return clean;
  } catch {
    return null;
  }
}
