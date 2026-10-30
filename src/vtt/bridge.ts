// Мост к MapTool (Q17): что стол отдаёт виртуальному столу и что берёт у него. Чистые функции — без сети и React;
// сеть — в relay.ts (сервер стола) и pages/desk/useMapToolBridge.ts (страница).
//
// Направления два, и у каждого своя правда. Клетка токена — правда MapTool: ход там становится TOKEN_MOVED
// (решение владельца 29.10.2026). Хиты и состояния — правда стола: лог событий; MapTool только рисует их на токене.
// Токен с актёром связывает имя: id актёра, имя целиком или одно слово имени («Aldric» — Brother Aldric), если это
// слово только у одного актёра, — без учёта регистра. Сопоставляет
// стол, а не аддон: MTScript получает готовый список по id токенов и только раскладывает его.
import type { Actor, State } from '../engine/state';
import type { GridCell } from '../engine/events';
import { CONDITION_IDS } from '../rules/srd/conditions';
import type { VttToken, VttTokenView } from './relay';

export type { VttToken, VttTokenView };


const norm = (s: string) => s.trim().toLowerCase();

/** Актёр по имени токена: id, имя или слово имени; два кандидата по слову («Bandit») — не угадываем. */
export function actorForToken(actors: State['actors'], tokenName: string): Actor | undefined {
  const n = norm(tokenName);
  if (!n) return undefined;
  const live = Object.values(actors).filter(a => !a.removed);
  const exact = live.find(a => norm(a.id) === n || norm(a.name) === n);
  if (exact) return exact;
  const byWord = live.filter(a => norm(a.name).split(/\s+/).includes(n));
  return byWord.length === 1 ? byWord[0] : undefined;
}

/** Ход, который стол должен записать: актёр, откуда (по словам MapTool) и куда. */
export interface TokenMove { actorId: string; from?: GridCell; to: GridCell }

/**
 * Ходы из снимка MapTool. Токен, что не двигался в MapTool с прошлого снимка, хода не даёт — даже если стол
 * думает иначе: отменённый на столе ход не возвращается следующим опросом. Первый снимок (prev нет) выравнивает
 * стол по MapTool — клетка правда MapTool. Токен без актёра и актёр уже на этой клетке (своей или сида) — пропуск; второй токен
 * того же актёра — тоже: ход один.
 */
export function movesFromSnapshot(
  state: State,
  prev: readonly VttToken[] | undefined,
  next: readonly VttToken[],
  /** Клетки расстановки сида: актёр без своей клетки стоит там (campaign/battlefield.ts placedActors). */
  seeded: Readonly<Record<string, GridCell>> = {},
): TokenMove[] {
  const before = new Map((prev ?? []).map(t => [t.id, t]));
  const out: TokenMove[] = [];
  const seen = new Set<string>();
  for (const t of next) {
    if (!Number.isInteger(t.x) || !Number.isInteger(t.y)) continue;
    const was = before.get(t.id);
    if (prev && was && was.x === t.x && was.y === t.y) continue;
    const actor = actorForToken(state.actors, t.name);
    if (!actor || seen.has(actor.id)) continue;
    seen.add(actor.id);
    const at = actor.cell ?? seeded[actor.id];
    if (at && at.x === t.x && at.y === t.y) continue;
    out.push({ actorId: actor.id, ...(was ? { from: { x: was.x, y: was.y } } : {}), to: { x: t.x, y: t.y } });
  }
  return out;
}

const stateName = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

/**
 * Состояния MapTool, которыми управляет стол: состояния SRD и два для нуля хитов. Включённые — у токена, остальные
 * аддон гасит; каких нет в кампании MapTool (в стандартной — Dead, Disabled, Hidden, Incapacitated, Prone и другие),
 * аддон пропускает.
 */
export const MANAGED_STATES: readonly string[] = [...CONDITION_IDS.map(stateName), 'Dead', 'Incapacitated'].filter((v, i, a) => a.indexOf(v) === i);

/** Состояние стола → имя состояния MapTool: «prone» → «Prone». Ноль хитов у монстра — «Dead», у героя — «Incapacitated». */
function statesOf(a: Actor): string[] {
  const out = Object.keys(a.conditions).map(stateName);
  if (a.hp.current <= 0) out.push(a.kind === 'monster' ? 'Dead' : 'Incapacitated');
  return [...new Set(out)];
}

/** Что отдать MapTool: по токену на каждый, у кого нашёлся актёр. Токен без актёра MapTool не трогает. */
export function vttView(state: State, tokens: readonly VttToken[]): VttTokenView[] {
  return tokens.flatMap(t => {
    const a = actorForToken(state.actors, t.name);
    return a ? [{ tokenId: t.id, hp: { current: a.hp.current, max: a.hp.max, temp: a.hp.temp }, states: statesOf(a) }] : [];
  });
}
