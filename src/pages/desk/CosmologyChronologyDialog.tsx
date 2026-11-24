// Справочное окно космологии: только публичные канонические записи; не получает время, журнал или команды записи.
import { useEffect, useState } from 'react';
import { Dialog } from 'radix-ui';
import { GREAT_WHEEL, WORLD_TREE } from '../../cosmos/planes';
import { POST_SPELLPLAGUE_FR4E } from '../../cosmos/postSpellplagueFr4e.data';
import type { CosmologyViewId } from '../../cosmos/postSpellplagueFr4e.types';
import { loadChronoIndex, loadEvents, canonEraOf, drLabel, type ChronoEvent, type ChronoIndex } from '../../world/chronology';
import { Icon } from '../../icons/Icon';
import { BTN, BTN_TOGGLE } from './styles';

const EVENT_IDS = new Set(['y1385-4', 'y1385-29', 'y1395-3', 'y1482-2', 'y1487-12', 'y1487-13']);
const EVENT_RANGES = [
  { from: 1385, to: 1385 },
  { from: 1395, to: 1395 },
  { from: 1482, to: 1487 },
] as const;

function loadCosmologyEvents(): Promise<{ index: ChronoIndex; events: ChronoEvent[] }> {
  return Promise.all([
    loadChronoIndex(),
    Promise.all(EVENT_RANGES.map(range => loadEvents(range.from, range.to))),
  ]).then(([index, parts]) => ({
    index,
    events: parts.flat().filter(event => EVENT_IDS.has(event.id)).sort((a, b) => a.year - b.year || a.id.localeCompare(b.id)),
  }));
}

export interface CosmologyChronologyDialogProps {
  model: CosmologyViewId;
  portalContainer: HTMLElement | null;
}

