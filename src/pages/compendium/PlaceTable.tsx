// «Поселения» (пользователь 30.10.2026): реестр городов и поселений справочника карты Toril — что заполнено, что
// пусто и что подозрительно. Сверху — заполненность по полям (щелчок — показать пустые по этому полю), фильтры класса,
// «не заполнено» и «только с замечаниями», выгрузка CSV того, что под фильтром. Справа — карточка места (пакет мест) и
// как добавить карту города. Год держав и жителей — 1492 DR, как у карточек. Модуль — отдельным куском с данными.
import { useEffect, useMemo, useState } from 'react';
import { EntityViewBody } from '../../components/EntityViewBody';
import type { Pack } from '../../entities/pack';
import { loadPack } from '../../entities/packs/places';
import { KIND_LABEL, loadGazetteer } from '../../map/gazetteer';
import { MAPS, planOf } from '../../map/maps';
import { loadEcon } from '../../world/econ';
import { loadGraph } from '../../world/graph';
import { loadKingdoms } from '../../world/kingdoms';
import { loadOrganizations, loadPlaceFaiths } from '../../world/organizations';
import { loadResidents } from '../../world/people';
import { MISSING_LABEL, REGISTRY_FIELDS, placeRegistry, registryCsv, type GraphLink, type MissingPlace, type PlaceRow } from '../../world/registry';
import { Empty, Segmented } from './parts';

const YEAR = 1492;

// Поселения GIS, которых нет в справочнике (scripts/missing-places.py); файла нет — только справочник.
const MISSING = import.meta.glob<{ default: { places: MissingPlace[] } }>('../../../content/maps/toril-missing.json');
const loadMissing = () => Object.values(MISSING)[0]?.().then(m => m.default.places) ?? Promise.resolve([]);

type Kind = 'all' | 'city' | 'town' | 'other';
const KINDS: readonly { id: Kind; label: string; hint: string }[] = [
  { id: 'all', label: 'Все', hint: 'все поселения справочника' },
  { id: 'city', label: 'Города', hint: 'класс City' },
  { id: 'town', label: 'Городки', hint: 'класс Town и поселения карточек' },
  { id: 'other', label: 'Остальное', hint: 'деревни, крепости, храмы, шахты, постоялые дворы, оазисы' },
];
const kindOf = (k: string): Kind => (k === 'City' ? 'city' : k === 'Town' || k === 'settlement' ? 'town' : 'other');

