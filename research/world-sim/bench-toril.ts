// И7, шаг «год» на всём Toril: 820 поселений графа С2, у каждого свой процесс «хозяйство» с тактом десятидневка
// (запас еды тянется к равновесию, d20 урожая). Три способа:
//   A. ядро С1 как есть: simulateProcesses (applyWorldPatch на каждый патч) и принятие каждого предложения;
//   B. рабочая копия шага (overlay.ts StepWorld): такты пишут в копию, патч сжат, одно принятие сводкой;
//   C. свёрнутый такт: один вызов на шаг, формула притяжения и 36 бросков внутри.
// Плюс цена pendingSubject при 20 000 решённых предложений и разбивка журнала на части.
//   (путь к графу — от out/) node_modules/.bin/esbuild research/world-sim/bench-toril.ts --bundle --platform=node --format=esm \
//     --outfile=research/world-sim/out/bench-toril.mjs && node research/world-sim/out/bench-toril.mjs
import { readFileSync } from 'node:fs';
import { produce, castDraft } from 'immer';
import { applyWorldPatch } from '../../src/engine/reduce';
import { EventLog } from '../../src/engine/log';
import { TEMPO_SECONDS } from '../../src/engine/events';
import { emptyState, type Location, type Process, type State, type WorldPatch } from '../../src/engine/state';
import { simulateProcesses, type ProcessKind } from '../../src/campaign/processes';
import { d20 } from '../../src/campaign/rng';
import { StepWorld, compactBatch } from './overlay';

const TENDAY = TEMPO_SECONDS.tenday;
const YEAR = 36 * TENDAY;
const now = () => performance.now();
const graph = JSON.parse(readFileSync(new URL('../../../maps/tiles/toril/graph.json', import.meta.url), 'utf8')) as { nodes: [string, number, number, number][] };
const N = graph.nodes.length;
const out: Record<string, unknown> = { nodes: N };

const EQ = 50, PULL = 1 / 3;
/** Такт хозяйства: запас тянется к равновесию на треть разрыва, урожай d20 ≤ 3 — минус 20 дней, 18+ — плюс 15. */
const econStep = (stock: number, roll: number) => Math.max(0, stock + (EQ - stock) * PULL + (roll <= 3 ? -20 : roll >= 18 ? 15 : 0));

function toril(D = 0): State {
  const s = emptyState();
  s.world.locations.toril = { id: 'toril', name: 'Toril', scale: 'planet' };
  const procs: Record<string, Process> = {};
  for (const [i, [id]] of graph.nodes.entries()) {
    s.world.locations[id] = { id, name: `n${i}`, scale: 'settlement', parentId: 'toril', stock: { food: EQ } } as Location;
    procs[`econ-${id}`] = { id: `econ-${id}`, kind: 'econ', name: `n${i}`, scale: 'continent', stage: 'run', parties: [], at: id, startedSec: 0, nextSec: TENDAY, vars: {} };
  }
  s.world.processes = procs;
  for (let i = 0; i < D; i++) s.deltas[`d${i}`] = { id: `d${i}`, scale: 'planet', subject: `Old · ${i}`, was: 'a', now: 'b', cause: 'c', causeId: 't', status: 'accepted' };
  return applyWorldPatch(s, { kind: 'stock', id: graph.nodes[0][0], goods: 'food', value: EQ });
}

const ECON: ProcessKind = {
  kind: 'econ', label: 'Хозяйство', stages: { run: 'идёт' },
  tick(p, { state, sec, roll }) {
    const st = state.world.locations[p.at!].stock?.food ?? EQ;
    return { process: { ...p, nextSec: sec + TENDAY }, patches: [{ kind: 'stock', id: p.at!, goods: 'food', value: Math.round(econStep(st, roll('harvest')) * 10) / 10 }] };
  },
};

