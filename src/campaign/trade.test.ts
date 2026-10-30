// Торговля (С3): равновесие запаса из вывоза и ввоза, цена из запаса, притяжение формулой; патч запаса — нет поля до
// первой правки, откат возвращает место точно; товары держав и мест с диска (scripts/econ-from-wiki.py).
import { describe, expect, it } from 'vitest';
import { createEngineStore } from '../engine';
import { applyWorldPatch } from '../engine/reduce';
import { GOODS, SRD_GOODS, type WorldDelta } from '../engine/state';
import { GOODS_LABEL } from '../components/labels';
import { econOfPlace, loadEcon } from '../world/econ';
import { loadKingdoms } from '../world/kingdoms';
import { pricedGoods, priceRowOf } from './pulse';
import { equilibrium, equilibriumPoints, priceOfStock, pulledStock, TRADE_RULES } from './trade';
import { seedState } from './seed';
import { LOCATION } from './world';

const fixed = () => {
  let t = 1000;
  let n = 0;
  return { clock: { now: () => t++ }, ids: { next: () => `e${++n}` } };
};

describe('торговля: правила', () => {
  it('12 товаров: сначала разделы SRD, у каждого подпись', () => {
    expect(GOODS).toHaveLength(12);
    expect(GOODS.slice(0, 6)).toEqual([...SRD_GOODS]);
    for (const g of GOODS) expect(GOODS_LABEL[g]).toBeTruthy();
  });

  it('равновесие: вывоз 7, ввоз 3, и то и другое — 5; у города еда на очко ниже; еда — дни по сезону', () => {
    const e = { x: ['wine', 'food', 'metal'] as const, m: ['metal', 'cloth'] as const };
    expect(equilibriumPoints('wine', e)).toBe(7);
    expect(equilibriumPoints('cloth', e)).toBe(3);
    expect(equilibriumPoints('metal', e)).toBe(5);
    expect(equilibriumPoints('spices', {})).toBe(5);
    expect(equilibriumPoints('food', e, true)).toBe(6);
    expect(equilibrium('food', {}, 'summer')).toBe(60);
    expect(equilibrium('food', {}, 'winter')).toBe(40);
    expect(equilibrium('food', e, 'autumn')).toBe(126); // 90 × 7/5
    expect(equilibrium('wine', e, 'winter')).toBe(7);
  });

  it('цена из запаса: 0 → +75 %, 5 → 0, 10 → −75 %; еда — дни / 12; предел ±75', () => {
    expect([0, 3, 5, 7, 10].map(s => priceOfStock('cloth', s))).toEqual([75, 30, 0, -30, -75]);
    expect(priceOfStock('food', 60)).toBe(0);
    expect(priceOfStock('food', 0)).toBe(TRADE_RULES.priceCap);
    expect(priceOfStock('food', 300)).toBe(-TRADE_RULES.priceCap);
    // Зима без подвоза: равновесие 40 дней — еда дороже на 25 %, осенью при 90 — дешевле на 37 % (−37,5 округляется вверх).
    expect(priceOfStock('food', equilibrium('food', {}, 'winter'))).toBe(25);
    expect(priceOfStock('food', equilibrium('food', {}, 'autumn'))).toBe(-37);
  });

  it('притяжение: треть разрыва за десятидневку; шаг целиком — то же, что по десятидневкам', () => {
    expect(pulledStock(2, 5, 1)).toBeCloseTo(3);
    expect(pulledStock(2, 5, 0)).toBe(2);
    let s = 1;
    for (let i = 0; i < 6; i++) s = pulledStock(s, 7, 1);
    expect(pulledStock(1, 7, 6)).toBeCloseTo(s, 10);
  });
});

