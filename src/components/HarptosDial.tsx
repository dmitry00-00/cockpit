// Циферблат Харптоса: сутки по кругу — полдень сверху, полночь снизу, утро слева, вечер справа; четыре сектора
// фаз суток (утро 5–11, день 11–17, вечер 17–21, ночь 21–5 — те же границы, что у dayPhase) и стрелка времени.
// Малый — в полосе часов, кнопка откидной панели; полный — в панели и на вкладке «Время»: деления часов и
// цифры 0, 6, 12, 18. Цвет сектора смысл не несёт один: фазу называют легенда календаря и подпись циферблата.
// Стрелка обведена lo — читается на любом секторе. Компонент ничего не считает, кроме геометрии.
import type { DayPhase } from './DayPhaseStrip';

export interface HarptosDialProps {
  hour: number;
  minute: number;
  phase: DayPhase;
  /** Подпись фазы для aria: «утро». */
  phaseLabel: string;
  /** Размер на экране, px. */
  size: number;
  /** Деления и цифры часов — для полного циферблата. */
  detailed?: boolean;
  className?: string;
}

/** Сектора фаз: начало и конец в часах (ночь — через полночь). */
export const PHASE_HOURS: Readonly<Record<DayPhase, readonly [number, number]>> = {
  morning: [5, 11],
  day: [11, 17],
  evening: [17, 21],
  night: [21, 29],
};

const SKY: Readonly<Record<DayPhase, string>> = {
  morning: 'var(--sky-dawn)',
  day: 'var(--sky-day)',
  evening: 'var(--sky-dusk)',
  night: 'var(--sky-night)',
};

const R = 46;

/** Точка на окружности радиуса r для часа h: полдень сверху, полночь снизу, по часовой. */
export function dialPoint(h: number, r: number): { x: number; y: number } {
  const a = ((h / 24) * 360 + 180) * (Math.PI / 180);
  return { x: r * Math.sin(a), y: -r * Math.cos(a) };
}

function sector(h0: number, h1: number, r: number): string {
  const a = dialPoint(h0, r), b = dialPoint(h1, r);
  const large = h1 - h0 > 12 ? 1 : 0;
  return `M0 0 L${a.x.toFixed(2)} ${a.y.toFixed(2)} A${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)} Z`;
}

const two = (n: number) => String(n).padStart(2, '0');

export function HarptosDial({ hour, minute, phase, phaseLabel, size, detailed = false, className }: HarptosDialProps) {
  const h = hour + minute / 60;
  const tip = dialPoint(h, detailed ? R - 8 : R - 4);
  return (
    <svg
      viewBox="-50 -50 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={`Время суток: ${two(hour)}:${two(minute)}, ${phaseLabel}`}
      className={className}
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <circle r={R + 3} fill="var(--wl)" stroke="var(--lo)" strokeWidth={2} />
      {(Object.keys(PHASE_HOURS) as DayPhase[]).map(p => (
        <path key={p} d={sector(PHASE_HOURS[p][0], PHASE_HOURS[p][1], R)} fill={SKY[p]} data-phase={p} opacity={p === phase ? 1 : 0.7} />
      ))}
      {detailed ? (
        <>
          {Array.from({ length: 24 }, (_, i) => {
            const a = dialPoint(i, R), b = dialPoint(i, i % 6 === 0 ? R - 7 : R - 3);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--lo)" strokeWidth={i % 6 === 0 ? 1.6 : 0.8} />;
          })}
          {[0, 6, 12, 18].map(i => {
            const p = dialPoint(i, R - 15);
            // Кегль 9 единиц схемы: полный циферблат не меньше 160px — на экране от 14px.
            return (
              <text key={i} x={p.x} y={p.y + 3} textAnchor="middle" fontSize={9} fill="var(--tx)" stroke="var(--lo)" strokeWidth={2} paintOrder="stroke">
                {two(i)}
              </text>
            );
          })}
        </>
      ) : null}
      <line x1={0} y1={0} x2={tip.x} y2={tip.y} stroke="var(--lo)" strokeWidth={detailed ? 5 : 9} strokeLinecap="square" />
      <line x1={0} y1={0} x2={tip.x} y2={tip.y} stroke="var(--gd-hi)" strokeWidth={detailed ? 2.4 : 5} strokeLinecap="square" data-part="hand" />
      <circle r={detailed ? 4 : 7} fill="var(--gd)" stroke="var(--lo)" strokeWidth={1.5} />
    </svg>
  );
}

export default HarptosDial;
