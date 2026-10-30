// Процессы мира (SIMULATION.md С1): сидированный d20, такты по порядку на рабочей копии, одно предложение на процесс
// с составным патчем, детерминизм при дроблении шага, стоянка при ждущем решении, точный откат принятия, зарождение,
// «рядом / вдали» от партии и «Сводка мира» в сводке шага. Вид процесса здесь — тестовый: виды стола приходят в С3+.
import { describe, expect, it } from 'vitest';
import { createEngineStore } from '../engine';
import { applyWorldPatch } from '../engine/reduce';
import { SECONDS_PER_DAY, type Process, type State, type WorldPatch } from '../engine/state';
import { FAR_GROUP, inSummaryGroup, summaryGroups } from '../components/ChangeSummary';
import { nearParty, simulateProcesses, type ProcessKind } from './processes';
import { d20, rollOf } from './rng';
import { SEED_SEC, seedState } from './seed';
import { LOCATION } from './world';

const DAY = SECONDS_PER_DAY;
const fixed = () => {
  let t = 1000;
  let n = 0;
  return { clock: { now: () => t++ }, ids: { next: () => `e${++n}` } };
};

/** Осада: каждый день штурм — d20 + сила против 10 + стены; удачный штурм рушит стену и дорожит оружие в городе. */
const SIEGE: ProcessKind = {
  kind: 'siege', label: 'Осада', stages: { siege: 'осада', fallen: 'город пал' },
  tick(p, { state, sec, roll }) {
    const r = roll('assault');
    const walls = p.vars.walls;
    if (r + p.vars.power < 10 + walls) return { process: { ...p, nextSec: sec + DAY }, line: `штурм отбит (${r})` };
    const price = state.world.locations[p.at!].prices?.weapons ?? 0;
    const patches: WorldPatch[] = [{ kind: 'price', id: p.at!, goods: 'weapons', value: price + 10 }];
    const left = walls - 1;
    return {
      process: { ...p, vars: { ...p.vars, walls: left }, nextSec: sec + DAY, ...(left <= 0 ? { stage: 'fallen', ended: true } : {}) },
      patches, line: `стена пала (${r})`,
    };
  },
};
const KINDS = new Map([[SIEGE.kind, SIEGE]]);

const siege = (over: Partial<Process> = {}): Process => ({
  id: 'proc-siege', kind: 'siege', name: 'Neverwinter', scale: 'settlement', stage: 'siege', parties: ['kingdom:luskan', LOCATION.neverwinter],
  at: LOCATION.neverwinter, startedSec: SEED_SEC, nextSec: SEED_SEC + DAY, vars: { power: 6, walls: 3 }, ...over,
});
const withProcess = (p: Process, s: State = seedState()) => applyWorldPatch(s, { kind: 'process', process: p });
const accept = (s: State, patch: WorldPatch) => applyWorldPatch(s, patch);

describe('сидированный d20', () => {
  it('те же ключи — тот же бросок; грани 1–20 примерно поровну', () => {
    expect(d20('a', '1', 'x')).toBe(d20('a', '1', 'x'));
    expect(new Set(Array.from({ length: 10 }, (_, i) => d20('a', String(i), 'x'))).size).toBeGreaterThan(1);
    const n = new Array(21).fill(0);
    for (let i = 0; i < 20_000; i++) n[d20('roll', String(i))]++;
    expect(n[0]).toBe(0);
    for (let f = 1; f <= 20; f++) expect(n[f]).toBeGreaterThan(850);
    for (let f = 1; f <= 20; f++) expect(n[f]).toBeLessThan(1150);
    expect(rollOf(6, 'k')).toBeGreaterThanOrEqual(1);
    expect(rollOf(6, 'k')).toBeLessThanOrEqual(6);
  });
});

