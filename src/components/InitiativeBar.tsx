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
// Без колбэков (стол игроков) книжная справка не показывается: на столе игроков у монстра нет блока (Q1).
// Действия логова — отдельные owner-source варианты у инициативы 20; выбор и последствия вручную применяет мастер.

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

/** Справочные действия логова из выбранного книжного источника; сами эффекты мастер применяет вручную. */
export interface InitiativeLairActions {
  actorId: string;
  source: string;
  sourceUrl: string;
  intro: string;
  round: number;
  usedThisRound?: string;
  previousRoundOption?: string;
  /** New encounters disable this profile slot unless the GM confirmed a lair context. */
  unavailableOutsideLair?: boolean;
  options: readonly { id: string; name: string; summary: string }[];
}

export interface InitiativeBarEntry {
  id: string;
  name: string;
  type: EntityType;
  initiative: number;
  hp?: HpTriple;
  legendary?: number;
  lair?: boolean;
  /** The A5E Obsessed Wisdom save failed; the actor's first-round actions were skipped. */
  lostFirstRoundActions?: boolean;
  /** Легендарные действия из блока — колонка пипок справа от токена (только с колбэками). */
  legendaryActions?: InitiativeLegendary;
  /** Книжные варианты действий логова: справочная карточка у слота инициативы 20. */
  lairActions?: InitiativeLairActions;
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
  /** Отметить выбранное действие логова; reducer enforces round and repeat limits. */
  onLairAction?: (actorId: string, optionId: string) => void;
  /** Книжное действие логова можно выбрать только в открытом слоте инициативы 20. */
  lairActionWindowOpen?: boolean;
  className?: string;
}

/* Кнопки — как BTN на столе: строка целиком, Tailwind ищет её в исходнике. */
const BTN = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
/* Колонка пипок у токена: высота токена, пипки 6px; больше пяти — числом. */
const PIPS_BTN = 'flex-none h-12 w-4 ml-0.5 flex flex-col items-center justify-center gap-1 bg-linear-to-b from-pl to-cd shadow-bevel cursor-pointer active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
const PIPS_SHOWN = 5;
const POPOVER_W = 400;

const legendaryTitle = (l: InitiativeLegendary) => `Легендарные действия: ${l.max - l.spent} из ${l.max} · варианты`;

