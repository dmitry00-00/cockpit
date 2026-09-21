// Отдых за живым столом (решение владельца 21.09.2026): кость хитов — по классу листа через SRD, запас — уровень
// минус потраченные (REST_TAKEN), кандидаты — партия и NPC. Сам отдых — два события: TIME_ADVANCED на час или
// восемь (с предложениями симуляции за отрезок — мир живёт, пока партия спит) и REST_TAKEN за ним. Часы двигает
// только TIME_ADVANCED; редьюсер отдыха времени не касается. Ресурсы, которые вернёт короткий отдых, считает
// resources.ts (restResourcesOf) — форма показывает, мастер решает. Чистые функции плюс takeRest над стором.
import type { DomainEvent, RestHitDice, RestKind, RestResource } from '../engine/events';
import type { Actor, State, WorldDelta } from '../engine/state';
import type { EngineStore } from '../engine/store';
import { classById } from '../rules/compendium';
import { abilityMod, srdClassOf } from './derive';
import { stepTime } from './simulation';

/** Короткий отдых — не меньше часа, долгий — не меньше восьми (SRD). */
export const REST_HOURS: Readonly<Record<RestKind, number>> = { short: 1, long: 8 };

export interface HitDicePool {
  /** Грани кости класса: d6 у волшебника, d10 у следопыта и воина. */
  die: number;
  /** Всего костей — уровень. */
  total: number;
  spent: number;
  available: number;
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
    return undefined;
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
}

/**
 * Отдых целиком: шаг времени на его длину (симуляция предлагает, что случилось в мире за это время) и REST_TAKEN.
 * Порядок — время, потом отдых: отдых кончается в конце отрезка. Ctrl+Z снимает сначала отдых, потом время.
 */
export function takeRest(
  api: Pick<EngineStore, 'state' | 'advanceTime' | 'propose' | 'rest'>,
  kind: RestKind,
  actorIds: readonly string[],
  hitDice: readonly RestHitDice[] = [],
  resources: readonly RestResource[] = [],
): RestResult {
  const { event: time, proposals } = stepTime(api, 'hour', REST_HOURS[kind]);
  const rest = api.rest(kind, actorIds, hitDice, resources);
  return { time, proposals, rest };
}
