// Поход партии по карте (решение владельца 27.10.2026): дни пути по Travel Pace SRD → шаг времени днями
// (с предложениями симуляции за это время, как у любого шага) → PARTY_TRAVELED. Два события, как у отдыха:
// время в системе меняет одно событие, TIME_ADVANCED. Неполный последний день — тоже день в пути.
import type { DomainEvent, PartyTraveled } from '../engine/events';
import type { WorldDelta } from '../engine/state';
import type { EngineStore } from '../engine/store';
import { stepTime } from './simulation';

export interface TravelResult {
  time: DomainEvent<'TIME_ADVANCED'>;
  proposals: WorldDelta[];
  travel: DomainEvent<'PARTY_TRAVELED'>;
}

/** Сколько календарных дней двигать часы: дни пути вверх до целого (2,4 дня — партия приходит на третий). */
export const travelCalendarDays = (days: number): number => Math.max(1, Math.ceil(days - 1e-9));

export function travel(api: Pick<EngineStore, 'state' | 'advanceTime' | 'propose' | 'travel'>, route: PartyTraveled): TravelResult {
  const { event: time, proposals } = stepTime(api, 'day', travelCalendarDays(route.days));
  const event = api.travel(route);
  return { time, proposals, travel: event };
}
