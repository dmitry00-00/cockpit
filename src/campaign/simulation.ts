// Симуляция мира на шаге времени: из состояния и отрезка времени — предложения (WorldDelta), и ничего больше.
// Она никогда не меняет мир сама: каждое предложение ждёт решения мастера (CLAUDE.md «Правила экрана»), а
// принятое меняет числа через патч в редьюсере. Правила детерминированы — те же состояние и отрезок дают
// те же id, поэтому реплей лога не рождает дублей. Причина у каждого предложения: нить, факт или само
// событие шага времени — по ней журнал строит каскад.
import { SECONDS_PER_DAY, type State, type WorldDelta } from '../engine/state';
import { TEMPO_SECONDS, type DomainEvent, type Tempo } from '../engine/events';
import type { EngineStore } from '../engine/store';
import { SEASON_LABELS, fullMoonsBetween, seasonOf } from './calendar';
import { LOCATION, THREAD } from './world';

export interface SimulationInput {
  state: State;
  fromSec: number;
  toSec: number;
  /** id события TIME_ADVANCED — причина предложений, у которых нет своей нити или факта. */
  timeEventId: string;
}

const DAY = SECONDS_PER_DAY;
const TENDAY = TEMPO_SECONDS.tenday;

/** Сколько границ десятидневок пересёк отрезок — столько раз срабатывают правила «раз в десятидневку». */
export function tendaysCrossed(fromSec: number, toSec: number): number {
  return Math.floor(toSec / TENDAY) - Math.floor(fromSec / TENDAY);
}

/** Сколько дней нить без внимания на момент sec. */
const idleDays = (lastTouchedSec: number, sec: number) => Math.floor((sec - lastTouchedSec) / DAY);

/** Порог, после которого симуляция предлагает закрыть нить: «след остынет». */
export const THREAD_COLD_DAYS = 20;

const pct = (n: number) => `${n > 0 ? '+' : ''}${n}%`;

/** Уже есть такое же предложение, ждущее решения, — второй раз не предлагаем. */
const alreadyPending = (state: State, subject: string) =>
  Object.values(state.deltas).some(d => d.status === 'pending' && d.subject === subject);

/**
 * Предложения за отрезок (fromSec, toSec]. Правила:
 * 1. нить без внимания дольше THREAD_COLD_DAYS — предложить закрыть (регион, патч статуса, причина — нить);
 * 2. фракция с трендом — влияние на тренд за каждую десятидневку (континент, патч влияния, причина — шаг);
 * 3. пока караван не найден — цены в Neverwinter +5% за десятидневку (поселение, патч цен, причина — нить);
 * 4. полнолуние за отрезок — ликантропы ×2 на три ночи в Neverwinter Wood (регион, словами, причина — нить «Луна и стая»);
 * 5. сменился сезон — сезон на Toril (планета, словами, причина — шаг).
 */
