import { useState } from 'react';
import { ArtImage } from './ArtImage';
import { ART, type ArtId } from './registry.generated';
import { PRODUCT_ART_USAGE, productArtBindingCount, productArtUsage } from './productArtUsage';

const PAGE_SIZE = 36;
const FAMILY_LABEL: Readonly<Record<string, string>> = {
  portrait: 'Портреты', emblem: 'Знаки и эмблемы', item: 'Предметы', instrument: 'Приборы', scene: 'Сцены', material: 'Материалы',
};
const STATUS_LABEL: Readonly<Record<string, string>> = {
  approved: 'Утверждён', concept: 'Концепт', comparison: 'Сравнение',
};

const assetIds = Object.keys(ART) as ArtId[];
const families = [...new Set(assetIds.map(id => ART[id].family))].sort();
const statuses = [...new Set(assetIds.map(id => ART[id].status))].sort();

/** Complete built-in asset index. Links shown here come from explicit product bindings, not name guessing. */
export default function ArtSheet() {
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('');
  const [status, setStatus] = useState('');
  const [binding, setBinding] = useState<'all' | 'linked' | 'catalog'>('all');
  const [page, setPage] = useState(0);
  const needle = query.trim().toLocaleLowerCase();
  const filtered = assetIds.filter(id => {
    const asset = ART[id];
    const uses = productArtUsage(id);
    return (!needle || `${id} ${asset.label} ${uses.join(' ')}`.toLocaleLowerCase().includes(needle))
      && (!family || asset.family === family)
      && (!status || asset.status === status)
      && (binding === 'all' || (binding === 'linked' ? uses.length > 0 : uses.length === 0));
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const shown = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const linkedVisible = filtered.filter(id => productArtUsage(id).length > 0).length;

  return <div className="flex flex-col gap-3" data-part="art-catalog" data-assets={assetIds.length} data-bound={productArtBindingCount}>
    <p className="type-body-sm text-t2">
      {assetIds.length} встроенных ассетов · {productArtBindingCount} явно подключены к продуктовым поверхностям · {assetIds.length - productArtBindingCount} пока доступны только в каталоге.
      Статус изображения показывает состояние художественной приёмки и не меняет его при подключении.
    </p>
    <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2">
      <label className="flex flex-col gap-1 type-key text-t2">Поиск ассета
        <input type="search" aria-label="Поиск ассета" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="ID, имя или применение" className="min-w-0 bg-cd shadow-bevel-in px-2 py-1 type-body-sm text-tx" />
      </label>
      <label className="flex flex-col gap-1 type-key text-t2">Семейство
        <select aria-label="Семейство графики" value={family} onChange={event => { setFamily(event.target.value); setPage(0); }} className="min-w-0 bg-cd shadow-bevel-in px-2 py-1 type-body-sm text-tx">
          <option value="">Все семейства</option>
          {families.map(value => <option key={value} value={value}>{FAMILY_LABEL[value] ?? value}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 type-key text-t2">Художественный статус
        <select aria-label="Статус художественной приёмки" value={status} onChange={event => { setStatus(event.target.value); setPage(0); }} className="min-w-0 bg-cd shadow-bevel-in px-2 py-1 type-body-sm text-tx">
          <option value="">Любой статус</option>
          {statuses.map(value => <option key={value} value={value}>{STATUS_LABEL[value] ?? value}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 type-key text-t2">Продуктовая привязка
        <select aria-label="Фильтр привязки ассетов" value={binding} onChange={event => { setBinding(event.target.value as typeof binding); setPage(0); }} className="min-w-0 bg-cd shadow-bevel-in px-2 py-1 type-body-sm text-tx">
          <option value="all">Все ассеты</option>
          <option value="linked">Используются в продукте</option>
          <option value="catalog">Только каталог</option>
        </select>
      </label>
    </div>
    <div className="flex items-center justify-between gap-2 type-body-xs text-t3" role="status" aria-live="polite">
      <span>Найдено {filtered.length}; явно связано {linkedVisible}</span>
      <span>Показано {filtered.length ? safePage * PAGE_SIZE + 1 : 0}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} из {filtered.length}</span>
    </div>
    {shown.length ? <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
      {shown.map(id => {
        const asset = ART[id];
        const uses = PRODUCT_ART_USAGE[id] ?? [];
        const direction = 'direction' in asset ? asset.direction : undefined;
        return <figure key={id} data-art-id={id} data-art-family={asset.family} data-art-status={asset.status} data-art-bound={uses.length > 0 ? 'true' : 'false'} className="bg-cd shadow-bevel p-3 flex flex-col gap-2 min-w-0">
          <ArtImage asset={id} alt={asset.label} width={192} sizes="(max-width: 420px) 50vw, 192px" />
          <figcaption className="flex flex-col gap-1 min-w-0">
            <strong className="type-body-sm text-tx">{asset.label}</strong>
            <span className="type-key text-t3">{FAMILY_LABEL[asset.family] ?? asset.family} · {STATUS_LABEL[asset.status] ?? asset.status}{direction ? ` · направление ${direction}` : ''}</span>
            {uses.length ? <span className="type-body-xs text-t2" title={uses.join('\n')}>{uses.slice(0, 2).join(' · ')}{uses.length > 2 ? ` · +${uses.length - 2}` : ''}</span>
              : <span className="type-body-xs text-t3">Пока только в каталоге</span>}
            <code className="type-key text-t3 break-all">{id}</code>
          </figcaption>
        </figure>;
      })}
    </div> : <p className="type-body-sm text-t2">По этим фильтрам ассетов нет.</p>}
    <nav aria-label="Страницы каталога графики" className="flex items-center justify-center gap-2">
      <button type="button" disabled={safePage === 0} onClick={() => setPage(current => Math.max(0, current - 1))} className="type-body-sm text-gd bg-cd shadow-bevel px-3 py-2 disabled:opacity-(--op-disabled)">Назад</button>
      <span className="type-key text-t2" aria-label={`Страница ${safePage + 1} из ${pageCount}`}>{safePage + 1} / {pageCount}</span>
      <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(current => Math.min(pageCount - 1, current + 1))} className="type-body-sm text-gd bg-cd shadow-bevel px-3 py-2 disabled:opacity-(--op-disabled)">Дальше</button>
    </nav>
  </div>;
}
