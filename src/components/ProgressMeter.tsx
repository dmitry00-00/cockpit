import type { ProgressValue } from '../engine/progress';

export interface ProgressMeterProps {
  value: ProgressValue;
  label: string;
  className?: string;
}

/** One accessible visual contract for clocks and other authored progress projections. */
export function ProgressMeter({ value, label, className = '' }: ProgressMeterProps) {
  const segments = Math.max(0, value.segments);
  const filled = Math.min(segments, Math.max(0, value.filled));
  const percent = segments > 0 ? filled / segments * 100 : 0;

  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>
      <div className="h-2 min-w-0 flex-1 bg-hp-track shadow-bevel-in" role="progressbar" aria-label={label}
        aria-valuemin={0} aria-valuemax={segments} aria-valuenow={filled} aria-valuetext={`${filled} из ${segments}`}>
        <div className="h-full bg-src-sim" style={{ width: `${percent}%` }} />
      </div>
      <span className="type-key text-src-sim whitespace-nowrap">{filled} из {segments}</span>
    </div>
  );
}

export default ProgressMeter;
