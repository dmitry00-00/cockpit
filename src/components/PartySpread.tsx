// Раскладка партии (Д17, K01): горизонтальная линия корешков и кнопка «Информация о партии», раскрывающая
// до шести карточек одновременно. Компонент тупой: корешки и карточки — готовые ReactNode от вызывающей
// стороны, выбор и раскрытие — колбэки, expanded управляется снаружи. Страницы — локальное состояние вида
// (навигация не событие): храним номер страницы, рендер клампит его, поэтому сокращение массива не оставляет
// пустую последнюю страницу.
//
// Сворачивание и листание не размонтируют карточки: зона и все карточки всех страниц смонтированы
// всегда; свёрнутая зона и неактивная страница получают hidden + inert — содержимое выпадает из
// accessibility tree и порядка табуляции, локальные состояния готовых карточек (черновики, раскрытия)
// живут. Esc сворачивает раскладку, только если его не обработал дочерний диалог/поле/IME-композиция
// (defaultPrevented, цель в диалоге или в поле ввода, isComposing); обработанный нами Esc гасим
// (preventDefault + stopPropagation), чтобы внешний обработчик стола не закрыл своё поверх.
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import './PartySpread.css';

/** Один участник раскладки: корешок — компактное представление без вложенных кнопок/ссылок. */
export interface PartySpreadItem {
  id: string;
  name: string;
  /** Компактное представление в линии корешков; без вложенных кнопок/ссылок — корешок сам кнопка. */
  spine: ReactNode;
  /** Готовая карточка; её функциональность принадлежит вызывающей стороне. */
  card: ReactNode;
}

export interface PartySpreadProps {
  items: readonly PartySpreadItem[];
  /** Чей корешок выбран: золотое кольцо и aria-current. */
  selectedId?: string;
  onSelect: (id: string) => void;
  /** Раскрыта ли зона карточек; управляется вызывающей стороной. */
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Общие сведения под карточками; пустой/отсутствующий не рисуется вовсе. */
  context?: ReactNode;
  /** Единственная кнопка мировых часов; видна рядом со сводкой при раскрытой партии. */
  clockSlot?: ReactNode;
  /** Временный режим отбора для сравнения и групповых операций. */
  selectedIds?: ReadonlySet<string>;
  onToggleSelection?: (id: string) => void;
  /** Narrow workspaces show one selected card below portrait selectors. */
  mobile?: boolean;
  className?: string;
}

/** Карточек на страницу: до шести одновременно — больше набирается, а не ужимается. */
const PAGE_SIZE = 6;

