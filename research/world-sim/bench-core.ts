// И7, замеры ядра С1 как есть (src/ не правится). Сборка и запуск:
//   cd ~/cockpit && node_modules/.bin/esbuild research/world-sim/bench-core.ts --bundle --platform=node --format=esm \
//     --outfile=research/world-sim/out/bench-core.mjs && node research/world-sim/out/bench-core.mjs
// Что меряется: цена патча от размера мира и числа решённых предложений; потерянное обновление двух процессов;
// рост журнала за годы шагов и его сериализация (localStorage пишет весь журнал на каждое событие); «весь Toril
// за год» через ядро как есть и через рабочую копию шага (прототип overlay.ts).
import { applyWorldPatch } from '../../src/engine/reduce';
import { EventLog } from '../../src/engine/log';
import { serializeLog } from '../../src/engine/persist';
import { TEMPO_SECONDS } from '../../src/engine/events';
import { emptyState, type Location, type Process, type State, type WorldDelta, type WorldPatch } from '../../src/engine/state';
import { simulateProcesses, type ProcessKind } from '../../src/campaign/processes';
import { compactBatch } from './overlay';

const TENDAY = TEMPO_SECONDS.tenday;
const now = () => performance.now();
const r2 = (x: number) => Math.round(x * 100) / 100;
const out: Record<string, unknown> = {};

/** Мир: континент, регион и L поселений; F фракций; D решённых предложений в state.deltas. */
function world(L: number, F = 0, D = 0): State {
  const s = emptyState();
  s.world.locations.faerun = { id: 'faerun', name: 'Faerûn', scale: 'continent' };
  s.world.locations.r = { id: 'r', name: 'Region', scale: 'region', parentId: 'faerun' };
  for (let i = 0; i < L; i++) {
    s.world.locations[`l${i}`] = { id: `l${i}`, name: `Place ${i}`, scale: 'settlement', parentId: 'r', population: 1000 + i, stock: { food: 50, weapons: 5 } } as Location;
  }
  for (let i = 0; i < F; i++) s.world.factions[`f${i}`] = { id: `f${i}`, name: `F${i}`, renown: 0, relations: { [`f${(i + 1) % F}`]: 1 } };
  for (let i = 0; i < D; i++) {
    s.deltas[`d${i}`] = { id: `d${i}`, scale: 'settlement', subject: `Old · ${i}`, was: 'a', now: 'b', cause: 'c', causeId: 't', status: 'accepted',
      patch: { kind: 'batch', patches: [{ kind: 'stock', id: `l${i % Math.max(1, L)}`, goods: 'food', value: 40 }] } };
  }
  // Как в жизни: состояние уже прошло через immer (заморожено).
  return applyWorldPatch(s, { kind: 'stock', id: 'l0', goods: 'food', value: 50 });
}

// ── 1. Цена applyWorldPatch от размера мира ───────────────────────────────────────────────────────────────────
{
  const rows: unknown[] = [];
  for (const [L, F, D] of [[50, 0, 0], [200, 0, 0], [820, 0, 0], [820, 442, 0], [2000, 442, 0], [820, 442, 20000]] as const) {
    let s = world(L, F, D);
    const n = 3000;
    for (let i = 0; i < 300; i++) s = applyWorldPatch(s, { kind: 'stock', id: `l${i % L}`, goods: 'food', value: i }); // прогрев
    const t = now();
    for (let i = 0; i < n; i++) s = applyWorldPatch(s, { kind: 'stock', id: `l${i % L}`, goods: 'food', value: 30 + (i % 20) });
    rows.push({ places: L, factions: F, decidedDeltas: D, msPerPatch: r2((now() - t) / n * 1000) / 1000 });
  }
  out.patchCost = rows;
}

// ── 2. Потерянное обновление: два процесса одного шага пишут одно поле ───────────────────────────────────────────
const bump = (kind: string, by: number): ProcessKind => ({
  kind, label: kind, stages: { run: 'идёт' },
  tick(p, { state, sec }) {
    const cur = state.world.locations[p.at!].stock?.weapons ?? 5;
    return { process: { ...p, nextSec: sec + TENDAY }, patches: [{ kind: 'stock', id: p.at!, goods: 'weapons', value: Math.max(0, Math.min(10, cur + by)) }] };
  },
});
const proc = (id: string, kind: string, at: string, nextSec: number, scale: Process['scale'] = 'settlement'): Process =>
  ({ id, kind, name: id, scale, stage: 'run', parties: [], at, startedSec: 0, nextSec, vars: {} });
{
  let s = world(5);
  s = applyWorldPatch(s, { kind: 'batch', patches: [{ kind: 'process', process: proc('war', 'war', 'l0', TENDAY) }, { kind: 'process', process: proc('caravan', 'caravan', 'l0', TENDAY) }] });
  const kinds = new Map([['war', bump('war', -3)], ['caravan', bump('caravan', +2)]]);
  const log = new EventLog(s, [], { clock: { now: () => 0 }, ids: (() => { let n = 0; return { next: () => `e${++n}` }; })() });
  const t = log.dispatch({ type: 'TIME_ADVANCED', payload: { tempo: 'tenday', steps: 1, fromDay: 0, toDay: 10, fromSec: 0, toSec: TENDAY } });
  const props = simulateProcesses({ state: s, fromSec: 0, toSec: TENDAY, timeEventId: t.id }, kinds);
  for (const d of props) log.dispatch({ type: 'WORLD_DELTA_PROPOSED', payload: { delta: d } });
  for (const d of props) log.dispatch({ type: 'WORLD_DELTA_ACCEPTED', payload: { deltaId: d.id, subject: d.subject, was: d.was, now: d.now, causeId: d.causeId } });
  out.lostUpdate = { before: 5, war: -3, caravan: +2, expected: 4, after: log.state.world.locations.l0.stock?.weapons, proposals: props.map(p => p.subject) };
}

