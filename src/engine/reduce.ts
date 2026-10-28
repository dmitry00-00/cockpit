// Редьюсер: одно событие → новое состояние и точный след (effect). Чистая функция, без стора.
// Компенсирующее событие (undoes / redoes) не применяет payload заново, а восстанавливает `after`
// своего effect — он заранее собран из следа исходного события (см. log.ts).
import { castDraft, current, produce } from 'immer';
import { EXHAUSTION_MAX_LEVEL, isConditionId } from '../rules/srd/conditions';
import { RESOURCES, isResourceId } from '../rules/srd/resources';
import { TRAVEL_PACES } from '../rules/srd/travel';
import type { ConditionSnapshot, DomainEvent, Effect, EncounterSnapshot, HpSnapshot, InitiativeEntry, PayloadByType, RestSnapshot } from './events';
import type { Actor, State, WorldPatch } from './state';

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineError';
  }
}

function actorOf(state: State, id: string) {
  const a = state.actors[id];
  if (!a) throw new EngineError(`нет актёра ${id}`);
  return a;
}

function positive(n: number, what: string) {
  if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) throw new EngineError(`${what}: нужно целое больше нуля, получено ${n}`);
}

const hpSnap = (hp: HpSnapshot): HpSnapshot => ({ current: hp.current, temp: hp.temp });

/** Снимок боя вместе с бросками инициативы всех, кто в порядке, — след ENCOUNTER_* и INITIATIVE_SET. */
function encounterSnap(state: State, extraIds: readonly string[] = []): EncounterSnapshot {
  const initiative: Record<string, number | undefined> = {};
  for (const id of [...state.encounter.order, ...extraIds]) initiative[id] = state.actors[id]?.initiative;
  return { active: state.encounter.active, round: state.encounter.round, turnIndex: state.encounter.turnIndex, order: [...state.encounter.order], initiative };
}

function putEncounter(draft: State, snap: EncounterSnapshot) {
  draft.encounter.active = snap.active;
  draft.encounter.round = snap.round;
  draft.encounter.turnIndex = snap.turnIndex;
  draft.encounter.order = [...snap.order];
  for (const [id, init] of Object.entries(snap.initiative)) {
    const a = draft.actors[id];
    if (!a) continue;
    if (init === undefined) delete a.initiative;
    else a.initiative = init;
  }
}

/** След отдыха у актёра: хиты, уровень истощения, потраченные кости хитов и ресурсы. */
function restSnap(a: Actor): RestSnapshot {
  const snap: RestSnapshot = { hp: hpSnap(a.hp), hitDiceSpent: a.hitDiceSpent ?? 0 };
  if (a.conditions.exhaustion?.level !== undefined) snap.exhaustion = a.conditions.exhaustion.level;
  if (a.resourcesSpent && Object.keys(a.resourcesSpent).length > 0) snap.resourcesSpent = { ...a.resourcesSpent };
  return snap;
}

function putRest(a: Actor, snap: RestSnapshot) {
  a.hp.current = snap.hp.current;
  a.hp.temp = snap.hp.temp;
  if (snap.exhaustion === undefined) delete a.conditions.exhaustion;
  else a.conditions.exhaustion = { ...a.conditions.exhaustion, level: snap.exhaustion };
  if (snap.hitDiceSpent === 0) delete a.hitDiceSpent;
  else a.hitDiceSpent = snap.hitDiceSpent;
  if (snap.resourcesSpent) a.resourcesSpent = { ...snap.resourcesSpent };
  else delete a.resourcesSpent;
}

/** Потраченное по ресурсу; без записи — ноль. */
const spentOf = (a: Actor, id: string): number => (a.resourcesSpent as Record<string, number> | undefined)?.[id] ?? 0;

/** Записать потраченное: ноль — убрать запись, пустая карта — убрать поле, чтобы состояние не копило нули. */
function putSpent(a: Actor, id: string, n: number) {
  const map = { ...(a.resourcesSpent ?? {}) } as Record<string, number>;
  if (n === 0) delete map[id];
  else map[id] = n;
  if (Object.keys(map).length === 0) delete a.resourcesSpent;
  else a.resourcesSpent = map;
}

/** Долгий отдых возвращает половину костей хитов, не меньше одной (SRD). */
export function hitDiceRegained(level: number): number {
  return Math.max(1, Math.floor(level / 2));
}

/** Порядок инициативы: только существующие, не выбывшие, без повторов, хоть один. */
function checkOrder(state: State, order: readonly InitiativeEntry[]) {
  if (order.length === 0) throw new EngineError('порядок инициативы пуст');
  const seen = new Set<string>();
  for (const { actorId, initiative } of order) {
    const a = actorOf(state, actorId);
    if (a.removed) throw new EngineError(`${a.name} выбыл и в бой не встаёт`);
    if (seen.has(actorId)) throw new EngineError(`${a.name} дважды в порядке инициативы`);
    if (!Number.isFinite(initiative)) throw new EngineError(`инициатива ${a.name}: не число`);
    seen.add(actorId);
  }
}

