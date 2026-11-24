import type { MapPoint } from './projection';
import { courseBearing } from './courseBearing';
import { WIND_FROM_LABELS, type Wind, type WindDirection } from '../campaign/weather';

const WIND_BEARING: Readonly<Record<WindDirection, number>> = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 };

export function CourseCompass({ from, to, target, wind }: { from: MapPoint; to: MapPoint; target: string; wind?: { strength: Wind; from: WindDirection } }) {
  const bearing = courseBearing(from, to);
  if (!bearing) return null;
  const windDeg = wind && wind.strength !== 'calm' ? WIND_BEARING[wind.from] : undefined;
  return (
    <div data-part="course-compass" role="group" aria-label={`Пеленг к цели: ${target}`} className="flex items-center gap-2 py-1">
      <svg viewBox="0 0 72 72" width="72" height="72" aria-hidden="true" className="shrink-0">
        <circle cx="36" cy="36" r="32" fill="var(--pn)" stroke="var(--gd)" strokeWidth="2" />
        <circle cx="36" cy="36" r="25" fill="none" stroke="var(--lo)" strokeWidth="1" />
        <path d="M36 8v6M64 36h-6M36 64v-6M8 36h6" stroke="var(--gd-hi)" strokeWidth="2" />
        <text x="36" y="21" textAnchor="middle" fill="var(--tx)" fontSize="8">С</text>
        <text x="51" y="39" textAnchor="middle" fill="var(--t2)" fontSize="7">В</text>
        <text x="36" y="57" textAnchor="middle" fill="var(--t2)" fontSize="7">Ю</text>
        <text x="21" y="39" textAnchor="middle" fill="var(--t2)" fontSize="7">З</text>
        <g transform={`rotate(${bearing.degrees} 36 36)`}>
          <path d="M36 17 31 38 36 35 41 38Z" fill="var(--gd-hi)" stroke="var(--gd)" strokeWidth="1" />
          <path d="M36 55 31 36 36 39 41 36Z" fill="var(--t2)" />
        </g>
        {windDeg !== undefined ? (
          <g transform={`rotate(${windDeg} 36 36)`}>
            <path d="M36 32V23" stroke="var(--t2)" strokeWidth="1.5" strokeDasharray="2 2" />
            <path d="M36 18 33 24h6Z" fill="var(--t2)" />
          </g>
        ) : null}
        <circle cx="36" cy="36" r="3" fill="var(--gd-hi)" stroke="var(--pn)" strokeWidth="1" />
      </svg>
      <span className="flex min-w-0 flex-col">
        <span className="type-key uppercase text-t2">Пеленг к цели</span>
        <span className="type-num-15 text-gd-hi">{bearing.degrees}° · {bearing.direction}</span>
        <span className="type-body-xs text-t2 truncate" title={`${target}: напрямую по карте, отдельно от маршрута`}>{target} · прямо по карте</span>
        {wind ? <span className="type-body-xs text-t2 truncate" title="Стрелка показывает сторону, ОТКУДА дует ветер по описательной погодной модели кампании; механического эффекта нет.">{wind.strength === 'calm' ? 'Штиль' : `Ветер с ${WIND_FROM_LABELS[wind.from]}`}</span> : null}
      </span>
    </div>
  );
}

export default CourseCompass;
