// Ресурс персонажа пипками (решение владельца 21.09.2026): ячейки заклинаний, ярость, ци, применения умений.
// Закрашенная пипка — есть, утопленная — потрачена: форма читается без цвета. До двенадцати — пипками, больше —
// числом; запас (наложение рук) — число и поле «сколько». Клик по пипке тратит одну, по потраченной — возвращает
// одну; на столе игроков колбэков нет — только показ. Компонент тупой: максимум и потраченное пропсами, события
// пишет страница (RESOURCE_SPENT / RESOURCE_RESTORED).
import { useState, type KeyboardEvent } from 'react';
import { Icon } from '../icons/Icon';

export type ResourcePipsKind = 'slots' | 'uses' | 'pool';

export interface ResourcePipsProps {
  id: string;
  label: string;
  max: number;
  spent: number;
  kind: ResourcePipsKind;
  /** Отдых, который вернёт ресурс — в тултипе: «короткий отдых» / «долгий отдых». */
  restoresOn?: 'short' | 'long';
  onSpend?: (amount: number) => void;
  onRestore?: (amount: number) => void;
  className?: string;
}

/** Больше — уже не пипки, а число: строка карточки не резиновая. */
export const PIPS_MAX = 12;

const REST_LABEL: Readonly<Record<'short' | 'long', string>> = { short: 'короткий отдых', long: 'долгий отдых' };

const PIP_ON = 'bg-gd shadow-bevel';
const PIP_OFF = 'bg-wl shadow-bevel-in';
const PIP_BTN = 'size-3 flex-none cursor-pointer focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
const BTN = 'type-num-12 uppercase whitespace-nowrap px-1.5 py-0.5 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const INPUT = 'h-6 w-10 px-1 text-center type-num-12 text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';

/** Черновик «сколько потратить» → 1…available; иначе null. */
export function parsePoolAmount(raw: string, available: number): number | null {
  if (!/^\d{1,3}$/.test(raw.trim())) return null;
  const n = Number(raw);
  return n >= 1 && n <= available ? n : null;
}

export function ResourcePips({ id, label, max, spent, kind, restoresOn, onSpend, onRestore, className = '' }: ResourcePipsProps) {
  const [draft, setDraft] = useState('');
  const available = Math.max(0, max - spent);
  const editable = Boolean(onSpend || onRestore);
  const title = `${label}: ${available} из ${max}${restoresOn ? ` · вернёт ${REST_LABEL[restoresOn]}` : ''}`;
  const amount = parsePoolAmount(draft, available);
  const submit = () => { if (amount !== null && onSpend) { onSpend(amount); setDraft(''); } };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };

  return (
    <div role="group" aria-label={`${label}: ${available} из ${max}`} title={title} data-resource={id} className={`flex items-center gap-2 min-h-6 ${className}`}>
      <span className="type-body-sm text-tx flex-1 min-w-0 truncate">{label}</span>
      {kind !== 'pool' && max <= PIPS_MAX ? (
        <span className="flex items-center gap-1" data-part="pips">
          {Array.from({ length: max }, (_, i) => {
            const on = i < available;
            const cls = on ? PIP_ON : PIP_OFF;
            if (!editable) return <span key={i} data-on={on ? 'true' : 'false'} className={`size-3 flex-none ${cls}`} />;
            return (
              <button
                key={i}
                type="button"
                data-on={on ? 'true' : 'false'}
                aria-label={on ? `Потратить: ${label}` : `Вернуть: ${label}`}
                title={on ? `Потратить одну: ${label}` : `Вернуть одну: ${label}`}
                onClick={() => (on ? onSpend?.(1) : onRestore?.(1))}
                className={`${PIP_BTN} ${cls}`}
              />
            );
          })}
        </span>
      ) : (
        <span className="type-num-15 text-tx flex-none" data-part="count">{available}<span className="text-t2"> / {max}</span></span>
      )}
      {editable && (kind === 'pool' || max > PIPS_MAX) ? (
        <span className="flex items-center gap-1 flex-none">
          {kind === 'pool' ? (
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              aria-label={`Сколько потратить: ${label}`}
              title="Сколько потратить · Enter"
              value={draft}
              onChange={e => setDraft(e.target.value.replace(/\D/g, '').slice(0, 3))}
              onKeyDown={onKeyDown}
              disabled={available === 0}
              className={INPUT}
            />
          ) : null}
          <button type="button" aria-label={`Потратить: ${label}`} title={kind === 'pool' ? 'Потратить введённое' : 'Потратить одну'} disabled={kind === 'pool' ? amount === null : available === 0} onClick={() => (kind === 'pool' ? submit() : onSpend?.(1))} className={BTN}>
            <Icon name="cross" size={16} color="currentColor" title="Потратить" />
          </button>
          <button type="button" aria-label={`Вернуть: ${label}`} title={kind === 'pool' ? 'Вернуть всё потраченное' : 'Вернуть одну'} disabled={spent === 0} onClick={() => onRestore?.(kind === 'pool' ? spent : 1)} className={BTN}>
            <Icon name="check" size={16} color="currentColor" title="Вернуть" />
          </button>
        </span>
      ) : null}
    </div>
  );
}

export default ResourcePips;
