import { type Tempo } from '../engine/events';
import type { Command } from '../engine/events';
import type { State } from '../engine/state';
export { timeStepEnd, needsTimePreview } from './timeStepInterval';
import { planTimeStep, type TimeStepPlan } from './simulation';
import type { ConditionId } from '../rules/srd/conditions';

export interface TimeStepPreview extends TimeStepPlan {
  deadlines: readonly { actor: string; name: string; condition?: ConditionId }[];
}

/** После подготовки правил: тот же прогноз, что у stepTime, без event log и принятия патчей. */
export function previewTimeStep(
  state: State,
  tempo: Tempo,
  steps: number,
  eventId = 'preview-only',
  baseLength = 0,
  prelude: readonly Command[] = [],
): TimeStepPreview {
  const plan = planTimeStep(state, tempo, steps, eventId, baseLength, prelude);
  const { fromSec, toSec } = plan;
  const deadlines: { actor: string; name: string; condition?: ConditionId }[] = [];
  const crossed = (sec: number | undefined) => sec !== undefined && sec > fromSec && sec <= toSec;
  for (const actor of Object.values(state.actors)) {
    if (actor.removed) continue;
    if (crossed(actor.concentration?.untilSec)) deadlines.push({ actor: actor.name, name: actor.concentration!.spell });
    for (const effect of actor.effects ?? []) if (crossed(effect.untilSec)) deadlines.push({ actor: actor.name, name: effect.name });
    for (const [id, condition] of Object.entries(actor.conditions)) if (crossed(condition?.untilSec)) deadlines.push({ actor: actor.name, name: id, condition: id as ConditionId });
  }
  return { ...plan, deadlines };
}