export function simulate({ state, fromSec, toSec, timeEventId }: SimulationInput): WorldDelta[] {
  const out: WorldDelta[] = [];
  const id = (rule: string, key: string) => `sim-${timeEventId}-${rule}-${key}`;
  const tendays = tendaysCrossed(fromSec, toSec);

  for (const t of Object.values(state.world.threads)) {
    if (t.status !== 'open') continue;
    if (idleDays(t.lastTouchedSec, fromSec) >= THREAD_COLD_DAYS || idleDays(t.lastTouchedSec, toSec) < THREAD_COLD_DAYS) continue;
    const subject = `Нить · ${t.name}`;
    if (alreadyPending(state, subject)) continue;
    out.push({
      id: id('cold', t.id), scale: 'region', subject, was: 'открыта', now: 'закрыта: след остыл',
      cause: `без внимания ${idleDays(t.lastTouchedSec, toSec)} дней`, causeId: t.id, status: 'pending', threadIds: [t.id],
      patch: { kind: 'thread', id: t.id, status: 'closed' },
    });
  }

  if (tendays > 0) {
    for (const f of Object.values(state.world.factions)) {
      if (!f.trend || f.influencePercent === undefined) continue;
      const value = f.influencePercent + f.trend * tendays;
      const subject = `${f.name} · влияние`;
      if (alreadyPending(state, subject)) continue;
      out.push({
        id: id('trend', f.id), scale: 'continent', subject, was: `${f.influencePercent}%`, now: `${value}%`,
        cause: f.goal ? `тренд ${f.trend > 0 ? '+' : ''}${f.trend} за десятидневку: ${f.goal}` : `тренд ${f.trend > 0 ? '+' : ''}${f.trend} за десятидневку`,
        causeId: timeEventId, status: 'pending', patch: { kind: 'faction', id: f.id, field: 'influencePercent', value },
      });
    }
    const caravan = state.world.threads[THREAD.missingCaravan];
    const nw = state.world.locations[LOCATION.neverwinter];
    if (caravan?.status === 'open' && nw) {
      const was = nw.pricePercent ?? 0;
      const value = was + 5 * tendays;
      const subject = `Цены · ${nw.name}`;
      if (!alreadyPending(state, subject)) {
        out.push({
          id: id('prices', nw.id), scale: 'settlement', subject, was: pct(was), now: pct(value),
          cause: 'караван всё ещё не найден — товар не доходит', causeId: caravan.id, status: 'pending', threadIds: [caravan.id],
          patch: { kind: 'location', id: nw.id, field: 'pricePercent', value },
        });
      }
    }
  }

  if (fullMoonsBetween(fromSec, toSec).length > 0) {
    const wood = state.world.locations[LOCATION.neverwinterWood];
    const subject = `Встречи с ликантропами · ${wood?.name ?? 'Neverwinter Wood'}`;
    if (!alreadyPending(state, subject)) {
      const pack = state.world.threads[THREAD.moonAndPack];
      out.push({
        id: id('moon', 'lycanthropes'), scale: 'region', subject, was: '×1', now: '×2 на 3 ночи',
        cause: 'полнолуние Selûne', causeId: pack ? pack.id : timeEventId, status: 'pending', threadIds: pack ? [pack.id] : [],
      });
    }
  }

  const from = seasonOf(fromSec), to = seasonOf(toSec);
  if (from !== to) {
    const toril = state.world.locations[LOCATION.toril];
    out.push({
      id: id('season', to), scale: 'planet', subject: `Сезон · ${toril?.name ?? 'Toril'}`, was: SEASON_LABELS[from], now: SEASON_LABELS[to],
      cause: 'календарь Харптоса', causeId: timeEventId, status: 'pending',
    });
  }

  return out;
}

/**
 * Имя уровня для сводки — по цепочке мест вверх от партии: Neverwinter → Sword Coast North → Faerûn → Toril.
 * Партия стоит в первом поселении мира; уровень без места в цепочке остаётся без имени.
 */
export function placeChain(state: State): Partial<Record<WorldDelta['scale'], string>> {
  const locations = Object.values(state.world.locations);
  let cur = locations.find(l => l.scale === 'settlement');
  const out: Partial<Record<WorldDelta['scale'], string>> = {};
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out[cur.scale] ??= cur.name;
    cur = cur.parentId ? state.world.locations[cur.parentId] : undefined;
  }
  return out;
}

/** Уровни рядом с партией — разворачиваются и решаются поштучно; дальние сворачиваются и принимаются пачкой (HANDOFF §8). */
export const NEAR_SCALES: readonly WorldDelta['scale'][] = ['region', 'settlement', 'building', 'battle'];

/**
 * Шаг времени за столом: TIME_ADVANCED, затем предложения симуляции за пройденный отрезок — каждое в лог
 * (WORLD_DELTA_PROPOSED). Возвращает событие шага и список предложений: сводка «что изменилось» — это они.
 */
export function stepTime(api: Pick<EngineStore, 'state' | 'advanceTime' | 'propose'>, tempo: Tempo, steps = 1): { event: DomainEvent<'TIME_ADVANCED'>; proposals: WorldDelta[] } {
  const before = api.state;
  const event = api.advanceTime(tempo, steps);
  const proposals = simulate({ state: before, fromSec: event.payload.fromSec, toSec: event.payload.toSec, timeEventId: event.id });
  for (const delta of proposals) api.propose(delta);
  return { event, proposals };
}