export function PartySpread({ items, selectedId, onSelect, expanded, onExpandedChange, context, clockSlot, selectedIds, onToggleSelection, mobile = false, className = '' }: PartySpreadProps): ReactNode {
  const zoneId = `party-spread-zone-${useId()}`;
  const contextPanelId = `party-spread-context-${useId()}`;
  const deckId = `party-spread-deck-${useId()}`;
  const infoRef = useRef<HTMLButtonElement>(null);
  const deckTriggerRef = useRef<HTMLButtonElement>(null);
  const zoneRef = useRef<HTMLElement>(null);
  const [page, setPage] = useState(0);
  const [contextOpen, setContextOpen] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);
  const [deckFrontId, setDeckFrontId] = useState<string | undefined>(selectedId ?? items[0]?.id);
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  // Массив мог уменьшиться, пока страница была дальше: рендер клампит номер, пустой страницы не бывает.
  const clampedPage = Math.min(page, pageCount - 1);
  const visiblePageCount = Math.max(1, Math.min(PAGE_SIZE, items.length - clampedPage * PAGE_SIZE));
  useEffect(() => { if (page >= pageCount) setPage(pageCount - 1); }, [page, pageCount]);
  const hasCards = items.length > 0;
  const hasContext = context !== undefined && context !== null && context !== false && context !== '';
  const deckFront = items.find(item => item.id === deckFrontId) ?? items[0];
  const mobileFrontId = items.find(item => item.id === selectedId)?.id ?? items[0]?.id;
  const deckStackItems = deckFront ? [...items.filter(item => item.id !== deckFront.id), deckFront] : [];
  const deckColumnWidth = Math.min(336, 220 + Math.max(0, items.length - 1) * 12);
  useEffect(() => {
    if (deckFrontId && items.some(item => item.id === deckFrontId)) return;
    setDeckFrontId(items.find(item => item.id === selectedId)?.id ?? items[0]?.id);
  }, [deckFrontId, items, selectedId]);
  useEffect(() => { if (mobile && deckOpen) setDeckOpen(false); }, [mobile, deckOpen]);

  /** Фокус остался внутри зоны, которая сейчас скроется — вернуть его на кнопку информации. */
  const restoreFocus = () => {
    const active = document.activeElement;
    const zone = document.getElementById(zoneId);
    if (active instanceof HTMLElement && zone?.contains(active)) infoRef.current?.focus();
  };

  const toggle = () => {
    if (deckOpen) setDeckOpen(false);
    if (expanded) setContextOpen(false);
    onExpandedChange(!expanded);
    if (expanded) restoreFocus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || (!expanded && !deckOpen)) return;
    const target = event.target instanceof Element ? event.target : null;
    // Esc уже обработан дочерним диалогом/полем — раскладку не сворачиваем.
    if (event.defaultPrevented) return;
    // Дочерний диалог: Esc принадлежит ему.
    if (target?.closest('[role="dialog"]')) return;
    // Обычное поле ввода: Esc — родное поведение поля (очистка, закрытие подсказки).
    if (target?.closest('input, textarea, select')) return;
    const editable = target?.closest('[contenteditable]');
    if (editable && editable.getAttribute('contenteditable') !== 'false') return;
    // IME-композиция: Esc закрывает композицию, а не раскладку.
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (deckOpen) {
      if (target && !zoneRef.current?.contains(target) && target !== deckTriggerRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      setDeckOpen(false);
      deckTriggerRef.current?.focus();
      return;
    }
    if (!expanded) return;
    // Наш Esc: гасим, чтобы внешний обработчик стола не закрыл своё поверх.
    event.preventDefault();
    event.stopPropagation();
    setContextOpen(false);
    onExpandedChange(false);
    restoreFocus();
  };

  const renderSpineButton = (item: PartySpreadItem) => (
    <button
      key={item.id}
      type="button"
      className="party-spread-spine-btn"
      aria-current={item.id === selectedId ? 'true' : undefined}
      aria-pressed={mobile && expanded ? item.id === mobileFrontId : undefined}
      aria-label={item.name}
      title={item.name}
      hidden={expanded && !mobile || deckOpen}
      inert={expanded && !mobile || deckOpen}
      onClick={() => onSelect(item.id)}
    >{item.spine}</button>
  );

  return (
    <div className={`party-spread ${className}`} data-expanded={expanded ? 'true' : 'false'} data-mobile={mobile ? 'true' : undefined} onKeyDown={onKeyDown}>
      <div className="party-spread-toolbar">
        <button
          ref={infoRef}
          type="button"
          className="party-spread-info"
          aria-label={`Информация о партии ${items.length}`}
          aria-expanded={expanded}
          aria-controls={hasCards ? zoneId : undefined}
          onClick={toggle}
          title={expanded ? 'Свернуть раскладку партии · Esc' : 'Раскрыть карточки участников'}
        >
          <span className="type-key uppercase">Информация о партии</span>
          <span className="party-spread-count type-num-12" title="Участников в партии">{items.length}</span>
        </button>
        {hasCards && !mobile ? <button
          ref={deckTriggerRef}
          type="button"
          className="party-spread-deck-toggle"
          aria-expanded={deckOpen}
          aria-controls={deckOpen ? deckId : zoneId}
          aria-label={deckOpen ? 'Закрыть колоду персонажей' : `Открыть колоду персонажей, ${items.length} карт`}
          title={deckOpen ? 'Закрыть колоду карточек' : 'Разложить карточки стопкой'}
          onClick={() => {
            if (deckOpen) { setDeckOpen(false); deckTriggerRef.current?.focus(); return; }
            setDeckFrontId(items.find(item => item.id === selectedId)?.id ?? items[0]?.id);
            if (expanded) { setContextOpen(false); onExpandedChange(false); }
            setDeckOpen(true);
          }}
        >Колода</button> : null}
      </div>
      {hasCards ? (
        <section
          ref={zoneRef}
          id={zoneId}
          role="region"
          aria-label={deckOpen ? 'Колода карточек' : expanded ? 'Карточки партии' : 'Линия партии'}
          className={`party-spread-stage ${expanded ? 'is-expanded' : 'is-collapsed'}${deckOpen ? ' is-deck-open' : ''}`}
          data-deck-open={deckOpen ? 'true' : undefined}
            style={deckOpen ? { '--party-deck-column-width': `${deckColumnWidth}px` } as CSSProperties : undefined}
        >
          {deckOpen && deckFront ? <div id={deckId} className="party-spread-deck-controls">
            <div className="party-spread-deck-toolbar">
              <strong>Колода карточек</strong>
              <span className="party-spread-count type-num-12" aria-label={`Карт в колоде: ${items.length}`}>{items.length}</span>
            </div>
            <div className="party-spread-deck-stack" role="img" aria-label={`Стопка из ${items.length} карточек`} style={{ '--party-deck-stack-height': `${Math.max(76, 54 + items.length * 14)}px` } as CSSProperties}>
              {deckStackItems.map((item, index) => <div key={item.id} aria-hidden="true" className="party-spread-deck-edge" data-front={item.id === deckFront.id || undefined} style={{ top: `${index * 14}px`, left: `${Math.min(index, 10) * 10}px`, zIndex: index + 1 }}><span>{item.name}</span></div>)}
            </div>
            <div role="group" aria-label="Выбрать лицевую карту" className="party-spread-deck-picker">
              {items.map(item => <button key={item.id} type="button" aria-pressed={item.id === deckFront.id} onClick={() => setDeckFrontId(item.id)}>{item.name}</button>)}
            </div>
          </div> : null}
          {mobile ? <div className="party-spread-mobile-row" role="group" aria-label="Выбрать персонажа">
            {items.map(item => <span key={item.id} className="party-spread-mobile-item">
              {onToggleSelection ? (
                <label className="party-spread-select" hidden={expanded} title={`Выбрать: ${item.name}`}>
                  <input type="checkbox" checked={selectedIds?.has(item.id) ?? false} onChange={() => onToggleSelection(item.id)} aria-label={`Выбрать: ${item.name}`} />
                </label>
              ) : null}
              {renderSpineButton(item)}
            </span>)}
          </div> : null}
          <ul
            className="party-spread-list"
            aria-label="Партия"
            hidden={mobile && !expanded}
            inert={mobile && !expanded}
            style={deckOpen ? { gridTemplateColumns: '1fr', width: '100%' } : mobile && expanded ? { width: '100%' } : { gridTemplateColumns: `repeat(${visiblePageCount}, minmax(0, 1fr))`, width: `min(100%, ${visiblePageCount * 240}px)` }}
          >
            {/* Spine and card share one keyed slot. Both stay mounted so collapsing/paging preserves
                child state; hidden + inert selects exactly one visible presentation per participant. */}
            {items.map((item, index) => {
              const onPage = Math.floor(index / PAGE_SIZE) === clampedPage;
              const isDeckFront = deckOpen && item.id === deckFront?.id;
              const isMobileFront = mobile && expanded && item.id === mobileFrontId && !deckOpen;
              const showCard = deckOpen ? isDeckFront : expanded && (mobile ? item.id === mobileFrontId : onPage);
              return <li key={item.id} className="party-spread-item" style={{ '--party-item-column': (index % PAGE_SIZE) + 1 } as CSSProperties} hidden={mobile ? !showCard : !deckOpen && !onPage} inert={mobile ? !showCard : !deckOpen && !onPage}>
                {!mobile && onToggleSelection ? (
                    <label className="party-spread-select" hidden={expanded || deckOpen} title={`Выбрать: ${item.name}`}>
                    <input type="checkbox" checked={selectedIds?.has(item.id) ?? false} onChange={() => onToggleSelection(item.id)} aria-label={`Выбрать: ${item.name}`} />
                  </label>
                ) : null}
                {!mobile ? renderSpineButton(item) : null}
                <article className="party-spread-card" data-deck-front={isDeckFront || undefined} data-mobile-front={isMobileFront || undefined} aria-label={item.name} hidden={!showCard} inert={!showCard}>
                  {item.card}
                </article>
              </li>;
            })}
          </ul>
          {pageCount > 1 && !deckOpen && !mobile ? (
            <div className="party-spread-pager" aria-label="Страницы раскладки">
              <button
                type="button"
                className="party-spread-page-btn type-key uppercase"
                disabled={clampedPage === 0}
                aria-label="Предыдущая страница участников"
                onClick={() => setPage(clampedPage - 1)}
              >
                Назад
              </button>
              <span className="party-spread-page-info type-key" aria-live="polite">
                Страница {clampedPage + 1} из {pageCount}
              </span>
              <button
                type="button"
                className="party-spread-page-btn type-key uppercase"
                disabled={clampedPage === pageCount - 1}
                aria-label="Следующая страница участников"
                onClick={() => setPage(clampedPage + 1)}
              >
                Далее
              </button>
            </div>
          ) : null}
          {expanded && hasContext && !deckOpen ? (
            <div className="party-spread-context">
              <div className="party-spread-context-toolbar">
                <button
                  type="button"
                  className="party-spread-context-toggle"
                  aria-expanded={contextOpen}
                  aria-controls={contextOpen ? contextPanelId : undefined}
                  onClick={() => setContextOpen(open => !open)}
                >
                  <span aria-hidden="true">{contextOpen ? '▾' : '▸'}</span>
                  <span>Партия сейчас</span>
                  <span className="party-spread-context-action type-key uppercase">{contextOpen ? 'Свернуть' : 'Сводка'}</span>
                </button>
                {clockSlot ? <div className="party-spread-clock-slot" role="group" aria-label="Мировые часы">{clockSlot}</div> : null}
              </div>
              {contextOpen ? <div id={contextPanelId} className="party-spread-context-panel">{context}</div> : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export default PartySpread;
