// Чип состояния: один факт из actor.conditions (или концентрация, или эффект) в одном виде
// для корешка партии, карточки и любого другого места. Три вида — дебафф, бафф, концентрация —
// различаются цветом текста и нижним кантом, но у каждого чипа своя иконка: цвет никогда не
// единственный носитель смысла. Чип ничего не хранит и в стор не ходит: всё приходит пропсами,
// а помощники внизу собирают пропсы из актёра, чтобы корешок и карточка красили одинаково.
import { Tooltip } from 'radix-ui';
import type { ActiveEffect, Actor, ConditionSnapshot } from '../engine';
import { Icon, type IconName } from '../icons/Icon';
import { CONCENTRATION, CONDITIONS, type ConditionId } from '../rules/srd';

export type ChipKind = 'debuff' | 'buff' | 'conc';

export interface ConditionChipProps {
  /** Русская подпись состояния или имя заклинания латиницей (Hunter's Mark). */
  label: string;
  icon: IconName;
  /** Вид: дебафф (по умолчанию), бафф, концентрация. */
  kind?: ChipKind;
  /** Остаток времени или срок словами: «38 мин», «конец следующего хода». */
  timer?: string;
  /** Уровень истощения 1–6; печатается после подписи — «Истощение 2», как в журнале. */
  level?: number;
  /** Текст тултипа — формулировка SRD дословно. Без него тултипа нет. */
  tip?: string;
  /** Кнопка снятия. Нет колбэка — нет кнопки: концентрацию и эффекты снять нечем (HANDOFF §7). */
  onRemove?: () => void;
  /**
   * Чип с тултипом по умолчанию в порядке табуляции — тултип SRD открывается и с клавиатуры. false —
   * для места внутри кнопки или другого интерактива, где вложенный фокусируемый элемент запрещён ARIA
   * (строка корешка партии таким местом была, пока была кнопкой; теперь она контейнер).
   */
  focusable?: boolean;
  className?: string;
}

/**
 * Плита с нижним кантом цвета вида. Бирюзовый — единственный, и он же метка симуляции (src-sim, 4.5:1 к pl).
 * Кольцо фокуса — вместе с фаской и кантом: своя тень утилитой перекрыла бы глобальное :focus-visible.
 * Строки полные — Tailwind ищет их в исходнике.
 */
const KIND_CLASS: Readonly<Record<ChipKind, string>> = {
  debuff: 'text-fx-debuff-hi shadow-[var(--bevel),inset_0_-2px_0_var(--fx-debuff)] focus-visible:shadow-[var(--bevel),inset_0_-2px_0_var(--fx-debuff),var(--glow-gold)]',
  buff: 'text-fx-buff-hi shadow-[var(--bevel),inset_0_-2px_0_var(--fx-buff)] focus-visible:shadow-[var(--bevel),inset_0_-2px_0_var(--fx-buff),var(--glow-gold)]',
  conc: 'text-src-sim shadow-[var(--bevel),inset_0_-2px_0_var(--src-sim)] focus-visible:shadow-[var(--bevel),inset_0_-2px_0_var(--src-sim),var(--glow-gold)]',
};

