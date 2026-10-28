// Корешок партии: список строк шириной 240px (HANDOFF §4) в порядке state.party. Список — тупой:
// актёров, время мира и словарь мест даёт страница, выбор карточки — состояние страницы, не событие.
// Первый экран, где урон виден глазами: строка и карточка читают один и тот же actor.hp из State.

import type { Actor } from '../engine';
import type { HpFlash } from './HpBar';
import { PartySpineRow, type AwayLocation, type PartySpineRowProps } from './PartySpineRow';

export interface PartySpineProps {
  /** Актёры партии в порядке показа — state.party.map(id => state.actors[id]). */
  actors: readonly Actor[];
  /** Текущее время мира — для таймеров концентрации и эффектов. */
  worldSec: number;
  /** Чья карточка открыта: строка получает золотое кольцо и aria-current. */
  selectedId?: string;
  onOpen: (id: string) => void;
  /** Вспышка по актёру; не задана для актёра — строка замечает изменение хитов сама (см. PartySpineRow). */
  flash?: Readonly<Record<string, HpFlash>>;
  /** Места для строки «отделился от партии» — state.world.locations подходит как есть. */
  locations?: Readonly<Record<string, AwayLocation>>;
  /** Спасброски от смерти по актёру; поля в State пока нет (HANDOFF §7). */
  deathSaves?: Readonly<Record<string, NonNullable<PartySpineRowProps['deathSaves']>>>;
  /** Отмеченные строки для подвала партии; без onCheck флажков нет. */
  checkedIds?: ReadonlySet<string>;
  onCheck?: (id: string) => void;
  className?: string;
}

export function PartySpine({ actors, worldSec, selectedId, onOpen, flash, locations, deathSaves, checkedIds, onCheck, className = '' }: PartySpineProps) {
  return (
    <ul aria-label="Партия" className={`flex flex-col gap-1 w-rail-party ${className}`}>
      {actors.map(actor => (
        <li key={actor.id}>
          <PartySpineRow
            actor={actor}
            worldSec={worldSec}
            locations={locations}
            selected={actor.id === selectedId}
            onOpen={onOpen}
            flash={flash?.[actor.id]}
            deathSaves={deathSaves?.[actor.id]}
            checked={checkedIds?.has(actor.id) ?? false}
            onCheck={onCheck}
          />
        </li>
      ))}
    </ul>
  );
}

export default PartySpine;
