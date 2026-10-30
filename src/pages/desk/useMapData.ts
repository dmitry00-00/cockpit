// Данные карты уровня, что грузятся с сервера стола, как тайлы: сетка местности (M9), дороги и Подземье (6.3),
// справочник мест (M12), векторная схема (M16). Каждые — один раз на карту, кэш живёт, пока жива страница; не события.
import { useEffect, useState } from 'react';
import { loadGazetteer, type GazetteerPlace } from '../../map/gazetteer';
import type { LevelMap } from '../../map/levelMap';
import type { MapPassport } from '../../map/projection';
import { loadRoads, loadTerrain, type RoadGrid, type TerrainGrid } from '../../map/terrain';
import { loadUnderdark, type UnderdarkRegion } from '../../map/underdark';
import { loadSchema, type MapSchema } from '../../map/schema';

/** Значение на карту: грузится при первом заходе на неё, дальше — из кэша страницы. load — модульная функция. */
function usePerMap<T>(passport: MapPassport | undefined, load: (passport: MapPassport) => Promise<T> | null): T | undefined {
  const [byMap, setByMap] = useState<Readonly<Record<string, T>>>({});
  const id = passport?.id;
  useEffect(() => {
    if (!passport || !id || id in byMap) return;
    const pending = load(passport);
    if (!pending) return;
    let live = true;
    void pending.then(v => { if (live) setByMap(m => ({ ...m, [id]: v })); });
    return () => { live = false; };
  }, [passport, id, load, byMap]);
  return id ? byMap[id] : undefined;
}

// Сетка местности (M9) и дороги (6.3) — картинки рядом с тайлами; нет картинки или canvas (jsdom) — null, поход
// считает по галочке мастера и без дорог.
const terrainOf = (p: MapPassport) => (p.terrain ? loadTerrain(p.terrain.url, p.terrain.cell) : null);
const roadsOf = (p: MapPassport) => (p.roads ? loadRoads(p.roads.url, p.roads.cell) : null);
// Справочник мест (M12) и Подземье (6.3) — справка мастера: отдельными кусками при первой карте.
const gazetteerOf = (p: MapPassport) => loadGazetteer(p.id);
const underdarkOf = (p: MapPassport) => loadUnderdark(p.id);
// Схема (M16) — файл рядом с тайлами; нет — карта сразу растром.
const schemaOf = (p: MapPassport) => (p.schema ? loadSchema(p.schema.url) : null);

export function useMapData(map: LevelMap | undefined): {
  terrain: TerrainGrid | null;
  roads: RoadGrid | null;
  gazetteer: readonly GazetteerPlace[] | undefined;
  underdark: readonly UnderdarkRegion[] | undefined;
  schema: MapSchema | null;
} {
  const passport = map?.passport;
  const terrain = usePerMap(passport, terrainOf);
  const roads = usePerMap(passport, roadsOf);
  const gazetteer = usePerMap(passport, gazetteerOf);
  const underdark = usePerMap(passport, underdarkOf);
  const schema = usePerMap(passport, schemaOf);
  return { terrain: terrain ?? null, roads: roads ?? null, gazetteer, underdark, schema: schema ?? null };
}
