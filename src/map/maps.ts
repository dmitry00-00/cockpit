// Паспорта карт приходят из поля maps манифестов setting-пакетов. Тайлы остаются на диске
// (maps/tiles/<id>/), их отдаёт сервер стола; нарезает scripts/tile-map.py.
import type { MapPassport } from './projection';
import { mapsFromRegistry, settingPackageForMap } from '../packages/registry';
import { DEFAULT_SETTING_PACKAGE } from '../packages/settings';

export const MAPS: Readonly<Record<string, MapPassport>> = mapsFromRegistry();

/** План места (M10) только из пакета активной кампании. */
export const planOf = (
  placeRef: string | undefined,
  settingPackageId = DEFAULT_SETTING_PACKAGE,
): MapPassport | undefined => placeRef
  ? Object.values(MAPS).find(m => m.plan?.place === placeRef && settingPackageForMap(m.id)?.id === settingPackageId)
  : undefined;

/** Карта доступна кампании только если её манифест принадлежит выбранному пакету. */
export const mapById = (
  id: string | undefined,
  settingPackageId = DEFAULT_SETTING_PACKAGE,
): MapPassport | undefined => {
  if (!id) return undefined;
  const passport = MAPS[id];
  return passport && settingPackageForMap(id)?.id === settingPackageId ? passport : undefined;
};

/** Карты, у которых есть маска планеты (design/masks/<id>.json, src/map/planet.ts): уровень планеты — глобусом. Сама
 *  маска — в куске глобуса; список держит planet.test.ts. */
export const PLANET_MASK_IDS: ReadonlySet<string> = new Set(['toril']);
