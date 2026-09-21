// Стор — тонкая обёртка лога для React: dispatch, undo, redo, тост. Компоненты получают state пропсами.
import { create } from 'zustand';
import { EventLog, type EventLogOptions } from './log';
import { EngineError } from './reduce';
import { TEMPO_SECONDS, type ActorRemoveReason, type Command, type ConcentrationEndReason, type DomainEvent, type EventType, type InitiativeEntry, type RestHitDice, type RestKind, type RestResource, type ScaleLevel, type Tempo } from './events';
import type { ResourceId } from '../rules/srd/resources';
import { roll, type RollOptions } from './dice';
import { undoToast, redoToast } from './journal';
import { dayOf, type Actor, type State, type WorldDelta } from './state';
import type { EventStore } from './persist';

export interface EngineStore {
  state: State;
  events: readonly DomainEvent[];
  canUndo: boolean;
  canRedo: boolean;
  /** Тост живёт до следующего действия, а не по таймеру. */
  toast: string | null;
  dispatch<T extends EventType>(cmd: Extract<Command, { type: T }>): DomainEvent<T>;
  undo(): void;
  redo(): void;
  /** Частые действия — один вызов. */
  damage(targetId: string, amount: number, type?: string, sourceId?: string): void;
  heal(targetId: string, amount: number, sourceId?: string): void;
  tempHp(targetId: string, amount: number, sourceId?: string): void;
  rollDice(formula: string, opts?: RollOptions): DomainEvent<'DICE_ROLLED'>;
  /** Шаг времени; возвращает событие — его id становится причиной предложений симуляции. */
  advanceTime(tempo: Tempo, steps?: number): DomainEvent<'TIME_ADVANCED'>;
  /** Следующий ход по порядку; бой не начат — ничего не происходит (сначала startEncounter). */
  nextTurn(): void;
  /**
   * Бой начался. Без порядка — из бросков `initiative` актёров, что не выбыли: по убыванию, при равенстве — порядок в state.
   * Первый ход — у первого в порядке, раунд 1.
   */
  startEncounter(order?: readonly InitiativeEntry[], surprised?: readonly string[]): void;
  endEncounter(reason?: string): void;
  setInitiative(order: readonly InitiativeEntry[]): void;
  startConcentration(actorId: string, spell: string, untilSec?: number): void;
  endConcentration(actorId: string, reason: ConcentrationEndReason): void;
  spawn(actor: Actor, party?: boolean): void;
  remove(actorId: string, reason?: ActorRemoveReason): void;
  /** Отдых (REST_TAKEN): часы двигает отдельный advanceTime до него — см. campaign/rest.ts takeRest. */
  rest(kind: RestKind, actorIds: readonly string[], hitDice?: readonly RestHitDice[], resources?: readonly RestResource[]): DomainEvent<'REST_TAKEN'>;
  /** Ресурсы персонажа (RESOURCE_SPENT / RESTORED): max — сколько всего на сейчас, считает проекция листа. */
  spendResource(actorId: string, resourceId: ResourceId, max: number, amount?: number): void;
  restoreResource(actorId: string, resourceId: ResourceId, max: number, amount?: number): void;
  /** Предложение симуляции — в лог; необратимо, в журнал не идёт. */
  propose(delta: WorldDelta): void;
  /** Решение по предложению: принять (payload — снимок «было → стало» и causeId, чтобы запись журнала не зависела от состояния). */
  accept(deltaId: string): void;
  reject(deltaId: string, reason?: string): void;
  /** Переброс — следующий вариант по кругу, отличный от текущего; без вариантов ничего не происходит. */
  reroll(deltaId: string): void;
  reveal(factId: string): void;
  /** Заметка мастера; возвращает событие — его id годится как causeId для дельты. */
  note(text: string, threadIds: readonly string[], scale: ScaleLevel): DomainEvent<'NOTE_ADDED'>;
  dismissToast(): void;
}

/** Какой вариант даст переброс: следующий после текущего по кругу, пропуская совпадающий с тем, что стоит сейчас. */
export function nextVariantId(delta: WorldDelta): string | null {
  const vs = delta.variants ?? [];
  if (vs.length === 0) return null;
  const at = vs.findIndex(v => v.id === delta.variantId);
  for (let step = 1; step <= vs.length; step++) {
    const v = vs[(at + step) % vs.length];
    if (v.now !== delta.now || v.cause !== delta.cause) return v.id;
  }
  return null;
}

/** Порядок из бросков: по убыванию инициативы, при равенстве — как лежат в state; без броска или выбывшие — не в бою. */
export function orderFromInitiative(state: State): InitiativeEntry[] {
  return Object.values(state.actors)
    .filter(a => !a.removed && a.initiative !== undefined)
    .map(a => ({ actorId: a.id, initiative: a.initiative! }))
    .sort((a, b) => b.initiative - a.initiative);
}

export interface CreateEngineOptions extends EventLogOptions {
  persist?: EventStore;
}

