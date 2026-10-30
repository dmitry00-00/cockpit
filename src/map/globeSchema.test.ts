import { describe, expect, it } from 'vitest';
import { clipLineToBand, clipRingToBand, diskPoint, globeVectorFrom, nightPolygon, visibleBands } from './globeSchema';

const area = (r: readonly number[]) => {
  let s = 0;
  for (let i = 0; i < r.length; i += 2) {
    const j = (i + 2) % r.length;
    s += r[i] * r[j + 1] - r[j] * r[i + 1];
  }
  return Math.abs(s) / 2;
};

describe('глобус схемой (M16): видимая полусфера', () => {
  const toril = { lon0: 27, lon1: 327, width: 30600 };

  it('полоса по x плоской карты: ±90° от центра; у края карты — вторая полоса через оборот', () => {
    const [band] = visibleBands(177, toril, 0);
    expect(band[0]).toBeCloseTo(((177 - 90 - 27) / 300) * 30600);
    expect(band[1]).toBeCloseTo(((177 + 90 - 27) / 300) * 30600);
    // Центр у 0°: видны и западный край карты (27…90°), и восточный (270…327°).
    const two = visibleBands(0, toril, 0);
    expect(two).toHaveLength(2);
  });

  it('кольцо режется по полосе: квадрат пополам — половина площади; целиком снаружи — пусто', () => {
    const sq = [0, 0, 10, 0, 10, 10, 0, 10];
    expect(area(clipRingToBand(sq, 5, 100))).toBeCloseTo(50);
    expect(area(clipRingToBand(sq, -5, 100))).toBeCloseTo(100);
    expect(clipRingToBand(sq, 20, 30)).toEqual([]);
  });

  it('линия — кусками внутри полосы, концы кусков на краю', () => {
    const parts = clipLineToBand([0, 0, 10, 0, 20, 0, 30, 0], 5, 25);
    expect(parts).toEqual([[5, 0, 10, 0, 20, 0, 25, 0]]);
    expect(clipLineToBand([0, 0, 1, 1], 5, 25)).toEqual([]);
  });

  it('точка на диске: центр — середина; за горизонтом — на краю диска, не внутри', () => {
    const c = diskPoint(80, 100, 10, 100, 0);
    expect(c).toMatchObject({ x: 400, y: 400, visible: true });
    const back = diskPoint(80, 100, 10, 100 + 120, 10);
    expect(back.visible).toBe(false);
    expect(Math.hypot(back.x - 400, back.y - 400)).toBeGreaterThan(400);
  });
});

describe('глобус схемой: ночь и порог', () => {
  it('солнце над центром — ночи не видно; за спиной — весь диск; утро — ночь на западе, вечер — на востоке', () => {
    expect(nightPolygon(100, 0, 0)).toEqual([]);
    const all = nightPolygon(100, 0, 180);
    const xs = all.map(p => p.x);
    expect(Math.min(...xs)).toBeCloseTo(0);
    expect(Math.max(...xs)).toBeCloseTo(200);
    // Солнце восточнее центра на 60°: терминатор западнее центра, ночь — у западного края.
    // Терминатор сходится к полюсам (x = R), на экваторе — в 30° западнее центра: R − R·sin 30°.
    const equator = (poly: { x: number; y: number }[]) => poly.filter(p => Math.abs(p.y - 100) < 1e-6).map(p => p.x).sort((a, b) => a - b);
    const west = nightPolygon(100, 0, 60);
    expect(equator(west)[0]).toBeCloseTo(0);
    expect(equator(west)[1]).toBeCloseTo(50);
    expect(Math.max(...west.map(p => p.x))).toBeLessThanOrEqual(100 + 1e-9);
    const east = nightPolygon(100, 0, -60);
    expect(equator(east)).toEqual([expect.closeTo(150), expect.closeTo(200)]);
  });

  it('схема — с последних двух шагов колеса перед пределом', () => {
    expect(globeVectorFrom(1.82, 1.2)).toBeCloseTo(1.82 / 1.44);
    expect(globeVectorFrom(1, 1.2)).toBe(1);
  });
});
