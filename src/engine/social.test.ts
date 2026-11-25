import { describe, expect, it } from 'vitest';
import { TEMPO_SECONDS } from './events';
import { EventLog } from './log';
import { emptyState } from './state';

function logAt(sec: number, giftAtSec?: number, inventory?: ReturnType<typeof emptyState>['inventory']) {
  const state = emptyState();
  state.time.sec = sec;
  state.party = ['hero'];
  state.actors = {
    hero: { id: 'hero', name: 'Герой', kind: 'pc', hp: { current: 10, max: 10, temp: 0 }, ac: 10, passivePerception: 10, conditions: {} },
    npc: {
      id: 'npc', name: 'Спутник', kind: 'npc', hp: { current: 10, max: 10, temp: 0 }, ac: 10, passivePerception: 10, conditions: {},
      ...(giftAtSec === undefined ? {} : { social: { attitude: 'indifferent' as const, giftAtSec } }),
    },
  };
  if (inventory) state.inventory = inventory;
  let nextId = 0;
  return new EventLog(state, [], { clock: { now: () => 1 }, ids: { next: () => `gift-event-${++nextId}` } });
}

const giftEvent = (giftAtSec: number) => ({
  type: 'NPC_SOCIAL_UPDATED' as const,
  payload: {
    actorId: 'npc', kind: 'gift' as const, targetId: 'hero', gift: 'Подарил карту дороги',
    state: { attitude: 'indifferent' as const, giftAtSec }, note: 'Герой преподнёс подарок спутнику',
  },
});

describe('NPC gift log', () => {
  it('transfers an actual partial stack and records the cooldown in the same reversible event', () => {
    const log = logAt(100, undefined, {
      rope: { id: 'rope', itemId: 'rope', qty: 3, owner: { kind: 'actor', id: 'hero' }, storage: { kind: 'actor', id: 'hero' } },
    });
    const event = log.dispatch({ type: 'ITEM_GIFTED', payload: {
      stackId: 'rope', qty: 1, giverId: 'hero', recipientId: 'npc', splitStackId: 'gift-rope', note: 'К выбранному месту ведут метки',
    } });
    expect(log.state.inventory).toMatchObject({
      rope: { qty: 2, owner: { kind: 'actor', id: 'hero' } },
      'gift-rope': { qty: 1, owner: { kind: 'actor', id: 'npc' }, storage: { kind: 'actor', id: 'npc' } },
    });
    expect(log.state.actors.npc.social?.giftAtSec).toBe(100);
    expect(event.type).toBe('ITEM_GIFTED');
    expect(() => log.dispatch({ type: 'ITEM_GIFTED', payload: { stackId: 'rope', qty: 1, giverId: 'hero', recipientId: 'npc', splitStackId: 'gift-rope-2' } })).toThrow(/десятидневки/);
    log.undo();
    expect(log.state.inventory?.['gift-rope']).toBeUndefined();
    expect(log.state.inventory?.rope?.qty).toBe(3);
    expect(log.state.actors.npc.social?.giftAtSec).toBeUndefined();
    log.redo();
    expect(log.state.inventory?.['gift-rope']?.owner).toEqual({ kind: 'actor', id: 'npc' });
    expect(log.state.actors.npc.social?.giftAtSec).toBe(100);
  });

  it('records one gift per NPC and tenday, then permits another at the boundary', () => {
    const early = logAt(TEMPO_SECONDS.tenday - 1, 0);
    expect(() => early.dispatch(giftEvent(early.state.time.sec))).toThrow(/десятидневки/);

    const ready = logAt(TEMPO_SECONDS.tenday, 0);
    ready.dispatch(giftEvent(ready.state.time.sec));
    expect(ready.state.actors.npc.social?.giftAtSec).toBe(TEMPO_SECONDS.tenday);
    ready.undo();
    expect(ready.state.actors.npc.social?.giftAtSec).toBe(0);
    ready.redo();
    expect(ready.state.actors.npc.social?.giftAtSec).toBe(TEMPO_SECONDS.tenday);
  });

  it('does not let a gift record change attitude or PF1 relationship score', () => {
    const log = logAt(0);
    expect(() => log.dispatch({
      ...giftEvent(0),
      payload: { ...giftEvent(0).payload, state: { attitude: 'friendly', giftAtSec: 0 } },
    })).toThrow(/не меняет отношение/);
  });
});
