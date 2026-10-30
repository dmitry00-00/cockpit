// Процессы мира (SIMULATION.md С1, решения пользователя 30.10.2026): война, караван, голод… — машины стадий над
// состоянием кампании. Как и `simulate()`, мира не меняют: шаг времени прогоняет такты процесса на рабочей копии и
// отдаёт ОДНО предложение на процесс — стадия и все её последствия патчем `batch`; принятие — прежний
// WORLD_DELTA_ACCEPTED, `Ctrl+Z` и ветки работают как есть. Случайность — сидированный d20 (`rng.ts`). Процесс вдали от
// партии помечается `far` и в сводке шага уходит в свёрнутую «Сводку мира». Пока предложение процесса ждёт решения,
// процесс стоит: мир не убегает вперёд мимо мастера.
import { SCALE_LEVELS, TEMPO_SECONDS, type ScaleLevel } from '../engine/events';
import { applyWorldPatch } from '../engine/reduce';
import type { Location, Process, State, WorldDelta, WorldPatch } from '../engine/state';
import { d20 } from './rng';

/** Такт по масштабу (SIMULATION.md): чем крупнее уровень, тем реже он думает. Бой считает свои раунды сам. */
export const TICK_SEC: Readonly<Record<ScaleLevel, number>> = {
  cosmology: TEMPO_SECONDS.year, plane: TEMPO_SECONDS.year, system: TEMPO_SECONDS.season, planet: TEMPO_SECONDS.season,
  continent: TEMPO_SECONDS.tenday, region: TEMPO_SECONDS.day, settlement: TEMPO_SECONDS.day, building: TEMPO_SECONDS.hour,
  battle: TEMPO_SECONDS.round,
};

/** Тактов одного процесса за шаг не больше (правило стола): шаг в век не гоняет 36 000 дней — длинный шаг дробить. */
export const MAX_TICKS_PER_STEP = 400;

export interface TickContext {
  /** Мир после предыдущих тактов этого процесса в этом шаге. */
  state: State;
  /** Секунда такта. */
  sec: number;
  /** d20 этого такта: тот же процесс, та же секунда, тот же смысл — тот же бросок. */
  roll: (what: string) => number;
}

export interface TickResult {
  /** Процесс после такта: стадия, счётчики, следующий такт, конец. */
  process: Process;
  /** Последствия такта в мире. */
  patches?: readonly WorldPatch[];
  /** Строка такта для причины: «битва у Arabel: 14 против 9». */
  line?: string;
}

/** Вид процесса: стадии словами, такт и правила. Числа правил — у вида, подписаны «правило стола». */
export interface ProcessKind {
  kind: string;
  /** Подпись для предложения: «Война», «Караван». */
  label: string;
  stages: Readonly<Record<string, string>>;
  tick(p: Process, ctx: TickContext): TickResult;
  /** Правило зарождения: какие процессы мир заводит на момент sec; уже идущий (тот же id) не заводится второй раз. */
  spawn?(state: State, sec: number): readonly Process[];
}

export type ProcessKinds = ReadonlyMap<string, ProcessKind>;

const REGISTRY = new Map<string, ProcessKind>();
/** Виды процессов стола; модуль вида регистрирует себя сам (С3 и дальше). */
export function registerProcessKind(k: ProcessKind): void { REGISTRY.set(k.kind, k); }
export const processKinds = (): ProcessKinds => REGISTRY;

const stageLabel = (k: ProcessKind, stage: string) => k.stages[stage] ?? stage;
const subjectOf = (k: ProcessKind, p: Pick<Process, 'name'>) => `${k.label} · ${p.name}`;
const pendingSubject = (state: State, subject: string) =>
  Object.values(state.deltas).some(d => d.status === 'pending' && d.subject === subject);

/** Где партия: место большинства её членов; никто не отошёл — первое поселение мира (как `placeChain`). */
export function partyLocationId(state: State): string | undefined {
  const count = new Map<string, number>();
  for (const id of state.party) {
    const loc = state.actors[id]?.removed ? undefined : state.actors[id]?.locationId;
    if (loc) count.set(loc, (count.get(loc) ?? 0) + 1);
  }
  const best = [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  return best ?? Object.values(state.world.locations).find(l => l.scale === 'settlement')?.id;
}

/** Цепочка мест вверх от id: само место, его родитель… */
function chainOf(state: State, id: string | undefined): Location[] {
  const out: Location[] = [];
  const seen = new Set<string>();
  let cur = id ? state.world.locations[id] : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.push(cur);
    cur = cur.parentId ? state.world.locations[cur.parentId] : undefined;
  }
  return out;
}

