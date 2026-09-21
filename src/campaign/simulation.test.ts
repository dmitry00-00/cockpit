// Симуляция шага 8: детерминированные предложения по состоянию и отрезку времени; сама мир не трогает,
// принятие с патчем меняет числа через редьюсер и откатывается точно. Календарь: фаза суток, сезон, Selûne.
import { describe, expect, it } from 'vitest';
import { createEngineStore, journalEntries, cascadeOf } from '../engine';
import { SECONDS_PER_DAY } from '../engine/state';
import { TEMPO_SECONDS } from '../engine/events';
import { dayPhase, fullMoonsBetween, inDays, moonState, seasonOf, secOf } from './calendar';
import { NEAR_SCALES, THREAD_COLD_DAYS, placeChain, simulate, stepTime, tendaysCrossed } from './simulation';
import { SEED_SEC, seedEngine, seedState } from './seed';
import { FACTION, LOCATION, THREAD } from './world';

const fixed = () => {
  let t = 1000;
  let n = 0;
  return { clock: { now: () => t++ }, ids: { next: () => `e${++n}` } };
};

describe('календарь: фаза суток, сезон, Selûne', () => {
  it('утро 5–11, день 11–17, вечер 17–21, ночь — остальное', () => {
    const at = (hour: number) => secOf({ year: 1492, month: 'Mirtul', day: 15, hour });
    expect(dayPhase(at(8))).toBe('morning');
    expect(dayPhase(at(12))).toBe('day');
    expect(dayPhase(at(18))).toBe('evening');
    expect(dayPhase(at(23))).toBe('night');
    expect(dayPhase(at(3))).toBe('night');
  });
  it('§13: 15 Mirtul — Selûne растёт, полнолуние через 3 дня; 18 Mirtul — полная; через две недели — новая', () => {
    expect(moonState(SEED_SEC)).toMatchObject({ phase: 'waxing', daysToFull: 3 });
    expect(moonState(SEED_SEC + 3 * SECONDS_PER_DAY).phase).toBe('full');
    expect(moonState(SEED_SEC + 10 * SECONDS_PER_DAY).phase).toBe('waning');
    expect(moonState(SEED_SEC + 18 * SECONDS_PER_DAY).phase).toBe('new');
    expect(fullMoonsBetween(SEED_SEC, SEED_SEC + TEMPO_SECONDS.tenday)).toHaveLength(1);
    expect(fullMoonsBetween(SEED_SEC, SEED_SEC + TEMPO_SECONDS.day)).toHaveLength(0);
    expect(fullMoonsBetween(SEED_SEC, SEED_SEC + TEMPO_SECONDS.season)).toHaveLength(3);
  });
  it('сезон: Mirtul — весна, Flamerule — лето; сезонный шаг от 15 Mirtul даёт лето', () => {
    expect(seasonOf(SEED_SEC)).toBe('spring');
    expect(seasonOf(SEED_SEC + TEMPO_SECONDS.season)).toBe('summer');
    expect(seasonOf(secOf({ year: 1492, month: 'Hammer', day: 1 }))).toBe('winter');
    expect(seasonOf(secOf({ year: 1492, festival: 'Highharvestide' }))).toBe('summer');
  });
  it('inDays: сегодня, завтра, через N с правильной формой', () => {
    expect(inDays(0)).toBe('сегодня');
    expect(inDays(1)).toBe('завтра');
    expect(inDays(3)).toBe('через 3 дня');
    expect(inDays(5)).toBe('через 5 дней');
    expect(inDays(21)).toBe('через 21 день');
  });
});

