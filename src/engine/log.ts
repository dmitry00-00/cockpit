// Лог событий: единственное, что пишется. Состояние — его проекция, отмена — компенсирующее событие.
import { EVENT_META, type Command, type DomainEvent, type EventType, type TransactionCommand } from './events';
import { apply, invert, EngineError } from './reduce';
import type { State } from './state';
import { migrateLegacyInventory } from './inventory';
import { partyIsSplit, partyPlaceId } from './ladder';

function hasThreadTouches(effect: DomainEvent['effect']): boolean {
  return !!effect && (effect.kind === 'note' || effect.kind === 'delta' || effect.kind === 'fact') && !!effect.threads?.length;
}

/** Store an independent, deeply immutable snapshot so API callers cannot rewrite replay history. */
function immutableEvent(event: DomainEvent): DomainEvent {
  const snapshot = structuredClone(event);
  const freeze = (value: unknown, seen = new WeakSet<object>()): void => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const child of Object.values(value)) freeze(child, seen);
    Object.freeze(value);
  };
  freeze(snapshot);
  return snapshot;
}

export interface Clock { now(): number }
export interface IdSource { next(): string }

const systemClock: Clock = { now: () => Date.now() };
const randomIds: IdSource = {
  next: () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`),
};

export interface EventLogOptions {
  clock?: Clock;
  ids?: IdSource;
}

/** Событие, которое сейчас можно отменить или повторить — для тоста «Отменено: …». */
export interface UndoInfo { event: DomainEvent; compensation: DomainEvent }

export class EventLog {
  private readonly events: DomainEvent[] = [];
  private readonly byId = new Map<string, DomainEvent>();
  /** id исходных событий, отменённых и ещё не повторённых, в порядке отмены. */
  private readonly undone: string[] = [];
  /** IDs held while a time-step review is open; other dispatches cannot accidentally take them. */
  private readonly reservedIds = new Set<string>();
  private current: State;
  private readonly clock: Clock;
  private readonly ids: IdSource;

  constructor(initial: State, events: readonly DomainEvent[] = [], opts: EventLogOptions = {}) {
    this.current = migrateLegacyInventory(initial);
    this.clock = opts.clock ?? systemClock;
    this.ids = opts.ids ?? randomIds;
    for (const e of events) this.replayOne(e);
  }

  get state(): State { return this.current; }
  get entries(): readonly DomainEvent[] { return Object.freeze([...this.events]); }
  get length(): number { return this.events.length; }
  get(id: string): DomainEvent | undefined { return this.byId.get(id); }

  private nextId(): string {
    const id = this.ids.next();
    this.assertNewId(id);
    if (this.reservedIds.has(id)) throw new EngineError(`id события ${id} зарезервирован планом`);
    return id;
  }

  private assertNewId(id: string): void {
    if (typeof id !== 'string' || !id.trim()) throw new EngineError('id события не может быть пустым');
    if (this.byId.has(id)) throw new EngineError(`событие ${id} уже в логе`);
  }


  reserveId(): string {
    const id = this.ids.next();
    this.assertNewId(id);
    if (this.reservedIds.has(id)) throw new EngineError(`id события ${id} уже зарезервирован`);
    this.reservedIds.add(id);
    return id;
  }

  releaseReservedId(id: string): void { this.reservedIds.delete(id); }

  /**
   * Applies a prepared group against a private state first, then appends it in one commit. This keeps a
   * stale/invalid plan from leaving half its downtime effects in the log. Legacy dispatch remains unchanged.
   */
  dispatchTransaction(transactionId: string, commands: readonly TransactionCommand[], expected?: { state: State; length: number }): readonly DomainEvent[] {
    if (!transactionId.trim()) throw new EngineError('transactionId не может быть пустым');
    if (!commands.length) throw new EngineError('транзакция не содержит событий');
    if (expected && (this.current !== expected.state || this.events.length !== expected.length)) {
      throw new EngineError('Состояние изменилось после построения плана шага');
    }
    const primary = commands.filter(item => item.eventId === transactionId && item.command.type === 'TIME_ADVANCED');
    if (primary.length !== 1 || commands.filter(item => item.command.type === 'TIME_ADVANCED').length !== 1 || !this.reservedIds.has(transactionId)) {
      throw new EngineError('транзакция шага должна использовать свой зарезервированный id события времени');
    }
    if (commands.some(item => item.eventId !== undefined && item.eventId !== transactionId && !item.eventId.startsWith(`${transactionId}:`))) {
      throw new EngineError('id события транзакции должен быть получен из зарезервированного id плана');
    }

    let working = this.current;
    const staged: DomainEvent[] = [];
    const stagedIds = new Set<string>();
    for (const item of commands) {
      const cmd = item.command;
      this.guardCommand(working, cmd);
      const id = item.eventId ?? this.nextId();
      this.assertNewId(id);
      if (stagedIds.has(id)) throw new EngineError(`событие ${id} повторяется в транзакции`);
      if (id !== transactionId && this.reservedIds.has(id)) throw new EngineError(`id события ${id} зарезервирован другим планом`);
      const event = {
        id,
        seq: this.events.length + staged.length,
        at: this.clock.now(),
        worldSec: working.time.sec,
        transactionId,
        type: cmd.type,
        payload: structuredClone(cmd.payload),
      } as DomainEvent;
      const applied = apply(working, event);
      if (applied.effect.kind === 'none') throw new EngineError(`событие ${event.type} нельзя включить в отменяемую транзакцию`);
      event.effect = applied.effect;
      staged.push(event);
      stagedIds.add(id);
      working = applied.state;
    }

    const committed = staged.map(event => this.commit(event, working));
    this.current = working;
    this.reservedIds.delete(transactionId);
    this.undone.length = 0;
    return committed;
  }

  /** Записывает команду: проверка и применение до записи; то, что не применилось, в лог не попадает. */
  dispatch<T extends EventType>(cmd: Extract<Command, { type: T }>, context?: { interactionId: string }): DomainEvent<T> {
    const interactionId = context?.interactionId.trim();
    if (context && !interactionId) throw new EngineError('interactionId не может быть пустым');
    this.guardCommand(this.current, cmd);
    const event = {
      id: this.nextId(),
      seq: this.events.length,
      at: this.clock.now(),
      worldSec: this.current.time.sec,
      ...(interactionId ? { interactionId } : {}),
      type: cmd.type,
      payload: structuredClone(cmd.payload),
    } as DomainEvent<T>;
    const { state, effect } = apply(this.current, event);
    event.effect = effect;
    const committed = this.commit(event, state);
    // Новое действие обрывает ветку повтора: повторить можно только то, что отменено последним.
    this.undone.length = 0;
    return committed as DomainEvent<T>;
  }

  private guardCommand(state: State, cmd: Command): void {
    if (cmd.type !== 'PARTY_TRAVELED') return;
    if (partyIsSplit(state)) throw new EngineError('поход: партия разделена; сначала соберите её в одном месте');
    const currentPlaceId = partyPlaceId(state);
    if (!currentPlaceId) throw new EngineError('поход: нет единого подтверждённого места партии; уточните позиции всех участников');
    if (cmd.payload.fromId !== undefined && cmd.payload.fromId !== currentPlaceId) {
      throw new EngineError('поход: начало маршрута не совпадает с местом партии');
    }
  }

  /** Что отменится следующим Ctrl+Z — или null, если нечего. */
  peekUndo(): DomainEvent | null {
    const undoneSet = new Set(this.undone);
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (e.undoes || e.redoes) continue;
      if (!EVENT_META[e.type].reversible) continue;
      if (undoneSet.has(e.id)) continue;
      return e;
    }
    return null;
  }

  peekRedo(): DomainEvent | null {
    const id = this.undone[this.undone.length - 1];
    return id ? this.byId.get(id) ?? null : null;
  }

  /** Ctrl+Z: компенсирующее событие того же типа, след — наоборот. Запись остаётся в логе. */
  undo(): UndoInfo | null {
    const target = this.peekUndo();
    if (!target) return null;
    if (!target.transactionId) {
      const compensation = this.compensate(target, 'undoes');
      this.undone.push(target.id);
      return { event: target, compensation };
    }
    const group = this.transactionMembers(target.transactionId);
    if (group.some(member => !member.effect || member.effect.kind === 'none')) {
      throw new EngineError(`транзакция ${target.transactionId} содержит событие без компенсируемого следа`);
    }
    let compensation: DomainEvent | null = null;
    for (const member of group.slice().reverse()) {
      compensation = this.compensate(member, 'undoes');
      this.undone.push(member.id);
    }
    if (!compensation) return null;
    return { event: target, compensation };
  }

  /** Ctrl+Shift+Z: повторяет последнее отменённое — событие с `redoes` и следом исходного. */
  redo(): UndoInfo | null {
    const target = this.peekRedo();
    if (!target) return null;
    if (!target.transactionId) {
      const compensation = this.compensate(target, 'redoes');
      this.undone.pop();
      return { event: target, compensation };
    }
    const group = this.transactionMembers(target.transactionId);
    if (group.some(member => !member.effect || member.effect.kind === 'none')) {
      throw new EngineError(`транзакция ${target.transactionId} содержит событие без компенсируемого следа`);
    }
    const expectedUndone = group.map(member => member.id).reverse();
    if (this.undone.slice(-expectedUndone.length).some((id, index) => id !== expectedUndone[index])) {
      throw new EngineError(`транзакция ${target.transactionId} отменена не целиком`);
    }
    let compensation: DomainEvent | null = null;
    for (const member of group) {
      compensation = this.compensate(member, 'redoes');
      this.undone.pop();
    }
    if (!compensation) return null;
    return { event: target, compensation };
  }

  private transactionMembers(transactionId: string): DomainEvent[] {
    return this.events.filter(event => event.transactionId === transactionId && !event.undoes && !event.redoes);
  }

  private compensate(target: DomainEvent, kind: 'undoes' | 'redoes'): DomainEvent {
    if (!target.effect) throw new EngineError(`у события ${target.id} нет следа — откатывать нечем`);
    const event: DomainEvent = {
      id: this.nextId(),
      seq: this.events.length,
      at: this.clock.now(),
      worldSec: this.current.time.sec,
      ...(target.interactionId ? { interactionId: target.interactionId } : {}),
      ...(target.transactionId ? { transactionId: target.transactionId } : {}),
      type: target.type,
      payload: structuredClone(target.payload),
      [kind]: target.id,
      effect: kind === 'undoes' ? invert(target.effect) : target.effect,
    };
    const { state } = apply(this.current, event);
    return this.commit(event, state);
  }

  private commit(event: DomainEvent, state: State): DomainEvent {
    const snapshot = immutableEvent(event);
    this.events.push(snapshot);
    this.byId.set(snapshot.id, snapshot);
    this.current = state;
    return snapshot;
  }

  /** Реплей при загрузке: след пересчитывается, а у компенсаций — берётся из записи. */
  private replayOne(stored: DomainEvent) {
    if (stored.transactionId !== undefined && !stored.transactionId.trim()) throw new EngineError(`${stored.id} содержит пустой transactionId`);
    this.assertNewId(stored.id);
    if (stored.seq !== this.events.length) throw new EngineError(`лог порван: ожидался seq ${this.events.length}, в записи ${stored.seq}`);
    const ref = stored.undoes ?? stored.redoes;
    if (ref && !this.byId.has(ref)) throw new EngineError(`компенсация ${stored.id} ссылается на неизвестное событие ${ref}`);
    let eventToApply = stored;
    if (ref && !hasThreadTouches(stored.effect)) {
      const original = this.byId.get(ref);
      if (hasThreadTouches(original?.effect)) {
        // Upgrade compensations created before thread timestamps were included in note/delta/fact effects.
        const effect = stored.undoes ? invert(original!.effect!) : original!.effect!;
        eventToApply = { ...stored, effect };
      }
    }
    const { state, effect } = apply(this.current, eventToApply);
    const event: DomainEvent = { ...eventToApply, effect };
    this.commit(event, state);
    if (stored.undoes) this.undone.push(stored.undoes);
    else if (stored.redoes) {
      const i = this.undone.lastIndexOf(stored.redoes);
      if (i >= 0) this.undone.splice(i, 1);
    } else this.undone.length = 0;
  }

  /**
   * Ветка «что если» (Д4): события ветки, открытой с этого лога на длине `baseLength`, ложатся в лог как есть — с теми
   * же id, на них ссылаются причины предложений и компенсации. Основная линия ушла вперёд — нельзя: ветка считалась от
   * другого мира. Сначала реплей на копии: не применилось одно — не ложится ни одно.
   */
  adopt(events: readonly DomainEvent[], baseLength: number): void {
    if (this.events.length !== baseLength) throw new EngineError(`основная линия ушла вперёд: ветка от ${baseLength} событий, в логе ${this.events.length}`);
    const branchIds = new Set<string>();
    for (const e of events) {
      this.assertNewId(e.id);
      if (branchIds.has(e.id)) throw new EngineError(`событие ${e.id} повторяется в ветке`);
      branchIds.add(e.id);
    }
    // Компенсации ветки ссылаются только на события ветки: её лог начинался пустым — проба идёт на пустом логе.
    const trial = new EventLog(this.current, []);
    events.forEach((e, i) => trial.replayOne({ ...e, seq: i }));
    for (const e of events) this.replayOne({ ...e, seq: this.events.length });
  }

  /**
   * Стол на прошлый день (Д5, бывшая 5.4): начало лога, после которого мировое время ещё не дальше `endSec`. Срез по
   * seq всегда связен: компенсация ссылается только на более раннее событие. Шаг времени за `endSec` — уже не этот день.
   */
  static prefixUntil(initial: State, events: readonly DomainEvent[], endSec: number): DomainEvent[] {
    const log = new EventLog(initial, []);
    let n = 0;
    let activeTransactionId: string | undefined;
    let transactionStart = 0;
    for (const e of events) {
      if (e.transactionId !== activeTransactionId) {
        activeTransactionId = e.transactionId;
        transactionStart = n;
      }
      log.replayOne(e);
      if (log.current.time.sec > endSec) {
        // A planned step's preparation, time advance and proposals form one historical unit.
        // If its time crosses the boundary, do not leave a prefix with only its preparation events.
        if (e.transactionId) n = transactionStart;
        break;
      }
      n++;
    }
    return events.slice(0, n);
  }

  /** Проверка связности: каждая компенсация ссылается на более раннее событие, seq непрерывны. */
  static check(events: readonly DomainEvent[]): void {
    const seen = new Set<string>();
    const ids = new Set<string>();
    events.forEach((e, i) => {
      if (e.seq !== i) throw new EngineError(`seq ${e.seq} на месте ${i}`);
      if (typeof e.id !== 'string' || !e.id.trim()) throw new EngineError(`пустой id события на месте ${i}`);
      if (ids.has(e.id)) throw new EngineError(`повторный id события ${e.id}`);
      if (e.interactionId !== undefined && !e.interactionId.trim()) throw new EngineError(`${e.id} содержит пустой interactionId`);
      if (e.transactionId !== undefined && !e.transactionId.trim()) throw new EngineError(`${e.id} содержит пустой transactionId`);
      const ref = e.undoes ?? e.redoes;
      if (ref && !seen.has(ref)) throw new EngineError(`${e.id} ссылается на ${ref}, которого ещё нет`);
      seen.add(e.id);
      ids.add(e.id);
    });
  }
}
