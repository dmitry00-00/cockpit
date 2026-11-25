import { useEffect, useRef, useState } from 'react';

export interface SandglassTimerProps {
  turnKey: string;
  turnLabel: string;
  active: boolean;
}

/** A local real-time stopwatch for the current turn; it never writes campaign events. */
export function SandglassTimer({ turnKey, turnLabel, active }: SandglassTimerProps) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);
  const elapsedAtStart = useRef(0);

  useEffect(() => {
    setRunning(false);
    setElapsed(0);
    startedAt.current = null;
    elapsedAtStart.current = 0;
  }, [turnKey]);

  useEffect(() => {
    if (!running) return;
    startedAt.current = performance.now();
    const timer = window.setInterval(() => {
      if (startedAt.current !== null) setElapsed(elapsedAtStart.current + performance.now() - startedAt.current);
    }, 200);
    return () => window.clearInterval(timer);
  }, [running]);

  const toggle = () => {
    if (!active) return;
    if (running) {
      setElapsed(startedAt.current === null ? elapsed : elapsedAtStart.current + performance.now() - startedAt.current);
      elapsedAtStart.current = startedAt.current === null ? elapsed : elapsedAtStart.current + performance.now() - startedAt.current;
      startedAt.current = null;
      setRunning(false);
    } else {
      elapsedAtStart.current = elapsed;
      setRunning(true);
    }
  };
  const reset = () => {
    setRunning(false);
    setElapsed(0);
    elapsedAtStart.current = 0;
    startedAt.current = null;
  };
  const seconds = Math.floor(elapsed / 1000);
  const value = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <section aria-label="Песочные часы: таймер хода" className="flex min-w-64 flex-col items-center gap-3 p-4 bg-cd shadow-bevel-in">
      <svg viewBox="0 0 64 72" width="80" height="90" aria-hidden="true">
        <path d="M10 6h44M10 66h44M14 8c0 13 10 17 18 28-8 11-18 15-18 28M50 8c0 13-10 17-18 28 8 11 18 15 18 28" fill="none" stroke="var(--gd)" strokeWidth="3" />
        <path d="M21 14h22L34 29h-4zM30 43h4l9 15H21z" fill="var(--gd-hi)" opacity=".85" />
        <circle cx="32" cy="36" r="2" fill="var(--gd-hi)" />
      </svg>
      <span className="type-num-24 text-gd-hi" role="timer" aria-label={`Прошло ${value}`}>{value}</span>
      <span className="type-body-sm text-t2 text-center">{active ? turnLabel : 'Бой не начат'}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={toggle} disabled={!active} className="type-num-12 uppercase px-3 py-1 bg-pl shadow-bevel text-gd-hi cursor-pointer focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)">
          {running ? 'Пауза' : 'Старт'}
        </button>
        <button type="button" onClick={reset} disabled={!active && elapsed === 0} className="type-num-12 uppercase px-3 py-1 bg-pl shadow-bevel text-t2 cursor-pointer focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)">
          Сбросить
        </button>
      </div>
      <span role="status" className="type-body-xs text-t2">Секундомер стола · не меняет игровое время</span>
    </section>
  );
}

export default SandglassTimer;
