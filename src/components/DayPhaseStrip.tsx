// Фазы суток (F6, верх главной зоны): четыре ячейки «Утро · День · Вечер · Ночь» в один ряд, текущая —
// золотое кольцо и золотая подпись. Кликов нет: время двигает только шаг темпа, ячейка — показание,
// а не переключатель, поэтому список, а не группа кнопок. Компонент ничего не считает: фазу отдаёт
// календарь на странице. Текущая ячейка отличается не только цветом — кольцом glow-gold и aria-current.
// Смена фазы — одно из трёх мест, где движение несёт смысл (CLAUDE.md): кольцо и цвет переходят
// ступенями за 160 мс, prefers-reduced-motion гасит это глобально. Строки классов полные.

import { Icon, type IconName } from '../icons/Icon';

export type DayPhase = 'morning' | 'day' | 'evening' | 'night';

export const DAY_PHASES: readonly DayPhase[] = ['morning', 'day', 'evening', 'night'];

export const DAY_PHASE_LABELS: Readonly<Record<DayPhase, string>> = {
  morning: 'Утро',
  day: 'День',
  evening: 'Вечер',
  night: 'Ночь',
};

export const DAY_PHASE_ICONS: Readonly<Record<DayPhase, IconName>> = {
  morning: 'dawn',
  day: 'day',
  evening: 'dusk',
  night: 'night',
};

export interface DayPhaseStripProps {
  value: DayPhase;
  className?: string;
}

/* Ячейка — плита pn с фаской, 64px; текущая — кольцо glow-gold поверх фаски и золотая подпись. */
const CELL = 'flex h-16 flex-col items-center justify-center gap-1 bg-pn [transition:box-shadow_160ms_steps(4,end),color_160ms_steps(4,end)]';
const CELL_OFF = 'text-t2 shadow-bevel';
const CELL_ON = 'text-gd-hi shadow-[var(--bevel),var(--glow-gold)]';

export function DayPhaseStrip({ value, className = '' }: DayPhaseStripProps) {
  return (
    <div role="list" aria-label="Фаза суток" className={`grid grid-cols-4 gap-px ${className}`}>
      {DAY_PHASES.map(p => {
        const on = p === value;
        const label = DAY_PHASE_LABELS[p];
        return (
          <div
            key={p}
            role="listitem"
            aria-current={on ? 'true' : undefined}
            aria-label={on ? `${label} · сейчас` : label}
            data-phase={p}
            className={`${CELL} ${on ? CELL_ON : CELL_OFF}`}
          >
            <Icon name={DAY_PHASE_ICONS[p]} size={24} color="currentColor" title={label} />
            <span className="type-num-12 uppercase">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default DayPhaseStrip;