export function CosmologyChronologyDialog({ model, portalContainer }: CosmologyChronologyDialogProps) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<ChronoIndex | null>(null);
  const [events, setEvents] = useState<readonly ChronoEvent[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!open || index || loadFailed) return;
    let live = true;
    void loadCosmologyEvents().then(result => {
      if (!live) return;
      setIndex(result.index);
      setEvents(result.events);
    }).catch(() => {
      if (live) setLoadFailed(true);
    });
    return () => { live = false; };
  }, [open, index, loadFailed]);

  const current = model === 'tree'
    ? {
      name: 'Великое Древо',
      snapshot: 'Срез модели: 1372 DR',
      planes: WORLD_TREE.planes.length,
      links: WORLD_TREE.links.length,
      note: WORLD_TREE.note,
      source: 'World Tree cosmology · CC BY-SA 3.0',
      href: 'https://forgottenrealms.fandom.com/wiki/World_Tree_cosmology',
    }
    : model === 'axis'
    ? {
      name: POST_SPELLPLAGUE_FR4E.title,
      snapshot: POST_SPELLPLAGUE_FR4E.sourceSlice,
      planes: POST_SPELLPLAGUE_FR4E.nodes.length,
      links: POST_SPELLPLAGUE_FR4E.links.length,
      note: `${POST_SPELLPLAGUE_FR4E.contextNote} Forgotten Realms Campaign Guide описывает схему, но не называет её World Axis.`,
      source: POST_SPELLPLAGUE_FR4E.source,
      href: POST_SPELLPLAGUE_FR4E.sourceUrl,
    }
    : {
      name: 'Великое Колесо',
      snapshot: 'В данных нет подтверждённой даты возникновения этой модели',
      planes: GREAT_WHEEL.planes.length,
      links: GREAT_WHEEL.links.length,
      note: GREAT_WHEEL.note,
      source: 'Great Wheel cosmology · CC BY-SA 3.0',
      href: 'https://forgottenrealms.fandom.com/wiki/Great_Wheel_cosmology',
    };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className={BTN_TOGGLE} title="Подробные сведения и хронология космологии" aria-label="Сведения и хронология космологии">
          <Icon name="skill-history" size={16} color="var(--t2)" title="Хронология" />
          <span>История</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal container={portalContainer ?? undefined}>
        <Dialog.Overlay className="absolute inset-0 z-20 bg-wl opacity-(--op-scrim)" />
        <Dialog.Content
          aria-describedby="cosmology-chronology-description"
          onEscapeKeyDown={event => event.stopPropagation()}
          className="cosmology-chronology-dialog absolute inset-y-3 left-3 right-16 z-30 flex min-h-0 flex-col bg-pn p-4 text-tx shadow-frame outline-none max-[700px]:right-3 sm:inset-y-6 sm:left-6 sm:p-6"
        >
          <header className="flex flex-wrap items-center gap-3 border-b border-cd pb-3">
            <Dialog.Title className="type-h-20 text-gd">Космология · сведения и хронология</Dialog.Title>
            <Dialog.Close asChild><button type="button" className={`${BTN} ml-auto`}>Закрыть</button></Dialog.Close>
          </header>
          <Dialog.Description id="cosmology-chronology-description" className="sr-only">
            Справочные данные о выбранной модели космологии и подтверждённые события хронологии. Просмотр не меняет часы, карту или журнал.
          </Dialog.Description>
          <div className="min-h-0 flex-1 overflow-auto py-3" data-part="cosmology-chronology">
            <section aria-label={`Сведения о модели: ${current.name}`} className="mb-4 bg-cd p-3 shadow-bevel">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="type-h-17 text-tx">{current.name}</h2>
                <span className="type-body-sm text-t2">{current.snapshot}</span>
              </div>
              <p className="mt-2 type-body text-tx">{current.note}</p>
              <p className="mt-2 type-body-sm text-t2">В наборе данных: {current.planes} планов; {current.links} явно описанных связей.</p>
              <a href={current.href} target="_blank" rel="noreferrer" className="mt-2 inline-block type-body-sm text-t3 underline hover:text-tx">{current.source}</a>
            </section>

            <section aria-label="Хронология космологии">
              <h2 className="type-h-17 text-tx">Подтверждённые даты</h2>
              <p className="mb-3 type-body-sm text-t2">Это общие вехи планарной истории для справки при обеих схемах, а не даты возникновения Великого Колеса или Великого Древа. Метка 1372 DR описывает источник о Великом Древе, а не дату его возникновения.</p>
              <ol className="flex flex-col gap-2">
                <li data-entry="world-tree-snapshot" className="bg-wl p-3 shadow-bevel-in">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <time className="type-num-15 text-gd" dateTime="1372">1372 DR</time>
                    <span className="type-body-sm text-t2">Срез модели · Великое Древо</span>
                  </div>
                  <p className="mt-1 type-body-sm text-tx">Датировка взята из описания модели World Tree в данных сеттинга; она не утверждает, что модель или само Древо возникли в этом году.</p>
                  <p className="mt-1 type-body-xs text-t3">Player’s Guide to Faerûn, с. 140–161; Forgotten Realms Campaign Setting 3e, с. 258.</p>
                </li>
                {events === null && !loadFailed ? <li role="status" className="p-3 type-body-sm text-t2">Загружаю события хронологии…</li> : null}
                {loadFailed ? <li role="alert" className="p-3 type-body-sm text-t2">Не удалось загрузить хронологию. Сведения о модели доступны выше.</li> : null}
                {(events ?? []).map(event => {
                  const era = index ? canonEraOf(index.eras, event.year) : undefined;
                  const when = event.when ? `${event.when}, ${drLabel(event.year)}` : drLabel(event.year);
                  return (
                    <li key={event.id} data-event-id={event.id} className="bg-wl p-3 shadow-bevel-in">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <time className="type-num-15 text-gd" dateTime={String(event.year)}>{when}</time>
                        {era ? <span className="type-body-xs text-t3">{era.name}</span> : null}
                      </div>
                      <p className="mt-1 type-body-sm text-tx">{event.text}</p>
                      {event.cites?.length ? <p className="mt-2 type-body-xs text-t3">Источники: {event.cites.join(' · ')}</p> : null}
                    </li>
                  );
                })}
              </ol>
            </section>

            <p className="mt-4 type-body-xs text-t3" data-part="cosmology-lens-note">
              Линза 3e/4e/5e выбирает представление. Для FR 4e доступна отдельная схема post-Spellplague · Axis-compatible; 1479 DR — срез источника, а не заявленный период принятия модели. Выбор не является событием хронологии и не утверждает, что существовала только одна модель.
            </p>
            <p className="mt-2 type-body-xs text-t3">События хронологии Forgotten Realms Wiki · CC BY-SA 3.0.</p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default CosmologyChronologyDialog;
