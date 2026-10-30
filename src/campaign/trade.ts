// Торговля (SIMULATION.md С3, research/world-models.md §4.1): запас товара в месте, его равновесие и цена из запаса.
// Чистые правила без данных и без реестра процессов — их читают вид «караван» и карточка места. Запас — поле `stock`
// места (патч `stock`); нет поля — запас на равновесии: место из справочника ничего не хранит, пока торговля его не
// тронула. Цена следует за запасом, а не за случайностью.
import type { GoodsId } from '../engine/state';
import type { EconRecord } from '../world/econ';
import type { Season } from './calendar';

/**
 * Числа правил торговли — правила стола: SRD масштаба рынка не описывает. Источник идеи — в комментарии строки.
 */
export const TRADE_RULES = {
  /** Норма запаса 0–10. */
  norm: 5,
  /** Равновесие товара, который место вывозит или ввозит; и то и другое — норма (перевалочный рынок). */
  exportEq: 7,
  importEq: 3,
  /** City и Metropolis едят больше, чем растят: равновесие еды на очко ниже. */
  cityFood: -1,
  /** Надбавка к цене за очко нехватки и её предел, % — цена не уходит в абсурд (идея предела — Victoria 3). */
  pricePerPoint: 15,
  priceCap: 75,
  /** Еда — в днях на жителя (A5E Supply: «enough … to sustain a … creature for a day»); очко шкалы — столько дней. */
  foodDaysPerPoint: 12,
  /** Норма еды по сезону, дней: осень — урожай (Highharvestide), к весне запас тает. Поглощает SIM_RULES.foodBySeason,
   *  когда торговля ведёт место: сезон сдвигает равновесие, цена идёт за запасом. */
  foodNormBySeason: { winter: 40, spring: 50, summer: 60, autumn: 90 } satisfies Record<Season, number>,
  /** Запас тянется к равновесию на эту долю разрыва за десятидневку. */
  pullPerTenday: 1 / 3,
} as const;

const R = TRADE_RULES;

/** Равновесие товара в очках 0–10: вывоз 7, ввоз 3, иначе (и то и другое) 5; у города еда на очко ниже. */
export function equilibriumPoints(goods: GoodsId, econ: EconRecord, city = false): number {
  const x = econ.x?.includes(goods), m = econ.m?.includes(goods);
  const base = x && !m ? R.exportEq : m && !x ? R.importEq : R.norm;
  return goods === 'food' && city ? base + R.cityFood : base;
}

/** Равновесие запаса в единицах товара: еда — дни (норма сезона × очки / 5), остальное — очки. */
export function equilibrium(goods: GoodsId, econ: EconRecord, season: Season, city = false): number {
  const pts = equilibriumPoints(goods, econ, city);
  return goods === 'food' ? Math.round(R.foodNormBySeason[season] * pts / R.norm) : pts;
}

/** Запас в очках шкалы: еда — дни / 12. */
export const stockPoints = (goods: GoodsId, stock: number): number => (goods === 'food' ? stock / R.foodDaysPerPoint : stock);

/** Надбавка к цене из запаса, %: 15 за очко от нормы, в пределах ±75. Запас 0 — +75, 5 — 0, 10 — −75. */
export function priceOfStock(goods: GoodsId, stock: number): number {
  const v = Math.round(R.pricePerPoint * (R.norm - stockPoints(goods, stock)));
  return Math.max(-R.priceCap, Math.min(R.priceCap, v)) || 0;
}

/** Запас через n десятидневок без караванов: равн + (запас − равн) · (1 − 1/3)ⁿ — формулой, без тактов, поэтому шаг
 *  любой длины даёт то же, что его дробление. */
export const pulledStock = (stock: number, eq: number, tendays: number): number =>
  eq + (stock - eq) * (1 - R.pullPerTenday) ** tendays;
