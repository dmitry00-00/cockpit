// Сводка «Что изменилось» (F6, главная зона после шага времени): группы по уровням лестницы масштабов,
// в каждой — строки «предмет · было → стало». Уровни, до которых партии нет дела, свёрнуты и принимаются
// одной кнопкой; всё, что рядом с партией, развёрнуто и решается построчно. Сводка ничего не хранит и в
// стор не ходит: группы и колбэки приходят пропсами; summaryGroups — проекция дельт состояния без
// колбэков, их добавляет страница. «Было → стало» — как в WorldDelta: пока мастер не решил, в мире стоит
// `was`, а `now` живёт только здесь — золотом моноширинным; t3 стоит на карточке cd (4.7:1), на плите
// шапки его нет. Без групп — одна строка emptyText; нет и её — секция не рисуется вовсе. Кнопки только
// при колбэках: тултип без действия — обман. Строки классов полные: Tailwind ищет их в исходнике.

import { SCALE_LEVELS, type ScaleLevel, type WorldDelta } from '../engine';
import { Icon, type IconName } from '../icons/Icon';
import { SCALE_LABELS } from './ThreadFilter';

export interface ChangeSummaryItem {
  id: string;
  subject: string;
  was: string;
  now: string;
  /** Причина — тултип предмета. */
  why?: string;
  /** «Принять» — только если передан. */
  onAccept?: () => void;
  /** «Отклонить» — только если передан. */
  onReject?: () => void;
  /** Предложение устарело на текущем мире; пересчитать перед принятием. */
  staleReason?: string;
}

export interface ChangeSummaryGroup {
  id: string;
  /** Иконка scale-<scale> в шапке; подпись — label. */
  scale: ScaleLevel;
  label: string;
  /** Свёрнутая — только шапка и «Принять пачкой». */
  collapsed: boolean;
  /** Число устаревших предложений в группе; блокирует пакетное принятие. */
  staleCount?: number;
  items: readonly ChangeSummaryItem[];
}

export interface ChangeSummaryProps {
  groups: readonly ChangeSummaryGroup[];
  /** «Принять пачкой» у свёрнутой группы — только если передан. */
  onAcceptAll?: (groupId: string) => void;
  /** Без групп — одна строка в утопленной рамке; без неё пустая сводка не рисуется. */
  emptyText?: string;
  className?: string;
}

/**
 * Проекция дельт в группы сводки: по уровню в порядке лестницы, только непустые, id группы — уровень;
 * свёрнуты все уровни, кроме near — тех, что рядом с партией. Колбэков нет — их добавляет страница.
 */
export function summaryGroups(
  deltas: readonly WorldDelta[],
  labelOf: (scale: ScaleLevel) => string,
  near: readonly ScaleLevel[],
): ChangeSummaryGroup[] {
  const out: ChangeSummaryGroup[] = [];
  const item = (d: WorldDelta) => ({ id: d.id, subject: d.subject, was: d.was, now: d.now, why: d.cause });
  for (const scale of SCALE_LEVELS) {
    const items = deltas.filter(d => !d.far && d.scale === scale).map(item);
    if (items.length === 0) continue;
    out.push({ id: scale, scale, label: labelOf(scale), collapsed: !near.includes(scale), items });
  }
  // Процессы вдали от партии (решение пользователя 30.10.2026) — одной свёрнутой группой, принимаются пачкой или по строке.
  const far = deltas.filter(d => d.far).map(item);
  if (far.length) out.push({ id: FAR_GROUP, scale: 'planet', label: 'Сводка мира · вдали от партии', collapsed: true, items: far });
  return out;
}

/** id группы «Сводка мира» в `summaryGroups`. */
export const FAR_GROUP = 'far';

/** Предложение — в группе сводки: дальнее — только в «Сводке мира», остальное — в группе своего масштаба. */
export const inSummaryGroup = (d: Pick<WorldDelta, 'scale' | 'far'>, groupId: string) => (groupId === FAR_GROUP ? !!d.far : !d.far && d.scale === groupId);

