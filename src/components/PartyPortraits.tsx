// Портреты партии (F9): горизонтальная полоса иконок над рабочей зоной на всех ширинах; имя, HP и
// состояния доступны в описании кнопки. Щелчок открывает карточку, верхняя кнопка «Партия» раскрывает
// полную панель оверлеем. Компонент получает актёров и колбэки пропсами.
import { useId } from 'react';
import type { Actor } from '../engine';
import { Icon } from '../icons/Icon';
import { PortraitImage, resolvePortrait } from '../art/portrait';
import './PartyPortraits.css';
import type { ChipKind } from './ConditionChip';
import { hpGeometry, hpLevel, hpText, type HpFlash, type HpLevel } from './HpBar';
import { partyRowDescription, partyRowOf } from './PartySpineRow';

export interface PartyPortraitsProps {
  /** Актёры партии в порядке показа — state.party.map(id => state.actors[id]). */
  actors: readonly Actor[];
  /** Текущее время мира — для таймеров состояний в сводке окна. */
  worldSec: number;
  /** Чья карточка открыта: окно получает золотое кольцо и aria-current. */
  selectedId?: string;
  onOpen: (id: string) => void;
  flash?: Readonly<Record<string, HpFlash>>;
  /** Полная панель партии раскрыта оверлеем. */
  panelOpen: boolean;
  onPanel: () => void;
  /** Встроенный ряд в раскрытой панели показывает портреты без второй кнопки раскрытия. */
  showPanelToggle?: boolean;
  /** Показывать выбор участника для групповых действий поверх портрета. */
  checkedIds?: ReadonlySet<string>;
  onCheck?: (id: string) => void;
  className?: string;
}

/** Состояний в окне не больше стольких — остальные числом «+N». */
const MAX_CHIPS = 3;

const FILL: Readonly<Record<HpLevel, string>> = { high: 'bg-hp-high', mid: 'bg-hp-mid', low: 'bg-hp-low' };
const TRACK: Readonly<Record<NonNullable<HpFlash>, string>> = { damage: 'shadow-flash-damage', heal: 'shadow-flash-heal' };
const CHIP_TEXT: Readonly<Record<ChipKind, string>> = { debuff: 'text-fx-debuff-hi', buff: 'text-fx-buff-hi', conc: 'text-src-sim' };

const HEAD_CELL = 'relative flex h-14 w-14 flex-none items-center justify-center gap-1 cursor-pointer bg-linear-to-b from-pl to-cd focus-visible:shadow-[var(--bevel),var(--glow-gold)]';

export function PartyPortraits({ actors, worldSec, selectedId, onOpen, flash, panelOpen, onPanel, showPanelToggle = true, checkedIds, onCheck, className = '' }: PartyPortraitsProps) {
  return (
    <nav aria-label="Партия" data-side="left" data-party-portraits className={`party-portrait-rail w-rail-portraits flex-none flex flex-row gap-px min-h-0 bg-pn shadow-bevel ${className}`}>
      {showPanelToggle ? (
        <button
          type="button"
          aria-pressed={panelOpen}
          aria-label="Партия"
          data-part="party-rail-toggle"
          title={`Партия: ${panelOpen ? 'свернуть' : 'раскрыть панель'}`}
          onClick={onPanel}
          className={`${HEAD_CELL} ${panelOpen ? 'text-gd-hi shadow-[var(--bevel),inset_-3px_0_0_var(--gd)]' : 'shadow-bevel text-t2 hover:text-tx'}`}
        >
          <Icon name="ent-pc" size={16} color={panelOpen ? 'var(--gd-hi)' : 'var(--ent-pc)'} title="Партия" />
          <span className="type-key" title="Персонажей в партии">{actors.length}</span>
        </button>
      ) : null}
      <div className="party-portrait-items flex-1 min-w-0 min-h-0 overflow-x-auto overflow-y-hidden flex flex-row gap-px">
        {actors.map(a => (
          <div key={a.id} data-part="party-portrait-slot" className="party-portrait-slot">
            <Portrait actor={a} worldSec={worldSec} selected={a.id === selectedId} onOpen={onOpen} flash={flash?.[a.id] ?? null} />
            {onCheck ? (
              <label className="party-portrait-check" title={`Включить ${a.name} в групповые действия`}>
                <input type="checkbox" checked={checkedIds?.has(a.id) ?? false} onChange={() => onCheck(a.id)} aria-label={`Выбрать ${a.name} для групповых действий`} />
              </label>
            ) : null}
          </div>
        ))}
      </div>
    </nav>
  );
}

