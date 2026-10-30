// «Державы» (вид `kingdom:`, 30.10.2026): все державы импорта вики строками — тип, регион, столица, правитель на
// выбранный год, население, годы существования. Справа — карточка державы (пакет entities/packs/kingdoms): поля вики,
// столица и боги ссылками, соседи группами; ссылка на другую державу открывает её здесь же. Под ней — история
// державы из обоих слоёв хронологии до выбранного года (куски лет — при открытии карточки). Компендиум не привязан
// к году кампании — год выбирает мастер. Модуль грузится отдельным куском вместе с данными держав.
import { useEffect, useMemo, useState } from 'react';
import { EntityViewBody } from '../../components/EntityViewBody';
import type { Pack } from '../../entities/pack';
import { loadPack } from '../../entities/packs/kingdoms';
import { parseRef, type EntityRef } from '../../entities/ref';
import { drLabel } from '../../world/chronology';
import { kingdomExistsIn, loadKingdomHistory, loadKingdoms, rulersLine, type Kingdom, type KingdomHistoryLine } from '../../world/kingdoms';
import { Empty, Segmented } from './parts';

/** Годы эпох, как у богов: 5e, 4e, 3e (решение кокпита — те же три среза). */
const YEARS: readonly { id: '1492' | '1479' | '1372'; label: string; hint: string }[] = [
  { id: '1492', label: '1492 DR', hint: 'год 5e' },
  { id: '1479', label: '1479 DR', hint: 'год 4e' },
  { id: '1372', label: '1372 DR', hint: 'год 3e' },
];

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const HISTORY_TAIL = 12;

/** История державы на год: события хронологии из её списка, куски лет грузятся при открытии карточки. Пусто — блока нет. */
function KingdomHistory({ kingdom, year }: { kingdom: Kingdom; year: number }) {
  const [h, setH] = useState<{ id: string; lines: KingdomHistoryLine[]; later: number } | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    let live = true;
    setAll(false);
    void loadKingdomHistory(kingdom, year).then(r => { if (live) setH({ id: kingdom.id, ...r }); });
    return () => { live = false; };
  }, [kingdom, year]);
  if (!h || h.id !== kingdom.id) return kingdom.events?.length ? <p className="type-body-xs text-t3">История загружается…</p> : null;
  if (!h.lines.length && !h.later) return null;
  const shown = all ? h.lines : h.lines.slice(-HISTORY_TAIL);
  const hidden = h.lines.length - shown.length;
  return (
    <section className="flex flex-col gap-1" aria-label="История державы">
      <h4 className="type-body-bold text-tx">История по {drLabel(year)} <span className="type-num-12 text-t2">{h.lines.length}</span></h4>
      {hidden > 0 ? (
        <button type="button" onClick={() => setAll(true)} className="self-start type-body-xs text-t2 hover:text-tx cursor-pointer">раньше — ещё {hidden}</button>
      ) : null}
      <ol className="flex flex-col gap-1">
        {shown.map(l => (
          <li key={l.id} className="grid grid-cols-[72px_1fr] gap-2" title={l.cite}>
            <span className="type-num-12 text-gd pt-0.5">{drLabel(l.year)}{l.to !== undefined && l.to !== l.year ? `–${l.to}` : ''}</span>
            <span className="type-body-sm text-t2 break-words [overflow-wrap:anywhere]">{l.when ? <span className="text-t3">{l.when} · </span> : null}{l.text}</span>
          </li>
        ))}
      </ol>
      {h.later > 0 ? <p className="type-body-xs text-t3">позже {drLabel(year)} в хронике ещё {h.later} — смените год</p> : null}
    </section>
  );
}

function years(k: Kingdom): string | undefined {
  if (k.founded === undefined && k.dissolved === undefined) return undefined;
  return `${k.founded ?? '?'}–${k.dissolved ?? ''}`.replace(/–$/, ' —');
}

