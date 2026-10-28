// Жители места кампании (E9): место состояния («Neverwinter») ищется в справочнике карты по имени, его жители — в
// индексе NPC вики, живые в год кампании. Справочник и индекс грузятся отдельными кусками, только когда хук включён
// (карточка места у мастера); до загрузки и без совпадения — null.
import { useEffect, useState } from 'react';
import { fold, loadGazetteer, type GazetteerPlace } from '../map/gazetteer';
import { loadResidents, residentsAlive, type Resident } from './people';

export interface PlaceResidents { placeId: string; residents: Resident[] }

export function usePlaceResidents(name: string, year: number | undefined): PlaceResidents | null {
  const [data, setData] = useState<{ places: readonly GazetteerPlace[]; index: Readonly<Record<string, readonly Resident[]>> } | null>(null);
  const on = year !== undefined;
  useEffect(() => {
    if (!on || data) return;
    let live = true;
    void Promise.all([loadGazetteer('toril'), loadResidents()]).then(([places, index]) => { if (live) setData({ places, index }); });
    return () => { live = false; };
  }, [on, data]);
  if (!data || year === undefined) return null;
  // Одноимённых мест несколько (город и область) — берётся то, у которого есть жители.
  const key = fold(name);
  const place = data.places.filter(p => fold(p.name) === key).find(p => data.index[p.id]?.length);
  if (!place) return null;
  return { placeId: place.id, residents: residentsAlive(data.index[place.id], year) };
}
