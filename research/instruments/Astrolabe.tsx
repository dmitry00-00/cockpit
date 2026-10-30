// И5, прототип ПР1 «астролябия-часы». Песочница исследования, в сборку приложения не входит.
//
// Прибор тупой, как компоненты стола: время, темп и боги партии — пропсами, шаг — колбэком onAdvance(tempo, steps),
// который страница превращает в stepTime() — тот же путь, что у кнопок темпа (DeskPage.onStep). Стор он не читает.
//
// Слои (каждый — свой элемент, чтобы поворот шёл композитором, без перерисовки):
//   1. плита и лимб — неподвижны, рисуются один раз;
//   2. решётка — кольцо года с солнцем; поворачивается CSS-трансформом обёртки;
//   3. линейка — указатель дня; поворачивается так же;
//   4. колпак — Selûne в центре, неподвижен.
// mode="flat" — всё одним SVG, решётка — атрибутом transform у <g>: для замера «одним листом» (bench.html).
//
// Цвета — только переменные токенов (--wl, --tx, --gd…), шрифты — переменные темы. Скругление — только у самого
// прибора: он круглый, как предмет; ручка линейки и плашки — квадратные.
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { dayPhase, formatHarptos, harptos, inDays, nextFestival, seasonOf, SEASON_LABELS } from '../../src/campaign/calendar';
import { holyDaysOn, holyList, isAnnual, nextHolyDayFor } from '../../src/campaign/holyDays';
import { eraOf } from '../../src/campaign/era';
import { SECONDS_PER_DAY } from '../../src/engine/state';
import type { Tempo } from '../../src/engine/events';
import { DAY_PHASE_LABELS } from '../../src/components/DayPhaseStrip';
import { MOON_LABELS } from '../../src/components/CelestialBar';
import {
  angleDelta, holyMarks, hourDeg, moonDisc, moonPath, normalizeStep, pointDeg, polar, reteDeg, reteUnitMin, ringDeg,
  ringSlots, ruleDays, seasonArcs, snapReteMinutes, yearPos,
} from './astrolabeModel';

export interface AstrolabeProps {
  /** Время мира, секунды от эпохи. */
  sec: number;
  /** Темп стола: щелчок решётки — его шаг, если он внутри суток (10 мин, час, день), иначе час. */
  tempo: Tempo;
  /** В бою время идёт раундами: решётка и линейка заперты, шаг — кнопкой. */
  disabled?: boolean;
  /** Боги персонажей партии — их святые дни на кольце золотом. */
  partyDeities?: ReadonlySet<string>;
  /** Шаг времени: страница зовёт stepTime(store, tempo, steps) — как кнопки темпа. */
  onAdvance: (tempo: Tempo, steps: number) => void;
  /** Сторона прибора, px. Геометрия — в единицах 400 × 400. */
  size?: number;
  mode?: 'layered' | 'flat';
  /** Только для замера: лишний поворот решётки, градусы. */
  spinDeg?: number;
  /** Сообщение для диктора снаружи (тост отмены) — читается тем же живым регионом. */
  announce?: string | null;
  /** Фактура рамы фильтром feTurbulence; false — для замера её цены. */
  grain?: boolean;
}

const U = 400;
const C = U / 2;
// Радиусы, единицы 400: рама, лимб (часы), кольцо года (решётка), сезоны, Selûne.
const R_FRAME = 199, R_LIMB_OUT = 194, R_LIMB_IN = 168, R_RING_OUT = 160, R_RING_IN = 126, R_SEASON = 113, R_MOON = 32;
const SKY = { morning: 'var(--sky-dawn)', day: 'var(--sky-day)', evening: 'var(--sky-dusk)', night: 'var(--sky-night)' } as const;
const PHASE_HOURS = { morning: [5, 11], day: [11, 17], evening: [17, 21], night: [21, 29] } as const;
const two = (n: number) => String(n).padStart(2, '0');
const fix = (n: number) => n.toFixed(2);

