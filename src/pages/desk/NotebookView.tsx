// Вид «Тетрадь» главной зоны (Д6): что партия узнала о мире — по сущностям, последняя узнанная сверху; у строки —
// значение снимком из лога, дата мира и кто узнал, проверкой или волей мастера. Один вид у мастера и игроков: в
// тетради нет секретов, только открытое. Пустой тетради нет — вид не показывается вовсе.
import type { RefObject } from 'react';
import { knownLine, notebookOf } from '../../campaign';
import type { EntityRef } from '../../entities';
import type { State } from '../../engine';
import { HEAD } from './styles';

export interface NotebookViewProps {
  mainRef: RefObject<HTMLElement | null>;
  state: State;
  onOpen: (ref: EntityRef) => void;
}

export function NotebookView({ mainRef, state, onOpen }: NotebookViewProps) {
  const book = notebookOf(state);
  return (
    <section aria-label="Тетрадь партии" ref={mainRef} className="relative flex-1 min-w-0 min-h-0 flex flex-col gap-3 p-4 overflow-auto">
      {book.map(e => (
        <article key={e.ref} aria-label={`Тетрадь: ${e.name}`} data-ref={e.ref} className="flex flex-col bg-pn shadow-bevel">
          <div className={HEAD}>
            <button type="button" onClick={() => onOpen(e.ref)} title={`Открыть карточку: ${e.name}`} className="normal-case text-tx underline decoration-t3 underline-offset-2 cursor-pointer hover:text-gd-hi focus-visible:shadow-[var(--glow-gold)]">{e.name}</button>
            <span className="type-key text-t2 normal-case">узнано: {e.facts.length}</span>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 p-3 type-body-sm">
            {e.facts.map(f => (
              <div key={f.label} className="contents">
                <dt className="text-t2">{f.label}</dt>
                <dd className="flex flex-col">
                  <span className="text-tx break-words [overflow-wrap:anywhere]">{f.value}</span>
                  <span className="type-key text-t2">{knownLine(f, state)}</span>
                </dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </section>
  );
}

export default NotebookView;
