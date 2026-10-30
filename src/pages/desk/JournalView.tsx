// Вид «Журнал» главной зоны (F7): фильтр по нитям и уровням, заметка мастера, напоминания о секретах («открыть
// игрокам?») и записи с каскадами по causeId. Заметка и напоминания — только мастеру. Пропсы — те же имена, что на
// странице: компонент — перенос её разметки, состояние держит страница. Хроника по дням (Д5): записи под заголовком
// дня мира; у мастера в прошлом дне — «Стол на этот день» (реплей лога до конца дня).
import { formatHarptos } from '../../campaign';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { JournalCascade, JournalEntry, JournalReminder, ThreadFilter, toggleIn, type JournalEntryProps } from '../../components';
import {
  SECONDS_PER_DAY, cascadeOf, dayOf, journalScales, type EngineStoreApi, type JournalEntry as JournalRecord, type ScaleLevel, type State, type ThreadSummary,
} from '../../engine';
import { Icon } from '../../icons/Icon';
import { BTN } from './styles';

export interface JournalViewProps {
  mainRef: RefObject<HTMLElement | null>;
  state: State;
  dmView: boolean;
  allEntries: JournalRecord[];
  filtered: JournalRecord[];
  threads: ThreadSummary[];
  filterThreads: string[];
  setFilterThreads: Dispatch<SetStateAction<string[]>>;
  filterScales: ScaleLevel[];
  setFilterScales: Dispatch<SetStateAction<ScaleLevel[]>>;
  noteDraft: string;
  /** Заметка видна игрокам; без отметки — секрет мастера (Q1). */
  noteForPlayers: boolean;
  setNoteForPlayers: (on: boolean) => void;
  setNoteDraft: (text: string) => void;
  addNote: () => void;
  reminders: State['facts'][string][];
  setLaterFacts: Dispatch<SetStateAction<string[]>>;
  entryProps: (entry: JournalRecord) => JournalEntryProps;
  api: ReturnType<EngineStoreApi['getState']>;
  /** Нет — кнопки «Стол на этот день» нет (игрокам и на самом столе прошлого дня). */
  onViewPast?: (endSec: number) => void;
}

export function JournalView({
  mainRef, state, dmView, allEntries, filtered, threads, filterThreads, setFilterThreads, filterScales,
  setFilterScales, noteDraft, setNoteDraft, noteForPlayers, setNoteForPlayers, addNote, reminders, setLaterFacts, entryProps, api, onViewPast,
 }: JournalViewProps) {
  const today = dayOf(state.time.sec);
  const perDay = new Map<number, number>();
  for (const e of filtered) perDay.set(dayOf(e.worldSec), (perDay.get(dayOf(e.worldSec)) ?? 0) + 1);
  return (
    <section aria-label="Журнал сессии" ref={mainRef} className="relative flex-1 min-w-0 min-h-0 flex flex-col">
      <div className="flex flex-col gap-2 px-4 pt-3 pb-2 shadow-[inset_0_-1px_0_var(--lo)]">
        <div className="flex items-start gap-4">
          <ThreadFilter
            threads={threads.map(t => ({ id: t.id, name: t.name, count: t.count }))}
            scales={journalScales(allEntries).map(id => ({ id }))}
            activeThreads={filterThreads}
            activeScales={filterScales}
            onThread={(id, on) => setFilterThreads(t => toggleIn(t, id, on))}
            onScale={(id, on) => setFilterScales(sc => toggleIn(sc, id, on))}
            className="flex-1 min-w-0"
          />
          <span className="type-key uppercase text-t2 whitespace-nowrap" data-part="count">Записей: {filtered.length} из {allEntries.length}</span>
        </div>
        {dmView ? (
        <form
          className="flex items-center gap-2"
          onSubmit={e => { e.preventDefault(); addNote(); }}
        >
          <Icon name="note" size={16} color="var(--src-dm)" title="Заметка мастера" />
          <input
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            aria-label="Заметка"
            placeholder={filterThreads.length > 0 ? `Заметка в нить: ${filterThreads.map(id => state.world.threads[id]?.name ?? id).join(', ')}` : 'Заметка — Enter записывает'}
            className="flex-1 min-w-0 type-body-sm text-tx bg-cd shadow-bevel-in px-2 py-1 placeholder:text-t3 focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]"
          />
          <button
            type="button"
            aria-pressed={noteForPlayers}
            title={noteForPlayers ? 'Заметка будет видна игрокам' : 'Заметка только мастеру; нажать — показать и игрокам'}
            onClick={() => setNoteForPlayers(!noteForPlayers)}
            className={`${BTN} ${noteForPlayers ? 'text-gd-hi' : ''}`}
          >
            Игрокам
          </button>
          <button type="submit" disabled={noteDraft.trim() === ''} title="Записать в журнал · Enter" className={BTN}>Записать</button>
        </form>
        ) : null}
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-4">
        {reminders.map(f => (
          <JournalReminder
            key={f.id}
            text={`${f.text} — открыть игрокам?`}
            onReveal={() => api.reveal(f.id)}
            onLater={() => setLaterFacts(l => [...l, f.id])}
            className="my-2"
          />
        ))}
        <ol aria-label="Записи журнала сессии" className="flex flex-col">
          {filtered.flatMap((entry, i) => {
            const cascade = cascadeOf(entry, allEntries, state);
            const day = dayOf(entry.worldSec);
            const head = i === 0 || dayOf(filtered[i - 1].worldSec) !== day ? (
              <li key={`day-${day}`} data-day={day} className="flex items-center gap-3 pt-3 pb-1 shadow-[inset_0_-1px_0_var(--lo)]">
                <span className="type-h-15 text-tx">{formatHarptos(day * SECONDS_PER_DAY).replace(/,.*$/, '')}</span>
                <span className="type-key text-t2">записей: {perDay.get(day)}</span>
                {onViewPast && day < today ? (
                  <button type="button" onClick={() => onViewPast((day + 1) * SECONDS_PER_DAY - 1)} className={`${BTN} ml-auto`} title="Стол, каким он был в конце этого дня: реплей журнала, только просмотр">Стол на этот день</button>
                ) : null}
              </li>
            ) : null;
            const row = (
              <li key={entry.id} data-undone={entry.undone || undefined} className="flex flex-col">
                <JournalEntry {...entryProps(entry)} />
                {cascade.length > 0 ? <JournalCascade steps={cascade} className="mb-2" /> : null}
              </li>
            );
            return head ? [head, row] : [row];
          })}
        </ol>
      </div>
    </section>
  );
}

export default JournalView;
