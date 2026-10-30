// Полоса боя (F2, низ экрана, 72px): слева раунд, в середине ряд токенов инициативы в порядке хода,
// справа «Ход» и, если бой можно закончить, «Закончить бой». Появляется только в бою — пустой полосы нет.
// Полоса ничего не хранит и в стор не ходит: порядок, раунд, текущий и выбранный приходят пропсами,
// «следующий ход» и «закончить» — колбэки; горячая клавиша Space живёт на странице, здесь она только в тултипе.
//
// Геометрия: плита 72px, отступ 6px сверху и снизу (не 8: активный токен в масштабе 125 % — это 60px,
// и в 72 − 16 он бы обрезался прокручиваемым рядом), 12px по бокам. Ряд прокручивается по горизонтали —
// overflow-x делает и вертикаль непрозрачной, поэтому запас по высоте берётся отступами, а не переполнением.
// Строки классов полные: Tailwind ищет их в исходнике.
//
// Легендарные действия (Q13): у существа с ними справа от токена — колонка пипок кнопкой (есть — gd, потрачено —
// утоплено; число — в тултипе и имени кнопки). Щелчок открывает варианты над полосой: вводный абзац и варианты блока
// дословно, у варианта — стоимость; «Потратить» зовёт onLegendarySpend со стоимостью, «Вернуть одно» —
// onLegendaryRestore. Попап — внутри подвала, а не в ряду: прокручиваемый ряд его срезал бы. Esc закрывает.
// Без колбэков (стол игроков) колонки нет: на столе игроков у монстра нет блока (Q1). Слота логова полоса из
// данных не строит — ни у одного блока в данных нет lair actions (rules/srd/legendary.ts).

import { useRef, useState, type KeyboardEvent } from 'react';
import type { EntityType } from './EntityCard';
import type { HpTriple } from './HpBar';
import { InitiativeToken } from './InitiativeToken';

/** Легендарные действия на полосе: сколько всего и потрачено, абзац и варианты блока дословно. */
export interface InitiativeLegendary {
  max: number;
  spent: number;
  intro: string;
  options: readonly { name: string; text: string; cost: number }[];
}

export interface InitiativeBarEntry {
  id: string;
  name: string;
  type: EntityType;
  initiative: number;
  hp?: HpTriple;
  legendary?: number;
  lair?: boolean;
  /** Легендарные действия из блока — колонка пипок справа от токена (только с колбэками). */
  legendaryActions?: InitiativeLegendary;
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
  /** Потрачены легендарные действия существа — столько, сколько стоит вариант (RESOURCE_SPENT пишет страница). */
  onLegendarySpend?: (id: string, amount: number) => void;
  /** Возврат одного легендарного действия вручную (RESOURCE_RESTORED). */
  onLegendaryRestore?: (id: string, amount: number) => void;
  className?: string;
}

/* Кнопки — как BTN на столе: строка целиком, Tailwind ищет её в исходнике. */
const BTN = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
/* Колонка пипок у токена: высота токена, пипки 6px; больше пяти — числом. */
const PIPS_BTN = 'flex-none h-12 w-4 ml-0.5 flex flex-col items-center justify-center gap-1 bg-linear-to-b from-pl to-cd shadow-bevel cursor-pointer active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
const PIPS_SHOWN = 5;
const POPOVER_W = 400;

const legendaryTitle = (l: InitiativeLegendary) => `Легендарные действия: ${l.max - l.spent} из ${l.max} · варианты`;