/**
 * Куда встаёт ход после перестановки: тот же актёр, если он в новом порядке; иначе — первый после него
 * по старому кругу, кто в новом порядке есть; никого — начало.
 */
function nextTurnIndex(oldOrder: readonly string[], turnIndex: number, newOrder: readonly string[]): number {
  if (newOrder.length === 0) return 0;
  for (let step = 0; step < oldOrder.length; step++) {
    const id = oldOrder[(turnIndex + step) % oldOrder.length];
    const i = newOrder.indexOf(id);
    if (i >= 0) return i;
  }
  return 0;
}

/** Проверка снимка актёра при появлении: форма, а не смысл — редьюсер не знает правил класса. */
function checkActor(actor: Actor) {
  if (!actor.id || !actor.name) throw new EngineError('актёру нужны id и имя');
  if (!Number.isFinite(actor.hp?.max) || actor.hp.max < 0 || actor.hp.current < 0 || actor.hp.current > actor.hp.max || actor.hp.temp < 0) throw new EngineError(`хиты ${actor.name}: current ≤ max, temp ≥ 0`);
}

/** Проверяет команду до записи в лог: то, что не пройдёт, в лог не попадает. */
export function validate(state: State, event: Pick<DomainEvent, 'type' | 'payload'>): void {
  switch (event.type) {
    case 'DAMAGE_APPLIED':
    case 'HEALING_APPLIED':
    case 'TEMP_HP_GRANTED': {
      const p = event.payload as PayloadByType['DAMAGE_APPLIED'];
      actorOf(state, p.targetId);
      positive(p.amount, event.type);
      return;
    }
    case 'CONDITION_ADDED': {
      const p = event.payload as PayloadByType['CONDITION_ADDED'];
      actorOf(state, p.targetId);
      if (!isConditionId(p.conditionId)) throw new EngineError(`нет такого состояния в SRD: ${p.conditionId}`);
      if (p.untilSec !== undefined && p.untilSec <= state.time.sec) throw new EngineError('состояние: срок уже прошёл');
      if (p.level !== undefined) {
        if (p.conditionId !== 'exhaustion') throw new EngineError(`уровень есть только у истощения`);
        if (p.level < 1 || p.level > EXHAUSTION_MAX_LEVEL || Math.floor(p.level) !== p.level) throw new EngineError(`уровень истощения 1–${EXHAUSTION_MAX_LEVEL}, получен ${p.level}`);
      }
      return;
    }
    case 'CONDITION_REMOVED': {
      const p = event.payload as PayloadByType['CONDITION_REMOVED'];
      const a = actorOf(state, p.targetId);
      if (!isConditionId(p.conditionId)) throw new EngineError(`нет такого состояния в SRD: ${p.conditionId}`);
      if (!a.conditions[p.conditionId]) throw new EngineError(`у ${a.name} нет состояния ${p.conditionId}`);
      return;
    }
    case 'TURN_ADVANCED': {
      const p = event.payload as PayloadByType['TURN_ADVANCED'];
      actorOf(state, p.actorId);
      if (p.round < 1 || p.turnIndex < 0) throw new EngineError('раунд от 1, ход от 0');
      // Порядок инициативы ставят ENCOUNTER_STARTED / INITIATIVE_SET; ход по нему только идёт.
      if (!state.encounter.active) throw new EngineError('бой не начат');
      const order = state.encounter.order;
      if (order[p.turnIndex] !== p.actorId) throw new EngineError(`ход ${p.turnIndex} в порядке инициативы — не ${p.actorId}`);
      return;
    }
    case 'ENCOUNTER_STARTED': {
      const p = event.payload as PayloadByType['ENCOUNTER_STARTED'];
      if (state.encounter.active) throw new EngineError('бой уже идёт');
      checkOrder(state, p.order);
      for (const id of p.surprised ?? []) if (!p.order.some(o => o.actorId === id)) throw new EngineError(`внезапный ${id} не в порядке инициативы`);
      return;
    }
    case 'ENCOUNTER_ENDED':
      if (!state.encounter.active) throw new EngineError('бой не идёт');
      return;
    case 'INITIATIVE_SET': {
      const p = event.payload as PayloadByType['INITIATIVE_SET'];
      checkOrder(state, p.order);
      return;
    }
    case 'CONCENTRATION_STARTED': {
      const p = event.payload as PayloadByType['CONCENTRATION_STARTED'];
      const a = actorOf(state, p.actorId);
      if (a.removed) throw new EngineError(`${a.name} выбыл`);
      if (!p.spell.trim()) throw new EngineError('концентрация: нужно название заклинания');
      if (p.untilSec !== undefined && p.untilSec <= state.time.sec) throw new EngineError('концентрация: срок уже прошёл');
      return;
    }
    case 'CONCENTRATION_ENDED': {
      const p = event.payload as PayloadByType['CONCENTRATION_ENDED'];
      const a = actorOf(state, p.actorId);
      if (!a.concentration) throw new EngineError(`${a.name} не концентрируется`);
      return;
    }
    case 'ACTOR_SPAWNED': {
      const p = event.payload as PayloadByType['ACTOR_SPAWNED'];
      checkActor(p.actor);
      if (state.actors[p.actor.id]) throw new EngineError(`актёр ${p.actor.id} уже есть`);
      return;
    }
    case 'ACTOR_REMOVED': {
      const p = event.payload as PayloadByType['ACTOR_REMOVED'];
      const a = actorOf(state, p.actorId);
      if (a.removed) throw new EngineError(`${a.name} уже выбыл`);
      return;
    }
    case 'WORLD_DELTA_PROPOSED': {
      const p = event.payload as PayloadByType['WORLD_DELTA_PROPOSED'];
      const d = p.delta;
      if (!d?.id) throw new EngineError('предложение без id');
      if (state.deltas[d.id]) throw new EngineError(`предложение ${d.id} уже есть`);
      if (d.status !== 'pending') throw new EngineError('предложение рождается только pending: решает мастер');
      if (!d.causeId) throw new EngineError(`у предложения ${d.id} нет causeId`);
      return;
    }
    case 'REST_TAKEN': {
      const p = event.payload as PayloadByType['REST_TAKEN'];
      if (state.encounter.active) throw new EngineError('в бою не отдыхают: сначала закончить бой');
      if (p.kind !== 'short' && p.kind !== 'long') throw new EngineError(`отдых бывает короткий или долгий, не ${String(p.kind)}`);
      if (p.actorIds.length === 0) throw new EngineError('отдых: некому отдыхать');
      const seen = new Set<string>();
      for (const id of p.actorIds) {
        const a = actorOf(state, id);
        if (a.removed) throw new EngineError(`${a.name} выбыл и не отдыхает`);
        if (seen.has(id)) throw new EngineError(`${a.name} дважды в отдыхе`);
        seen.add(id);
      }
      if (p.kind === 'long') {
        if (p.hitDice && p.hitDice.length > 0) throw new EngineError('кости хитов тратят на коротком отдыхе; долгий возвращает их сам');
        if (p.resources && p.resources.length > 0) throw new EngineError('долгий отдых возвращает все ресурсы сам — список не нужен');
        return;
      }
      const restored = new Set<string>();
      for (const r of p.resources ?? []) {
        const a = actorOf(state, r.actorId);
        if (!seen.has(r.actorId)) throw new EngineError(`${a.name} не отдыхает, а ресурс возвращает`);
        if (!isResourceId(r.resourceId)) throw new EngineError(`нет такого ресурса в SRD: ${r.resourceId}`);
        const key = `${r.actorId}:${r.resourceId}`;
        if (restored.has(key)) throw new EngineError(`${a.name}: ${RESOURCES[r.resourceId].label} дважды в списке отдыха`);
        restored.add(key);
        if (spentOf(a, r.resourceId) === 0) throw new EngineError(`${a.name}: ${RESOURCES[r.resourceId].label} не тратились — возвращать нечего`);
      }
      const spent = new Set<string>();
      for (const h of p.hitDice ?? []) {
        const a = actorOf(state, h.actorId);
        if (!seen.has(h.actorId)) throw new EngineError(`${a.name} не отдыхает, а кости хитов тратит`);
        if (spent.has(h.actorId)) throw new EngineError(`${a.name} дважды тратит кости хитов`);
        spent.add(h.actorId);
        if (!a.sheet) throw new EngineError(`у ${a.name} нет костей хитов: нет листа`);
        positive(h.dice, `кости хитов ${a.name}`);
        if (!Number.isInteger(h.healed) || h.healed < 0) throw new EngineError(`хиты за кости у ${a.name}: целое не меньше нуля`);
        const available = a.sheet.level - (a.hitDiceSpent ?? 0);
        if (h.dice > available) throw new EngineError(`у ${a.name} осталось ${available} костей хитов, а тратится ${h.dice}`);
      }
      return;
    }
    case 'RESOURCE_SPENT':
    case 'RESOURCE_RESTORED': {
      const p = event.payload as PayloadByType['RESOURCE_SPENT'];
      const a = actorOf(state, p.actorId);
      if (a.removed) throw new EngineError(`${a.name} выбыл`);
      if (!isResourceId(p.resourceId)) throw new EngineError(`нет такого ресурса в SRD: ${p.resourceId}`);
      const label = RESOURCES[p.resourceId].label;
      positive(p.amount, `${label} у ${a.name}`);
      if (!Number.isInteger(p.max) || p.max < 0) throw new EngineError(`${label} у ${a.name}: максимум — целое не меньше нуля, получено ${p.max}`);
      const spent = spentOf(a, p.resourceId);
      if (event.type === 'RESOURCE_SPENT' && spent + p.amount > p.max) throw new EngineError(`${label} у ${a.name}: осталось ${Math.max(0, p.max - spent)} из ${p.max}, а тратится ${p.amount}`);
      if (event.type === 'RESOURCE_RESTORED' && p.amount > spent) throw new EngineError(`${label} у ${a.name}: потрачено ${spent}, а возвращается ${p.amount}`);
      return;
    }
    case 'TIME_ADVANCED': {
      const p = event.payload as PayloadByType['TIME_ADVANCED'];
      positive(p.steps, 'шагов времени');
      if (p.fromSec !== state.time.sec) throw new EngineError(`время ушло: событие от ${p.fromSec}, сейчас ${state.time.sec}`);
      if (p.toSec <= p.fromSec) throw new EngineError('время идёт только вперёд; назад — через отмену');
      return;
    }
    case 'WORLD_DELTA_ACCEPTED':
    case 'WORLD_DELTA_REJECTED':
    case 'WORLD_DELTA_REROLLED': {
      const p = event.payload as { deltaId: string; variantId?: string };
      const d = state.deltas[p.deltaId];
      if (!d) throw new EngineError(`нет предложения ${p.deltaId}`);
      if (d.status !== 'pending') throw new EngineError(`предложение ${p.deltaId} уже решено: ${d.status}`);
      if (event.type === 'WORLD_DELTA_REROLLED' && !d.variants?.some(v => v.id === p.variantId)) throw new EngineError(`у предложения ${p.deltaId} нет варианта ${p.variantId}`);
      if (event.type === 'WORLD_DELTA_ACCEPTED' && d.patch) checkPatch(state, d.patch);
      return;
    }
    case 'FACT_REVEALED': {
      const p = event.payload as PayloadByType['FACT_REVEALED'];
      if (!state.facts[p.factId]) throw new EngineError(`нет факта ${p.factId}`);
      return;
    }
    case 'PARTY_TRAVELED': {
      const p = event.payload as PayloadByType['PARTY_TRAVELED'];
      if (state.encounter.active) throw new EngineError('в бою не уходят в поход: сначала закончить бой');
      if (!state.world.locations[p.toId]) throw new EngineError(`нет места ${p.toId}`);
      if (p.fromId !== undefined && !state.world.locations[p.fromId]) throw new EngineError(`нет места ${p.fromId}`);
      if (!state.party.some(id => !state.actors[id]?.removed)) throw new EngineError('поход: в партии никого');
      if (!TRAVEL_PACES[p.pace]) throw new EngineError(`темп похода бывает быстрый, обычный или медленный, не ${String(p.pace)}`);
      if (p.points.length < 2) throw new EngineError('поход: путь — хотя бы две точки');
      if (!Number.isFinite(p.miles) || p.miles < 0) throw new EngineError(`поход: мили — не меньше нуля, получено ${p.miles}`);
      if (!Number.isFinite(p.days) || p.days <= 0) throw new EngineError(`поход: дней пути больше нуля, получено ${p.days}`);
      return;
    }
    case 'PLACE_REVEALED': {
      const p = event.payload as PayloadByType['PLACE_REVEALED'];
      const l = state.world.locations[p.locationId];
      if (!l) throw new EngineError(`нет места ${p.locationId}`);
      if (l.revealed) throw new EngineError(`${l.name} уже открыто игрокам`);
      return;
    }
    case 'DICE_ROLLED':
    case 'NOTE_ADDED':
      return;
  }
}

