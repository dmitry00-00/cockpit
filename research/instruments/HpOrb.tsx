// И5, прототип ПР9 для сравнения: шар хитов в духе Diablo II — минимум. Песочница исследования, в сборку не входит.
// Тупой: хиты пропсами (actor.hp из состояния стола), стор не читает. Уровень жидкости — доля current / max;
// временные хиты — штрихованный слой поверх (токен fx-temp: «всегда со штриховкой — форма, а не только цвет»).
// Цвет — заливки hp-high / hp-mid / hp-low по тем же порогам, что полоса хитов (50 % и 25 %); число видно всегда.
// Шар убывает переходом 180 мс; prefers-reduced-motion гасит переход (src/styles/index.css).
import { useId } from 'react';

export interface HpOrbProps {
  name: string;
  current: number;
  max: number;
  temp: number;
  /** Диаметр шара, px. */
  size?: number;
}

const fillOf = (f: number) => (f > 0.5 ? 'var(--hp-high)' : f >= 0.25 ? 'var(--hp-mid)' : 'var(--hp-low)');

export function HpOrb({ name, current, max, temp, size = 120 }: HpOrbProps) {
  const id = useId().replace(/:/g, '');
  const f = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  const t = max > 0 ? Math.max(0, Math.min(1 - f, temp / max)) : 0;
  const R = 46;
  // Уровень жидкости: высота от дна шара (y = R) вверх.
  const level = R - 2 * R * f;
  const tempTop = level - 2 * R * t;
  const text = `${name}: ${current} из ${max} хитов${temp ? `, временных ${temp}` : ''}`;
  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: Math.max(size, 96) }}>
      <svg viewBox="-50 -50 100 100" width={size} height={size} role="meter" aria-label={`Хиты: ${name}`} aria-valuemin={0} aria-valuemax={max} aria-valuenow={current} aria-valuetext={text}>
        <defs>
          <clipPath id={`${id}-in`}><circle r={R} /></clipPath>
          <pattern id={`${id}-hatch`} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={6} height={6} fill="var(--fx-temp)" />
            <rect width={2} height={6} fill="var(--wl)" />
          </pattern>
          <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--hi)" /><stop offset="0.55" stopColor="var(--br)" /><stop offset="1" stopColor="var(--lo)" />
          </linearGradient>
        </defs>
        <circle r={R + 3.5} fill={`url(#${id}-rim)`} />
        <circle r={R} fill="var(--wl)" />
        <g clipPath={`url(#${id}-in)`}>
          <rect x={-R} y={level} width={2 * R} height={2 * R} fill={fillOf(f)} style={{ transition: 'y 180ms ease-out' }} data-part="liquid" />
          {t > 0 ? <rect x={-R} y={tempTop} width={2 * R} height={level - tempTop} fill={`url(#${id}-hatch)`} data-part="temp" /> : null}
          {/* Поверхность жидкости — светлая черта: уровень читается и на тёмной заливке hp-low. */}
          {f > 0 && f < 1 ? <rect x={-R} y={level - 1} width={2 * R} height={2} fill="var(--tx)" opacity={0.8} /> : null}
          {/* Деления четвертей — форма уровня без цифр, с расстояния стола. */}
          {[0.25, 0.5, 0.75].map(q => <rect key={q} x={R - 10} y={R - 2 * R * q - 1} width={10} height={2} fill="var(--lo)" />)}
        </g>
        <circle r={R} fill="none" stroke="var(--lo)" strokeWidth={2} />
      </svg>
      <figcaption style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 24, lineHeight: '28px', color: 'var(--tx)' }}>{current}<span style={{ color: 'var(--t2)' }}>/{max}</span>{temp ? <span style={{ color: 'var(--t2)', fontSize: 16 }}> +{temp} врем.</span> : null}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, lineHeight: '21px', color: 'var(--tx)', maxWidth: Math.max(size, 96), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</div>
      </figcaption>
    </figure>
  );
}

export default HpOrb;
