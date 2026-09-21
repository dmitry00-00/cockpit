// Фильтр журнала (F7, над записями): две строки чипов — нити и уровни масштаба. Фильтр — состояние
// вида на странице, не событие (HANDOFF §7): что включено и что делать по клику приходит пропсами,
// компонент ничего не хранит. Пустой список включённых значит «все», а не «ничего»: журнал никогда не
// пустеет из-за забытой галочки, поэтому у выключенных чипов aria-pressed=false, а не «все нажаты».
// Включённый чип отличается не только цветом: нижняя полоса 3px золотом — форма, цвет — второй носитель.
// Секция без элементов не рисуется вовсе. Строки классов полные: Tailwind ищет их в исходнике.

import type { ScaleLevel } from '../engine';
import { Icon, type IconName } from '../icons/Icon';
import { SCALE_LABELS } from './scales';

export interface ThreadFilterThread {
  id: string;
  name: string;
  /** Записей по нити — печатается в чипе, если передан. */
  count?: number;
}

export interface ThreadFilterScale {
  id: ScaleLevel;
  count?: number;
}

export interface ThreadFilterProps {
  threads: readonly ThreadFilterThread[];
  scales: readonly ThreadFilterScale[];
  /** Пусто = все, не «ничего». */
  activeThreads: readonly string[];
  activeScales: readonly ScaleLevel[];
  onThread: (id: string, on: boolean) => void;
  onScale: (id: ScaleLevel, on: boolean) => void;
  className?: string;
}

/** Подписи и порядок уровней живут в ./scales (шаг 10); отсюда они по-прежнему видны — индекс и страница их берут здесь. */
export { SCALE_LABELS, SCALE_ORDER } from './scales';

/** Чистая: добавить или убрать id без дублей, порядок остальных сохранить. */
export function toggleIn<T>(list: readonly T[], id: T, on: boolean): T[] {
  if (on) return list.includes(id) ? [...list] : [...list, id];
  return list.filter(x => x !== id);
}

/* Чип — плита pl→cd с фаской, как чип состояния; включённый — золото и нижняя полоса 3px gd. Кольцо фокуса — вместе с фаской. */
const CHIP = 'inline-flex items-center gap-1 whitespace-nowrap max-w-full px-1.5 pt-px pb-0.5 type-body-sm bg-linear-to-b from-pl to-cd cursor-pointer';
const CHIP_OFF = 'text-t2 shadow-bevel hover:text-tx focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
const CHIP_ON = 'text-gd-hi shadow-[var(--bevel),inset_0_-3px_0_var(--gd)] focus-visible:shadow-[var(--bevel),inset_0_-3px_0_var(--gd),var(--glow-gold)]';

/** Имя чипа для ассистивной технологии: подпись и счётчик через точку, без склейки иконки с текстом. */
const chipName = (label: string, count?: number) => (count === undefined ? label : `${label} · ${count}`);

export function ThreadFilter({ threads, scales, activeThreads, activeScales, onThread, onScale, className = '' }: ThreadFilterProps) {
  if (threads.length === 0 && scales.length === 0) return null;
  return (
    <div role="group" aria-label="Фильтр журнала" className={`flex flex-col gap-1 ${className}`}>
      {threads.length > 0 ? (
        <div role="group" aria-label="Нить" data-part="threads" className="flex flex-wrap items-center gap-1">
          {/* Подпись на панели pn — t3 (5.2:1); на плиту чипа она не попадает. */}
          <span aria-hidden="true" className="type-key uppercase text-t3 w-18 flex-none">Нить</span>
          {threads.map(t => {
            const on = activeThreads.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                aria-label={chipName(`#${t.name}`, t.count)}
                title={`Фильтр по нити: ${t.name}`}
                data-thread={t.id}
                onClick={() => onThread(t.id, !on)}
                className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
              >
                <span className="truncate">#{t.name}</span>
                {t.count !== undefined ? <span className="type-key text-t2 flex-none" data-part="count">{t.count}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
      {scales.length > 0 ? (
        <div role="group" aria-label="Масштаб" data-part="scales" className="flex flex-wrap items-center gap-1">
          <span aria-hidden="true" className="type-key uppercase text-t3 w-18 flex-none">Масштаб</span>
          {scales.map(s => {
            const on = activeScales.includes(s.id);
            const label = SCALE_LABELS[s.id];
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                aria-label={chipName(label, s.count)}
                title={`Фильтр по уровню масштаба: ${label}`}
                data-scale={s.id}
                onClick={() => onScale(s.id, !on)}
                className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
              >
                <Icon name={`scale-${s.id}` as IconName} size={16} color="currentColor" title={label} />
                <span className="truncate">{label}</span>
                {s.count !== undefined ? <span className="type-key text-t2 flex-none" data-part="count">{s.count}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default ThreadFilter;
