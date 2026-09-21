// Карточка нити (F7, правая колонка «Нити · 3»): шапка «#ИМЯ · 4 записи» и строки «подпись — текст»:
// сколько дней открыта, что сейчас, что будет, секрет мастера, каскад. Карточка ничего не хранит и в
// стор не ходит: строки — проекция threadSummaries() в движке, собранная на странице; клик по шапке —
// намерение включить фильтр по нити (состояние вида, не событие). Секретная строка приглушена и несёт
// перечёркнутый глаз: цвет и прозрачность — не единственный носитель. Пустой список строк не рисуется.
// Строки классов полные: Tailwind ищет их в исходнике.

import { plural } from '../engine';
import { Icon } from '../icons/Icon';

export interface ThreadCardRow {
  key: string;
  /** Подпись слева (72px, type-key uppercase): «12 дней», «сейчас», «через 16», «секрет», «каскад». */
  label: string;
  text: string;
  /** Тон текста: tx (по умолчанию), t2, gd, sim → src-sim. */
  tone?: 'tx' | 't2' | 'gd' | 'sim';
  /** Секрет мастера: текст приглушён, перед ним перечёркнутый глаз. */
  secret?: boolean;
}

export interface ThreadCardProps {
  id: string;
  name: string;
  /** Записей по нити — «4 записи», склонение plural из движка. */
  count: number;
  rows: readonly ThreadCardRow[];
  selected?: boolean;
  /** Клик по шапке — включить фильтр по нити. Без колбэка шапка — не кнопка. */
  onSelect?: (id: string) => void;
  className?: string;
}

/** «1 запись», «2 записи», «5 записей». */
export function entryCountLabel(n: number): string {
  return `${n} ${plural(n, ['запись', 'записи', 'записей'])}`;
}

/** Тон строки. Все — на карточке cd: t2 5.4:1, src-sim 6.4:1 к bg и 4.5:1 к pl. Строки полные. */
const ROW_TONE: Readonly<Record<NonNullable<ThreadCardRow['tone']>, string>> = {
  tx: 'text-tx',
  t2: 'text-t2',
  gd: 'text-gd',
  sim: 'text-src-sim',
};

const HEAD = 'flex items-center gap-1.5 px-2 py-1 bg-linear-to-b from-pl to-cd shadow-plate';

export function ThreadCard({ id, name, count, rows, selected = false, onSelect, className = '' }: ThreadCardProps) {
  // Плита cd с левой полосой gd под фаской; выбранная — золотое кольцо поверх, как у карточки сущности.
  const surface = selected
    ? 'shadow-[var(--bevel),inset_3px_0_0_var(--gd),var(--glow-gold)]'
    : 'shadow-[var(--bevel),inset_3px_0_0_var(--gd)]';
  const head = (
    <>
      <Icon name="threads" size={16} color="var(--gd)" title="Нить" />
      <span className="flex-1 min-w-0 truncate type-h-15 uppercase text-gd group-hover:text-gd-hi" title={name}>#{name}</span>
      {/* Счётчик на плите pl — t2 (4.7:1): t3 туда не ставится. */}
      <span className="ml-auto flex-none type-key text-t2" title="Записей по нити" data-part="count">{entryCountLabel(count)}</span>
    </>
  );
  return (
    <section
      aria-label={`Нить: ${name}`}
      aria-current={selected ? 'true' : undefined}
      data-thread={id}
      className={`flex flex-col bg-cd ${surface} ${className}`}
    >
      {onSelect ? (
        <button
          type="button"
          data-part="head"
          aria-pressed={selected}
          aria-label={`Фильтр по нити: ${name}`}
          title={`Фильтр по нити: ${name}`}
          onClick={() => onSelect(id)}
          className={`${HEAD} group w-full text-left cursor-pointer focus-visible:shadow-[var(--plate),var(--glow-gold)]`}
        >
          {head}
        </button>
      ) : (
        <div data-part="head" className={HEAD}>{head}</div>
      )}
      {rows.length > 0 ? (
        <dl className="flex flex-col gap-1 p-2 pl-2.5">
          {rows.map(r => (
            <div key={r.key} data-row={r.key} data-secret={r.secret ? 'true' : undefined} className="grid grid-cols-[72px_1fr] gap-2 items-start">
              <dt className="type-key uppercase text-t2 truncate pt-px" title={r.label}>{r.label}</dt>
              <dd className={`min-w-0 flex items-start gap-1 type-body-sm ${ROW_TONE[r.tone ?? 'tx']}`}>
                {r.secret ? <Icon name="hidden" size={16} color="var(--src-players)" title="Скрыто от игроков" className="mt-px" /> : null}
                <span className={r.secret ? 'opacity-(--op-hidden-from-players)' : undefined}>{r.text}</span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

export default ThreadCard;
