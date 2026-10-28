// Паспорта карт мира: content/maps/<id>.json — размер исходника, пирамида тайлов, калибровка миль.
// Сами тайлы на диске (maps/tiles/<id>/), их отдаёт сервер стола; нарезает scripts/tile-map.py.
import toril from '../../content/maps/toril.json';
import type { MapPassport } from './projection';

export const MAPS: Readonly<Record<string, MapPassport>> = { toril };

export const mapById = (id: string | undefined): MapPassport | undefined => (id ? MAPS[id] : undefined);
