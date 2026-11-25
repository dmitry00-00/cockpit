// Отдых за живым столом (решение владельца 21.09.2026): кость хитов — по классу листа через SRD, запас — уровень
// минус потраченные (REST_TAKEN), кандидаты — партия и NPC. Сам отдых — два события: TIME_ADVANCED на час или
// восемь (с предложениями симуляции за отрезок — мир живёт, пока партия спит) и REST_TAKEN за ним. Часы двигает
// только TIME_ADVANCED; редьюсер отдыха времени не касается. Ресурсы, которые вернёт короткий отдых, считает
// resources.ts (restResourcesOf) — форма показывает, мастер решает. Чистые функции плюс takeRest над стором.
import type { DomainEvent, RestContext, RestHitDice, RestKind, RestResource } from '../engine/events';
import type { Actor, State, WorldDelta } from '../engine/state';
import type { EngineStore } from '../engine/store';
import { classById } from '../rules/compendium';
import { BOOK_CLASS_RULES } from '../rules/compendium/bookClassRules';
import { a5eRestCompletes } from '../rules/a5e/rest';
import { abilityMod, srdClassOf } from './derive';
import { stepTime } from './simulation';
import { eatSupply, supplyOf } from './supply';

/** Короткий отдых — не меньше часа, долгий — не меньше восьми (SRD). */
export const REST_HOURS: Readonly<Record<RestKind, number>> = { short: 1, long: 8 };

export { a5eRestCompletes } from '../rules/a5e/rest';

/** Rest rules are a campaign choice. SRD remains the default until a campaign explicitly selects A5E. */
export type { RestContext } from '../engine/events';
export type { RestLayer } from '../engine/state';

/** A5E Journey rules §Havens: 2+ fatigue/strife levels recover only on a long rest in a haven. */
export const A5E_HAVEN_RULE = 'A5E: долгий отдых в укрытии с Supply снимает по одному уровню усталости и strife; без укрытия — только первый уровень. Для походной ночёвки без безопасного сна это не действует.';

/** Записать Haven места обычной дельтой мира: принятие применяет WorldPatch, undo возвращает прошлое поле. */
export function locationHavenDelta(state: State, locationId: string, haven: boolean): WorldDelta | null {
  const place = state.world.locations[locationId];
  if (!place || Boolean(place.haven) === haven) return null;
  const base = `d-rest-haven-${locationId}-${haven ? 'on' : 'off'}`;
  let id = base;
  for (let suffix = 2; state.deltas[id]; suffix++) id = `${base}-${suffix}`;
  return {
    id, scale: place.scale, subject: `Укрытие · ${place.name}`,
    was: place.haven ? 'укрытие' : 'не укрытие', now: haven ? 'укрытие' : 'не укрытие',
    cause: 'установка Haven мастером', causeId: place.id, status: 'pending',
    patch: { kind: 'location', id: place.id, field: 'haven', value: haven },
  };
}

export interface HitDicePool {
  /** Грани кости класса: d6 у волшебника, d10 у следопыта и воина. */
  die: number;
  /** Всего костей — уровень. */
  total: number;
  spent: number;
  available: number;
  /** Present for explicitly sourced non-SRD class rules. */
  ruleset?: { id: string; version: string; layer: 'book' };
  reference?: string;
}

/** Кости хитов актёра по листу; без листа или с классом вне SRD — нет (тратить нечего). */
export function hitDiceOf(actor: Actor): HitDicePool | undefined {
  if (!actor.sheet) return undefined;
  const cls = classById(actor.sheet.classId);
  if (!cls) return undefined;
  let die: number;
  try {
    die = srdClassOf(cls).hitDie;
  } catch {
    const bookRule = BOOK_CLASS_RULES[cls.id];
    if (!bookRule) return undefined;
    const spent = actor.hitDiceSpent ?? 0;
    return {
      die: bookRule.hitDie, total: actor.sheet.level, spent,
      available: Math.max(0, actor.sheet.level - spent),
      ruleset: bookRule.ruleset, reference: bookRule.reference,
    };
  }
  const spent = actor.hitDiceSpent ?? 0;
  return { die, total: actor.sheet.level, spent, available: Math.max(0, actor.sheet.level - spent) };
}

/** Модификатор CON к каждой кости хитов (SRD); без листа — 0. */
export function conModOf(actor: Actor): number {
  return actor.sheet ? abilityMod(actor.sheet.abilities.con) : 0;
}

/** «2d10+4», «2d10-2», «1d8»: формула броска костей хитов — CON за каждую кость. */
export function hitDiceFormula(count: number, die: number, conMod: number): string {
  const mod = count * conMod;
  return `${count}d${die}${mod > 0 ? `+${mod}` : mod < 0 ? `${mod}` : ''}`;
}

/** Кто может отдыхать: партия в порядке корешка, затем NPC; выбывшие — нет. Чудовища не отдыхают на этом столе. */
export function restCandidates(state: State): Actor[] {
  const party = state.party.map(id => state.actors[id]).filter((a): a is Actor => a !== undefined && !a.removed);
  const npcs = Object.values(state.actors).filter(a => a.kind === 'npc' && !a.removed && !state.party.includes(a.id));
  return [...party, ...npcs];
}

