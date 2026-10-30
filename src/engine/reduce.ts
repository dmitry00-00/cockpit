// Редьюсер: одно событие → новое состояние и точный след (effect). Чистая функция, без стора.
// Компенсирующее событие (undoes / redoes) не применяет payload заново, а восстанавливает `after`
// своего effect — он заранее собран из следа исходного события (см. log.ts).
import { castDraft, current, produce } from 'immer';
import { EXHAUSTION_MAX_LEVEL, isConditionId } from '../rules/srd/conditions';
import { RESOURCES, isResourceId } from '../rules/srd/resources';
import { TRAVEL_PACES } from '../rules/srd/travel';
import { isSkillId } from '../rules/srd/abilities';
import { isEntityRef, type EntityRef } from '../entities/ref';
import { SUPPLY_REASONS, SUPPLY_SPENDS, type SheetPatch, type SheetSnapshot, type ConditionSnapshot, type DomainEvent, type Effect, type EncounterSnapshot, type HpSnapshot, type InitiativeEntry, type GridCell, type PayloadByType, type RestSnapshot } from './events';
import { GOODS, type Actor, type KnownFact, type State, type WorldPatch } from './state';

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
    case 'SUPPLY_CHANGED': {
      const p = event.payload as PayloadByType['SUPPLY_CHANGED'];
      if (!SUPPLY_REASONS.includes(p.reason)) throw new EngineError(`припасы: нет такой причины ${String(p.reason)}`);
      const short = p.shortfall ?? 0;
      if (!Number.isInteger(short) || short < 0) throw new EngineError(`припасы: «не хватило» — целое не меньше нуля, получено ${p.shortfall}`);
      if (short > 0 && p.reason !== 'eaten') throw new EngineError('припасы: «не хватило» бывает только у съеденного');
      if (!Number.isInteger(p.amount) || p.amount < 0 || (p.amount === 0 && short === 0)) throw new EngineError(`припасы: сколько — целое больше нуля, получено ${p.amount}`);
      const have = state.supply ?? 0;
      if (SUPPLY_SPENDS.has(p.reason) && p.amount > have) throw new EngineError(`припасов ${have}, а списывается ${p.amount}`);
      return;
    }
    case 'PLACE_REVEALED': {
      const p = event.payload as PayloadByType['PLACE_REVEALED'];
      const l = state.world.locations[p.locationId];
      if (!l) throw new EngineError(`нет места ${p.locationId}`);
      if (l.revealed) throw new EngineError(`${l.name} уже открыто игрокам`);
      return;
    }
    case 'CHARACTER_LEVELED': {
      const p = event.payload as PayloadByType['CHARACTER_LEVELED'];
      const a = state.actors[p.actorId];
      if (!a) throw new EngineError(`нет актёра ${p.actorId}`);
      if (!a.sheet) throw new EngineError(`${a.name}: без листа уровень не поднять`);
      if (p.sheet.level !== a.sheet.level + 1 || p.sheet.level > 20) throw new EngineError(`${a.name}: уровень ${a.sheet.level} → ${p.sheet.level} — повышение на один, не выше 20-го`);
      if (p.sheet.classId !== a.sheet.classId || p.sheet.raceId !== a.sheet.raceId) throw new EngineError(`${a.name}: повышение не меняет класс и расу`);
      if (!Number.isInteger(p.hpMax) || p.hpMax <= a.hp.max) throw new EngineError(`${a.name}: максимум хитов после повышения ${p.hpMax} — не больше прежнего ${a.hp.max}`);
      if (!Number.isInteger(p.ac) || !Number.isInteger(p.passivePerception)) throw new EngineError(`${a.name}: AC и пассивное внимание — целые`);
      return;
    }
    case 'SHEET_EDITED': {
      const p = event.payload as PayloadByType['SHEET_EDITED'];
      const a = state.actors[p.actorId];
      if (!a) throw new EngineError(`нет актёра ${p.actorId}`);
      if (!a.sheet) throw new EngineError(`${a.name}: листа нет — править нечего`);
      if (!p.reason?.trim()) throw new EngineError('правка листа: нужна причина — она в журнале');
      const keys = Object.keys(p.patch ?? {});
      if (keys.length === 0 || keys.some(k => !SHEET_PATCH_KEYS.includes(k as keyof SheetPatch))) throw new EngineError(`правка листа: поля ${keys.join(', ') || 'нет'} — правятся только ${SHEET_PATCH_KEYS.join(', ')}`);
      return;
    }
    case 'TOKEN_MOVED': {
      const p = event.payload as PayloadByType['TOKEN_MOVED'];
      const a = state.actors[p.actorId];
      if (!a) throw new EngineError(`нет актёра ${p.actorId}`);
      if (p.source !== 'maptool' && p.source !== 'dm') throw new EngineError(`ход токена: источник ${String(p.source)} — только maptool или dm`);
      // Клетки MapTool бывают и отрицательными: карта зоны растёт во все стороны от начала.
      const isCell = (c: unknown) => !!c && Number.isInteger((c as GridCell).x) && Number.isInteger((c as GridCell).y);
      if (!isCell(p.to) || (p.from !== undefined && !isCell(p.from))) throw new EngineError(`${a.name}: клетка — пара целых x, y`);
      if (a.cell && a.cell.x === p.to.x && a.cell.y === p.to.y) throw new EngineError(`${a.name}: уже на клетке (${p.to.x}, ${p.to.y})`);
      return;
    }
    case 'KNOWLEDGE_REVEALED': {
      const p = event.payload as PayloadByType['KNOWLEDGE_REVEALED'];
      if (!isEntityRef(p.ref)) throw new EngineError(`знание: не ссылка ${String(p.ref)}`);
      if (!p.name?.trim() || !p.fact?.label?.trim() || !p.fact.value?.trim()) throw new EngineError('знание: нужны имя сущности, строка и её значение');
      if (state.knowledge?.[p.ref]?.facts.some(f => f.label === p.fact.label)) throw new EngineError(`${p.name}: «${p.fact.label}» партия уже знает`);
      if (p.by !== undefined && !state.actors[p.by]) throw new EngineError(`знание: нет актёра ${p.by}`);
      if (p.check) {
        const c = p.check;
        if (!isSkillId(c.skill)) throw new EngineError(`знание: нет навыка ${String(c.skill)}`);
        if (!Number.isInteger(c.dc) || c.dc < 1 || !Number.isInteger(c.total)) throw new EngineError('знание: Сл и итог — целые числа');
        if (c.total < c.dc) throw new EngineError(`проверка не прошла: ${c.total} против Сл ${c.dc} — факт не открыт`);
      }
      return;
    }
    case 'DICE_ROLLED':
    case 'NOTE_ADDED':
      return;
  }
}