function Portrait({ actor, worldSec, selected, onOpen, flash }: {
  actor: Actor; worldSec: number; selected: boolean; onOpen: (id: string) => void; flash: HpFlash;
}) {
  const row = partyRowOf(actor, worldSec);
  const portrait = resolvePortrait(actor.sheet?.portrait);
  const fallbackPortrait = <Icon name={row.avatar} size={32} color="var(--t2)" title={row.lineage ?? 'Персонаж игрока'} />;
  const descId = useId();
  const { pct } = hpGeometry(row.hp);
  const lvl = hpLevel(row.hp.current, row.hp.max);
  const shown = row.chips.slice(0, MAX_CHIPS);
  const more = row.chips.length - shown.length;
  // Окно — одна кнопка: всё внутри — её картинка, сводку (раса, класс, уровень, хиты, состояния) слышно описанием.
  return (
    <button
      type="button"
      aria-label={`Открыть карточку: ${row.name}`}
      aria-describedby={descId}
      aria-current={selected ? 'true' : undefined}
      data-actor={row.id}
      data-down={row.down ? 'true' : undefined}
      title={[row.name, row.lineage && `${row.lineage}${row.level === undefined ? '' : `, ${row.level} ур.`}`, `хиты ${hpText(row.hp)}`, `AC ${row.ac}`]
        .filter(Boolean).join(' · ')}
      onClick={() => onOpen(row.id)}
      data-part="party-portrait-button"
      className={`flex flex-none flex-col items-center justify-center gap-0.5 p-1 w-14 h-14 cursor-pointer bg-linear-to-b from-pl to-cd ${selected ? 'shadow-[var(--plate),var(--glow-gold)]' : 'shadow-plate'} focus-visible:shadow-[var(--plate),var(--glow-gold)]`}
    >
      <span id={descId} className="sr-only">
        {[row.lineage && (row.level === undefined ? row.lineage : `${row.lineage}, ${row.level} уровень`), partyRowDescription(row)].filter(Boolean).join('; ')}
      </span>
      <span className={`relative size-12 flex-none flex items-center justify-center bg-cd shadow-bevel-in ${row.down ? 'opacity-55' : ''}`} data-part="portrait">
        {portrait ? <PortraitImage portrait={portrait} alt={`Портрет: ${actor.name}`} width={48} sizes="48px" className="size-12 object-cover" fallback={fallbackPortrait} /> : fallbackPortrait}
        {row.classIcon ? (
          <span className="absolute left-0 top-0 flex bg-pl shadow-bevel" data-part="class">
            <Icon name={row.classIcon} size={16} color="var(--t2)" title="Класс" />
          </span>
        ) : null}
        {row.level !== undefined ? (
          <span className="absolute right-0 bottom-0 type-num-12 text-gd-hi bg-pl shadow-bevel px-[3px]" title="Уровень" data-part="level">{row.level}</span>
        ) : null}
      </span>
      <span className={`w-full type-h-15 truncate text-center ${row.down ? 'text-t2' : 'text-tx'}`}>{row.name.split(' ')[0]}</span>
      <span className="w-full type-num-12 text-center text-tx" data-part="hp">{hpText(row.hp)}</span>
      <span className={`relative w-full h-2 overflow-hidden bg-hp-track ${flash ? TRACK[flash] : 'shadow-bevel-in'}`}>
        {/* Ширина считается — единственный законный inline-стиль. */}
        <span data-part="fill" className={`block h-full ${FILL[lvl]} [transition:width_160ms_steps(8,end)]`} style={{ width: `${pct}%` }} />
      </span>
      {shown.length > 0 ? (
        <span className="flex items-center justify-center gap-px" data-part="chips">
          {shown.map(c => (
            <span key={c.key} className={`flex ${CHIP_TEXT[c.kind ?? 'debuff']}`}>
              <Icon name={c.icon} size={16} color="currentColor" title={c.level === undefined ? c.label : `${c.label} ${c.level}`} />
            </span>
          ))}
          {more > 0 ? <span className="type-num-12 text-t2" title={`Ещё состояний: ${more}`}>+{more}</span> : null}
        </span>
      ) : null}
    </button>
  );
}

export default PartyPortraits;