/** Патч предложения указывает на существующую запись мира — иначе принятие не применится и в лог не попадёт. */
function checkPatch(state: State, patch: WorldPatch): void {
  const table = patch.kind === 'faction' ? state.world.factions : patch.kind === 'location' ? state.world.locations : state.world.threads;
  if (!table[patch.id]) throw new EngineError(`патч предложения указывает на несуществующее: ${patch.kind} ${patch.id}`);
}

/** Текущее значение поля, которое патч перепишет, — в форме того же патча: это снимок «было». */
function readPatch(state: State, patch: WorldPatch): WorldPatch {
  switch (patch.kind) {
    case 'faction': return { ...patch, value: state.world.factions[patch.id][patch.field] ?? 0 };
    case 'location':
      return patch.field === 'danger'
        ? { ...patch, value: state.world.locations[patch.id].danger ?? 'low' }
        : { ...patch, value: state.world.locations[patch.id].pricePercent ?? 0 };
    case 'thread': return { ...patch, status: state.world.threads[patch.id].status };
  }
}

function writePatch(draft: State, patch: WorldPatch): void {
  switch (patch.kind) {
    case 'faction': draft.world.factions[patch.id][patch.field] = patch.value; return;
    case 'location':
      if (patch.field === 'danger') draft.world.locations[patch.id].danger = patch.value;
      else draft.world.locations[patch.id].pricePercent = patch.value;
      return;
    case 'thread': draft.world.threads[patch.id].status = patch.status; return;
  }
}

