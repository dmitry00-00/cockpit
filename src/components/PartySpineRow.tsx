// Строка корешка партии: портрет с уровнем, имя, полоса хитов (или пипки при 0 HP), AC и пассивная
// внимательность, чипы состояний и концентрации, строка «отделился от партии». Всё приходит из Actor
// пропсом — строка ничего не хранит и в стор не ходит; хиты живут только в State движка.
// Проекция partyRowOf() отделена от разметки: её можно проверить без рендера и переиспользовать.
//
// Строка — контейнер (article), а не кнопка: у role=button дети презентационные, и полоса (meter),
// пипки (group) и чипы пропадали бы для ассистивной технологии. Открывает карточку кнопка имени —
// единственный элемент строки в порядке табуляции, Enter и Space у неё нативные; мышью открывает
// клик по любому месту строки (клик по кнопке всплывает до неё же — обработчик один). Сводка строки
// (хиты, чипы, «отделился») — описание этой кнопки, чтобы с фокуса было слышно состояние целиком.

import { useId } from 'react';
import type { Actor, ScaleLevel } from '../engine';
import { Icon, type IconName } from '../icons/Icon';
import { chipsOf, ConditionChip, type ChipSpec } from './ConditionChip';
import { DeathSaves, clampSaves, type DeathSavesProps } from './DeathSaves';
import { HpBar, type HpFlash, type HpTriple } from './HpBar';

/** Место, куда актёр ушёл от партии: имя и масштаб — из World.locations, больше строке не нужно. */
export interface AwayLocation {
  name: string;
  scale: ScaleLevel;
}

/** Всё, что строка печатает, в одном плоском объекте — из Actor, времени мира и словаря мест. */
export interface PartyRow {
  id: string;
  name: string;
  /** Уровень из листа; у актёра без листа бейджа нет. */
  level?: number;
  hp: HpTriple;
  ac: number;
  pp: number;
  /** Чипы в порядке chipsOf: состояния, эффекты, концентрация. */
  chips: ChipSpec[];
  /** Строка «отделился от партии»; иконка — масштаб места. */
  away?: { label: string; icon: IconName };
  /** 0 HP: вместо полосы — пипки спасбросков; приглушается только портрет, имя уходит в t2, числа и пипки — в полную силу. */
  down: boolean;
}

/**
 * Проекция актёра в строку. Место ищется по locationId в переданном словаре; если id есть, а места
 * нет — печатается сам id: пропавшая запись должна быть видна, а не молча спрятана.
 */
export function partyRowOf(actor: Actor, worldSec: number, locations?: Readonly<Record<string, AwayLocation>>): PartyRow {
  const loc = actor.locationId === undefined ? undefined : locations?.[actor.locationId];
  return {
    id: actor.id,
    name: actor.name,
    level: actor.sheet?.level,
    hp: actor.hp,
    ac: actor.ac,
    pp: actor.passivePerception,
    chips: chipsOf(actor, worldSec),
    away: actor.locationId === undefined
      ? undefined
      : { label: loc?.name ?? actor.locationId, icon: `scale-${loc?.scale ?? 'settlement'}` as IconName },
    down: actor.hp.current === 0,
  };
}

/**
 * Сводка строки для скринридера — описание кнопки имени: хиты (или «0 хитов» и спасброски), чипы с
 * уровнем и таймером, «отделился». Имя кнопки — «Открыть карточку: …», сводка читается следом.
 */
export function partyRowDescription(row: PartyRow, deathSaves?: Pick<DeathSavesProps, 'saves' | 'fails'>): string {
  const parts: string[] = [];
  if (row.down) {
    parts.push(`0 хитов из ${row.hp.max}, спасброски от смерти: успехов ${clampSaves(deathSaves?.saves ?? 0)} из 3, провалов ${clampSaves(deathSaves?.fails ?? 0)} из 3`);
  } else {
    parts.push(`хиты ${row.hp.current} из ${row.hp.max}${row.hp.temp > 0 ? `, временные ${row.hp.temp}` : ''}`);
  }
  for (const c of row.chips) {
    parts.push([c.level === undefined ? c.label : `${c.label} ${c.level}`, c.timer].filter(Boolean).join(', '));
  }
  if (row.away) parts.push(`отделился: ${row.away.label}`);
  return parts.join('; ');
}