export function ConditionChip({ label, icon, kind = 'debuff', timer, level, tip, onRemove, focusable = true, className = '' }: ConditionChipProps) {
  // Нативного title у чипа нет: текст SRD показывает Radix-тултип, второй тултип поверх него не нужен.
  const chip = (
    <span
      data-kind={kind}
      tabIndex={tip && focusable ? 0 : undefined}
      className={`inline-flex items-center whitespace-nowrap max-w-full gap-1 px-1.5 pt-px pb-0.5 type-body-sm bg-linear-to-b from-pl to-cd ${KIND_CLASS[kind]} ${tip ? 'cursor-help' : ''} ${className}`}
    >
      <Icon name={icon} size={16} color="currentColor" title={label} />
      <span className="truncate">{label}</span>
      {level !== undefined && (
        <span className="type-key text-t2 flex-none" title="Уровень истощения">{level}</span>
      )}
      {timer && <span className="type-key text-t2 truncate max-w-[50%]" title={timer}>{timer}</span>}
      {onRemove && (
        <button
          type="button"
          aria-label={`Снять: ${label}`}
          onClick={onRemove}
          className="flex-none text-t2 hover:text-tx focus-visible:shadow-glow-gold"
        >
          <Icon name="cross" size={16} color="currentColor" title="Снять" />
        </button>
      )}
    </span>
  );
  if (!tip) return chip;
  // Свой Provider на каждом чипе: чип — лист, и он не вправе требовать обёртку от страницы.
  // Вложенные Provider безвредны; теряется только общий «пропуск задержки» между соседними чипами.
  return (
    <Tooltip.Provider delayDuration={400}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{chip}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            sideOffset={4}
            collisionPadding={8}
            className="type-tooltip text-tx bg-pl shadow-float px-2 py-1 max-w-[320px] z-10"
          >
            {tip}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

/* ---------- Помощники: из актёра в пропсы чипа ---------- */

/** Готовые пропсы одного чипа плюс ключ для списка. */
export interface ChipSpec extends Omit<ConditionChipProps, 'onRemove' | 'className'> {
  id: ConditionId | 'concentration' | 'effect';
  /** Ключ для React-списка: у эффектов имя, у остальных id. */
  key: string;
}

/**
 * Порядок показа состояний: как в сетке прототипа, истощение последним.
 * CONDITION_IDS в SRD-модуле алфавитный (истощение четвёртое) — здесь порядок экрана, не словаря.
 */
export const CONDITION_ORDER: readonly ConditionId[] = [
  'blinded', 'charmed', 'deafened', 'frightened', 'grappled',
  'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned',
  'prone', 'restrained', 'stunned', 'unconscious', 'exhaustion',
];

/**
 * Тултип состояния — абзацы SRD дословно. У истощения к тексту добавляются эффекты уровней:
 * при заданном уровне — свой и все ниже (так читается правило), без уровня — все шесть.
 */
export function conditionTip(id: ConditionId, level?: number): string {
  const c = CONDITIONS[id];
  const parts = [...c.text];
  if (c.levels) {
    const shown = level === undefined ? c.levels : c.levels.filter(l => l.level <= level);
    parts.push(shown.map(l => `${l.level} — ${l.effect}`).join('. ') + '.');
  }
  return parts.join(' ');
}

/**
 * Пропсы чипа для состояния из actor.conditions: подпись, иконка и вид берутся из SRD-модуля. Срок в мировом
 * времени (untilSec) считается остатком от nowSec, как у концентрации; срок словами (until) печатается как есть.
 */
export function conditionChipProps(id: ConditionId, snapshot: ConditionSnapshot = {}, nowSec?: number): ChipSpec {
  const c = CONDITIONS[id];
  const level = id === 'exhaustion' ? (snapshot.level ?? 1) : undefined;
  const timer = snapshot.untilSec !== undefined && nowSec !== undefined ? formatRemaining(snapshot.untilSec - nowSec) : snapshot.until;
  return {
    id,
    key: id,
    label: c.label,
    icon: `cond-${id}` as IconName,
    kind: c.kind,
    timer,
    level,
    tip: conditionTip(id, level),
  };
}

/**
 * Остаток времени словами, как на корешке прототипа: «38 мин», «7 ч», «3 дн», «истекло».
 * Минуты вверх (пять секунд — ещё «1 мин»), часы и дни — к ближайшему: мастер смотрит урывками.
 */
export function formatRemaining(seconds: number): string {
  if (seconds <= 0) return 'истекло';
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} мин`;
  if (seconds < 86_400) return `${Math.max(1, Math.round(seconds / 3600))} ч`;
  return `${Math.max(1, Math.round(seconds / 86_400))} дн`;
}

/** Чип концентрации: имя заклинания, остаток от untilSec до текущего мирового времени, текст правила SRD. */
export function concentrationChipProps(conc: NonNullable<Actor['concentration']>, nowSec: number): ChipSpec {
  return {
    id: 'concentration',
    key: 'concentration',
    label: conc.spell,
    icon: 'cond-concentration',
    kind: 'conc',
    timer: conc.untilSec === undefined ? undefined : formatRemaining(conc.untilSec - nowSec),
    tip: CONCENTRATION.text.join(' '),
  };
}

/** Чип эффекта (Mage Armor): бафф с иконкой заклинания. Текста правила у эффекта в State нет — тултипа нет. */
export function effectChipProps(effect: ActiveEffect, nowSec: number): ChipSpec {
  return {
    id: 'effect',
    key: `effect:${effect.name}`,
    label: effect.name,
    icon: 'spell',
    kind: 'buff',
    timer: effect.untilSec === undefined ? undefined : formatRemaining(effect.untilSec - nowSec),
  };
}

/**
 * Все чипы актёра в одном порядке для любого места показа: состояния по CONDITION_ORDER,
 * затем эффекты, последней — концентрация. Один факт — одна проекция.
 */
export function chipsOf(actor: Pick<Actor, 'conditions' | 'concentration' | 'effects'>, nowSec: number): ChipSpec[] {
  const out: ChipSpec[] = [];
  for (const id of CONDITION_ORDER) {
    const snap = actor.conditions[id];
    if (snap) out.push(conditionChipProps(id, snap, nowSec));
  }
  for (const e of actor.effects ?? []) out.push(effectChipProps(e, nowSec));
  if (actor.concentration) out.push(concentrationChipProps(actor.concentration, nowSec));
  return out;
}

export default ConditionChip;
