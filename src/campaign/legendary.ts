// Легендарные действия монстра в бою (Q13): проекция блока и состояния, событий не пишет. Сколько всего — из
// вводного абзаца блока (rules/srd/legendary.ts), потрачено — ресурс 'legendary-actions' актёра, те же события, что у
// ресурсов листа: трата — RESOURCE_SPENT на стоимость варианта, возврат — RESOURCE_RESTORED. Возврат в начале своего
// хода — только когда абзац блока так и говорит («regains spent legendary actions at the start of its turn»); его
// отправляет страница сразу за TURN_ADVANCED (или ENCOUNTER_STARTED, если существо ходит первым) — отдельным событием,
// поэтому отмена хода — два шага, как у отдыха с шагом времени.
import type { Actor, State } from '../engine/state';
import type { EngineStore } from '../engine/store';
import { MONSTERS } from '../rules/srd/monsters';
import { legendaryOf, type LegendaryOption } from '../rules/srd/legendary';

export const LEGENDARY_RESOURCE = 'legendary-actions' as const;

export interface LegendaryTrack {
  max: number;
  spent: number;
  available: number;
  /** Вводный абзац блока дословно. */
  intro: string;
  options: readonly LegendaryOption[];
}

/** Легендарные действия актёра; нет блока, легендарных действий или числа в абзаце, выбыл — null. */
export function legendaryTrackOf(actor: Actor): LegendaryTrack | null {
  if (!actor.monsterId || actor.removed) return null;
  const l = legendaryOf(MONSTERS[actor.monsterId]);
  if (!l || l.count === null) return null;
  const spent = Math.min(l.count, actor.resourcesSpent?.[LEGENDARY_RESOURCE] ?? 0);
  return { max: l.count, spent, available: l.count - spent, intro: l.intro, options: l.options };
}

/** Что вернуть тому, чей ход сейчас начался: потраченное целиком, если абзац блока так говорит; иначе null. */
export function legendaryRegainOf(state: State): { actorId: string; max: number; amount: number } | null {
  const { encounter } = state;
  if (!encounter.active) return null;
  const actor = state.actors[encounter.order[encounter.turnIndex] ?? ''];
  if (!actor?.monsterId) return null;
  const track = legendaryTrackOf(actor);
  if (!track || track.spent === 0 || !legendaryOf(MONSTERS[actor.monsterId])?.regainsAtTurnStart) return null;
  return { actorId: actor.id, max: track.max, amount: track.spent };
}

/** Начало хода: вернуть ходящему потраченные легендарные действия (RESOURCE_RESTORED), если правило блока велит; иначе ничего. */
export function regainLegendary(api: Pick<EngineStore, 'state' | 'restoreResource'>): void {
  if (api.state.encounter?.lairActionWindow) return;
  const r = legendaryRegainOf(api.state);
  if (r) api.restoreResource(r.actorId, LEGENDARY_RESOURCE, r.max, r.amount);
}