const GRAPH_LABEL: Readonly<Record<GraphLink, string>> = { road: 'дорога', harbour: 'пристань', land: 'напрямик', none: 'нет' };

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function download(rows: readonly PlaceRow[]) {
  // BOM — чтобы Excel открыл кириллицу как UTF-8.
  const url = URL.createObjectURL(new Blob(['﻿', registryCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'поселения-toril.csv' });
  a.click();
  URL.revokeObjectURL(url);
}

export function PlaceTable({ query }: { query: string }) {
  const [rows, setRows] = useState<PlaceRow[] | null>(null);
  const [missingAt, setMissingAt] = useState<ReadonlyMap<string, readonly [number, number]>>(new Map());
  const [pack, setPack] = useState<Pack | null>(null);
  const [kind, setKind] = useState<Kind>('all');
  const [empty, setEmpty] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const url = MAPS.toril.graph?.url;
    void Promise.all([
      loadGazetteer('toril'), loadKingdoms(), loadEcon(), loadResidents(), loadPlaceFaiths(), loadOrganizations(),
      url ? loadGraph(url) : Promise.resolve(null), loadPack(), loadMissing(),
    ]).then(([places, kingdoms, econ, residents, faiths, orgs, graph, p, missing]) => {
      if (!live) return;
      const based = new Map<string, number>();
      for (const o of orgs.values()) for (const id of o.places ?? []) based.set(id, (based.get(id) ?? 0) + 1);
      setRows(placeRegistry({ places, missing, kingdoms: kingdoms.values(), econ, residents, faiths, orgs: based, hasPlan: id => !!planOf(`place:${id}`), graph, year: YEAR }));
      setPack(p);
      setMissingAt(new Map(missing.map(m => [m[0], [m[4], m[5]] as const])));
    });
    return () => { live = false; };
  }, []);

  const field = REGISTRY_FIELDS.find(f => f.key === empty);
  const shown = useMemo(() => {
    if (!rows) return [];
    const q = fold(query.trim());
    return rows.filter(r => (kind === 'all' || kindOf(r.kind) === kind)
      && (!field || field.filled(r) === false)
      && (!onlyIssues || r.issues.length > 0)
      && (!q || fold(r.name).includes(q) || fold(r.kingdom ?? '').includes(q)));
  }, [rows, query, kind, field, onlyIssues]);

  if (!rows) return <p className="type-body-sm text-t2">Поселения загружаются…</p>;
  if (rows.length === 0) return <Empty text="Справочника карты нет: его собирают scripts/places-from-gis.py и ночная разметка." />;
  const inKind = rows.filter(r => kind === 'all' || kindOf(r.kind) === kind);
  const row = selected ? rows.find(r => r.id === selected) : undefined;
  const view = row && !row.missing && pack ? pack.resolve('place', row.id, '5e', YEAR) : undefined;
  const gis = row?.missing ? missingAt.get(row.id) : undefined;
  const line = { boxShadow: 'inset 0 -1px 0 var(--lo)' };
  const mark = (v: boolean | number | string | undefined, title?: string) => (
    <td className="bg-pn px-2 py-1.5 text-right" style={line} title={title}>
      <span className={`type-num-12 ${v ? 'text-tx' : 'text-t4'}`}>{typeof v === 'boolean' ? (v ? 'есть' : '·') : v || '·'}</span>
    </td>
  );

  return (
    <div className="flex flex-col gap-3" data-part="places">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Segmented label="Класс" items={KINDS} value={kind} onChange={setKind} />
        <label className="flex items-center gap-2 type-body-xs text-t2">
          не заполнено
          <select value={empty} onChange={e => setEmpty(e.target.value)} className="type-body-sm text-tx bg-cd shadow-bevel-in px-2 py-1">
            <option value="">—</option>
            {REGISTRY_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 type-body-xs text-t2 cursor-pointer">
          <input type="checkbox" checked={onlyIssues} onChange={e => setOnlyIssues(e.target.checked)} />
          только с замечаниями
        </label>
        <span className="type-num-12 text-t2">{shown.length} из {rows.length} поселений</span>
        <button
          type="button"
          onClick={() => download(shown)}
          disabled={!shown.length}
          title="Строки под фильтром — таблицей CSV (id места, имя, класс, держава и заполненность)"
          className="type-key text-t2 hover:text-tx px-2 py-1 bg-cd shadow-bevel disabled:text-t4 cursor-pointer"
        >
          CSV
        </button>
        <span className="type-body-xs text-t3">Toril GIS и Forgotten Realms Wiki (CC BY-SA 3.0); держава и жители — на {YEAR} DR</span>
      </div>

      <ul className="flex flex-wrap gap-1" aria-label="Заполненность">
        {REGISTRY_FIELDS.map(f => {
          const known = inKind.filter(r => f.filled(r) !== undefined);
          if (!known.length) return null;
          const n = known.filter(r => f.filled(r)).length;
          const on = empty === f.key;
          return (
            <li key={f.key}>
              <button
                type="button"
                aria-pressed={on}
                title={`${f.hint}. Щелчок — показать пустые`}
                onClick={() => setEmpty(on ? '' : f.key)}
                className={`flex items-baseline gap-2 px-2 py-1 cursor-pointer ${on ? 'bg-pl shadow-plate' : 'bg-cd shadow-bevel hover:bg-pl'}`}
              >
                <span className={`type-body-xs ${on ? 'text-gd' : 'text-t2'}`}>{f.label}</span>
                <span className="type-num-12 text-tx">{n}</span>
                <span className="type-num-12 text-t3">из {known.length}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="grid grid-cols-[1fr_400px] gap-4 items-start">
        <div className="min-w-0">
          {shown.length === 0 ? <Empty text="Ни одного поселения под фильтром." /> : (
            <div className="bg-pn shadow-bevel overflow-auto max-h-[70vh]">
              <table className="border-separate border-spacing-0 min-w-full">
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-20 bg-pl shadow-plate text-left px-3 py-2 type-h-15 text-t2 min-w-[200px]">Поселение</th>
                    <th className="sticky top-0 z-10 bg-pl shadow-plate text-left px-3 py-2 type-key text-t2 min-w-[140px]">Держава</th>
                    {['Карта города', 'Карточка', 'Вики', 'Товары', 'Жители', 'Вера', 'Орг.', 'Граф'].map(h => (
                      <th key={h} className="sticky top-0 z-10 bg-pl shadow-plate text-right px-2 py-2 type-key text-t2 whitespace-nowrap">{h}</th>
                    ))}
                    <th className="sticky top-0 z-10 bg-pl shadow-plate text-left px-3 py-2 type-key text-t2 min-w-[160px]">Замечания</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(r => {
                    const on = selected === r.id;
                    return (
                      <tr key={r.id} className="align-top" data-place={r.id}>
                        <td className={`sticky left-0 z-10 ${on ? 'bg-pl' : 'bg-cd'} px-3 py-1.5`} style={line}>
                          <button type="button" aria-pressed={on} onClick={() => setSelected(on ? null : r.id)} className="flex flex-col items-start text-left w-full cursor-pointer">
                            <span className={`type-body-bold ${on ? 'text-gd' : 'text-tx'}`}>{r.name}</span>
                            <span className="type-body-xs text-t2">{KIND_LABEL[r.kind] ?? r.kind}</span>
                          </button>
                        </td>
                        <td className="bg-pn px-3 py-1.5" style={line} title={r.kingdom}>
                          <span className={`type-body-xs block max-w-[180px] truncate ${r.kingdom ? 'text-tx' : 'text-t4'}`}>{r.kingdom ?? '·'}</span>
                        </td>
                        {mark(r.plan)}
                        {mark(r.card)}
                        {mark(r.wiki)}
                        {mark(r.goods, 'товаров в вывозе')}
                        {mark(r.residents, 'NPC вики с домом здесь')}
                        {mark(r.faith)}
                        {mark(r.orgs, 'организаций с базой здесь')}
                        {mark(r.graph && r.graph !== 'none' ? GRAPH_LABEL[r.graph] : r.graph ? '' : undefined)}
                        <td className="bg-pn px-3 py-1.5" style={line}>
                          <span className={`type-body-xs ${r.issues.length ? 'text-st-conflict' : 'text-t4'}`}>{r.issues.join(', ') || '·'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <aside className="sticky top-6 bg-pn shadow-bevel p-4 flex flex-col gap-3 max-h-[80vh] overflow-y-auto" aria-label="Карточка поселения">
          {row && (view || row.missing) ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <span className="type-h-17 text-tx">{row.name}</span>
                <button type="button" onClick={() => setSelected(null)} className="type-key text-t3 hover:text-tx px-2 py-1 bg-cd shadow-bevel" aria-label="Закрыть">закрыть</button>
              </div>
              {view ? <EntityViewBody view={view} /> : (
                <section className="flex flex-col gap-1" aria-label="Нет на карте">
                  <span className="type-body-xs text-t2">{KIND_LABEL[row.kind] ?? row.kind} · Toril GIS</span>
                  <p className="type-body-sm text-tx">
                    В справочнике карты нет: {MISSING_LABEL[row.missing!]}{row.ocr ? ` — рядом прочитано «${row.ocr}»` : ''}.
                  </p>
                  {gis ? <p className="type-body-xs text-t2">Подсказка GIS на растре: x {gis[0]}, y {gis[1]}.</p> : null}
                  <p className="type-body-xs text-t3">Поставить место — проверка разметки (scripts/review-markup.py), затем gazetteer-from-map.py и map-registry.py.</p>
                </section>
              )}
              <section className="flex flex-col gap-1" aria-label="Карта города">
                <h4 className="type-body-bold text-tx">Карта города</h4>
                {row.plan ? (
                  <p className="type-body-sm text-t2">Есть: паспорт {planOf(`place:${row.id}`)!.id} — на уровне поселения стол показывает план вместо карты мира.</p>
                ) : (
                  <p className="type-body-sm text-t2">
                    Нет. Как у Neverwinter (M10): растр — в maps/plans/&lt;id&gt;/, паспорт — content/maps/&lt;id&gt;.json с plan.place, равным ссылке ниже, тайлы — scripts/tile-map.py.
                  </p>
                )}
                <code className="type-num-12 text-tx bg-cd shadow-bevel-in px-2 py-1 select-all break-all">place:{row.id}</code>
              </section>
            </>
          ) : (
            <>
              <span className="type-h-15 text-t3">Карточка поселения</span>
              <p className="type-body-sm text-t3">Нажмите на имя — здесь появятся карточка места, его ссылка и как добавить карту города.</p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

export default PlaceTable;