/**
 * Патч предложения указывает на существующую запись мира и несёт допустимое число — иначе принятие не применится и в
 * лог не попадёт.
 */
function checkPatch(state: State, patch: WorldPatch): void {
  const { factions, locations, threads } = state.world;
  const missing = (what: string, id: string) => new EngineError(`патч предложения указывает на несуществующее: ${what} ${id}`);
  switch (patch.kind) {
    case 'faction': if (!factions[patch.id]) throw missing('faction', patch.id); return;
    case 'thread': if (!threads[patch.id]) throw missing('thread', patch.id); return;
    case 'location': if (!locations[patch.id]) throw missing('location', patch.id); return;
    case 'relation':
      if (!factions[patch.id]) throw missing('faction', patch.id);
      if (!factions[patch.other]) throw missing('faction', patch.other);
      if (patch.id === patch.other) throw new EngineError('отношение фракции к самой себе не ведётся');
      if (!Number.isInteger(patch.value) || Math.abs(patch.value) > 3) throw new EngineError(`отношение фракций — целое от −3 до +3, получено ${patch.value}`);
      return;
    case 'price':
      if (!locations[patch.id]) throw missing('location', patch.id);
      if (!GOODS.includes(patch.goods)) throw new EngineError(`нет такого товара: ${String(patch.goods)}`);
      if (!Number.isFinite(patch.value) || patch.value <= -100) throw new EngineError(`надбавка к цене больше −100%, получено ${patch.value}`);
      return;
    case 'stock':
      if (!locations[patch.id]) throw missing('location', patch.id);
      if (!GOODS.includes(patch.goods)) throw new EngineError(`нет такого товара: ${String(patch.goods)}`);
      if (patch.value !== null && !(Number.isFinite(patch.value) && patch.value >= 0 && (patch.goods === 'food' || patch.value <= 10))) {
        throw new EngineError(`запас — от 0 (еда — дней, остальное — до 10), получено ${patch.value}`);
      }
      return;
    case 'encounter':
      if (!locations[patch.id]) throw missing('location', patch.id);
      if (!patch.key.trim()) throw new EngineError('вес встречи без того, кто встречается');
      if (!Number.isFinite(patch.value) || patch.value < 0) throw new EngineError(`вес встречи — не меньше нуля, получено ${patch.value}`);
      return;
    case 'newLocation': {
      const l = patch.location;
      if (!l?.id || !l.name?.trim()) throw new EngineError('новое место без id или имени');
      if (locations[l.id]) throw new EngineError(`место ${l.id} уже есть`);
      if (l.parentId !== undefined && !locations[l.parentId]) throw missing('location', l.parentId);
      return;
    }
    case 'removeLocation':
      if (!locations[patch.id]) throw missing('location', patch.id);
      if (Object.values(locations).some(l => l.parentId === patch.id)) throw new EngineError(`в месте ${patch.id} есть другие места — не убирается`);
      return;
    case 'newFaction': {
      const f = patch.faction;
      if (!f?.id || !f.name?.trim()) throw new EngineError('новая фракция без id или имени');
      if (factions[f.id]) throw new EngineError(`фракция ${f.id} уже есть`);
      if (!Number.isInteger(f.renown)) throw new EngineError(`известность — целое число, получено ${f.renown}`);
      return;
    }
    case 'removeFaction':
      if (!factions[patch.id]) throw missing('faction', patch.id);
      return;
    case 'newThread': {
      const t = patch.thread;
      if (!t?.id || !t.name?.trim()) throw new EngineError('новая нить без id или имени');
      if (threads[t.id]) throw new EngineError(`нить ${t.id} уже есть`);
      return;
    }
    case 'removeThread':
      if (!threads[patch.id]) throw missing('thread', patch.id);
      return;
    case 'process': {
      const pr = patch.process;
      if (!pr?.id || !pr.kind || !pr.name?.trim() || !pr.stage) throw new EngineError('процесс без id, вида, имени или стадии');
      if (!Number.isFinite(pr.nextSec) || !Number.isFinite(pr.startedSec)) throw new EngineError(`процесс ${pr.id}: такт и начало — секунды`);
      if (Object.values(pr.vars ?? {}).some(v => !Number.isFinite(v))) throw new EngineError(`процесс ${pr.id}: счётчики — числа`);
      return;
    }
    case 'removeProcess':
      if (!state.world.processes?.[patch.id]) throw missing('process', patch.id);
      return;
    case 'batch': {
      // Части проверяются по порядку — каждая против мира после предыдущих: «завести процесс и сразу сдвинуть цены».
      if (patch.patches.some(x => x.kind === 'batch')) throw new EngineError('составной патч внутри составного не ведётся');
      let s = state;
      for (const x of patch.patches) { checkPatch(s, x); s = produce(s, d => writePatch(d, x)); }
      return;
    }
  }
}

