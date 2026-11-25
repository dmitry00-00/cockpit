import { useEffect, useMemo, useState } from 'react';
import { KIND_LABEL, loadKind, refsOf, resolve, REFERENCE_KINDS, type EntityKind, type EntityRef, type EntityView, type ReferenceKind } from '../../entities';
import { PACKAGE_REGISTRY, packageKindLabel } from '../../packages/registry';

const INPUT = 'min-w-0 bg-wl px-2 py-1 type-body-sm text-tx shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';
const BTN = 'px-2 py-1 type-body-sm text-tx bg-linear-to-b from-pl to-cd shadow-bevel hover:text-gd-hi focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
const KIND_LABELS: Readonly<Partial<Record<EntityKind, string>>> = {
  person: 'Персонаж', place: 'Место', organization: 'Дом / организация', event: 'Событие', kingdom: 'Держава',
};

const kindLabel = (packageId: string, kind: EntityKind): string =>
  packageKindLabel(packageId, kind) ?? KIND_LABELS[kind] ?? KIND_LABEL[kind] ?? kind;

function kindsFor(packageId: string): ReferenceKind[] {
  const manifest = PACKAGE_REGISTRY.find(item => item.id === packageId && item.kind === 'setting');
  const kinds = new Set<string>(manifest?.layers.flatMap(layer => layer.kinds) ?? []);
  return REFERENCE_KINDS.filter(kind => kinds.has(kind));
}

/** Read-only browser for entity cards declared by the selected setting package. */
export function SettingCatalog({ packageId, onOpen }: { packageId: string; onOpen: (ref: EntityRef) => void }) {
  const kinds = useMemo(() => kindsFor(packageId), [packageId]);
  const [entries, setEntries] = useState<EntityView[]>([]);
  const [selectedKind, setSelectedKind] = useState<'all' | ReferenceKind>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setEntries([]);
    setSelectedKind('all');
    setQuery('');
    setError('');
    setLoading(false);
    if (!kinds.length) return () => { live = false; };
    setLoading(true);
    void Promise.all(kinds.map(async kind => {
      await loadKind(kind, { settingPackageId: packageId });
      return refsOf(kind, { settingPackageId: packageId })
        .map(ref => resolve(ref, { settingPackageId: packageId }))
        .filter((view): view is EntityView => !!view);
    })).then(groups => {
      if (live) setEntries(groups.flat());
    }).catch(reason => {
      if (live) setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => {
      if (live) setLoading(false);
    });
    return () => { live = false; };
  }, [kinds, packageId]);

  const shown = entries.filter(view => {
    if (selectedKind !== 'all' && view.kind !== selectedKind) return false;
    const needle = query.trim().toLocaleLowerCase();
    return !needle || [view.name, view.nameRu ?? '', view.subtitle ?? '']
      .some(value => value.toLocaleLowerCase().includes(needle));
  });

  return (
    <section aria-label="Каталог карточек сеттинга" className="mx-2 mb-2 flex flex-col gap-2 bg-pl p-2 shadow-plate">
      <h3 className="type-body-bold text-tx">Карточки сеттинга · {entries.length}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="flex min-w-0 flex-col gap-1 type-body-xs text-t2">
          Поиск по имени
          <input className={INPUT} type="search" value={query} onChange={event => setQuery(event.currentTarget.value)} placeholder="Персонаж, место, дом, событие" />
        </label>
        <label className="flex min-w-0 flex-col gap-1 type-body-xs text-t2">
          Категория
          <select className={INPUT} value={selectedKind} onChange={event => setSelectedKind(event.currentTarget.value as 'all' | ReferenceKind)}>
            <option value="all">Все категории</option>
            {kinds.map(kind => <option key={kind} value={kind}>{kindLabel(packageId, kind)}</option>)}
          </select>
        </label>
      </div>
      {loading ? <p role="status" className="type-body-xs text-t2">Загружаю карточки…</p> : null}
      {error ? <p role="alert" className="type-body-xs text-fx-damage-hi">Каталог не загружен: {error}</p> : null}
      {!loading && !error && !kinds.length ? <p className="type-body-xs text-t2">В пакете пока нет справочных карточек.</p> : null}
      {!loading && !error && kinds.length > 0 ? (
        <ul aria-label="Карточки сеттинга" className="flex max-h-64 flex-col gap-1 overflow-auto">
          {shown.map(view => (
            <li key={view.ref}>
              <button type="button" className={`${BTN} w-full min-w-0 text-left`} onClick={() => onOpen(view.ref)}>
                <span className="flex min-w-0 items-baseline justify-between gap-2">
                  <span className="truncate">{view.nameRu ?? view.name}</span>
                  <span className="flex-none type-body-xs text-t2">{kindLabel(packageId, view.kind)}</span>
                </span>
                {view.nameRu ? <span className="block truncate type-body-xs text-t2">{view.name}</span> : null}
                {view.subtitle ? <span className="block truncate type-body-xs text-t2">{view.subtitle}</span> : null}
              </button>
            </li>
          ))}
          {shown.length === 0 ? <li className="type-body-xs text-t2">Совпадений нет.</li> : null}
        </ul>
      ) : null}
    </section>
  );
}

export default SettingCatalog;
