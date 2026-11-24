import type { Actor } from './state';
import type { CharacterLeveled, SheetSnapshot } from './events';

/** Одинаковая проекция для применения и предпросмотра повышения. Не пишет событие.
 * Правило стола: прибавка к максимуму прибавляется и к нынешним HP; временные HP не затрагиваются. */
export function leveledSnapshot(actor: Actor, change: CharacterLeveled): SheetSnapshot {
  return {
    sheet: structuredClone(change.sheet),
    hp: { current: actor.hp.current + change.hpMax - actor.hp.max, max: change.hpMax },
    ac: change.ac,
    passivePerception: change.passivePerception,
  };
}