/** Текущее значение поля, которое патч перепишет, — в форме того же патча: это снимок «было». */
function readPatch(state: State, patch: WorldPatch): WorldPatch {
  const { factions, locations, threads } = state.world;
  switch (patch.kind) {
    case 'faction': return { ...patch, value: factions[patch.id][patch.field] ?? 0 };
    case 'location':
      return patch.field === 'danger'
        ? { ...patch, value: locations[patch.id].danger ?? 'low' }
        : { ...patch, value: locations[patch.id].pricePercent ?? 0 };
    case 'thread': return { ...patch, status: threads[patch.id].status };
    case 'relation': return { ...patch, value: factions[patch.id].relations?.[patch.other] ?? 0 };
    case 'price': return { ...patch, value: locations[patch.id].prices?.[patch.goods] ?? 0 };
    case 'stock': return { ...patch, value: locations[patch.id].stock?.[patch.goods] ?? null };
    case 'encounter': return { ...patch, value: locations[patch.id].encounters?.[patch.key] ?? 1 };
    // До нового места его не было — откат убирает его; убранное место возвращается целиком.
    case 'newLocation': return { kind: 'removeLocation', id: patch.location.id };
    case 'removeLocation': return { kind: 'newLocation', location: structuredClone(locations[patch.id]) };
    case 'newFaction': return { kind: 'removeFaction', id: patch.faction.id };
    case 'removeFaction': return { kind: 'newFaction', faction: structuredClone(factions[patch.id]) };
    case 'newThread': return { kind: 'removeThread', id: patch.thread.id };
    case 'removeThread': return { kind: 'newThread', thread: structuredClone(threads[patch.id]) };
    case 'process': {
      const was = state.world.processes?.[patch.process.id];
      return was ? { kind: 'process', process: structuredClone(was) } : { kind: 'removeProcess', id: patch.process.id };
    }
    case 'removeProcess': return { kind: 'process', process: structuredClone(state.world.processes![patch.id]) };
    case 'batch': {
      // Снимок «было» — по ходу применения частей, откат — в обратном порядке: так возвращаются и поле, которое
      // две части пишут подряд, и процесс, заведённый и сдвинутый одним принятием.
      const back: WorldPatch[] = [];
      let s = state;
      for (const x of patch.patches) { back.unshift(readPatch(s, x)); s = produce(s, d => writePatch(d, x)); }
      return { kind: 'batch', patches: back };
    }
  }
}