export function InitiativeBar({ round, entries, activeId, selectedId, onOpen, onNextTurn, onEnd, onLegendarySpend, onLegendaryRestore, onLairAction, lairActionWindowOpen = false, className = '' }: InitiativeBarProps) {
  const footerRef = useRef<HTMLElement>(null);
  const [legendaryOpen, setLegendaryOpen] = useState<{ id: string; left: number } | null>(null);
  const [lairOpen, setLairOpen] = useState<{ id: string; left: number } | null>(null);
  const editable = Boolean(onLegendarySpend);
  const canShowLairAction = Boolean(onLairAction);
  const openEntry = legendaryOpen ? entries.find(e => e.id === legendaryOpen.id && e.legendaryActions) : undefined;
  const openLairEntry = lairOpen && lairActionWindowOpen ? entries.find(e => e.id === lairOpen.id && e.lairActions) : undefined;
  const toggle = (id: string, button: HTMLElement) => {
    if (legendaryOpen?.id === id) { setLegendaryOpen(null); return; }
    // Попап — над колонкой пипок, но в пределах полосы: позиция считается, как ширина полоски хитов у токена.
    const f = footerRef.current?.getBoundingClientRect();
    const b = button.getBoundingClientRect();
    const left = f ? Math.max(0, Math.min(b.left - f.left, f.width - POPOVER_W)) : 0;
    setLairOpen(null);
    setLegendaryOpen({ id, left });
  };
  const toggleLair = (id: string, button: HTMLElement) => {
    if (!lairActionWindowOpen) return;
    if (lairOpen?.id === id) { setLairOpen(null); return; }
    const f = footerRef.current?.getBoundingClientRect();
    const b = button.getBoundingClientRect();
    const left = f ? Math.max(0, Math.min(b.left - f.left, f.width - POPOVER_W)) : 0;
    setLegendaryOpen(null);
    setLairOpen({ id, left });
  };
  // Esc — на всём подвале: фокус остаётся на колонке пипок или уходит в попап; дальше стола клавиша не идёт.
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && (legendaryOpen || lairOpen)) {
      e.stopPropagation();
      setLegendaryOpen(null);
      setLairOpen(null);
    }
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
        {entries.map(({ legendaryActions: l, lairActions, lostFirstRoundActions, ...e }) => (
          <li key={e.id} className="flex flex-none items-center">
            <InitiativeToken {...e} active={e.id === activeId || Boolean(lairActions && canShowLairAction && lairActionWindowOpen)} selected={e.id === selectedId} onOpen={lairActions ? undefined : onOpen} />
            {lostFirstRoundActions ? <span data-part="lost-first-round-actions" aria-label={`${e.name}: потерял действия первого раунда`} title="A5E Obsessed: провал спасброска Мудрости Сл 15; действия первого раунда пропущены" className="ml-1 type-num-12 uppercase text-t2">Пропуск</span> : null}
            {lairActions && canShowLairAction ? (
              <button
                type="button"
                data-part="lair-actions-trigger"
                data-lair={e.id}
                aria-expanded={lairActionWindowOpen && lairOpen?.id === e.id}
                aria-label={lairActions.unavailableOutsideLair ? `Действия логова недоступны без подтверждения логова: ${e.name}` : `Варианты действий логова: ${e.name}`}
                title={lairActions.unavailableOutsideLair ? 'Недоступно: мастер не подтвердил, что бой проходит в логове' : lairActionWindowOpen ? `Варианты действий логова · ${lairActions.source}` : 'Откроется после всех участников с инициативой 20 или выше'}
                disabled={!lairActionWindowOpen || lairActions.unavailableOutsideLair === true}
                onClick={ev => toggleLair(e.id, ev.currentTarget)}
                className={`${BTN} ml-1`}
              >{lairActions.unavailableOutsideLair ? 'Недоступно' : 'Варианты'}</button>
            ) : null}
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
      {openLairEntry?.lairActions && lairOpen ? (
        <LairPopover
          name={openLairEntry.name}
          lair={openLairEntry.lairActions}
          left={lairOpen.left}
          onUse={optionId => { onLairAction?.(openLairEntry.lairActions!.actorId, optionId); setLairOpen(null); }}
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

interface LairPopoverProps {
  name: string;
  lair: InitiativeLairActions;
  left: number;
  onUse: (optionId: string) => void;
}

/** Краткие книжные варианты под инициативой; выбор и последствия остаются решением мастера. */
function LairPopover({ name, lair, left, onUse }: LairPopoverProps) {
  const usedName = lair.options.find(option => option.id === lair.usedThisRound)?.name;
  const previousName = lair.options.find(option => option.id === lair.previousRoundOption)?.name;
  return (
    <section
      role="dialog"
      aria-label={`Действия логова: ${name}`}
      data-part="lair-popover"
      style={{ left }}
      className="absolute bottom-full mb-1 z-20 flex w-100 max-h-[60vh] flex-col gap-2 overflow-y-auto bg-pn p-3 shadow-float"
    >
      <header className="flex items-baseline gap-2">
        <span className="type-h-17 text-tx flex-1 min-w-0 truncate" title={name}>{name}</span>
        <span className="type-num-12 text-t2 flex-none">Инициатива 20</span>
      </header>
      <p className="type-body-sm text-t2">{lair.intro}</p>
      {usedName ? <p className="type-body-sm text-gd">Раунд {lair.round}: уже выбрано «{usedName}».</p> : null}
      {previousName ? <p className="type-body-sm text-t2">В прошлом раунде было «{previousName}»; этот вариант сейчас недоступен.</p> : null}
      <ul className="flex flex-col gap-2">
        {lair.options.map(option => (
          <li key={option.id} className="flex flex-col gap-1 bg-cd p-2 shadow-bevel">
            <div className="flex items-center gap-2">
              <span className="type-body-sm text-tx flex-1">{option.name}</span>
              <button
                type="button"
                disabled={lair.usedThisRound !== undefined || lair.previousRoundOption === option.id}
                title={lair.usedThisRound !== undefined ? `Уже отмечено в раунде ${lair.round}` : lair.previousRoundOption === option.id ? 'Нельзя повторять в соседних раундах' : 'Отметить выбор; эффект разрешает ведущий'}
                onClick={() => onUse(option.id)}
                className={BTN}
              >{lair.usedThisRound !== undefined ? 'Отмечено' : 'Выбрать'}</button>
            </div>
            <p className="type-body-sm text-t2">{option.summary}</p>
          </li>
        ))}
      </ul>
      <p className="type-body-xs text-t2">Выбор и ограничение раундов сохраняются; эффект мастер разрешает вручную.</p>
      <a className="type-body-xs text-gd-hi underline" href={lair.sourceUrl} target="_blank" rel="noreferrer">Источник: {lair.source}</a>
    </section>
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
