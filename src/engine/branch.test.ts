// Ветки «что если» (Д4): ветка — второй стор от нынешнего мира; основная линия не меняется; «Оставить» — события ветки
// в лог с теми же id, причины предложений живы, Ctrl+Z отменяет их по одному; основная ушла вперёд — оставить нельзя.
import { describe, expect, it } from 'vitest';
import { diffWorld } from '../campaign/branchDiff';
import { seedLog, seedState } from '../campaign/seed';
import { stepTime } from '../campaign/simulation';
import { DELTA, FACTION } from '../campaign/world';
import { branchFresh, keepBranch, openBranch } from './branch';
import { memoryStore } from './persist';
import { createEngineStore } from './store';

const mainStore = () => {
  const persist = memoryStore();
  persist.save(seedLog());
  return createEngineStore(seedState(), { persist });
};

describe('ветка', () => {
  it('принять в ветке и три десятидневки — основная линия та же; разница — дата и принятое', () => {
    const main = mainStore();
    const before = main.getState().state;
    const b = openBranch(main.getState(), 'b1', 'если Zhentarim возьмут тракт');
    b.store.getState().accept(DELTA.zhentarimTrail);
    stepTime(b.store.getState(), 'tenday', 3);
    expect(main.getState().state).toBe(before);
    const rows = diffWorld([main.getState().state, b.store.getState().state]);
    expect(rows.find(r => r.key === 'time')?.values).toEqual([expect.stringMatching(/Mirtul/), expect.stringMatching(/Kythorn/)]);
    expect(rows.find(r => r.key === `delta:${DELTA.zhentarimTrail}`)?.values[0]).toBe('ждёт');
    expect(rows.find(r => r.key === `delta:${DELTA.zhentarimTrail}`)?.values[1]).toMatch(/^принято/);
    expect(rows.every(r => r.values[0] !== r.values[1])).toBe(true);
  });

  it('«Оставить»: события ветки — в лог с теми же id; Ctrl+Z снимает последнее; ушедшая вперёд линия — нельзя', () => {
    const main = mainStore();
    const n = main.getState().events.length;
    const b = openBranch(main.getState(), 'b1', 'ветка');
    b.store.getState().accept(DELTA.ironPrices);
    const { event } = stepTime(b.store.getState(), 'tenday', 1);
    const ids = b.store.getState().events.map(e => e.id);
    expect(branchFresh(main.getState(), b)).toBe(true);
    keepBranch(main.getState(), b);
    expect(main.getState().events.slice(n).map(e => e.id)).toEqual(ids);
    expect(main.getState().events.slice(n).map(e => e.seq)).toEqual(ids.map((_, i) => n + i));
    expect(main.getState().state.deltas[DELTA.ironPrices].status).toBe('accepted');
    // Предложения симуляции ветки ссылаются на её шаг времени — тот же id в основном логе.
    const fromStep = Object.values(b.store.getState().state.deltas).filter(d => d.causeId === event.id);
    expect(fromStep.length).toBeGreaterThan(0);
    for (const d of fromStep) expect(main.getState().state.deltas[d.id]?.causeId).toBe(event.id);
    expect(main.getState().events.some(e => e.id === event.id)).toBe(true);
    expect(main.getState().toast).toMatch(/^Ветка оставлена/);
    main.getState().undo();
    expect(main.getState().state.time.sec).toBe(b.store.getState().state.time.sec - 10 * 86_400);

    const b2 = openBranch(main.getState(), 'b2', 'вторая');
    b2.store.getState().changeSupply('bought', 3);
    main.getState().changeSupply('bought', 1);
    expect(branchFresh(main.getState(), b2)).toBe(false);
    expect(() => keepBranch(main.getState(), b2)).toThrow(/ушла вперёд/);
    expect(main.getState().state.supply).toBe(1);
  });

  it('отменённое в ветке переносится вместе с отменой — мир тот же, что в ветке', () => {
    const main = mainStore();
    const b = openBranch(main.getState(), 'b1', 'ветка');
    b.store.getState().changeSupply('bought', 5);
    b.store.getState().changeSupply('lost', 2);
    b.store.getState().undo();
    keepBranch(main.getState(), b);
    expect(main.getState().state.supply).toBe(5);
    expect(diffWorld([main.getState().state, b.store.getState().state])).toEqual([]);
  });

  it('разница двух веток и основной: отношение фракций — числом и словом', () => {
    const main = mainStore();
    const a = openBranch(main.getState(), 'a', 'союз');
    a.store.getState().propose({ id: 'd-x', scale: 'continent', subject: 'Zhentarim — Harpers', was: '−2', now: '0', cause: 'мир', causeId: FACTION.harpers, status: 'pending', patch: { kind: 'relation', id: FACTION.zhentarim, other: FACTION.harpers, value: 0 } });
    a.store.getState().accept('d-x');
    const rows = diffWorld([main.getState().state, a.store.getState().state, main.getState().state]);
    const rel = rows.find(r => r.key === `rel:${FACTION.harpers}|${FACTION.zhentarim}`)!;
    expect(rel.values[1]).toBe('0 ровно');
    expect(rel.values[0]).toBe(rel.values[2]);
    expect(rel.values[0]).toMatch(/^-2/);
  });
});
