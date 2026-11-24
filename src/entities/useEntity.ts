// Хук карточки по ссылке: представление, если пакет вида загружен; иначе — загрузка и перерисовка по готовности.
// Записи нет после загрузки — заглушка missingView (пропажа видна).
import { useEffect, useState } from 'react';
import { isReady, isStateKind, loadKind, missingView, parseRef, resolve, type EntityRef, type EntityView, type ResolveContext } from './index';

/** Контекст задаёт время кампании и выбранный сеттинг для загрузки и разрешения сущности. */
export function useEntity(ref: EntityRef | null, context: ResolveContext = {}): EntityView | 'loading' | null {
  const [, bump] = useState(0);
  const [retriedLoad, setRetriedLoad] = useState<{ key: string; value: boolean }>({ key: '', value: false });
  const p = ref ? parseRef(ref) : null;
  const ready = p ? isReady(p.kind, context) : true;
  const settingPackageId = context.settingPackageId ?? context.state?.settingPackageId;
  const loadKey = `${settingPackageId ?? ''}:${p?.kind ?? ''}`;
  const hasRetried = retriedLoad.key === loadKey && retriedLoad.value;
  useEffect(() => {
    if (!p || ready || isStateKind(p.kind)) return;
    let live = true;
    void loadKind(p.kind, { settingPackageId }).then(
      () => { if (live) bump(n => n + 1); },
      () => {
        // Drop one transient failure, then retry once. Persistent errors stay in the existing loading state
        // without an unhandled rejection or an unbounded request loop.
        if (live && !hasRetried) setRetriedLoad({ key: loadKey, value: true });
      },
    );
    return () => { live = false; };
  // При смене сеттинга во время открытой карточки загрузка переключается на кэш нового пакета.
  }, [p?.kind, ready, settingPackageId, loadKey, hasRetried]);
  if (!ref || !p) return null;
  if (!ready) return 'loading';
  return resolve(ref, context) ?? missingView(ref);
}