export function createEngineStore(initial: State, opts: CreateEngineOptions = {}) {
  const stored = opts.persist?.load() ?? [];
  const log = new EventLog(initial, stored, opts);

  return create<EngineStore>((set, get) => {
    // events — снимок, а не сам массив лога: лог дописывается на месте, и без копии подписчик на events
    // не узнал бы о новом событии; у DICE_ROLLED и state тот же (immer без правок) — ни один селектор не сработал бы.
    const sync = (toast: string | null) => {
      opts.persist?.save(log.entries);
      set({ state: log.state, events: [...log.entries], canUndo: log.peekUndo() !== null, canRedo: log.peekRedo() !== null, toast });
    };
    const dispatch = <T extends EventType>(cmd: Extract<Command, { type: T }>) => {
      const e = log.dispatch(cmd);
      sync(null);
      return e;
    };
    return {
      state: log.state,
      events: [...log.entries],
      canUndo: log.peekUndo() !== null,
      canRedo: log.peekRedo() !== null,
      toast: null,
      dispatch,
      undo() {
        const info = log.undo();
        if (info) sync(undoToast(info.event, log.state));
      },
      redo() {
        const info = log.redo();
        if (info) sync(redoToast(info.event, log.state));
      },
      damage: (targetId, amount, type, sourceId) => { dispatch({ type: 'DAMAGE_APPLIED', payload: { targetId, amount, type, sourceId } }); },
      heal: (targetId, amount, sourceId) => { dispatch({ type: 'HEALING_APPLIED', payload: { targetId, amount, sourceId } }); },
      tempHp: (targetId, amount, sourceId) => { dispatch({ type: 'TEMP_HP_GRANTED', payload: { targetId, amount, sourceId } }); },
      rollDice: (formula, rollOpts) => dispatch({ type: 'DICE_ROLLED', payload: roll(formula, rollOpts) }),
      advanceTime(tempo, steps = 1) {
        const fromSec = get().state.time.sec;
        const toSec = fromSec + steps * TEMPO_SECONDS[tempo];
        return dispatch({ type: 'TIME_ADVANCED', payload: { tempo, steps, fromDay: dayOf(fromSec), toDay: dayOf(toSec), fromSec, toSec } });
      },
      nextTurn() {
        const { encounter } = get().state;
        if (!encounter.active || encounter.order.length === 0) return;
        const turnIndex = (encounter.turnIndex + 1) % encounter.order.length;
        const round = encounter.turnIndex + 1 >= encounter.order.length ? encounter.round + 1 : encounter.round;
        dispatch({ type: 'TURN_ADVANCED', payload: { round, turnIndex, actorId: encounter.order[turnIndex] } });
      },
      startEncounter(order, surprised) {
        const entries = order ?? orderFromInitiative(get().state);
        dispatch({ type: 'ENCOUNTER_STARTED', payload: surprised ? { order: entries, surprised } : { order: entries } });
      },
      endEncounter: reason => { dispatch({ type: 'ENCOUNTER_ENDED', payload: reason ? { reason } : {} }); },
      setInitiative: order => { dispatch({ type: 'INITIATIVE_SET', payload: { order } }); },
      startConcentration: (actorId, spell, untilSec) => { dispatch({ type: 'CONCENTRATION_STARTED', payload: untilSec === undefined ? { actorId, spell } : { actorId, spell, untilSec } }); },
      endConcentration: (actorId, reason) => { dispatch({ type: 'CONCENTRATION_ENDED', payload: { actorId, reason } }); },
      spawn: (actor, party) => { dispatch({ type: 'ACTOR_SPAWNED', payload: party ? { actor, party } : { actor } }); },
      remove: (actorId, reason) => { dispatch({ type: 'ACTOR_REMOVED', payload: reason ? { actorId, reason } : { actorId } }); },
      rest: (kind, actorIds, hitDice, resources) => dispatch({
        type: 'REST_TAKEN',
        payload: {
          kind,
          actorIds,
          ...(hitDice && hitDice.length > 0 ? { hitDice } : {}),
          ...(resources && resources.length > 0 ? { resources } : {}),
        },
      }),
      spendResource: (actorId, resourceId, max, amount = 1) => { dispatch({ type: 'RESOURCE_SPENT', payload: { actorId, resourceId, amount, max } }); },
      restoreResource: (actorId, resourceId, max, amount = 1) => { dispatch({ type: 'RESOURCE_RESTORED', payload: { actorId, resourceId, amount, max } }); },
      propose: delta => { dispatch({ type: 'WORLD_DELTA_PROPOSED', payload: { delta } }); },
      accept(deltaId) {
        const d = get().state.deltas[deltaId];
        if (!d) throw new EngineError(`нет предложения ${deltaId}`);
        dispatch({ type: 'WORLD_DELTA_ACCEPTED', payload: { deltaId, subject: d.subject, was: d.was, now: d.now, causeId: d.causeId } });
      },
      reject: (deltaId, reason) => { dispatch({ type: 'WORLD_DELTA_REJECTED', payload: reason ? { deltaId, reason } : { deltaId } }); },
      reroll(deltaId) {
        const d = get().state.deltas[deltaId];
        const variantId = d ? nextVariantId(d) : null;
        if (variantId) dispatch({ type: 'WORLD_DELTA_REROLLED', payload: { deltaId, variantId } });
      },
      reveal: factId => { dispatch({ type: 'FACT_REVEALED', payload: { factId, audience: 'players' } }); },
      note: (text, threadIds, scale) => dispatch({ type: 'NOTE_ADDED', payload: { text, threadIds, scale } }),
      dismissToast: () => set({ toast: null }),
    };
  });
}

export type EngineStoreApi = ReturnType<typeof createEngineStore>;
