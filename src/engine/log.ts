// Лог событий: единственное, что пишется. Состояние — его проекция, отмена — компенсирующее событие.
import { EVENT_META, type Command, type DomainEvent, type EventType } from './events';
import { apply, invert, EngineError } from './reduce';
import type { State } from './state';

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
  private current: State;
  private readonly clock: Clock;
  private readonly ids: IdSource;

  constructor(initial: State, events: readonly DomainEvent[] = [], opts: EventLogOptions = {}) {
    this.current = initial;
    this.clock = opts.clock ?? systemClock;
    this.ids = opts.ids ?? randomIds;
    for (const e of events) this.replayOne(e);
  }

  get state(): State { return this.current; }
  get entries(): readonly DomainEvent[] { return this.events; }
  get length(): number { return this.events.length; }
  get(id: string): DomainEvent | undefined { return this.byId.get(id); }

  /** Записывает команду: проверка и применение до записи; то, что не применилось, в лог не попадает. */
  dispatch<T extends EventType>(cmd: Extract<Command, { type: T }>): DomainEvent<T> {
    const event = {
      id: this.ids.next(),
      seq: this.events.length,
      at: this.clock.now(),
      worldSec: this.current.time.sec,
      type: cmd.type,
      payload: cmd.payload,
    } as DomainEvent<T>;
    const { state, effect } = apply(this.current, event);
    event.effect = effect;
    this.commit(event, state);
    // Новое действие обрывает ветку повтора: повторить можно только то, что отменено последним.
    this.undone.length = 0;
    return event;
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
    const compensation = this.compensate(target, 'undoes');
    this.undone.push(target.id);
    return { event: target, compensation };
  }

  /** Ctrl+Shift+Z: повторяет последнее отменённое — событие с `redoes` и следом исходного. */
  redo(): UndoInfo | null {
    const target = this.peekRedo();
    if (!target) return null;
    const compensation = this.compensate(target, 'redoes');
    this.undone.pop();
    return { event: target, compensation };
  }

  private compensate(target: DomainEvent, kind: 'undoes' | 'redoes'): DomainEvent {
    if (!target.effect) throw new EngineError(`у события ${target.id} нет следа — откатывать нечем`);
    const event: DomainEvent = {
      id: this.ids.next(),
      seq: this.events.length,
      at: this.clock.now(),
      worldSec: this.current.time.sec,
      type: target.type,
      payload: target.payload,
      [kind]: target.id,
      effect: kind === 'undoes' ? invert(target.effect) : target.effect,
    };
    const { state } = apply(this.current, event);
    this.commit(event, state);
    return event;
  }

  private commit(event: DomainEvent, state: State) {
    this.events.push(event);
    this.byId.set(event.id, event);
    this.current = state;
  }

  /** Реплей при загрузке: след пересчитывается, а у компенсаций — берётся из записи. */
  private replayOne(stored: DomainEvent) {
    if (stored.seq !== this.events.length) throw new EngineError(`лог порван: ожидался seq ${this.events.length}, в записи ${stored.seq}`);
    const ref = stored.undoes ?? stored.redoes;
    if (ref && !this.byId.has(ref)) throw new EngineError(`компенсация ${stored.id} ссылается на неизвестное событие ${ref}`);
    const { state, effect } = apply(this.current, stored);
    const event: DomainEvent = { ...stored, effect };
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
    for (const e of events) if (this.byId.has(e.id)) throw new EngineError(`событие ${e.id} уже в логе`);
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
    for (const e of events) {
      log.replayOne(e);
      if (log.current.time.sec > endSec) break;
      n++;
    }
    return events.slice(0, n);
  }

  /** Проверка связности: каждая компенсация ссылается на более раннее событие, seq непрерывны. */
  static check(events: readonly DomainEvent[]): void {
    const seen = new Set<string>();
    events.forEach((e, i) => {
      if (e.seq !== i) throw new EngineError(`seq ${e.seq} на месте ${i}`);
      const ref = e.undoes ?? e.redoes;
      if (ref && !seen.has(ref)) throw new EngineError(`${e.id} ссылается на ${ref}, которого ещё нет`);
      seen.add(e.id);
    });
  }
}