/** Применяет событие; для компенсаций — восстанавливает записанный след. */
export function apply(state: State, event: DomainEvent): { state: State; effect: Effect } {
  if (event.undoes || event.redoes) {
    if (!event.effect) throw new EngineError(`компенсация ${event.id} без следа`);
    return { state: applyEffect(state, event.effect), effect: event.effect };
  }
  validate(state, event);
  let effect: Effect = { kind: 'none' };
  const next = produce(state, draft => {
    switch (event.type) {
      case 'DAMAGE_APPLIED': {
        const p = event.payload as PayloadByType['DAMAGE_APPLIED'];
        const a = draft.actors[p.targetId];
        const before = hpSnap(a.hp);
        // Временные хиты уходят первыми (SRD): остаток бьёт по настоящим, ниже нуля не бывает.
        const fromTemp = Math.min(a.hp.temp, p.amount);
        a.hp.temp -= fromTemp;
        a.hp.current = Math.max(0, a.hp.current - (p.amount - fromTemp));
        effect = { kind: 'hp', targetId: p.targetId, before, after: hpSnap(a.hp) };
        break;
      }
      case 'HEALING_APPLIED': {
        const p = event.payload as PayloadByType['HEALING_APPLIED'];
        const a = draft.actors[p.targetId];
        const before = hpSnap(a.hp);
        a.hp.current = Math.min(a.hp.max, a.hp.current + p.amount);
        effect = { kind: 'hp', targetId: p.targetId, before, after: hpSnap(a.hp) };
        break;
      }
      case 'TEMP_HP_GRANTED': {
        const p = event.payload as PayloadByType['TEMP_HP_GRANTED'];
        const a = draft.actors[p.targetId];
        const before = hpSnap(a.hp);
        // Не складываются: остаётся большее из имеющегося и нового (SRD).
        a.hp.temp = Math.max(a.hp.temp, p.amount);
        effect = { kind: 'hp', targetId: p.targetId, before, after: hpSnap(a.hp) };
        break;
      }
      case 'CONDITION_ADDED': {
        const p = event.payload as PayloadByType['CONDITION_ADDED'];
        const a = draft.actors[p.targetId];
        const before = a.conditions[p.conditionId] ? { ...a.conditions[p.conditionId] } : undefined;
        if (p.conditionId === 'exhaustion') {
          // Уровнями, не тумблером: явный уровень ставится, без уровня — плюс один, потолок 6.
          const level = p.level ?? Math.min(EXHAUSTION_MAX_LEVEL, (before?.level ?? 0) + 1);
          a.conditions.exhaustion = { level };
        } else {
          const snap: ConditionSnapshot = {};
          if (p.until !== undefined) snap.until = p.until;
          if (p.untilSec !== undefined) snap.untilSec = p.untilSec;
          a.conditions[p.conditionId] = snap;
        }
        effect = { kind: 'condition', targetId: p.targetId, conditionId: p.conditionId, before, after: { ...a.conditions[p.conditionId] } };
        break;
      }
      case 'CONDITION_REMOVED': {
        const p = event.payload as PayloadByType['CONDITION_REMOVED'];
        const a = draft.actors[p.targetId];
        const before = { ...a.conditions[p.conditionId] };
        let after: typeof before | undefined;
        if (p.conditionId === 'exhaustion' && (before.level ?? 1) > 1) {
          // Долгий отдых снимает один уровень (SRD), поэтому снятие — минус уровень.
          after = { level: (before.level ?? 1) - 1 };
          a.conditions.exhaustion = after;
        } else {
          delete a.conditions[p.conditionId];
        }
        effect = { kind: 'condition', targetId: p.targetId, conditionId: p.conditionId, before, after };
        break;
      }
      case 'TURN_ADVANCED': {
        const p = event.payload as PayloadByType['TURN_ADVANCED'];
        const e = draft.encounter;
        const before = { round: e.round, turnIndex: e.turnIndex, actorId: e.active ? e.order[e.turnIndex] ?? null : null };
        e.active = true;
        e.round = p.round;
        e.turnIndex = p.turnIndex;
        effect = { kind: 'turn', before, after: { round: p.round, turnIndex: p.turnIndex, actorId: p.actorId } };
        break;
      }
      case 'TIME_ADVANCED': {
        const p = event.payload as PayloadByType['TIME_ADVANCED'];
        const before = draft.time.sec;
        draft.time.sec = p.toSec;
        draft.time.tempo = p.tempo;
        effect = { kind: 'time', before, after: p.toSec };
        break;
      }
      case 'WORLD_DELTA_ACCEPTED':
      case 'WORLD_DELTA_REJECTED': {
        const p = event.payload as { deltaId: string };
        const d = draft.deltas[p.deltaId];
        // Патч — из исходного состояния, не из черновика: в след события уходит обычный объект, а не прокси Immer.
        const patch = event.type === 'WORLD_DELTA_ACCEPTED' ? state.deltas[p.deltaId].patch : undefined;
        const before = { status: d.status, now: d.now, cause: d.cause, variantId: d.variantId, ...(patch ? { world: readPatch(state, patch) } : {}) };
        d.status = event.type === 'WORLD_DELTA_ACCEPTED' ? 'accepted' : 'rejected';
        // Принятие меняет числа мира: пока мастер не решил, в мире стояло старое значение (CLAUDE.md «Правила экрана»).
        if (patch) writePatch(draft, patch);
        effect = { kind: 'delta', deltaId: p.deltaId, before, after: { status: d.status, now: d.now, cause: d.cause, variantId: d.variantId, ...(patch ? { world: patch } : {}) } };
        break;
      }
      case 'WORLD_DELTA_REROLLED': {
        const p = event.payload as PayloadByType['WORLD_DELTA_REROLLED'];
        const d = draft.deltas[p.deltaId];
        // Причина — в снимке: у базового варианта (variantId пуст) её иначе не восстановить при откате переброса.
        const before = { status: d.status, now: d.now, cause: d.cause, variantId: d.variantId };
        const v = d.variants!.find(x => x.id === p.variantId)!;
        d.now = v.now;
        d.cause = v.cause;
        d.variantId = v.id;
        effect = { kind: 'delta', deltaId: p.deltaId, before, after: { status: d.status, now: d.now, cause: d.cause, variantId: d.variantId } };
        break;
      }
      case 'FACT_REVEALED': {
        const p = event.payload as PayloadByType['FACT_REVEALED'];
        const f = draft.facts[p.factId];
        const before = f.visibility;
        f.visibility = 'players';
        effect = { kind: 'fact', factId: p.factId, before, after: 'players' };
        break;
      }
      case 'NOTE_ADDED':
        effect = { kind: 'note', noteId: event.id };
        break;
      case 'PARTY_TRAVELED': {
        const p = event.payload as PayloadByType['PARTY_TRAVELED'];
        // Переезжает вся партия, кроме выбывших: место у каждого своё, след — по каждому.
        const actors = state.party.filter(id => !state.actors[id]?.removed).map(actorId => {
          const before = state.actors[actorId].locationId;
          draft.actors[actorId].locationId = p.toId;
          return before === undefined ? { actorId, after: p.toId } : { actorId, before, after: p.toId };
        });
        effect = { kind: 'travel', actors };
        break;
      }
      case 'PLACE_REVEALED': {
        const p = event.payload as PayloadByType['PLACE_REVEALED'];
        draft.world.locations[p.locationId].revealed = true;
        effect = { kind: 'place', locationId: p.locationId, before: false, after: true };
        break;
      }
      case 'DICE_ROLLED':
        effect = { kind: 'none' };
        break;
      case 'ENCOUNTER_STARTED': {
        const p = event.payload as PayloadByType['ENCOUNTER_STARTED'];
        const before = encounterSnap(state, p.order.map(o => o.actorId));
        for (const o of p.order) draft.actors[o.actorId].initiative = o.initiative;
        draft.encounter.active = true;
        draft.encounter.round = 1;
        draft.encounter.turnIndex = 0;
        draft.encounter.order = p.order.map(o => o.actorId);
        effect = { kind: 'encounter', before, after: encounterSnap(draft, p.order.map(o => o.actorId)) };
        break;
      }
      case 'ENCOUNTER_ENDED': {
        const before = encounterSnap(state);
        for (const id of state.encounter.order) delete draft.actors[id]?.initiative;
        draft.encounter.active = false;
        draft.encounter.round = 0;
        draft.encounter.turnIndex = 0;
        draft.encounter.order = [];
        effect = { kind: 'encounter', before, after: encounterSnap(draft, before.order) };
        break;
      }
      case 'INITIATIVE_SET': {
        const p = event.payload as PayloadByType['INITIATIVE_SET'];
        const ids = [...new Set([...state.encounter.order, ...p.order.map(o => o.actorId)])];
        const before = encounterSnap(state, ids);
        for (const id of state.encounter.order) if (!p.order.some(o => o.actorId === id)) delete draft.actors[id]?.initiative;
        for (const o of p.order) draft.actors[o.actorId].initiative = o.initiative;
        // Чей ход — сохраняется, если он остался в порядке; иначе ход уходит ближайшему следующему по старому кругу.
        const newOrder = p.order.map(o => o.actorId);
        draft.encounter.order = newOrder;
        if (state.encounter.active) draft.encounter.turnIndex = nextTurnIndex(state.encounter.order, state.encounter.turnIndex, newOrder);
        effect = { kind: 'encounter', before, after: encounterSnap(draft, ids) };
        break;
      }
      case 'CONCENTRATION_STARTED': {
        const p = event.payload as PayloadByType['CONCENTRATION_STARTED'];
        const a = draft.actors[p.actorId];
        const before = a.concentration ? { ...a.concentration } : undefined;
        // Второе заклинание с концентрацией кончает первое (SRD): слот один.
        a.concentration = p.untilSec === undefined ? { spell: p.spell } : { spell: p.spell, untilSec: p.untilSec };
        effect = { kind: 'concentration', actorId: p.actorId, before, after: { ...a.concentration } };
        break;
      }
      case 'CONCENTRATION_ENDED': {
        const p = event.payload as PayloadByType['CONCENTRATION_ENDED'];
        const a = draft.actors[p.actorId];
        const before = { ...a.concentration! };
        delete a.concentration;
        effect = { kind: 'concentration', actorId: p.actorId, before, after: undefined };
        break;
      }
      case 'ACTOR_SPAWNED': {
        const p = event.payload as PayloadByType['ACTOR_SPAWNED'];
        const enc = encounterSnap(state);
        const partyBefore = [...state.party];
        draft.actors[p.actor.id] = castDraft(structuredClone(p.actor));
        if (p.party && !draft.party.includes(p.actor.id)) draft.party = [...draft.party, p.actor.id];
        effect = { kind: 'actor', actorId: p.actor.id, before: undefined, after: structuredClone(p.actor) as Actor, party: { before: partyBefore, after: [...draft.party] }, encounter: { before: enc, after: enc } };
        break;
      }
      case 'ACTOR_REMOVED': {
        const p = event.payload as PayloadByType['ACTOR_REMOVED'];
        const a = draft.actors[p.actorId];
        const before = structuredClone(state.actors[p.actorId]) as Actor;
        const encBefore = encounterSnap(state);
        a.removed = true;
        // Из порядка инициативы выбывает; если ход был его — ход уходит следующему.
        if (state.encounter.order.includes(p.actorId)) {
          const order = state.encounter.order.filter(id => id !== p.actorId);
          draft.encounter.order = order;
          if (state.encounter.active) draft.encounter.turnIndex = nextTurnIndex(state.encounter.order, state.encounter.turnIndex, order);
        }
        effect = { kind: 'actor', actorId: p.actorId, before, after: structuredClone(current(a)) as Actor, party: { before: [...state.party], after: [...draft.party] }, encounter: { before: encBefore, after: encounterSnap(draft, [p.actorId]) } };
        break;
      }
      case 'WORLD_DELTA_PROPOSED': {
        const p = event.payload as PayloadByType['WORLD_DELTA_PROPOSED'];
        draft.deltas[p.delta.id] = castDraft(structuredClone(p.delta));
        effect = { kind: 'none' };
        break;
      }
      case 'REST_TAKEN': {
        const p = event.payload as PayloadByType['REST_TAKEN'];
        const actors = p.actorIds.map(actorId => {
          const a = draft.actors[actorId];
          const before = restSnap(state.actors[actorId]);
          if (p.kind === 'long') {
            // SRD: все хиты, временные сгорают, истощение на уровень меньше, половина костей хитов возвращается.
            a.hp.current = a.hp.max;
            a.hp.temp = 0;
            const ex = a.conditions.exhaustion?.level;
            if (ex !== undefined) {
              if (ex <= 1) delete a.conditions.exhaustion;
              else a.conditions.exhaustion = { ...a.conditions.exhaustion, level: ex - 1 };
            }
            if (a.sheet) {
              const left = Math.max(0, (a.hitDiceSpent ?? 0) - hitDiceRegained(a.sheet.level));
              if (left === 0) delete a.hitDiceSpent;
              else a.hitDiceSpent = left;
            }
            // SRD: долгий отдых возвращает все ресурсы класса.
            delete a.resourcesSpent;
          } else {
            const h = p.hitDice?.find(x => x.actorId === actorId);
            if (h) {
              a.hp.current = Math.min(a.hp.max, a.hp.current + h.healed);
              a.hitDiceSpent = (a.hitDiceSpent ?? 0) + h.dice;
            }
            for (const r of p.resources ?? []) if (r.actorId === actorId) putSpent(a, r.resourceId, 0);
          }
          return { actorId, before, after: restSnap(current(a)) };
        });
        effect = { kind: 'rest', actors };
        break;
      }
      case 'RESOURCE_SPENT':
      case 'RESOURCE_RESTORED': {
        const p = event.payload as PayloadByType['RESOURCE_SPENT'];
        const a = draft.actors[p.actorId];
        const before = spentOf(a, p.resourceId);
        const after = event.type === 'RESOURCE_SPENT' ? before + p.amount : before - p.amount;
        putSpent(a, p.resourceId, after);
        effect = { kind: 'resource', actorId: p.actorId, resourceId: p.resourceId, before, after };
        break;
      }
    }
  });
  return { state: next, effect };
}