// ── 3. Рост журнала: годы шагов «десятидневка», все предложения принимаются ────────────────────────────────────
/** Торговый путь вдали: каждый такт — запас и цена в двух концах (4 патча). */
const ROUTE: ProcessKind = {
  kind: 'route', label: 'Путь', stages: { run: 'идёт' },
  tick(p, { state, sec, roll }) {
    const a = p.parties[0], b = p.parties[1];
    const sa = state.world.locations[a].stock?.food ?? 50, sb = state.world.locations[b].stock?.food ?? 50;
    const flow = roll('flow') - 10;
    return {
      process: { ...p, nextSec: sec + TENDAY, vars: { ...p.vars, n: (p.vars.n ?? 0) + 1 } },
      patches: [
        { kind: 'stock', id: a, goods: 'food', value: Math.max(0, sa - flow) }, { kind: 'price', id: a, goods: 'food', value: Math.max(-75, Math.min(75, flow)) },
        { kind: 'stock', id: b, goods: 'food', value: Math.max(0, sb + flow) }, { kind: 'price', id: b, goods: 'food', value: Math.max(-75, Math.min(75, -flow)) },
      ],
    };
  },
};
function years(Y: number, K: number, tempo: 'tenday' | 'month', compact: boolean) {
  const L = 200;
  let s = world(L);
  const ps: WorldPatch[] = [];
  for (let i = 0; i < K; i++) ps.push({ kind: 'process', process: { ...proc(`route${i}`, 'route', `l${i % L}`, TENDAY, 'continent'), parties: [`l${i % L}`, `l${(i * 7 + 3) % L}`] } });
  s = applyWorldPatch(s, { kind: 'batch', patches: ps });
  let n = 0;
  const log = new EventLog(s, [], { clock: { now: () => 0 }, ids: { next: () => `e${++n}` } });
  const kinds = new Map([['route', ROUTE]]);
  const stepSec = tempo === 'tenday' ? TENDAY : 3 * TENDAY;
  const steps = Y * (tempo === 'tenday' ? 36 : 12);
  let simMs = 0, logMs = 0;
  for (let i = 0; i < steps; i++) {
    const from = log.state.time.sec, to = from + stepSec;
    let t0 = now();
    const ev = log.dispatch({ type: 'TIME_ADVANCED', payload: { tempo, steps: 1, fromDay: from / 86400, toDay: to / 86400, fromSec: from, toSec: to } });
    let props: WorldDelta[] = simulateProcesses({ state: log.state, fromSec: from, toSec: to, timeEventId: ev.id }, kinds);
    if (compact) props = props.map(d => (d.patch?.kind === 'batch' ? { ...d, patch: compactBatch(d.patch) } : d));
    simMs += now() - t0;
    t0 = now();
    for (const d of props) log.dispatch({ type: 'WORLD_DELTA_PROPOSED', payload: { delta: d } });
    for (const d of props) log.dispatch({ type: 'WORLD_DELTA_ACCEPTED', payload: { deltaId: d.id, subject: d.subject, was: d.was, now: d.now, causeId: d.causeId } });
    logMs += now() - t0;
  }
  const t0 = now();
  const text = serializeLog(log.entries);
  const serMs = now() - t0;
  const t1 = now();
  new EventLog(world(L), [], {}); // пустой — для сравнения
  const replayStart = now();
  // Реплей с нуля: так стол поднимает сессию из localStorage.
  new EventLog(s, JSON.parse(text).events);
  const replayMs = now() - replayStart;
  void t1;
  return {
    years: Y, processes: K, tempo, compact, events: log.length, deltasInState: Object.keys(log.state.deltas).length,
    logMB: r2(text.length / 1e6), serializeMs: r2(serMs), replayMs: Math.round(replayMs), simMsTotal: Math.round(simMs), dispatchMsTotal: Math.round(logMs),
    // Каждый dispatch сохраняет весь журнал (store.ts sync → persist.save): событий × время сериализации в среднем (≈ половина конечного).
    persistMsIfEveryDispatch: Math.round(log.length * serMs / 2),
  };
}
out.logGrowth = [years(1, 30, 'tenday', false), years(1, 30, 'month', false), years(1, 30, 'month', true), years(5, 30, 'month', false), years(5, 30, 'month', true)];

console.log(JSON.stringify(out, null, 1));
