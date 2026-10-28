// Уделы богов на схемах космологии (E3): сколько богов живёт на плане — число в узле схемы, кто именно и как зовётся
// его владение — список в карточке плана. Данные богов (0,5 МБ) догружаются, только когда план или космология на
// экране (`enabled`); до загрузки схема рисуется без чисел.
import { useMemo } from 'react';
import type { Era } from '../campaign/era';
import type { PlaneRealm } from './deities';
import { useDeities } from './useDeities';

export type { PlaneRealm };

/** Уделы плана по id. */
export type RealmIndex = (planeId: string) => readonly PlaneRealm[];

export function useRealms(era: Era, enabled = true): RealmIndex | undefined {
  const mod = useDeities(enabled);
  return useMemo(() => {
    if (!mod) return undefined;
    const cache = new Map<string, readonly PlaneRealm[]>();
    return (id: string) => {
      let hit = cache.get(id);
      if (!hit) cache.set(id, (hit = mod.realmsOfPlane(id, era)));
      return hit;
    };
  }, [mod, era]);
}
