// Полоса хитов: жёлоб с фаской внутрь, заливка по порогу, временные хиты отдельным
// штрихованным сегментом, число справа. Хиты приходят тройкой из State — компонент
// ничего не хранит и в стор не ходит; вспышка — проп: её даёт последнее событие лога
// (useHpFlashes на странице), а не сравнение хитов — одно событие, одна вспышка везде.

import type { HpFlashKind } from '../engine';
import { Icon } from '../icons/Icon';

/** Тройка хитов актёра — форма `Actor['hp']`, чтобы не разносить её по трём пропсам. */
export interface HpTriple {
  current: number;
  max: number;
  temp: number;
}

export type HpLevel = 'high' | 'mid' | 'low';
/** Вид вспышки полосы — тот же, что даёт событие лога; null — полоса спокойна. */
export type HpFlash = HpFlashKind | null;

/**
 * Порог заливки — как в прототипе (bundle.js hpLevel): выше половины — high, выше четверти — mid,
 * иначе low; ровно 50 % — уже mid, ровно 25 % — уже low. Временные хиты в порог не входят:
 * они не лечат, и цвет полосы говорит о настоящих хитах.
 */
export function hpLevel(current: number, max: number): HpLevel {
  const r = max > 0 ? current / max : 0;
  if (r > 0.5) return 'high';
  if (r > 0.25) return 'mid';
  return 'low';
}

/**
 * Геометрия полосы: жёлоб — это max + temp, поэтому при полных хитах и временных
 * заливка укорачивается, а штрих встаёт справа впритык. Проценты в сумме ≤ 100.
 */
export function hpGeometry(hp: HpTriple): { pct: number; tempPct: number } {
  const total = hp.max + hp.temp;
  if (total <= 0) return { pct: 0, tempPct: 0 };
  const pct = Math.max(0, Math.min(100, (hp.current / total) * 100));
  const tempPct = hp.temp > 0 ? Math.min(100 - pct, (hp.temp / total) * 100) : 0;
  return { pct, tempPct };
}

/** Число справа от полосы: «41/49», с временными — «32/32 +5». */
export function hpText(hp: HpTriple): string {
  return `${hp.current}/${hp.max}${hp.temp > 0 ? ` +${hp.temp}` : ''}`;
}

/** Хиты словами — для стола игроков (решение Q1, 28.10.2026): чисел монстра игроки не видят. Половина и меньше — «тяжело ранен». */
export type HpWord = 'невредим' | 'ранен' | 'тяжело ранен' | 'повержен';
export function hpWord(hp: HpTriple): HpWord {
  if (hp.current <= 0) return 'повержен';
  if (hp.current >= hp.max) return 'невредим';
  return hp.current * 2 > hp.max ? 'ранен' : 'тяжело ранен';
}

export interface HpBarProps {
  hp: HpTriple;
  /** Сердце слева от жёлоба; в корешке партии его нет — там тесно. */
  icon?: boolean;
  /** Вспышка жёлоба; гасит её вызывающий (см. useHpFlashes). */
  flash?: HpFlash;
  /** Тонкая полоса и число 12px — для строк, где полоса второстепенна. */
  compact?: boolean;
  /** Имя владельца для aria: «Хиты Bo Tambernack». Без него — просто «Хиты». */
  label?: string;
  className?: string;
}

const FILL: Record<HpLevel, string> = {
  high: 'bg-hp-high',
  mid: 'bg-hp-mid',
  low: 'bg-hp-low',
};

const TRACK_SHADOW: Record<NonNullable<HpFlash>, string> = {
  damage: 'shadow-flash-damage',
  heal: 'shadow-flash-heal',
};

export function HpBar({ hp, icon = true, flash = null, compact = false, label, className }: HpBarProps) {
  const lvl = hpLevel(hp.current, hp.max);
  const { pct, tempPct } = hpGeometry(hp);
  const name = label ? `Хиты ${label}` : 'Хиты';
  const valueText = `${hp.current} из ${hp.max}${hp.temp > 0 ? `, временные ${hp.temp}` : ''}`;
  return (
    <div className={`flex items-center ${compact ? 'gap-1' : 'gap-2'}${className ? ` ${className}` : ''}`}>
      {icon ? <Icon name="hp" size={16} color={`var(--hp-${lvl})`} title={name} /> : null}
      <div
        role="meter"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={hp.max}
        aria-valuenow={hp.current}
        aria-valuetext={valueText}
        className={`relative flex-1 overflow-hidden bg-hp-track ${compact ? 'h-3' : 'h-4'} ${flash ? TRACK_SHADOW[flash] : 'shadow-bevel-in'}`}
      >
        {/* Ширина считается — единственный законный inline-стиль. Шаги вместо плавности: движение в регистре пиксельное. */}
        <div
          data-part="fill"
          className={`h-full ${FILL[lvl]} [transition:width_160ms_steps(8,end)]`}
          style={{ width: `${pct}%` }}
        />
        {tempPct > 0 ? (
          <div
            data-part="temp"
            title={`Временные HP: ${hp.temp}`}
            className="absolute top-0 h-full bg-[repeating-linear-gradient(135deg,var(--fx-temp)_0_3px,var(--ab-int)_3px_6px)]"
            style={{ left: `${pct}%`, width: `${tempPct}%` }}
          />
        ) : null}
      </div>
      <span className={`flex-none text-tx ${compact ? 'type-num-12' : 'type-num-15'}`}>{hpText(hp)}</span>
    </div>
  );
}

export default HpBar;
