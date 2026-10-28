// Карточка плана (HANDOFF §3, уровень «план»): вид и мировоззрение, свойства модели Великого колеса по-русски
// (дословное значение вики — в подсказке), слои, город-врата Outlands, книга и ссылка на статью. Тупой компонент:
// план и что открывать ниже по лестнице даёт страница. Кнопка «Боги и карточка» — общая карточка плана по ссылке
// (боги плана по эпохе кампании), если страница дала вход openEntity.
import type { ReactNode } from 'react';
import { useOpenEntity } from '../components/openEntity';
import { ref } from '../entities/ref';
import { ALIGNMENT_LABEL, PLANE_KIND_LABEL, TRAIT_ROWS, alignmentLabel, type GateTown, type Plane } from './planes';

export interface PlaneInfoProps {
  plane: Plane;
  canOpen?: (plane: Plane) => boolean;
  onOpen?: (plane: Plane) => void;
  /** Город-врата Outlands к плану (Великое колесо). */
  gate?: GateTown;
  /** Связи плана в своей модели — строками под свойствами. */
  children?: ReactNode;
  className?: string;
}

export function PlaneInfo({ plane, canOpen, onOpen, gate, children, className = '' }: PlaneInfoProps) {
  const openEntity = useOpenEntity();
  const neutralOnly = plane.alignment.length === 1 && plane.alignment[0] === 'N' && plane.kind !== 'outer' && plane.kind !== 'realm';
  return (
    <div data-part="plane-info" aria-live="polite" className={`flex flex-col gap-1.5 px-3 py-2 bg-pn shadow-bevel max-w-full ${className}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="type-h-17 text-tx">{plane.name}</span>
        <span className="type-body-sm text-t2">{PLANE_KIND_LABEL[plane.kind]}</span>
        {plane.alignment.length > 0 && !neutralOnly ? (
          <span className="type-body-sm text-t2" title={plane.alignment.map(a => `${a} — ${ALIGNMENT_LABEL[a]}`).join(', ')}>{alignmentLabel(plane)}</span>
        ) : plane.alignmentText ? (
          <span className="type-body-sm text-t2" title={`Вики: ${plane.alignmentText.en}`}>{plane.alignmentText.ru}</span>
        ) : null}
        {onOpen && canOpen?.(plane) ? (
          <button type="button" onClick={() => onOpen(plane)} className="type-num-12 uppercase px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer hover:text-tx focus-visible:shadow-[var(--bevel),var(--glow-gold)]">
            {`Спуститься: ${plane.name}`}
          </button>
        ) : null}
        {openEntity ? (
          <button
            type="button"
            title={`Открыть карточку: ${plane.name} — боги плана, свойства, источник`}
            onClick={() => openEntity(ref('plane', plane.id))}
            className="type-num-12 uppercase px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer hover:text-tx focus-visible:shadow-[var(--bevel),var(--glow-gold)]"
          >
            Боги и карточка
          </button>
        ) : null}
      </div>
      {plane.card?.what ? <p className="type-body text-tx">{plane.card.what}</p> : null}
      {plane.card?.summary ? <p className="type-body-sm text-t2">{plane.card.summary}</p> : null}
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 type-body-sm">
        {TRAIT_ROWS.map(([key, label]) => {
          const t = plane[key];
          return t ? (
            <div key={key} className="contents" data-trait={key}>
              <dt className="text-t3">{label}</dt>
              <dd className="text-t2" title={`Вики: ${t.en}`}>{t.ru}</dd>
            </div>
          ) : null;
        })}
        {plane.layers ? (
          <div className="contents" data-trait="layers">
            <dt className="text-t3">Слои</dt>
            <dd className="text-t2">{plane.layers.join(', ')}</dd>
          </div>
        ) : null}
        {plane.location ? (
          <div className="contents">
            <dt className="text-t3">Где</dt>
            <dd className="text-t2">{plane.location}</dd>
          </div>
        ) : null}
        {gate ? (
          <div className="contents" data-trait="gate">
            <dt className="text-t3">Врата в Outlands</dt>
            <dd className="text-t2">
              <a href={gate.url} target="_blank" rel="noreferrer" className="underline hover:text-tx">{gate.town}</a>
            </dd>
          </div>
        ) : null}
      </dl>
      {children}
      <span className="flex flex-wrap gap-3 type-body-sm text-t3">
        <a href={plane.url} target="_blank" rel="noreferrer" title="Свойства — поля карточки плана, CC BY-SA 3.0" className="underline hover:text-tx">
          Forgotten Realms Wiki · CC BY-SA
        </a>
        {plane.refs[0] ? <span title={plane.refs.join('; ')}>{plane.refs[0]}</span> : null}
      </span>
    </div>
  );
}

export default PlaneInfo;