/** Ставит состояние в `after` следа — так откатываются и повторяются события. */
export function applyEffect(state: State, effect: Effect): State {
  return produce(state, draft => {
    switch (effect.kind) {
      case 'hp': {
        const a = draft.actors[effect.targetId];
        if (!a) throw new EngineError(`нет актёра ${effect.targetId}`);
        a.hp.current = effect.after.current;
        a.hp.temp = effect.after.temp;
        return;
      }
      case 'condition': {
        const a = draft.actors[effect.targetId];
        if (!a) throw new EngineError(`нет актёра ${effect.targetId}`);
        if (effect.after) a.conditions[effect.conditionId] = { ...effect.after };
        else delete a.conditions[effect.conditionId];
        return;
      }
      case 'turn': {
        const e = draft.encounter;
        e.round = effect.after.round;
        e.turnIndex = effect.after.turnIndex;
        e.active = effect.after.actorId !== null;
        return;
      }
      case 'time':
        draft.time.sec = effect.after;
        return;
      case 'delta': {
        const d = draft.deltas[effect.deltaId];
        if (!d) throw new EngineError(`нет предложения ${effect.deltaId}`);
        d.status = effect.after.status;
        d.now = effect.after.now;
        d.variantId = effect.after.variantId;
        if (effect.after.cause !== undefined) d.cause = effect.after.cause;
        else if (effect.after.variantId && d.variants) d.cause = d.variants.find(v => v.id === effect.after.variantId)?.cause ?? d.cause; // след без причины — логи до шага 8
        if (effect.after.world) writePatch(draft, effect.after.world);
        return;
      }
      case 'fact': {
        const f = draft.facts[effect.factId];
        if (!f) throw new EngineError(`нет факта ${effect.factId}`);
        f.visibility = effect.after;
        return;
      }
      case 'encounter':
        putEncounter(draft, effect.after);
        return;
      case 'concentration': {
        const a = draft.actors[effect.actorId];
        if (!a) throw new EngineError(`нет актёра ${effect.actorId}`);
        if (effect.after) a.concentration = { ...effect.after };
        else delete a.concentration;
        return;
      }
      case 'actor': {
        if (effect.after) draft.actors[effect.actorId] = castDraft(structuredClone(effect.after));
        else delete draft.actors[effect.actorId];
        draft.party = [...effect.party.after];
        putEncounter(draft, effect.encounter.after);
        return;
      }
      case 'rest': {
        for (const r of effect.actors) {
          const a = draft.actors[r.actorId];
          if (!a) throw new EngineError(`нет актёра ${r.actorId}`);
          putRest(a, r.after);
        }
        return;
      }
      case 'resource': {
        const a = draft.actors[effect.actorId];
        if (!a) throw new EngineError(`нет актёра ${effect.actorId}`);
        putSpent(a, effect.resourceId, effect.after);
        return;
      }
      case 'travel': {
        for (const t of effect.actors) {
          const a = draft.actors[t.actorId];
          if (!a) throw new EngineError(`нет актёра ${t.actorId}`);
          if (t.after === undefined) delete a.locationId;
          else a.locationId = t.after;
        }
        return;
      }
      case 'place': {
        const l = draft.world.locations[effect.locationId];
        if (!l) throw new EngineError(`нет места ${effect.locationId}`);
        if (effect.after) l.revealed = true;
        else delete l.revealed;
        return;
      }
      case 'note':
      case 'none':
        return;
    }
  });
}

