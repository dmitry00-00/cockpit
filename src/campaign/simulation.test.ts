// Симуляция шага 8: детерминированные предложения по состоянию и отрезку времени; сама мир не трогает,
// принятие с патчем меняет числа через редьюсер и откатывается точно. Календарь: фаза суток, сезон, Selûne.
import { describe, expect, it } from 'vitest';
import { createEngineStore, journalEntries, cascadeOf } from '../engine';
import { SECONDS_PER_DAY, type WorldPatch } from '../engine/state';
import { TEMPO_SECONDS } from '../engine/events';
import { dayPhase, fullMoonsBetween, inDays, moonState, seasonOf, secOf } from './calendar';
import { NEAR_SCALES, THREAD_TICK_DAYS, placeChain, simulate, stepTime, tendaysCrossed } from './simulation';
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

  it('десятидневка от сида: тренд Zhentarim (континент, патч), цены Neverwinter (поселение, патч, причина — нить каравана), растущая Zhentarim обостряет вражду (Q7); ликантропы уже ждут решения — не дублируются', () => {
    const state = seedEngine(fixed()).getState().state;
    const out = simulate({ state, fromSec: SEED_SEC, toSec: SEED_SEC + TEMPO_SECONDS.tenday, timeEventId: 't1' });
    expect(out.map(d => d.subject)).toEqual(['Zhentarim · влияние', 'Цены · Neverwinter', "Lords' Alliance и Zhentarim · отношения", 'Harpers и Zhentarim · отношения']);
    expect(out[3]).toMatchObject({ scale: 'continent', was: '−2', now: '−3', causeId: 't1', patch: { kind: 'relation', id: FACTION.harpers, other: FACTION.zhentarim, value: -3 } });
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
    expect(moon?.patch).toEqual({ kind: 'encounter', id: LOCATION.neverwinterWood, key: 'Werewolf', value: 2 });
    expect(out.find(d => d.id === 'sim-t2-season-summer')).toMatchObject({ scale: 'planet', subject: 'Сезон · Toril', was: 'весна', now: 'лето', causeId: 't2' });
  });

  it('настроенные часы нити получают предложение за десять дней без внимания; заполнение не закрывает нить автоматически', () => {
    const state = seedState();
    const idle = THREAD.oldOwlWell;
    state.world.threads[idle].clock = { segments: 2, filled: 1, startedSec: SEED_SEC };
    const due = SEED_SEC + THREAD_TICK_DAYS * SECONDS_PER_DAY;
    expect(simulate({ state, fromSec: SEED_SEC, toSec: due - 1, timeEventId: 't' }).some(d => d.id.includes('thread-clock'))).toBe(false);
    const delta = simulate({ state, fromSec: SEED_SEC, toSec: due, timeEventId: 't' }).find(d => d.id === `sim-t-thread-clock-${idle}`);
    expect(delta).toMatchObject({ scale: 'region', was: '1/2', now: '2/2', causeId: idle, patch: { kind: 'threadClock', id: idle, clock: { segments: 2, filled: 2, startedSec: SEED_SEC } } });
    expect(state.world.threads[idle].status).toBe('open');
    const full = { ...state, world: { ...state.world, threads: { ...state.world.threads, [idle]: { ...state.world.threads[idle], clock: { segments: 2, filled: 2, startedSec: SEED_SEC } } } } };
    expect(simulate({ state: full, fromSec: due, toSec: due + THREAD_TICK_DAYS * SECONDS_PER_DAY, timeEventId: 't3' }).some(d => d.id.includes('thread-clock'))).toBe(false);
  });

  it('заметка о нити сбрасывает десятидневный интервал часов', () => {
    const state = seedState();
    const idle = THREAD.oldOwlWell;
    state.world.threads[idle].clock = { segments: 4, filled: 0, startedSec: SEED_SEC - THREAD_TICK_DAYS * SECONDS_PER_DAY };
    const store = createEngineStore(state, fixed());
    store.getState().dispatch({ type: 'NOTE_ADDED', payload: {
      text: 'Мастер обновил сведения о Old Owl Well', threadIds: [idle], scale: 'region',
    } });
    const originalDue = SEED_SEC + (THREAD_TICK_DAYS - 1) * SECONDS_PER_DAY;
    expect(store.getState().state.world.threads[idle].lastTouchedSec).toBe(SEED_SEC);
    expect(simulate({ state: store.getState().state, fromSec: SEED_SEC, toSec: originalDue, timeEventId: 'not-due-after-note' }).some(delta => delta.id === `sim-not-due-after-note-thread-clock-${idle}`)).toBe(false);
  });

  it('правила модели мира (Q7): каждое — с causeId и патчем, мир не трогают; цены еды — за сменой сезона и праздником', () => {
    const state = seedState();
    const frozen = JSON.stringify(state);
    const at = (input: Parameters<typeof secOf>[0]) => secOf(input);
    // Весна → лето: еда в поселениях дешевле на разницу целей сезона (+5 → 0).
    const summer = simulate({ state, fromSec: SEED_SEC, toSec: SEED_SEC + TEMPO_SECONDS.season, timeEventId: 'ts' });
    expect(summer.find(d => d.subject === 'Еда и ночлег · Neverwinter')).toMatchObject({
      was: '0%', now: '-5%', cause: 'лето: цена сезона', causeId: 'ts', patch: { kind: 'price', id: LOCATION.neverwinter, goods: 'food', value: -5 },
    });
    // День праздника — толпы +10, следующий день — обратно.
    const eve = at({ year: 1492, month: 'Flamerule', day: 30, hour: 12 });
    const midsummer = simulate({ state, fromSec: eve, toSec: eve + SECONDS_PER_DAY, timeEventId: 'tf' });
    expect(midsummer.find(d => d.subject === 'Еда и ночлег · Neverwinter')).toMatchObject({ now: '+10%', cause: 'Midsummer: толпы', patch: { goods: 'food', value: 10 } });
    // 1492 — год Shieldmeet: за Midsummer ещё один праздник, толпы остаются; прошёл он — цена обратно.
    const shieldmeet = simulate({ state, fromSec: eve + SECONDS_PER_DAY, toSec: eve + 2 * SECONDS_PER_DAY, timeEventId: 'ts' });
    expect(shieldmeet.find(d => d.subject === 'Еда и ночлег · Neverwinter')).toBeUndefined();
    const after = simulate({ state, fromSec: eve + 2 * SECONDS_PER_DAY, toSec: eve + 3 * SECONDS_PER_DAY, timeEventId: 'ta' });
    expect(after.find(d => d.subject === 'Еда и ночлег · Neverwinter')).toMatchObject({ now: '-10%', cause: 'праздник прошёл' });
    // Каждое предложение — с причиной; кроме текстовой смены сезона и службы святого дня, у каждого патч.
    for (const d of [...summer, ...midsummer, ...after]) {
      expect(d.causeId, d.subject).toBeTruthy();
      if (!d.subject.startsWith('Сезон') && !d.subject.startsWith('Святой день')) expect(d.patch, d.subject).toBeDefined();
    }
    expect(JSON.stringify(state)).toBe(frozen);
  });

  it('луна (Q7): принятый ×2 после трёх ночей — предложение вернуть ×1; партия известна обеим фракциям — отношение ближе', () => {
    const store = seedEngine(fixed());
    store.getState().accept('d-lycanthropes');
    const state = store.getState().state;
    const full = SEED_SEC + 3 * SECONDS_PER_DAY; // 18 Mirtul — полнолуние
    expect(simulate({ state, fromSec: full, toSec: full + SECONDS_PER_DAY, timeEventId: 'm1' }).some(d => d.id.includes('moon-over'))).toBe(false);
    expect(simulate({ state, fromSec: full + 3 * SECONDS_PER_DAY, toSec: full + 4 * SECONDS_PER_DAY, timeEventId: 'm2' }).find(d => d.id.includes('moon-over'))).toMatchObject({
      was: '×2', now: '×1', causeId: THREAD.moonAndPack, patch: { kind: 'encounter', id: LOCATION.neverwinterWood, key: 'Werewolf', value: 1 },
    });

    // Партия: у Church of Helm известность 5 — с Harpers (5) и Lords' Alliance (12) отношение 0 → +1 за десятидневку;
    // Harpers и Lords' Alliance уже союзники (+2) — не трогаются.
    const seed = seedState();
    const known = { ...seed, world: { ...seed.world, factions: { ...seed.world.factions, [FACTION.churchOfHelm]: { ...seed.world.factions[FACTION.churchOfHelm], renown: 5 } } } };
    const bridges = simulate({ state: known, fromSec: SEED_SEC, toSec: SEED_SEC + TEMPO_SECONDS.tenday, timeEventId: 'tb' }).filter(d => d.id.includes('bridge'));
    expect(bridges.map(d => d.subject)).toEqual(["Church of Helm и Lords' Alliance · отношения", 'Church of Helm и Harpers · отношения']);
    expect(bridges[1]).toMatchObject({ was: '0', now: '+1', patch: { kind: 'relation', id: FACTION.churchOfHelm, other: FACTION.harpers, value: 1 } });
    expect(simulate({ state: seed, fromSec: SEED_SEC, toSec: SEED_SEC + TEMPO_SECONDS.tenday, timeEventId: 'tb' }).some(d => d.id.includes('bridge'))).toBe(false);
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
  it('шаг десятидневки: TIME_ADVANCED, четыре предложения в логе; принятие цен меняет pricePercent, Ctrl+Z возвращает 10 и предложение во входящие', () => {
    const store = seedEngine(fixed());
    const api = store.getState();
    const { event, proposals } = stepTime(api, 'tenday');
    expect(event.type).toBe('TIME_ADVANCED');
    expect(proposals.map(d => d.subject)).toEqual(['Zhentarim · влияние', 'Цены · Neverwinter', "Lords' Alliance и Zhentarim · отношения", 'Harpers и Zhentarim · отношения']);
    const s1 = store.getState();
    expect(s1.state.time.sec).toBe(SEED_SEC + TEMPO_SECONDS.tenday);
    expect(s1.events.slice(-4).map(e => e.type)).toEqual(Array(4).fill('WORLD_DELTA_PROPOSED'));
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

  it('модель мира (3.3): отношение — обе стороны, цена товара, вес встречи, новое место; Ctrl+Z возвращает; плохие числа — ошибка до записи', () => {
    const store = seedEngine(fixed());
    const api = () => store.getState();
    const world = () => api().state.world;
    const base = { scale: 'region' as const, subject: 'x', was: 'a', now: 'b', cause: 'c', causeId: THREAD.missingCaravan, status: 'pending' as const };
    const take = (id: string, patch: WorldPatch) => {
      api().propose({ ...base, id, patch });
      api().accept(id);
    };

    // Сид: Harpers и Zhentarim — враги (−2) с обеих сторон; принятие −3 меняет обе, откат возвращает обе.
    expect(world().factions[FACTION.zhentarim].relations?.[FACTION.harpers]).toBe(-2);
    take('rel', { kind: 'relation', id: FACTION.harpers, other: FACTION.zhentarim, value: -3 });
    expect(world().factions[FACTION.zhentarim].relations?.[FACTION.harpers]).toBe(-3);
    expect(world().factions[FACTION.harpers].relations?.[FACTION.zhentarim]).toBe(-3);
    api().undo();
    expect(world().factions[FACTION.harpers].relations?.[FACTION.zhentarim]).toBe(-2);
    expect(world().factions[FACTION.zhentarim].relations?.[FACTION.harpers]).toBe(-2);

    // Цены на оружие в Neverwinter — предложение сида: «базовые» → +10%.
    expect(world().locations[LOCATION.neverwinter].prices?.weapons).toBeUndefined();
    api().accept('d-iron-prices');
    expect(world().locations[LOCATION.neverwinter].prices).toEqual({ weapons: 10 });
    api().undo();
    expect(world().locations[LOCATION.neverwinter].prices?.weapons).toBeUndefined();

    // Ликантропы в Neverwinter Wood: ×1 → ×2.
    api().accept('d-lycanthropes');
    expect(world().locations[LOCATION.neverwinterWood].encounters).toEqual({ Werewolf: 2 });
    api().undo();
    expect(world().locations[LOCATION.neverwinterWood].encounters?.Werewolf).toBeUndefined();

    // Новое место (M8): появляется после принятия, Ctrl+Z убирает.
    take('new', { kind: 'newLocation', location: { id: 'loc-new', name: 'Helm\'s Hold', scale: 'settlement', parentId: LOCATION.swordCoastNorth, geo: { map: 'toril', x: 8600, y: 2560 } } });
    expect(world().locations['loc-new']).toMatchObject({ name: 'Helm\'s Hold', parentId: LOCATION.swordCoastNorth });
    api().undo();
    expect(world().locations['loc-new']).toBeUndefined();

    const bad = (id: string, patch: WorldPatch, msg: RegExp) => {
      api().propose({ ...base, id, patch });
      expect(() => api().accept(id)).toThrow(msg);
      expect(api().state.deltas[id].status).toBe('pending');
    };
    bad('b1', { kind: 'relation', id: FACTION.harpers, other: FACTION.zhentarim, value: 4 }, /от −3 до \+3/);
    bad('b2', { kind: 'relation', id: FACTION.harpers, other: FACTION.harpers, value: 1 }, /к самой себе/);
    bad('b3', { kind: 'price', id: LOCATION.neverwinter, goods: 'slaves' as never, value: 5 }, /нет такого товара/);
    bad('b4', { kind: 'encounter', id: LOCATION.neverwinterWood, key: 'Werewolf', value: -1 }, /не меньше нуля/);
    bad('b5', { kind: 'newLocation', location: { id: LOCATION.neverwinter, name: 'Neverwinter', scale: 'settlement' } }, /уже есть/);
    bad('b6', { kind: 'removeLocation', id: LOCATION.swordCoastNorth }, /есть другие места/);

    const replay = createEngineStore(seedState(), { persist: { load: () => JSON.parse(JSON.stringify(store.getState().events)), save: () => {}, clear: () => {} }, ...fixed() });
    expect(replay.getState().state).toEqual(store.getState().state);
  });
});
