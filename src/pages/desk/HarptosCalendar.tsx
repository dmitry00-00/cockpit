// Календарь Харптоса (28.10.2026, по просьбе владельца): полный циферблат суток, сегодняшняя дата с десятидневкой,
// сезоном, Selûne и ближайшим праздником; месяц сеткой три десятидневки по десять дней с фазами Selûne и праздником
// после месяца; год — двенадцать месяцев и пять праздников по сезонам. Листать месяцы и год — состояние вида, не
// событие: время двигает только шаг. Открывается из мини-циферблата полосы часов и стоит на вкладке «Время».
// Святые дни богов (E4): отметка на дне, список дней месяца, «каждый месяц» и лунные одной строкой, ближайший — в
// сводке; боги Faerûn или все пантеоны — переключатель вида. Имя бога открывает его карточку, если стол дал вход.
import { useState } from 'react';
import {
  DAYS_PER_YEAR, HOLY_DEITIES, MONTHS, SEASON_LABELS, TENDAY, dayPhase, eraOf, festivalAfter, harptos, holyDaysOn, holyList, holyRulesAt, holyWhat,
  inDays, isAnnual, monthBefore, monthDays, moonState, nextFestival, nextHolyDay, seasonOf, yearSlots, type HolyDay, type HolyScope, type MonthName,
} from '../../campaign';
import { useOpenEntity } from '../../components/openEntity';
import { DAY_PHASES, DAY_PHASE_LABELS, HarptosDial, MOON_ICONS, MOON_LABELS, PHASE_HOURS } from '../../components';
import { SECONDS_PER_DAY } from '../../engine';
import { Icon } from '../../icons/Icon';
import { BTN, HEAD, OPT, OPT_OFF, OPT_ON } from './styles';

export interface HarptosCalendarProps {
  /** Время мира, секунды от эпохи. */
  sec: number;
  className?: string;
}

const two = (n: number) => String(n).padStart(2, '0');
const ORDINAL = ['первая', 'вторая', 'третья'];
/** Боги, у которых правило святого дня этого вида, — для строки «каждый месяц» и лунных. */
function recurring(era: ReturnType<typeof eraOf>, scope: HolyScope) {
  const monthly: string[] = [], full: string[] = [], fresh: string[] = [];
  for (const h of HOLY_DEITIES) {
    if (scope === 'faerun' && !h.pantheons?.includes('faerunian-pantheon')) continue;
    for (const r of holyRulesAt(h, era)) {
      if (r.monthly) monthly.push(`${h.name} (${r.monthly.join(', ')})`);
      if (r.moon === 'full' && !full.includes(h.name)) full.push(h.name);
      if (r.moon === 'new' && !fresh.includes(h.name)) fresh.push(h.name);
    }
  }
  return [
    monthly.length ? `каждый месяц: ${monthly.join(', ')}` : null,
    full.length ? `в полнолуние: ${full.join(', ')}` : null,
    fresh.length ? `в новолуние: ${fresh.join(', ')}` : null,
  ].filter(Boolean).join(' · ');
}

/** Святые дни по имени дня: сначала названные («The Divine Death»), последней — без имени (сам праздник или дата). */
const byWhat = (list: readonly HolyDay[]): [string, HolyDay[]][] => {
  const groups = new Map<string, HolyDay[]>();
  for (const h of list) groups.set(holyWhat(h) ?? '', [...(groups.get(holyWhat(h) ?? '') ?? []), h]);
  return [...groups].sort(([a], [b]) => Number(a === '') - Number(b === ''));
};

const SKY_SWATCH: Readonly<Record<(typeof DAY_PHASES)[number], string>> = {
  morning: 'bg-sky-dawn', day: 'bg-sky-day', evening: 'bg-sky-dusk', night: 'bg-sky-night',
};