/* Кнопки — как BTN на столе: строка целиком. Золотая — то же с text-gd-hi. */
const BTN = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const BTN_GOLD = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 bg-cd shadow-bevel text-gd-hi cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';

export function ChangeSummary({ groups, onAcceptAll, emptyText, className = '' }: ChangeSummaryProps) {
  if (groups.length === 0 && !emptyText) return null;
  return (
    <div role="region" aria-label="Что изменилось" className={`flex flex-col gap-2 ${className}`}>
      {groups.length === 0 ? (
        <div
          data-part="empty"
          className="px-3 py-2 text-center type-body-sm text-t2 shadow-bevel-in"
        >
          {emptyText}
        </div>
      ) : (
        groups.map(g => {
          const scaleLabel = SCALE_LABELS[g.scale];
          return (
            <div
              key={g.id}
              role="group"
              aria-label={g.label}
              data-group={g.id}
              data-scale={g.scale}
              data-collapsed={g.collapsed ? 'true' : undefined}
              className="flex flex-col bg-cd shadow-bevel"
            >
              <div data-part="head" className="flex items-center gap-1.5 px-2 py-1 bg-linear-to-b from-pl to-cd shadow-plate">
                <Icon name={`scale-${g.scale}` as IconName} size={16} color="var(--t2)" title={scaleLabel} />
                <span className="type-h-15 uppercase text-t2 truncate" title={g.label}>{g.label}</span>
                <span data-part="count" className="type-key text-t2 ml-auto flex-none" title="Изменений в группе">{g.items.length}</span>
                {g.staleCount ? <span role="status" aria-live="polite" data-part="freshness" className="type-body-xs text-fx-debuff-hi">Пересчёт обязателен · устаревших предложений: {g.staleCount}</span> : null}
                {g.collapsed && onAcceptAll ? (
                  <button
                    type="button"
                    title={g.staleCount ? 'Сначала пересчитайте устаревшие предложения' : 'Принять все изменения этого уровня одной кнопкой'}
                    disabled={Boolean(g.staleCount)}
                    onClick={() => onAcceptAll(g.id)}
                    className={`${BTN_GOLD} flex-none`}
                  >
                    Принять пачкой
                  </button>
                ) : null}
              </div>
              {g.collapsed ? null : (
                <ul aria-label={`Изменения: ${g.label}`} className="flex flex-col">
                  {g.items.map(it => (
                    <li
                      key={it.id}
                      data-item={it.id}
                      className="flex items-center gap-1.5 px-2 py-1 shadow-[inset_0_-1px_0_var(--lo)] last:shadow-none"
                    >
                      <span data-part="subject" className="flex-1 min-w-0 truncate type-body-sm text-tx" title={it.why ?? it.subject}>{it.subject}</span>
                      <span data-part="change" className="flex flex-none items-baseline gap-1.5" title="Было → стало">
                        <span data-part="was" className="type-body-sm text-t3 line-through">{it.was}</span>
                        <span aria-hidden="true" className="type-body-sm text-t3">→</span>
                        <span data-part="now" className="type-num-15 text-gd-hi">{it.now}</span>
                      </span>
                      {it.staleReason ? <span role="status" aria-live="polite" data-part="freshness" className="type-body-xs text-fx-debuff-hi">Пересчёт обязателен: {it.staleReason}</span> : null}
                      {it.onAccept || it.onReject ? (
                        <span data-part="actions" className="flex flex-none items-center gap-1">
                          {it.onAccept || it.staleReason ? <button type="button" disabled={!it.onAccept || Boolean(it.staleReason)} title={it.staleReason ? 'Пересчёт обязателен' : 'Принять'} onClick={it.staleReason ? undefined : it.onAccept} className={BTN_GOLD}>Принять</button> : null}
                          {it.onReject ? <button type="button" title={it.staleReason ? 'Отклонить устаревшее предложение' : 'Отклонить'} onClick={it.onReject} className={BTN}>{it.staleReason ? 'Отклонить устаревшее предложение' : 'Отклонить'}</button> : null}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

export default ChangeSummary;
