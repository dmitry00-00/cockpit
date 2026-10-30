// Товары держав и мест для торговли (SIMULATION.md С3): content/world/econ.json — exports и imports карточек
// Forgotten Realms Wiki (CC BY-SA 3.0, только внутри — решение пользователя 30.10.2026), сведённые к GOODS
// скриптом scripts/econ-from-wiki.py. Словарь живёт в скрипте, сюда приходят только id товаров. Отдельным куском, по
// требованию торговли; файла нет — товаров нет, а не ошибка.
import type { GoodsId } from '../engine/state';
import { kingdomsOfPlace, type Kingdom } from './kingdoms';

/** x — вывоз, m — ввоз. */
export interface EconRecord { x?: readonly GoodsId[]; m?: readonly GoodsId[] }
export interface Econ { kingdoms: ReadonlyMap<string, EconRecord>; places: ReadonlyMap<string, EconRecord> }

const FILES = import.meta.glob<{ default: unknown }>('../../content/world/econ.json');

let econ: Promise<Econ> | null = null;
/** Товары держав и мест; повторный вызов — тот же промис; файла нет — пусто. */
export function loadEcon(): Promise<Econ> {
  const load = Object.values(FILES)[0];
  econ ??= load
    ? load().then(m => {
      const f = m.default as { kingdoms: Record<string, EconRecord>; places: Record<string, EconRecord> };
      return { kingdoms: new Map(Object.entries(f.kingdoms)), places: new Map(Object.entries(f.places)) };
    })
    : Promise.resolve({ kingdoms: new Map(), places: new Map() });
  return econ;
}

/** Товары места справочника карты на год и откуда они: вывоз — своя карточка вики, иначе держава места (своя —
 *  первой, `kingdomsOfPlace`); ввоз — у карточек мест его нет, всегда держава. Ничего не известно — пусто. */
export function econOfPlace(e: Econ, kingdoms: Iterable<Kingdom>, placeId: string, year: number): EconRecord & { kingdom?: string } {
  const own = e.places.get(placeId);
  const k = kingdomsOfPlace(kingdoms, placeId, year).find(k => e.kingdoms.has(k.id));
  const ke = k ? e.kingdoms.get(k.id) : undefined;
  const x = own?.x ?? ke?.x, m = ke?.m;
  return { ...(x ? { x } : {}), ...(m ? { m } : {}), ...(k && ke ? { kingdom: k.id } : {}) };
}
