// Полоса иконок (F9, IconRail): свёрнутая боковая панель шириной 40px — те же иконки в том же порядке, что
// секции развёрнутой панели, мастер не переучивается. Клик по иконке раскрывает панель оверлеем поверх главной
// зоны; счётчик — сколько ждёт решения (предложения мира); активная — золотом и левой гранью (форма, не только
// цвет). Компонент тупой: элементы и колбэк — пропсами; что свёрнуто и что раскрыто — состояние страницы.
import { Icon, type IconName } from '../icons/Icon';

export interface IconRailItem {
  id: string;
  icon: IconName;
  /** Тултип и имя для ассистивной технологии: «Входящие · 4». */
  label: string;
  /** Счётчик поверх иконки — золотая бирка; нет или ноль — бирки нет. */
  badge?: number;
  color?: string;
}

export interface IconRailProps {
  items: readonly IconRailItem[];
  /** Раскрытый оверлеем элемент. */
  active?: string;
  onOpen: (id: string) => void;
  /** С какой стороны экрана: грань активного — со стороны главной зоны. */
  side: 'left' | 'right';
  label: string;
  className?: string;
}

const CELL = 'relative flex size-10 flex-none items-center justify-center cursor-pointer bg-linear-to-b from-pl to-cd focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
const CELL_OFF = 'shadow-bevel text-t2 hover:text-tx';
const CELL_ON: Readonly<Record<IconRailProps['side'], string>> = {
  left: 'text-gd-hi shadow-[var(--bevel),inset_-3px_0_0_var(--gd)]',
  right: 'text-gd-hi shadow-[var(--bevel),inset_3px_0_0_var(--gd)]',
};

export function IconRail({ items, active, onOpen, side, label, className = '' }: IconRailProps) {
  if (items.length === 0) return null;
  return (
    <nav aria-label={label} data-side={side} className={`w-rail-collapsed flex-none flex flex-col gap-px bg-pn shadow-bevel ${className}`}>
      {items.map(it => {
        const on = it.id === active;
        const name = it.badge ? `${it.label} · ${it.badge}` : it.label;
        return (
          <button
            key={it.id}
            type="button"
            aria-pressed={on}
            aria-label={name}
            title={`${name}: ${on ? 'свернуть' : 'раскрыть панель'}`}
            onClick={() => onOpen(it.id)}
            className={`${CELL} ${on ? CELL_ON[side] : CELL_OFF}`}
          >
            <Icon name={it.icon} size={16} color={on ? 'var(--gd-hi)' : (it.color ?? 'currentColor')} title={it.label} />
            {it.badge ? (
              <span data-part="badge" className="absolute -top-px -right-px min-w-4 px-0.5 type-num-12 leading-4 text-center bg-gd text-bg shadow-bevel">{it.badge}</span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

export default IconRail;