function arcBand(r0: number, r1: number, d0: number, d1: number): string {
  const large = d1 - d0 > 180 ? 1 : 0;
  const a = polar(d0, r1), b = polar(d1, r1), c = polar(d1, r0), d = polar(d0, r0);
  return `M${fix(a.x)} ${fix(a.y)} A${r1} ${r1} 0 ${large} 1 ${fix(b.x)} ${fix(b.y)} L${fix(c.x)} ${fix(c.y)} A${r0} ${r0} 0 ${large} 0 ${fix(d.x)} ${fix(d.y)} Z`;
}
const hourToDeg = (h: number) => ((h / 24) * 360 + 180) % 360;

/** Общие определения: фаска кольца (свет сверху-слева) и фактура рамы. Только на раме — данные на гладком. */
function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-bevel`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="var(--hi)" />
        <stop offset="0.5" stopColor="var(--br)" />
        <stop offset="1" stopColor="var(--lo)" />
      </linearGradient>
      <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0" result="a" />
        <feComposite in="a" in2="SourceGraphic" operator="in" />
      </filter>
    </defs>
  );
}

/** Слой 1: рама, лимб с секторами фаз суток, деления часов и цифры. Неподвижен. */
const Plate = memo(function Plate({ id, grain = true }: { id: string; grain?: boolean }) {
  return (
    <g>
      <circle r={R_FRAME} fill={`url(#${id}-bevel)`} />
      {grain ? <circle r={R_FRAME} fill="var(--pl)" filter={`url(#${id}-grain)`} /> : null}
      <circle r={R_LIMB_OUT} fill="var(--wl)" stroke="var(--lo)" strokeWidth={2} />
      {(Object.keys(PHASE_HOURS) as (keyof typeof PHASE_HOURS)[]).map(p => (
        <path key={p} d={arcBand(R_LIMB_IN, R_LIMB_OUT, hourToDeg(PHASE_HOURS[p][0]), hourToDeg(PHASE_HOURS[p][0]) + (PHASE_HOURS[p][1] - PHASE_HOURS[p][0]) * 15)} fill={SKY[p]} />
      ))}
      {Array.from({ length: 24 }, (_, h) => {
        const major = h % 3 === 0;
        const a = polar(hourToDeg(h), R_LIMB_OUT), b = polar(hourToDeg(h), R_LIMB_OUT - (major ? 10 : 6));
        return <line key={h} x1={fix(a.x)} y1={fix(a.y)} x2={fix(b.x)} y2={fix(b.y)} stroke="var(--tx)" strokeWidth={major ? 3 : 2} />;
      })}
      {[0, 3, 6, 9, 12, 15, 18, 21].map(h => {
        const p = polar(hourToDeg(h), R_LIMB_IN + 11);
        // Цифры прямо, не по кругу: неподвижный лимб читается без поворота головы.
        return (
          <text key={h} x={fix(p.x)} y={fix(p.y + 5)} textAnchor="middle" fontSize={14} fontFamily="var(--font-mono)" fontWeight={600}
            fill="var(--tx)" stroke="var(--lo)" strokeWidth={3} paintOrder="stroke">{two(h)}</text>
        );
      })}
      <circle r={R_LIMB_IN} fill="var(--bg)" stroke="var(--lo)" strokeWidth={2} />
    </g>
  );
});

interface ReteProps { year: number; doy: number; diy: number; partyKey: string; partyDeities: ReadonlySet<string>; focused: boolean }