function writePatch(draft: State, patch: WorldPatch): void {
  const { factions, locations, threads } = draft.world;
  switch (patch.kind) {
    case 'faction': factions[patch.id][patch.field] = patch.value; return;
    case 'location':
      if (patch.field === 'danger') locations[patch.id].danger = patch.value;
      else locations[patch.id].pricePercent = patch.value;
      return;
    case 'thread': threads[patch.id].status = patch.status; return;
    case 'relation':
      // Отношение симметрично: 0 — запись не хранится, как и у фракций без отношений.
      for (const [a, b] of [[patch.id, patch.other], [patch.other, patch.id]] as const) {
        const rel = { ...factions[a].relations };
        if (patch.value === 0) delete rel[b]; else rel[b] = patch.value;
        factions[a].relations = rel;
      }
      return;
    case 'price': {
      const prices = { ...locations[patch.id].prices };
      if (patch.value === 0) delete prices[patch.goods]; else prices[patch.goods] = patch.value;
      // Пусто — поля нет, как до первой надбавки: откат возвращает запись точно.
      if (Object.keys(prices).length) locations[patch.id].prices = prices; else delete locations[patch.id].prices;
      return;
    }
    case 'stock': {
      const stock = { ...locations[patch.id].stock };
      if (patch.value === null) delete stock[patch.goods]; else stock[patch.goods] = patch.value;
      if (Object.keys(stock).length) locations[patch.id].stock = stock; else delete locations[patch.id].stock;
      return;
    }
    case 'encounter': {
      const enc = { ...locations[patch.id].encounters };
      if (patch.value === 1) delete enc[patch.key]; else enc[patch.key] = patch.value;
      if (Object.keys(enc).length) locations[patch.id].encounters = enc; else delete locations[patch.id].encounters;
      return;
    }
    case 'newLocation': locations[patch.location.id] = castDraft(structuredClone(patch.location)); return;
    case 'removeLocation': delete locations[patch.id]; return;
    case 'newFaction': factions[patch.faction.id] = castDraft(structuredClone(patch.faction)); return;
    case 'removeFaction': delete factions[patch.id]; return;
    case 'newThread': threads[patch.thread.id] = castDraft(structuredClone(patch.thread)); return;
    case 'removeThread': delete threads[patch.id]; return;
    case 'process': (draft.world.processes ??= {})[patch.process.id] = castDraft(structuredClone(patch.process)); return;
    case 'removeProcess': if (draft.world.processes) delete draft.world.processes[patch.id]; return;
    case 'batch': for (const x of patch.patches) writePatch(draft, x); return;
  }
}

