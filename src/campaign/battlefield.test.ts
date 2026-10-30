// Поле боя сида: расстановка F2 сходится с сидом (каждая клетка — у актёра из состояния, клетки не
// совпадают, всё внутри сетки), конус и задетые — картинка референса; выбывший уходит с поля.
import { describe, expect, it } from 'vitest';
import { placedActors, seedBattlefield } from './battlefield';
import { seedEngine, seedState } from './seed';

describe('seedBattlefield', () => {
  const field = seedBattlefield();
  const state = seedState();

  it('каждая клетка — у актёра сида, и у каждого актёра сида есть клетка', () => {
    expect(Object.keys(field.positions).sort()).toEqual(Object.keys(state.actors).sort());
  });

  it('клетки не совпадают и лежат внутри сетки 12 × 8; стены тоже внутри', () => {
    const cells = Object.values(field.positions);
    expect(new Set(cells.map(c => `${c.x},${c.y}`)).size).toBe(cells.length);
    for (const c of cells) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(field.cols);
      expect(c.y).toBeLessThan(field.rows);
    }
    for (const w of field.walls) {
      expect(w.x + (w.w ?? 1)).toBeLessThanOrEqual(field.cols);
      expect(w.y + (w.h ?? 1)).toBeLessThanOrEqual(field.rows);
    }
    // На стене никто не стоит.
    for (const c of cells) {
      const onWall = field.walls.some(w => c.x >= w.x && c.x < w.x + (w.w ?? 1) && c.y >= w.y && c.y < w.y + (w.h ?? 1));
      expect(onWall).toBe(false);
    }
  });

  it('конус — от клетки капитана на запад, три клетки; задетые — два бандита с клеткой на поле', () => {
    expect(field.cone).toEqual({ ...field.positions.captain, dir: 'w', length: 3 });
    expect(field.affected).toEqual(['bandit-1', 'bandit-2']);
    for (const id of field.affected) expect(field.positions[id]).toBeDefined();
  });

  it('placedActors: все восемь с клеткой; выбывший (ACTOR_REMOVED) уходит с поля, на нуле хитов — остаётся', () => {
    const store = seedEngine();
    expect(placedActors(store.getState().state, field)).toHaveLength(8);
    store.getState().damage('bandit-3', 99);
    expect(placedActors(store.getState().state, field).map(p => p.actor.id)).toContain('bandit-3');
    store.getState().remove('bandit-3', 'dead');
    expect(placedActors(store.getState().state, field).map(p => p.actor.id)).not.toContain('bandit-3');
    store.getState().undo();
    expect(placedActors(store.getState().state, field)).toHaveLength(8);
  });

  it('клетка актёра (TOKEN_MOVED) главнее расстановки сида; клетка за краем поля — токен не рисуется', () => {
    const store = seedEngine();
    store.getState().moveToken('korrin', { x: 4, y: 3 }, 'maptool');
    expect(placedActors(store.getState().state, field).find(p => p.actor.id === 'korrin')?.cell).toEqual({ x: 4, y: 3 });
    store.getState().moveToken('korrin', { x: 20, y: 3 }, 'maptool');
    expect(placedActors(store.getState().state, field).map(p => p.actor.id)).not.toContain('korrin');
  });
});
