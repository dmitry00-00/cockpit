// Стопка корешков (F3, низ экрана): шапка с иконкой и счётчиком, под ней 4–8 корешков по 40px —
// иконка типа, имя, хиты числом с меткой порога, бейдж. Число хитов — всегда tx: токены hp-* — заливки
// (ab-str как текст даёт 3.1:1 на pn), поэтому порог несёт квадратная метка рядом с числом, цветом
// как заливка. Мёртвый остаётся в стопке с «0/11» и меткой hp-low: стопка показывает, кто есть, а не
// кто жив. Левая полоса корешка — цвет типа, иконка — та же карта ENTITY, что у карточки: грань и
// иконка вместе. Клик по корешку — намерение открыть карточку, не событие. Со ступени лестницы (шаг 10)
// корешок умеет три вещи сверх стопки врагов: своя иконка (место — иконкой уровня scale-*, цвет остаётся
// цветом типа), выбранный корешок — точка фокуса лестницы (aria-current, имя золотом, фон cd — форма и
// цвет вместе с атрибутом) и «ждёт решения» — предложение симуляции целится сюда: иконка src-sim справа
// и суффикс в тултипе; кольцо glow-sim остаётся карточке и пину, корешок лишь указывает на них.
import type { Actor } from '../engine';
import { Icon, type IconName } from '../icons/Icon';
import { MONSTERS } from '../rules/srd';
import { ENTITY, ORIGIN, type EntityType } from './EntityCard';
import { hpLevel, hpText, type HpLevel, type HpTriple } from './HpBar';

export interface CardStackItem {
  id: string;
  name: string;
  type: EntityType;
  /** Хиты у тех, кто их имеет; у места или фракции — нет. */
  hp?: HpTriple;
  /** Уровень, CR, ранг — одним словом. */
  badge?: string;
  /** Иконка вместо иконки типа (место на лестнице — иконка уровня scale-*); цвет остаётся цветом типа. */
  icon?: IconName;
  /** Выбранный корешок (точка фокуса лестницы): aria-current и золотой текст. */
  selected?: boolean;
  /** Предложение симуляции целится сюда и ждёт решения: иконка src-sim справа с подписью в title. */
  pending?: boolean;
}

export interface CardStackProps {
  title?: string;
  icon?: IconName;
  items: readonly CardStackItem[];
  onOpen?: (item: CardStackItem) => void;
  className?: string;
}

/** Левая полоса 3px цветом типа под линией плиты и нижний шов. Строки полные — Tailwind ищет их в исходнике. */
const EDGE: Readonly<Record<EntityType, string>> = {
  pc: 'shadow-[inset_3px_0_0_var(--ent-pc),inset_0_-1px_0_var(--lo)]',
  npc: 'shadow-[inset_3px_0_0_var(--ent-npc),inset_0_-1px_0_var(--lo)]',
  monster: 'shadow-[inset_3px_0_0_var(--ent-monster),inset_0_-1px_0_var(--lo)]',
  item: 'shadow-[inset_3px_0_0_var(--ent-item),inset_0_-1px_0_var(--lo)]',
  location: 'shadow-[inset_3px_0_0_var(--ent-loc),inset_0_-1px_0_var(--lo)]',
  faction: 'shadow-[inset_3px_0_0_var(--ent-faction),inset_0_-1px_0_var(--lo)]',
  plane: 'shadow-[inset_3px_0_0_var(--ent-plane),inset_0_-1px_0_var(--lo)]',
  planet: 'shadow-[inset_3px_0_0_var(--ent-plane),inset_0_-1px_0_var(--lo)]',
  deity: 'shadow-[inset_3px_0_0_var(--ent-deity),inset_0_-1px_0_var(--lo)]',
  event: 'shadow-[inset_3px_0_0_var(--ent-event),inset_0_-1px_0_var(--lo)]',
};

/** Кольцо фокуса поверх полосы типа: глобальное затирает её, поэтому пишем вместе. */
const FOCUS: Readonly<Record<EntityType, string>> = {
  pc: 'focus-visible:shadow-[inset_3px_0_0_var(--ent-pc),var(--glow-gold)]',
  npc: 'focus-visible:shadow-[inset_3px_0_0_var(--ent-npc),var(--glow-gold)]',
  monster: 'focus-visible:shadow-[inset_3px_0_0_var(--ent-monster),var(--glow-gold)]',
  item: 'focus-visible:shadow-[inset_3px_0_0_var(--ent-item),var(--glow-gold)]',
  location: 'focus-visible:shadow-[inset_3px_0_0_var(--ent-loc),var(--glow-gold)]',
  faction: 'focus-visible:shadow-[inset_3px_0_0_var(--ent-faction),var(--glow-gold)]',
  plane: 'focus-visible:shadow-[inset_3px_0_0_var(--ent-plane),var(--glow-gold)]',
  planet: 'focus-visible:shadow-[inset_3px_0_0_var(--ent-plane),var(--glow-gold)]',
  deity: 'focus-visible:shadow-[inset_3px_0_0_var(--ent-deity),var(--glow-gold)]',
  event: 'focus-visible:shadow-[inset_3px_0_0_var(--ent-event),var(--glow-gold)]',
};