// ── A. ядро как есть ─────────────────────────────────────────────────────────────────────────────────────────
{
  const s = toril();
  const t0 = now();
  const props = simulateProcesses({ state: s, fromSec: 0, toSec: YEAR, timeEventId: 'y1' }, new Map([['econ', ECON]]));
  const simMs = now() - t0;
  let n = 0;
  const log = new EventLog(s, [], { clock: { now: () => 0 }, ids: { next: () => `e${++n}` } });
  for (const d of props) log.dispatch({ type: 'WORLD_DELTA_PROPOSED', payload: { delta: d } });
  const t1 = now();
  for (const d of props) log.dispatch({ type: 'WORLD_DELTA_ACCEPTED', payload: { deltaId: d.id, subject: d.subject, was: d.was, now: d.now, causeId: d.causeId } });
  const acceptMs = now() - t1;
  const sizes = { proposed: 0, accepted: 0 };
  for (const e of log.entries) sizes[e.type === 'WORLD_DELTA_PROPOSED' ? 'proposed' : 'accepted'] += JSON.stringify(e).length;
  out.A_coreAsIs = { proposals: props.length, patchesPerProposal: props[0].patch?.kind === 'batch' ? props[0].patch.patches.length : 0, simMs: Math.round(simMs), acceptAllMs: Math.round(acceptMs), logMB: { proposed: +(sizes.proposed / 1e6).toFixed(2), accepted: +(sizes.accepted / 1e6).toFixed(2) } };
}

// ── B. рабочая копия шага, сжатый патч, одно принятие ──────────────────────────────────────────────────────────
{
  const s = toril();
  const t0 = now();
  const w = new StepWorld(s);
  const batches: WorldPatch[] = [];
  const due = Object.values(s.world.processes!).sort((a, b) => a.id.localeCompare(b.id));
  // Такты всех процессов по времени, а не процесс за процессом: так второй процесс видит первый внутри шага.
  for (let sec = TENDAY; sec <= YEAR; sec += TENDAY) {
    for (const p0 of due) {
      const p = w.process(p0.id)!;
      if (p.nextSec !== sec) continue;
      const st = w.location(p.at!)!.stock?.food ?? EQ;
      w.apply({ kind: 'stock', id: p.at!, goods: 'food', value: Math.round(econStep(st, d20(p.id, String(sec), 'harvest')) * 10) / 10 });
      w.apply({ kind: 'process', process: { ...p, nextSec: sec + TENDAY } });
    }
  }
  const batch = compactBatch({ kind: 'batch', patches: w.written });
  batches.push(batch);
  const simMs = now() - t0;
  // Принятие одним патчем: одна produce на весь патч (а не produce на каждую часть, как checkPatch/readPatch для batch).
  const t1 = now();
  const next = produce(s, d => {
    for (const x of batch.kind === 'batch' ? batch.patches : []) {
      if (x.kind === 'stock') (d.world.locations[x.id].stock ??= {})[x.goods] = x.value as number;
      else if (x.kind === 'process') d.world.processes![x.process.id] = castDraft(x.process);
    }
  });
  const commitMs = now() - t1;
  // То же принятие через нынешний checkPatch(batch) — produce на каждую часть.
  const t2 = now();
  applyWorldPatch(s, { kind: 'batch', patches: (batch as Extract<WorldPatch, { kind: 'batch' }>).patches.slice(0, 200) });
  const core200Ms = now() - t2;
  out.B_stepWorld = {
    patchesWritten: w.written.length, patchesAfterCompact: (batch as Extract<WorldPatch, { kind: 'batch' }>).patches.length,
    simMs: Math.round(simMs), commitOneProduceMs: Math.round(commitMs), coreBatchCheck200PartsMs: Math.round(core200Ms),
    logMB: +(JSON.stringify(batch).length / 1e6).toFixed(2), sample: next.world.locations[graph.nodes[5][0]].stock,
  };
}

// ── C. свёрнутый такт: один вызов на процесс за шаг ───────────────────────────────────────────────────────────
{
  const s = toril();
  const t0 = now();
  const res: Record<string, number> = {};
  for (const p of Object.values(s.world.processes!)) {
    let st = s.world.locations[p.at!].stock?.food ?? EQ;
    for (let sec = p.nextSec; sec <= YEAR; sec += TENDAY) st = econStep(st, d20(p.id, String(sec), 'harvest'));
    res[p.at!] = Math.round(st * 10) / 10;
  }
  out.C_foldedTick = { simMs: +(now() - t0).toFixed(2) };
}

// ── pendingSubject: цена от числа решённых предложений ─────────────────────────────────────────────────────────
{
  const kinds = new Map([['econ', ECON]]);
  const rows: unknown[] = [];
  for (const D of [0, 20000]) {
    const s = toril(D);
    const t0 = now();
    simulateProcesses({ state: s, fromSec: 0, toSec: TENDAY, timeEventId: 'x' }, kinds);
    rows.push({ decidedDeltas: D, oneTenday820ProcessesMs: Math.round(now() - t0) });
  }
  out.pendingSubject = rows;
}

console.log(JSON.stringify(out, null, 1));