describe('процессы мира', () => {
  it('такты по порядку: одно предложение на процесс, составной патч — последствия и процесс; тот же вход — то же', () => {
    const state = withProcess(siege());
    const input = { state, fromSec: SEED_SEC, toSec: SEED_SEC + 5 * DAY, timeEventId: 't1' };
    const out = simulateProcesses(input, KINDS);
    expect(out).toHaveLength(1);
    const d = out[0];
    expect(d).toMatchObject({ id: 'sim-t1-proc-proc-siege', scale: 'settlement', subject: 'Осада · Neverwinter', was: 'осада', status: 'pending' });
    expect(d.far).toBeUndefined();
    expect(d.patch?.kind).toBe('batch');
    const parts = d.patch?.kind === 'batch' ? d.patch.patches : [];
    const last = parts.at(-1);
    expect(last?.kind).toBe('process');
    const p = last?.kind === 'process' ? last.process : undefined;
    // Пять дней — пять тактов, если осада не кончилась раньше; каждая павшая стена — +10% к оружию.
    const fallen = 3 - p!.vars.walls;
    expect(parts.filter(x => x.kind === 'price')).toHaveLength(fallen);
    expect(p!.nextSec).toBe(p!.ended ? p!.nextSec : SEED_SEC + 6 * DAY);
    expect(simulateProcesses(input, KINDS)).toEqual(out);
  });

  it('шаг в пять дней и пять шагов по дню дают тот же исход', () => {
    let s = withProcess(siege());
    const one = simulateProcesses({ state: s, fromSec: SEED_SEC, toSec: SEED_SEC + 5 * DAY, timeEventId: 'big' }, KINDS)[0];
    const once = accept(s, one.patch!);
    for (let i = 1; i <= 5; i++) {
      const d = simulateProcesses({ state: s, fromSec: SEED_SEC + (i - 1) * DAY, toSec: SEED_SEC + i * DAY, timeEventId: `d${i}` }, KINDS)[0];
      if (d) s = accept(s, d.patch!);
    }
    expect(s.world.processes).toEqual(once.world.processes);
    expect(s.world.locations[LOCATION.neverwinter].prices).toEqual(once.world.locations[LOCATION.neverwinter].prices);
  });

  it('ждёт решения — стоит; кончился — тактов нет; неизвестный вид — тоже', () => {
    const store = createEngineStore(withProcess(siege()), fixed());
    const [d] = simulateProcesses({ state: store.getState().state, fromSec: SEED_SEC, toSec: SEED_SEC + 2 * DAY, timeEventId: 't' }, KINDS);
    store.getState().propose(d);
    expect(simulateProcesses({ state: store.getState().state, fromSec: SEED_SEC, toSec: SEED_SEC + 9 * DAY, timeEventId: 't2' }, KINDS)).toEqual([]);
    expect(simulateProcesses({ state: withProcess(siege({ ended: true })), fromSec: SEED_SEC, toSec: SEED_SEC + 9 * DAY, timeEventId: 't' }, KINDS)).toEqual([]);
    expect(simulateProcesses({ state: withProcess(siege({ kind: 'nope' })), fromSec: SEED_SEC, toSec: SEED_SEC + 9 * DAY, timeEventId: 't' }, KINDS)).toEqual([]);
  });

  it('принятие через лог: процесс и цены меняются разом, Ctrl+Z возвращает мир точно', () => {
    const before = withProcess(siege({ vars: { power: 30, walls: 2 } }));
    const store = createEngineStore(before, fixed());
    const [d] = simulateProcesses({ state: before, fromSec: SEED_SEC, toSec: SEED_SEC + 3 * DAY, timeEventId: 't' }, KINDS);
    expect(d.now).toBe('город пал — кончился');
    store.getState().propose(d);
    const proposed = store.getState().state;
    store.getState().accept(d.id);
    const after = store.getState().state;
    expect(after.world.processes?.['proc-siege']).toMatchObject({ stage: 'fallen', ended: true, vars: { walls: 0 } });
    expect(after.world.locations[LOCATION.neverwinter].prices?.weapons).toBe(20);
    store.getState().undo();
    expect(store.getState().state.world).toEqual(proposed.world);
  });

  it('составной патч: на несуществующее — ошибка целиком; вложенный составной не ведётся', () => {
    const s = seedState();
    expect(() => applyWorldPatch(s, { kind: 'batch', patches: [{ kind: 'price', id: LOCATION.neverwinter, goods: 'food', value: 5 }, { kind: 'price', id: 'loc-none', goods: 'food', value: 5 }] })).toThrow(/несуществующее/);
    expect(() => applyWorldPatch(s, { kind: 'batch', patches: [{ kind: 'batch', patches: [] }] })).toThrow(/внутри составного/);
    expect(() => applyWorldPatch(s, { kind: 'removeProcess', id: 'proc-x' })).toThrow(/несуществующее/);
  });

  it('зарождение: правило `spawn` заводит процесс предложением; уже идущий — не заводит второй раз', () => {
    const kinds = new Map([[SIEGE.kind, { ...SIEGE, spawn: () => [siege()] }]]);
    const s = seedState();
    const [d] = simulateProcesses({ state: s, fromSec: SEED_SEC, toSec: SEED_SEC + DAY, timeEventId: 't' }, kinds);
    expect(d).toMatchObject({ id: 'sim-t-proc-new-proc-siege', was: 'нет', now: 'осада', patch: { kind: 'process' } });
    const running = accept(s, d.patch!);
    expect(simulateProcesses({ state: running, fromSec: SEED_SEC, toSec: SEED_SEC, timeEventId: 't' }, kinds)).toEqual([]);
  });

  it('рядом и вдали: Neverwinter и Neverwinter Wood — рядом, другой континент и процесс без места — вдали, в «Сводке мира»', () => {
    const s = accept(seedState(), { kind: 'newLocation', location: { id: 'loc-calimport', name: 'Calimport', scale: 'settlement', parentId: LOCATION.toril } });
    expect(nearParty(s, { at: LOCATION.neverwinter })).toBe(true);
    expect(nearParty(s, { at: LOCATION.neverwinterWood })).toBe(true);
    expect(nearParty(s, { at: 'loc-calimport' })).toBe(false);
    expect(nearParty(s, {})).toBe(false);
    const far = simulateProcesses({ state: withProcess(siege({ at: 'loc-calimport', name: 'Calimport' }), s), fromSec: SEED_SEC, toSec: SEED_SEC + DAY, timeEventId: 't' }, KINDS)[0];
    expect(far.far).toBe(true);
    const groups = summaryGroups([far], sc => sc, ['settlement']);
    expect(groups).toEqual([expect.objectContaining({ id: FAR_GROUP, label: 'Сводка мира · вдали от партии', collapsed: true })]);
    expect(inSummaryGroup(far, FAR_GROUP)).toBe(true);
    expect(inSummaryGroup(far, 'settlement')).toBe(false);
  });
});
