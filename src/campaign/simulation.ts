// Симуляция мира на шаге времени: из состояния и отрезка времени — предложения (WorldDelta), и ничего больше.
// Она никогда не меняет мир сама: каждое предложение ждёт решения мастера (CLAUDE.md «Правила экрана»), а
// принятое меняет числа через патч в редьюсере. Правила детерминированы — те же состояние и отрезок дают
// те же id, поэтому реплей лога не рождает дублей. Причина у каждого предложения: нить, факт или само
// событие шага времени — по ней журнал строит каскад.
import { timeStepEnd } from './timeStepInterval';
import { dayOf, SECONDS_PER_DAY, type Location, type State, type WorldDelta } from '../engine/state';
import { TEMPO_SECONDS, type Command, type DomainEvent, type Tempo, type TransactionCommand } from '../engine/events';
import type { EngineStore } from '../engine/store';
import { EventLog } from '../engine/log';
import { calendarAdapterForState, SEASON_LABELS, fullMoonsBetween, harptos, seasonOf, type Season } from './calendar';
import { eraOf } from './era';
import { holyDaysOn, holyLabel, partyDeitiesOf, placeFaithDeities } from './holyDays';
import { DEFAULT_SETTING_PACKAGE } from '../packages/registry';
import { LOCATION, THREAD } from './world';
import { simulateProcesses } from './processes';

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

/** Правило стола: после десяти дней без внимания настроенные часы получают предложение на один тик. */
export const THREAD_TICK_DAYS = 10;
const THREAD_TICK_SECONDS = THREAD_TICK_DAYS * DAY;

const pct = (n: number) => `${n > 0 ? '+' : ''}${n}%`;

/**
 * Числа правил модели мира (Q7, ROADMAP 4.1) — правила стола, не SRD: спецификация их не задаёт, поэтому они здесь,
 * в одном месте, и правятся без поиска по коду.
 */
export const SIM_RULES = {
  /** Цена еды и ночлега в поселении по сезону, % к базовой: зимой запасы дорожают, осенью урожай дешевле. */
  foodBySeason: { winter: 10, spring: 5, summer: 0, autumn: -5 } satisfies Record<Season, number>,
  /** В день праздника Харптоса — толпы: еда и ночлег дороже на столько. */
  festivalCrowd: 10,
  /** Враги растущей фракции: отношение −1 за десятидневку, не ниже этого. */
  rivalryFloor: -3,
  /** Партия известна обеим фракциям хотя бы на столько — их отношение (если не выше 0) +1 за десятидневку. */
  partyBridgeRenown: 5,
  /** Ликантропы в полнолуние: множитель встречи и сколько ночей он держится. */
  moonWeight: 2,
  moonNights: 3,
} as const;

/** Кто встречается в полнолуние чаще — ключ веса встречи (латиницей, как в SRD). */
const LYCANTHROPE = 'Werewolf';

/** Цель цены еды на момент sec: сезон и праздник в этот день. */
const foodTarget = (sec: number) => SIM_RULES.foodBySeason[seasonOf(sec)] + (harptos(sec).festival ? SIM_RULES.festivalCrowd : 0);

/** Отношение фракций и его подпись для предложения. */
const relationOf = (state: State, a: string, b: string) => state.world.factions[a]?.relations?.[b] ?? 0;
const rel = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

/** Уже есть такое же предложение, ждущее решения, — второй раз не предлагаем. */
const alreadyPending = (state: State, subject: string) =>
  Object.values(state.deltas).some(d => d.status === 'pending' && d.subject === subject);

