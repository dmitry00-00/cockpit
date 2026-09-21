// Сетка пятнадцати состояний SRD для карточки. Читает actor.conditions пропсом и отдаёт намерение
// колбэками: onToggle(id, on) для четырнадцати тумблеров, onExhaustion(level) для истощения —
// оно уровнями 0…6, а не тумблером (CLAUDE.md «Механика»). Что с этим делать — решает страница:
// toggleCommand / exhaustionCommand ниже переводят намерение в команду движка.
import type { Command, ConditionSnapshot } from '../engine';
import { Icon } from '../icons/Icon';
import { CONDITIONS, EXHAUSTION_MAX_LEVEL, type ConditionId } from '../rules/srd';
import { CONDITION_ORDER, conditionTip } from './ConditionChip';

export interface ConditionGridProps {
  /** Снимок состояний актёра как в State: ключ есть — состояние есть. */
  active: Partial<Record<ConditionId, ConditionSnapshot>>;
  /** Тумблер для всех состояний, кроме истощения: on — что должно стать. */
  onToggle: (id: Exclude<ConditionId, 'exhaustion'>, on: boolean) => void;
  /** Желаемый уровень истощения 0–6; сетка шагает на единицу от текущего. */
  onExhaustion: (level: number) => void;
  className?: string;
}

/** Общее для ячейки: плита, столбик иконка-подпись, кегль 13. */
const CELL = 'flex flex-col items-center justify-center gap-1 px-1 py-2 min-w-0 type-body-xs text-center';
const OFF = 'bg-linear-to-b from-pl to-cd shadow-bevel text-t2';
const ON: Readonly<Record<'debuff' | 'buff', string>> = {
  debuff: 'bg-pl text-fx-debuff-hi shadow-[var(--bevel),inset_0_-3px_0_var(--fx-debuff)]',
  buff: 'bg-pl text-fx-buff-hi shadow-[var(--bevel),inset_0_-3px_0_var(--fx-buff)]',
};
/** Глобальное кольцо фокуса затирается своей фаской — на плите его пишем вместе с ней. */
const FOCUS = 'focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
const STEP = `size-5 flex items-center justify-center type-num-12 bg-cd shadow-bevel text-t2 hover:text-tx active:shadow-bevel-in disabled:opacity-(--op-disabled) disabled:hover:text-t2 ${FOCUS}`;

export function ConditionGrid({ active, onToggle, onExhaustion, className = '' }: ConditionGridProps) {
  return (
    <div role="group" aria-label="Состояния" className={`grid grid-cols-5 gap-1 ${className}`}>
      {CONDITION_ORDER.map(id => {
        const c = CONDITIONS[id];
        if (id === 'exhaustion') {
          const level = active.exhaustion?.level ?? 0;
          const on = level > 0;
          return (
            <div
              key={id}
              role="group"
              aria-label={c.label}
              data-condition={id}
              data-level={level}
              title={`${c.label} — ${conditionTip(id)}`}
              className={`${CELL} ${on ? ON.debuff : OFF}`}
            >
              <Icon name="cond-exhaustion" size={24} color="currentColor" title={c.label} />
              <span className="truncate max-w-full">{c.label}</span>
              {/* Уровень для скринридера — живой регион: после «−»/«+» новый уровень озвучивается сам.
                  Видимое число — только глазу (aria-hidden), иначе читалось бы дважды. */}
              <span className="sr-only" aria-live="polite" aria-atomic="true" data-part="level-live">
                {`Истощение: уровень ${level}`}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`Истощение: снизить уровень (сейчас ${level})`}
                  disabled={level === 0}
                  onClick={() => onExhaustion(level - 1)}
                  className={STEP}
                >
                  −
                </button>
                <span className="type-num-12 min-w-3 text-center" title="Уровень истощения" aria-hidden="true">{level}</span>
                <button
                  type="button"
                  aria-label={`Истощение: повысить уровень (сейчас ${level})`}
                  disabled={level === EXHAUSTION_MAX_LEVEL}
                  onClick={() => onExhaustion(level + 1)}
                  className={STEP}
                >
                  +
                </button>
              </div>
            </div>
          );
        }
        const on = active[id] !== undefined;
        return (
          <button
            key={id}
            type="button"
            aria-label={c.label}
            aria-pressed={on}
            data-condition={id}
            title={`${c.label} — ${conditionTip(id)}`}
            onClick={() => onToggle(id, !on)}
            className={`${CELL} cursor-pointer hover:text-tx ${on ? ON[c.kind] : OFF} ${FOCUS}`}
          >
            <Icon name={`cond-${id}`} size={24} color="currentColor" title={c.label} />
            <span className="truncate max-w-full">{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Намерение → команда движка (для страницы, сетка их не отправляет) ---------- */

/** Тумблер: включить — CONDITION_ADDED без level (level разрешён только истощению), выключить — CONDITION_REMOVED. */
export function toggleCommand(targetId: string, conditionId: Exclude<ConditionId, 'exhaustion'>, on: boolean): Command {
  return on
    ? { type: 'CONDITION_ADDED', payload: { targetId, conditionId } }
    : { type: 'CONDITION_REMOVED', payload: { targetId, conditionId } };
}

/**
 * Уровень истощения: 1–6 — CONDITION_ADDED с явным level (редьюсер ставит его, а не прибавляет),
 * 0 — CONDITION_REMOVED. Редьюсер снимает по одному уровню, поэтому ноль ждём только с первого;
 * сетка шагает на единицу и другого не пришлёт.
 */
export function exhaustionCommand(targetId: string, level: number): Command {
  const clamped = Math.min(EXHAUSTION_MAX_LEVEL, Math.max(0, Math.floor(level)));
  return clamped === 0
    ? { type: 'CONDITION_REMOVED', payload: { targetId, conditionId: 'exhaustion' } }
    : { type: 'CONDITION_ADDED', payload: { targetId, conditionId: 'exhaustion', level: clamped } };
}

export default ConditionGrid;
