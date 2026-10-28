// Тело карточки любой сущности по ссылке (ROADMAP 0.3): строка под именем, паспорт фактами, текст источника
// секциями — дословно, связи кнопками (щелчок открывает карточку связи), источник с лицензией внизу. Тупой:
// представление и колбэк — пропсами; тексты не переписываются и не переводятся.
import type { EntityKind, EntityView } from '../entities';
import { Icon } from '../icons/Icon';
import type { EntityType } from './EntityCard';

/** Вид сущности → тип карточки (иконка и цвет грани). */
export function cardTypeOf(kind: EntityKind): EntityType {
  switch (kind) {
    case 'monster': return 'monster';
    case 'item': return 'item';
    case 'plane': case 'sphere': return 'plane';
    case 'body': return 'planet';
    case 'place': case 'location': return 'location';
    case 'faction': return 'faction';
    case 'actor': return 'npc';
    case 'thread': return 'event';
    default: return 'rule';
  }
}

export interface EntityViewBodyProps {
  view: EntityView;
  /** Открыть связь; без колбэка связи — текстом. */
  onOpen?: (ref: EntityView['ref']) => void;
  className?: string;
}

export function EntityViewBody({ view, onOpen, className = '' }: EntityViewBodyProps) {
  return (
    <div className={`flex flex-col gap-3 ${className}`} data-ref={view.ref}>
      {view.subtitle ? <p className="type-body-sm text-t2">{view.subtitle}</p> : null}
      {view.missing ? <p className="type-body-sm text-t2">Записи нет ни в справочнике, ни в кампании: ссылка ведёт в пустоту.</p> : null}
      {view.facts.length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 type-body-sm" data-part="facts">
          {view.facts.map(f => (
            <div key={f.label} className="contents">
              <dt className="text-t2">{f.label}</dt>
              <dd className="text-tx break-words [overflow-wrap:anywhere]">{f.value}</dd>
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
      {view.links.length > 0 ? (
        <ul aria-label="Связи" className="flex flex-wrap gap-1" data-part="links">
          {view.links.map(l => (
            <li key={l.ref}>
              {onOpen ? (
                <button
                  type="button"
                  onClick={() => onOpen(l.ref)}
                  title={`Открыть: ${l.label}`}
                  className="px-1.5 py-0.5 type-body-sm text-tx bg-linear-to-b from-pl to-cd shadow-bevel cursor-pointer hover:text-gd-hi focus-visible:shadow-[var(--bevel),var(--glow-gold)]"
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
