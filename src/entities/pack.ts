// Пакет справочника: несколько видов, которые грузятся одним куском. Пакет знает свои id и собирает EntityView по id.
import type { ReferenceKind } from './ref';
import type { EntityView } from './view';

export interface Pack {
  kinds: readonly ReferenceKind[];
  resolve(kind: ReferenceKind, id: string): EntityView | undefined;
  ids(kind: ReferenceKind): readonly string[];
}

/** Пакет из таблицы «вид → id → представление»: представления собираются при первом обращении. */
export function tablePack(table: { readonly [K in ReferenceKind]?: Readonly<Record<string, () => EntityView>> }): Pack {
  const cache = new Map<string, EntityView>();
  const kinds = Object.keys(table) as ReferenceKind[];
  return {
    kinds,
    ids: kind => Object.keys(table[kind] ?? {}),
    resolve(kind, id) {
      const key = `${kind}:${id}`;
      const hit = cache.get(key);
      if (hit) return hit;
      const make = table[kind]?.[id];
      if (!make) return undefined;
      const view = make();
      cache.set(key, view);
      return view;
    },
  };
}
