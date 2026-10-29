// Вид «Хроника» главной зоны (ROADMAP Х3, идея владельца 29.10.2026): хронология канона Forgotten Realms по статьям-годам
// вики и слепок мира на выбранный год. Шкала эпох и плотность событий, приближение эпоха → век → десятилетие → год,
// события года по датам, фильтр по виду и по сущности, выгрузка слепка JSON. Выбранный год — линза стола: карточки
// справочника и карта показывают канон на этот год, состояние кампании не меняется (линза — не событие). Только
// мастеру. Строки событий — английские, как в вики (решение владельца 29.10), вид и подписи — по-русски.
import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { EntityRef } from '../../entities';
import { Icon } from '../../icons/Icon';
import {
  CHRONO_KIND_LABEL, canonEraOf, densityBins, drLabel, loadChronoIndex, loadEvents, rangeOfYear, snapshotExport, widerRange,
  type ChronoEvent, type ChronoIndex, type ChronoKind,
} from '../../world/chronology';
import { loadOrganizations } from '../../world/organizations';
import { loadPeople } from '../../world/people';
import { fold } from '../../map/gazetteer';
import { downloadText } from './session';
import { BTN, HEAD, OPT, OPT_OFF, OPT_ON } from './styles';

/** Виды по порядку фильтра; изданное — отдельно, после событий года. */
const KINDS: readonly ChronoKind[] = [
  'politics', 'conflicts', 'deaths', 'births', 'people', 'organizations', 'deities', 'magic', 'environment', 'migrations',
  'realmspace', 'abeir', 'wildlife', 'misc',
];
const BAR_MAX = 48;

export interface ChronologyViewProps {
  mainRef: RefObject<HTMLElement | null>;
  /** Год кампании — точка «сейчас» на шкале и выход из линзы. */
  campaignYear: number;
  /** Выбранный год (линза) — держит страница: карта и карточки читают его же. */
  year: number;
  onYear: (year: number) => void;
  onOpenEntity: (ref: EntityRef) => void;
  /** «На карте»: перейти к столу, где отметки событий года стоят у своих мест. */
  onShowMap: () => void;
}

const yearRange = (from: number, to: number) => (from === to ? drLabel(from) : `${drLabel(from)} — ${drLabel(to)}`);

