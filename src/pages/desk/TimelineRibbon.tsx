import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { CalendarAdapter } from '../../campaign/calendar';
import { pulseEvents } from '../../campaign/pulse';
import type { EntityRef } from '../../entities';
import { SECONDS_PER_DAY, type JournalEntry, type State, type TimelinePlanDraft } from '../../engine';
import { DEFAULT_SETTING_PACKAGE } from '../../packages/registry';
import { canonEraOf, loadArticleEvents, loadChronoIndex, loadEvents, type ChronoIndex } from '../../world/chronology';
import { campaignItems, canonItems, timelinePlanItems, type RibbonItem } from './timeline';
import { BTN } from './styles';
import './TimelineRibbon.css';

const COMPACT_VIEWPORT = '(max-height: 800px)';
const LANES = { canon: 'Канон', campaign: 'Кампания', proposal: 'Предложения', plan: 'Планы и календарь' } as const;
interface TimelineRibbonProps {
  dmView: boolean; state: State; entries: readonly JournalEntry[]; calendar: CalendarAdapter; lensYear: number | null;
  onYear: (year: number | null) => void; onOpenEntity: (ref: EntityRef) => void; onInbox: () => void;
  onCreatePlan: (plan: TimelinePlanDraft) => void; onCancelPlan: (planId: string) => void;
  clockSlot?: ReactNode;
  clockHidden?: boolean;
}
/** Canon and world plans are DM-only until an explicit disclosure projection exists. */
export function TimelineRibbon(props: TimelineRibbonProps) {
  return props.dmView ? <DMTimelineRibbon {...props} /> : null;
}
function DMTimelineRibbon({ state, entries, calendar, lensYear, onYear, onOpenEntity, onInbox, onCreatePlan, onCancelPlan, clockSlot, clockHidden }: TimelineRibbonProps) {
  const [scale, setScale] = useState<'day' | 'year' | 'era'>('day');
  const [offset, setOffset] = useState(0);
  const [index, setIndex] = useState<ChronoIndex | null>(null);
  const [canon, setCanon] = useState<RibbonItem[]>([]);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<{ lane: RibbonItem['lane']; bin: number } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const closeDetails = () => { setSelected(null); trigger.current?.focus(); };
  const [planTitle, setPlanTitle] = useState('');
  const [planDetails, setPlanDetails] = useState('');
  const [planSource, setPlanSource] = useState('');
  const [daysAhead, setDaysAhead] = useState('1');
  const [durationDays, setDurationDays] = useState('1');
  const [planError, setPlanError] = useState('');
  const [shortWindow, setShortWindow] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(COMPACT_VIEWPORT).matches);
  const [requestedExpanded, setRequestedExpanded] = useState<boolean | undefined>();
  const expanded = requestedExpanded ?? !shortWindow;
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(COMPACT_VIEWPORT);
    const changed = () => setShortWindow(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  const hasYear = calendar.kind !== 'counter';
  const hasCanon = calendar.id === 'harptos' && (state.settingPackageId ?? DEFAULT_SETTING_PACKAGE) === DEFAULT_SETTING_PACKAGE;
  const activeScale = hasYear ? scale : 'day';
  const nowYear = calendar.yearAt(state.time.sec);
  const centerYear = lensYear ?? nowYear;
  const centerDay = Math.floor(state.time.sec / SECONDS_PER_DAY) + offset * 7;
  const center = (centerYear ?? 0) + offset * 7;
  const era = hasCanon && index && centerYear !== null ? canonEraOf(index.eras, centerYear) : undefined;
  const eraIndex = index && era ? index.eras.indexOf(era) : -1;
  const selectedEra = index && eraIndex >= 0 ? index.eras[Math.max(0, Math.min(index.eras.length - 1, eraIndex + offset))] : undefined;
  const from = activeScale === 'day' ? (calendar.yearAt((centerDay - 3) * SECONDS_PER_DAY) ?? 0) : activeScale === 'era' && selectedEra ? selectedEra.from : center - 3;
  const to = activeScale === 'day' ? (calendar.yearAt((centerDay + 4) * SECONDS_PER_DAY - 1) ?? 0) : activeScale === 'era' && selectedEra ? selectedEra.to : center + 3;
  useEffect(() => {
    if (!hasCanon) { setIndex(null); return; }
    let live = true; loadChronoIndex().then(i => { if (live) setIndex(i); }).catch(() => { if (live) setError(true); }); return () => { live = false; };
  }, [retry, hasCanon]);
  useEffect(() => {
    let live = true; setCanon([]); setError(false); setSelected(null);
    if (!hasCanon) return () => { live = false; };
    Promise.all([loadEvents(from, to), loadArticleEvents(-Infinity, to)]).then(([base, articles]) => { if (live) setCanon(canonItems(base, articles.filter(e => (e.to ?? e.year) >= from), calendar)); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [from, to, calendar, retry, hasCanon]);
  const all = useMemo(() => {
    const items = [...canon, ...campaignItems(entries, calendar), ...timelinePlanItems(state.world.timelinePlans, calendar)];
    for (const d of Object.values(state.deltas)) if (d.status === 'pending') {
      const entry = entries.find(e => e.deltaId === d.id && e.type === 'WORLD_DELTA_PROPOSED');
      items.push({ id: `proposal:${d.id}`, lane: 'proposal', text: `${d.subject}: ${d.was} → ${d.now}`, sec: entry?.worldSec, year: entry ? calendar.yearAt(entry.worldSec) : nowYear, undated: !entry, date: entry ? `Предложено ${calendar.formatDate(entry.worldSec)}` : 'Дата предложения не установлена', source: `Ещё не факт · ${d.cause}` });
    }
    for (const e of pulseEvents(state)) items.push({ id: `calendar:${e.kind}:${e.sec}:${e.label}`, lane: 'plan', text: e.label, sec: e.sec, year: calendar.yearAt(e.sec), date: calendar.formatDateOnly(e.sec), source: 'Расчётный календарный ориентир; не запись о свершившемся событии' });
    for (const p of Object.values(state.world.processes ?? {})) if (!p.ended) items.push({ id: `process:${p.id}`, lane: 'plan', text: `${p.kind} · ${p.stage}${p.clock ? ` · ${p.clock.filled}/${p.clock.segments}` : ''}`, sec: p.nextSec, year: calendar.yearAt(p.nextSec), date: calendar.formatDate(p.nextSec), source: 'Следующий такт процесса; исход ещё не определён' });
    return [...new Map(items.map(i => [i.id, i])).values()].sort((a,b) => (a.year ?? 0) - (b.year ?? 0) || (a.sec ?? Infinity) - (b.sec ?? Infinity) || a.id.localeCompare(b.id));
  }, [canon, entries, state, calendar, nowYear]);
  const bins = Array.from({ length: 7 }, (_, i) => {
    if (activeScale === 'day') { const sec = (centerDay - 3 + i) * SECONDS_PER_DAY; return { from: sec, to: sec + SECONDS_PER_DAY - 1, label: calendar.formatCompactDate(sec), current: Math.floor(state.time.sec / SECONDS_PER_DAY) === centerDay - 3 + i }; }
    const a = Math.floor(from + (to - from + 1) * i / 7), b = Math.floor(from + (to - from + 1) * (i + 1) / 7) - 1;
    return { from: a, to: b, label: a === b ? `${a}` : `${a}…${b}`, current: nowYear !== null && nowYear >= a && nowYear <= b };
  });
  const binsOf = (e: RibbonItem): number[] => {
    if (e.undated) return [7];
    if (activeScale === 'day') {
      if (e.sec === undefined) return (e.year !== null && (e.endYear ?? e.year) >= from && e.year <= to) ? [7] : [];
      const endSec = e.endSec ?? e.sec;
      return bins.flatMap((bin, i) => e.sec! <= bin.to && endSec >= bin.from ? [i] : []);
    }
    if (e.year === null) return [];
    const endYear = e.endYear ?? e.year;
    return bins.flatMap((bin, i) => e.year! <= bin.to && endYear >= bin.from ? [i] : []);
  };
  const visible = all.filter(e => binsOf(e).length > 0);
  const details = selected ? visible.filter(e => e.lane === selected.lane && binsOf(e).includes(selected.bin)) : [];
  const ahead = Number(daysAhead), duration = Number(durationDays);
  const planRangeValid = Number.isSafeInteger(ahead) && ahead >= 0 && ahead <= 36_500
    && Number.isSafeInteger(duration) && duration >= 1 && duration <= 36_500;
  const planStartSec = planRangeValid ? (Math.floor(state.time.sec / SECONDS_PER_DAY) + ahead) * SECONDS_PER_DAY : 0;
  const planEndSec = planRangeValid ? planStartSec + duration * SECONDS_PER_DAY - 1 : 0;
  const submitPlan = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!planRangeValid) { setPlanError('Укажите целые значения: через 0–36 500 дней, длительность 1–36 500 дней.'); return; }
    if (!planTitle.trim() || !planSource.trim()) { setPlanError('Заполните название и источник.'); return; }
    onCreatePlan({
      id: `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
      title: planTitle.trim(), details: planDetails.trim(), source: planSource.trim(), visibility: 'dm', startSec: planStartSec, endSec: planEndSec,
    });
    setPlanTitle(''); setPlanDetails(''); setPlanSource(''); setPlanError('');
  };
  const move = (n: number) => { setOffset(o => o+n); setSelected(null); };
  const reset = () => { setOffset(0); onYear(null); setSelected(null); };
  return <section className="timeline-cassette" aria-label="Хронологическая лента">
    <div className="timeline-toolbar">
    <div className="timeline-controls">
      <button className={BTN} aria-expanded={expanded} onClick={() => setRequestedExpanded(!expanded)}>Лента времени</button>
      {expanded ? <>
        <div role="group" aria-label="Масштаб ленты">{(hasYear ? ['day','year','era'] as const : ['day'] as const).map(s => <button key={s} className={BTN} aria-pressed={activeScale === s} onClick={() => { setScale(s); setOffset(0); setSelected(null); }}>{s === 'day' ? 'День' : s === 'year' ? 'Год' : 'Эпоха'}</button>)}</div>
        <button className={BTN} aria-label="Предыдущий период ленты" onClick={() => move(-1)}>‹</button>
        <span className="type-num-12">{activeScale === 'day' ? `${calendar.formatCompactDate(bins[0].from)} — ${calendar.formatCompactDate(bins[6].from)}` : `${from}…${to}${calendar.yearSuffix ? ` ${calendar.yearSuffix}` : ''}`}{activeScale === 'era' && selectedEra ? ` · ${selectedEra.name}` : ''}</span>
        <button className={BTN} aria-label="Следующий период ленты" onClick={() => move(1)}>›</button>
        <button className={BTN} onClick={reset}>К сейчас</button>
      </> : null}
    <span className="type-body-xs text-t2">Сейчас: {calendar.formatDate(state.time.sec)}{lensYear !== null ? ` · Линза: ${lensYear}${calendar.yearSuffix ? ` ${calendar.yearSuffix}` : ''}` : ''}</span>
    </div>
    {clockSlot ? <div className="timeline-clock-slot" aria-label="Мировые часы" hidden={clockHidden}>{clockSlot}</div> : null}
    </div>
    {expanded ? <>
      {error ? <p role="status" className="type-body-xs">Канон недоступен. <button className={BTN} onClick={() => setRetry(r => r+1)}>Повторить</button></p> : null}
      <div className="timeline-tape" onPointerDown={event => {
        const target = event.target instanceof Element ? event.target : null;
        if (event.button === 0 && !target?.closest('button, input, textarea, summary, a')) dragOrigin.current = { x: event.clientX, y: event.clientY };
      }} onPointerUp={event => {
        const origin = dragOrigin.current; dragOrigin.current = null;
        const dx = event.clientX - (origin?.x ?? event.clientX), dy = event.clientY - (origin?.y ?? event.clientY);
        if (origin && Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
      }} onPointerCancel={() => { dragOrigin.current = null; }} onWheel={event => {
        if (Math.abs(event.deltaX) > 24 && Math.abs(event.deltaX) > Math.abs(event.deltaY)) { event.preventDefault(); move(event.deltaX > 0 ? 1 : -1); }
      }}>
        <div className="timeline-grid timeline-ticks"><span>Обзор</span>{bins.map((b,i) => <span key={i} aria-current={b.current ? 'date' : undefined}>{b.label}{b.current ? ' ◆' : ''}</span>)}<span>{activeScale === 'day' ? 'Без дня' : 'Без даты'}</span></div>
        {(Object.keys(LANES) as RibbonItem['lane'][]).filter(lane => visible.some(e => e.lane === lane && !e.planId)).map(lane => <div key={lane} className={`timeline-grid timeline-lane timeline-${lane}`} role="group" aria-label={LANES[lane]}><span>{LANES[lane]}</span>{[...bins, null].map((_,i) => {
          const count = visible.filter(e => e.lane === lane && !e.planId && binsOf(e).includes(i)).length;
          return count ? <button key={i} className="timeline-marker" aria-label={`${LANES[lane]} · ${i === 7 ? 'дата неточная' : bins[i].label} · ${count}`} aria-pressed={selected?.lane === lane && selected.bin === i} onClick={e => { trigger.current = e.currentTarget; setSelected({lane,bin:i}); }}>{count}</button> : <span key={i} />;
        })}</div>)}
        {visible.filter(item => item.planId).map(item => {
          const planBins = binsOf(item).filter(i => i >= 0 && i < bins.length);
          if (!planBins.length) return null;
          const first = planBins[0], last = planBins.at(-1)!;
          return <div key={item.id} className="timeline-grid timeline-plan-range" role="group" aria-label={`План: ${item.text}`}>
            <span>{item.text}</span>
            <button className="timeline-plan-span" style={{ gridColumn: `${first + 2} / ${last + 3}` }} aria-label={`Открыть план ${item.text}: ${item.date}`} onClick={event => { trigger.current = event.currentTarget; setSelected({ lane: 'plan', bin: first }); }}>
              {item.date}
            </button>
          </div>;
        })}
      </div>
      <details className="timeline-plan-editor">
        <summary>Добавить план мастера</summary>
        <form onSubmit={submitPlan}>
          <label>Название <input aria-label="Название плана" required maxLength={120} value={planTitle} onChange={event => setPlanTitle(event.target.value)} /></label>
          <label>Подробности <textarea aria-label="Подробности плана" maxLength={2000} value={planDetails} onChange={event => setPlanDetails(event.target.value)} /></label>
          <label>Источник или основание <input aria-label="Источник плана" required maxLength={500} value={planSource} onChange={event => setPlanSource(event.target.value)} placeholder="Например, заметки мастера или ссылка на источник" /></label>
          <div className="timeline-plan-dates">
            <label>Через дней <input aria-label="Через сколько дней" type="number" min={0} max={36500} step={1} value={daysAhead} onChange={event => setDaysAhead(event.target.value)} /></label>
            <label>Длительность, дней <input aria-label="Длительность плана в днях" type="number" min={1} max={36500} step={1} value={durationDays} onChange={event => setDurationDays(event.target.value)} /></label>
            <span>{planRangeValid ? `${calendar.formatDateOnly(planStartSec)} — ${calendar.formatDateOnly(planEndSec)}` : 'Проверьте диапазон дат'}</span>
          </div>
          <p className="type-body-xs text-t2">Только мастеру. План не меняет время и не определяет исход.</p>
          {planError ? <p role="alert">{planError}</p> : null}
          <button className={BTN} type="submit" disabled={!planRangeValid}>Записать план</button>
        </form>
      </details>
      {selected ? <div className="timeline-details" role="region" aria-label="События ленты" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); closeDetails(); } }}>
        <div className="flex justify-between"><strong>{LANES[selected.lane]}</strong><button className={BTN} onClick={closeDetails}>Закрыть события</button></div>
        <ul>{details.map(e => <li key={e.id}><details><summary>{e.date} · {e.text}</summary><p>{e.source}</p>{e.details ? <p>{e.details}</p> : null}{e.lane === 'canon' ? <p>Forgotten Realms Wiki · CC BY-SA 3.0</p> : null}{e.endYear !== undefined && e.endSec === undefined ? <p>Длительность: {e.year} ━ {e.endYear} DR</p> : null}{e.lane === 'canon' && e.year !== null ? <button className={BTN} onClick={() => onYear(e.year === nowYear ? null : e.year)}>Линза {e.year} DR</button> : null}{e.links?.filter(l => l.ref).map(l => <button key={l.ref} className={BTN} onClick={() => onOpenEntity(l.ref as EntityRef)}>{l.t}</button>)}{e.lane === 'proposal' ? <button className={BTN} onClick={onInbox}>Во входящие</button> : null}{e.planId ? <button className={BTN} onClick={() => { onCancelPlan(e.planId!); closeDetails(); }}>Снять план</button> : null}</details></li>)}</ul>
      </div> : null}
    </> : null}
  </section>;
}