/** Метка порога хитов — заливка, как у полосы HpBar; текстом hp-* не ставится. Строки полные — Tailwind ищет их в исходнике. */
const HP_MARK: Readonly<Record<HpLevel, string>> = {
  high: 'bg-hp-high',
  mid: 'bg-hp-mid',
  low: 'bg-hp-low',
};
const HP_MARK_TITLE: Readonly<Record<HpLevel, string>> = {
  high: 'Хиты выше половины',
  mid: 'Хиты от четверти до половины',
  low: 'Хиты ниже четверти',
};

/** Тултип корешка: «Bandit Captain · CR 2»; ждёт решения — «Neverwinter · Поселение · ждёт решения». */
export function stackItemTitle(it: CardStackItem): string {
  const base = it.badge ? `${it.name} · ${it.badge}` : it.name;
  return it.pending ? `${base} · ждёт решения` : base;
}

/** Актёр → корешок: PC с уровнем, монстр с CR из блока SRD, NPC без бейджа. Хиты — та же тройка, что везде. */
export function stackItemOf(actor: Actor): CardStackItem {
  if (actor.kind === 'monster') {
    return {
      id: actor.id,
      name: actor.name,
      type: 'monster',
      hp: actor.hp,
      badge: actor.monsterId ? `CR ${MONSTERS[actor.monsterId].cr}` : undefined,
    };
  }
  return {
    id: actor.id,
    name: actor.name,
    type: actor.kind,
    hp: actor.hp,
    badge: actor.sheet ? String(actor.sheet.level) : undefined,
  };
}

export function CardStack({ title, icon, items, onOpen, className = '' }: CardStackProps) {
  return (
    <div role="group" aria-label={title} className={`flex flex-col bg-pn shadow-bevel ${className}`}>
      {title ? (
        <div data-part="head" className="flex items-center gap-1.5 px-2 py-1 bg-linear-to-b from-pl to-cd shadow-plate type-h-15 uppercase text-t2">
          {icon ? <Icon name={icon} size={16} color="var(--t2)" title={title} /> : null}
          <span className="truncate">{title}</span>
          {/* Счётчик на плите pl — t2: t3 на плите даёт 4.0:1 и туда не ставится. */}
          <span className="ml-auto type-key text-t2" title="Корешков в стопке">{items.length}</span>
        </div>
      ) : null}
      {items.map(it => {
        const ent = ENTITY[it.type];
        const lvl = it.hp ? hpLevel(it.hp.current, it.hp.max) : null;
        return (
          <button
            key={it.id}
            type="button"
            data-entity-type={it.type}
            data-selected={it.selected || undefined}
            data-pending={it.pending || undefined}
            aria-current={it.selected ? 'true' : undefined}
            title={stackItemTitle(it)}
            onClick={() => onOpen?.(it)}
            className={`flex h-spine-h cursor-pointer items-center gap-2 px-2 ${it.selected ? 'bg-cd' : 'bg-pn hover:bg-cd'} type-h-17 text-tx ${EDGE[it.type]} ${FOCUS[it.type]}`}
          >
            <Icon name={it.icon ?? ent.icon} size={16} color={ent.color} title={ent.label} />
            <span className={`flex-1 min-w-0 truncate text-left ${it.selected ? 'text-gd-hi' : 'text-tx'}`}>{it.name}</span>
            {it.hp && lvl ? (
              <span className="flex flex-none items-center gap-1" data-part="hp">
                {/* Метка порога — форма и заливка; смысл несёт число рядом, метка для скринридера лишняя. */}
                <span aria-hidden="true" data-hp={lvl} title={HP_MARK_TITLE[lvl]} className={`size-2 flex-none ${HP_MARK[lvl]}`} />
                <span className="type-num-12 text-tx" title="Хиты">{hpText(it.hp)}</span>
              </span>
            ) : null}
            {it.badge ? <span className="type-num-12 flex-none px-1 py-px bg-cd shadow-bevel text-t2">{it.badge}</span> : null}
            {it.pending ? <Icon name={ORIGIN.sim.icon} size={16} color={ORIGIN.sim.color} title={ORIGIN.sim.label} /> : null}
          </button>
        );
      })}
    </div>
  );
}

export default CardStack;
