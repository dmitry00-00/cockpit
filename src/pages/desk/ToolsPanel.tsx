// Панель справа (HANDOFF §4, F9): у мастера — отмена и повтор, «Новая сессия», файл сессии, тост, последний
// бросок, нити, напоминания и входящие, хвост журнала; у игроков — хроника похода, бросок и журнал без секретов.
// Свёрнутая — полоса иконок, раскрытая из полосы — оверлей. Пропсы — те же имена, что на странице: компонент —
// перенос её разметки, состояние держит страница.
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { holyList, inDays, nextFestival, type NextHolyDay } from '../../campaign';
import {
  IconRail, JournalEntry, JournalReminder, RollModal, ThreadCard, WorldDelta, lastRollOf, rollHistoryOf, toggleIn, worldDeltaProps,
  type IconRailItem, type JournalEntryProps,
} from '../../components';
import {
  causeChain, type Command, type EngineStoreApi, type JournalEntry as JournalRecord, type State, type ThreadSummary,
} from '../../engine';
import { Icon, type IconName } from '../../icons/Icon';
import { CONDITIONS } from '../../rules/srd';
import { threadCardRows, type ConcentrationReminder, type ConditionReminder, type OpenRail } from './helpers';
import { BTN, HEAD, PANEL_OVERLAY_RIGHT } from './styles';

export interface ToolsPanelProps {
  state: State;
  events: Parameters<typeof rollHistoryOf>[0];
  api: ReturnType<EngineStoreApi['getState']>;
  dmView: boolean;
  combat: boolean;
  shownView: 'desk' | 'time' | 'journal';
  canUndo: boolean;
  canRedo: boolean;
  resetArmed: boolean;
  setResetArmed: (armed: boolean) => void;
  onReset: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  note: string | null;
  setNote: (note: string | null) => void;
  toast: ReturnType<EngineStoreApi['getState']>['toast'];
  shownRoll: ReturnType<typeof lastRollOf> | null;
  setClosedRollId: (id: string | null) => void;
  hiddenRolls: boolean;
  setHiddenRolls: Dispatch<SetStateAction<boolean>>;
  openThreads: State['world']['threads'][string][];
  threads: ThreadSummary[];
  filterThreads: string[];
  setFilterThreads: Dispatch<SetStateAction<string[]>>;
  concentrationReminders: ConcentrationReminder[];
  conditionReminders: ConditionReminder[];
  setLaterConcentration: Dispatch<SetStateAction<string[]>>;
  onCommand: (cmd: Command) => void;
  pending: State['deltas'][string][];
  festival: ReturnType<typeof nextFestival>;
  /** Ближайший годовой святой день (E4): бога партии, если он есть на листах (E8), иначе богов Фаэруна. */
  holy?: NextHolyDay;
  journal: JournalRecord[];
  allEntries: JournalRecord[];
  entryProps: (entry: JournalRecord) => JournalEntryProps;
  railTools: boolean;
  toolsPin: ReactNode;
  toolsRailItems: IconRailItem[];
  openRail: OpenRail;
  setOpenRail: Dispatch<SetStateAction<OpenRail>>;
}