/** Слой 2: кольцо года — месяцы и праздники по дням, святые дни, сезоны и солнце на сегодняшнем дне. */
const Rete = memo(function Rete({ year, doy, diy, partyKey, partyDeities, focused }: ReteProps) {
  const slots = useMemo(() => ringSlots(year), [year]);
  const seasons = useMemo(() => seasonArcs(year), [year]);
  // partyKey в пропсах — чтобы memo пересчитал метки, когда сменились боги партии.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- набор богов сравнивается по составу (partyKey), не по ссылке
  const marks = useMemo(() => holyMarks(year, partyDeities), [year, partyKey]);
  const sunDeg = ringDeg(doy, diy);
  // Солнце — у внешнего края кольца, имя месяца — у внутреннего: ручка не закрывает сегодняшний месяц.
  const sun = polar(sunDeg, R_RING_OUT - 8);
  const needle = polar(sunDeg, R_LIMB_IN + 2);
  const rMid = R_RING_IN + 12;
  return (
    <g>
      {/* Перемычки решётки: держат кольцо, за них и берут. Тело решётки — плита pl с фаской. */}
      {[0, 90, 180, 270].map(d => {
        const a = polar(d, R_MOON + 4), b = polar(d, R_RING_IN);
        return <line key={d} x1={fix(a.x)} y1={fix(a.y)} x2={fix(b.x)} y2={fix(b.y)} stroke="var(--pl)" strokeWidth={6} />;
      })}
      <circle r={R_RING_OUT + 1} fill="none" stroke="var(--hi)" strokeWidth={2} />
      {slots.map((s, i) => (s.festival ? null : (
        <path key={s.key} d={arcBand(R_RING_IN, R_RING_OUT, s.startDeg, s.endDeg)} fill={i % 2 ? 'var(--cd)' : 'var(--pn)'} stroke="var(--lo)" strokeWidth={1.5} data-slot={s.key} />
      )))}
      {seasons.map(s => {
        const a = polar(s.startDeg, R_SEASON - 10), b = polar(s.startDeg, R_RING_IN);
        const mid = (s.startDeg + s.endDeg) / 2;
        const p = polar(mid, R_SEASON);
        return (
          <g key={s.season + s.startDeg}>
            <line x1={fix(a.x)} y1={fix(a.y)} x2={fix(b.x)} y2={fix(b.y)} stroke="var(--t4)" strokeWidth={2} />
            <text x={fix(p.x)} y={fix(p.y)} transform={`rotate(${fix(mid)} ${fix(p.x)} ${fix(p.y)})`} textAnchor="middle" dominantBaseline="middle"
              fontSize={13} fontFamily="var(--font-text)" fill="var(--t2)">{s.label}</text>
          </g>
        );
      })}
      {slots.map(s => {
        const mid = (s.startDeg + s.endDeg) / 2;
        const p = polar(mid, rMid);
        if (s.festival) {
          // Праздник — один день, меньше градуса: бусина на стыке месяцев, имя — в подсказке и на плите.
          return (
            <circle key={s.key} cx={fix(p.x)} cy={fix(p.y)} r={6} fill="var(--gd-hi)" stroke="var(--lo)" strokeWidth={2} data-festival={s.key}>
              <title>{s.label}</title>
            </circle>
          );
        }
        return (
          <text key={s.key + 't'} x={fix(p.x)} y={fix(p.y)} transform={`rotate(${fix(mid)} ${fix(p.x)} ${fix(p.y)})`} textAnchor="middle" dominantBaseline="middle"
            fontSize={15} fontFamily="var(--font-display)" fill="var(--tx)">{s.label}</text>
        );
      })}
      {marks.map(m => {
        const a = polar(m.deg, R_RING_OUT + 1), b = polar(m.deg - 1.6, R_RING_OUT + 8), c = polar(m.deg + 1.6, R_RING_OUT + 8);
        return (
          <path key={m.day} d={`M${fix(a.x)} ${fix(a.y)} L${fix(b.x)} ${fix(b.y)} L${fix(c.x)} ${fix(c.y)} Z`} fill={m.party ? 'var(--gd)' : 'var(--t2)'} stroke="var(--lo)" strokeWidth={1}>
            <title>{holyList(m.holy)}</title>
          </path>
        );
      })}
      {/* Солнце на кольце — сегодняшний день; игла от него на лимб — час. Ручка решётки. */}
      <line x1={fix(sun.x)} y1={fix(sun.y)} x2={fix(needle.x)} y2={fix(needle.y)} stroke="var(--lo)" strokeWidth={7} />
      <line x1={fix(sun.x)} y1={fix(sun.y)} x2={fix(needle.x)} y2={fix(needle.y)} stroke="var(--gd-hi)" strokeWidth={3} />
      {focused ? <circle cx={fix(sun.x)} cy={fix(sun.y)} r={14} fill="none" stroke="var(--gd)" strokeWidth={3} /> : null}
      <circle cx={fix(sun.x)} cy={fix(sun.y)} r={8} fill="var(--gd-hi)" stroke="var(--lo)" strokeWidth={2.5} data-part="sun" />
    </g>
  );
});

