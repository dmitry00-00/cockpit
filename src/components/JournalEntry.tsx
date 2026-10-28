// Запись журнала (F7): слева время в три строки (дата мира, время мира, реальное), иконка события,
// текст с @упоминаниями и #нитями, после текста — метки секрета и происхождения. Запись ничего не
// хранит и в стор не ходит: части текста — проекция journalParts() в движке, колбэки — со страницы.
// Секрет приглушается прозрачностью op-hidden-from-players, но метки стоят вне приглушённого куска:
// перечёркнутый глаз — единственный носитель смысла «скрыто», и он обязан читаться в полную силу.
// Отменённая запись гаснет, но остаётся (HANDOFF §7): line-through и t3. text-decoration не проходит
// внутрь inline-block, поэтому кнопки упоминаний в погасшей записи получают тот же line-through сами.
//
// Рядом — строка каскада «причина → следствие» под записью (левая линия src-sim, по ссылкам causeId,
// не по времени) и напоминание о секрете «Раскрыть / Позже». Оба сдвинуты на ширину времени и иконки
// (72 + 16 + 16 = 104px), чтобы стоять под текстом записи, а не под часами.
// Строки классов полные: Tailwind ищет их в исходнике.

import { Fragment } from 'react';
import type { CascadeStep, JournalOrigin, JournalPart } from '../engine';
import { Icon, type IconName } from '../icons/Icon';

export interface JournalEntryProps {
  id: string;
  /** «15 Mirtul». */
  worldDate: string;
  /** «07:40». */
  worldTime: string;
  /** «19:12» — реальное время; у записей сида его нет, и строка не рисуется. */
  wallTime?: string;
  /** Иконка события слева от текста (16). */
  icon: IconName;
  iconColor?: string;
  iconTitle: string;
  parts: readonly JournalPart[];
  /** Метка происхождения после текста: рука мастера, симуляция, известно игрокам. */
  origin?: JournalOrigin;
  /** Секрет мастера: текст приглушён, после него перечёркнутый глаз «Скрыто от игроков». */
  secret?: boolean;
  /** Исходное событие отменено — запись гаснет (line-through, t3), но остаётся. */
  undone?: boolean;
  /** Запись-компенсация («Отменено: …», «Повторено: …») — вторичным цветом. */
  compensation?: 'undo' | 'redo';
  /** @упоминание — кнопка «Открыть карточку: Имя». Без колбэка — просто текст. */
  /** entity 'ref' — справочная сущность, id — ссылка «вид:id». */
  onMention?: (entity: 'actor' | 'location' | 'faction' | 'ref', id: string) => void;
  /** #нить — кнопка «Нить: Имя» цветом src-canon. Без колбэка — просто текст. */
  onThread?: (id: string) => void;
  className?: string;
}

/** Метка происхождения: иконка src-*, её цвет и подпись в тултипе. Строки полные. */
export const ENTRY_ORIGIN: Readonly<Record<JournalOrigin, { icon: IconName; color: string; label: string }>> = {
  dm: { icon: 'src-dm', color: 'var(--src-dm)', label: 'Рука мастера' },
  sim: { icon: 'src-sim', color: 'var(--src-sim)', label: 'Симуляция' },
  players: { icon: 'src-players', color: 'var(--src-players)', label: 'Известно игрокам' },
};

/** Текст записи целиком — для aria-label и тестов: упоминание — имя, нить — «#Имя». */
export function journalText(parts: readonly JournalPart[]): string {
  return parts.map(p => (p.kind === 'text' ? p.text : p.kind === 'mention' ? p.name : `#${p.name}`)).join('');
}

/* Подчёркивание упоминания — грань t4 (декор, не текст); наведение — золото. Кольцо фокуса — вместе с гранью. */
const MENTION = 'type-body-bold cursor-pointer hover:text-gd-hi hover:shadow-[inset_0_-1px_0_var(--gd)] focus-visible:shadow-[inset_0_-1px_0_var(--gd),var(--glow-gold)]';
const THREAD = 'cursor-pointer hover:text-gd-hi';

