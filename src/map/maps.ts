// Паспорта карт мира: content/maps/<id>.json — размер исходника, пирамида тайлов, калибровка миль.
// Сами тайлы на диске (maps/tiles/<id>/), их отдаёт сервер стола; нарезает scripts/tile-map.py.
import neverwinter from '../../content/maps/neverwinter.json';
import toril from '../../content/maps/toril.json';
import type { MapPassport } from './projection';

export const MAPS: Readonly<Record<string, MapPassport>> = { toril, neverwinter: neverwinter as MapPassport };

/** План места (M10): паспорт, у которого plan.place — эта ссылка места справочника. */
export const planOf = (placeRef: string | undefined): MapPassport | undefined =>
  placeRef ? Object.values(MAPS).find(m => m.plan?.place === placeRef) : undefined;

export const mapById = (id: string | undefined): MapPassport | undefined => (id ? MAPS[id] : undefined);

/** Карты, у которых есть маска планеты (design/masks/<id>.json, src/map/planet.ts): уровень планеты — глобусом. Сама
 *  маска — в куске глобуса; список держит planet.test.ts. */
export const PLANET_MASK_IDS: ReadonlySet<string> = new Set(['toril']);
