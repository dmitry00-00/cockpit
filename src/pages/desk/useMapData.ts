// Данные карты уровня, что грузятся с сервера стола, как тайлы: сетка местности (M9) и справочник мест (M12).
// Каждые — один раз на карту, кэш живёт, пока жива страница; не события.
import { useEffect, useState } from 'react';
import { loadGazetteer, type GazetteerPlace } from '../../map/gazetteer';
import type { LevelMap } from '../../map/levelMap';
import { loadTerrain, type TerrainGrid } from '../../map/terrain';

export function useMapData(map: LevelMap | undefined): { terrain: TerrainGrid | null; gazetteer: readonly GazetteerPlace[] | undefined } {
  // Сетка местности карты (M9) — данные карты, как тайлы: грузится один раз на карту, не событие. Нет картинки
  // или canvas (jsdom) — null, поход считает по галочке мастера.
  const [terrains, setTerrains] = useState<Readonly<Record<string, TerrainGrid | null>>>({});
  const terrainSpec = map?.passport.terrain;
  const terrainMap = map?.passport.id;
  useEffect(() => {
    if (!terrainSpec || !terrainMap || terrainMap in terrains) return;
    let live = true;
    void loadTerrain(terrainSpec.url, terrainSpec.cell).then(grid => { if (live) setTerrains(t => ({ ...t, [terrainMap]: grid })); });
    return () => { live = false; };
  }, [terrainSpec, terrainMap, terrains]);
  // Справочник мест карты (M12) — справка мастера, как тайлы: грузится отдельным куском при первой карте.
  const [gazetteers, setGazetteers] = useState<Readonly<Record<string, readonly GazetteerPlace[]>>>({});
  useEffect(() => {
    if (!terrainMap || terrainMap in gazetteers) return;
    let live = true;
    void loadGazetteer(terrainMap).then(list => { if (live) setGazetteers(g => ({ ...g, [terrainMap]: list })); });
    return () => { live = false; };
  }, [terrainMap, gazetteers]);
  return {
    terrain: terrainMap ? terrains[terrainMap] ?? null : null,
    gazetteer: terrainMap ? gazetteers[terrainMap] : undefined,
  };
}
