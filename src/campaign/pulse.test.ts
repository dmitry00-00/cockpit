// «Пульс мира» (Q8): проекция календаря, отношений, цен и встреч; ждущее — рядом с нынешним, мир не меняется.
import { describe, expect, it } from 'vitest';
import { pulseOf } from './pulse';
import { secOf } from './calendar';
import { seedEngine, seedState } from './seed';
import { FACTION, LOCATION } from './world';

const fixed = () => {
  let t = 1000;
  let n = 0;
  return { clock: { now: () => t++ }, ids: { next: () => `e${++n}` } };
};

describe('pulseOf', () => {
  it('календарь от 15 Mirtul 1492 на 30 дней: полнолуние через 3 дня (как в полосе часов), новолуние, остывание нитей по порядку', () => {
    const p = pulseOf(seedState());
    expect(p.events.map(e => [e.days, e.label])).toEqual([
      [3, 'Полнолуние Selûne'],
      [11, 'Old Owl Well: след остынет'],
      [18, 'Новолуние Selûne'],
      [19, 'Луна и стая: след остынет'],
      [20, 'The Missing Caravan: след остынет'],
    ]);
  });

  it('праздник, смена сезона и святой день бога партии (Lathander — Midsummer) попадают в окно', () => {
    const seed = seedState();
    const state = { ...seed, time: { ...seed.time, sec: secOf({ year: 1492, month: 'Flamerule', day: 25, hour: 8 }) } };
    const labels = pulseOf(state).events.map(e => `${e.days} ${e.kind} ${e.label}`);
    expect(labels).toContain('6 festival Midsummer');
    expect(labels).toContain('6 holy Святой день: Lathander');
  });

  it('отношения — рёбрами пар; цены — индекс 100 + надбавка места + товара; ждущее предложение — рядом, а не вместо', () => {
    const store = seedEngine(fixed());
    const p = pulseOf(store.getState().state);
    expect(p.edges).toContainEqual({ a: FACTION.harpers, b: FACTION.lordsAlliance, value: 2 });
    expect(p.edges).toContainEqual({ a: FACTION.harpers, b: FACTION.zhentarim, value: -2 });
    // Neverwinter: надбавка места +10 — индекс 110 у всех товаров; цены на оружие ждут решения (+10) — 120 рядом.
    const nw = p.prices.find(r => r.id === LOCATION.neverwinter)!;
    expect(nw.all).toEqual({ index: 110 });
    expect(nw.goods.weapons).toEqual({ index: 110, pending: 120 });
    expect(nw.goods.food).toEqual({ index: 110 });
    // Ликантропы ждут решения: ×1 сейчас, ×2 рядом.
    expect(p.encounters).toEqual([{ id: LOCATION.neverwinterWood, name: 'Neverwinter Wood', entries: [{ key: 'Werewolf', weight: 1, pending: 2 }] }]);
    expect(p.gods).toEqual([{ id: 'lathander', name: 'Lathander', worshippers: ['Brother Aldric'] }]);

    // Принято — нынешнее значение, ждущего нет.
    store.getState().accept('d-iron-prices');
    store.getState().accept('d-lycanthropes');
    const after = pulseOf(store.getState().state);
    expect(after.prices.find(r => r.id === LOCATION.neverwinter)!.goods.weapons).toEqual({ index: 120 });
    expect(after.encounters[0].entries).toEqual([{ key: 'Werewolf', weight: 2 }]);
  });
});