describe('simulate — правила', () => {
  it('день от сида: ничего не предлагает (десятидневка не пересечена, полнолуния нет, сезон тот же, нити тёплые)', () => {
    const state = seedEngine(fixed()).getState().state;
    expect(simulate({ state, fromSec: SEED_SEC, toSec: SEED_SEC + TEMPO_SECONDS.day, timeEventId: 't1' })).toEqual([]);
  });

  it('десятидневка от сида: тренд Zhentarim (континент, патч), цены Neverwinter (поселение, патч, причина — нить каравана); ликантропы уже ждут решения — не дублируются', () => {
    const state = seedEngine(fixed()).getState().state;
    const out = simulate({ state, fromSec: SEED_SEC, toSec: SEED_SEC + TEMPO_SECONDS.tenday, timeEventId: 't1' });
    expect(out.map(d => d.subject)).toEqual(['Zhentarim · влияние', 'Цены · Neverwinter']);
    expect(out[0]).toMatchObject({ id: 'sim-t1-trend-fac-zhentarim', scale: 'continent', was: '45%', now: '46%', causeId: 't1', patch: { kind: 'faction', id: FACTION.zhentarim, field: 'influencePercent', value: 46 } });
    expect(out[1]).toMatchObject({ scale: 'settlement', was: '+10%', now: '+15%', causeId: THREAD.missingCaravan, threadIds: [THREAD.missingCaravan], patch: { kind: 'location', id: LOCATION.neverwinter, field: 'pricePercent', value: 15 } });
    // Те же входы — те же id: реплей не плодит дублей.
    expect(simulate({ state, fromSec: SEED_SEC, toSec: SEED_SEC + TEMPO_SECONDS.tenday, timeEventId: 't1' })).toEqual(out);
  });

  it('полнолуние за отрезок без ждущего предложения — ликантропы ×2 с причиной «Луна и стая»; сезонный шаг — сезон на Toril', () => {
    const state = seedState();
    const out = simulate({ state, fromSec: SEED_SEC, toSec: SEED_SEC + TEMPO_SECONDS.season, timeEventId: 't2' });
    const moon = out.find(d => d.id === 'sim-t2-moon-lycanthropes');
    expect(moon).toMatchObject({ scale: 'region', now: '×2 на 3 ночи', causeId: THREAD.moonAndPack, threadIds: [THREAD.moonAndPack] });
    expect(moon?.patch).toBeUndefined();
    expect(out.find(d => d.id === 'sim-t2-season-summer')).toMatchObject({ scale: 'planet', subject: 'Сезон · Toril', was: 'весна', now: 'лето', causeId: 't2' });
  });

  it('нить остывает: предложение закрыть появляется на том шаге, где пройден порог, и только раз; закрытая нить не предлагается', () => {
    const state = seedState();
    const idle = THREAD.oldOwlWell; // без внимания 9 дней на момент сида
    const toCold = SEED_SEC + (THREAD_COLD_DAYS - 9) * SECONDS_PER_DAY;
    expect(simulate({ state, fromSec: SEED_SEC, toSec: toCold - SECONDS_PER_DAY, timeEventId: 't' }).some(d => d.id.includes('cold'))).toBe(false);
    const out = simulate({ state, fromSec: SEED_SEC, toSec: toCold, timeEventId: 't' });
    expect(out.find(d => d.id === `sim-t-cold-${idle}`)).toMatchObject({ scale: 'region', was: 'открыта', now: 'закрыта: след остыл', causeId: idle, patch: { kind: 'thread', id: idle, status: 'closed' } });
    expect(simulate({ state, fromSec: toCold, toSec: toCold + SECONDS_PER_DAY, timeEventId: 't3' }).some(d => d.id.includes('cold'))).toBe(false);
  });

  it('tendaysCrossed и placeChain', () => {
    expect(tendaysCrossed(SEED_SEC, SEED_SEC + TEMPO_SECONDS.tenday)).toBe(1);
    expect(tendaysCrossed(SEED_SEC, SEED_SEC + TEMPO_SECONDS.day)).toBe(0);
    expect(tendaysCrossed(SEED_SEC, SEED_SEC + TEMPO_SECONDS.season)).toBe(9);
    expect(placeChain(seedState())).toEqual({ settlement: 'Neverwinter', region: 'Sword Coast North', continent: 'Faerûn', planet: 'Toril', system: 'Realmspace', plane: 'Материальный', cosmology: 'Великое Колесо' });
    expect(NEAR_SCALES).toEqual(['region', 'settlement', 'building', 'battle']);
  });
});

