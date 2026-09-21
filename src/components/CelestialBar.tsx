// Небесная полоса (F6, полоса часов после даты): фаза Selûne, ближайшее небесное событие с обратным
// отсчётом и текущий план — только вне Материального: на Материальном строка молчит, пустой части нет
// (CLAUDE.md). Полоса ничего не считает и в стор не ходит: фаза, событие и план приходят пропсами —
// календарь Харптоса считает их на странице. Луна — цветом src-canon (канон книги), событие и план —
// ent-plane (грань плана и космологии); у каждой иконки title, подпись дублирует смысл словом —
// цвет никогда не единственный носитель. Имена мира — латиницей: Selûne, Feywild. Строки классов полные.

import { Icon, type IconName } from '../icons/Icon';

export type MoonPhase = 'new' | 'waxing' | 'full' | 'waning';

/** Четыре фазы в порядке цикла — от новой к убывающей. */
export const MOON_PHASES: readonly MoonPhase[] = ['new', 'waxing', 'full', 'waning'];

export const MOON_LABELS: Readonly<Record<MoonPhase, string>> = {
  new: 'Selûne новая',
  waxing: 'Selûne растёт',
  full: 'Selûne полная',
  waning: 'Selûne убывает',
};

export const MOON_ICONS: Readonly<Record<MoonPhase, IconName>> = {
  new: 'moon-new',
  waxing: 'moon-waxing',
  full: 'moon-full',
  waning: 'moon-waning',
};

export interface CelestialBarProps {
  moon: MoonPhase;
  /** «Полнолуние» · «через 3 дня»: иконка scale-system цветом ent-plane, отсчёт — tx. */
  next?: { label: string; countdown: string };
  /** Текущий план — только вне Материального; нет — не рисуется. */
  plane?: string;
  /** Узкий экран (F9): подписи фазы и события уходят в title, остаются иконки и отсчёт. */
  compact?: boolean;
  className?: string;
}

export function CelestialBar({ moon, next, plane, compact = false, className = '' }: CelestialBarProps) {
  const moonLabel = MOON_LABELS[moon];
  return (
    <div role="group" aria-label="Небесные тела" data-compact={compact || undefined} className={`flex items-center gap-3 whitespace-nowrap type-body-sm text-t2 ${className}`}>
      <span data-part="moon" data-moon={moon} title={`Фаза Selûne: ${moonLabel}`} className="flex flex-none items-center gap-1">
        <Icon name={MOON_ICONS[moon]} size={16} color="var(--src-canon)" title={moonLabel} />
        {compact ? null : <span>{moonLabel}</span>}
      </span>
      {next ? (
        <span data-part="next" title={compact ? `${next.label} ${next.countdown}` : 'Ближайшее небесное событие'} className="flex flex-none items-center gap-1">
          <Icon name="scale-system" size={16} color="var(--ent-plane)" title={compact ? next.label : 'Ближайшее небесное событие'} />
          {compact ? null : <span>{next.label}</span>}
          <span data-part="countdown" className="text-tx">{next.countdown}</span>
        </span>
      ) : null}
      {plane ? (
        <span data-part="plane" title="Текущий план" className="flex flex-none items-center gap-1">
          <Icon name="scale-plane" size={16} color="var(--ent-plane)" title="Текущий план" />
          <span>{plane}</span>
        </span>
      ) : null}
    </div>
  );
}

export default CelestialBar;
