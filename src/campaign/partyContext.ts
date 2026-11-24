/** Facts for the area below the party cards. A completed journey/rest is history,
 * never proof that a party is currently travelling or has established a camp. */
import type { DomainEvent } from '../engine/events';
import type { GoodsId, State, WorldPatch } from '../engine/state';
import { partyPlaceId } from '../engine/ladder';
import { undoneIds } from '../engine/journal';
import { mouthsOf, supplyCapacity, supplyOf } from './supply';
import { priceRowOf, pricedGoods } from './pulse';

export interface PartyMarketContext {
  locationId: string;
  locationName: string;
  goods: readonly { id: GoodsId; index: number; pending?: number }[];
}

export interface PartyContextSnapshot {
  members: number;
  location?: { id: string; name: string; haven: boolean };
  /** Distinct, audience-visible positions. Present when multiple members have different locations. */
  positions?: readonly { id: string; name: string; members: number }[];
  split?: boolean;
  locationIncomplete?: boolean;
  /** DM-only context for manually sourced prices; an index is not an item price. */
  market?: PartyMarketContext;
  supply: { value: number; capacity: number | null; perDay: number; days?: number };
  lastJourney?: { eventId: string; from?: string; to: string; miles: number; days: number; atSec: number };
  lastRest?: { eventId: string; kind: 'short' | 'long'; participants: string[]; atSec: number };
}

export function partyContextOf(state: State, events: readonly DomainEvent[], players = false): PartyContextSnapshot {
  const party = state.party.map(id => state.actors[id]).filter(a => a && !a.removed);
  const partyIds = new Set(party.map(a => a.id));
  const visiblePlace = (id: string | undefined) => {
    const loc = id ? state.world.locations[id] : undefined;
    return loc && (!players || loc.revealed) ? loc : undefined;
  };
  const groups = new Map<string, number>();
  for (const member of party) if (member.locationId && state.world.locations[member.locationId]) {
    groups.set(member.locationId, (groups.get(member.locationId) ?? 0) + 1);
  }
  const split = groups.size > 1;
  const missingPosition = party.some(member => !member.locationId || !state.world.locations[member.locationId]);
  const locationIncomplete = missingPosition && (groups.size > 0 || party.some(member => !!member.locationId));
  const positions = [...groups].flatMap(([id, count]) => {
    const place = visiblePlace(id);
    return place ? [{ id, name: place.name, members: count }] : [];
  });
  const location = party.length ? visiblePlace(partyPlaceId({...state,party:party.map(a => a.id)})) : undefined;
  let market: PartyMarketContext | undefined;
  if (location?.scale === 'settlement' && !players) {
    const patches = Object.values(state.deltas).flatMap(delta => delta.status === 'pending' && delta.patch ? [delta.patch] : []) as WorldPatch[];
    const row = priceRowOf(location, patches);
    market = { locationId: location.id, locationName: location.name, goods: pricedGoods([row]).map(id => ({ id, ...row.goods[id] })) };
  }
  const value = supplyOf(state), perDay = mouthsOf(state);
  const snapshot: PartyContextSnapshot = {
    members: party.length,
    ...(location ? {location:{id:location.id,name:location.name,haven:!!location.haven}} : {}),
    ...(split ? { split: true } : {}),
    ...(split || locationIncomplete ? { positions } : {}),
    ...(locationIncomplete ? { locationIncomplete: true } : {}),
    ...(market ? { market } : {}),
    supply: {value,capacity:supplyCapacity(state),perDay,...(perDay > 0 ? {days:Math.floor(value/perDay)} : {})},
  };
  const undone = undoneIds(events);
  for (let i=events.length-1; i>=0; i--) {
    const event = events[i];
    if (event.undoes || event.redoes || undone.has(event.id)) continue;
    if (!snapshot.lastJourney && event.type === 'PARTY_TRAVELED') {
      const journey = event as DomainEvent<'PARTY_TRAVELED'>;
      const to = visiblePlace(journey.payload.toId);
      const from = visiblePlace(journey.payload.fromId);
      // Unknown destinations and origins do not acquire public names through travel metadata.
      if (to && (!players || !journey.payload.fromId || from)) snapshot.lastJourney = {
        eventId:event.id,...(from ? {from:from.name} : {}),to:to.name,
        miles:journey.payload.miles,days:journey.payload.days,atSec:event.worldSec,
      };
    }
    if (!snapshot.lastRest && event.type === 'REST_TAKEN') {
      const rest = event as DomainEvent<'REST_TAKEN'>;
      const participants = rest.payload.actorIds.filter(id => partyIds.has(id)).map(id => state.actors[id].name);
      if (participants.length) snapshot.lastRest = {eventId:event.id,kind:rest.payload.kind,participants,atSec:event.worldSec};
    }
    if (snapshot.lastJourney && snapshot.lastRest) break;
  }
  return snapshot;
}
