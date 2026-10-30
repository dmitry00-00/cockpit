// Поход партии по карте (решение владельца 27.10.2026): дни пути по Travel Pace SRD → шаг времени днями
// (с предложениями симуляции за это время, как у любого шага) → PARTY_TRAVELED. Два события, как у отдыха:
// время в системе меняет одно событие, TIME_ADVANCED. Неполный последний день — тоже день в пути. Третьим — припасы
// (29.10.2026): за каждый календарный день пути — длинный отдых в дороге, Supply A5E на каждого (campaign/supply.ts).
import type { DomainEvent, PartyTraveled } from '../engine/events';
import type { WorldDelta } from '../engine/state';
import type { EngineStore } from '../engine/store';
import { stepTime } from './simulation';
import { eatSupply, mouthsOf } from './supply';

export interface TravelResult {
  time: DomainEvent<'TIME_ADVANCED'>;
  proposals: WorldDelta[];
  travel: DomainEvent<'PARTY_TRAVELED'>;
  supply: DomainEvent<'SUPPLY_CHANGED'> | null;
}

/** Сколько календарных дней двигать часы: дни пути вверх до целого (2,4 дня — партия приходит на третий). */
export const travelCalendarDays = (days: number): number => Math.max(1, Math.ceil(days - 1e-9));

export function travel(api: Pick<EngineStore, 'state' | 'advanceTime' | 'propose' | 'travel' | 'changeSupply'>, route: PartyTraveled): TravelResult {
  const days = travelCalendarDays(route.days);
  const { event: time, proposals } = stepTime(api, 'day', days);
  const event = api.travel(route);
  // api.state — снимок до похода: припасы меняет только SUPPLY_CHANGED, так что их число в снимке верное.
  return { time, proposals, travel: event, supply: eatSupply(api, days * mouthsOf(api.state)) };
}
