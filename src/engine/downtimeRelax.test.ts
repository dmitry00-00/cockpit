// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { EventLog } from './log';
import { emptyState } from './state';
import { TEMPO_SECONDS } from './events';
import { EngineError } from './reduce';

function stateAtHaven() {
  const state = emptyState();
  state.a5eStrifeEnabled = true;
  state.actors.mira = {
    id: 'mira', name: 'Mira', kind: 'pc', hp: { current: 10, max: 10, temp: 0 }, ac: 10, passivePerception: 10,
    conditions: {}, a5eConditions: { strife: 2 }, locationId: 'haven',
  };
  state.party = ['mira'];
  state.world.locations.haven = { id: 'haven', name: 'Тихая гавань', scale: 'settlement', haven: true };
  return state;
}

describe('A5E downtime Strife recovery', () => {
  it('requires the active Strife theme and a haven, and is limited until the period ends', () => {
    const log = new EventLog(stateAtHaven());
    const relax = (untilSec: number) => log.dispatch({ type: 'A5E_TRACK_SET', payload: {
      actorId: 'mira', track: 'strife', level: (log.state.actors.mira.a5eConditions?.strife ?? 0) - 1, downtimeRelaxUntilSec: untilSec,
    } });

    relax(TEMPO_SECONDS.tenday);
    expect(log.state.actors.mira.a5eConditions?.strife).toBe(1);
    expect(log.state.actors.mira.a5eDowntimeRelaxUntilSec).toBe(TEMPO_SECONDS.tenday);
    expect(() => relax(TEMPO_SECONDS.tenday * 2)).toThrow(EngineError);

    log.undo();
    expect(log.state.actors.mira.a5eConditions?.strife).toBe(2);
    expect(log.state.actors.mira.a5eDowntimeRelaxUntilSec).toBeUndefined();
    log.redo();
    expect(log.state.actors.mira.a5eConditions?.strife).toBe(1);
    expect(log.state.actors.mira.a5eDowntimeRelaxUntilSec).toBe(TEMPO_SECONDS.tenday);

    log.dispatch({ type: 'TIME_ADVANCED', payload: { tempo: 'tenday', steps: 1, fromDay: 0, toDay: 10, fromSec: 0, toSec: TEMPO_SECONDS.tenday } });
    relax(TEMPO_SECONDS.tenday * 2);
    expect(log.state.actors.mira.a5eConditions?.strife).toBeUndefined();
  });

  it('rejects recovery away from a haven or when the campaign theme is off', () => {
    const away = stateAtHaven();
    away.world.locations.haven.haven = false;
    const awayLog = new EventLog(away);
    expect(() => awayLog.dispatch({ type: 'A5E_TRACK_SET', payload: { actorId: 'mira', track: 'strife', level: 1, downtimeRelaxUntilSec: TEMPO_SECONDS.tenday } })).toThrow(EngineError);

    const disabled = stateAtHaven();
    disabled.a5eStrifeEnabled = false;
    const disabledLog = new EventLog(disabled);
    expect(() => disabledLog.dispatch({ type: 'A5E_TRACK_SET', payload: { actorId: 'mira', track: 'strife', level: 1, downtimeRelaxUntilSec: TEMPO_SECONDS.tenday } })).toThrow(EngineError);
  });
});