/**
 * Предложения за отрезок (fromSec, toSec]. Правила:
 * 1. настроенные часы открытой нити без внимания за каждую десятидневку получают предложение тика;
 * 2. фракция с трендом — влияние на тренд за каждую десятидневку (континент, патч влияния, причина — шаг);
 * 3. пока караван не найден — цены в Neverwinter +5% за десятидневку (поселение, патч цен, причина — нить);
 * 4. полнолуние за отрезок — ликантропы ×2 на три ночи в Neverwinter Wood (регион, патч веса, причина — нить «Луна и стая»);
 *    три ночи прошли — вернуть ×1;
 * 5. цена еды и ночлега в поселениях — за сменой цели: сезон, день праздника (поселение, патч цены товара, причина — шаг);
 * 6. отношения фракций раз в десятидневку: растущая фракция — вражда с врагами глубже, партия известна обеим — ближе
 *    (континент, патч отношения, причина — шаг);
 * 7. сменился сезон — сезон на Toril (планета, словами, причина — шаг).
 * 8. наступил священный день бога партии или бога из веры поселения — предложить местную службу/обряд (без числового эффекта).
 * Числа правил 4–6 — SIM_RULES.
 */
export function simulate({ state, fromSec, toSec, timeEventId }: SimulationInput): WorldDelta[] {
  const out: WorldDelta[] = [];
  const id = (rule: string, key: string) => `sim-${timeEventId}-${rule}-${key}`;
  const tendays = tendaysCrossed(fromSec, toSec);
  const isDefaultSetting = (state.settingPackageId ?? DEFAULT_SETTING_PACKAGE) === DEFAULT_SETTING_PACKAGE;

  for (const t of Object.values(state.world.threads)) {
    const clock = t.clock;
    if (t.status !== 'open' || !clock || clock.filled >= clock.segments) continue;
    const baseline = Math.max(t.lastTouchedSec, clock.startedSec ?? t.lastTouchedSec);
    const before = Math.max(0, fromSec - baseline);
    const after = Math.max(0, toSec - baseline);
    const ticks = Math.floor(after / THREAD_TICK_SECONDS) - Math.floor(before / THREAD_TICK_SECONDS);
    if (ticks < 1) continue;
    const nextFilled = Math.min(clock.segments, clock.filled + ticks);
    const subject = `Часы нити · ${t.name}`;
    if (alreadyPending(state, subject)) continue;
    out.push({
      id: id('thread-clock', t.id), scale: 'region', subject,
      was: `${clock.filled}/${clock.segments}`, now: `${nextFilled}/${clock.segments}`,
      cause: `нить без внимания ${idleDays(baseline, toSec)} дней · ${Math.min(ticks, clock.segments - clock.filled)} дел. по правилу стола`,
      causeId: t.id, status: 'pending', threadIds: [t.id],
      patch: { kind: 'threadClock', id: t.id, clock: { ...clock, filled: nextFilled } },
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
    if (isDefaultSetting) {
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
  }

  // Луна (Q7): полнолуние за отрезок — ликантропы в Neverwinter Wood ×2 (нить «Луна и стая»); прошло три ночи после
  // полнолуния, а вес ещё выше 1 — вернуть ×1. Срок — словами: модель хранит только множитель.
  const wood = state.world.locations[LOCATION.neverwinterWood];
  const moonSubject = `Встречи с ликантропами · ${wood?.name ?? 'Neverwinter Wood'}`;
  const pack = state.world.threads[THREAD.moonAndPack];
  const weight = wood?.encounters?.[LYCANTHROPE] ?? 1;
  if (isDefaultSetting && wood && !alreadyPending(state, moonSubject)) {
    const moonWindow = SIM_RULES.moonNights * DAY;
    if (fullMoonsBetween(fromSec, toSec).length > 0 && weight < SIM_RULES.moonWeight) {
      out.push({
        id: id('moon', 'lycanthropes'), scale: 'region', subject: moonSubject, was: `×${weight}`, now: `×${SIM_RULES.moonWeight} на ${SIM_RULES.moonNights} ночи`,
        cause: 'полнолуние Selûne', causeId: pack ? pack.id : timeEventId, status: 'pending', threadIds: pack ? [pack.id] : [],
        patch: { kind: 'encounter', id: wood.id, key: LYCANTHROPE, value: SIM_RULES.moonWeight },
      });
    } else if (weight > 1 && fullMoonsBetween(toSec - moonWindow, toSec).length === 0) {
      out.push({
        id: id('moon-over', 'lycanthropes'), scale: 'region', subject: moonSubject, was: `×${weight}`, now: '×1',
        cause: `полнолуние прошло больше ${SIM_RULES.moonNights} ночей назад`, causeId: pack ? pack.id : timeEventId, status: 'pending', threadIds: pack ? [pack.id] : [],
        patch: { kind: 'encounter', id: wood.id, key: LYCANTHROPE, value: 1 },
      });
    }
  }

  // Цены еды в поселениях (Q7): цель — сезон и праздник; предложение — только когда цель сменилась за отрезок, на
  // разницу целей: остальное движение цен ведёт мастер.
  // Цены еды — авторское правило текущего FR-стола с таблицей Harptos; не переносим его автоматически на другой пакет.
  const foodShift = isDefaultSetting ? foodTarget(toSec) - foodTarget(fromSec) : 0;
  if (foodShift !== 0) {
    const d = harptos(toSec);
    const why = d.festival ? `${d.festival}: толпы` : seasonOf(fromSec) !== seasonOf(toSec) ? `${SEASON_LABELS[seasonOf(toSec)]}: цена сезона` : 'праздник прошёл';
    for (const l of Object.values(state.world.locations).filter((x): x is Location => x.scale === 'settlement')) {
      const subject = `Еда и ночлег · ${l.name}`;
      if (alreadyPending(state, subject)) continue;
      const was = l.prices?.food ?? 0;
      out.push({
        id: id('food', l.id), scale: 'settlement', subject, was: pct(was), now: pct(was + foodShift),
        cause: why, causeId: timeEventId, status: 'pending', patch: { kind: 'price', id: l.id, goods: 'food', value: was + foodShift },
      });
    }
  }

  // Отношения фракций (Q7), раз в десятидневку: растущая фракция (тренд > 0) обостряет вражду со своими врагами;
  // партия, известная обеим сторонам, сближает тех, кто не дружит. Пара — один раз, в порядке id.
  if (tendays > 0) {
    const factions = Object.values(state.world.factions);
    for (const f of factions) {
      for (const g of factions) {
        if (f.id >= g.id) continue;
        const now = relationOf(state, f.id, g.id);
        const growing = [f, g].find(x => (x.trend ?? 0) > 0);
        const subject = `${f.name} и ${g.name} · отношения`;
        if (alreadyPending(state, subject)) continue;
        if (growing && now < 0 && now > SIM_RULES.rivalryFloor) {
          const value = Math.max(SIM_RULES.rivalryFloor, now - tendays);
          out.push({
            id: id('rivalry', `${f.id}-${g.id}`), scale: 'continent', subject, was: rel(now), now: rel(value),
            cause: `${growing.name} набирает влияние — враги отвечают`, causeId: timeEventId, status: 'pending',
            patch: { kind: 'relation', id: f.id, other: g.id, value },
          });
        } else if (now <= 0 && f.renown >= SIM_RULES.partyBridgeRenown && g.renown >= SIM_RULES.partyBridgeRenown) {
          out.push({
            id: id('bridge', `${f.id}-${g.id}`), scale: 'continent', subject, was: rel(now), now: rel(now + 1),
            cause: `партия известна обеим: ${f.name} ${f.renown}, ${g.name} ${g.renown}`, causeId: timeEventId, status: 'pending',
            patch: { kind: 'relation', id: f.id, other: g.id, value: now + 1 },
          });
        }
      }
    }
  }

  const calendar = calendarAdapterForState(state);
  const from = calendar.seasonAt?.(fromSec);
  const to = calendar.seasonAt?.(toSec);
  if (from && to && from !== to) {
    const planets = Object.values(state.world.locations).filter(location => location.scale === 'planet');
    const subject = planets.length === 1 ? `Сезон · ${planets[0].name}` : 'Сезон';
    out.push({
      id: id('season', to), scale: 'planet', subject,
      was: calendar.seasonLabelAt?.(fromSec) ?? from, now: calendar.seasonLabelAt?.(toSec) ?? to,
      cause: calendar.id === 'harptos' ? 'календарь Харптоса' : `календарь ${calendar.id}`,
      causeId: timeEventId, status: 'pending',
    });
  }

  // Святой день (Q7): календарные даты богов партии и богов, явно перечисленных в вере поселений. Источник места
  // говорит о почитаемых богах, но не всегда называет конкретную церковь; предложение поэтому описывает местные
  // службы/обряды без выдуманного названия организации и числового эффекта.
  const worshippers = isDefaultSetting ? partyDeitiesOf(state) : new Map<string, readonly string[]>();
  const localFaiths = new Map<string, string[]>();
  if (isDefaultSetting) {
    for (const location of Object.values(state.world.locations)) {
      if (location.scale !== 'settlement' || !location.ref?.startsWith('place:')) continue;
      const placeId = location.ref.slice('place:'.length);
      for (const deity of placeFaithDeities(placeId)) {
        localFaiths.set(deity, [...(localFaiths.get(deity) ?? []), location.name]);
      }
    }
  }
  const holyScope = new Set([...worshippers.keys(), ...localFaiths.keys()]);
  if (isDefaultSetting && holyScope.size) {
    const firstDay = Math.floor(fromSec / DAY) + 1;
    const lastDay = Math.floor(toSec / DAY);
    for (let day = firstDay; day <= lastDay; day++) {
      const sec = day * DAY;
      const date = harptos(sec);
      const scopedDays = holyDaysOn(sec, eraOf(date.year), holyScope);
      const byDeity = new Map<string, typeof scopedDays>();
      for (const holy of scopedDays) byDeity.set(holy.deity, [...(byDeity.get(holy.deity) ?? []), holy]);
      for (const [deity, holyEntries] of byDeity) {
        const dateKey = `${date.year}-${date.festival ?? `${date.month}-${date.day}`}`;
        const holyNames = [...new Set(holyEntries.map(holyLabel))];
        const subject = `Святой день · ${holyEntries[0].name} · ${dateKey}`;
        if (alreadyPending(state, subject)) continue;
        const names = worshippers.get(deity) ?? [];
        const places = [...new Set(localFaiths.get(deity) ?? [])];
        const audience = places.length
          ? `местные почитатели: ${places.join(', ')}`
          : 'почитатели в партии';
        out.push({
          id: id('holy', `${deity}-${dateKey}`), scale: places.length === 1 ? 'settlement' : 'continent', subject,
          was: 'обычный день', now: `служба и обряды в честь ${holyNames.join('; ')} · ${audience}`,
          cause: `святой день ${holyNames.join('; ')}${places.length ? `; поселения: ${places.join(', ')}` : ''}${names.length ? `; почитатели в партии: ${names.join(', ')}` : ''}`,
          causeId: timeEventId, status: 'pending',
        });
      }
    }
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

/** A forecast and the exact event payloads that will be appended when the step is confirmed. */
export interface TimeStepPlan {
  readonly state: State;
  readonly baseLength: number;
  readonly eventId: string;
  readonly tempo: Tempo;
  readonly steps: number;
  readonly fromSec: number;
  readonly toSec: number;
  readonly proposals: readonly WorldDelta[];
  readonly prelude: readonly Command[];
  readonly commands: readonly TransactionCommand[];
}

function frozenClone<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (!item || typeof item !== 'object' || Object.isFrozen(item)) return;
    Object.values(item).forEach(freeze);
    Object.freeze(item);
  };
  freeze(copy);
  return copy;
}

/** Project explicit preparation commands, then derive both the forecast and committed proposal payloads. */
export function planTimeStep(
  state: State,
  tempo: Tempo,
  steps: number,
  eventId: string,
  baseLength: number,
  prelude: readonly Command[] = [],
): TimeStepPlan {
  if (!eventId.trim()) throw new Error('Плану шага нужен уникальный id');
  const fromSec = state.time.sec;
  const toSec = timeStepEnd(fromSec, tempo, steps, state.settingPackageId);
  let projectionId = 0;
  const projection = new EventLog(state, [], { ids: { next: () => `time-plan-projection-${++projectionId}` } });
  for (const command of prelude) projection.dispatch(command as never);
  const proposals = [...simulate({ state: projection.state, fromSec, toSec, timeEventId: eventId }),
    ...simulateProcesses({ state: projection.state, fromSec, toSec, timeEventId: eventId })];
  const timeCommand: Command = { type: 'TIME_ADVANCED', payload: { tempo, steps, fromDay: dayOf(fromSec), toDay: dayOf(toSec), fromSec, toSec } };
  const plannedProposals = frozenClone(proposals);
  const plannedPrelude = frozenClone(prelude);
  const commands = frozenClone<TransactionCommand[]>([
    ...plannedPrelude.map((command, index) => ({ command, eventId: `${eventId}:pre:${index}` })),
    { command: timeCommand, eventId },
    ...plannedProposals.map((delta, index) => ({ command: { type: 'WORLD_DELTA_PROPOSED', payload: { delta } } as const, eventId: `${eventId}:proposal:${index}` })),
  ]);
  return Object.freeze({ state, baseLength, eventId, tempo, steps, fromSec, toSec, proposals: plannedProposals, prelude: plannedPrelude, commands });
}

/** Rejects old plans and appends the complete step as one undoable transaction. */
export function commitTimeStepPlan(
  api: Pick<EngineStore, 'state' | 'events' | 'dispatchTransaction' | 'releaseReservedEventId'>,
  plan: TimeStepPlan,
): { event: DomainEvent<'TIME_ADVANCED'>; proposals: WorldDelta[] } {
  try {
    if (api.state !== plan.state || api.events.length !== plan.baseLength) throw new Error('Состояние изменилось после построения плана шага');
    const committed = api.dispatchTransaction(plan.eventId, plan.commands, { state: plan.state, length: plan.baseLength });
    const event = committed.find(item => item.id === plan.eventId);
    if (!event || event.type !== 'TIME_ADVANCED') throw new Error('В плане отсутствует событие времени');
    return { event: event as DomainEvent<'TIME_ADVANCED'>, proposals: plan.proposals.map(delta => structuredClone(delta)) };
  } catch (error) {
    api.releaseReservedEventId(plan.eventId);
    throw error;
  }
}


/**
 * Шаг времени за столом: TIME_ADVANCED, затем предложения симуляции за пройденный отрезок — каждое в лог
 * (WORLD_DELTA_PROPOSED). Возвращает событие шага и список предложений: сводка «что изменилось» — это они.
 */
export function stepTime(api: Pick<EngineStore, 'state' | 'advanceTime' | 'propose'> & Partial<Pick<EngineStore, 'events' | 'reserveEventId' | 'releaseReservedEventId' | 'dispatchTransaction'>>, tempo: Tempo, steps = 1): { event: DomainEvent<'TIME_ADVANCED'>; proposals: WorldDelta[] } {
  if (api.events && api.reserveEventId && api.releaseReservedEventId && api.dispatchTransaction) {
    const eventId = api.reserveEventId();
    try {
      const plan = planTimeStep(api.state, tempo, steps, eventId, api.events.length);
      return commitTimeStepPlan(api as Pick<EngineStore, 'state' | 'events' | 'dispatchTransaction' | 'releaseReservedEventId'>, plan);
    } catch (error) {
      api.releaseReservedEventId(eventId);
      throw error;
    }
  }
  const before = api.state;
  const event = api.advanceTime(tempo, steps, timeStepEnd(before.time.sec, tempo, steps, before.settingPackageId));
  const proposals = [...simulate({ state: before, fromSec: event.payload.fromSec, toSec: event.payload.toSec, timeEventId: event.id }),
    ...simulateProcesses({ state: before, fromSec: event.payload.fromSec, toSec: event.payload.toSec, timeEventId: event.id })];
  for (const delta of proposals) api.propose(delta);
  return { event, proposals };
}
