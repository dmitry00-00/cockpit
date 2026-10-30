// Тело карточки любой сущности по ссылке (ROADMAP 0.3): строка под именем, паспорт фактами, текст источника
// секциями — дословно, схема окрестности (служение бога), связи кнопками (щелчок открывает карточку связи), длинные
// списки связей (жители места) — свёрнутыми группами с числом, источник с лицензией внизу. Тупой: представление и
// колбэк — пропсами; тексты не переписываются и не переводятся.
import { useState, type ReactNode } from 'react';
import type { EntityFact, EntityGroup, EntityKind, EntityView } from '../entities';
import { Icon } from '../icons/Icon';
import { NeighborhoodGraph } from './NeighborhoodGraph';
import type { EntityType } from './EntityCard';

/** Вид сущности → тип карточки (иконка и цвет грани). */
export function cardTypeOf(kind: EntityKind): EntityType {
  switch (kind) {
    case 'monster': return 'monster';
    case 'item': return 'item';
    case 'plane': case 'sphere': return 'plane';
    case 'body': return 'planet';
    case 'deity': case 'pantheon': return 'deity';
    case 'place': case 'location': return 'location';
    // Держава — грань фракции: она и станет фракцией кампании, когда мастер возьмёт её в игру.
    case 'faction': case 'organization': case 'kingdom': return 'faction';
    case 'actor': case 'person': return 'npc';
    case 'thread': return 'event';
    default: return 'rule';
  }
}

const LINK_BTN = 'px-1.5 py-0.5 type-body-sm text-tx bg-linear-to-b from-pl to-cd shadow-bevel cursor-pointer hover:text-gd-hi focus-visible:shadow-[var(--bevel),var(--glow-gold)]';

/** Свёрнутая группа связей: строка «Жители в 1492 DR 640», по щелчку — список с прокруткой. */
export function GroupList({ group, onOpen }: { group: EntityGroup; onOpen?: EntityViewBodyProps['onOpen'] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1" data-part="group">
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="self-start flex items-baseline gap-1 type-body-sm text-t2 cursor-pointer hover:text-tx focus-visible:shadow-[var(--glow-gold)]">
        <span aria-hidden>{open ? '▾' : '▸'}</span>
        {group.title} <span className="type-num-12">{group.links.length}</span>
      </button>
      {open ? (
        <ul aria-label={group.title} className="flex flex-wrap gap-1 max-h-48 overflow-y-auto">
          {group.links.map(l => (
            <li key={l.ref}>
              {onOpen
                ? <button type="button" onClick={() => onOpen(l.ref)} title={`Открыть: ${l.label}`} className={LINK_BTN}>{l.label}</button>
                : <span className="px-1.5 py-0.5 type-body-sm text-t2 bg-cd shadow-bevel-in">{l.label}</span>}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export interface EntityViewBodyProps {
  view: EntityView;
  /** Открыть связь; без колбэка связи — текстом. */
  onOpen?: (ref: EntityView['ref']) => void;
  /** Что стоит у строки паспорта после значения: у мастера — «Узнать» или отметка, что игроки знают (Д6). */
  factAction?: (fact: EntityFact) => ReactNode;
  className?: string;
}

export function EntityViewBody({ view, onOpen, factAction, className = '' }: EntityViewBodyProps) {
  return (
    <div className={`flex flex-col gap-3 ${className}`} data-ref={view.ref}>
      {view.subtitle ? <p className="type-body-sm text-t2">{view.subtitle}</p> : null}
      {view.missing ? <p className="type-body-sm text-t2">Записи нет ни в справочнике, ни в кампании: ссылка ведёт в пустоту.</p> : null}
      {view.facts.length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 type-body-sm" data-part="facts">
          {view.facts.map(f => (
            <div key={f.label} className="contents">
              <dt className="text-t2">{f.label}</dt>
              <dd className="text-tx break-words [overflow-wrap:anywhere]">{f.value}{factAction?.(f)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {view.sections.map((s, i) => (
        <section key={i} className="flex flex-col gap-0.5" aria-label={s.title}>
          {s.title ? <h4 className="type-body-bold text-tx">{s.title}</h4> : null}
          <p className="type-body-sm text-t2 whitespace-pre-line break-words [overflow-wrap:anywhere]">{s.text}</p>
        </section>
      ))}
      {view.diagram ? <NeighborhoodGraph name={view.name} diagram={view.diagram} onOpen={onOpen} /> : null}
      {view.groups?.map(g => <GroupList key={g.title} group={g} onOpen={onOpen} />)}
      {view.links.length > 0 ? (
        <ul aria-label="Связи" className="flex flex-wrap gap-1" data-part="links">
          {view.links.map(l => (
            <li key={l.ref}>
              {onOpen ? (
                <button
                  type="button"
                  onClick={() => onOpen(l.ref)}
                  title={`Открыть: ${l.label}`}
                  className={LINK_BTN}
                >
                  {l.label}
                </button>
              ) : <span className="px-1.5 py-0.5 type-body-sm text-t2 bg-cd shadow-bevel-in">{l.label}</span>}
            </li>
          ))}
        </ul>
      ) : null}
      <footer className="flex items-start gap-1 type-body-xs text-t2" data-part="source">
        <Icon name="src-canon" size={16} color="var(--src-canon)" title="Источник" />
        <span className="break-words [overflow-wrap:anywhere]">
          {view.source.cite}
          {view.source.license ? ` · ${view.source.license}` : ''}
          {view.source.url ? (
            <>
              {' · '}
              <a href={view.source.url} target="_blank" rel="noreferrer" className="underline text-tx hover:text-gd-hi">статья</a>
            </>
          ) : null}
        </span>
      </footer>
    </div>
  );
}

export default EntityViewBody;
