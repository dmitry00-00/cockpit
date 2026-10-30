// Список напряжений (Д3, ROADMAP 7.2): вид, стороны и место, вес — сколько фактов держат; раскрытая строка — факты
// цепочкой со ссылками (вики — серым, кампания — золотом). «Сделать нитью» — предложение во входящие; уже нить или уже
// ждёт решения — кнопка подписана так и выключена. Тупой: список, открытие карточки и нить — пропсами.
import { useState } from 'react';
import { TENSION_LABEL, type Tension } from '../campaign/tensions';
import type { EntityRef } from '../entities/ref';
import { Icon } from '../icons/Icon';

export interface TensionListProps {
  tensions: readonly Tension[];
  onOpen: (ref: EntityRef) => void;
  /** Нет — кнопки «Сделать нитью» нет (глазами игроков её и не бывает). */
  onThread?: (t: Tension) => void;
  /** Уже нить или уже во входящих. */
  threadState?: (t: Tension) => 'thread' | 'pending' | null;
  /** Показывать место в строке (в сцене места оно и так известно). */
  showPlace?: boolean;
  className?: string;
}

const BTN = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const LINK = 'text-left underline decoration-t2 underline-offset-2 cursor-pointer hover:text-gd-hi';

export function TensionList({ tensions, onOpen, onThread, threadState, showPlace = true, className = '' }: TensionListProps) {
  const [open, setOpen] = useState<string | null>(null);
  if (tensions.length === 0) return null;
  return (
    <ol aria-label="Напряжения" className={`flex flex-col gap-1 m-0 p-0 list-none ${className}`}>
      {tensions.map(t => {
        const st = threadState?.(t) ?? null;
        return (
          <li key={t.id} data-tension={t.id} data-kind={t.kind} className="flex flex-col gap-1 bg-cd shadow-bevel px-2 py-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="type-num-15 text-tx w-6 flex-none text-right" title={`Вес: фактов ${t.weight}`}>{t.weight}</span>
              <button type="button" aria-expanded={open === t.id} onClick={() => setOpen(open === t.id ? null : t.id)} title="Факты напряжения" className="flex-1 min-w-0 flex flex-col text-left cursor-pointer">
                <span className="type-body text-tx truncate">{t.title}</span>
                <span className="type-key text-t2 truncate">{TENSION_LABEL[t.kind]}{showPlace && t.placeName && !t.title.endsWith(t.placeName) ? ` · ${t.placeName}` : ''}</span>
              </button>
              {onThread ? (
                <button type="button" disabled={st !== null} onClick={() => onThread(t)} className={BTN}
                  title={st === 'thread' ? 'Нить уже открыта' : st === 'pending' ? 'Предложение уже во входящих' : 'Предложить нить: во входящие, «Принять» откроет её в журнале'}>
                  {st === 'thread' ? 'нить есть' : st === 'pending' ? 'во входящих' : 'Сделать нитью'}
                </button>
              ) : null}
            </div>
            {open === t.id ? (
              <ul aria-label={`Факты: ${t.title}`} className="flex flex-col gap-0.5 pl-8 m-0 list-none type-body-sm">
                {t.facts.map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <Icon name={f.origin === 'campaign' ? (f.factId ? 'hidden' : 'src-dm') : 'src-canon'} size={16} color={f.origin === 'campaign' ? 'var(--gd)' : 'var(--t2)'} title={f.origin === 'campaign' ? (f.factId ? 'Секрет мастера' : 'Кампания') : 'Вики'} className="flex-none mt-0.5" />
                    {f.ref ? <button type="button" onClick={() => onOpen(f.ref!)} className={`${LINK} ${f.origin === 'campaign' ? 'text-tx' : 'text-t2'}`}>{f.text}</button>
                      : <span className={f.origin === 'campaign' ? 'text-tx' : 'text-t2'}>{f.text}</span>}
                  </li>
                ))}
                <li className="flex flex-wrap gap-x-3 pt-0.5">
                  {t.sides.map(s => <button key={s.ref} type="button" onClick={() => onOpen(s.ref)} className={`${LINK} type-key text-tx`}>{s.label}</button>)}
                </li>
              </ul>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export default TensionList;
