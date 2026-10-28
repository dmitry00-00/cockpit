// Общие детали редактора персонажа: стили полей и кнопок, секция шага, поле с подписью, кнопка-вариант, «осталось N».
import type { ReactNode } from 'react';
import { Icon } from '../../icons/Icon';

export const INPUT = 'h-7 px-2 type-body-sm text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)] placeholder:text-t3';
export const BTN = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
export const BTN_MAIN = 'type-num-12 uppercase whitespace-nowrap px-3 py-1 bg-linear-to-b from-pl to-cd shadow-[var(--bevel),inset_0_-2px_0_var(--gd)] text-gd-hi cursor-pointer enabled:hover:from-pl enabled:hover:to-pl enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),inset_0_-2px_0_var(--gd),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
export const OPT = 'type-body-sm text-left px-2 py-1 cursor-pointer bg-linear-to-b from-pl to-cd disabled:cursor-default disabled:opacity-(--op-disabled)';
export const OPT_OFF = 'text-t2 shadow-bevel enabled:hover:text-tx focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
export const OPT_ON = 'text-gd-hi shadow-[var(--bevel),inset_0_-3px_0_var(--gd)] focus-visible:shadow-[var(--bevel),inset_0_-3px_0_var(--gd),var(--glow-gold)]';
export const STEP = 'size-6 flex items-center justify-center type-num-15 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
export const LINK = 'type-body-sm text-gd text-left cursor-pointer hover:text-gd-hi focus-visible:shadow-[var(--glow-gold)]';

export function Section({ title, right, children, hint }: { title: string; right?: ReactNode; children: ReactNode; hint?: string }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="type-h-15 uppercase text-t2 truncate" title={hint}>{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="type-key uppercase text-t2">{label}</span>
      {children}
    </label>
  );
}

/** Кнопка-вариант: нажатая — золотая грань, как у переключателей стола. */
export function Option({ on, disabled, title, onClick, onPeek, children, className = '' }: { on: boolean; disabled?: boolean; title?: string; onClick: () => void; onPeek?: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" aria-pressed={on} disabled={disabled} title={title} onClick={onClick} onMouseEnter={onPeek} onFocus={onPeek} className={`${OPT} ${on ? OPT_ON : OPT_OFF} ${className}`}>
      {children}
    </button>
  );
}

/** «Осталось N» у шага и в счётчиках: золото, пока не ноль; готово — галочка с подписью. */
export function Left({ n, label }: { n: number; label?: string }) {
  if (n <= 0) return <span className="flex items-center gap-1 type-key text-t2" title="готово"><Icon name="check" size={16} color="var(--t2)" title="готово" />{label ?? ''}</span>;
  return <span className="type-key text-gd whitespace-nowrap" title={`осталось выбрать: ${n}`}>{label ? `${label} · ` : ''}ещё {n}</span>;
}