export function ToolsPanel({
  state, events, api, dmView, combat, shownView, canUndo, canRedo, resetArmed, setResetArmed, onReset,
  onExport, onImport, note, setNote, toast, shownRoll, setClosedRollId, hiddenRolls, setHiddenRolls,
  openThreads, threads, filterThreads, setFilterThreads, concentrationReminders, conditionReminders,
  setLaterConcentration, onCommand, pending, festival, holy, journal, allEntries, entryProps, railTools, toolsPin,
  toolsRailItems, openRail, setOpenRail,
 }: ToolsPanelProps) {
  return (
    <>
      {railTools ? (
        <IconRail
          side="right"
          label={dmView ? 'Инструменты' : 'Хроника'}
          items={toolsRailItems}
          active={openRail?.side === 'tools' ? openRail.item : undefined}
          onOpen={item => setOpenRail(o => (o?.side === 'tools' ? null : { side: 'tools', item }))}
          className="order-last"
        />
      ) : null}
      {!railTools || openRail?.side === 'tools' ? (
      <aside aria-label={dmView ? 'Журнал и отмена' : 'Хроника похода'} data-overlay={railTools || undefined} className={railTools ? PANEL_OVERLAY_RIGHT : 'w-rail-tools flex-none flex flex-col bg-pn shadow-bevel min-h-0'}>
        {dmView ? (
        <>
        <div className={HEAD}>
          <Icon name="reroll" size={16} color="var(--t2)" title="Отмена и повтор" />
          <span>Действия</span>
          {toolsPin}
        </div>
        <div className="flex items-center gap-1 p-2">
          <button type="button" title="Отменить последнее действие · Ctrl+Z" disabled={!canUndo} onClick={() => api.undo()} className={BTN}>Отменить</button>
          <button type="button" title="Повторить отменённое · Ctrl+Shift+Z" disabled={!canRedo} onClick={() => api.redo()} className={BTN}>Повторить</button>
          {resetArmed ? null : (
            <button type="button" title="Новая сессия: стереть журнал и собрать стол из сида заново — спросит подтверждение" onClick={() => setResetArmed(true)} className={`ml-auto ${BTN}`}>Новая сессия</button>
          )}
        </div>
        {/* Файл сессии — страховка живой игры: журнал целиком, тем же конвертом, что в хранилище браузера. */}
        <div className="flex items-center gap-1 px-2 pb-2">
          <button type="button" title="Сохранить журнал сессии файлом (dm-cockpit-<дата>.json)" onClick={onExport} className={BTN}>Сохранить</button>
          <label title="Открыть журнал сессии из файла: стол соберётся из него, битый файл сессию не тронет" className={`${BTN} inline-flex items-center`}>
            Открыть…
            <input
              type="file"
              accept="application/json,.json"
              aria-label="Файл сессии"
              onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }}
              className="sr-only"
            />
          </label>
        </div>
        {resetArmed ? (
          <div role="alertdialog" aria-label="Новая сессия" className="flex flex-col gap-2 mx-2 mb-2 px-2 py-2 bg-pl shadow-plate type-body-sm text-tx">
            <span>Стереть журнал сессии и начать заново? Отменить это будет нельзя.</span>
            <div className="flex items-center gap-1">
              <button type="button" title="Стереть журнал: стол из сида" onClick={onReset} className={`${BTN} text-fx-damage-hi`}>Стереть</button>
              <button type="button" title="Оставить сессию как есть" onClick={() => setResetArmed(false)} className={BTN}>Оставить</button>
            </div>
          </div>
        ) : null}
        {/* Живой регион существует всегда: скринридер объявляет изменения внутри него, а не его появление. */}
        <div role="status" aria-live="polite" className={toast ? 'flex items-start gap-2 mx-2 mb-2 px-2 py-1 bg-pl shadow-plate type-body-sm text-tx' : 'sr-only'}>
          {toast ? (
            <>
              <span className="flex-1 min-w-0">{toast}</span>
              <button type="button" aria-label="Скрыть тост" title="Скрыть" onClick={() => api.dismissToast()} className="flex-none text-t2 hover:text-tx">
                <Icon name="cross" size={16} color="currentColor" title="Скрыть" />
              </button>
            </>
          ) : null}
        </div>
        {note ? (
          <div role="note" className="flex items-start gap-2 mx-2 mb-2 px-2 py-1 bg-cd shadow-bevel type-body-sm text-t2">
            <Icon name="note" size={16} color="var(--src-dm)" title="Заметка мастера" className="mt-0.5" />
            <span className="flex-1 min-w-0">{note}</span>
            <button type="button" aria-label="Скрыть заметку" title="Скрыть" onClick={() => setNote(null)} className="flex-none text-t2 hover:text-tx">
              <Icon name="cross" size={16} color="currentColor" title="Скрыть" />
            </button>
          </div>
        ) : null}
        </>
        ) : (
          // Стол игроков (F8): вместо действий мастера — открытые задачи партии, без сроков и секретов.
          <>
            <div className={HEAD}>
              <Icon name="threads" size={16} color="var(--t2)" title="Хроника похода" />
              <span>Хроника похода</span>
              {toolsPin}
            </div>
            {openThreads.length > 0 ? (
              <p className="px-2 py-2 type-body-sm text-tx">
                Открытые задачи: {openThreads.map(t => t.name).join('; ')}.
              </p>
            ) : null}
          </>
        )}
        {shownRoll ? (
          // Последний бросок из лога (DICE_ROLLED); закрытый крестиком не возвращается, следующий бросок — новая карточка.
          // На столе игроков — без переключателя скрытости, переброса и истории со скрытыми бросками.
          <RollModal
            roll={shownRoll.roll}
            history={rollHistoryOf(events).filter(r => r.id !== shownRoll.id && (dmView || !r.hidden))}
            hidden={hiddenRolls}
            onHiddenChange={dmView ? setHiddenRolls : undefined}
            onReroll={dmView ? () => api.rollDice(shownRoll.roll.formula, { label: shownRoll.roll.label, hidden: hiddenRolls }) : undefined}
            onClose={() => setClosedRollId(shownRoll.id)}
            className="mx-auto mb-2"
          />
        ) : null}
        {shownView === 'journal' ? (
          <>
            <div className={HEAD}>
              <Icon name="threads" size={16} color="var(--t2)" title="Нити" />
              <span>Нити</span>
              <span className="ml-auto type-key text-t2" title="Открытых нитей">{threads.length}</span>
            </div>
            <div className="min-h-0 overflow-auto flex flex-col gap-2 p-2">
              {threads.map(t => (
                <ThreadCard
                  key={t.id}
                  id={t.id}
                  name={t.name}
                  count={t.count}
                  rows={threadCardRows(t, dmView)}
                  selected={filterThreads.includes(t.id)}
                  onSelect={id => setFilterThreads(f => toggleIn(f, id, !f.includes(id)))}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            {concentrationReminders.length > 0 || conditionReminders.length > 0 ? (
              // Система предлагает, мастер решает: снять — событие, «Позже» — вид. Пустого списка нет вовсе.
              <div aria-label="Напоминания" role="list" className="flex flex-col px-2 pt-1">
                {conditionReminders.map(r => (
                  <div key={r.key} role="listitem">
                    <JournalReminder
                      inset={false}
                      icon={{ name: `cond-${r.conditionId}` as IconName, color: 'var(--fx-damage-hi)', title: 'Срок вышел' }}
                      action={{ label: 'Снять', title: `Снять состояние «${CONDITIONS[r.conditionId].label}»: срок вышел` }}
                      text={r.text}
                      onReveal={() => onCommand({ type: 'CONDITION_REMOVED', payload: { targetId: r.actorId, conditionId: r.conditionId } })}
                      onLater={() => setLaterConcentration(l => [...l, r.key])}
                    />
                  </div>
                ))}
                {concentrationReminders.map(r => (
                  <div key={r.key} role="listitem">
                    <JournalReminder
                      inset={false}
                      icon={{ name: r.reason === 'unconscious' ? 'cond-unconscious' : 'cond-concentration', color: 'var(--fx-damage-hi)', title: r.reason === 'unconscious' ? 'Без сознания' : 'Срок вышел' }}
                      action={{ label: 'Снять', title: r.reason === 'unconscious' ? 'Снять концентрацию: без сознания' : 'Снять концентрацию: срок вышел' }}
                      text={r.text}
                      onReveal={() => onCommand({ type: 'CONCENTRATION_ENDED', payload: { actorId: r.actorId, reason: r.reason } })}
                      onLater={() => setLaterConcentration(l => [...l, r.key])}
                    />
                  </div>
                ))}
              </div>
            ) : null}
            {dmView && pending.length > 0 ? (
              // Входящие — сверху панели инструментов (HANDOFF §4): пока мастер не решил, мир не менялся.
              <>
                <div className={HEAD}>
                  <Icon name="inbox" size={16} color="var(--src-sim)" title="Предложения мира" />
                  <span>Входящие</span>
                  <span className="ml-auto type-key text-t2" title="Ждут решения">{pending.length}</span>
                </div>
                <div aria-label="Входящие" role="list" className="min-h-0 max-h-[45%] overflow-auto flex flex-col gap-2 p-2">
                  {pending.map(d => (
                    <div key={d.id} role="listitem">
                      <WorldDelta
                        {...worldDeltaProps(d)}
                        chain={causeChain(d.causeId, allEntries, state, [d.id]).map(c => c.label)}
                        onAccept={() => api.accept(d.id)}
                        onReject={() => api.reject(d.id)}
                        onReroll={(d.variants?.length ?? 0) > 1 ? () => api.reroll(d.id) : undefined}
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : dmView ? (
              // Единственная секция, что показывается пустой (CLAUDE.md): «Мир спокоен», ближайший праздник и святой
              // день богов Фаэруна — луна уже в полосе часов, второй раз не печатается.
              <>
                <div className={HEAD}>
                  <Icon name="inbox" size={16} color="var(--t2)" title="Предложения мира" />
                  <span>Входящие</span>
                </div>
                <p data-part="calm" className="px-2 py-2 type-body-sm text-t2">
                  Мир спокоен. Ближайший праздник — <span className="text-tx">{festival.festival}</span> {inDays(festival.days)}
                  {holy && holy.sec === festival.sec ? <>; {holy.party ? 'святой день бога партии' : 'святые дни'} — <span className="text-tx">{holyList(holy.holy)}</span>.</>
                    : holy ? <>. Святой день{holy.party ? ' бога партии' : ''} {inDays(holy.days)} — <span className="text-tx">{holyList(holy.holy)}</span>.</> : '.'}
                </p>
              </>
            ) : null}
            <div className={HEAD}>
              <Icon name="journal" size={16} color="var(--t2)" title="Журнал" />
              <span>{combat ? 'Журнал боя' : 'Журнал'}</span>
              <span className="ml-auto type-key text-t2" title="Показаны последние записи">последние {journal.length}</span>
            </div>
            <ol aria-label="Записи журнала" className="min-h-0 overflow-auto flex flex-col px-2">
              {journal.map(e => (
                <li key={e.id} data-undone={e.undone || undefined} className="flex flex-col">
                  <JournalEntry {...entryProps(e)} />
                </li>
              ))}
            </ol>
          </>
        )}
      </aside>
      ) : null}
    </>
  );
}

export default ToolsPanel;
