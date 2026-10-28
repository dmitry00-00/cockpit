// «Боги × пантеоны» (E2): все божества импорта вики строками — пантеон, сила, мировоззрение, сферы, домены 5e, дом —
// по выбранной эпохе (компендиум не привязан к году кампании, эпоху выбирает мастер). Справа — карточка бога со
// схемой служения: узел схемы выбирает бога, пантеон — фильтр. Модуль грузится отдельным куском вместе с данными
// богов (0,5 МБ) — только когда открыта эта матрица.
import { useMemo, useState } from 'react';
import type { Era } from '../../campaign/era';
import { EntityViewBody } from '../../components/EntityViewBody';
import { DEITIES, PANTHEONS, alignmentRu, editionNote, fieldAt, pantheonById, powerLabel, type Deity, type DeityField } from '../../cosmos/deities';
import { parseRef, type EntityRef } from '../../entities/ref';
import { PACK } from '../../entities/packs/cosmos';
import { Empty, Segmented } from './parts';

const ERAS: readonly { id: Era; label: string; hint: string }[] = [
  { id: '5e', label: '1492 DR · 5e', hint: 'поля 5e, чего нет — из старших редакций' },
  { id: '4e', label: '1479 DR · 4e', hint: 'поля 4e и старше' },
  { id: '3e', label: '1372 DR · 3e', hint: 'поля 3e и старше: дом — по Великому древу' },
];

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Значение колонки с пометкой чужой редакции. */
function cell(d: Deity, f: DeityField, era: Era, tr: (t: string) => string = t => t): string | undefined {
  const v = fieldAt(d, f, era);
  if (!v) return undefined;
  const note = editionNote(v.edition, era);
  return `${tr(v.cell.t)}${note ? ` (${note})` : ''}`;
}

const COLUMNS: readonly (readonly [DeityField, string, ((t: string) => string)?])[] = [
  ['power', 'Сила', powerLabel], ['alignment', 'Мировоззрение', alignmentRu], ['portfolio', 'Сферы'], ['domains', 'Домены'], ['homeplane', 'Дом'],
];

export function DeityTable({ query }: { query: string }) {
  const [era, setEra] = useState<Era>('5e');
  const [pantheon, setPantheon] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const rows = useMemo(() => {
    const q = fold(query.trim());
    return DEITIES.filter(d => (!pantheon || d.pantheons?.includes(pantheon))
      && (!q || [d.name, ...(d.titles ?? []), fieldAt(d, 'portfolio', era)?.cell.t ?? ''].some(s => fold(s).includes(q))))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [query, pantheon, era]);
  const view = selected ? PACK.resolve('deity', selected, era) : undefined;
  // В компендиуме планов и подклассов нет: в карточке остаются пантеоны (фильтр) и схема служения (выбор бога).
  const shown = view ? { ...view, links: view.links.filter(l => l.ref.startsWith('pantheon:')) } : undefined;
  const open = (r: EntityRef) => {
    const p = parseRef(r);
    if (p?.kind === 'deity') setSelected(p.id);
    if (p?.kind === 'pantheon') setPantheon(p.id);
  };
  const line = { boxShadow: 'inset 0 -1px 0 var(--lo)' };

  return (
    <div className="flex flex-col gap-3" data-part="deities">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Segmented label="Эпоха" items={ERAS} value={era} onChange={setEra} />
        <label className="flex items-center gap-2">
          <span className="type-body-xs text-t3">пантеон</span>
          <select value={pantheon} onChange={e => setPantheon(e.target.value)} className="type-body-sm text-tx bg-cd shadow-bevel-in px-2 py-1 max-w-[260px]">
            <option value="">все</option>
            {PANTHEONS.map(p => <option key={p.id} value={p.id}>{`${p.name} · ${p.members.length}`}</option>)}
          </select>
        </label>
        <span className="type-num-12 text-t2">{rows.length} из {DEITIES.length} богов · {PANTHEONS.length} пантеонов</span>
        <span className="type-body-xs text-t3">поля карточек Forgotten Realms Wiki, CC BY-SA 3.0; «по 2e» — значение из старшей редакции</span>
      </div>
      <div className="grid grid-cols-[1fr_400px] gap-4 items-start">
        <div className="min-w-0">
          {rows.length === 0 ? <Empty text="Ни одного бога под фильтром." /> : (
            <div className="bg-pn shadow-bevel overflow-auto max-h-[70vh]">
              <table className="border-separate border-spacing-0 min-w-full">
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-20 bg-pl shadow-plate text-left px-3 py-2 type-h-15 text-t2 min-w-[200px]">Бог</th>
                    <th className="sticky top-0 z-10 bg-pl shadow-plate text-left px-3 py-2 type-key text-t2 min-w-[140px]">Пантеон</th>
                    {COLUMNS.map(([f, label]) => (
                      <th key={f} className="sticky top-0 z-10 bg-pl shadow-plate text-left px-3 py-2 type-key text-t2 min-w-[120px]">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(d => {
                    const on = selected === d.id;
                    return (
                      <tr key={d.id} className="align-top">
                        <td className={`sticky left-0 z-10 ${on ? 'bg-pl' : 'bg-cd'} px-3 py-1.5`} style={line}>
                          <button type="button" aria-pressed={on} onClick={() => setSelected(on ? null : d.id)} className="flex flex-col items-start text-left w-full cursor-pointer">
                            <span className={`type-body-bold ${on ? 'text-gd' : 'text-tx'}`}>{d.name}</span>
                            {d.titles?.[0] ? <span className="type-body-xs text-t2 max-w-[240px] truncate" title={d.titles.join('; ')}>{d.titles[0]}</span> : null}
                          </button>
                        </td>
                        <td className="bg-pn px-3 py-1.5" style={line}>
                          <span className="type-body-xs text-t2">{d.pantheons?.map(p => pantheonById(p)?.name ?? p).join(', ') || '—'}</span>
                        </td>
                        {COLUMNS.map(([f, , tr]) => {
                          const v = cell(d, f, era, tr);
                          return (
                            <td key={f} className="bg-pn px-3 py-1.5" style={line} title={v}>
                              <span className={`type-body-xs block max-w-[220px] truncate ${v ? 'text-tx' : 'text-t3'}`}>{v ?? '·'}</span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <aside className="sticky top-6 bg-pn shadow-bevel p-4 flex flex-col gap-3 max-h-[80vh] overflow-y-auto" aria-label="Карточка бога">
          {shown ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <span className="type-h-17 text-tx">{shown.name}</span>
                <button type="button" onClick={() => setSelected(null)} className="type-key text-t3 hover:text-tx px-2 py-1 bg-cd shadow-bevel" aria-label="Закрыть">закрыть</button>
              </div>
              <EntityViewBody view={shown} onOpen={open} />
            </>
          ) : (
            <>
              <span className="type-h-15 text-t3">Карточка бога</span>
              <p className="type-body-sm text-t3">Нажмите на имя — здесь появятся факты и схема служения.</p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

export default DeityTable;
