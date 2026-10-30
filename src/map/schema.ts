// Векторная схема карты (TASKS M16): что рисует режим «Схема» вместо растра — суша, регионы местности, реки, границы и дороги из
// scripts/schema-from-grids.py. Файл лежит рядом с тайлами, грузится один раз на карту; координаты — пиксели исходника.
// Кольца и линии плоские: [x0, y0, x1, y1, …]. Кольца одного класса — один путь с правилом even-odd: дыры сами.
// Регионы с 30.10 заходят в море на пару клеток и заливаются по маске суши: край класса у берега — береговая линия.
import type { TerrainCode } from './terrain';

export interface MapSchema {
  land: readonly (readonly number[])[];
  regions: Partial<Record<TerrainCode, readonly (readonly number[])[]>>;
  roads: readonly (readonly number[])[];
  /** Реки — линии по цвету воды растра (с 30.10); в схемах до того поля нет — пусто. */
  rivers?: readonly (readonly number[])[];
  /** Границы держав — бордовый штрих-пунктир растра линиями (scripts/borders-from-map.py); в схемах до того поля нет — пусто. */
  borders?: readonly (readonly number[])[];
}

/** Порядок заливки: поверх суши (её цвет — равнина) — от низких к высоким, лёд последним. */
export const SCHEMA_ORDER: readonly TerrainCode[] = ['d', 'h', 's', 'f', 'm', 'u', 'i'];

const isRings = (v: unknown): v is number[][] => Array.isArray(v) && v.every(r => Array.isArray(r) && r.length % 2 === 0 && r.every(n => typeof n === 'number'));

/** Разбор файла схемы: битый — ошибка с причиной, а не пустая карта. */
export function parseSchema(raw: unknown): MapSchema {
  const o = raw as { land?: unknown; regions?: Record<string, unknown>; roads?: unknown; rivers?: unknown; borders?: unknown };
  const lines = (v: unknown) => v === undefined || isRings(v);
  if (!o || !isRings(o.land) || !isRings(o.roads) || typeof o.regions !== 'object' || !Object.values(o.regions).every(isRings) || !lines(o.rivers) || !lines(o.borders)) {
    throw new Error('схема карты: ожидались land, regions и roads (и rivers, если есть) — кольца и линии парами чисел');
  }
  return { land: o.land, regions: o.regions as MapSchema['regions'], roads: o.roads, rivers: (o.rivers as number[][] | undefined) ?? [], borders: (o.borders as number[][] | undefined) ?? [] };
}

/** Схема карты с сервера стола; нет файла (не собран) — null: стол показывает растр, как до M16. */
export async function loadSchema(url: string): Promise<MapSchema | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return parseSchema(await res.json());
  } catch {
    return null;
  }
}
