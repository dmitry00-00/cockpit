// Пакет справочника: несколько видов, которые грузятся одним куском. Пакет знает свои id и собирает EntityView по id.
// Эпоха кампании — для видов, чьи факты зависят от года (божества, их планы); остальные виды её не замечают.
import type { Era } from '../campaign/era';
import type { ReferenceKind } from './ref';
import type { EntityView } from './view';

export interface Pack {
  kinds: readonly ReferenceKind[];
  resolve(kind: ReferenceKind, id: string, era?: Era): EntityView | undefined;
  ids(kind: ReferenceKind): readonly string[];
}

/** Пакет из таблицы «вид → id → представление»: представления собираются при первом обращении, по эпохе отдельно. */
export function tablePack(table: { readonly [K in ReferenceKind]?: Readonly<Record<string, (era: Era) => EntityView>> }): Pack {
  const cache = new Map<string, EntityView>();
  const kinds = Object.keys(table) as ReferenceKind[];
  return {
    kinds,
    ids: kind => Object.keys(table[kind] ?? {}),
    resolve(kind, id, era = '5e') {
      const key = `${kind}:${id}@${era}`;
      const hit = cache.get(key);
      if (hit) return hit;
      const make = table[kind]?.[id];
      if (!make) return undefined;
      const view = make(era);
      cache.set(key, view);
      return view;
    },
  };
}