export function KingdomTable({ query }: { query: string }) {
  const [year, setYear] = useState<(typeof YEARS)[number]['id']>('1492');
  const [onlyExisting, setOnlyExisting] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<{ all: ReadonlyMap<string, Kingdom>; pack: Pack } | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([loadKingdoms(), loadPack()]).then(([all, pack]) => { if (live) setData({ all, pack }); });
    return () => { live = false; };
  }, []);
  const y = Number(year);
  const rows = useMemo(() => {
    if (!data) return [];
    const q = fold(query.trim());
    return [...data.all.values()]
      .filter(k => (!onlyExisting || kingdomExistsIn(k, y)) && (!q || [k.name, ...(k.aliases ?? []), k.capital ?? '', k.region ?? ''].some(s => fold(s).includes(q))))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, query, onlyExisting, y]);
  if (!data) return <p className="type-body-sm text-t2">Державы загружаются…</p>;
  if (data.all.size === 0) return <Empty text="Держав в справочнике пока нет: их собирает импорт scripts/import-kingdoms.py из дампа вики." />;
  const view = selected ? data.pack.resolve('kingdom', selected, '5e', y) : undefined;
  const open = (r: EntityRef) => {
    const p = parseRef(r);
    if (p?.kind === 'kingdom') setSelected(p.id);
  };
  const line = { boxShadow: 'inset 0 -1px 0 var(--lo)' };
  const td = (v: string | undefined, w = 'max-w-[200px]') => (
    <td className="bg-pn px-3 py-1.5" style={line} title={v}>
      <span className={`type-body-xs block ${w} truncate ${v ? 'text-tx' : 'text-t3'}`}>{v ?? '·'}</span>
    </td>
  );

  return (
    <div className="flex flex-col gap-3" data-part="kingdoms">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Segmented label="Год" items={YEARS} value={year} onChange={setYear} />
        <label className="flex items-center gap-2 type-body-xs text-t2 cursor-pointer">
          <input type="checkbox" checked={onlyExisting} onChange={e => setOnlyExisting(e.target.checked)} />
          только существующие в {year} DR
        </label>
        <span className="type-num-12 text-t2">{rows.length} из {data.all.size} держав</span>
        <span className="type-body-xs text-t3">поля статей Forgotten Realms Wiki, CC BY-SA 3.0</span>
      </div>
      <div className="grid grid-cols-[1fr_400px] gap-4 items-start">
        <div className="min-w-0">
          {rows.length === 0 ? <Empty text="Ни одной державы под фильтром." /> : (
            <div className="bg-pn shadow-bevel overflow-auto max-h-[70vh]">
              <table className="border-separate border-spacing-0 min-w-full">
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-20 bg-pl shadow-plate text-left px-3 py-2 type-h-15 text-t2 min-w-[200px]">Держава</th>
                    {['Регион', 'Столица', `Правитель в ${year} DR`, 'Население', 'Годы DR'].map(h => (
                      <th key={h} className="sticky top-0 z-10 bg-pl shadow-plate text-left px-3 py-2 type-key text-t2 min-w-[120px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(k => {
                    const on = selected === k.id;
                    const rulers = rulersLine(k, y);
                    return (
                      <tr key={k.id} className="align-top">
                        <td className={`sticky left-0 z-10 ${on ? 'bg-pl' : 'bg-cd'} px-3 py-1.5`} style={line}>
                          <button type="button" aria-pressed={on} onClick={() => setSelected(on ? null : k.id)} className="flex flex-col items-start text-left w-full cursor-pointer">
                            <span className={`type-body-bold ${on ? 'text-gd' : 'text-tx'}`}>{k.name}</span>
                            {k.type ? <span className="type-body-xs text-t2">{k.type}</span> : null}
                          </button>
                        </td>
                        {td(k.region)}
                        {td(k.capital)}
                        {td(rulers, 'max-w-[240px]')}
                        {td(k.population, 'max-w-[160px]')}
                        {td(years(k), 'max-w-[120px]')}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <aside className="sticky top-6 bg-pn shadow-bevel p-4 flex flex-col gap-3 max-h-[80vh] overflow-y-auto" aria-label="Карточка державы">
          {view ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <span className="type-h-17 text-tx">{view.name}</span>
                <button type="button" onClick={() => setSelected(null)} className="type-key text-t3 hover:text-tx px-2 py-1 bg-cd shadow-bevel" aria-label="Закрыть">закрыть</button>
              </div>
              <EntityViewBody view={view} onOpen={open} />
              <KingdomHistory kingdom={data.all.get(selected!)!} year={y} />
            </>
          ) : (
            <>
              <span className="type-h-15 text-t3">Карточка державы</span>
              <p className="type-body-sm text-t3">Нажмите на имя — здесь появятся столица, правитель на год, народ, вера, торговля и соседи.</p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

export default KingdomTable;