export function ChronologyView({ mainRef, campaignYear, year, onYear, onOpenEntity, onShowMap }: ChronologyViewProps) {
  const [index, setIndex] = useState<ChronoIndex | null>(null);
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [kinds, setKinds] = useState<ReadonlySet<ChronoKind>>(() => new Set(KINDS));
  const [query, setQuery] = useState('');
  const [events, setEvents] = useState<readonly ChronoEvent[] | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let live = true;
    void loadChronoIndex().then(i => { if (live) setIndex(i); });
    return () => { live = false; };
  }, []);
  const win = range ?? (index ? rangeOfYear(index.eras, year) : null);
  // Без поиска — события выбранного года; с поиском — всего окна шкалы (куски грузятся только нужные).
  const q = fold(query.trim());
  const from = q && win ? win.from : year;
  const to = q && win ? win.to : year;
  useEffect(() => {
    let live = true;
    setEvents(null);
    void loadEvents(from, to).then(e => { if (live) setEvents(e); });
    return () => { live = false; };
  }, [from, to]);

  const bins = useMemo(() => (index && win ? densityBins(index.years, win.from, win.to, kinds) : []), [index, win?.from, win?.to, kinds]);
  if (!index || !win) {
    return <section aria-label="Хроника" ref={mainRef} className="relative flex-1 min-w-0 min-h-0 p-4 type-body-sm text-t2">Хроника загружается…</section>;
  }
  const info = index.years.find(y => y.year === year);
  const era = canonEraOf(index.eras, year);
  const max = Math.max(1, ...bins.map(b => b.count));
  const matches = (e: ChronoEvent) => !q || fold(e.text).includes(q) || (e.links ?? []).some(l => fold(l.t).includes(q));
  const shown = (events ?? []).filter(e => e.kind !== 'publications' && kinds.has(e.kind) && matches(e));
  const published = q ? [] : (events ?? []).filter(e => e.kind === 'publications');
  const yearCounts = info?.counts ?? {};
  const pick = (y: number) => { onYear(y); if (y < win.from || y > win.to) setRange(rangeOfYear(index.eras, y)); };
  const toggleKind = (k: ChronoKind) => setKinds(s => {
    const next = new Set(s);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  const exportSnapshot = async () => {
    setExporting(true);
    try {
      const [people, organizations, history] = await Promise.all([loadPeople(), loadOrganizations(), loadEvents(year - 10, year)]);
      const snap = snapshotExport(year, { index, events: history, people: people.values(), organizations: organizations.values(), history: 10 });
      downloadText(`canon-${year}-DR.json`, JSON.stringify(snap, null, 1));
    } finally {
      setExporting(false);
    }
  };

  return (
    <section aria-label="Хроника" ref={mainRef} className="relative flex-1 min-w-0 min-h-0 flex flex-col gap-3 p-4 overflow-auto">
      <div className="flex items-center gap-2 flex-wrap" data-part="chrono-year">
        <button type="button" className={BTN} title="Год назад" aria-label="Год назад" onClick={() => pick(year - 1)}>‹</button>
        <label className="flex items-center gap-1">
          <span className="sr-only">Год DR</span>
          <input
            type="number"
            aria-label="Год DR"
            value={year}
            onChange={e => { const v = Number(e.target.value); if (Number.isInteger(v)) pick(v); }}
            className="h-7 w-24 px-2 type-num-15 text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]"
          />
          <span className="type-num-15 text-tx">DR</span>
        </label>
        <button type="button" className={BTN} title="Год вперёд" aria-label="Год вперёд" onClick={() => pick(year + 1)}>›</button>
        <span className="type-h-17 text-tx">{info?.name ?? 'Год без имени в Roll of Years'}</span>
        {era ? <span className="type-body-sm text-t2">{era.name} · {yearRange(era.from, era.to)}</span> : null}
        <span className="ml-auto flex items-center gap-1">
          {year !== campaignYear ? (
            <button type="button" className={BTN} title={`Вернуть год кампании: ${drLabel(campaignYear)} — линза снимется`} onClick={() => { onYear(campaignYear); setRange(null); }}>
              Год кампании
            </button>
          ) : <span className="type-key text-t2">год кампании</span>}
          <button type="button" className={BTN} title="Карта стола с событиями этого года у своих мест" onClick={onShowMap}>На карте</button>
          <button type="button" className={BTN} disabled={exporting} title="Файл JSON: события за 10 лет до года, NPC и организации со статусом на год, авторство вики" onClick={() => void exportSnapshot()}>
            {exporting ? 'Собираю…' : 'Выгрузить слепок'}
          </button>
        </span>
      </div>

      <section aria-label="Шкала" className="flex flex-col bg-pn shadow-bevel">
        <div className={HEAD}>
          <Icon name="skill-history" size={16} color="var(--ent-event)" title="Хроника" />
          <span>Шкала</span>
          <span className="type-key text-t2 normal-case">{yearRange(win.from, win.to)}</span>
          {win.to - win.from + 1 < (index.eras.at(-1)!.to - index.eras[0].from + 1) ? (
            <button type="button" className={`${BTN} ml-auto`} title="Окно шире: год → век → эпоха → вся хронология" onClick={() => setRange(widerRange(index.eras, win.from, win.to))}>Шире</button>
          ) : null}
        </div>
        <div className="flex gap-px p-px bg-lo" role="group" aria-label="Эпохи">
          {index.eras.map(e => {
            const on = e.from === win.from && e.to === win.to;
            return (
              <button key={e.name} type="button" aria-pressed={on} title={`${e.name}: ${yearRange(e.from, e.to)}`} onClick={() => setRange({ from: e.from, to: e.to })} className={`flex-1 min-w-0 truncate ${OPT} ${on ? OPT_ON : OPT_OFF}`}>
                {e.name}
              </button>
            );
          })}
        </div>
        <div className="flex items-end gap-px px-2 pt-2" style={{ height: BAR_MAX + 16 }} role="group" aria-label="Плотность событий">
          {bins.map(b => {
            const here = year >= b.from && year <= b.to;
            const label = `${yearRange(b.from, b.to)}: ${b.count} ${b.count === 1 ? 'событие' : 'событий'}${b.from === b.to ? '' : ' — щелчок приближает'}`;
            return (
              <button
                key={b.from}
                type="button"
                aria-label={label}
                title={label}
                aria-current={here ? 'true' : undefined}
                onClick={() => (b.from === b.to ? pick(b.from) : setRange({ from: b.from, to: b.to }))}
                className={`flex-1 min-w-0 h-full flex items-end cursor-pointer focus-visible:shadow-[var(--glow-gold)] ${here ? 'shadow-[inset_0_-3px_0_var(--gd)]' : ''}`}
              >
                <span className={`w-full ${here ? 'bg-gd' : 'bg-t3'}`} style={{ height: b.count ? Math.max(2, Math.round((b.count / max) * BAR_MAX)) : 0 }} />
              </button>
            );
          })}
        </div>
        <div className="flex justify-between px-2 pb-1 type-key text-t2">
          <span>{drLabel(win.from)}</span>
          <span>{drLabel(win.to)}</span>
        </div>
      </section>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex flex-wrap gap-px p-px bg-lo" role="group" aria-label="Виды событий">
          {KINDS.filter(k => (yearCounts[k] ?? 0) > 0 || !kinds.has(k)).map(k => (
            <button key={k} type="button" aria-pressed={kinds.has(k)} title={`Показывать: ${CHRONO_KIND_LABEL[k]}`} onClick={() => toggleKind(k)} className={`${OPT} ${kinds.has(k) ? OPT_ON : OPT_OFF}`}>
              {CHRONO_KIND_LABEL[k]} {yearCounts[k] ?? 0}
            </button>
          ))}
        </div>
        <input
          type="search"
          aria-label="Место, NPC, организация"
          placeholder="Место, NPC, организация — по всему окну шкалы"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="h-7 w-80 px-2 type-body-sm text-tx bg-wl shadow-bevel-in placeholder:text-t3 focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]"
        />
      </div>

      <section aria-label={q ? `Найдено в ${yearRange(win.from, win.to)}` : `События ${drLabel(year)}`} data-part="chrono-events" className="flex flex-col bg-pn shadow-bevel">
        <div className={HEAD}>
          <span>{q ? `Найдено: ${shown.length} · ${yearRange(win.from, win.to)}` : `События ${drLabel(year)}: ${shown.length}`}</span>
          <span className="type-key text-t2 normal-case ml-auto">{index.attribution}</span>
        </div>
        {events === null ? <p className="p-3 type-body-sm text-t2">Загружаю…</p> : shown.length === 0 ? (
          <p className="p-3 type-body-sm text-t2">{q ? 'В окне шкалы ничего не нашлось — «Шире» расширит поиск.' : 'В вики у этого года событий нет — или они вне выбранных видов.'}</p>
        ) : (
          <ol className="flex flex-col">
            {shown.map((e, i) => (
              <li key={e.id} data-event={e.id} className={`flex gap-3 px-3 py-2 ${e.parent ? 'pl-10' : ''}`} style={i ? { boxShadow: 'inset 0 1px 0 var(--lo)' } : undefined}>
                <div className="w-28 flex-none flex flex-col gap-0.5">
                  {q && (i === 0 || shown[i - 1].year !== e.year) ? (
                    <button type="button" className="text-left type-num-12 text-gd hover:text-gd-hi cursor-pointer" title={`Выбрать ${drLabel(e.year)}`} onClick={() => pick(e.year)}>{drLabel(e.year)}</button>
                  ) : q ? <span className="type-num-12 text-t2">{drLabel(e.year)}</span> : null}
                  <span className="type-body-xs text-tx">{e.when ?? 'дата не указана'}</span>
                  <span className="type-body-xs text-t2">{CHRONO_KIND_LABEL[e.kind]}</span>
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <p className="type-body-sm text-tx" lang="en">{e.text}</p>
                  {(e.links ?? []).some(l => l.ref) ? (
                    <div className="flex flex-wrap gap-1">
                      {(e.links ?? []).filter(l => l.ref).map(l => (
                        <button key={l.ref} type="button" title={`Открыть карточку: ${l.t} — на ${drLabel(year)}`} onClick={() => onOpenEntity(l.ref as EntityRef)} className="px-1.5 type-body-xs text-tx bg-linear-to-b from-pl to-cd shadow-bevel cursor-pointer hover:text-gd-hi focus-visible:shadow-[var(--bevel),var(--glow-gold)]">
                          {l.t}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {e.cites?.length ? <p className="type-body-xs text-t2">Источник: {e.cites.join('; ')}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {published.length ? (
        <section aria-label="Изданное об этом годе" className="flex flex-col bg-pn shadow-bevel">
          <div className={HEAD}><span>Изданное об этом годе: {published.length}</span></div>
          <ul className="p-3 flex flex-col gap-0.5">
            {published.map(e => <li key={e.id} className="type-body-sm text-tx" lang="en">{e.group ? <span className="text-t2">{e.group}: </span> : null}{e.text}</li>)}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
