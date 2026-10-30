// Математика карты мира: пирамида, вписывание рамки, приближение под курсором, тайлы без щелей, мили.
// Паспорт — тот же, что у стола (content/maps/toril.json): числа уровней сверяются с тем, что нарезал скрипт.
import { describe, expect, it } from 'vitest';
import { MAPS } from './maps';
import {
  FEET_PER_MILE, MAX_OVERZOOM, clampView, fitBox, hexCenters, levelSize, milesBetween, panBy, pathMiles, scaleBar, scaleBounds, tilesAt, toMap, toScreen,
  wholeMap, zoomAt, zoomLevelFor, type Viewport,
} from './projection';

// Математика вида и миль проверяется на фиксированном масштабе 0,5 мили на пиксель, а не на калибровке паспорта:
// калибровку держит свой тест ниже, и её уточнение не должно ломать проверки линейки и гексов.
const toril = { ...MAPS.toril, milesPerPixel: 0.5 };
const vp: Viewport = { w: 1200, h: 800 };

describe('паспорт и пирамида', () => {
  it('Toril: 30600×13400, тайл 256, семь уровней над z0 — как нарезал scripts/tile-map.py', () => {
    expect(toril.width).toBe(30600);
    expect(toril.height).toBe(13400);
    expect(toril.maxZoom).toBe(Math.ceil(Math.log2(30600 / 256)));
    expect(levelSize(toril, 7)).toEqual({ w: 30600, h: 13400 });
    expect(levelSize(toril, 0)).toEqual({ w: 240, h: 105 });
  });

  it('уровень пирамиды — самый мелкий, чей пиксель не крупнее экранного; с dpr 2 — на уровень подробнее', () => {
    expect(zoomLevelFor(toril, 1)).toBe(7);
    expect(zoomLevelFor(toril, 0.5)).toBe(6);
    expect(zoomLevelFor(toril, 0.3)).toBe(6);
    expect(zoomLevelFor(toril, 0.3, 2)).toBe(7);
    expect(zoomLevelFor(toril, 2)).toBe(7);
    expect(zoomLevelFor(toril, 0.001)).toBe(0);
  });
});

describe('вид', () => {
  it('масштаб между «вся карта в окне» и MAX_OVERZOOM; центр не уводит карту с экрана', () => {
    const { min, max } = scaleBounds(toril, vp);
    expect(min).toBeCloseTo(1200 / 30600);
    expect(max).toBe(MAX_OVERZOOM);
    expect(clampView(toril, vp, { x: 0, y: 0, scale: 1 })).toEqual({ x: 600, y: 400, scale: 1 });
    expect(clampView(toril, vp, { x: 99999, y: 99999, scale: 99 })).toEqual({ x: 30600 - 300, y: 13400 - 200, scale: MAX_OVERZOOM });
    // Вся карта уже окна по высоте — стоит посередине.
    const all = clampView(toril, vp, { x: 0, y: 0, scale: 0 });
    expect(all.y).toBe(6700);
  });

  it('fitBox: рамка целиком в окне, её центр — в центре окна', () => {
    const box = { x0: 8300, y0: 2250, x1: 9200, y1: 3150 };
    const v = fitBox(toril, vp, box);
    const a = toScreen(v, vp, { x: box.x0, y: box.y0 });
    const b = toScreen(v, vp, { x: box.x1, y: box.y1 });
    expect(a.y).toBeCloseTo(24);
    expect(b.y).toBeCloseTo(776);
    expect((a.x + b.x) / 2).toBeCloseTo(600);
  });

  it('fitBox с панелями слева: рамка встаёт в свободную часть окна справа от них', () => {
    const box = { x0: 8300, y0: 2250, x1: 9200, y1: 3150 };
    const v = fitBox(toril, vp, box, 24, 600);
    const a = toScreen(v, vp, { x: box.x0, y: box.y0 });
    const b = toScreen(v, vp, { x: box.x1, y: box.y1 });
    expect(a.x).toBeGreaterThanOrEqual(600);
    expect((a.x + b.x) / 2).toBeCloseTo(900);
  });

  it('fitBox широкой рамки при панелях: крупнее, чем влезло бы рядом, и прижата к правому краю', () => {
    const box = { x0: 12400, y0: 1300, x1: 23200, y1: 7100 }; // далеко от края карты: clampView не мешает
    const beside = (600 - 48) / 10800;
    const v = fitBox(toril, vp, box, 24, 600);
    expect(v.scale).toBeGreaterThan(beside);
    expect(toScreen(v, vp, { x: box.x1, y: 0 }).x).toBeCloseTo(1200 - 24);
  });

  it('toMap обратна toScreen; приближение держит точку под курсором', () => {
    const v = fitBox(toril, vp, { x0: 8000, y0: 2000, x1: 9000, y1: 3000 });
    const p = { x: 8522, y: 2610 };
    const s = toScreen(v, vp, p);
    expect(toMap(v, vp, s).x).toBeCloseTo(p.x);
    const z = zoomAt(toril, vp, v, 1.5, s);
    expect(z.scale).toBeCloseTo(v.scale * 1.5);
    expect(toScreen(z, vp, p).x).toBeCloseTo(s.x);
    expect(toScreen(z, vp, p).y).toBeCloseTo(s.y);
  });

  it('сдвиг: карта едет за рукой', () => {
    const v = { x: 10000, y: 5000, scale: 0.5 };
    expect(panBy(toril, vp, v, 100, -50)).toEqual({ x: 9800, y: 5100, scale: 0.5 });
  });
});