/** След наоборот: after ↔ before. Для заметки и броска откатывать нечего — след тот же. */
export function invert(effect: Effect): Effect {
  switch (effect.kind) {
    case 'hp': return { ...effect, before: effect.after, after: effect.before };
    case 'condition': return { ...effect, before: effect.after, after: effect.before };
    case 'turn': return { ...effect, before: effect.after, after: effect.before };
    case 'time': return { ...effect, before: effect.after, after: effect.before };
    case 'delta': return { ...effect, before: effect.after, after: effect.before };
    case 'fact': return { ...effect, before: effect.after, after: effect.before };
    case 'encounter': return { ...effect, before: effect.after, after: effect.before };
    case 'concentration': return { ...effect, before: effect.after, after: effect.before };
    case 'actor': return {
      ...effect,
      before: effect.after,
      after: effect.before,
      party: { before: effect.party.after, after: effect.party.before },
      encounter: { before: effect.encounter.after, after: effect.encounter.before },
    };
    case 'rest': return { ...effect, actors: effect.actors.map(r => ({ actorId: r.actorId, before: r.after, after: r.before })) };
    case 'resource': return { ...effect, before: effect.after, after: effect.before };
    case 'travel': return { ...effect, actors: effect.actors.map(t => ({ actorId: t.actorId, before: t.after, after: t.before })) };
    case 'place': return { ...effect, before: effect.after, after: effect.before };
    case 'note':
    case 'none':
      return effect;
  }
}