/** Слой 3: линейка — от центра к кольцу, ручка квадратная. Ноль — на солнце. */
function Rule({ focused, previewing }: { focused: boolean; previewing: boolean }) {
  return (
    <g>
      {/* Лезвие — до кольца, не через него: имя месяца и солнце видны. День цели — уголок за кольцом. */}
      <rect x={-2.5} y={-R_RING_IN + 2} width={5} height={R_RING_IN - 2 - R_MOON} fill={previewing ? 'var(--gd)' : 'var(--br)'} stroke="var(--lo)" strokeWidth={1} />
      <path d={`M0 ${-R_RING_IN + 1} L-6 ${-R_RING_IN + 11} L6 ${-R_RING_IN + 11} Z`} fill={previewing ? 'var(--gd)' : 'var(--br)'} stroke="var(--lo)" strokeWidth={1} />
      {previewing ? <path d={`M0 ${-R_RING_OUT - 1} L-7 ${-R_RING_OUT - 13} L7 ${-R_RING_OUT - 13} Z`} fill="var(--gd)" stroke="var(--lo)" strokeWidth={1.5} data-part="rule-target" /> : null}
      <rect x={-11} y={-92} width={22} height={22} fill={previewing ? 'var(--gd)' : 'var(--br)'} stroke="var(--lo)" strokeWidth={2} data-part="rule-grip" />
      <line x1={-10} y1={-91} x2={10} y2={-91} stroke="var(--hi)" strokeWidth={1.5} />
      {focused ? <rect x={-16} y={-97} width={32} height={32} fill="none" stroke="var(--gd)" strokeWidth={3} /> : null}
    </g>
  );
}

/** Слой 4: Selûne в центре — диск с терминатором; ось прибора под ним. */
const Cap = memo(function Cap({ lit, waxing }: { lit: number; waxing: boolean }) {
  const path = moonPath({ lit, waxing, phase: 'full', daysToFull: 0 }, R_MOON - 4);
  return (
    <g>
      <circle r={R_MOON} fill="var(--pl)" stroke="var(--lo)" strokeWidth={2} />
      <circle r={R_MOON - 4} fill="var(--wl)" />
      {path ? <path d={path} fill="var(--tx)" /> : null}
      <circle r={R_MOON - 4} fill="none" stroke="var(--lo)" strokeWidth={1.5} />
    </g>
  );
});

type Drag = { kind: 'rete' | 'rule'; lastDeg: number; acc: number; id: number };

const RETE_HELP = 'Решётка: повернуть по часовой — шаг времени; щелчок — темп стола внутри суток, иначе час · стрелки, PageUp — сутки · назад — Ctrl+Z';
const RULE_HELP = 'Линейка: выбрать день вперёд и шагнуть к нему · стрелки — день, PageUp — десятидневка, Enter — шагнуть, Esc — отменить';

const NO_GODS: ReadonlySet<string> = new Set();

