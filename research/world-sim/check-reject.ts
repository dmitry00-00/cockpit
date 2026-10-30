// И7: что даёт «Отклонить». Процесс стоит на прежней стадии, такт тот же, бросок по (процесс, секунда, смысл) —
// следующий шаг даёт то же предложение. Запуск: esbuild → out/check-reject.mjs.
import { EventLog } from '../../src/engine/log';
import { TEMPO_SECONDS } from '../../src/engine/events';
import { applyWorldPatch } from '../../src/engine/reduce';
import { emptyState } from '../../src/engine/state';
import { simulateProcesses, type ProcessKind } from '../../src/campaign/processes';

const DAY = TEMPO_SECONDS.day;
const BATTLE: ProcessKind = {
  kind: 'battle', label: 'Битва', stages: { field: 'в поле', won: 'победа', lost: 'поражение' },
  tick(p, { sec, roll }) { const r = roll('battle'); return { process: { ...p, stage: r >= 11 ? 'won' : 'lost', ended: true, nextSec: sec + DAY }, line: `d20 = ${r}` }; },
};
let s = emptyState();
s.world.locations.a = { id: 'a', name: 'A', scale: 'settlement' };
s = applyWorldPatch(s, { kind: 'process', process: { id: 'b1', kind: 'battle', name: 'у брода', scale: 'region', stage: 'field', parties: [], at: 'a', startedSec: 0, nextSec: DAY, vars: {} } });
let n = 0;
const log = new EventLog(s, [], { clock: { now: () => 0 }, ids: { next: () => `e${++n}` } });
const kinds = new Map([['battle', BATTLE]]);
const step = (days: number) => {
  const from = log.state.time.sec, to = from + days * DAY;
  const ev = log.dispatch({ type: 'TIME_ADVANCED', payload: { tempo: 'day', steps: days, fromDay: from / DAY, toDay: to / DAY, fromSec: from, toSec: to } });
  return simulateProcesses({ state: log.state, fromSec: from, toSec: to, timeEventId: ev.id }, kinds);
};
const first = step(2);
for (const d of first) { log.dispatch({ type: 'WORLD_DELTA_PROPOSED', payload: { delta: d } }); log.dispatch({ type: 'WORLD_DELTA_REJECTED', payload: { deltaId: d.id } }); }
const second = step(2);
console.log(JSON.stringify({ first: first.map(d => [d.now, d.cause]), afterReject: second.map(d => [d.now, d.cause]) }));
