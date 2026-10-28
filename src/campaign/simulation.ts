// Симуляция мира на шаге времени: из состояния и отрезка времени — предложения (WorldDelta), и ничего больше.
// Она никогда не меняет мир сама: каждое предложение ждёт решения мастера (CLAUDE.md «Правила экрана»), а
// принятое меняет числа через патч в редьюсере. Правила детерминированы — те же состояние и отрезок дают
// те же id, поэтому реплей лога не рождает дублей. Причина у каждого предложения: нить, факт или само
// событие шага времени — по ней журнал строит каскад.
import { SECONDS_PER_DAY, type Location, type State, type WorldDelta } from '../engine/state';
import { TEMPO_SECONDS, type DomainEvent, type Tempo } from '../engine/events';
import type { EngineStore } from '../engine/store';
import { SEASON_LABELS, fullMoonsBetween, harptos, seasonOf, type Season } from './calendar';
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
 * 1. нить без внимания дольше THREAD_COLD_DAYS — предложить закрыть (регион, патч статуса, причина — нить);
 * 2. фракция с трендом — влияние на тренд за каждую десятидневку (континент, патч влияния, причина — шаг);
 * 3. пока караван не найден — цены в Neverwinter +5% за десятидневку (поселение, патч цен, причина — нить);
 * 4. полнолуние за отрезок — ликантропы ×2 на три ночи в Neverwinter Wood (регион, патч веса, причина — нить «Луна и стая»);
 *    три ночи прошли — вернуть ×1;
 * 5. цена еды и ночлега в поселениях — за сменой цели: сезон, день праздника (поселение, патч цены товара, причина — шаг);
 * 6. отношения фракций раз в десятидневку: растущая фракция — вражда с врагами глубже, партия известна обеим — ближе
 *    (континент, патч отношения, причина — шаг);
 * 7. сменился сезон — сезон на Toril (планета, словами, причина — шаг).
 * Числа правил 4–6 — SIM_RULES.
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

  // Луна (Q7): полнолуние за отрезок — ликантропы в Neverwinter Wood ×2 (нить «Луна и стая»); прошло три ночи после
  // полнолуния, а вес ещё выше 1 — вернуть ×1. Срок — словами: модель хранит только множитель.
  const wood = state.world.locations[LOCATION.neverwinterWood];
  const moonSubject = `Встречи с ликантропами · ${wood?.name ?? 'Neverwinter Wood'}`;
  const pack = state.world.threads[THREAD.moonAndPack];
  const weight = wood?.encounters?.[LYCANTHROPE] ?? 1;
  if (wood && !alreadyPending(state, moonSubject)) {
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
  const foodShift = foodTarget(toSec) - foodTarget(fromSec);
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
