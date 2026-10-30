// Токен инициативы (F2, полоса боя): плита 48×48 с числом инициативы в левом верхнем углу, иконкой типа
// по центру и полоской хитов 5px внизу. Токен ничего не хранит и в стор не ходит — всё приходит пропсами,
// проекция initiativeTokenOf() из актёра лежит рядом и проверяется без рендера.
//
// Состояния HANDOFF §8: текущий ход — масштаб 125 % и кольцо token-active поверх фаски (золотой плиты в
// токенах нет, спека §10.1 — как у уровня в корешке партии, вместо неё плита pl и золотое число);
// 0 HP — токен гаснет (op-disabled), но из порядка не пропадает; легендарные действия — пипки 4×4 gd
// сверху справа, внутри плиты (снаружи их срезал бы прокручиваемый ряд полосы); логово — отдельный слот
// на инициативе 20 без хитов. Выбор на столе — золотое кольцо без масштаба.
//
// Кнопка — одна на токен, дети презентационные: число инициативы и полоска скрыты от ассистивной
// технологии, а имя кнопки — sr-only сводка с хитами (как partyRowDescription). Строки классов полные:
// Tailwind ищет их в исходнике.

import type { Actor } from '../engine';
import { Icon } from '../icons/Icon';
import { ENTITY, type EntityType } from './EntityCard';
import { hpLevel, hpText, type HpLevel, type HpTriple } from './HpBar';

export interface InitiativeTokenProps {
  id: string;
  name: string;
  type: EntityType;
  initiative: number;
  /** У слота логова хитов нет. */
  hp?: HpTriple;
  /** Текущий ход: масштаб 125 %, кольцо token-active, плита pl; z-index выше соседей. */
  active?: boolean;
  /** Выбран на столе: золотое кольцо без масштаба. */
  selected?: boolean;
  /** Легендарные действия — столько пипок 4×4 сверху справа. */
  legendary?: number;
  /** Слот логова на инициативе 20: иконка scale-building, title «Логово», без хитов. */
  lair?: boolean;
  onOpen?: (id: string) => void;
  className?: string;
}

/** Заливка полоски — те же токены, что у HpBar; текстом hp-* не ставятся. Строки полные. */
const FILL: Readonly<Record<HpLevel, string>> = {
  high: 'bg-hp-high',
  mid: 'bg-hp-mid',
  low: 'bg-hp-low',
};

/**
 * Тень токена по состоянию, вместе с кольцом фокуса: глобальное кольцо затирает фаску и кольцо хода,
 * поэтому каждое сочетание — своей строкой. Кольцо фокуса всегда gd; token-active — снаружи, остальное внутри.
 */
export function initiativeTokenShadow(active: boolean, selected: boolean): string {
  if (active && selected) return 'shadow-[var(--bevel),var(--glow-gold),var(--token-active)] focus-visible:shadow-[var(--bevel),var(--glow-gold),var(--token-active)]';
  if (active) return 'shadow-[var(--bevel),var(--token-active)] focus-visible:shadow-[var(--bevel),var(--glow-gold),var(--token-active)]';
  if (selected) return 'shadow-[var(--bevel),var(--glow-gold)] focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
  return 'shadow-bevel focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
}

/** Ширина заливки полоски в процентах от max: временные хиты в 5px не поместятся, и полоска говорит о настоящих. */
export function tokenHpPct(hp: HpTriple): number {
  if (hp.max <= 0) return 0;
  return Math.max(0, Math.min(100, (hp.current / hp.max) * 100));
}

/** Тултип: «Bo Tambernack · инициатива 15 · хиты 41/49»; у логова хитов нет. */
export function initiativeTokenTitle(t: Pick<InitiativeTokenProps, 'name' | 'initiative' | 'hp' | 'lair'>): string {
  const head = `${t.lair ? 'Логово' : t.name} · инициатива ${t.initiative}`;
  return t.hp ? `${head} · хиты ${hpText(t.hp)}` : head;
}

