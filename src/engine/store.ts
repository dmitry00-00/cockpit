// Стор — тонкая обёртка лога для React: dispatch, undo, redo, тост. Компоненты получают state пропсами.
import { create } from 'zustand';
import { EventLog, type EventLogOptions } from './log';
import { EngineError } from './reduce';
import { TEMPO_SECONDS, type PartyTraveled, type ActorRemoveReason, type Command, type ConcentrationEndReason, type DomainEvent, type EventType, type InitiativeEntry, type RestContext, type RestHitDice, type RestKind, type RestResource, type ScaleLevel, type SupplyReason, type KnowledgeRevealed, type CharacterLeveled, type SheetPatch, type Tempo, type GridCell, type TokenMoveSource, type TradeCompleted, type TransactionCommand } from './events';
import type { ResourceId } from '../rules/srd/resources';
import { roll, type RollOptions } from './dice';
import { undoToast, redoToast } from './journal';
import { dayOf, nextTurnTransition, type Actor, type InventoryContainer, type InventoryOwner, type InventoryStack, type InventoryStorage, type PartyTransport, type State, type WorldDelta } from './state';
import { lairActionsOf } from '../rules/book/lairActions';
import type { EventStore } from './persist';

export interface EngineStore {
  state: State;
  events: readonly DomainEvent[];
  canUndo: boolean;
  canRedo: boolean;
  /** Тост живёт до следующего действия, а не по таймеру. */
  toast: string | null;
  /** Последнее сохранение лога не удалось (квота браузера): сессия живёт только в памяти, пока мастер не сохранит файл. */
  saveFailed: boolean;
  dispatch<T extends EventType>(cmd: Extract<Command, { type: T }>): DomainEvent<T>;
  /** Reserve a stable event ID for a reviewed plan and release it if the review is cancelled. */
  reserveEventId(): string;
  releaseReservedEventId(id: string): void;
  dispatchTransaction(transactionId: string, commands: readonly TransactionCommand[], expected?: { state: State; length: number }): readonly DomainEvent[];
  /** Записывает обычную механическую команду с корреляцией встречи; payload и reducer не меняются. */
  dispatchInInteraction<T extends EventType>(interactionId: string, cmd: Extract<Command, { type: T }>): DomainEvent<T>;
  undo(): void;
  redo(): void;
  /** Частые действия — один вызов. */
  damage(targetId: string, amount: number, type?: string, sourceId?: string): void;
  heal(targetId: string, amount: number, sourceId?: string): void;
  tempHp(targetId: string, amount: number, sourceId?: string): void;
  rollDice(formula: string, opts?: RollOptions): DomainEvent<'DICE_ROLLED'>;
  /**
   * Шаг времени; возвращает событие — его id становится причиной предложений симуляции. toSec — конец шага по
   * календарю, когда он не кратен темпу (год с Shieldmeet: та же дата через год — 366 суток); его считает кампания.
   */
  advanceTime(tempo: Tempo, steps?: number, toSec?: number): DomainEvent<'TIME_ADVANCED'>;
  /** Следующий ход по порядку; бой не начат — ничего не происходит (сначала startEncounter). */
  nextTurn(): void;
  /**
   * Бой начался. Без порядка — из бросков `initiative` актёров, что не выбыли: по убыванию, при равенстве — порядок в state.
   * Первый ход — у первого в порядке, раунд 1.
   */
  startEncounter(order?: readonly InitiativeEntry[], surprised?: readonly string[], lostFirstRoundActions?: readonly string[], lairContextConfirmed?: boolean): void;
  endEncounter(reason?: string): void;
  setInitiative(order: readonly InitiativeEntry[]): void;
  startConcentration(actorId: string, spell: string, untilSec?: number): void;
  endConcentration(actorId: string, reason: ConcentrationEndReason): void;
  spawn(actor: Actor, party?: boolean): void;
  remove(actorId: string, reason?: ActorRemoveReason): void;
  /** Отдых (REST_TAKEN): часы двигает отдельный advanceTime до него — см. campaign/rest.ts takeRest. */
  rest(kind: RestKind, actorIds: readonly string[], hitDice?: readonly RestHitDice[], resources?: readonly RestResource[], context?: RestContext): DomainEvent<'REST_TAKEN'>;
  /** Select the campaign's setting package (P3); package identity is reversible and journalled. */
  setSettingPackage(packageId: string): DomainEvent<'CAMPAIGN_SETTING_PACKAGE_SET'>;
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
  /** Поход партии (PARTY_TRAVELED): часы двигает отдельный advanceTime до него — см. campaign/travel.ts travel. */
  travel(payload: PartyTraveled): DomainEvent<'PARTY_TRAVELED'>;
  /** Место открыто игрокам: туман знаний вокруг него снят и на их столе. */
  revealPlace(locationId: string): void;
  /** Общий запас партии (SUPPLY_CHANGED): причина задаёт направление; shortfall — не хватило на еду. */
  changeSupply(reason: SupplyReason, amount: number, shortfall?: number): DomainEvent<'SUPPLY_CHANGED'>;
  /** Партия узнала факт карточки (KNOWLEDGE_REVEALED, Д6): волей мастера или проверкой не ниже Сл. */
  revealKnowledge(p: KnowledgeRevealed): DomainEvent<'KNOWLEDGE_REVEALED'>;
  /** Новый уровень (CHARACTER_LEVELED, Q10): лист после повышения снимком — его считает campaign/levelUp.ts. */
  levelUp(p: CharacterLeveled): DomainEvent<'CHARACTER_LEVELED'>;
  /** Правка паспорта листа вне механики (SHEET_EDITED, Q10) — с причиной. */
  editSheet(actorId: string, patch: SheetPatch, reason: string): DomainEvent<'SHEET_EDITED'>;
  /** Токен сменил клетку (TOKEN_MOVED, Q17): ход в MapTool или перестановка мастером на столе. */
  moveToken(actorId: string, to: GridCell, source: TokenMoveSource, from?: GridCell): DomainEvent<'TOKEN_MOVED'>;
  /** Event-sourced E7 inventory operations; reducer validates current ownership and quantities. */
  gainItem(stack: InventoryStack): DomainEvent<'ITEM_GAINED'>;
  createInventoryContainer(container: InventoryContainer): DomainEvent<'INVENTORY_CONTAINER_CREATED'>;
  removeInventoryContainer(containerId: string): DomainEvent<'INVENTORY_CONTAINER_REMOVED'>;
  createTransport(transport: PartyTransport): DomainEvent<'TRANSPORT_CREATED'>;
  removeTransport(transportId: string): DomainEvent<'TRANSPORT_REMOVED'>;
  exchangeCoins(stackId: string, qty: number, toCoinId: string, toQty: number, receiveStackId: string): DomainEvent<'COINS_EXCHANGED'>;
  loseItem(stackId: string, qty: number, reason?: string): DomainEvent<'ITEM_LOST'>;
  moveItem(stackId: string, qty: number, to: InventoryStorage, splitStackId?: string): DomainEvent<'ITEM_MOVED'>;
  transferItem(stackId: string, qty: number, owner: InventoryOwner, to: InventoryStorage, splitStackId?: string): DomainEvent<'ITEM_TRANSFERRED'>;
  createTradeOffer(offerId: string, trade: TradeCompleted): DomainEvent<'TRADE_OFFER_CREATED'>;
  withdrawTradeOffer(offerId: string): DomainEvent<'TRADE_OFFER_WITHDRAWN'>;
  completeTrade(trade: TradeCompleted): DomainEvent<'TRADE_COMPLETED'>;
  setAttunement(stackId: string, actorId?: string): DomainEvent<'ATTUNEMENT_CHANGED'>;
  equipItem(stackId: string, actorId: string, wornAs: 'armor' | 'shield'): DomainEvent<'ITEM_EQUIPPED'>;
  unequipItem(stackId: string, actorId: string): DomainEvent<'ITEM_UNEQUIPPED'>;
  /** Заметка мастера; возвращает событие — его id годится как causeId для дельты. */
  /** visible — заметка видна игрокам; по умолчанию секретна (Q1). */
  note(text: string, threadIds: readonly string[], scale: ScaleLevel, visible?: boolean): DomainEvent<'NOTE_ADDED'>;
  dismissToast(): void;
  /** Ветка «что если» оставлена (Д4): её события — в лог с теми же id; основная линия не должна была уйти вперёд. */
  adopt(events: readonly DomainEvent[], baseLength: number): void;
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
      let saveFailed = false;
      try { saveFailed = opts.persist?.save(log.entries) === false; }
      catch { saveFailed = true; }
      set({ state: log.state, events: [...log.entries], canUndo: log.peekUndo() !== null, canRedo: log.peekRedo() !== null, toast, saveFailed });
    };
    const dispatch = <T extends EventType>(cmd: Extract<Command, { type: T }>, interactionId?: string) => {
      const e = interactionId === undefined ? log.dispatch(cmd) : log.dispatch(cmd, { interactionId });
      sync(null);
      return e;
    };
    return {
      state: log.state,
      events: [...log.entries],
      canUndo: log.peekUndo() !== null,
      canRedo: log.peekRedo() !== null,
      toast: null,
      saveFailed: false,
      dispatch,
      reserveEventId: () => log.reserveId(),
      releaseReservedEventId: id => log.releaseReservedId(id),
      dispatchTransaction(transactionId, commands, expected) {
        const events = log.dispatchTransaction(transactionId, commands, expected);
        sync(null);
        return events;
      },
      dispatchInInteraction: (interactionId, cmd) => dispatch(cmd, interactionId),
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
      advanceTime(tempo, steps = 1, calendarTo) {
        const fromSec = get().state.time.sec;
        const toSec = calendarTo ?? fromSec + steps * TEMPO_SECONDS[tempo];
        return dispatch({ type: 'TIME_ADVANCED', payload: { tempo, steps, fromDay: dayOf(fromSec), toDay: dayOf(toSec), fromSec, toSec } });
      },
      nextTurn() {
        const { encounter, actors } = get().state;
        if (!encounter.active || encounter.order.length === 0) return;
        const hasLairActor = encounter.order.some(id => {
          const actor = actors[id];
          return Boolean(actor && !actor.removed && actor.hp.current > 0 && lairActionsOf(actor.monsterId));
        });
        dispatch({ type: 'TURN_ADVANCED', payload: nextTurnTransition(get().state, hasLairActor) });
      },
      startEncounter(order, surprised, lostFirstRoundActions, lairContextConfirmed) {
        const entries = order ?? orderFromInitiative(get().state);
        dispatch({
          type: 'ENCOUNTER_STARTED',
          payload: {
            order: entries,
            lairPhaseVersion: 1,
            lairContextVersion: 1,
            lairContextConfirmed: lairContextConfirmed === true,
            ...(surprised ? { surprised } : {}),
            ...(lostFirstRoundActions?.length ? { lostFirstRoundActions } : {}),
          },
        });
        if (lostFirstRoundActions?.includes(entries[0]?.actorId ?? '') && !get().state.encounter.lairActionWindow) get().nextTurn();
      },
      endEncounter: reason => { dispatch({ type: 'ENCOUNTER_ENDED', payload: reason ? { reason } : {} }); },
      setInitiative: order => { dispatch({ type: 'INITIATIVE_SET', payload: { order } }); },
      startConcentration: (actorId, spell, untilSec) => { dispatch({ type: 'CONCENTRATION_STARTED', payload: untilSec === undefined ? { actorId, spell } : { actorId, spell, untilSec } }); },
      endConcentration: (actorId, reason) => { dispatch({ type: 'CONCENTRATION_ENDED', payload: { actorId, reason } }); },
      spawn: (actor, party) => { dispatch({ type: 'ACTOR_SPAWNED', payload: party ? { actor, party } : { actor } }); },
      remove: (actorId, reason) => { dispatch({ type: 'ACTOR_REMOVED', payload: reason ? { actorId, reason } : { actorId } }); },
      rest: (kind, actorIds, hitDice, resources, context) => dispatch({
        type: 'REST_TAKEN',
        payload: {
          kind,
          actorIds,
          ...(hitDice && hitDice.length > 0 ? { hitDice } : {}),
          ...(resources && resources.length > 0 ? { resources } : {}),
          ...(context ? { context } : {}),
        },
      }),
      setSettingPackage: packageId => dispatch({ type: 'CAMPAIGN_SETTING_PACKAGE_SET', payload: { packageId } }),
      spendResource: (actorId, resourceId, max, amount = 1) => { dispatch({ type: 'RESOURCE_SPENT', payload: { actorId, resourceId, amount, max } }); },
      restoreResource: (actorId, resourceId, max, amount = 1) => { dispatch({ type: 'RESOURCE_RESTORED', payload: { actorId, resourceId, amount, max } }); },
      propose: delta => { dispatch({ type: 'WORLD_DELTA_PROPOSED', payload: { delta } }); },
      accept(deltaId) {
        const d = get().state.deltas[deltaId];
        if (!d) throw new EngineError(`нет предложения ${deltaId}`);
        // If a master-approved world consequence points to an event inside a social interaction,
        // carry that interaction through acceptance. Ordinary simulation causes have no ID and stay unchanged.
        const cause = get().events.find(event => event.id === d.causeId);
        try {
          dispatch(
            { type: 'WORLD_DELTA_ACCEPTED', payload: { deltaId, subject: d.subject, was: d.was, now: d.now, causeId: d.causeId } },
            cause?.interactionId,
          );
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          set({ toast: `Предложение не принято: ${reason}` });
          throw error;
        }
      },
      reject: (deltaId, reason) => {
        const d = get().state.deltas[deltaId];
        if (!d) throw new EngineError(`нет предложения ${deltaId}`);
        const cause = get().events.find(event => event.id === d.causeId);
        dispatch(
          { type: 'WORLD_DELTA_REJECTED', payload: reason ? { deltaId, reason } : { deltaId } },
          cause?.interactionId,
        );
      },
      reroll(deltaId) {
        const d = get().state.deltas[deltaId];
        const variantId = d ? nextVariantId(d) : null;
        if (variantId) dispatch({ type: 'WORLD_DELTA_REROLLED', payload: { deltaId, variantId } });
      },
      reveal: factId => { dispatch({ type: 'FACT_REVEALED', payload: { factId, audience: 'players' } }); },
      travel: payload => dispatch({ type: 'PARTY_TRAVELED', payload }),
      revealPlace: locationId => { dispatch({ type: 'PLACE_REVEALED', payload: { locationId } }); },
      revealKnowledge: p => dispatch({ type: 'KNOWLEDGE_REVEALED', payload: p }),
      levelUp: p => dispatch({ type: 'CHARACTER_LEVELED', payload: p }),
      editSheet: (actorId, patch, reason) => dispatch({ type: 'SHEET_EDITED', payload: { actorId, patch, reason } }),
      moveToken: (actorId, to, source, from) => dispatch({ type: 'TOKEN_MOVED', payload: from ? { actorId, from, to, source } : { actorId, to, source } }),
      gainItem: stack => dispatch({ type: 'ITEM_GAINED', payload: { stack } }),
      createInventoryContainer: container => dispatch({ type: 'INVENTORY_CONTAINER_CREATED', payload: { container } }),
      removeInventoryContainer: containerId => dispatch({ type: 'INVENTORY_CONTAINER_REMOVED', payload: { containerId } }),
      createTransport: transport => dispatch({ type: 'TRANSPORT_CREATED', payload: { transport } }),
      removeTransport: transportId => dispatch({ type: 'TRANSPORT_REMOVED', payload: { transportId } }),
      exchangeCoins: (stackId, qty, toCoinId, toQty, receiveStackId) => dispatch({ type: 'COINS_EXCHANGED', payload: { stackId, qty, toCoinId, toQty, receiveStackId } }),
      loseItem: (stackId, qty, reason) => dispatch({ type: 'ITEM_LOST', payload: reason ? { stackId, qty, reason } : { stackId, qty } }),
      moveItem: (stackId, qty, to, splitStackId) => dispatch({ type: 'ITEM_MOVED', payload: splitStackId ? { stackId, qty, to, splitStackId } : { stackId, qty, to } }),
      transferItem: (stackId, qty, owner, to, splitStackId) => dispatch({ type: 'ITEM_TRANSFERRED', payload: splitStackId ? { stackId, qty, owner, to, splitStackId } : { stackId, qty, owner, to } }),
      createTradeOffer: (offerId, trade) => dispatch({ type: 'TRADE_OFFER_CREATED', payload: { offerId, trade } }),
      withdrawTradeOffer: offerId => dispatch({ type: 'TRADE_OFFER_WITHDRAWN', payload: { offerId } }),
      completeTrade: trade => dispatch({ type: 'TRADE_COMPLETED', payload: trade }),
      setAttunement: (stackId, actorId) => dispatch({ type: 'ATTUNEMENT_CHANGED', payload: actorId ? { stackId, actorId } : { stackId } }),
      equipItem: (stackId, actorId, wornAs) => dispatch({ type: 'ITEM_EQUIPPED', payload: { stackId, actorId, wornAs } }),
      unequipItem: (stackId, actorId) => dispatch({ type: 'ITEM_UNEQUIPPED', payload: { stackId, actorId } }),
      changeSupply: (reason, amount, shortfall) => dispatch({ type: 'SUPPLY_CHANGED', payload: shortfall ? { reason, amount, shortfall } : { reason, amount } }),
      note: (text, threadIds, scale, visible) => dispatch({ type: 'NOTE_ADDED', payload: { text, threadIds, scale, ...(visible ? { visible: true } : {}) } }),
      dismissToast: () => set({ toast: null }),
      adopt(events, baseLength) {
        log.adopt(events, baseLength);
        sync(`Ветка оставлена: ${events.length} ${events.length % 10 === 1 && events.length % 100 !== 11 ? 'событие' : 'событий'} в журнале`);
      },
    };
  });
}

export type EngineStoreApi = ReturnType<typeof createEngineStore>;
