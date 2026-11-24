// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { seedState } from '../campaign/seed';
import { emptyState } from './state';
import { EventLog } from './log';
import { EngineError } from './reduce';
import { legacyStacksForActor } from './inventory';
import { filterJournal, journalEntries } from './journal';
import { projectPlayer } from '../player/projection';

const deterministic = () => {
  let id = 0;
  return { clock: { now: () => ++id }, ids: { next: () => `inv-${++id}` } };
};

const personalStack = (id: string, itemId: string, qty: number, actorId = 'bo') => ({
  id, itemId, qty, owner: { kind: 'actor' as const, id: actorId }, storage: { kind: 'actor' as const, id: actorId },
});

describe('E7 event inventory', () => {
  it('migrates legacy sheet rows to deterministic stacks without changing their quantities', () => {
    const first = seedState();
    const second = seedState();
    expect(first.inventory).toEqual(second.inventory);
    const bo = first.actors.bo!;
    expect(Object.values(first.inventory!).filter(stack => stack.owner.kind === 'actor' && stack.owner.id === 'bo'))
      .toEqual(legacyStacksForActor(bo));
    expect(first.actors.bo!.sheet!.equipment).toEqual(bo.sheet!.equipment);
  });

  it('upgrades pre-visibility legacy rows to player-visible without exposing newly gained stacks by default', () => {
    const state = seedState();
    const legacy = legacyStacksForActor(state.actors.bo!);
    state.inventory = Object.fromEntries(legacy.map(stack => [stack.id, { ...stack, visibility: undefined }]));
    const log = new EventLog(state, [], deterministic());
    expect(Object.values(log.state.inventory!).filter(stack => stack.owner.kind === 'actor' && stack.owner.id === 'bo').every(stack => stack.visibility === 'players')).toBe(true);
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: personalStack('private-token', 'custom:token', 1) } });
    expect(log.state.inventory!['private-token']!.visibility).toBeUndefined();
  });

  it('migrates spawned legacy equipment and undo/replay preserve its stack IDs', () => {
    const state = emptyState();
    const oldBo = seedState().actors.bo!;
    const log = new EventLog(state, [], deterministic());
    log.dispatch({ type: 'ACTOR_SPAWNED', payload: { actor: oldBo, party: true } });
    const migrated = Object.values(log.state.inventory!).filter(stack => stack.owner.kind === 'actor' && stack.owner.id === 'bo');
    expect(migrated).toEqual(legacyStacksForActor(oldBo));
    log.undo();
    expect(log.state.actors.bo).toBeUndefined();
    expect(Object.values(log.state.inventory ?? {}).some(stack => stack.id.startsWith('legacy:bo:'))).toBe(false);
    log.redo();
    expect(log.state.inventory).toMatchObject(Object.fromEntries(migrated.map(stack => [stack.id, stack])));
    expect(new EventLog(emptyState(), log.entries).state.inventory).toMatchObject(Object.fromEntries(migrated.map(stack => [stack.id, stack])));
  });

  it('replays a pre-inventory ACTOR_SPAWNED compensation without leaving migrated stacks behind', () => {
    const actor = seedState().actors.bo!;
    const encounter = { active: false, round: 0, turnIndex: 0, order: [] as readonly string[], initiative: {} };
    const oldEffect = {
      kind: 'actor' as const, actorId: actor.id, before: undefined, after: actor,
      party: { before: [] as readonly string[], after: [actor.id] }, encounter: { before: encounter, after: encounter },
    };
    const oldEvents = [
      { id: 'old-spawn', seq: 0, at: 1, worldSec: 0, type: 'ACTOR_SPAWNED' as const, payload: { actor, party: true }, effect: oldEffect },
      { id: 'old-undo', seq: 1, at: 2, worldSec: 0, type: 'ACTOR_SPAWNED' as const, payload: { actor, party: true }, undoes: 'old-spawn', effect: { ...oldEffect, after: undefined, party: { before: [actor.id], after: [] } } },
    ];
    const replayed = new EventLog(emptyState(), oldEvents);
    expect(replayed.state.actors.bo).toBeUndefined();
    expect(replayed.state.inventory).toBeUndefined();
    const redone = new EventLog(emptyState(), [...oldEvents, { id: 'old-redo', seq: 2, at: 3, worldSec: 0, type: 'ACTOR_SPAWNED' as const, payload: { actor, party: true }, redoes: 'old-spawn', effect: oldEffect }]);
    expect(redone.state.inventory).toMatchObject(Object.fromEntries(legacyStacksForActor(actor).map(stack => [stack.id, stack])));
  });

  it('exchanges equal SRD coin value atomically and restores exact stacks on undo, redo, and replay', () => {
    const state = emptyState();
    state.actors.bo = { id: 'bo', name: 'Bo', kind: 'pc', hp: { current: 10, max: 10, temp: 0 }, ac: 10, passivePerception: 10, conditions: {} };
    state.party = ['bo'];
    const gold = { id: 'gold', itemId: 'coin:gp', qty: 3, owner: { kind: 'actor' as const, id: 'bo' }, storage: { kind: 'actor' as const, id: 'bo' }, visibility: 'players' as const };
    const log = new EventLog(state, [], deterministic());
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: gold } });
    log.dispatch({ type: 'COINS_EXCHANGED', payload: { stackId: 'gold', qty: 2, toCoinId: 'coin:sp', toQty: 20, receiveStackId: 'silver' } });
    expect(log.state.inventory?.gold?.qty).toBe(1);
    expect(log.state.inventory?.silver).toMatchObject({ itemId: 'coin:sp', qty: 20, owner: gold.owner, storage: gold.storage, visibility: 'players' });
    expect(journalEntries(log.entries, log.state)[0]?.secret).toBe(true);
    const after = structuredClone(log.state.inventory);
    log.undo();
    expect(log.state.inventory?.gold).toEqual(gold);
    expect(log.state.inventory?.silver).toBeUndefined();
    log.redo();
    expect(log.state.inventory).toEqual(after);
    expect(new EventLog(state, log.entries).state.inventory).toEqual(after);
  });

  it('creates named camp/transport storage through the event log and replays item movement into it', () => {
    const state = emptyState();
    state.actors.bo = { id: 'bo', name: 'Bo', kind: 'pc', hp: { current: 10, max: 10, temp: 0 }, ac: 10, passivePerception: 10, conditions: {} };
    state.party = ['bo'];
    const log = new EventLog(state, [], deterministic());
    const camp = { id: 'camp:roadside', name: 'Лагерь у тракта', kind: 'camp' as const };
    log.dispatch({ type: 'INVENTORY_CONTAINER_CREATED', payload: { container: camp } });
    const stack = personalStack('tents', 'tent', 1);
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack } });
    log.dispatch({ type: 'ITEM_MOVED', payload: { stackId: 'tents', qty: 1, to: { kind: 'container', id: camp.id } } });
    expect(log.state.inventory?.tents?.storage).toEqual({ kind: 'container', id: camp.id });
    const persisted = structuredClone(log.state);
    log.undo();
    expect(log.state.inventory?.tents).toEqual(stack);
    log.undo();
    expect(log.state.inventory?.tents).toBeUndefined();
    log.undo();
    expect(log.state.inventoryContainers).toBeUndefined();
    log.redo(); log.redo(); log.redo();
    expect(log.state).toMatchObject(persisted);
    expect(new EventLog(state, log.entries).state).toMatchObject(persisted);
  });

  it('links a camp only to an existing campaign location and preserves that link through undo/replay', () => {
    const state = seedState();
    const place = Object.values(state.world.locations)[0]!;
    const log = new EventLog(state, [], deterministic());
    const camp = { id: 'camp:linked', name: 'Стоянка у дороги', kind: 'camp' as const, locationId: place.id };
    log.dispatch({ type: 'INVENTORY_CONTAINER_CREATED', payload: { container: camp } });
    expect(log.state.inventoryContainers?.[camp.id]).toEqual(camp);
    log.undo();
    expect(log.state.inventoryContainers?.[camp.id]).toBeUndefined();
    log.redo();
    expect(new EventLog(state, log.entries).state.inventoryContainers?.[camp.id]).toEqual(camp);

    const count = log.entries.length;
    expect(() => log.dispatch({ type: 'INVENTORY_CONTAINER_CREATED', payload: { container: { ...camp, id: 'camp:bad-place', locationId: 'missing-place' } } })).toThrow(/нет места/);
    expect(() => log.dispatch({ type: 'INVENTORY_CONTAINER_CREATED', payload: { container: { ...camp, id: 'transport:bad-place', kind: 'transport' } } })).toThrow(/только к лагерю/);
    expect(log.entries).toHaveLength(count);
  });

  it('models transport separately, links its cargo container, and preserves both through undo/replay', () => {
    const log = new EventLog(emptyState(), [], deterministic());
    const transport = { id: 'transport:wagon', name: 'Крытая повозка' };
    log.dispatch({ type: 'TRANSPORT_CREATED', payload: { transport } });
    const cargo = { id: 'container:wagon:cargo', name: 'Грузовой отсек', kind: 'transport' as const, transportId: transport.id };
    log.dispatch({ type: 'INVENTORY_CONTAINER_CREATED', payload: { container: cargo } });
    expect(log.state.transports?.[transport.id]).toEqual(transport);
    expect(log.state.inventoryContainers?.[cargo.id]).toEqual(cargo);
    expect(journalEntries(log.entries, log.state).every(entry => entry.secret)).toBe(true);

    const count = log.entries.length;
    expect(() => log.dispatch({ type: 'INVENTORY_CONTAINER_CREATED', payload: { container: { ...cargo, id: 'container:missing', transportId: 'transport:missing' } } })).toThrow(/нет транспорта/);
    expect(() => log.dispatch({ type: 'TRANSPORT_REMOVED', payload: { transportId: transport.id } })).toThrow(/сначала отвяжите/);
    expect(log.entries).toHaveLength(count);

    log.dispatch({ type: 'INVENTORY_CONTAINER_REMOVED', payload: { containerId: cargo.id } });
    log.dispatch({ type: 'TRANSPORT_REMOVED', payload: { transportId: transport.id } });
    log.undo();
    expect(log.state.transports?.[transport.id]).toEqual(transport);
    log.undo();
    expect(log.state.inventoryContainers?.[cargo.id]).toEqual(cargo);
    log.redo(); log.redo();
    expect(log.state.transports).toBeUndefined();
    expect(log.state.inventoryContainers).toBeUndefined();
    expect(new EventLog(emptyState(), log.entries).state).toMatchObject(log.state);
  });

  it('completes a sourced item-for-coins trade atomically across mixed denominations and split stacks', () => {
    const state = emptyState();
    state.actors.buyer = { id: 'buyer', name: 'Покупатель', kind: 'pc', hp: { current: 10, max: 10, temp: 0 }, ac: 10, passivePerception: 10, conditions: {} };
    state.actors.merchant = { id: 'merchant', name: 'Торговец', kind: 'npc', hp: { current: 8, max: 8, temp: 0 }, ac: 10, passivePerception: 10, conditions: {} };
    state.party = ['buyer'];
    const log = new EventLog(state, [], deterministic());
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: { id: 'merchant-swords', itemId: 'longsword', qty: 2, owner: { kind: 'actor', id: 'merchant' }, storage: { kind: 'actor', id: 'merchant' }, visibility: 'players' } } });
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: { id: 'buyer-gold', itemId: 'coin:gp', qty: 1, owner: { kind: 'actor', id: 'buyer' }, storage: { kind: 'actor', id: 'buyer' } } } });
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: { id: 'buyer-silver', itemId: 'coin:sp', qty: 2, owner: { kind: 'actor', id: 'buyer' }, storage: { kind: 'actor', id: 'buyer' } } } });
    const trade = { seller: { kind: 'actor' as const, id: 'merchant' }, buyer: { kind: 'actor' as const, id: 'buyer' }, itemStackId: 'merchant-swords', itemQty: 1, itemSplitStackId: 'buyer-sword', payments: [{ stackId: 'buyer-gold', qty: 1 }, { stackId: 'buyer-silver', qty: 1, splitStackId: 'merchant-silver' }], priceCopper: 110, priceSource: { kind: 'rule' as const, edition: 'SRD 5.1', citation: 'базовая цена, предметы и снаряжение' } };
    log.dispatch({ type: 'TRADE_COMPLETED', payload: trade });
    expect(log.state.inventory).toMatchObject({
      'merchant-swords': { qty: 1, owner: { kind: 'actor', id: 'merchant' } },
      'buyer-sword': { qty: 1, itemId: 'longsword', owner: { kind: 'actor', id: 'buyer' }, storage: { kind: 'actor', id: 'buyer' }, visibility: 'players' },
      'buyer-silver': { qty: 1, owner: { kind: 'actor', id: 'buyer' } },
      'buyer-gold': { owner: { kind: 'actor', id: 'merchant' }, storage: { kind: 'actor', id: 'merchant' } },
      'merchant-silver': { itemId: 'coin:sp', qty: 1, owner: { kind: 'actor', id: 'merchant' }, storage: { kind: 'actor', id: 'merchant' } },
    });
    const entry = journalEntries(log.entries, log.state).at(-1)!;
    expect(entry).toMatchObject({ type: 'TRADE_COMPLETED', secret: true, text: expect.stringContaining('SRD 5.1') });
    expect(filterJournal([entry], { dmView: false })).toEqual([]);
    const after = structuredClone(log.state);
    log.undo();
    expect(log.state.inventory?.['merchant-swords']?.qty).toBe(2);
    expect(log.state.inventory?.['buyer-gold']?.owner).toEqual({ kind: 'actor', id: 'buyer' });
    expect(log.state.inventory?.['merchant-silver']).toBeUndefined();
    log.redo();
    expect(log.state).toMatchObject(after);
    expect(new EventLog(state, log.entries).state).toMatchObject(after);
  });

  it('persists trade offers separately, links acceptance to atomic transfer, and replays withdrawal/undo', () => {
    const state = emptyState();
    state.actors.buyer = { id: 'buyer', name: 'Покупатель', kind: 'pc', hp: { current: 10, max: 10, temp: 0 }, ac: 10, passivePerception: 10, conditions: {} };
    state.actors.merchant = { id: 'merchant', name: 'Торговец', kind: 'npc', hp: { current: 8, max: 8, temp: 0 }, ac: 10, passivePerception: 10, conditions: {} };
    state.party = ['buyer'];
    const log = new EventLog(state, [], deterministic());
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: { id: 'offer-sword', itemId: 'longsword', qty: 1, owner: { kind: 'actor', id: 'merchant' }, storage: { kind: 'actor', id: 'merchant' } } } });
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: { id: 'offer-gold', itemId: 'coin:gp', qty: 1, owner: { kind: 'actor', id: 'buyer' }, storage: { kind: 'actor', id: 'buyer' } } } });
    const trade = { seller: { kind: 'actor' as const, id: 'merchant' }, buyer: { kind: 'actor' as const, id: 'buyer' }, itemStackId: 'offer-sword', itemQty: 1, payments: [{ stackId: 'offer-gold', qty: 1 }], priceCopper: 100, priceSource: { kind: 'rule' as const, edition: 'SRD 5.1', citation: 'базовая цена' } };
    log.dispatch({ type: 'TRADE_OFFER_CREATED', payload: { offerId: 'offer-one', trade } });
    log.dispatch({ type: 'TRADE_OFFER_CREATED', payload: { offerId: 'offer-two', trade } });
    log.dispatch({ type: 'TRADE_OFFER_CREATED', payload: { offerId: 'offer-three', trade } });
    expect(log.state.inventory?.['offer-sword']?.owner).toEqual({ kind: 'actor', id: 'merchant' });
    expect(log.state.inventory?.['offer-gold']?.owner).toEqual({ kind: 'actor', id: 'buyer' });
    expect(log.state.tradeOffers?.['offer-one']).toMatchObject({ status: 'open', trade });
    const beforeMismatch = log.entries.length;
    expect(() => log.dispatch({ type: 'TRADE_COMPLETED', payload: { ...trade, offerId: 'offer-one', priceCopper: 101 } })).toThrow(/условия подтверждаемой сделки отличаются/);
    expect(log.entries).toHaveLength(beforeMismatch);
    const saved = journalEntries(log.entries, log.state).at(-1)!;
    expect(saved).toMatchObject({ type: 'TRADE_OFFER_CREATED', secret: true });
    expect(filterJournal([saved], { dmView: false })).toEqual([]);
    expect(JSON.stringify(projectPlayer(log.state, 'buyer'))).not.toContain('offer-one');

    log.dispatch({ type: 'TRADE_OFFER_WITHDRAWN', payload: { offerId: 'offer-two' } });
    expect(log.state.tradeOffers?.['offer-two']?.status).toBe('withdrawn');
    log.undo();
    expect(log.state.tradeOffers?.['offer-two']?.status).toBe('open');
    log.redo();
    expect(log.state.tradeOffers?.['offer-two']?.status).toBe('withdrawn');

    log.dispatch({ type: 'TRADE_COMPLETED', payload: { ...trade, offerId: 'offer-one' } });
    expect(log.state.tradeOffers?.['offer-one']?.status).toBe('completed');
    expect(log.state.inventory?.['offer-sword']?.owner).toEqual({ kind: 'actor', id: 'buyer' });
    expect(log.state.inventory?.['offer-gold']?.owner).toEqual({ kind: 'actor', id: 'merchant' });
    const beforeStaleAccept = log.entries.length;
    expect(() => log.dispatch({ type: 'TRADE_COMPLETED', payload: { ...trade, offerId: 'offer-three' } })).toThrow(/продавец не владеет/);
    expect(log.entries).toHaveLength(beforeStaleAccept);
    expect(log.state.tradeOffers?.['offer-three']?.status).toBe('open');
    const completed = structuredClone(log.state);
    log.undo();
    expect(log.state.tradeOffers?.['offer-one']?.status).toBe('open');
    expect(log.state.inventory?.['offer-sword']?.owner).toEqual({ kind: 'actor', id: 'merchant' });
    log.redo();
    expect(log.state).toMatchObject(completed);
    expect(new EventLog(state, log.entries).state).toMatchObject(completed);
  });

  it('rechecks a saved market quote against the accepted current settlement index', () => {
    const state = emptyState();
    state.world.locations.town = { id: 'town', name: 'Neverwinter', scale: 'settlement', pricePercent: 20 };
    state.actors.buyer = { id: 'buyer', name: 'Покупатель', kind: 'pc', locationId: 'town', hp: { current: 10, max: 10, temp: 0 }, ac: 10, passivePerception: 10, conditions: {} };
    state.actors.merchant = { id: 'merchant', name: 'Торговец', kind: 'npc', locationId: 'town', hp: { current: 8, max: 8, temp: 0 }, ac: 10, passivePerception: 10, conditions: {} };
    state.party = ['buyer'];
    const log = new EventLog(state, [], deterministic());
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: { id: 'market-sword', itemId: 'longsword', qty: 1, owner: { kind: 'actor', id: 'merchant' }, storage: { kind: 'actor', id: 'merchant' } } } });
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: { id: 'market-gold', itemId: 'coin:gp', qty: 18, owner: { kind: 'actor', id: 'buyer' }, storage: { kind: 'actor', id: 'buyer' } } } });
    const trade = {
      seller: { kind: 'actor' as const, id: 'merchant' }, buyer: { kind: 'actor' as const, id: 'buyer' }, itemStackId: 'market-sword', itemQty: 1,
      payments: [{ stackId: 'market-gold', qty: 18 }], priceCopper: 1800,
      priceSource: { kind: 'market' as const, edition: 'SRD 5.1' as const, citation: 'Индекс 120% · Neverwinter', locationId: 'town', locationName: 'Neverwinter', goods: 'weapons' as const, index: 120, baseCopper: 1500, itemQty: 1 },
    };
    log.dispatch({ type: 'TRADE_OFFER_CREATED', payload: { offerId: 'market-offer', trade } });
    log.dispatch({ type: 'WORLD_DELTA_PROPOSED', payload: { delta: {
      id: 'price-change', scale: 'settlement', subject: 'Neverwinter', was: '120%', now: '125%', cause: 'Изменение рынка', causeId: 'test', status: 'pending',
      patch: { kind: 'price', id: 'town', goods: 'weapons', value: 5 },
    } } });
    log.dispatch({ type: 'WORLD_DELTA_ACCEPTED', payload: { deltaId: 'price-change', subject: 'Neverwinter', was: '120%', now: '125%', causeId: 'test' } });
    const eventCount = log.entries.length;
    expect(() => log.dispatch({ type: 'TRADE_COMPLETED', payload: { ...trade, offerId: 'market-offer' } })).toThrow(/цена места устарела/);
    expect(log.entries).toHaveLength(eventCount);
    expect(log.state.inventory?.['market-sword']?.owner).toEqual({ kind: 'actor', id: 'merchant' });
    expect(log.state.inventory?.['market-gold']?.qty).toBe(18);
    expect(log.state.tradeOffers?.['market-offer']?.status).toBe('open');
  });

  it('publishes only an explicitly disclosed party purchase and hides the seller and private balances', () => {
    const state = emptyState();
    state.actors.buyer = { id: 'buyer', name: 'Покупатель', kind: 'pc', hp: { current: 10, max: 10, temp: 0 }, ac: 10, passivePerception: 10, conditions: {} };
    state.actors.merchant = { id: 'merchant', name: 'Секретный Торговец', kind: 'npc', hp: { current: 8, max: 8, temp: 0 }, ac: 10, passivePerception: 10, conditions: {} };
    state.party = ['buyer'];
    const log = new EventLog(state, [], deterministic());
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: { id: 'public-good', itemId: 'longsword', qty: 1, owner: { kind: 'actor', id: 'merchant' }, storage: { kind: 'actor', id: 'merchant' }, visibility: 'players' } } });
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: { id: 'public-gold', itemId: 'coin:gp', qty: 1, owner: { kind: 'actor', id: 'buyer' }, storage: { kind: 'actor', id: 'buyer' } } } });
    const trade = { seller: { kind: 'actor' as const, id: 'merchant' }, buyer: { kind: 'actor' as const, id: 'buyer' }, itemStackId: 'public-good', itemQty: 1, payments: [{ stackId: 'public-gold', qty: 1 }], priceCopper: 100, priceSource: { kind: 'house-rule' as const, citation: 'ручная цена' }, playerVisible: true };
    log.dispatch({ type: 'TRADE_COMPLETED', payload: trade }, { interactionId: 'private-session-batch' });
    const entry = journalEntries(log.entries, log.state).at(-1)!;
    expect(entry).toMatchObject({ secret: false, origin: 'players', text: 'Партия купила 1 × Longsword у торговца за 100 мм' });
    expect(entry.interactionId).toBeUndefined();
    expect(filterJournal([entry], { dmView: false })).toEqual([entry]);
    expect(entry.text).not.toContain('Секретный Торговец');
    expect(entry.text).not.toContain('ручная цена');
    log.undo();
    const canceled = journalEntries(log.entries, log.state).at(-1)!;
    expect(canceled).toMatchObject({ secret: false, text: expect.stringContaining('Отменено: Партия купила') });
    expect(filterJournal([canceled], { dmView: false })).toEqual([canceled]);
  });

  it('rejects stale, unaffordable, unsourced, and colliding trades without appending an event', () => {
    const state = emptyState();
    state.actors.buyer = { id: 'buyer', name: 'Покупатель', kind: 'pc', hp: { current: 10, max: 10, temp: 0 }, ac: 10, passivePerception: 10, conditions: {} };
    state.actors.merchant = { id: 'merchant', name: 'Торговец', kind: 'npc', hp: { current: 8, max: 8, temp: 0 }, ac: 10, passivePerception: 10, conditions: {} };
    const log = new EventLog(state, [], deterministic());
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: { id: 'for-sale', itemId: 'longsword', qty: 2, owner: { kind: 'actor', id: 'merchant' }, storage: { kind: 'actor', id: 'merchant' } } } });
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: { id: 'short-coins', itemId: 'coin:gp', qty: 1, owner: { kind: 'actor', id: 'buyer' }, storage: { kind: 'actor', id: 'buyer' } } } });
    const payload = { seller: { kind: 'actor' as const, id: 'merchant' }, buyer: { kind: 'actor' as const, id: 'buyer' }, itemStackId: 'for-sale', itemQty: 1, itemSplitStackId: 'sold-part', payments: [{ stackId: 'short-coins', qty: 1 }], priceCopper: 200, priceSource: { kind: 'rule' as const, edition: 'SRD 5.1', citation: 'таблица цены' } };
    const count = log.entries.length, before = structuredClone(log.state);
    expect(() => log.dispatch({ type: 'TRADE_COMPLETED', payload })).toThrow(/не совпадает/);
    expect(() => log.dispatch({ type: 'TRADE_COMPLETED', payload: { ...payload, priceCopper: 100, priceSource: { kind: 'rule', citation: 'таблица цены' } } })).toThrow(/редакцию/);
    expect(() => log.dispatch({ type: 'TRADE_COMPLETED', payload: { ...payload, priceCopper: 100, itemSplitStackId: 'short-coins' } })).toThrow(/стек short-coins/);
    expect(() => log.dispatch({ type: 'TRADE_COMPLETED', payload: { ...payload, priceCopper: 100, playerVisible: 'yes' as never } })).toThrow(/признак раскрытия/);
    expect(log.entries).toHaveLength(count);
    expect(log.state).toEqual(before);
  });

  it('rejects storage in an unregistered container before changing the log', () => {
    const state = emptyState();
    state.actors.bo = { id: 'bo', name: 'Bo', kind: 'pc', hp: { current: 10, max: 10, temp: 0 }, ac: 10, passivePerception: 10, conditions: {} };
    const log = new EventLog(state, [], deterministic());
    expect(() => log.dispatch({ type: 'ITEM_GAINED', payload: { stack: { ...personalStack('lost-tent', 'tent', 1), storage: { kind: 'container', id: 'camp:missing' } } } })).toThrow(/созданным контейнером/);
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: personalStack('tent', 'tent', 1) } });
    expect(() => log.dispatch({ type: 'ITEM_MOVED', payload: { stackId: 'tent', qty: 1, to: { kind: 'container', id: 'transport:missing' } } })).toThrow(/созданным контейнером/);
    expect(log.entries).toHaveLength(1);
    expect(log.state.inventory?.tent?.storage).toEqual({ kind: 'actor', id: 'bo' });
  });

  it('only removes empty containers and restores them by undo/replay', () => {
    const state = emptyState();
    const log = new EventLog(state, [], deterministic());
    const camp = { id: 'camp:one', name: 'Стоянка', kind: 'camp' as const };
    log.dispatch({ type: 'INVENTORY_CONTAINER_CREATED', payload: { container: camp } });
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: { id: 'party-tent', itemId: 'tent', qty: 1, owner: { kind: 'party' }, storage: { kind: 'container', id: camp.id } } } });
    expect(() => log.dispatch({ type: 'INVENTORY_CONTAINER_REMOVED', payload: { containerId: camp.id } })).toThrow(/сначала переместите все вещи/);
    expect(log.entries).toHaveLength(2);
    log.dispatch({ type: 'ITEM_MOVED', payload: { stackId: 'party-tent', qty: 1, to: { kind: 'party' } } });
    log.dispatch({ type: 'INVENTORY_CONTAINER_REMOVED', payload: { containerId: camp.id } });
    expect(log.state.inventoryContainers?.[camp.id]).toBeUndefined();
    log.undo();
    expect(log.state.inventoryContainers?.[camp.id]).toEqual(camp);
    log.redo();
    expect(log.state.inventoryContainers?.[camp.id]).toBeUndefined();
    expect(new EventLog(state, log.entries).state).toMatchObject(log.state);
  });

  it('rejects unbalanced, overdrawn, non-coin, and duplicate-output exchanges without logging', () => {
    const state = emptyState();
    state.actors.bo = { id: 'bo', name: 'Bo', kind: 'pc', hp: { current: 10, max: 10, temp: 0 }, ac: 10, passivePerception: 10, conditions: {} };
    state.party = ['bo'];
    const log = new EventLog(state, [], deterministic());
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: personalStack('gold', 'coin:gp', 1) } });
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: personalStack('sword', 'longsword', 1) } });
    const length = log.entries.length;
    expect(() => log.dispatch({ type: 'COINS_EXCHANGED', payload: { stackId: 'gold', qty: 1, toCoinId: 'coin:sp', toQty: 9, receiveStackId: 'bad-rate' } })).toThrow(/неравноценны/);
    expect(() => log.dispatch({ type: 'COINS_EXCHANGED', payload: { stackId: 'gold', qty: 2, toCoinId: 'coin:sp', toQty: 20, receiveStackId: 'overdraw' } })).toThrow(/только 1/);
    expect(() => log.dispatch({ type: 'COINS_EXCHANGED', payload: { stackId: 'sword', qty: 1, toCoinId: 'coin:sp', toQty: 100, receiveStackId: 'not-money' } })).toThrow(/нет монетного стека/);
    expect(() => log.dispatch({ type: 'COINS_EXCHANGED', payload: { stackId: 'gold', qty: 1, toCoinId: 'coin:sp', toQty: 10, receiveStackId: 'sword' } })).toThrow(/новый id/);
    expect(log.entries).toHaveLength(length);
    expect(log.state.inventory?.gold?.qty).toBe(1);
    expect(log.state.inventory?.['bad-rate']).toBeUndefined();
  });

  it('adds catalogue or custom item references through the reducer, rejects duplicate IDs and preserves optional absence on undo', () => {
    const state = emptyState();
    state.actors.bo = { id: 'bo', name: 'Bo', kind: 'pc', hp: { current: 10, max: 10, temp: 0 }, ac: 10, passivePerception: 10, conditions: {} };
    state.party = ['bo'];
    const log = new EventLog(state, [], deterministic());
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: personalStack('found-1', 'custom:moon-key', 2) } });
    expect(log.state.inventory?.['found-1']?.qty).toBe(2);
    expect(() => log.dispatch({ type: 'ITEM_GAINED', payload: { stack: personalStack('found-1', 'longsword', 1) } })).toThrow(EngineError);
    expect(log.entries).toHaveLength(1);
    log.undo();
    expect(log.state.inventory).toBeUndefined();
  });

  it('rejects invalid amounts and overdraws without changing state or log', () => {
    const log = new EventLog(seedState(), [], deterministic());
    const stack = Object.values(log.state.inventory!).find(item => item.owner.kind === 'actor' && item.owner.id === 'bo')!;
    expect(() => log.dispatch({ type: 'ITEM_LOST', payload: { stackId: stack.id, qty: stack.qty + 1 } })).toThrow(/только/);
    expect(() => log.dispatch({ type: 'ITEM_LOST', payload: { stackId: stack.id, qty: 0 } })).toThrow(/целое больше нуля/);
    expect(() => log.dispatch({ type: 'SHEET_EDITED', payload: { actorId: 'bo', patch: { equipment: [] }, reason: 'bypass inventory' } as never })).toThrow(/правятся только/);
    expect(log.entries).toHaveLength(0);
    expect(log.state.inventory?.[stack.id]).toEqual(stack);
  });

  it('updates the card projection and removes the attack when its weapon is lost', () => {
    const log = new EventLog(seedState(), [], deterministic());
    const bo = log.state.actors.bo!;
    expect(bo.sheet?.attacks?.some(attack => attack.id === 'longbow')).toBe(true);
    const bow = Object.values(log.state.inventory!).find(item => item.owner.kind === 'actor' && item.owner.id === 'bo' && item.itemId === 'longbow')!;
    log.dispatch({ type: 'ITEM_LOST', payload: { stackId: bow.id, qty: bow.qty } });
    expect(log.state.actors.bo!.sheet?.equipment?.some(item => item.id === 'longbow')).toBe(false);
    expect(log.state.actors.bo!.sheet?.attacks?.some(attack => attack.id === 'longbow')).toBe(false);
    log.undo();
    expect(log.state.actors.bo!.sheet?.attacks?.some(attack => attack.id === 'longbow')).toBe(true);
  });

  it('clears an unavailable worn armor and shield and recalculates AC from the current sheet', () => {
    const log = new EventLog(seedState(), [], deterministic());
    const actor = log.state.actors.korrin!;
    expect(actor.sheet?.armor).toBe('chain-mail');
    expect(actor.sheet?.shield).toBe(true);
    expect(actor.ac).toBe(18);
    const armor = Object.values(log.state.inventory!).find(item => item.owner.kind === 'actor' && item.owner.id === 'korrin' && item.itemId === 'chain-mail')!;
    log.dispatch({ type: 'ITEM_LOST', payload: { stackId: armor.id, qty: armor.qty } });
    expect(log.state.actors.korrin!.sheet?.armor).toBeUndefined();
    expect(log.state.actors.korrin!.ac).toBe(14);
    log.undo();
    expect(log.state.actors.korrin!.ac).toBe(18);
    log.dispatch({ type: 'ITEM_MOVED', payload: { stackId: armor.id, qty: armor.qty, to: { kind: 'party' } } });
    expect(log.state.actors.korrin!.sheet?.armor).toBeUndefined();
    expect(log.state.actors.korrin!.ac).toBe(14);
    log.undo();
    expect(log.state.actors.korrin!.ac).toBe(18);
  });

  it('equips and removes supported armor through events, recalculates AC, and restores exact projections on undo/redo', () => {
    const log = new EventLog(seedState(), [], deterministic());
    const actor = log.state.actors.korrin!;
    const oldArmor = Object.values(log.state.inventory!).find(item => item.owner.kind === 'actor' && item.owner.id === actor.id && item.wornAs === 'armor')!;
    const shield = Object.values(log.state.inventory!).find(item => item.owner.kind === 'actor' && item.owner.id === actor.id && item.wornAs === 'shield')!;
    log.dispatch({ type: 'ITEM_UNEQUIPPED', payload: { stackId: oldArmor.id, actorId: actor.id } });
    log.dispatch({ type: 'ITEM_UNEQUIPPED', payload: { stackId: shield.id, actorId: actor.id } });
    expect(log.state.actors[actor.id]!.sheet!.armor).toBeUndefined();
    expect(log.state.actors[actor.id]!.sheet!.shield).toBeUndefined();

    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: personalStack('leather-for-korrin', 'leather-armor', 1, actor.id) } });
    const beforeEquipAc = log.state.actors[actor.id]!.ac;
    log.dispatch({ type: 'ITEM_EQUIPPED', payload: { stackId: 'leather-for-korrin', actorId: actor.id, wornAs: 'armor' } });
    expect(log.state.actors[actor.id]!.sheet!.armor).toBe('leather');
    expect(log.state.inventory!['leather-for-korrin']!.wornAs).toBe('armor');
    expect(log.state.actors[actor.id]!.ac).not.toBe(beforeEquipAc);
    log.undo();
    expect(log.state.inventory!['leather-for-korrin']!.wornAs).toBeUndefined();
    expect(log.state.actors[actor.id]!.sheet!.armor).toBeUndefined();
    log.redo();
    expect(log.state.actors[actor.id]!.sheet!.armor).toBe('leather');

    log.dispatch({ type: 'ITEM_UNEQUIPPED', payload: { stackId: 'leather-for-korrin', actorId: actor.id } });
    expect(log.state.actors[actor.id]!.sheet!.armor).toBeUndefined();
  });

  it('rejects incompatible, remote, stacked, duplicate-slot and Mage Armor equipment before journaling', () => {
    const log = new EventLog(seedState(), [], deterministic());
    const invalid = [
      personalStack('weapon-as-armor', 'longsword', 1, 'korrin'),
      { ...personalStack('remote-armor', 'leather-armor', 1, 'korrin'), storage: { kind: 'party' as const } },
      personalStack('stacked-armor', 'leather-armor', 2, 'korrin'),
    ];
    const carriedArmor = personalStack('extra-armor', 'leather-armor', 1, 'korrin');
    for (const stack of [...invalid, carriedArmor]) log.dispatch({ type: 'ITEM_GAINED', payload: { stack } });
    for (const stack of invalid) expect(() => log.dispatch({ type: 'ITEM_EQUIPPED', payload: { stackId: stack.id, actorId: 'korrin', wornAs: 'armor' } })).toThrow();
    const existingArmor = Object.values(log.state.inventory!).find(item => item.owner.kind === 'actor' && item.owner.id === 'korrin' && item.wornAs === 'armor')!;
    expect(() => log.dispatch({ type: 'ITEM_EQUIPPED', payload: { stackId: carriedArmor.id, actorId: 'korrin', wornAs: 'armor' } })).toThrow(/сначала снимите уже надетый доспех/);
    log.dispatch({ type: 'ITEM_UNEQUIPPED', payload: { stackId: existingArmor.id, actorId: 'korrin' } });
    const mageState = seedState();
    mageState.actors.bo!.sheet!.mageArmor = true;
    const mageLog = new EventLog(mageState, [], deterministic());
    mageLog.dispatch({ type: 'ITEM_GAINED', payload: { stack: personalStack('leather-for-mage', 'leather-armor', 1, 'bo') } });
    expect(() => mageLog.dispatch({ type: 'ITEM_EQUIPPED', payload: { stackId: 'leather-for-mage', actorId: 'bo', wornAs: 'armor' } })).toThrow(/Mage Armor/);
  });

  it('moves a partial quantity to a separate stack and undo restores exact IDs, storage, and quantities', () => {
    const log = new EventLog(seedState(), [], deterministic());
    const arrows = Object.values(log.state.inventory!).find(item => item.owner.kind === 'actor' && item.owner.id === 'bo' && item.itemId === 'arrow')!;
    log.dispatch({ type: 'ITEM_MOVED', payload: { stackId: arrows.id, qty: 5, to: { kind: 'party' }, splitStackId: 'arrows-party' } });
    expect(log.state.inventory![arrows.id]).toMatchObject({ qty: arrows.qty - 5, owner: arrows.owner, storage: arrows.storage });
    expect(log.state.inventory!['arrows-party']).toMatchObject({ qty: 5, owner: arrows.owner, storage: { kind: 'party' } });
    log.undo();
    expect(log.state.inventory![arrows.id]).toEqual(arrows);
    expect(log.state.inventory!['arrows-party']).toBeUndefined();
    log.redo();
    expect(log.state.inventory!['arrows-party']?.qty).toBe(5);
  });

  it('transfers ownership atomically, preserving item totals and undoing the full transfer', () => {
    const log = new EventLog(seedState(), [], deterministic());
    const arrows = Object.values(log.state.inventory!).find(item => item.owner.kind === 'actor' && item.owner.id === 'bo' && item.itemId === 'arrow')!;
    log.dispatch({ type: 'ITEM_TRANSFERRED', payload: { stackId: arrows.id, qty: 3, owner: { kind: 'actor', id: 'korrin' }, to: { kind: 'actor', id: 'korrin' }, splitStackId: 'gifted-arrows' } });
    expect(log.state.inventory!['gifted-arrows']).toMatchObject({ itemId: 'arrow', qty: 3, owner: { kind: 'actor', id: 'korrin' } });
    expect(log.state.inventory![arrows.id]?.qty).toBe(arrows.qty - 3);
    log.undo();
    expect(log.state.inventory![arrows.id]).toEqual(arrows);
    expect(log.state.inventory!['gifted-arrows']).toBeUndefined();
  });

  it('attunes eligible magic items, enforces the three-item cap, and blocks unsupported clauses', () => {
    const log = new EventLog(seedState(), [], deterministic());
    for (let i = 0; i < 3; i++) {
      const id = `amulet-${i}`;
      log.dispatch({ type: 'ITEM_GAINED', payload: { stack: personalStack(id, 'amulet-of-health', 1) } });
      log.dispatch({ type: 'ATTUNEMENT_CHANGED', payload: { stackId: id, actorId: 'bo' } });
    }
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: personalStack('fourth-amulet', 'amulet-of-health', 1) } });
    expect(() => log.dispatch({ type: 'ATTUNEMENT_CHANGED', payload: { stackId: 'fourth-amulet', actorId: 'bo' } })).toThrow(/предел настройки/);
    log.dispatch({ type: 'ATTUNEMENT_CHANGED', payload: { stackId: 'amulet-0' } });
    log.dispatch({ type: 'ATTUNEMENT_CHANGED', payload: { stackId: 'fourth-amulet', actorId: 'bo' } });
    const dwarfRing = personalStack('dwarf-ring', 'dwarven-thrower', 1);
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: dwarfRing } });
    expect(() => log.dispatch({ type: 'ATTUNEMENT_CHANGED', payload: { stackId: dwarfRing.id, actorId: 'bo' } })).toThrow(/не подходит/);
    const situational = personalStack('situational', 'ring-of-shooting-stars', 1);
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: situational } });
    expect(() => log.dispatch({ type: 'ATTUNEMENT_CHANGED', payload: { stackId: situational.id, actorId: 'bo' } })).toThrow(/требует проверки мастером/);
  });

  it('keeps the DM inventory and its journal entries out of the player projection', () => {
    const state = seedState();
    const log = new EventLog(state, [], deterministic());
    log.dispatch({ type: 'ITEM_GAINED', payload: { stack: personalStack('secret-cache', 'amulet-of-health', 1, 'captain') } });
    const serialized = JSON.stringify(projectPlayer(log.state, 'bo'));
    expect(serialized).not.toContain('secret-cache');
    expect(serialized).not.toContain('amulet-of-health');
    const entry = journalEntries(log.entries, log.state)[0]!;
    expect(entry.secret).toBe(true);
    expect(entry.text).toContain('Amulet of Health');
  });
});
