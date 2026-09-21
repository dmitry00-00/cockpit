// Карточка броска (F2, справа над журналом): шапка с костью и подписью, формула, итог крупно, бирки костей
// и модификатора, строка «крит» или «провал», переключатель «скрытый бросок» и история последних десяти.
// Карточка ничего не хранит и в стор не ходит: бросок — payload DICE_ROLLED, история — проекция лога
// rollHistoryOf(), положение переключателя — состояние вида на странице (скрытость будущих бросков —
// не событие, HANDOFF §7). Переброс и закрытие — колбэки; клавиша R живёт на странице, здесь она в тултипе.
//
// Два разных «скрытый»: у самого броска hidden — он уже был скрыт от игроков, и метка стоит у итога;
// переключатель — про следующие броски. Крит и провал — только у одиночного d20 (d20Outcome), цвет
// продублирован строкой «крит»/«провал»: цвет никогда не единственный носитель. Строки классов полные:
// Tailwind ищет их в исходнике.

import { d20Outcome, undoneIds, type DiceRolled, type DomainEvent, type PayloadByType } from '../engine';
import { Icon } from '../icons/Icon';
import { signedMod } from './StatTile';

export type RollOutcome = 'crit' | 'fail' | null;

export interface RollHistoryItem {
  id: string;
  label: string;
  formula: string;
  total: number;
  outcome: RollOutcome;
  hidden: boolean;
}

export interface RollModalProps {
  /** Текущий бросок. */
  roll: DiceRolled;
  /** Если не передан — d20Outcome(roll). */
  outcome?: RollOutcome;
  /** Предыдущие броски, новые сверху, без текущего; показывается не больше HISTORY_MAX. */
  history?: readonly RollHistoryItem[];
  /** Положение переключателя «скрытый бросок» — для следующих бросков (состояние вида на странице). */
  hidden?: boolean;
  onHiddenChange?: (hidden: boolean) => void;
  /** Есть колбэк — в шапке бирка-кнопка «R»; нет — бирки нет: тултип «Перебросить» без действия — обман. */
  onReroll?: () => void;
  /** Крестик в шапке, aria-label «Закрыть бросок». */
  onClose?: () => void;
  className?: string;
}

/** Сколько строк истории показывает карточка. */
export const HISTORY_MAX = 10;

/** Сторона кости из формулы: «2d6+3» → 6; для бирки «d6: 4». */
export function diceSides(formula: string): number | null {
  const m = /d(\d+)/i.exec(formula);
  return m ? Number(m[1]) : null;
}

/** Цвет итога и бирки d20: крит — золото, провал — урон как текст, иначе tx. Строки полные. */
const TOTAL_TONE: Readonly<Record<'crit' | 'fail' | 'plain', string>> = {
  crit: 'text-gd',
  fail: 'text-fx-damage-hi',
  plain: 'text-tx',
};

const OUTCOME_LABEL: Readonly<Record<'crit' | 'fail', string>> = {
  crit: 'Крит',
  fail: 'Провал',
};

/** Проекция лога: броски, действующие сейчас (не отменённые, не компенсации), новые первыми, не больше limit. */
export function rollHistoryOf(events: readonly DomainEvent[], limit = HISTORY_MAX): RollHistoryItem[] {
  const undone = undoneIds(events);
  const out: RollHistoryItem[] = [];
  for (let i = events.length - 1; i >= 0 && out.length < limit; i--) {
    const e = events[i];
    if (e.type !== 'DICE_ROLLED' || e.undoes || e.redoes || undone.has(e.id)) continue;
    const p = e.payload as PayloadByType['DICE_ROLLED'];
    out.push({ id: e.id, label: p.label, formula: p.formula, total: p.total, outcome: d20Outcome(p), hidden: p.hidden });
  }
  return out;
}

/** Последний действующий бросок из лога — то, что показывает карточка; нет такого — null. */
export function lastRollOf(events: readonly DomainEvent[]): { id: string; roll: DiceRolled } | null {
  const undone = undoneIds(events);
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type !== 'DICE_ROLLED' || e.undoes || e.redoes || undone.has(e.id)) continue;
    return { id: e.id, roll: e.payload as PayloadByType['DICE_ROLLED'] };
  }
  return null;
}

const BADGE = 'type-num-12 flex-none px-1 bg-cd shadow-bevel';

