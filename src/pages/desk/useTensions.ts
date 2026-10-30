// Напряжения для стола (Д3, ROADMAP 7.2): справочник мира грузится куском, когда мастеру он нужен (вид «Пульс», карта,
// сцена места), — не со стартом. Пересчёт — по миру и фактам кампании и по году: остальное состояние их не меняет.
import { useEffect, useMemo, useState } from 'react';
import { harptos, influenceOf, tensionsOf, type InfluenceMarks, type Tension, type TensionCanon } from '../../campaign';
import type { State } from '../../engine/state';
import { loadTensionCanon } from '../../world/tensions';

/** Напряжения в год кампании и слой влияния; null — справочник не загружен или не нужен (игрокам — никогда). */
export function useTensions(state: State, enabled: boolean): { list: readonly Tension[]; influence: InfluenceMarks } | null {
  const [canon, setCanon] = useState<TensionCanon | null>(null);
  useEffect(() => {
    if (!enabled || canon) return;
    let live = true;
    void loadTensionCanon().then(c => { if (live) setCanon(c); });
    return () => { live = false; };
  }, [enabled, canon]);
  const year = harptos(state.time.sec).year;
  const { world, facts } = state;
  return useMemo(
    () => {
      if (!enabled || !canon) return null;
      const s = { ...state, world, facts };
      const list = tensionsOf(s, year, canon);
      return { list, influence: influenceOf(s, year, canon, list) };
    },
    // Напряжения читают только мир и факты; время — через год.
    [enabled, canon, world, facts, year],
  );
}