/** Патч мира вне лога: симуляция прогоняет такты процесса на рабочей копии (процессы видят свои же последствия). */
export function applyWorldPatch(state: State, patch: WorldPatch): State {
  checkPatch(state, patch);
  return produce(state, d => writePatch(d, patch));
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
      case 'SUPPLY_CHANGED': {
        const p = event.payload as PayloadByType['SUPPLY_CHANGED'];
        const before = state.supply ?? 0;
        const after = SUPPLY_SPENDS.has(p.reason) ? before - p.amount : before + p.amount;
        draft.supply = after;
        effect = { kind: 'supply', before, after };
        break;
      }
      case 'PLACE_REVEALED': {
        const p = event.payload as PayloadByType['PLACE_REVEALED'];
        draft.world.locations[p.locationId].revealed = true;
        effect = { kind: 'place', locationId: p.locationId, before: false, after: true };
        break;
      }
      case 'CHARACTER_LEVELED': {
        const p = event.payload as PayloadByType['CHARACTER_LEVELED'];
        const a = state.actors[p.actorId];
        const before = sheetSnap(a);
        // Прибавка к максимуму прибавляется и к нынешним хитам: персонаж не теряет хиты оттого, что вырос (правило стола).
        const after: SheetSnapshot = { sheet: structuredClone(p.sheet), hp: { current: a.hp.current + (p.hpMax - a.hp.max), max: p.hpMax }, ac: p.ac, passivePerception: p.passivePerception };
        putSheet(draft.actors[p.actorId], after);
        effect = { kind: 'sheet', actorId: p.actorId, before, after };
        break;
      }
      case 'SHEET_EDITED': {
        const p = event.payload as PayloadByType['SHEET_EDITED'];
        const a = state.actors[p.actorId];
        const before = sheetSnap(a);
        const after: SheetSnapshot = { ...before, sheet: { ...structuredClone(before.sheet), ...structuredClone(p.patch) } };
        putSheet(draft.actors[p.actorId], after);
        effect = { kind: 'sheet', actorId: p.actorId, before, after };
        break;
      }
      case 'TOKEN_MOVED': {
        const p = event.payload as PayloadByType['TOKEN_MOVED'];
        // Откуда — со стола, если он знает клетку; иначе со слов MapTool (первый ход после расстановки сида).
        const known = state.actors[p.actorId].cell ?? p.from;
        const before = known ? { x: known.x, y: known.y } : undefined;
        draft.actors[p.actorId].cell = { x: p.to.x, y: p.to.y };
        effect = { kind: 'cell', actorId: p.actorId, before, after: { x: p.to.x, y: p.to.y } };
        break;
      }
      case 'KNOWLEDGE_REVEALED': {
        const p = event.payload as PayloadByType['KNOWLEDGE_REVEALED'];
        const known: KnownFact = { label: p.fact.label, value: p.fact.value, sec: state.time.sec, ...(p.by ? { by: p.by } : {}), ...(p.check ? { check: { ...p.check } } : {}) };
        putKnown(draft, p.ref, p.name, p.fact.label, known);
        effect = { kind: 'knowledge', ref: p.ref, name: p.name, label: p.fact.label, before: null, after: known };
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
      case 'supply':
        draft.supply = effect.after;
        return;
      case 'place': {
        const l = draft.world.locations[effect.locationId];
        if (!l) throw new EngineError(`нет места ${effect.locationId}`);
        if (effect.after) l.revealed = true;
        else delete l.revealed;
        return;
      }
      case 'knowledge':
        putKnown(draft, effect.ref, effect.name, effect.label, effect.after);
        return;
      case 'sheet': {
        const a = draft.actors[effect.actorId];
        if (!a) throw new EngineError(`нет актёра ${effect.actorId}`);
        putSheet(a, effect.after);
        return;
      }
      case 'cell': {
        const a = draft.actors[effect.actorId];
        if (!a) throw new EngineError(`нет актёра ${effect.actorId}`);
        if (effect.after) a.cell = { x: effect.after.x, y: effect.after.y };
        else delete a.cell;
        return;
      }
      case 'note':
      case 'none':
        return;
    }
  });
}

const SHEET_PATCH_KEYS: readonly (keyof SheetPatch)[] = ['alignment', 'deity', 'bio'];

const sheetSnap = (a: Actor): SheetSnapshot => ({ sheet: structuredClone(a.sheet!), hp: { current: a.hp.current, max: a.hp.max }, ac: a.ac, passivePerception: a.passivePerception });

function putSheet(a: Actor, s: SheetSnapshot): void {
  a.sheet = castDraft(structuredClone(s.sheet));
  a.hp.current = s.hp.current;
  a.hp.max = s.hp.max;
  a.ac = s.ac;
  a.passivePerception = s.passivePerception;
}

/** Строка тетради: положить, заменить или убрать (null); сущность без строк из тетради уходит. */
function putKnown(draft: State, ref: EntityRef, name: string, label: string, fact: KnownFact | null): void {
  const book = (draft.knowledge ??= {});
  const entity = (book[ref] ??= { ref, name, facts: [] });
  entity.facts = entity.facts.filter(f => f.label !== label);
  if (fact) entity.facts.push(fact);
  if (entity.facts.length === 0) delete book[ref];
  if (Object.keys(book).length === 0) delete draft.knowledge;
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
    case 'supply': return { ...effect, before: effect.after, after: effect.before };
    case 'knowledge': return { ...effect, before: effect.after, after: effect.before };
    case 'sheet': return { ...effect, before: effect.after, after: effect.before };
    case 'cell': return { ...effect, before: effect.after, after: effect.before };
    case 'note':
    case 'none':
      return effect;
  }
}
