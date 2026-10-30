// И7: Ctrl+Z шага времени. WORLD_DELTA_PROPOSED необратимо (events.ts EVENT_META) — предложения отменённого шага
// остаются ждать; процесс стоит на них (pendingSubject), и их можно принять уже после отмены.
import { EventLog } from '../../src/engine/log';
import { TEMPO_SECONDS } from '../../src/engine/events';
import { applyWorldPatch } from '../../src/engine/reduce';
import { emptyState } from '../../src/engine/state';
import { simulateProcesses, type ProcessKind } from '../../src/campaign/processes';

const DAY = TEMPO_SECONDS.day;
const K: ProcessKind = { kind: 'siege', label: 'Осада', stages: { s: 'осада' },
  tick: (p, { sec }) => ({ process: { ...p, nextSec: sec + DAY, vars: { day: (p.vars.day ?? 0) + 1 } } }) };
let s = emptyState();
s.world.locations.a = { id: 'a', name: 'A', scale: 'settlement' };
s = applyWorldPatch(s, { kind: 'process', process: { id: 'p', kind: 'siege', name: 'A', scale: 'settlement', stage: 's', parties: [], at: 'a', startedSec: 0, nextSec: DAY, vars: {} } });
let n = 0;
const log = new EventLog(s, [], { clock: { now: () => 0 }, ids: { next: () => `e${++n}` } });
const kinds = new Map([['siege', K]]);
const step = (days: number) => {
  const from = log.state.time.sec, to = from + days * DAY;
  const ev = log.dispatch({ type: 'TIME_ADVANCED', payload: { tempo: 'day', steps: days, fromDay: from / DAY, toDay: to / DAY, fromSec: from, toSec: to } });
  const ds = simulateProcesses({ state: log.state, fromSec: from, toSec: to, timeEventId: ev.id }, kinds);
  for (const d of ds) log.dispatch({ type: 'WORLD_DELTA_PROPOSED', payload: { delta: d } });
  return ds;
};
const a = step(10);
log.undo(); // отменяет последнее обратимое — TIME_ADVANCED (PROPOSED необратимо)
const timeAfterUndo = log.state.time.sec / DAY;
const b = step(1);
const pending = Object.values(log.state.deltas).filter(d => d.status === 'pending').map(d => d.id);
log.dispatch({ type: 'WORLD_DELTA_ACCEPTED', payload: { deltaId: a[0].id, subject: a[0].subject, was: a[0].was, now: a[0].now, causeId: a[0].causeId } });
console.log(JSON.stringify({ firstStep: a.map(d => d.cause), timeAfterUndoDays: timeAfterUndo, secondStepProposals: b.length, pending,
  acceptedStaleThenDay: log.state.world.processes!.p.vars.day, worldDay: log.state.time.sec / DAY }));