export function InitiativeBar({ round, entries, activeId, selectedId, onOpen, onNextTurn, onEnd, onLegendarySpend, onLegendaryRestore, className = '' }: InitiativeBarProps) {
  const footerRef = useRef<HTMLElement>(null);
  const [legendaryOpen, setLegendaryOpen] = useState<{ id: string; left: number } | null>(null);
  const editable = Boolean(onLegendarySpend);
  const openEntry = legendaryOpen ? entries.find(e => e.id === legendaryOpen.id && e.legendaryActions) : undefined;
  const toggle = (id: string, button: HTMLElement) => {
    if (legendaryOpen?.id === id) { setLegendaryOpen(null); return; }
    // Попап — над колонкой пипок, но в пределах полосы: позиция считается, как ширина полоски хитов у токена.
    const f = footerRef.current?.getBoundingClientRect();
    const b = button.getBoundingClientRect();
    const left = f ? Math.max(0, Math.min(b.left - f.left, f.width - POPOVER_W)) : 0;
    setLegendaryOpen({ id, left });
  };
  // Esc — на всём подвале: фокус остаётся на колонке пипок или уходит в попап; дальше стола клавиша не идёт.
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && legendaryOpen) { e.stopPropagation(); setLegendaryOpen(null); }
  };
  return (
    <footer
      ref={footerRef}
      onKeyDown={onKey}
      aria-label="Бой"
      className={`relative h-bar-combat flex items-center gap-3 px-3 py-1.5 bg-linear-to-b from-pl to-cd shadow-plate ${className}`}
    >
      {/* Раунд — на плите pl: подпись t2 (4.7:1), число tx. */}
      <div data-part="round" className="flex flex-none flex-col items-start" title="Раунд боя">
        <span className="type-key uppercase text-t2">Раунд</span>
        <span className="type-num-24 text-tx">{round}</span>
      </div>
      {/* Ряд во всю высоту внутреннего поля (60px): активный токен 60px входит без обрезки; боковые 6px — под его масштаб на краях. */}
      <ol aria-label="Порядок инициативы" className="flex h-full flex-1 min-w-0 items-center gap-2 overflow-x-auto px-1.5">
        {entries.map(({ legendaryActions: l, ...e }) => (
          <li key={e.id} className="flex flex-none items-center">
            <InitiativeToken {...e} active={e.id === activeId} selected={e.id === selectedId} onOpen={onOpen} />
            {l && editable ? (
              <button
                type="button"
                data-part="legendary-pips"
                data-legendary={e.id}
                aria-expanded={legendaryOpen?.id === e.id}
                aria-label={`${legendaryTitle(l)}: ${e.name}`}
                title={legendaryTitle(l)}
                onClick={ev => toggle(e.id, ev.currentTarget)}
                className={PIPS_BTN}
              >
                {l.max <= PIPS_SHOWN
                  ? Array.from({ length: l.max }, (_, i) => <span key={i} data-on={i < l.max - l.spent ? 'true' : 'false'} className={`size-1.5 flex-none ${i < l.max - l.spent ? 'bg-gd' : 'bg-wl shadow-bevel-in'}`} />)
                  : <span className="type-num-12 text-tx">{l.max - l.spent}</span>}
              </button>
            ) : null}
          </li>
        ))}
      </ol>
      {openEntry?.legendaryActions && legendaryOpen ? (
        <LegendaryPopover
          name={openEntry.name}
          legendary={openEntry.legendaryActions}
          left={legendaryOpen.left}
          onSpend={amount => { onLegendarySpend?.(openEntry.id, amount); setLegendaryOpen(null); }}
          onRestore={onLegendaryRestore ? () => onLegendaryRestore(openEntry.id, 1) : undefined}
        />
      ) : null}
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

interface LegendaryPopoverProps {
  name: string;
  legendary: InitiativeLegendary;
  left: number;
  onSpend: (amount: number) => void;
  onRestore?: () => void;
}

/** Варианты легендарных действий над полосой: абзац и варианты блока дословно, трата — стоимостью варианта. */
function LegendaryPopover({ name, legendary: l, left, onSpend, onRestore }: LegendaryPopoverProps) {
  const available = l.max - l.spent;
  return (
    <section
      role="dialog"
      aria-label={`Легендарные действия: ${name}`}
      data-part="legendary-popover"
      // Позиция над колонкой пипок считается при открытии — законный inline-стиль, как ширина полоски хитов.
      style={{ left }}
      className="absolute bottom-full mb-1 z-20 flex w-100 max-h-[60vh] flex-col gap-2 overflow-y-auto bg-pn p-3 shadow-float"
    >
      <header className="flex items-baseline gap-2">
        <span className="type-h-17 text-tx flex-1 min-w-0 truncate" title={name}>{name}</span>
        <span className="type-num-12 text-t2 flex-none">{available} из {l.max}</span>
      </header>
      {l.intro ? <p className="type-body-sm text-t2">{l.intro}</p> : null}
      <ul className="flex flex-col gap-2">
        {l.options.map(o => (
          <li key={o.name} className="flex flex-col gap-1 bg-cd p-2 shadow-bevel">
            <div className="flex items-center gap-2">
              <span className="type-body-sm text-tx flex-1 min-w-0 truncate" title={o.name}>{o.name}</span>
              <button
                type="button"
                title={o.cost > available ? `Нужно ${o.cost}, осталось ${available}` : `Потратить ${o.cost}`}
                disabled={o.cost > available}
                onClick={() => onSpend(o.cost)}
                className={BTN}
              >
                Потратить {o.cost}
              </button>
            </div>
            {o.text ? <p className="type-body-sm text-t2">{o.text}</p> : null}
          </li>
        ))}
      </ul>
      {onRestore && l.spent > 0 ? (
        <button type="button" title="Вернуть одно легендарное действие" onClick={onRestore} className={`${BTN} self-start`}>Вернуть одно</button>
      ) : null}
    </section>
  );
}

export default InitiativeBar;
