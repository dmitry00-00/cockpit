// Хук карточки по ссылке: представление, если пакет вида загружен; иначе — загрузка и перерисовка по готовности.
// Записи нет после загрузки — заглушка missingView (пропажа видна).
import { useEffect, useState } from 'react';
import type { Era } from '../campaign/era';
import type { State } from '../engine';
import { isReady, isStateKind, loadKind, missingView, parseRef, resolve, type EntityRef, type EntityView } from './index';

/** `era` и `year` — эпоха и год без состояния (лист и карточка места знают только время мира); иначе их даёт время State. */
export function useEntity(ref: EntityRef | null, state?: State, era?: Era, year?: number): EntityView | 'loading' | null {
  const [, bump] = useState(0);
  const p = ref ? parseRef(ref) : null;
  const ready = p ? isReady(p.kind) : true;
  useEffect(() => {
    if (!p || ready || isStateKind(p.kind)) return;
    let live = true;
    void loadKind(p.kind).then(() => { if (live) bump(n => n + 1); });
    return () => { live = false; };
  // Зависит только от вида и готовности: ссылка того же вида перерисуется без новой загрузки.
  }, [p?.kind, ready]);
  if (!ref || !p) return null;
  if (!ready) return 'loading';
  return resolve(ref, { state, era, year }) ?? missingView(ref);
}
