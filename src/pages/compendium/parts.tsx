// Общие детали матриц компендиума: фильтр источников, чип, метка источника, панель подробностей.
import type { Source } from '../../rules/compendium';
import { SOURCES, SOURCE_LABELS } from '../../rules/compendium/views';

/** Цвет метки: SRD и книга — канон, хоумбрю — перо мастера (токены src-*). */
const SOURCE_TEXT: Readonly<Record<Source, string>> = { srd: 'text-src-canon', book: 'text-t2', hb: 'text-src-dm' };

export function SourceBadge({ source }: { source: Source }) {
  return <span className={`type-key ${SOURCE_TEXT[source]}`} title={`источник: ${SOURCE_LABELS[source]}`}>{SOURCE_LABELS[source]}</span>;
}

export function SourceFilter({ value, onChange }: { value: readonly Source[]; onChange: (next: Source[]) => void }) {
  const toggle = (s: Source) => onChange(value.includes(s) ? value.filter(x => x !== s) : SOURCES.filter(x => x === s || value.includes(x)));
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Источники">
      <span className="type-body-xs text-t3">источники</span>
      {SOURCES.map(s => {
        const on = value.includes(s);
        return (
          <button
            key={s}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(s)}
            className={`type-key px-2 py-1 ${on ? `bg-pl shadow-plate ${SOURCE_TEXT[s]}` : 'bg-cd shadow-bevel-in text-t4'}`}
          >
            {SOURCE_LABELS[s]}
          </button>
        );
      })}
    </div>
  );
}

/** Переключатель вкладок: одна нажата, остальные — плитки. Не событие домена, просто состояние экрана. */
export function Segmented<T extends string>({ items, value, onChange, label }: {
  items: readonly { id: T; label: string; hint?: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="tablist" aria-label={label}>
      {items.map(it => {
        const on = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={on}
            title={it.hint}
            onClick={() => onChange(it.id)}
            className={`type-body-sm px-3 py-1 ${on ? 'bg-pl shadow-plate text-gd' : 'bg-cd shadow-bevel text-t2 hover:text-tx'}`}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

export interface Detail {
  title: string;
  subtitle?: string;
  source?: Source;
  text: string;
  /** Адрес в таблице-первоисточнике: править там, а не в JSON. */
  cell?: string;
}

/** Чип в клетке матрицы: клик открывает текст в панели подробностей, title — для беглого взгляда. */
export function Chip({ label, text, selected, onSelect, tone = 'plate' }: {
  label: string;
  text?: string;
  selected?: boolean;
  onSelect?: () => void;
  tone?: 'plate' | 'gold';
}) {
  const cls = selected ? 'bg-pl shadow-plate text-gd' : tone === 'gold' ? 'bg-pl shadow-plate text-gd' : 'bg-pl shadow-plate text-tx hover:text-gd';
  return (
    <button type="button" onClick={onSelect} title={text} aria-pressed={selected} className={`type-body-xs px-1.5 py-0.5 text-left max-w-[220px] truncate block ${cls}`}>
      {label}
    </button>
  );
}

export function DetailPane({ detail, onClose }: { detail: Detail | null; onClose: () => void }) {
  if (!detail) {
    return (
      <aside className="bg-pn shadow-bevel p-4 flex flex-col gap-2 min-h-[160px]" aria-label="Подробности">
        <span className="type-h-15 text-t3">Подробности</span>
        <p className="type-body-sm text-t3">Нажмите на клетку матрицы — здесь появится текст.</p>
      </aside>
    );
  }
  return (
    <aside className="bg-pn shadow-bevel p-4 flex flex-col gap-3" aria-label="Подробности">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="type-h-17 text-tx">{detail.title}</span>
          {detail.subtitle && <span className="type-body-xs text-t2">{detail.subtitle}</span>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {detail.source && <SourceBadge source={detail.source} />}
          <button type="button" onClick={onClose} className="type-key text-t3 hover:text-tx px-2 py-1 bg-cd shadow-bevel" aria-label="Закрыть">закрыть</button>
        </div>
      </div>
      <div className="type-body text-tx whitespace-pre-line max-h-[50vh] overflow-y-auto">{detail.text || '— в таблице текста нет —'}</div>
      {detail.cell && <span className="type-key text-t4">клетка таблицы: {detail.cell}</span>}
    </aside>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="type-body-sm text-t3 p-4">{text}</p>;
}
