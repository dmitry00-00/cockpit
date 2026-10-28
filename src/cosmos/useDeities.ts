// Справочник богов по требованию: модуль deities.ts (0,5 МБ данных) грузится отдельным куском, когда он нужен экрану —
// схемам космологии (уделы), шагу «Божество» редактора. До загрузки — null, экран рисуется без богов.
import { useEffect, useState } from 'react';

export type DeitiesModule = typeof import('./deities');

export function useDeities(enabled = true): DeitiesModule | null {
  const [mod, setMod] = useState<DeitiesModule | null>(null);
  useEffect(() => {
    if (!enabled || mod) return;
    let live = true;
    void import('./deities').then(m => { if (live) setMod(m); });
    return () => { live = false; };
  }, [enabled, mod]);
  return mod;
}
