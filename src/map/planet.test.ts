// Глобус по маске (§10): клетка маски по долготе и широте, ортографическая проекция туда и обратно, свет по
// подсолнечной долготе, щелчок — континент по рамкам маски, пиксель плоской карты — долгота и широта по экстенту.
import { describe, expect, it } from 'vitest';
import { MAPS } from './maps';
import { PLANET_MASKS, globeCells, globeHit, globeToLonLat, isLit, lonLatToGlobe, mapToLonLat, maskCell, subsolarLon } from './planet';

const toril = PLANET_MASKS.toril;

describe('маска Toril', () => {
  it('160×80, полюса — лёд, середина Великого моря — океан', () => {
    expect([toril.w, toril.h, toril.grid.length, toril.grid[0].length]).toEqual([160, 80, 80, 160]);
    expect(maskCell(toril, 10, 89)).toBe('i');
    expect(maskCell(toril, 150, -10)).toBe('o');
  });

  it('пиксель плоской карты → долгота и широта по экстенту: углы карты — углы экстента; Neverwinter — суша Faerûn', () => {
    const p = MAPS.toril;
    expect(mapToLonLat(toril, p, { x: 0, y: 0 })).toEqual({ lon: 27, lat: 88 });
    expect(mapToLonLat(toril, p, { x: p.width, y: p.height })).toEqual({ lon: 327, lat: -61 });
    const nw = mapToLonLat(toril, p, { x: 8522, y: 2610 });
    expect(globeHit(toril, nw.lon, nw.lat)?.label).toBe('Faerûn');
  });
});

describe('проекция', () => {
  it('центр диска — долгота поворота на экваторе; туда и обратно совпадает', () => {
    const c = globeToLonLat(44, 120, 22, 22)!;
    expect(c.lon).toBe(120);
    expect(c.lat).toBeCloseTo(0);
    const p = lonLatToGlobe(44, 120, 150, 40);
    expect(p.visible).toBe(true);
    const back = globeToLonLat(44, 120, p.x, p.y)!;
    expect(back.lon).toBeCloseTo(150);
    expect(back.lat).toBeCloseTo(40);
    expect(lonLatToGlobe(44, 120, 300, 0).visible).toBe(false);
    expect(globeToLonLat(44, 0, 0, 0)).toBeNull(); // угол квадрата — вне диска
  });

  it('клетки диска — около π/4 от квадрата; свет — в пределах 90° от солнца', () => {
    const cells = globeCells(toril, 44, 0, 0);
    expect(cells.length / (44 * 44)).toBeCloseTo(Math.PI / 4, 1);
    expect(isLit(80, 0)).toBe(true);
    expect(isLit(100, 0)).toBe(false);
    expect(isLit(350, 0)).toBe(true);
    // Солнце над центром — центр светел; глобус повёрнут обратной стороной — центр в ночи.
    const center = (rot: number) => globeCells(toril, 44, rot, 0).find(c => c.x === 22 && c.y === 22)!;
    expect(center(0).lit).toBe(true);
    expect(center(180).lit).toBe(false);
  });

  it('подсолнечная долгота: полдень — над партией, в 18:00 — на 90° западнее', () => {
    expect(subsolarLon(111, 12 * 3600)).toBe(111);
    expect(subsolarLon(111, 18 * 3600)).toBe(21);
    expect(subsolarLon(111, 86_400 + 6 * 3600)).toBe(201);
  });

  it('щелчок: суша в рамке — континент, океан — ничего', () => {
    expect(globeHit(toril, 150, -10)).toBeNull();
    expect(globeHit(toril, 120, 45)).toMatchObject({ region: true });
  });
});
