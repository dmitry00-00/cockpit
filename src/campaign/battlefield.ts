// Поле боя мок-кампании: расстановка F2 (`reference/screens/F2-combat.png`) — клетки по 5 футов, 12 × 8.
// Это данные сида, как места и фракции: события перемещения по сетке в двадцати одном нет (HANDOFF §7),
// поэтому токены пока не двигаются, а шаблон и «кого задело» — заранее решённая картинка, не вычисление.
// Актёр без клетки на сетке не рисуется — появившийся в сессии (ACTOR_SPAWNED) ставится мастером позже.
import type { State } from '../engine/state';

export interface Cell { x: number; y: number }

export interface Battlefield {
  cols: number;
  rows: number;
  /** Клетка каждого актёра по id. */
  positions: Readonly<Record<string, Cell>>;
  /** Стены и укрытия — прямоугольники в клетках. */
  walls: readonly { x: number; y: number; w?: number; h?: number }[];
  /** Конус 15 футов от капитана на запад: три клетки в длину, три в ширину на дальнем краю (5e SRD). */
  cone?: { x: number; y: number; dir: 'e' | 'w' | 'n' | 's'; length: number };
  /** Кого задел шаблон — решает мастер, не сетка. */
  affected: readonly string[];
}

/** Расстановка §13: партия слева у входа, два бандита в конусе капитана, третий лежит у дальней стены. */
export function seedBattlefield(): Battlefield {
  return {
    cols: 12,
    rows: 8,
    positions: {
      korrin: { x: 2, y: 2 },
      bo: { x: 0, y: 3 },
      aldric: { x: 1, y: 4 },
      lyra: { x: 0, y: 5 },
      'bandit-1': { x: 5, y: 2 },
      'bandit-2': { x: 5, y: 4 },
      captain: { x: 8, y: 3 },
      'bandit-3': { x: 9, y: 6 },
    },
    walls: [
      { x: 6, y: 0, h: 2 },
      { x: 10, y: 3, w: 2 },
      { x: 6, y: 6, h: 2 },
    ],
    cone: { x: 8, y: 3, dir: 'w', length: 3 },
    affected: ['bandit-1', 'bandit-2'],
  };
}

/**
 * Актёры на сетке: у кого есть клетка и кто не выбыл (ACTOR_REMOVED уводит из боя целиком — из порядка и с поля).
 * На нуле хитов актёр остаётся: токен гаснет, но из порядка не пропадает (HANDOFF §12).
 */
export function placedActors(state: State, field: Battlefield): { actor: State['actors'][string]; cell: Cell }[] {
  return Object.values(state.actors).flatMap(actor => {
    const cell = field.positions[actor.id];
    return cell && !actor.removed ? [{ actor, cell }] : [];
  });
}
