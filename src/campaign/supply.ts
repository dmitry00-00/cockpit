// Общий запас партии — Supply A5E (решение владельца 29.10.2026). Правило дословно — content/a5e/journey.json, rules.supply:
// «1 Supply … sustain a Small-or Medium-sized creature for a day», «Whenever a creature takes a long rest, it must consume
// Supply. If it does not, it gains a level of fatigue», «A creature can carry a number of Supply equal to its Strength
// score». Размер рас в компендиуме разобран эвристикой, поэтому каждый в партии — Small или Medium: 1 Supply в день.
// Усталость (fatigue) — состояние A5E, не SRD: система её не ставит, журнал пишет, сколько не хватило.
import type { DomainEvent } from '../engine/events';
import type { State } from '../engine/state';
import type { EngineStore } from '../engine/store';

export const supplyOf = (state: State): number => state.supply ?? 0;

/** Кто ест: партия без выбывших. */
export const mouthsOf = (state: State): number => state.party.filter(id => state.actors[id] && !state.actors[id].removed).length;

/** Сколько партия унесёт: Сила каждого по листу. Хоть у одного нет листа — не знаем (null), а не меньше. */
export function supplyCapacity(state: State): number | null {
  let sum = 0;
  for (const id of state.party) {
    const a = state.actors[id];
    if (!a || a.removed) continue;
    if (!a.sheet) return null;
    sum += a.sheet.abilities.str;
  }
  return sum;
}

/**
 * Съесть `need` припасов: сколько есть, остальное — «не хватило» в том же событии. Нечего есть и нечего списать —
 * событие всё равно пишется (0 и нехватка): журнал должен сказать, что партия голодала.
 */
export function eatSupply(api: Pick<EngineStore, 'state' | 'changeSupply'>, need: number): DomainEvent<'SUPPLY_CHANGED'> | null {
  if (need <= 0) return null;
  const eaten = Math.min(supplyOf(api.state), need);
  return api.changeSupply('eaten', eaten, need - eaten || undefined);
}
