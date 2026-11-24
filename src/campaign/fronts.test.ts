// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createEngineStore, EventLog } from '../engine';
import { applyWorldPatch } from '../engine/reduce';
import { emptyState, type DungeonWorldFront, type State } from '../engine/state';
import { threadSummaries } from '../engine/journal';
import { threadCardRows } from '../pages/desk/helpers';
import { frontDelta, fulfillPortentDelta, resolveDangerDelta } from './fronts';

const seed = (): State => {
  const state = emptyState();
  state.world.threads['cult-front'] = {
    id: 'cult-front', name: 'Культ Talos', status: 'open', openedSec: 0, lastTouchedSec: 0,
  };
  return state;
};

const adventureFront: DungeonWorldFront = {
  source: 'dungeon-world-srd:fronts', type: 'adventure', stakes: ['Откроет ли культ ворота?'],
  dangers: [
    { id: 'cult', name: 'Культ', impulse: 'распространить веру', impendingDoom: 'тирания', portents: [
      { id: 'sign-1', text: 'Культ вербует стражу', fulfilled: false },
    ] },
    { id: 'storm', name: 'Буря', impulse: 'обрушиться на город', impendingDoom: 'разрушение', portents: [] },
  ],
};

describe('фронты как заметки нити и предложения', () => {
  it('сохраняет фронт только после принятия и точно отменяет его', () => {
    const store = createEngineStore(seed());
    const delta = frontDelta(store.getState().state, 'cult-front', adventureFront, 'front-create');
    store.getState().propose(delta);
    expect(store.getState().state.world.threads['cult-front'].front).toBeUndefined();
    store.getState().accept(delta.id);
    expect(store.getState().state.world.threads['cult-front'].front).toEqual(adventureFront);
    const replayed = new EventLog(seed(), store.getState().events);
    expect(replayed.state.world.threads['cult-front'].front).toEqual(adventureFront);
    store.getState().undo();
    expect(store.getState().state.world.threads['cult-front'].front).toBeUndefined();
  });

  it('мрачный знак — ручное предложение, не автособытие; принятие и undo обратимы', () => {
    const before = applyWorldPatch(seed(), { kind: 'threadFront', id: 'cult-front', front: adventureFront });
    const store = createEngineStore(before);
    const delta = fulfillPortentDelta(store.getState().state, 'cult-front', 'cult', 'sign-1', 'front-portent');
    store.getState().propose(delta);
    expect(store.getState().state.world.threads['cult-front'].front?.dangers[0].portents[0].fulfilled).toBe(false);
    store.getState().accept(delta.id);
    expect(store.getState().state.world.threads['cult-front'].front?.dangers[0].portents[0].fulfilled).toBe(true);
    store.getState().undo();
    expect(store.getState().state.world.threads['cult-front'].front).toEqual(adventureFront);
  });

  it('разрешение опасности требует все её знаки и записывает последствие мастера без мутации мира; undo/replay точны', () => {
    const complete: DungeonWorldFront = { ...adventureFront, dangers: adventureFront.dangers.map(danger => danger.id === 'cult' ? {
      ...danger, portents: danger.portents.map(portent => ({ ...portent, fulfilled: true })),
    } : danger) };
    const before = applyWorldPatch(seed(), { kind: 'threadFront', id: 'cult-front', front: complete });
    const store = createEngineStore(before);
    const proposal = resolveDangerDelta(store.getState().state, 'cult-front', 'cult', 'Стража распустила культ.', 'front-doom');
    store.getState().propose(proposal);
    expect(store.getState().state.world.threads['cult-front'].front?.dangers[0].resolution).toBeUndefined();
    store.getState().accept(proposal.id);
    expect(store.getState().state.world.threads['cult-front'].front?.dangers[0].resolution).toEqual({ text: 'Стража распустила культ.', atSec: 0 });
    const replayed = new EventLog(before, store.getState().events);
    expect(replayed.state.world.threads['cult-front'].front).toEqual(store.getState().state.world.threads['cult-front'].front);
    store.getState().undo();
    expect(store.getState().state.world.threads['cult-front'].front).toEqual(complete);
  });

  it('не записывает беду без наступивших знаков или без текста последствия', () => {
    const state = applyWorldPatch(seed(), { kind: 'threadFront', id: 'cult-front', front: adventureFront });
    expect(() => resolveDangerDelta(state, 'cult-front', 'cult', 'исход', 'blocked-doom')).toThrow(/все мрачные знаки/);
    const complete: State = applyWorldPatch(state, { kind: 'threadFront', id: 'cult-front', front: { ...adventureFront, dangers: adventureFront.dangers.map(danger => danger.id === 'cult' ? { ...danger, portents: danger.portents.map(portent => ({ ...portent, fulfilled: true })) } : danger) } });
    expect(() => resolveDangerDelta(complete, 'cult-front', 'cult', '   ', 'blank-doom')).toThrow(/запишите/);
  });

  it('shows compact front progress in the GM thread summary and removes it from the player summary', () => {
    const state = seed();
    state.world.threads['cult-front'].front = adventureFront;
    const gm = threadSummaries([], state, 0, true)[0]!;
    expect(threadCardRows(gm).find(row => row.key === 'front')).toMatchObject({ label: 'фронт', text: 'Культ 0/1; Буря без знаков' });
    const player = threadSummaries([], state, 0, false)[0]!;
    expect(player.front).toBeUndefined();
    expect(threadCardRows(player, false).some(row => row.key === 'front')).toBe(false);
  });

  it('редьюсер проверяет структуру и число опасностей, ставок и знаков по масштабу', () => {
    expect(() => applyWorldPatch(seed(), { kind: 'threadFront', id: 'cult-front', front: { ...adventureFront, dangers: [adventureFront.dangers[0]] } })).toThrow(/2–3 опасности/);
    expect(() => applyWorldPatch(seed(), { kind: 'threadFront', id: 'cult-front', front: { ...adventureFront, dangers: adventureFront.dangers.map(d => ({ ...d, portents: [] })) } })).toThrow(/1–3 мрачных знака/);
    expect(() => applyWorldPatch(seed(), { kind: 'threadFront', id: 'cult-front', front: { ...adventureFront, type: 'campaign' } })).toThrow(/3–5 мрачных знака/);
    const forged = { ...adventureFront, dangers: adventureFront.dangers.map(danger => danger.id === 'cult' ? { ...danger, resolution: { text: 'вымышленное наступление', atSec: 0 } } : danger) };
    expect(() => applyWorldPatch(seed(), { kind: 'threadFront', id: 'cult-front', front: forged })).toThrow(/только после всех мрачных знаков/);
  });
});