export function Astrolabe({ sec, tempo, disabled = false, partyDeities = NO_GODS, onAdvance, size = 400, mode = 'layered', spinDeg = 0, announce = null, grain = true }: AstrolabeProps) {
  const uid = useRef(`astro${Math.random().toString(36).slice(2, 8)}`).current;
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [ruleAhead, setRuleAhead] = useState(0); // дней вперёд, черновик линейки
  const [focus, setFocus] = useState<'rete' | 'rule' | null>(null);
  const [live, setLive] = useState('');
  const prevRete = useRef(reteDeg(sec));

  const { year, doy, diy } = yearPos(sec);
  const baseRete = reteDeg(sec);
  const sunAbs = hourDeg(sec);
  const unit = reteUnitMin(tempo);
  const partyKey = [...partyDeities].sort().join(',');
  const moon = moonDisc(sec);

  // Шаг пришёл снаружи (кнопка, Ctrl+Z, жест): анимировать поворот, если он не больше оборота (≤ сутки);
  // десятидневка — это десять оборотов, их вращение не читается — прыжок. prefers-reduced-motion гасит переход в index.css.
  const animate = spinDeg === 0 && Math.abs(baseRete - prevRete.current) <= 361;
  useEffect(() => { prevRete.current = baseRete; }, [baseRete]);
  useEffect(() => { if (announce) setLive(announce); }, [announce]);

  const previewMin = drag?.kind === 'rete' ? snapReteMinutes(drag.acc, tempo) : 0;
  const ruleDaysNow = drag?.kind === 'rule' ? ruleDays(Math.max(0, drag.acc), diy) : ruleAhead;
  const reteShown = baseRete + (drag?.kind === 'rete' ? Math.max(0, drag.acc) : 0) + spinDeg;
  // Линейка стоит на солнце и идёт за ним, пока тянут решётку.
  const ruleShown = sunAbs + (ruleDaysNow * 360) / diy + (drag?.kind === 'rete' ? Math.max(0, drag.acc) : 0);

  const commitMinutes = (minutes: number) => {
    const step = normalizeStep(minutes);
    if (!step) return false;
    onAdvance(step.tempo, step.steps);
    const to = formatHarptos(sec + minutes * 60);
    setLive(`Время: ${to}. Отменить — Ctrl+Z`);
    return true;
  };
  const commitDays = (days: number) => {
    if (days <= 0) return;
    onAdvance('day', days);
    setLive(`Время: ${formatHarptos(sec + days * SECONDS_PER_DAY)}. Отменить — Ctrl+Z`);
  };

  const degAt = (e: ReactPointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return pointDeg(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
  };
  const onDown = (kind: Drag['kind']) => (e: ReactPointerEvent<SVGElement>) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setDrag({ kind, lastDeg: degAt(e), acc: kind === 'rule' ? (ruleAhead * 360) / diy : 0, id: e.pointerId });
  };
  const onMove = (e: ReactPointerEvent<SVGElement>) => {
    if (!drag || e.pointerId !== drag.id) return;
    const deg = degAt(e);
    setDrag({ ...drag, lastDeg: deg, acc: drag.acc + angleDelta(drag.lastDeg, deg) });
  };
  const onUp = (e: ReactPointerEvent<SVGElement>) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.kind === 'rete') {
      if (drag.acc < -1) setLive('Время идёт только вперёд. Назад — Ctrl+Z');
      else commitMinutes(snapReteMinutes(drag.acc, tempo));
    } else {
      const days = ruleDays(Math.max(0, drag.acc), diy);
      setRuleAhead(0);
      commitDays(days);
    }
    setDrag(null);
  };

  const onReteKey = (e: KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); commitMinutes(unit); }
    else if (e.key === 'PageUp') { e.preventDefault(); commitMinutes(1440); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); setLive('Время идёт только вперёд. Назад — Ctrl+Z'); }
  };
  const onRuleKey = (e: KeyboardEvent) => {
    if (disabled) return;
    const set = (n: number) => { e.preventDefault(); const v = Math.min(diy, Math.max(0, n)); setRuleAhead(v); setLive(ruleText(v)); };
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') set(ruleAhead + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') set(ruleAhead - 1);
    else if (e.key === 'PageUp') set(ruleAhead + 10);
    else if (e.key === 'PageDown') set(ruleAhead - 10);
    else if (e.key === 'Home') set(0);
    else if (e.key === 'Enter') { e.preventDefault(); const n = ruleAhead; setRuleAhead(0); commitDays(n); }
    else if (e.key === 'Escape' && ruleAhead > 0) { e.preventDefault(); setRuleAhead(0); setLive('Линейка вернулась на сегодня'); }
  };

  const ruleText = (days: number) => {
    if (days === 0) return `Линейка на сегодня: ${formatHarptos(sec)}`;
    const at = sec + days * SECONDS_PER_DAY;
    const holy = holyDaysOn(at, eraOf(harptos(at).year)).filter(h => isAnnual(h.rule));
    const m = moonDisc(at);
    return `${inDays(days)}: ${formatHarptos(at)} · ${MOON_LABELS[m.phase]}${holy.length ? ` · ${holyList(holy)}` : ''}`;
  };
  const reteText = `${formatHarptos(sec)}, ${DAY_PHASE_LABELS[dayPhase(sec)].toLowerCase()}`;

  const px = size / U;
  const layer = (deg: number, anim: boolean) => ({
    position: 'absolute' as const, inset: 0, transform: `rotate(${deg}deg)`, willChange: 'transform',
    transition: anim && !drag ? 'transform 180ms ease-out' : 'none', pointerEvents: 'none' as const,
  });
  const svgProps = { viewBox: `${-C} ${-C} ${U} ${U}`, width: size, height: size, style: { display: 'block', overflow: 'visible' } };
  const grab = { pointerEvents: disabled ? 'none' : 'visiblePainted', cursor: disabled ? 'default' : drag ? 'grabbing' : 'grab' } as const;
  const handlers = (kind: Drag['kind']) => ({ onPointerDown: onDown(kind), onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: () => setDrag(null) });

  const rete = (
    <g style={grab} {...handlers('rete')}>
      <Rete year={year} doy={doy} diy={diy} partyKey={partyKey} partyDeities={partyDeities} focused={focus === 'rete'} />
    </g>
  );
  const rule = <g style={grab} {...handlers('rule')}><Rule focused={focus === 'rule'} previewing={ruleDaysNow > 0} /></g>;

  return (
    <div data-part="astrolabe" style={{ display: 'flex', flexDirection: 'column', gap: 12, width: size }}>
      <div ref={box} style={{ position: 'relative', width: size, height: size, touchAction: 'none', userSelect: 'none' }} data-mode={mode}>
        {mode === 'layered' ? (
          <>
            <svg {...svgProps} aria-hidden="true"><Defs id={uid} /><Plate id={uid} grain={grain} /></svg>
            <div style={layer(reteShown, animate)}><svg {...svgProps} aria-hidden="true" style={{ ...svgProps.style, pointerEvents: 'none' }}>{rete}</svg></div>
            <div style={layer(ruleShown, false)}><svg {...svgProps} aria-hidden="true" style={{ ...svgProps.style, pointerEvents: 'none' }}>{rule}</svg></div>
            <svg {...svgProps} aria-hidden="true" style={{ ...svgProps.style, position: 'absolute', inset: 0, pointerEvents: 'none' }}><Cap lit={moon.lit} waxing={moon.waxing} /></svg>
          </>
        ) : (
          <svg {...svgProps} aria-hidden="true">
            <Defs id={uid} /><Plate id={uid} grain={grain} />
            <g transform={`rotate(${fix(reteShown)})`}>{rete}</g>
            <g transform={`rotate(${fix(ruleShown)})`}>{rule}</g>
            <Cap lit={moon.lit} waxing={moon.waxing} />
          </svg>
        )}
        {/* Фокус и диктор — у HTML-ползунков поверх прибора; SVG под ними aria-hidden. */}
        <div role="slider" tabIndex={disabled ? -1 : 0} aria-label="Решётка астролябии: время суток" aria-disabled={disabled || undefined}
          aria-valuemin={Math.floor(sec / 60)} aria-valuemax={Math.floor(sec / 60) + 1440 * diy} aria-valuenow={Math.floor(sec / 60)} aria-valuetext={reteText}
          aria-keyshortcuts="ArrowRight PageUp" title={disabled ? 'В бою время идёт раундами — кнопка «Шаг»' : RETE_HELP}
          onKeyDown={onReteKey} onFocus={() => setFocus('rete')} onBlur={() => setFocus(null)}
          style={{ position: 'absolute', width: 1, height: 1, left: C * px, top: 0, outline: 'none', overflow: 'hidden' }} data-part="rete-slider" />
        <div role="slider" tabIndex={disabled ? -1 : 0} aria-label="Линейка астролябии: день вперёд" aria-disabled={disabled || undefined}
          aria-valuemin={0} aria-valuemax={diy} aria-valuenow={ruleAhead} aria-valuetext={ruleText(ruleAhead)}
          title={disabled ? 'В бою время идёт раундами — кнопка «Шаг»' : RULE_HELP}
          onKeyDown={onRuleKey} onFocus={() => setFocus('rule')} onBlur={() => { setFocus(null); }}
          style={{ position: 'absolute', width: 1, height: 1, left: C * px, top: 1, outline: 'none', overflow: 'hidden' }} data-part="rule-slider" />
      </div>
      <AstrolabePlate sec={sec} partyDeities={partyDeities} previewMin={previewMin} ruleDays={ruleDaysNow} ruleLine={ruleDaysNow > 0 ? ruleText(ruleDaysNow) : null} unit={unit} />
      <div aria-live="polite" role="status" data-part="live" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }}>{live}</div>
    </div>
  );
}