export function RollModal({ roll, outcome, history = [], hidden = false, onHiddenChange, onReroll, onClose, className = '' }: RollModalProps) {
  const result: RollOutcome = outcome === undefined ? d20Outcome(roll) : outcome;
  const tone = TOTAL_TONE[result ?? 'plain'];
  const label = roll.label || roll.formula;
  const sides = diceSides(roll.formula);
  const shown = history.slice(0, HISTORY_MAX);
  return (
    <section aria-label={`Бросок: ${label}`} data-outcome={result ?? undefined} className={`w-80 bg-pn shadow-bevel p-3 flex flex-col gap-2 ${className}`}>
      <div data-part="head" className="flex items-center gap-2">
        <Icon name="dice" size={24} color="var(--gd)" title="Бросок" />
        <span className="flex-1 min-w-0 truncate type-num-12 uppercase text-t2" title={label}>{label}</span>
        {onReroll ? (
          <button
            type="button"
            title="Перебросить · R"
            onClick={onReroll}
            className="type-key flex-none px-1 bg-cd shadow-bevel-in text-t2 cursor-pointer hover:text-tx focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]"
          >
            R
          </button>
        ) : null}
        {onClose ? (
          <button
            type="button"
            aria-label="Закрыть бросок"
            title="Закрыть бросок"
            onClick={onClose}
            className="flex-none cursor-pointer text-t2 hover:text-tx"
          >
            <Icon name="cross" size={16} color="currentColor" title="Закрыть" />
          </button>
        ) : null}
      </div>
      {/* Формула — одной строкой; если подписи нет, она уже стоит в шапке и не повторяется. */}
      {roll.label ? <div data-part="formula" className="type-body-sm text-t2">{roll.formula}</div> : null}
      <div data-part="total" className="flex items-center gap-2">
        <span className={`type-num-32 ${tone}`}>{roll.total}</span>
        {roll.hidden ? <Icon name="hidden" size={16} color="var(--src-players)" title="Скрытый бросок: игроки не видели" /> : null}
      </div>
      <div data-part="dice" className="flex flex-wrap items-center gap-1">
        {roll.dice.map((d, i) => {
          const d20 = sides === 20;
          const die = d20 && d === 20 ? 'text-gd' : d20 && d === 1 ? 'text-fx-damage-hi' : 'text-t2';
          return (
            <span key={i} data-part="die" title={sides ? `d${sides}: ${d}` : String(d)} className={`${BADGE} ${die}`}>{d}</span>
          );
        })}
        {roll.mod !== 0 ? <span data-part="mod" title="Модификатор" className={`${BADGE} text-t2`}>{signedMod(roll.mod)}</span> : null}
      </div>
      {result ? (
        <div data-part="outcome" className={`type-num-12 uppercase ${tone}`}>{OUTCOME_LABEL[result]}</div>
      ) : null}
      {/* Переключатель — инструмент мастера: без колбэка (стол игроков, шаг 9) его нет вовсе. */}
      {onHiddenChange ? (
        <label className="flex items-center gap-1.5 type-body-sm text-t2 cursor-pointer">
          <input
            type="checkbox"
            checked={hidden}
            onChange={e => onHiddenChange(e.target.checked)}
            className="appearance-none size-4 flex-none bg-wl shadow-bevel-in cursor-pointer checked:bg-gd focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]"
          />
          <Icon name="hidden" size={16} color="var(--src-players)" title="Скрыт от игроков" />
          <span>скрытый бросок</span>
        </label>
      ) : null}
      {shown.length > 0 ? (
        <ol aria-label="Последние броски" data-part="history" className="flex flex-col gap-0.5 pt-2 shadow-[inset_0_1px_0_var(--lo)]">
          {shown.map(h => (
            <li key={h.id} data-outcome={h.outcome ?? undefined} className="flex items-center gap-2 type-body-sm text-t2">
              <span className="flex-1 min-w-0 truncate" title={`${h.label || h.formula} · ${h.formula}`}>{h.label || h.formula}</span>
              {h.hidden ? <Icon name="hidden" size={16} color="var(--src-players)" title="Скрытый бросок" /> : null}
              <span data-part="history-total" className={`flex-none type-num-15 ${TOTAL_TONE[h.outcome ?? 'plain']}`}>{h.total}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

export default RollModal;
