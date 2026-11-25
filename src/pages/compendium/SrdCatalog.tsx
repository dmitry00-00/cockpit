import { useMemo, useState } from 'react';
import {
  filterSrdCatalog,
  SRD_CATALOG,
  SRD_CATALOG_TYPE_COUNTS,
  SRD_CATALOG_TYPE_LABELS,
  SRD_CATALOG_TYPES,
  type SrdCatalogFilterType,
} from '../../rules/srd/catalog';

const PAGE_SIZE = 80;

export function SrdCatalog() {
  const [type, setType] = useState<SrdCatalogFilterType>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const filtered = useMemo(() => filterSrdCatalog(SRD_CATALOG, type, query), [type, query]);
  const visible = filtered.slice(0, limit);

  return (
    <section className="flex flex-col gap-3" aria-label="Каталог SRD 5.1">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="type-h-17 text-gd">Единый каталог SRD 5.1</h2>
        <span className="type-num-12 text-t2">{SRD_CATALOG.length} записей · {filtered.length} по текущему фильтру</span>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="type-body-xs text-t3">тип записи</span>
          <select
            aria-label="Фильтр по типу записи"
            value={type}
            onChange={event => { setType(event.target.value as SrdCatalogFilterType); setLimit(PAGE_SIZE); }}
            className="type-body-sm text-tx bg-cd shadow-bevel-in px-2 py-1"
          >
            <option value="all">Все типы ({SRD_CATALOG.length})</option>
            {SRD_CATALOG_TYPES.filter(recordType => SRD_CATALOG_TYPE_COUNTS[recordType] > 0).map(recordType => (
              <option key={recordType} value={recordType}>
                {SRD_CATALOG_TYPE_LABELS[recordType]} ({SRD_CATALOG_TYPE_COUNTS[recordType]})
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="type-body-xs text-t3">поиск</span>
          <input
            value={query}
            onChange={event => { setQuery(event.target.value); setLimit(PAGE_SIZE); }}
            placeholder="название, ID или раздел"
            className="type-body-sm text-tx bg-cd shadow-bevel-in px-2 py-1 w-[240px] placeholder:text-t4"
          />
        </label>
      </div>

      <p className="type-body-xs text-t3">
        Индекс хранит тип, раздел и ссылку на источник. Наличие записи не означает, что её правило уже автоматизировано в движке.
      </p>

      <div className="overflow-x-auto bg-pn shadow-bevel">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 bg-cd text-t2">
            <tr className="type-key border-b border-gd/30">
              <th scope="col" className="px-3 py-2">Запись</th>
              <th scope="col" className="px-3 py-2">Тип</th>
              <th scope="col" className="px-3 py-2">Раздел SRD</th>
              <th scope="col" className="px-3 py-2">Источник данных</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(record => (
              <tr key={record.id} className="border-b border-gd/10 hover:bg-pl/50">
                <th scope="row" className="type-body-sm text-tx font-medium px-3 py-2">{record.name}</th>
                <td className="type-body-xs text-t2 px-3 py-2">{SRD_CATALOG_TYPE_LABELS[record.type]}</td>
                <td className="type-body-xs text-t2 px-3 py-2">{record.bookSection}</td>
                <td className="type-body-xs text-t3 px-3 py-2"><code title={record.sourceRef}>{record.sourceRef}</code></td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={4} className="type-body-sm text-t3 px-3 py-5">Записей по этому фильтру нет.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {visible.length < filtered.length && (
        <button
          type="button"
          onClick={() => setLimit(current => current + PAGE_SIZE)}
          className="self-start type-body-sm text-gd px-3 py-1 bg-cd shadow-bevel hover:text-gd-hi"
        >
          Показать ещё {Math.min(PAGE_SIZE, filtered.length - visible.length)}
        </button>
      )}
    </section>
  );
}
