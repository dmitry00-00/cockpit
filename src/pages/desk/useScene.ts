// Сцена места для вкладки «Сейчас» (Д2, ROADMAP 6.2): справочник места (вики, хронология, поход A5E) грузится куском
// только мастеру; до загрузки сцена уже есть — из состояния кампании (календарь, рынок, округа, нити).
import { useEffect, useMemo, useState } from 'react';
import { harptos, sceneOf, type Scene, type SceneAt, type SceneCanon } from '../../campaign';
import type { State } from '../../engine/state';
import { parseRef } from '../../entities';
import { loadSceneCanon } from '../../world/sceneCanon';
import { useWikiPlace } from '../../world/useWikiPlace';

const NO_LOCATION = { name: '' };

/** Сцена в `sec`: место кампании (`location`) или место справочника карты (`place`); null — сцены нет. */
export function useScene(state: State, at: SceneAt | null, sec: number, dm: boolean): { scene: Scene | null; loading: boolean } {
  const location = at?.location ? state.world.locations[at.location] : undefined;
  // Место кампании без ссылки на справочник — по имени, как обзор места.
  const wiki = useWikiPlace(location ?? NO_LOCATION, dm && !!location);
  const placeId = at?.place ?? (wiki ? parseRef(wiki)?.id : undefined);
  const year = harptos(sec).year;
  const key = placeId ? `${placeId}|${year}` : '';
  const [canon, setCanon] = useState<{ key: string; canon: SceneCanon } | null>(null);
  useEffect(() => {
    if (!dm || !key) return;
    let live = true;
    void loadSceneCanon(placeId!, year).then(c => { if (live) setCanon({ key, canon: c }); });
    return () => { live = false; };
  }, [dm, key, placeId, year]);
  const ready = canon?.key === key ? canon.canon : undefined;
  const { location: locId, place } = at ?? {};
  const on = at !== null;
  const scene = useMemo(
    () => (on ? sceneOf(state, { location: locId, place }, sec, ready, { players: !dm }) : null),
    [state, on, locId, place, sec, ready, dm],
  );
  return { scene, loading: dm && !!key && !ready };
}