export function JournalEntry({
  id, worldDate, worldTime, wallTime, icon, iconColor = 'var(--t2)', iconTitle, parts,
  origin, secret = false, undone = false, compensation, onMention, onThread, className = '',
}: JournalEntryProps) {
  const text = journalText(parts);
  // Тон текста: погасшая — t3 с зачёркиванием, компенсация — t2, обычная — tx. Погасшая тянет
  // зачёркивание и в кнопки внутри: inline-block не наследует text-decoration.
  const tone = undone ? 'line-through text-t3' : compensation ? 'text-t2' : 'text-tx';
  const mentionTone = undone ? 'line-through text-t3 shadow-[inset_0_-1px_0_var(--t4)]' : 'text-tx shadow-[inset_0_-1px_0_var(--t4)]';
  const threadTone = undone ? 'line-through text-t3' : 'text-src-canon';
  return (
    <article
      aria-label={text}
      data-entry={id}
      data-secret={secret ? 'true' : undefined}
      data-undone={undone ? 'true' : undefined}
      data-compensation={compensation}
      className={`grid grid-cols-[72px_16px_1fr] gap-2 py-1.5 items-start shadow-[inset_0_-1px_0_var(--lo)] ${className}`}
    >
      <div data-part="time" className="flex flex-col type-key text-t3" title={wallTime ? `${worldDate} ${worldTime} · реальное ${wallTime}` : `${worldDate} ${worldTime}`}>
        <span>{worldDate}</span>
        <span>{worldTime}</span>
        {wallTime ? <span data-part="wall">{wallTime}</span> : null}
      </div>
      <div className="pt-0.5">
        <Icon name={icon} size={16} color={iconColor} title={iconTitle} />
      </div>
      <div data-part="body" className={`min-w-0 type-body ${tone}`}>
        <span data-part="text" className={secret ? 'opacity-(--op-hidden-from-players)' : undefined}>
          {parts.map((p, i) => {
            if (p.kind === 'text') return <Fragment key={i}>{p.text}</Fragment>;
            if (p.kind === 'mention') {
              return onMention ? (
                <button
                  key={i}
                  type="button"
                  aria-label={`Открыть карточку: ${p.name}`}
                  title={`Открыть карточку: ${p.name}`}
                  data-entity={p.entity}
                  onClick={() => onMention(p.entity, p.id)}
                  className={`${MENTION} ${mentionTone}`}
                >
                  @{p.name}
                </button>
              ) : (
                <span key={i} data-entity={p.entity} className={`type-body-bold ${mentionTone}`}>@{p.name}</span>
              );
            }
            return onThread ? (
              <button
                key={i}
                type="button"
                aria-label={`Нить: ${p.name}`}
                title={`Нить: ${p.name}`}
                data-thread={p.id}
                onClick={() => onThread(p.id)}
                className={`${THREAD} ${threadTone}`}
              >
                #{p.name}
              </button>
            ) : (
              <span key={i} data-thread={p.id} className={threadTone}>#{p.name}</span>
            );
          })}
        </span>
        {secret || origin ? (
          <span data-part="marks" className="inline-flex gap-1 align-middle ml-1">
            {secret ? <Icon name="hidden" size={16} color="var(--src-players)" title="Скрыто от игроков" /> : null}
            {origin ? <Icon name={ENTRY_ORIGIN[origin].icon} size={16} color={ENTRY_ORIGIN[origin].color} title={ENTRY_ORIGIN[origin].label} /> : null}
          </span>
        ) : null}
      </div>
    </article>
  );
}

/* ---------- Каскад «причина → следствие» ---------- */

/** Иконка шага каскада по его виду. Строки полные. */
export const CASCADE_ICON: Readonly<Record<CascadeStep['kind'], IconName>> = {
  fact: 'note',
  thread: 'threads',
  delta: 'src-sim',
  entry: 'journal',
};