describe('тайлы', () => {
  it('в окне — только видимые тайлы уровня, соседи стыкуются без щелей, краевой — по остатку', () => {
    const v = clampView(toril, vp, { x: 30600 - 300, y: 13400 - 200, scale: 1 });
    const tiles = tilesAt(toril, vp, v, 7);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThanOrEqual(6 * 5);
    for (const t of tiles) {
      const right = tiles.find(o => o.top === t.top && o.left > t.left && o.left <= t.left + t.width);
      if (right) expect(right.left).toBe(t.left + t.width);
    }
    // Последний столбец z7: 30600 − 119·256 = 136 пикселей.
    const last = tiles.find(t => t.key.startsWith('7/119_'));
    expect(last?.width).toBe(136);
    expect(last?.url).toBe('/maps/tiles/toril/7/119_52.webp'.replace('52', last!.key.split('_')[1]));
  });

  it('вся карта на z0 — один тайл', () => {
    const v = fitBox(toril, vp, wholeMap(toril), 0);
    expect(tilesAt(toril, vp, v, 0).map(t => t.key)).toEqual(['0/0_0']);
  });
});

describe('мили, линейка, гексы', () => {
  it('мили по масштабу: 0.5 мили на пиксель — 499 px ≈ 250 миль', () => {
    expect(milesBetween(toril, { x: 8522, y: 2610 }, { x: 8770, y: 3043 })).toBeCloseTo(249.5, 0);
    expect(pathMiles(toril, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }])).toBe(100);
  });

  it('калибровка Toril по канону: маршрут Waterdeep → Baldur\'s Gate из серии D&D Beyond «около 750 миль» — в пределах 10 %', () => {
    // Значки поселений на растре (content/maps/toril-places.json, toril-control.json); отрезки прямые — дорога чуть длиннее.
    const route = [[8770, 3045], [8922, 3211], [9005, 3334], [9132, 3384], [9548, 3661], [9703, 3867], [9781, 3898], [9613, 3937], [9143, 3906]];
    const miles = pathMiles(MAPS.toril, route.map(([x, y]) => ({ x, y })));
    expect(miles).toBeGreaterThan(750 * 0.9);
    expect(miles).toBeLessThan(750 * 1.1);
  });

  it('масштабная линейка — круглое число миль не длиннее 120 px', () => {
    expect(scaleBar(toril, 1)).toEqual({ miles: 50, px: 100 });
    expect(scaleBar(toril, 0.05)).toEqual({ miles: 1000, px: 100 });
  });

  it('план города (M10) — в футах: 3,58 фута на пиксель, линейка — 200 футов; 1000 футов на плане — 279 px', () => {
    const plan = MAPS.neverwinter;
    const bar = scaleBar(plan, 1);
    expect(Math.round(bar.miles * FEET_PER_MILE)).toBe(200);
    expect(bar.px).toBe(56);
    expect(Math.round(1000 / FEET_PER_MILE / plan.milesPerPixel)).toBe(279);
  });

  it('гексы: шаг — hexMiles, радиус на экране растёт с приближением', () => {
    const v = { x: 8522, y: 2610, scale: 2 };
    const h = hexCenters(toril, vp, v, 6);
    // Шаг 6 миль = 12 px исходника = 24 px экрана при ×2; радиус = шаг/√3.
    expect(h.radius).toBeCloseTo(24 / Math.sqrt(3));
    const row = h.centers.filter(c => Math.abs(c.y - h.centers[0].y) < 0.01).map(c => c.x).sort((a, b) => a - b);
    expect(row[1] - row[0]).toBeCloseTo(24);
    expect(hexCenters(toril, vp, { ...v, scale: 1 }, 6).radius).toBeCloseTo(h.radius / 2);
  });
});
