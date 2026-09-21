// Плитка характеристики или навыка: подпись, модификатор со знаком, очко под ним, метка владения.
// Клик — бросок d20 (DICE_ROLLED); в режиме селектора редактора — выбор без броска.
// Данные готовит карточка: плитка не знает ни листа, ни стора.

import type { AbilityId } from '../rules/srd/abilities';

export interface StatTileProps {
  label: string;
  /** Модификатор; печатается со знаком, минус — типографский U+2212. */
  mod: number;
  /** Очко характеристики под модификатором; у навыка его нет. */
  score?: number;
  /** Цвет верхней грани — токен ab-*; без него грань тёмная (lo). */
  ability?: AbilityId;
  /** Владение: золотая грань поверх цвета характеристики плюс квадратная метка. */
  owned?: boolean;
  /** Бросок d20 — в режиме roll. */
  onRoll?: () => void;
  /** Селектор в редакторе: aria-pressed и onSelect, броска нет. */
  mode?: 'roll' | 'select';
  selected?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}

/**
 * Знак — как в прототипе: «+3», «+0», а для минуса не дефис, а U+2212 (бандл печатает
 * ASCII «-2» в плитке и «−1» в быстрых кнопках; спека §5 берёт U+2212 везде).
 */
export function signedMod(n: number): string {
  return n < 0 ? `\u2212${Math.abs(n)}` : `+${n}`;
}

/** Верхняя грань 3px под линией фаски: bevel первым — свет сверху-слева остаётся. Строки полные — Tailwind ищет их в исходнике. */
const EDGE: Record<AbilityId | 'none' | 'owned', string> = {
  str: 'shadow-[var(--bevel),inset_0_3px_0_var(--ab-str)]',
  dex: 'shadow-[var(--bevel),inset_0_3px_0_var(--ab-dex)]',
  con: 'shadow-[var(--bevel),inset_0_3px_0_var(--ab-con)]',
  int: 'shadow-[var(--bevel),inset_0_3px_0_var(--ab-int)]',
  wis: 'shadow-[var(--bevel),inset_0_3px_0_var(--ab-wis)]',
  cha: 'shadow-[var(--bevel),inset_0_3px_0_var(--ab-cha)]',
  none: 'shadow-[var(--bevel),inset_0_3px_0_var(--lo)]',
  owned: 'shadow-[var(--bevel),inset_0_3px_0_var(--gd)]',
};

/** Выбранная в селекторе: золотое кольцо поверх фаски и грани. */
const SELECTED = 'shadow-[var(--bevel),var(--glow-gold)]';

export function tileEdge(ability: AbilityId | undefined, owned: boolean | undefined): string {
  if (owned) return EDGE.owned;
  return EDGE[ability ?? 'none'];
}

export function StatTile({
  label, mod, score, ability, owned, onRoll, mode = 'roll', selected = false, onSelect, disabled, title, className,
}: StatTileProps) {
  const select = mode === 'select';
  const edge = select && selected ? SELECTED : tileEdge(ability, owned);
  const hint = title ?? (select ? `${label} · выбрать` : `${label} · бросок d20`);
  return (
    <button
      type="button"
      title={hint}
      aria-pressed={select ? selected : undefined}
      disabled={disabled}
      onClick={select ? onSelect : onRoll}
      className={[
        'relative flex min-w-13 cursor-pointer flex-col items-center gap-0 p-1',
        'bg-linear-to-b from-pl to-cd enabled:hover:from-pl enabled:hover:to-pl',
        edge,
        'focus-visible:shadow-[var(--bevel),var(--glow-gold)]',
        'disabled:cursor-default disabled:opacity-(--op-disabled)',
        className ?? '',
      ].join(' ')}
    >
      <span className={`type-num-12 max-w-full truncate text-center uppercase ${select && selected ? 'text-gd' : 'text-t2'}`}>{label}</span>
      <span className="type-num-24 text-tx [text-shadow:0_1px_0_var(--lo)]">{signedMod(mod)}</span>
      {score != null ? <span className="type-key text-t2">{score}</span> : null}
      {/* Метка владения — в углу, вне потока: плитка с ней и без неё одной высоты, ряды сетки навыков ровные. */}
      {owned ? <span role="img" aria-label="владение" title="владение" className="absolute right-1 bottom-1 size-2 bg-gd" /> : null}
    </button>
  );
}

export default StatTile;
