import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { EntityRef, EntityView } from '../../entities';
import { Icon } from '../../icons/Icon';
import { fold } from '../../map/gazetteer';
import { loadPlanetosChronology, planetosBookLabel, type PlanetosChronology } from '../../world/planetosChronology';
import { BTN, HEAD } from './styles';

interface PlanetosChronologyViewProps {
  mainRef: RefObject<HTMLElement | null>;
  onOpenEntity: (ref: EntityRef) => void;
}

const eventText = (event: EntityView) => [
  event.name,
  event.nameRu ?? '',
  event.subtitle ?? '',
  ...event.facts.map(fact => `${fact.label} ${fact.value}`),
  ...event.sections.map(section => section.text),
  ...event.links.map(link => link.label),
].join(' ');

const explicitDate = (event: EntityView) => {
  const fact = event.facts.find(item => /^(?:in-world )?date$|^дата$/i.test(item.label.trim()));
  if (!fact || /не установлена|неизвестн|not established|unknown/i.test(fact.value)) return undefined;
  return fact.value;
};

export function PlanetosChronologyView({ mainRef, onOpenEntity }: PlanetosChronologyViewProps) {
  const [data, setData] = useState<PlanetosChronology | null>(null);
  const [query, setQuery] = useState('');
  const [bookId, setBookId] = useState('all');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const q = fold(query.trim());

  useEffect(() => {
    let live = true;
    setData(null);
    setError('');
    void loadPlanetosChronology().then(result => {
      if (live) setData(result);
    }).catch(reason => {
      if (live) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => { live = false; };
  }, [retry]);

  const matches = (event: EntityView) => !q || fold(eventText(event)).includes(q);
  const visibleChapters = useMemo(() => (data?.chapters ?? [])
    .filter(chapter => bookId === 'all' || chapter.bookId === bookId)
    .map(chapter => ({ ...chapter, events: chapter.events.filter(matches) }))
    .filter(chapter => chapter.events.length > 0), [data, bookId, q]);
  const books = useMemo(() => [...new Set((data?.chapters ?? []).map(chapter => chapter.bookId))], [data]);
  const visibleUnlocated = (data?.unlocated ?? []).filter(matches);
  const visibleCount = visibleChapters.reduce((sum, chapter) => sum + chapter.events.length, 0) + visibleUnlocated.length;

  const eventButton = (event: EntityView) => {
    const date = explicitDate(event);
    return (
      <button
        key={event.ref}
        type="button"
        onClick={() => onOpenEntity(event.ref)}
        className="flex w-full min-w-0 items-start gap-2 border-b border-lo px-3 py-2 text-left text-tx last:border-b-0 hover:bg-pl focus-visible:shadow-[var(--glow-gold)]"
        data-event-ref={event.ref}
      >
        <Icon name="skill-history" size={16} color="var(--ent-event)" title="Событие" className="mt-0.5 flex-none" />
        <span className="min-w-0 flex-1">
          <span className="block type-body-sm">{event.nameRu ?? event.name}</span>
          {event.subtitle ? <span className="block type-body-xs text-t2">{event.subtitle}</span> : null}
        </span>
        {date ? <span className="max-w-52 type-key text-t2">Дата из карточки: {date}</span> : null}
      </button>
    );
  };

  return (
    <section aria-label="Хроника" ref={mainRef} className="relative flex-1 min-w-0 min-h-0 flex flex-col gap-3 overflow-auto p-4">
      <header className="flex flex-wrap items-center gap-2" data-part="planetos-chronology-header">
        <Icon name="skill-history" size={16} color="var(--ent-event)" title="Хроника" />
        <h1 className="type-h-17 text-tx">Песнь льда и пламени · хронология записей</h1>
        {data ? <span className="type-key text-t2">привязано к главам {data.locatedCount} из {data.totalCount}</span> : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            type="search"
            aria-label="Поиск по хронологии ПЛиО"
            placeholder="Событие, персонаж, место…"
            value={query}
            onChange={event => setQuery(event.target.value)}
            className="h-7 w-60 max-w-full px-2 type-body-sm text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]"
          />
          <select aria-label="Книга" value={bookId} onChange={event => setBookId(event.target.value)} className="h-7 px-2 type-body-sm text-tx bg-wl shadow-bevel-in">
            <option value="all">Все книги</option>
            {books.map(id => <option key={id} value={id}>{planetosBookLabel(id)}</option>)}
          </select>
        </div>
      </header>

      <p className="max-w-5xl type-body-sm text-t2">
        Главы — проверяемые книжные локаторы записей, а не даты событий и не утверждение, что события разных POV идут строго одно за другим.
        Дата показывается только если она прямо указана в карточке. Номера глав не используются для расчёта времени мира.
      </p>

      {error ? (
        <div role="alert" className="flex items-center gap-2 bg-pn p-3 type-body-sm text-danger">
          Не удалось загрузить книжную хронологию: {error}
          <button type="button" className={BTN} onClick={() => setRetry(value => value + 1)}>Повторить</button>
        </div>
      ) : !data ? (
        <p className="type-body-sm text-t2">Собираю локаторы глав…</p>
      ) : (
        <>
          {data.chapters.length === 0 ? <p className="type-body-sm text-t2">Для событий пока нет привязанных глав.</p> : null}
          <div className="flex flex-col gap-3" data-part="planetos-chronology-list">
            {visibleChapters.map(chapter => (
              <section key={`${chapter.bookId}:${chapter.chapterNo}`} aria-label={`${planetosBookLabel(chapter.bookId)}, ${chapter.chapterNo === 0 ? 'пролог' : `глава ${chapter.chapterNo}`}`} className="bg-pn shadow-bevel">
                <div className={HEAD}>
                  <span className="truncate">{planetosBookLabel(chapter.bookId)}</span>
                  <span>·</span>
                  <span>{chapter.chapterNo === 0 ? 'Пролог' : `Глава ${chapter.chapterNo}`}</span>
                  <span className="ml-auto type-key text-t2 normal-case">{chapter.events.length} {chapter.events.length === 1 ? 'запись' : 'записей'}</span>
                </div>
                <div>{chapter.events.map(eventButton)}</div>
              </section>
            ))}
          </div>

          {visibleUnlocated.length ? (
            <section aria-label="Записи без привязки к главе" className="bg-pn shadow-bevel">
              <div className={HEAD}>
                <span>Без привязки к главе</span>
                <span className="ml-auto type-key text-t2 normal-case">{visibleUnlocated.length} {visibleUnlocated.length === 1 ? 'запись' : 'записей'}</span>
              </div>
              {visibleUnlocated.map(eventButton)}
            </section>
          ) : null}

          <p className="type-key text-t2" aria-live="polite">Показано записей: {visibleCount}. Нажатие открывает карточку события.</p>
        </>
      )}
    </section>
  );
}