export interface RestResult {
  time: DomainEvent<'TIME_ADVANCED'>;
  proposals: WorldDelta[];
  rest: DomainEvent<'REST_TAKEN'>;
  /** Съеденный Supply: для A5E — только явно отмеченные персонажи, для прежнего SRD поведения — все отдыхающие при наличии запаса. */
  supply: DomainEvent<'SUPPLY_CHANGED'> | null;
}

/**
 * Отдых целиком: шаг времени на его длину (симуляция предлагает, что случилось в мире за это время) и REST_TAKEN.
 * Порядок — время, потом отдых: отдых кончается в конце отрезка. Ctrl+Z снимает сначала отдых, потом время.
 */
export function takeRest(
  api: Pick<EngineStore, 'state' | 'advanceTime' | 'propose' | 'rest' | 'changeSupply'>,
  kind: RestKind,
  actorIds: readonly string[],
  hitDice: readonly RestHitDice[] = [],
  resources: readonly RestResource[] = [],
  context: RestContext = { layer: 'srd', haven: false },
): RestResult {
  if (context.a5eTiming !== undefined) {
    if (context.a5eTiming !== 'period-v1' && context.a5eTiming !== 'period-v2') throw new Error('неизвестная версия длительности A5E-отдыха');
    if (kind !== 'long' || context.layer !== 'a5e') throw new Error('длительность и прерывания доступны только для долгого отдыха A5E');
    if (!Number.isSafeInteger(context.a5eDurationHours) || (context.a5eDurationHours ?? 0) < REST_HOURS.long || !Number.isSafeInteger((context.a5eDurationHours ?? 0) * 3600)) throw new Error('долгий отдых A5E длится не менее 8 часов и должен укладываться в диапазон времени кампании');
    if (!Number.isSafeInteger(context.a5eStrenuousMinutes) || (context.a5eStrenuousMinutes ?? -1) < 0 || (context.a5eStrenuousMinutes ?? 0) > (context.a5eDurationHours ?? 0) * 60) {
      throw new Error('время напряжённой активности должно быть целым числом минут в пределах периода отдыха');
    }
    if (context.a5eTiming === 'period-v2' && (!Number.isSafeInteger(context.a5eSleepHours) || (context.a5eSleepHours ?? -1) < 0 || (context.a5eSleepHours ?? 0) > (context.a5eDurationHours ?? 0))) {
      throw new Error('время сна должно быть целым числом часов в пределах периода отдыха');
    }
  }
  const completesA5eLongRest = kind !== 'long' || context.layer !== 'a5e' || a5eRestCompletes(context);
  const sleeplessFailed = new Set(context.a5eSleeplessFailedActorIds ?? []);
  const longRestActorIds = actorIds.filter(id => !sleeplessFailed.has(id));
  const durationHours = kind === 'long' && context.layer === 'a5e' && (context.a5eTiming === 'period-v1' || context.a5eTiming === 'period-v2')
    ? context.a5eDurationHours!
    : REST_HOURS[kind];
  // Check before TIME_ADVANCED so a rejected A5E long rest leaves world time untouched.
  if (completesA5eLongRest && kind === 'long' && context.layer === 'a5e' && context.a5eStartHp === 'min-1-v1') {
    const belowMinimum = longRestActorIds.find(id => (api.state.actors[id]?.hp.current ?? 0) < 1);
    if (belowMinimum) throw new Error(`${api.state.actors[belowMinimum]?.name ?? belowMinimum}: для долгого отдыха A5E нужно иметь хотя бы 1 HP в его начале`);
  }
  if (completesA5eLongRest && kind === 'long' && context.layer === 'a5e' && context.a5eCadence === '24h-v1') {
    const blocked = longRestActorIds.find(id => {
      const last = api.state.actors[id]?.a5eLastLongRestAt;
      return last !== undefined && api.state.time.sec + durationHours * 3600 < last + 86_400;
    });
    if (blocked) throw new Error(`${api.state.actors[blocked]?.name ?? blocked}: A5E long rest даёт пользу не чаще одного раза за 24 часа`);
  }
  const { event: time, proposals } = stepTime(api, 'hour', durationHours);
  const suppliedActorIds = completesA5eLongRest && context.layer === 'a5e' && kind === 'long'
    ? [...new Set(context.suppliedActorIds ?? [])].filter(id => longRestActorIds.includes(id))
    : undefined;
  const supplyConsumed = completesA5eLongRest && kind === 'long' && longRestActorIds.length > 0 && (context.layer === 'a5e'
    ? suppliedActorIds?.length === longRestActorIds.length
    : supplyOf(api.state) >= longRestActorIds.length);
  const restContext = {
    ...context,
    ...(kind === 'long' ? {
      supplyConsumed,
      ...(context.layer === 'a5e' && !completesA5eLongRest ? { suppliedActorIds: [] } : suppliedActorIds ? { suppliedActorIds } : {}),
    } : {}),
  };
  const fallbackResources = kind === 'long' ? resources.filter(r => sleeplessFailed.has(r.actorId)) : resources;
  const rest = api.rest(kind, actorIds, hitDice, fallbackResources, restContext);
  const supplyToEat = !completesA5eLongRest ? 0 : context.layer === 'a5e' && kind === 'long' ? (suppliedActorIds?.length ?? 0) : longRestActorIds.length;
  return { time, proposals, rest, supply: kind === 'long' && supplyToEat > 0 ? eatSupply(api, supplyToEat) : null };
}
