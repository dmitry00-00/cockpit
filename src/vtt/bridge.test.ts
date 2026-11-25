import { describe, expect, it } from 'vitest';
import { seedState } from '../campaign';
import { apply } from '../engine/reduce';
import { MANAGED_STATES, actorForToken, movesFromSnapshot, vttView, type VttToken } from './bridge';
import { MAPTOOL_STALE_MS, VttRelay } from './relay';

const tok = (id: string, name: string, x: number, y: number): VttToken => ({ id, name, x, y });

describe('мост к MapTool — сопоставление и ходы', () => {
  it('токен находит актёра по id, имени целиком или слову имени; два кандидата по слову — никого', () => {
    const s = seedState();
    expect(actorForToken(s.actors, 'korrin')?.id).toBe('korrin');
    expect(actorForToken(s.actors, '  KORRIN ')?.id).toBe('korrin');
    expect(actorForToken(s.actors, s.actors.captain.name)?.id).toBe('captain');
    expect(actorForToken(s.actors, 'bandit-2')?.id).toBe('bandit-2');
    expect(actorForToken(s.actors, 'Aldric')?.id).toBe('aldric');
    expect(actorForToken(s.actors, 'Captain')?.id).toBe('captain');
    // Bandit 1/2/3 и Bandit Captain — по слову «Bandit» не угадываем.
    expect(actorForToken(s.actors, 'Bandit')).toBeUndefined();
    expect(actorForToken(s.actors, 'Strahd')).toBeUndefined();
  });

  it('первый снимок выравнивает клетки, дальше — только сдвинутые в MapTool; «откуда» — из прошлого снимка', () => {
    const s = seedState();
    const first = [tok('t1', 'Korrin', 2, 2), tok('t2', 'Bo', 7, 7), tok('t9', 'Сундук', 1, 1)];
    expect(movesFromSnapshot(s, undefined, first)).toEqual([
      { actorId: 'korrin', to: { x: 2, y: 2 } },
      { actorId: 'bo', to: { x: 7, y: 7 } },
    ]);
    // Актёр на клетке сида — выравнивать нечего.
    expect(movesFromSnapshot(s, undefined, first, { korrin: { x: 2, y: 2 } }).map(m => m.actorId)).toEqual(['bo']);
    const next = [tok('t1', 'Korrin', 4, 3), tok('t2', 'Bo', 7, 7)];
    expect(movesFromSnapshot(s, first, next)).toEqual([{ actorId: 'korrin', from: { x: 2, y: 2 }, to: { x: 4, y: 3 } }]);
  });

  it('отменённый на столе ход не возвращается: токен в MapTool не двигался — хода нет', () => {
    const s = seedState();
    const snap = [tok('t1', 'Korrin', 4, 3)];
    // Стол думает, что Korrin на (2, 2) — после отмены; MapTool всё ещё показывает (4, 3), но снимок тот же.
    const moved = apply(s, { id: 'e', seq: 0, at: 0, worldSec: 0, type: 'TOKEN_MOVED', payload: { actorId: 'korrin', to: { x: 2, y: 2 }, source: 'dm' } });
    expect(movesFromSnapshot(moved.state, snap, snap)).toEqual([]);
  });

  it('вид для MapTool: хиты и состояния по id токена; ноль хитов — Dead у монстра; токен без актёра не трогается', () => {
    const s = seedState();
    s.actors['bandit-3'].hp.current = 0;
    const view = vttView(s, [tok('t1', 'Korrin', 0, 0), tok('t3', 'bandit-3', 1, 1), tok('t9', 'Сундук', 2, 2)]);
    expect(view.map(v => v.tokenId)).toEqual(['t1', 't3']);
    expect(view[0].hp).toEqual(s.actors.korrin.hp);
    expect(view[1].states).toContain('Dead');
    expect(MANAGED_STATES).toEqual(expect.arrayContaining(['Prone', 'Blinded', 'Dead', 'Incapacitated']));
  });
});

describe('мост к MapTool — ретранслятор', () => {
  it('снимок MapTool: seq растёт только на перемене; связь стареет; вид стола получает новый номер только на перемене', () => {
    const r = new VttRelay(1000);
    expect(r.deskPoll(1000)).toEqual({ seq: 0, tokens: null, map: null, seenMsAgo: null });
    const body = { map: 'Gnoll Den', tokens: [tok('t1', 'Korrin', 2, 2)] };
    const v0 = r.maptoolSync(body, 2000);
    expect(r.deskPoll(2500)).toMatchObject({ seq: 1, map: 'Gnoll Den', seenMsAgo: 500 });
    r.maptoolSync(body, 3000);
    expect(r.deskPoll(3000).seq).toBe(1);
    expect(r.deskPoll(3000 + MAPTOOL_STALE_MS + 1).seenMsAgo).toBeGreaterThan(MAPTOOL_STALE_MS);
    const view = { tokens: [{ tokenId: 't1', hp: { current: 40, max: 49, temp: 0 }, states: ['Prone'] }], managed: ['Prone'] };
    const v1 = r.deskView(view);
    expect(v1.rev).not.toBe(v0.rev);
    expect(r.deskView(view).rev).toBe(v1.rev);
    expect(r.maptoolSync(body, 4000)).toEqual(v1);
    // Другой запуск сервера — другой номер даже у первой правки.
    expect(new VttRelay(5000).deskView(view).rev).not.toBe(v1.rev);
  });

  it('мусор в теле — ошибка с причиной, снимок не трогается', () => {
    const r = new VttRelay(0);
    expect(() => r.maptoolSync({ tokens: [{ id: 't', name: 'x', x: 1.5, y: 0 }] }, 1)).toThrow(/tokens/);
    expect(() => r.maptoolSync(null, 1)).toThrow();
    expect(() => r.deskView({ tokens: 'x' })).toThrow(/managed/);
    expect(r.deskPoll(1).seq).toBe(0);
  });

  it('отвергает неоднозначные снимки и неверную форму вида, не меняя последнее состояние', () => {
    const r = new VttRelay(10);
    const snapshot = { map: 'Crypt', tokens: [tok('t1', 'Korrin', 2, 2)] };
    const initialView = { tokens: [{ tokenId: 't1', hp: { current: 8, max: 8, temp: 0 }, states: ['Prone'] }], managed: ['Prone'] };
    const acceptedView = r.deskView(initialView);
    r.maptoolSync(snapshot, 20);

    expect(() => r.maptoolSync({ tokens: [tok('t1', 'Korrin', 3, 2), tok('t1', 'Bo', 4, 2)] }, 30)).toThrow(/id токенов MapTool/);
    expect(() => r.deskView({ ...initialView, tokens: [{ ...initialView.tokens[0], hp: { current: -1, max: 8, temp: 0 } }] })).toThrow(/ожидалось/);
    expect(() => r.deskView({ ...initialView, tokens: [{ ...initialView.tokens[0], states: ['Poisoned'] }] })).toThrow(/входить в managed/);

    expect(r.deskPoll(30)).toMatchObject({ seq: 1, map: 'Crypt', tokens: snapshot.tokens });
    expect(r.maptoolSync(snapshot, 30).rev).toBe(acceptedView.rev);
  });
});