describe('торговля: запас места', () => {
  it('патч запаса: поле заводится первой правкой, null — снова равновесие; товар и диапазон проверяются', () => {
    const s = seedState();
    const nw = LOCATION.neverwinter;
    expect(s.world.locations[nw].stock).toBeUndefined();
    const a = applyWorldPatch(s, { kind: 'stock', id: nw, goods: 'cloth', value: 3 });
    expect(a.world.locations[nw].stock).toEqual({ cloth: 3 });
    const b = applyWorldPatch(a, { kind: 'stock', id: nw, goods: 'cloth', value: null });
    expect(b.world.locations[nw]).toEqual(s.world.locations[nw]);
    expect(applyWorldPatch(s, { kind: 'stock', id: nw, goods: 'food', value: 140 }).world.locations[nw].stock).toEqual({ food: 140 });
    expect(() => applyWorldPatch(s, { kind: 'stock', id: nw, goods: 'cloth', value: 11 })).toThrow(/запас/);
    expect(() => applyWorldPatch(s, { kind: 'stock', id: nw, goods: 'cloth', value: -1 })).toThrow(/запас/);
    expect(() => applyWorldPatch(s, { kind: 'stock', id: 'nope', goods: 'cloth', value: 1 })).toThrow(/несуществующее/);
  });

  it('принятие через лог и Ctrl+Z: запас и цена груза меняются разом и возвращаются точно', () => {
    const s = seedState();
    const store = createEngineStore(s, fixed());
    const d: WorldDelta = {
      id: 'd-cloth', scale: 'settlement', subject: 'Neverwinter · ткани', was: 'норма', now: 'нехватка', cause: 'тест', causeId: 't', status: 'pending',
      patch: { kind: 'batch', patches: [{ kind: 'stock', id: LOCATION.neverwinter, goods: 'cloth', value: 3 }, { kind: 'price', id: LOCATION.neverwinter, goods: 'cloth', value: priceOfStock('cloth', 3) }] },
    };
    store.getState().propose(d);
    const proposed = store.getState().state;
    store.getState().accept(d.id);
    expect(store.getState().state.world.locations[LOCATION.neverwinter]).toMatchObject({ stock: { cloth: 3 }, prices: { cloth: 30 } });
    store.getState().undo();
    expect(store.getState().state.world).toEqual(proposed.world);
  });

  it('«Пульс»: разделы SRD всегда, груз — только когда у кого-то своя цена', () => {
    const s = seedState();
    const rows = Object.values(s.world.locations).filter(l => l.scale === 'settlement').map(l => priceRowOf(l, []));
    expect(pricedGoods(rows)).toEqual([...SRD_GOODS]);
    const t = applyWorldPatch(s, { kind: 'price', id: LOCATION.neverwinter, goods: 'spices', value: 15 });
    const rows2 = Object.values(t.world.locations).filter(l => l.scale === 'settlement').map(l => priceRowOf(l, []));
    expect(pricedGoods(rows2)).toEqual([...SRD_GOODS, 'spices']);
  });
});

describe('торговля: товары с диска', () => {
  it('Thay вывозит драгоценности и лес, ввозит металл; магию — и то и другое; Neverwinter — своя карточка, ввоз — державы', async () => {
    const [e, all] = await Promise.all([loadEcon(), loadKingdoms()]);
    expect(e.kingdoms.size).toBeGreaterThan(140);
    const thay = e.kingdoms.get('thay')!;
    expect(thay.x).toEqual(expect.arrayContaining(['precious', 'timber']));
    expect(thay.m).toEqual(expect.arrayContaining(['metal']));
    expect(equilibriumPoints('potions', thay)).toBe(5);
    // Рабы — не товар: в товарах держав людей нет.
    for (const r of e.kingdoms.values()) for (const g of [...(r.x ?? []), ...(r.m ?? [])]) expect(GOODS).toContain(g);
    const nw = econOfPlace(e, all.values(), '7e243b80-8918-42fa-b60e-03cec8bdb184', 1492);
    expect(nw.x).toEqual(['gear', 'food', 'potions', 'timber']);
    expect(econOfPlace(e, all.values(), 'nope', 1492)).toEqual({});
  });
});
