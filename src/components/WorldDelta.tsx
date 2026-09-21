// Предложение мира (F1/F6, столбец входящих): плита с бирюзовой гранью src-sim — единственный бирюзовый
// в системе, он же метка «симуляция ждёт решения». Шапка — уровень масштаба и метка симуляции, предмет,
// «было → станет», причина с раскрываемой цепочкой, кнопки. Пока мастер не решил, в мире стоит `was`,
// а `now` живёт только здесь (CLAUDE.md): «стало» — золото gd-hi моноширинным, «было» — t3 зачёркнутое,
// t3 на карточке cd даёт 4.7:1 и в usage токена назван прямо для этого. Компонент ничего не хранит,
// кроме раскрытия цепочки причин — это вид, не мир; принять/отклонить/переброс/править — колбэки.
// Конфликт с каноном меняет пару кнопок на «Принять изменение / Оставить канон»: выбор тот же, слова
// точнее. «Переброс» есть только когда есть куда перебрасывать: колбэк передан и вариантов больше одного.
// Кнопка «Править» — только при колбэке: тултип без действия — обман. Строки классов полные.

import { useState } from 'react';
import type { ScaleLevel, WorldDelta as WorldDeltaState } from '../engine';
import { Icon, type IconName } from '../icons/Icon';
import { SCALE_LABELS } from './ThreadFilter';

export interface WorldDeltaProps {
  id: string;
  /** Шапка: иконка scale-<id> и подпись SCALE_LABELS. */
  scale: ScaleLevel;
  subject: string;
  was: string;
  now: string;
  cause: string;
  /** Цепочка причин: кнопка «▸ cause» раскрывает список «→ шаг». Без цепочки причина — просто текст. */
  chain?: readonly string[];
  /** Конфликт с каноном: строка «Канон: …» цветом st-conflict и пара «Принять изменение / Оставить канон». */
  conflict?: string;
  /** Всего вариантов; «Переброс» только при onReroll и variants > 1. */
  variants?: number;
  /** «Принять» — золотая кнопка, title «Принять · Enter»; клавиша живёт на странице. */
  onAccept: () => void;
  onReject: () => void;
  onReroll?: () => void;
  onEdit?: () => void;
  className?: string;
}

/** Пропсы карточки из дельты состояния; колбэки, цепочку и конфликт добавляет страница. */
export function worldDeltaProps(delta: WorldDeltaState): Pick<WorldDeltaProps, 'id' | 'scale' | 'subject' | 'was' | 'now' | 'cause' | 'variants'> {
  return {
    id: delta.id,
    scale: delta.scale,
    subject: delta.subject,
    was: delta.was,
    now: delta.now,
    cause: delta.cause,
    variants: delta.variants?.length,
  };
}

/* Кнопки — как BTN на столе: строка целиком. Золотая — то же с text-gd-hi. */
const BTN = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
const BTN_GOLD = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 bg-cd shadow-bevel text-gd-hi cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)]';

export function WorldDelta({
  id, scale, subject, was, now, cause, chain, conflict, variants,
  onAccept, onReject, onReroll, onEdit, className = '',
}: WorldDeltaProps) {
  const [open, setOpen] = useState(false);
  const hasChain = chain !== undefined && chain.length > 0;
  const canReroll = onReroll !== undefined && (variants ?? 0) > 1;
  const scaleLabel = SCALE_LABELS[scale];
  return (
    <article
      aria-label={`Предложение: ${subject}`}
      data-delta={id}
      data-conflict={conflict ? 'true' : undefined}
      className={`flex flex-col gap-1 p-2 pl-2.5 bg-cd shadow-[var(--bevel),inset_3px_0_0_var(--src-sim)] ${className}`}
    >
      <div data-part="head" className="flex items-center gap-1">
        <Icon name={`scale-${scale}` as IconName} size={16} color="var(--t2)" title={scaleLabel} />
        <span className="type-body-sm text-t2 truncate">{scaleLabel}</span>
        <Icon name="src-sim" size={16} color="var(--src-sim)" title="Симуляция · ждёт решения" className="ml-auto" />
      </div>
      <div data-part="subject" className="type-h-17 text-tx truncate" title={subject}>{subject}</div>
      <div data-part="change" className="flex flex-wrap items-baseline gap-1.5" title="Было → станет">
        <span data-part="was" className="type-body-sm text-t3 line-through">{was}</span>
        <span aria-hidden="true" className="type-body-sm text-t3">→</span>
        <span data-part="now" className="type-num-15 text-gd-hi">{now}</span>
      </div>
      {hasChain ? (
        <button
          type="button"
          data-part="cause"
          aria-expanded={open}
          title={open ? 'Скрыть цепочку причин' : 'Показать цепочку причин'}
          onClick={() => setOpen(o => !o)}
          className="text-left type-body-sm text-t2 cursor-pointer hover:text-tx"
        >
          <span aria-hidden="true">{open ? '▾ ' : '▸ '}</span>
          {cause}
        </button>
      ) : (
        <div data-part="cause" className="type-body-sm text-t2">{cause}</div>
      )}
      {hasChain && open ? (
        <ul aria-label="Цепочка причин" data-part="chain" className="flex flex-col gap-0.5 pl-3 shadow-[inset_1px_0_0_var(--lo)] type-body-sm text-t3">
          {chain.map((step, i) => (
            <li key={i}>
              <span aria-hidden="true">→ </span>
              {step}
            </li>
          ))}
        </ul>
      ) : null}
      {conflict ? (
        <div data-part="conflict" className="flex items-start gap-1 type-body-sm text-st-conflict">
          <Icon name="src-canon" size={16} color="var(--st-conflict)" title="Конфликт с каноном" className="mt-px" />
          <span>Канон: {conflict}</span>
        </div>
      ) : null}
      <div data-part="actions" className="flex flex-wrap gap-1">
        <button type="button" title="Принять · Enter" onClick={onAccept} className={BTN_GOLD}>
          {conflict ? 'Принять изменение' : 'Принять'}
        </button>
        {onEdit ? <button type="button" title="Править" onClick={onEdit} className={BTN}>Править</button> : null}
        {canReroll ? (
          <button type="button" title={`Перебросить · вариантов: ${variants}`} onClick={onReroll} className={BTN}>Переброс</button>
        ) : null}
        <button type="button" title={conflict ? 'Оставить канон' : 'Отклонить'} onClick={onReject} className={BTN}>
          {conflict ? 'Оставить канон' : 'Отклонить'}
        </button>
      </div>
    </article>
  );
}

export default WorldDelta;