/** Сводка для скринридера — имя кнопки: имя, инициатива, хиты словами, легендарные действия. */
export function initiativeTokenDescription(t: Pick<InitiativeTokenProps, 'name' | 'initiative' | 'hp' | 'lair' | 'legendary'>): string {
  const parts = [t.lair ? 'Логово' : t.name, `инициатива ${t.initiative}`];
  if (t.hp) {
    parts.push(t.hp.current === 0
      ? `0 хитов из ${t.hp.max}`
      : `хиты ${t.hp.current} из ${t.hp.max}${t.hp.temp > 0 ? `, временные ${t.hp.temp}` : ''}`);
  }
  if (t.legendary && t.legendary > 0) parts.push(`легендарных действий ${t.legendary}`);
  return parts.join(', ');
}

/**
 * Полоска хитов токена: жёлоб 5px с фаской внутрь и заливка по порогу. Презентационная — хиты читаются из
 * сводки кнопки. Одна на токен инициативы и токен сетки, чтобы обе полоски красили одно и то же одинаково.
 */
export function TokenHpStrip({ hp }: { hp: HpTriple }) {
  const lvl = hpLevel(hp.current, hp.max);
  return (
    <span aria-hidden="true" data-part="hp" className="absolute left-px right-px bottom-px h-[5px] bg-hp-track shadow-bevel-in">
      {/* Ширина считается — единственный законный inline-стиль. */}
      <span data-part="fill" data-hp={lvl} className={`block h-full ${FILL[lvl]}`} style={{ width: `${tokenHpPct(hp)}%` }} />
    </span>
  );
}

/** Актёр → токен. Тип из kind; легендарные действия блока полоса показывает колонкой рядом (Q13, campaign/legendary.ts) — здесь undefined. На столе игроков у монстра нет хитов (Q1). */
export function initiativeTokenOf(actor: Actor, initiative: number, opts: { players?: boolean } = {}): Omit<InitiativeTokenProps, 'active' | 'selected' | 'onOpen' | 'className'> {
  return {
    id: actor.id,
    name: actor.name,
    type: actor.kind,
    initiative,
    ...(opts.players && actor.kind === 'monster' ? {} : { hp: actor.hp }),
  };
}

export function InitiativeToken({
  id, name, type, initiative, hp, active = false, selected = false, legendary, lair = false, onOpen, className = '',
}: InitiativeTokenProps) {
  const down = hp !== undefined && hp.current === 0;
  const ent = ENTITY[type];
  const pips = Math.max(0, Math.floor(legendary ?? 0));
  // Активный — плита pl (верх лестницы) и масштаб: движение только в ответ на «следующий ход», шагами, короче 200 мс.
  const surface = active ? 'bg-pl scale-125 z-10' : 'bg-linear-to-b from-pl to-cd';
  return (
    <button
      type="button"
      data-actor={id}
      data-active={active ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      data-down={down ? 'true' : undefined}
      data-lair={lair ? 'true' : undefined}
      aria-current={active ? 'true' : undefined}
      aria-pressed={selected}
      title={initiativeTokenTitle({ name, initiative, hp, lair })}
      onClick={() => onOpen?.(id)}
      className={`relative flex-none size-12 flex items-center justify-center cursor-pointer [transition:transform_120ms_steps(4,end)] ${surface} ${initiativeTokenShadow(active, selected)} ${down ? 'opacity-(--op-disabled)' : ''} ${className}`}
    >
      <span className="sr-only">{initiativeTokenDescription({ name, initiative, hp, lair, legendary: pips })}</span>
      {/* Утопленная бирка числа — bg под фаской внутрь; у текущего хода число золотое (gd-hi на bg 12.8:1). */}
      <span aria-hidden="true" data-part="init" className={`absolute top-0 left-0 type-num-12 px-[3px] bg-bg shadow-bevel-in ${active ? 'text-gd-hi' : 'text-t2'}`}>
        {initiative}
      </span>
      {pips > 0 ? (
        <span aria-hidden="true" data-part="legendary" title={`Легендарные действия: ${pips}`} className="absolute top-0.5 right-0.5 flex gap-0.5">
          {Array.from({ length: pips }, (_, i) => <span key={i} className="size-1 bg-gd" />)}
        </span>
      ) : null}
      {lair
        ? <Icon name="scale-building" size={24} color="var(--tx)" title="Логово" />
        : <Icon name={ent.icon} size={24} color={down ? 'var(--t3)' : 'var(--tx)'} title={ent.label} />}
      {hp ? <TokenHpStrip hp={hp} /> : null}
    </button>
  );
}

export default InitiativeToken;