export interface PartySpineRowProps {
  actor: Actor;
  /** Текущее время мира — для таймеров концентрации и эффектов. */
  worldSec: number;
  locations?: Readonly<Record<string, AwayLocation>>;
  selected?: boolean;
  onOpen: (id: string) => void;
  /** Вспышка полосы — из лога, через useHpFlashes на странице; таймер держит она же. */
  flash?: HpFlash;
  /** Спасброски от смерти при 0 HP. В State поля пока нет (HANDOFF §7) — без пропса пипки пустые. */
  deathSaves?: Pick<DeathSavesProps, 'saves' | 'fails'>;
  className?: string;
}

export function PartySpineRow({ actor, worldSec, locations, selected = false, onOpen, flash = null, deathSaves, className = '' }: PartySpineRowProps) {
  const row = partyRowOf(actor, worldSec, locations);
  const descId = useId();
  const open = () => onOpen(row.id);
  // Плита во всю ширину; выбранная — золотое кольцо поверх, как у карточки. Фокус на кнопке имени —
  // то же кольцо вокруг всей строки (has-focus-visible), а не вокруг текста: кольцо внутреннее,
  // на голом тексте оно легло бы поверх букв; своё кольцо кнопки поэтому снято.
  const surface = selected ? 'shadow-[var(--plate),var(--glow-gold)]' : 'shadow-plate';
  return (
    <article
      aria-label={row.name}
      aria-current={selected ? 'true' : undefined}
      data-actor={row.id}
      data-down={row.down ? 'true' : undefined}
      onClick={open}
      className={`flex gap-2 p-2 min-h-spine-party-h cursor-pointer bg-linear-to-b from-pl to-cd border-l-3 border-ent-pc ${surface} has-focus-visible:shadow-[var(--plate),var(--glow-gold)] ${className}`}
    >
      <span id={descId} className="sr-only">{partyRowDescription(row, deathSaves)}</span>
      {/* 0 HP — метка «выбыл» на портрете (.55 как в прототипе), а не на всей строке: пипки и числа читаются в полную силу. */}
      <div className={`relative flex-none size-8 flex items-center justify-center bg-cd shadow-bevel-in ${row.down ? 'opacity-55' : ''}`} data-part="portrait">
        <Icon name="ent-pc" size={24} color="var(--t2)" title="Персонаж игрока" />
        {row.level !== undefined && (
          // Золотой плиты в токенах нет (спека §10.1): пока плита pl с фаской и золотым текстом.
          <span className="absolute right-0 bottom-0 type-num-12 text-gd-hi bg-pl shadow-bevel px-[3px]" title="Уровень">
            {row.level}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        {/* Кнопка имени — единственный вход с клавиатуры. Выбывший — имя вторичным цветом (t2: 4.7:1 на pl), не прозрачностью. */}
        <button
          type="button"
          aria-label={`Открыть карточку: ${row.name}`}
          aria-describedby={descId}
          title={row.name}
          className={`w-full type-h-17 truncate text-left cursor-pointer focus-visible:shadow-none ${row.down ? 'text-t2' : 'text-tx'}`}
        >
          {row.name}
        </button>
        {row.down
          ? <DeathSaves saves={deathSaves?.saves ?? 0} fails={deathSaves?.fails ?? 0} />
          : <HpBar hp={row.hp} icon={false} label={row.name} flash={flash} />}
        <div className="flex items-center gap-1.5 flex-wrap type-num-12 text-t2">
          <span className="flex items-center gap-0.5" title="Класс доспеха" data-part="ac">
            <Icon name="ac" size={16} color="var(--t2)" title="AC" />
            <span>{row.ac}</span>
          </span>
          <span className="flex items-center gap-0.5" title="Пассивная внимательность" data-part="pp">
            <Icon name="src-players" size={16} color="var(--t2)" title="PP" />
            <span>{row.pp}</span>
          </span>
        </div>
        {row.chips.length > 0 && (
          <div className="flex gap-1 flex-wrap" data-part="chips">
            {/* id и key — не пропсы чипа: id остаётся у проекции, key уходит React'у напрямую.
                Чипы фокусируются: строка не кнопка, и тултип SRD открывается с клавиатуры и здесь. */}
            {row.chips.map(({ key, id, ...chip }) => <ConditionChip key={key} {...chip} />)}
          </div>
        )}
        {row.away && (
          <div className="flex items-center gap-1 type-body-sm text-t2" data-part="away" title="Отделился от партии">
            <Icon name={row.away.icon} size={16} color="var(--t2)" title="Место" />
            <span className="truncate">{row.away.label}</span>
          </div>
        )}
      </div>
    </article>
  );
}

export default PartySpineRow;