const CASCADE_TITLE: Readonly<Record<CascadeStep['kind'], string>> = {
  fact: 'Факт',
  thread: 'Нить',
  delta: 'Предложение',
  entry: 'Запись',
};

/** Цвет иконки шага: предложение — src-sim, нить — src-canon (как #нить в тексте), остальное — t2. */
const CASCADE_COLOR: Readonly<Record<CascadeStep['kind'], string>> = {
  fact: 'var(--t2)',
  thread: 'var(--src-canon)',
  delta: 'var(--src-sim)',
  entry: 'var(--t2)',
};

export interface JournalCascadeProps {
  steps: readonly CascadeStep[];
  className?: string;
}

/** Строка каскада под записью. Пустой каскад не рисуется вовсе. */
export function JournalCascade({ steps, className = '' }: JournalCascadeProps) {
  if (steps.length === 0) return null;
  return (
    <div
      role="list"
      aria-label="Каскад"
      className={`ml-26 my-1 flex flex-wrap items-center gap-1 px-2 py-1 bg-cd shadow-[inset_2px_0_0_var(--src-sim)] ${className}`}
    >
      {steps.map((s, i) => (
        <Fragment key={`${s.kind}:${s.id}`}>
          {i > 0 ? <span aria-hidden="true" data-part="arrow" className="type-body-sm text-t3">→</span> : null}
          <span role="listitem" data-kind={s.kind} className="inline-flex items-center gap-1 type-body-sm text-tx">
            <Icon name={CASCADE_ICON[s.kind]} size={16} color={CASCADE_COLOR[s.kind]} title={CASCADE_TITLE[s.kind]} />
            <span className="truncate max-w-[320px]" title={s.label}>{s.label}</span>
          </span>
        </Fragment>
      ))}
    </div>
  );
}

/* ---------- Напоминание о секрете ---------- */

export interface JournalReminderProps {
  text: string;
  /** «Раскрыть» — открыть игрокам (FACT_REVEALED); с другим `action` — любое напоминание системы (снять концентрацию). */
  onReveal: () => void;
  /** «Позже» — напомнить позже; положение напоминания — вид, не событие. */
  onLater: () => void;
  /** Подпись и тултип главной кнопки; по умолчанию — «Раскрыть», открыть игрокам. */
  action?: { label: string; title: string };
  /** Иконка слева; по умолчанию — «скрыто от игроков». */
  icon?: { name: IconName; color: string; title: string };
  /** Отступ под колонку времени журнала (ml-26); в боковой панели — без него. */
  inset?: boolean;
  className?: string;
}

/* Кнопки — как BTN на столе: строка целиком. Золотая — то же с text-gd-hi. */
const BTN = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
const BTN_GOLD = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 bg-cd shadow-bevel text-gd-hi cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)]';

export function JournalReminder({ text, onReveal, onLater, action, icon, inset = true, className = '' }: JournalReminderProps) {
  const ic = icon ?? { name: 'hidden' as const, color: 'var(--src-players)', title: 'Скрыто от игроков' };
  const act = action ?? { label: 'Раскрыть', title: 'Открыть игрокам: FACT_REVEALED' };
  return (
    <div role="group" aria-label="Напоминание" className={`${inset ? 'ml-26 ' : ''}my-1 flex items-center gap-2 p-2 bg-cd shadow-bevel ${className}`}>
      <Icon name={ic.name} size={16} color={ic.color} title={ic.title} className="flex-none" />
      <span className="flex-1 min-w-0 type-body-sm text-tx">{text}</span>
      <button type="button" title={act.title} onClick={onReveal} className={BTN_GOLD}>{act.label}</button>
      <button type="button" title="Напомнить позже" onClick={onLater} className={BTN}>Позже</button>
    </div>
  );
}

export default JournalEntry;