export function HarptosCalendar({ sec, className = '' }: HarptosCalendarProps) {
  const now = harptos(sec);
  const phase = dayPhase(sec);
  const moon = moonState(sec);
  const fest = nextFestival(sec);
  const openEntity = useOpenEntity();
  const [scope, setScope] = useState<HolyScope>('faerun');
  const holyNext = nextHolyDay(sec, eraOf(now.year), scope);
  const today = Math.floor(sec / SECONDS_PER_DAY) * SECONDS_PER_DAY;
  // Месяц на экране: в праздник — месяц перед ним.
  const nowMonth: MonthName = now.month ?? monthBefore(now.festival!);
  const [shown, setShown] = useState<{ year: number; month: MonthName }>({ year: now.year, month: nowMonth });
  const step = (d: number) => setShown(s => {
    const i = MONTHS.indexOf(s.month) + d;
    return { year: s.year + Math.floor(i / 12), month: MONTHS[((i % 12) + 12) % 12] };
  });
  const isNow = shown.year === now.year && shown.month === nowMonth;
  const days = monthDays(shown.year, shown.month);
  const shownEra = eraOf(shown.year);
  const holyOf = (daySec: number) => holyDaysOn(daySec, shownEra, scope);
  const holyMonth = days.map(d => ({ d, holy: holyOf(d.sec).filter(h => isAnnual(h.rule)) })).filter(x => x.holy.length);
  const repeats = recurring(shownEra, scope);
  const gods = (list: readonly HolyDay[]) => {
    const ids = [...new Map(list.map(h => [h.deity, h.name])).entries()];
    return openEntity ? (
      <span>
        {ids.map(([id, name], i) => (
          <span key={id}>
            <button type="button" title={`Открыть карточку: ${name}`} onClick={() => openEntity(`deity:${id}`)} className="text-tx underline decoration-t3 cursor-pointer hover:text-gd-hi focus-visible:shadow-[var(--glow-gold)]">
              {name}
            </button>
            {i < ids.length - 1 ? ', ' : ''}
          </span>
        ))}
      </span>
    ) : <span className="text-tx">{ids.map(([, n]) => n).join(', ')}</span>;
  };
  const after = festivalAfter(shown.month);
  const afterSec = after ? yearSlots(shown.year).find(s => s.festival === after)!.startSec : null;
  const dayOfYear = Math.floor((today - yearSlots(now.year)[0].startSec) / SECONDS_PER_DAY) + 1;

  return (
    <section aria-label="Календарь Харптоса" className={`flex flex-col bg-pn shadow-bevel ${className}`}>
      <div className={HEAD}>
        <Icon name="tempo" size={16} color="var(--gd)" title="Календарь Харптоса" />
        <span>Календарь Харптоса</span>
        <span className="type-key text-t2 normal-case">{now.year} DR</span>
      </div>

      <div className="flex flex-wrap items-start gap-4 p-3" data-part="today">
        <HarptosDial hour={now.hour} minute={now.minute} phase={phase} phaseLabel={DAY_PHASE_LABELS[phase].toLowerCase()} size={160} detailed />
        <div className="flex-1 min-w-56 flex flex-col gap-2">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="type-h-28 text-gd">{now.festival ?? `${now.day} ${now.month}`}</span>
            <span className="type-num-24 text-tx">{two(now.hour)}:{two(now.minute)}</span>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 type-body-sm">
            <dt className="text-t2">Сутки</dt>
            <dd className="text-tx">{DAY_PHASE_LABELS[phase]}</dd>
            {now.month ? (
              <>
                <dt className="text-t2">Десятидневка</dt>
                <dd className="text-tx">{ORDINAL[Math.floor((now.day - 1) / TENDAY)]}, день {((now.day - 1) % TENDAY) + 1}</dd>
              </>
            ) : null}
            <dt className="text-t2">Сезон</dt>
            <dd className="text-tx">{SEASON_LABELS[seasonOf(sec)]} · день года <span className="type-num-12">{dayOfYear}/{DAYS_PER_YEAR}</span></dd>
            <dt className="text-t2">Selûne</dt>
            <dd className="flex items-center gap-1 text-tx">
              <Icon name={MOON_ICONS[moon.phase]} size={16} color="var(--src-canon)" title={MOON_LABELS[moon.phase]} />
              {MOON_LABELS[moon.phase].replace('Selûne ', '')} · полная {inDays(moon.daysToFull)}, новая {inDays(moon.daysToNew)}
            </dd>
            <dt className="text-t2">Праздник</dt>
            <dd className="text-tx">{fest.festival} · {inDays(fest.days)}</dd>
            {holyNext ? (
              <>
                <dt className="text-t2">Святой день</dt>
                <dd className="text-tx" data-part="holy-next">{holyList(holyNext.holy)} · {inDays(holyNext.days)}</dd>
              </>
            ) : null}
          </dl>
          <ul aria-label="Фазы суток" className="flex flex-wrap gap-x-3 gap-y-1 type-body-sm text-t2">
            {DAY_PHASES.map(p => (
              <li key={p} className={`flex items-center gap-1 ${p === phase ? 'text-tx' : ''}`}>
                <span aria-hidden className={`inline-block size-3 shadow-bevel-in ${SKY_SWATCH[p]}`} />
                {DAY_PHASE_LABELS[p]} <span className="type-num-12">{two(PHASE_HOURS[p][0])}–{two(PHASE_HOURS[p][1] % 24)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-col gap-1 px-3 pb-3" data-part="month">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Предыдущий месяц" title="Предыдущий месяц" onClick={() => step(-1)} className={BTN}>‹</button>
          <span className="type-h-20 text-tx" aria-live="polite">{shown.month} {shown.year} DR</span>
          <span className="type-key text-t2 normal-case">{SEASON_LABELS[seasonOf(days[0].sec)]}</span>
          <button type="button" aria-label="Следующий месяц" title="Следующий месяц" onClick={() => step(1)} className={BTN}>›</button>
          {isNow ? null : (
            <button type="button" title="К сегодняшнему дню" onClick={() => setShown({ year: now.year, month: nowMonth })} className={BTN}>Сегодня</button>
          )}
          <span role="group" aria-label="Святые дни: чьи боги" className="ml-auto flex gap-px">
            {([['faerun', 'Faerûn', 'святые дни богов Faerûnian pantheon'], ['all', 'все пантеоны', 'святые дни всех богов справочника']] as const).map(([id, label, hint]) => (
              <button key={id} type="button" aria-pressed={scope === id} title={hint} onClick={() => setScope(id)} className={`${OPT} ${scope === id ? OPT_ON : OPT_OFF}`}>{label}</button>
            ))}
          </span>
        </div>
        <table aria-label={`${shown.month} ${shown.year} DR`} className="self-start border-separate border-spacing-px">
          <tbody>
            {[1, 2, 3].map(t => (
              <tr key={t}>
                <th scope="row" className="pr-2 type-key text-t2 text-left font-normal whitespace-nowrap" title={`${ORDINAL[t - 1]} десятидневка`}>{t}-я</th>
                {days.filter(d => d.tenday === t).map(d => {
                  const on = d.sec === today;
                  const past = d.sec < today;
                  const marked = d.moon === 'full' || d.moon === 'new';
                  const holy = holyOf(d.sec);
                  return (
                    <td
                      key={d.day}
                      aria-current={on ? 'date' : undefined}
                      title={`${d.day} ${shown.month} ${shown.year} DR · ${MOON_LABELS[d.moon]}${holy.length ? ` · святой день: ${holyList(holy, 6)}` : ''}`}
                      className={`relative h-9 w-10 align-top px-1 pt-0.5 bg-cd ${on ? 'shadow-[var(--bevel),var(--glow-gold)]' : 'shadow-bevel'}`}
                    >
                      <span className={`type-num-12 ${on ? 'text-gd-hi' : past ? 'text-t3' : 'text-tx'}`}>{d.day}</span>
                      {holy.length ? (
                        <span className="absolute right-0 top-0 flex" data-holy={holy.length}>
                          <Icon name="ent-deity" size={16} color="var(--ent-deity)" title="Святой день" />
                        </span>
                      ) : null}
                      {marked ? (
                        <span className="absolute right-0 bottom-0 flex" data-moon={d.moon}>
                          <Icon name={MOON_ICONS[d.moon]} size={16} color="var(--src-canon)" title={MOON_LABELS[d.moon]} />
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {after && afterSec !== null ? (
          <div
            aria-current={afterSec === today ? 'date' : undefined}
            className={`flex items-center gap-2 px-2 py-1 bg-cd type-body-sm ${afterSec === today ? 'shadow-[var(--bevel),var(--glow-gold)] text-gd-hi' : 'shadow-bevel text-tx'}`}
            data-part="festival"
          >
            <Icon name="ent-event" size={16} color="var(--ent-event)" title="Праздник" />
            <span className="type-h-17">{after}</span>
            <span className="text-t2">— праздник после {shown.month}, вне десятидневок</span>
            {holyOf(afterSec).length ? <span className="text-t2" data-part="festival-holy">· святые дни: {gods(holyOf(afterSec))}</span> : null}
          </div>
        ) : null}
        {holyMonth.length || repeats ? (
          <ul aria-label={`Святые дни: ${shown.month}`} className="flex flex-col gap-0.5 type-body-sm text-t2" data-part="holy">
            {holyMonth.map(({ d, holy }) => (
              <li key={d.day} className="flex flex-wrap items-baseline gap-x-1">
                <Icon name="ent-deity" size={16} color="var(--ent-deity)" title="Святой день" />
                <span className="type-num-12 text-tx">{d.day} {shown.month}</span>{' '}
                {byWhat(holy).map(([what, list], i) => (
                  <span key={what}>{i > 0 ? '; ' : ''}{what ? `${what}: ` : ''}{gods(list)}</span>
                ))}
              </li>
            ))}
            {repeats ? <li className="text-t2" data-part="holy-repeats">{repeats}</li> : null}
          </ul>
        ) : null}
      </div>

      <ol aria-label={`Год ${shown.year} DR`} className="grid grid-cols-4 gap-px px-3 pb-3" data-part="year">
        {(['winter', 'spring', 'summer', 'autumn'] as const).map(season => (
          <li key={season} className="flex flex-col gap-px">
            <span className="type-key text-t2 normal-case">{SEASON_LABELS[season]}</span>
            {yearSlots(shown.year).filter(s => s.season === season).map(s => {
              const label = s.month ?? s.festival!;
              const current = s.month ? (now.year === shown.year && now.month === s.month) : (now.year === shown.year && now.festival === s.festival);
              return s.month ? (
                <button
                  key={label}
                  type="button"
                  aria-pressed={shown.month === s.month}
                  aria-current={current ? 'date' : undefined}
                  title={`${s.month}: показать месяц`}
                  onClick={() => setShown({ year: shown.year, month: s.month! })}
                  className={`text-left px-2 py-0.5 type-body-sm cursor-pointer bg-linear-to-b from-pl to-cd ${current ? 'text-gd-hi shadow-[var(--bevel),var(--glow-gold)]' : shown.month === s.month ? 'text-tx shadow-[var(--bevel),inset_3px_0_0_var(--gd)]' : 'text-t2 shadow-bevel hover:text-tx'}`}
                >
                  {label}
                </button>
              ) : (
                <span key={label} aria-current={current ? 'date' : undefined} className={`px-2 py-0.5 type-body-sm bg-cd shadow-bevel-in ${current ? 'text-gd-hi' : 'text-t2'}`} title="Праздник между месяцами">
                  {label}
                </span>
              );
            })}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default HarptosCalendar;