/**
 * Рядом с партией (решение пользователя 30.10.2026: ближнее — предложениями, дальнее — сводкой): место процесса и место
 * партии сходятся не выше региона. Процесс без места — вдали.
 */
export function nearParty(state: State, p: Pick<Process, 'at'>): boolean {
  if (!p.at) return false;
  const party = new Set(chainOf(state, partyLocationId(state)).map(l => l.id));
  const common = chainOf(state, p.at).find(l => party.has(l.id));
  return common !== undefined && SCALE_LEVELS.indexOf(common.scale) >= SCALE_LEVELS.indexOf('region');
}

export interface ProcessesInput {
  state: State;
  fromSec: number;
  toSec: number;
  /** id события TIME_ADVANCED — в id предложений и причиной, если у процесса своей нет. Начало отрезка процессам не нужно: такт помнит свою секунду. */
  timeEventId: string;
}

/**
 * Предложения процессов за отрезок (fromSec, toSec]: зарождение новых (правила `spawn`) и такты идущих — по одному
 * предложению на процесс. Такты, чей срок попал в отрезок, прогоняются по порядку на рабочей копии мира: второй такт
 * видит последствия первого. Те же состояние и отрезок дают те же предложения.
 */
export function simulateProcesses({ state, toSec, timeEventId }: ProcessesInput, kinds: ProcessKinds = REGISTRY): WorldDelta[] {
  const out: WorldDelta[] = [];
  const id = (key: string) => `sim-${timeEventId}-proc-${key}`;
  const running = state.world.processes ?? {};

  for (const k of [...kinds.values()].sort((a, b) => a.kind.localeCompare(b.kind))) {
    for (const p of k.spawn?.(state, toSec) ?? []) {
      const subject = subjectOf(k, p);
      if (running[p.id] || pendingSubject(state, subject)) continue;
      out.push({
        id: id(`new-${p.id}`), scale: p.scale, subject, was: 'нет', now: stageLabel(k, p.stage), cause: `начало: ${k.label.toLowerCase()}`,
        causeId: p.causeId ?? timeEventId, status: 'pending', patch: { kind: 'process', process: p }, ...(nearParty(state, p) ? {} : { far: true }),
      });
    }
  }

  for (const p of Object.values(running).sort((a, b) => a.id.localeCompare(b.id))) {
    const k = kinds.get(p.kind);
    if (!k || p.ended || p.nextSec > toSec) continue;
    const subject = subjectOf(k, p);
    if (pendingSubject(state, subject)) continue;
    let cur = p, world = state, ticks = 0;
    const patches: WorldPatch[] = [];
    const lines: string[] = [];
    while (!cur.ended && cur.nextSec <= toSec && ticks < MAX_TICKS_PER_STEP) {
      const sec = cur.nextSec;
      const r = k.tick(cur, { state: world, sec, roll: what => d20(cur.id, String(sec), what) });
      for (const x of r.patches ?? []) { world = applyWorldPatch(world, x); patches.push(x); }
      // Вид обязан двигать такт вперёд; не сдвинул — сдвигаем на такт масштаба, иначе цикл не кончится.
      cur = r.process.ended || r.process.nextSec > sec ? r.process : { ...r.process, nextSec: sec + TICK_SEC[r.process.scale] };
      if (r.line) lines.push(r.line);
      ticks++;
    }
    const now = `${stageLabel(k, cur.stage)}${cur.ended ? ' — кончился' : ''}`;
    out.push({
      id: id(p.id), scale: p.scale, subject, was: stageLabel(k, p.stage), now,
      cause: lines.length ? lines.slice(-3).join('; ') : `${ticks} ${ticks === 1 ? 'такт' : 'тактов'}`,
      causeId: p.causeId ?? timeEventId, status: 'pending',
      patch: { kind: 'batch', patches: [...patches, { kind: 'process', process: cur }] },
      ...(nearParty(state, p) ? {} : { far: true }),
    });
  }
  return out;
}
