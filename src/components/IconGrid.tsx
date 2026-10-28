// Ряд иконок листа: умения, черты, особенности расы, заклинания (решение владельца 27.10.2026). Наведение — имя в
// тултипе, щелчок — текст под рядом; повторный щелчок или Esc закрывают. Тупой: пункты и тексты приходят пропсами.
import { useState, type KeyboardEvent } from 'react';
import type { EntityRef } from '../entities';
import { Icon, type IconName } from '../icons/Icon';
import { useOpenEntity } from './openEntity';

export interface IconGridItem {
  key: string;
  icon: IconName;
  name: string;
  /** Короткая пометка рядом с именем в раскрытом тексте и тултипе: «3 ур.», «раса», «1 круг · К». */
  meta?: string;
  /** Полный текст; пустой — раскрывается только имя. */
  text?: string;
  /** Ссылка на сущность: в раскрытом тексте — кнопка «Карточка» (если страница дала вход). */
  ref?: EntityRef;
}

const TILE = 'size-10 flex-none grid place-items-center bg-linear-to-b from-pl to-cd cursor-pointer focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
const TILE_OFF = 'shadow-bevel hover:from-pl hover:to-pl';
const TILE_ON = 'shadow-[var(--bevel-in),inset_0_-3px_0_var(--gd)]';

export function IconGrid({ items, label }: { items: readonly IconGridItem[]; label: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const openEntity = useOpenEntity();
  if (items.length === 0) return null;
  const cur = items.find(i => i.key === open);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && cur) {
      e.stopPropagation();
      setOpen(null);
    }
  };
  return (
    <div className="flex flex-col gap-2" onKeyDown={onKeyDown}>
      <ul className="flex flex-wrap gap-1" aria-label={label}>
        {items.map(i => {
          const title = i.meta ? `${i.name} · ${i.meta}` : i.name;
          const on = i.key === open;
          return (
            <li key={i.key}>
              <button
                type="button"
                title={title}
                aria-label={title}
                aria-expanded={on}
                onClick={() => setOpen(on ? null : i.key)}
                className={`${TILE} ${on ? TILE_ON : TILE_OFF}`}
              >
                <Icon name={i.icon} size={32} title={title} />
              </button>
            </li>
          );
        })}
      </ul>
      {cur ? (
        <div className="flex flex-col gap-0.5 bg-wl shadow-bevel-in px-2 py-1.5" data-part="icon-detail" role="region" aria-label={cur.name}>
          <div className="flex items-baseline gap-2">
            <span className="type-body-bold text-tx">{cur.name}</span>
            {cur.meta ? <span className="type-key text-t3 flex-none">{cur.meta}</span> : null}
            {cur.ref && openEntity ? (
              <button
                type="button"
                title={`Открыть карточку: ${cur.name}`}
                onClick={() => openEntity(cur.ref!)}
                className="ml-auto flex-none px-1.5 type-key uppercase text-t2 bg-linear-to-b from-pl to-cd shadow-bevel cursor-pointer hover:text-gd-hi focus-visible:shadow-[var(--bevel),var(--glow-gold)]"
              >
                Карточка
              </button>
            ) : null}
          </div>
          {cur.text ? <p className="type-body-sm text-t2 whitespace-pre-line break-words [overflow-wrap:anywhere]">{cur.text}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