/** Плоская плита под прибором: точное значение словами и числами. Прибор показывает форму, плита — факт. */
function AstrolabePlate({ sec, partyDeities, previewMin, ruleDays: rd, ruleLine, unit }: { sec: number; partyDeities: ReadonlySet<string>; previewMin: number; ruleDays: number; ruleLine: string | null; unit: number }) {
  const d = harptos(sec);
  const phase = dayPhase(sec);
  const moon = moonDisc(sec);
  const fest = nextFestival(sec);
  const era = eraOf(d.year);
  // Поиск ближайшего святого дня — до года по пятидесяти богам: не на каждое движение указателя.
  const day = Math.floor(sec / SECONDS_PER_DAY);
  const holyToday = useMemo(() => holyDaysOn(day * SECONDS_PER_DAY, era).filter(h => isAnnual(h.rule)), [day, era]);
  const nextHoly = useMemo(() => nextHolyDayFor((day + 1) * SECONDS_PER_DAY, era, partyDeities), [day, era, partyDeities]);
  const date = d.festival ? `${d.festival} ${d.year} DR` : `${d.day} ${d.month} ${d.year} DR`;
  const row = { display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' as const };
  const k = { fontFamily: 'var(--font-text)', fontSize: 14, lineHeight: '19px', color: 'var(--t2)' };
  return (
    <div data-part="plate" style={{ background: 'var(--cd)', boxShadow: 'var(--bevel)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={row}>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 24, lineHeight: '28px', color: 'var(--gd)' }}>{two(d.hour)}:{two(d.minute)}</span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, lineHeight: '26px', color: 'var(--tx)' }}>{date}</span>
      </div>
      <div style={k}>{DAY_PHASE_LABELS[phase]} · {SEASON_LABELS[seasonOf(sec)]} · {MOON_LABELS[moon.phase]}, полнолуние {inDays(moon.daysToFull)}</div>
      <div style={k}>{fest.days === 0 ? `Сегодня ${fest.festival}` : `${fest.festival} ${inDays(fest.days)}`}{holyToday.length ? ` · сегодня: ${holyList(holyToday)}` : ''}</div>
      {nextHoly ? <div style={k}>{nextHoly.party ? 'Бог партии' : 'Святой день'} {inDays(nextHoly.days)}: {holyList(nextHoly.holy)}</div> : null}
      {previewMin > 0 ? (
        <div data-part="preview" style={{ ...k, color: 'var(--gd)' }}>Шаг: +{previewMin >= 60 ? `${previewMin / 60} ч` : `${previewMin} мин`} → {formatHarptos(sec + previewMin * 60)} (щелчок — {unit >= 60 ? `${unit / 60} ч` : `${unit} мин`})</div>
      ) : null}
      {rd > 0 && ruleLine ? <div data-part="rule-preview" style={{ ...k, color: 'var(--gd)' }}>Линейка: {ruleLine}</div> : null}
    </div>
  );
}

export default Astrolabe;
