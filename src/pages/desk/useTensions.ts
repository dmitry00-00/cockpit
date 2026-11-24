// Напряжения для стола (Д3, ROADMAP 7.2): справочник мира грузится куском, когда мастеру он нужен (вид «Пульс», карта,
// сцена места), — не со стартом. Пересчёт — по миру и фактам кампании и по году: остальное состояние их не меняет.
import { useEffect, useMemo, useState } from 'react';
import { calendarAdapterForState, influenceOf, tensionsOf, type InfluenceMarks, type Tension, type TensionCanon } from '../../campaign';
import type { State } from '../../engine/state';
import { loadTensionCanon } from '../../world/tensions';
import { DEFAULT_SETTING_PACKAGE } from '../../packages/registry';

/** Напряжения в год кампании и слой влияния; null — справочник не загружен или не нужен (игрокам — никогда). */
export function useTensions(state: State, enabled: boolean): { list: readonly Tension[]; influence: InfluenceMarks } | null {
  const [canon, setCanon] = useState<TensionCanon | null>(null);
  const settingPackageId = state.settingPackageId ?? DEFAULT_SETTING_PACKAGE;
  const supportsForgottenRealmsCanon = settingPackageId === DEFAULT_SETTING_PACKAGE;
  const enabledForPackage = enabled && supportsForgottenRealmsCanon;
  useEffect(() => {
    if (!enabledForPackage || canon) return;
    let live = true;
    void loadTensionCanon().then(c => { if (live) setCanon(c); });
    return () => { live = false; };
  }, [enabledForPackage, canon]);
  const year = supportsForgottenRealmsCanon ? calendarAdapterForState(state).yearAt(state.time.sec) : null;
  const { world, facts } = state;
  return useMemo(
    () => {
      if (!enabledForPackage || !canon || year === null) return null;
      const s = { ...state, world, facts };
      const list = tensionsOf(s, year, canon);
      return { list, influence: influenceOf(s, year, canon, list) };
    },
    // Напряжения читают только мир и факты; время — через год.
    [enabledForPackage, canon, world, facts, year],
  );
}
