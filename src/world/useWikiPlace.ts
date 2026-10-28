// Место кампании в справочнике карты (E9, ROADMAP 3.4): место состояния («Neverwinter») ищется по имени; его карточка
// справочника даёт жителей, богов, церкви и организации по вики. Справочник и индекс жителей грузятся отдельными
// кусками, только когда хук включён (карточка места у мастера); до загрузки и без совпадения — null.
import { useEffect, useState } from 'react';
import { ref, type EntityRef } from '../entities/ref';
import { fold, loadGazetteer, type GazetteerPlace } from '../map/gazetteer';
import { loadResidents, type Resident } from './people';

/** Ссылка места кампании (`ref`, ROADMAP 3.3) — сразу; без неё — поиск по имени в справочнике карты. */
export function useWikiPlace(location: { name: string; ref?: EntityRef }, enabled: boolean): EntityRef | null {
  const [data, setData] = useState<{ places: readonly GazetteerPlace[]; index: Readonly<Record<string, readonly Resident[]>> } | null>(null);
  useEffect(() => {
    if (!enabled || data || location.ref) return;
    let live = true;
    void Promise.all([loadGazetteer('toril'), loadResidents()]).then(([places, index]) => { if (live) setData({ places, index }); });
    return () => { live = false; };
  }, [enabled, data, location.ref]);
  if (!enabled) return null;
  if (location.ref) return location.ref;
  if (!data) return null;
  // Одноимённых мест несколько (город и область) — берётся то, у которого больше жителей.
  const key = fold(location.name);
  const same = data.places.filter(p => fold(p.name) === key);
  const place = same.sort((a, b) => (data.index[b.id]?.length ?? 0) - (data.index[a.id]?.length ?? 0))[0];
  return place ? ref('place', place.id) : null;
}