describe('stepTime и патч мира', () => {
  it('шаг десятидневки: TIME_ADVANCED, два предложения в логе; принятие цен меняет pricePercent, Ctrl+Z возвращает 10 и предложение во входящие', () => {
    const store = seedEngine(fixed());
    const api = store.getState();
    const { event, proposals } = stepTime(api, 'tenday');
    expect(event.type).toBe('TIME_ADVANCED');
    expect(proposals.map(d => d.subject)).toEqual(['Zhentarim · влияние', 'Цены · Neverwinter']);
    const s1 = store.getState();
    expect(s1.state.time.sec).toBe(SEED_SEC + TEMPO_SECONDS.tenday);
    expect(s1.events.slice(-2).map(e => e.type)).toEqual(['WORLD_DELTA_PROPOSED', 'WORLD_DELTA_PROPOSED']);
    expect(s1.state.world.locations[LOCATION.neverwinter].pricePercent).toBe(10);

    const prices = proposals[1];
    s1.accept(prices.id);
    let s = store.getState();
    expect(s.state.world.locations[LOCATION.neverwinter].pricePercent).toBe(15);
    expect(s.state.deltas[prices.id].status).toBe('accepted');
    expect(s.events.at(-1)?.effect).toMatchObject({ kind: 'delta', before: { world: { kind: 'location', field: 'pricePercent', value: 10 } }, after: { world: { value: 15 } } });
    // Каскад: нить каравана → предложение.
    const entries = journalEntries(s.events, s.state);
    expect(cascadeOf(entries.at(-1)!, entries, s.state).map(c => c.kind)).toEqual(['thread', 'delta']);

    s.undo();
    s = store.getState();
    expect(s.state.world.locations[LOCATION.neverwinter].pricePercent).toBe(10);
    expect(s.state.deltas[prices.id].status).toBe('pending');
    expect(s.toast).toBe('Отменено: Принято: Цены · Neverwinter — +10% → +15%');
    s.redo();
    expect(store.getState().state.world.locations[LOCATION.neverwinter].pricePercent).toBe(15);
  });

  it('патч фракции и нити; патч на несуществующее — ошибка до записи; реплей лога даёт то же состояние', () => {
    const store = seedEngine(fixed());
    const api = store.getState();
    const { proposals } = stepTime(api, 'tenday');
    api.accept(proposals[0].id);
    expect(store.getState().state.world.factions[FACTION.zhentarim].influencePercent).toBe(46);
    store.getState().propose({ id: 'x', scale: 'region', subject: 'Нить', was: 'a', now: 'b', cause: 'c', causeId: THREAD.oldOwlWell, status: 'pending', patch: { kind: 'thread', id: THREAD.oldOwlWell, status: 'closed' } });
    store.getState().accept('x');
    expect(store.getState().state.world.threads[THREAD.oldOwlWell].status).toBe('closed');
    store.getState().propose({ id: 'bad', scale: 'region', subject: 'Нет такого', was: 'a', now: 'b', cause: 'c', causeId: 't', status: 'pending', patch: { kind: 'faction', id: 'nope', field: 'renown', value: 1 } });
    expect(() => store.getState().accept('bad')).toThrow(/несуществующее/);
    expect(store.getState().state.deltas.bad.status).toBe('pending');

    const replay = createEngineStore(seedState(), { persist: { load: () => JSON.parse(JSON.stringify(store.getState().events)), save: () => {}, clear: () => {} }, ...fixed() });
    expect(replay.getState().state).toEqual(store.getState().state);
  });
});
