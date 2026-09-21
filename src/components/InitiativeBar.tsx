// Полоса боя (F2, низ экрана, 72px): слева раунд, в середине ряд токенов инициативы в порядке хода,
// справа «Ход» и, если бой можно закончить, «Закончить бой». Появляется только в бою — пустой полосы нет.
// Полоса ничего не хранит и в стор не ходит: порядок, раунд, текущий и выбранный приходят пропсами,
// «следующий ход» и «закончить» — колбэки; горячая клавиша Space живёт на странице, здесь она только в тултипе.
//
// Геометрия: плита 72px, отступ 6px сверху и снизу (не 8: активный токен в масштабе 125 % — это 60px,
// и в 72 − 16 он бы обрезался прокручиваемым рядом), 12px по бокам. Ряд прокручивается по горизонтали —
// overflow-x делает и вертикаль непрозрачной, поэтому запас по высоте берётся отступами, а не переполнением.
// Строки классов полные: Tailwind ищет их в исходнике.

import type { EntityType } from './EntityCard';
import type { HpTriple } from './HpBar';
import { InitiativeToken } from './InitiativeToken';

export interface InitiativeBarEntry {
  id: string;
  name: string;
  type: EntityType;
  initiative: number;
  hp?: HpTriple;
  legendary?: number;
  lair?: boolean;
}

export interface InitiativeBarProps {
  round: number;
  /** Уже в порядке инициативы — полоса не сортирует. */
  entries: readonly InitiativeBarEntry[];
  activeId?: string;
  selectedId?: string;
  onOpen?: (id: string) => void;
  /** Кнопка «Ход», title «Следующий ход · Space». */
  /** Без колбэка кнопки «Ход» нет — стол игроков показывает порядок, но не ведёт бой. */
  onNextTurn?: () => void;
  /** Кнопка «Закончить бой» — только если передан. */
  onEnd?: () => void;
  className?: string;
}

/* Кнопки — как BTN на столе: строка целиком, Tailwind ищет её в исходнике. */
const BTN = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';

export function InitiativeBar({ round, entries, activeId, selectedId, onOpen, onNextTurn, onEnd, className = '' }: InitiativeBarProps) {
  return (
    <footer
      aria-label="Бой"
      className={`h-bar-combat flex items-center gap-3 px-3 py-1.5 bg-linear-to-b from-pl to-cd shadow-plate ${className}`}
    >
      {/* Раунд — на плите pl: подпись t2 (4.7:1), число tx. */}
      <div data-part="round" className="flex flex-none flex-col items-start" title="Раунд боя">
        <span className="type-key uppercase text-t2">Раунд</span>
        <span className="type-num-24 text-tx">{round}</span>
      </div>
      {/* Ряд во всю высоту внутреннего поля (60px): активный токен 60px входит без обрезки; боковые 6px — под его масштаб на краях. */}
      <ol aria-label="Порядок инициативы" className="flex h-full flex-1 min-w-0 items-center gap-2 overflow-x-auto px-1.5">
        {entries.map(e => (
          <li key={e.id} className="flex flex-none items-center">
            <InitiativeToken {...e} active={e.id === activeId} selected={e.id === selectedId} onOpen={onOpen} />
          </li>
        ))}
      </ol>
      {onNextTurn || onEnd ? (
        <div data-part="actions" className="flex flex-none items-center gap-1">
          {onEnd ? (
            <button type="button" title="Закончить бой" onClick={onEnd} className={BTN}>Закончить бой</button>
          ) : null}
          {onNextTurn ? <button type="button" title="Следующий ход · Space" onClick={onNextTurn} className={BTN}>Ход</button> : null}
        </div>
      ) : null}
    </footer>
  );
}

export default InitiativeBar;
