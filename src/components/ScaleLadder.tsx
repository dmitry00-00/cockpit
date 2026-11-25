// Лестница масштабов (F4, полоса 34px над главной зоной): путь партии от Великого Колеса до боя, по одной
// ступени на уровень, — крошки, а не меню. Клик по ступени — прыжок на уровень; клавиши [ и ] живут на
// странице (HANDOFF §3), здесь они только в тултипе текущей ступени — aria-keyshortcuts не ставится, клавиша
// не на этой кнопке. Лестница ничего не хранит: путь и текущий уровень приходят пропсами, уровни без места
// в сеттинге страница сюда не передаёт (скрыты, а не показаны пустыми). Сжатый вид — как в прототипе, при
// семи и более ступенях: по имени — текущая и её соседи, дальние — одной иконкой, чтобы девять уровней
// влезли в ширину главной зоны без прокрутки; иконка несёт title с подписью уровня, так что имя не пропадает.
// Текущая ступень отличается не только цветом: нижняя полоса 3px золотом — форма. Между ступенями —
// типографский знак крошек «›», единственный символ в полосе; он aria-hidden, стоит на подложке lo, а не
// на плите, и красится t2 — t4 текстом не ставится даже декоративно. Строки классов полные: Tailwind ищет
// их в исходнике.

import { Fragment } from 'react';
import type { ScaleLevel } from '../engine';
import { Icon, type IconName } from '../icons/Icon';
import { SCALE_LABELS, SCALE_TEMPO_LABELS } from './scales';

export interface ScaleStep {
  id: ScaleLevel;
  /** Имя места на этом уровне (Faerûn); если места на пути нет — подпись уровня (SCALE_LABELS). */
  label: string;
}

export interface ScaleLadderProps {
  steps: readonly ScaleStep[];
  current: ScaleLevel;
  /** Клик по ступени — прыжок на уровень. Без колбэка ступени всё равно кнопки, но ничего не делают. */
  onSelect?: (id: ScaleLevel) => void;
  /** Сжатый вид: горизонтально — имена текущей и соседей; вертикально — узкая прокручиваемая колонка квадратных иконок. */
  compact?: boolean;
  /** Направление лестницы. Вертикальный вариант показывает каждую ступень с подписью и прокручивается сам. */
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

/** Сжатие включается само, когда ступеней больше стольких: девять уровней в 34px иначе не влезают. */
export const LADDER_COMPACT_FROM = 6;

/**
 * Тултип ступени: «Регион · Sword Coast North · темп: дни»; у ступени без места второго куска нет —
 * «Бой · темп: раунды», а не «Бой · Бой». Текущая добавляет подсказку про клавиши.
 */
export function ladderStepTitle(step: ScaleStep, current = false): string {
  const level = SCALE_LABELS[step.id];
  const parts = [level];
  if (step.label !== level) parts.push(step.label);
  parts.push(`темп: ${SCALE_TEMPO_LABELS[step.id]}`);
  if (current) parts.push('[ и ] — вверх и вниз');
  return parts.join(' · ');
}

/* Ступень — плита pl→cd с фаской, как чип фильтра; текущая — золото и нижняя полоса 3px gd. Кольцо фокуса — вместе с фаской. */
const STEP = 'flex flex-none items-center gap-1.5 whitespace-nowrap px-2 type-h-15 uppercase bg-linear-to-b from-pl to-cd cursor-pointer';
const STEP_OFF = 'text-t2 shadow-bevel hover:text-tx focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
const STEP_ON = 'text-gd-hi shadow-[var(--bevel),inset_0_-3px_0_var(--gd)] focus-visible:shadow-[var(--bevel),inset_0_-3px_0_var(--gd),var(--glow-gold)]';

export function ScaleLadder({ steps, current, onSelect, compact, orientation = 'horizontal', className = '' }: ScaleLadderProps) {
  const idx = steps.findIndex(s => s.id === current);
  const vertical = orientation === 'vertical';
  const compactVertical = vertical && compact === true;
  const squeezed = compact ?? steps.length > LADDER_COMPACT_FROM;
  const navClass = vertical
    ? `flex flex-col items-stretch ${compactVertical ? 'w-14' : 'w-48'} max-w-full max-h-[70vh] min-h-0 overflow-y-auto overflow-x-hidden gap-px p-px bg-lo overscroll-contain`
    : 'flex items-stretch h-bar-scale overflow-x-auto min-w-0 gap-px p-px bg-lo';
  return (
    <nav aria-label="Лестница масштабов" data-orientation={orientation} className={`${navClass} ${className}`}>
      {steps.map((s, i) => {
        const isCurrent = s.id === current;
        // Текущей нет среди ступеней — сжимать не от чего, все по имени.
        const named = vertical ? !compactVertical : !squeezed || idx < 0 || Math.abs(i - idx) <= 1;
        const level = SCALE_LABELS[s.id];
        return (
          <Fragment key={s.id}>
            {i > 0 ? <span aria-hidden="true" data-part="sep" className={`flex flex-none items-center px-0.5 type-h-15 text-t2 ${vertical ? 'justify-center rotate-90' : ''}`}>›</span> : null}
            <button
              type="button"
              data-scale={s.id}
              data-named={named ? 'true' : undefined}
              aria-current={isCurrent ? 'true' : undefined}
              aria-label={compactVertical ? level : undefined}
              title={ladderStepTitle(s, isCurrent)}
              onClick={() => onSelect?.(s.id)}
              className={`${STEP} ${vertical ? `${compactVertical ? 'w-full justify-center px-1' : 'w-full justify-start text-left'}` : ''} ${isCurrent ? STEP_ON : STEP_OFF}`}
            >
              <Icon name={`scale-${s.id}` as IconName} size={16} color="currentColor" title={level} />
              {/* Длинное имя обрезается, полное — в тултипе кнопки. */}
              {named ? <span className="truncate max-w-56">{s.label}</span> : null}
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}

export default ScaleLadder;
