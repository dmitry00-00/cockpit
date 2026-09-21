// Паритет палитры с генератором: pal() в TS даёт те же четыре тона, что pal() в design/icons-generator.js.
import { describe, expect, it } from 'vitest';
import { ICON_NAMES, IPAL } from './icons.generated';
import { isHex6, mix, pal, palCss, paletteFor } from './palette';

describe('palette', () => {
  it('pal(IPAL[name][2]) совпадает с IPAL[name] для каждой из иконок', () => {
    expect(ICON_NAMES.length).toBe(105);
    for (const name of ICON_NAMES) {
      const p = IPAL[name];
      expect(pal(p[2]), name).toEqual([...p]);
    }
  });

  it('mix — линейное смешение в sRGB с округлением', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mix('#d8a94a', '#000000', 0.62)).toBe('#52401c');
    expect(mix('#d8a94a', '#ffffff', 0.42)).toBe('#e8cd96');
  });

  it('тон 3 — базовый цвет, тон 1 темнее тона 2, тон 4 светлее', () => {
    const [t1, t2, t3, t4] = pal('#8a7b63');
    expect(t3).toBe('#8a7b63');
    const lum = (h: string) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
    expect(lum(t1)).toBeLessThan(lum(t2));
    expect(lum(t2)).toBeLessThan(lum(t3));
    expect(lum(t3)).toBeLessThan(lum(t4));
  });

  it('paletteFor: hex — точная палитра, иначе color-mix с теми же долями', () => {
    expect(isHex6('#d8a94a')).toBe(true);
    expect(isHex6('var(--t2)')).toBe(false);
    expect(paletteFor('#d8a94a')).toEqual(pal('#d8a94a'));
    expect(paletteFor('var(--t2)')).toEqual(palCss('var(--t2)'));
    expect(palCss('var(--t2)')).toEqual([
      'color-mix(in srgb, var(--t2) 38%, #000)',
      'color-mix(in srgb, var(--t2) 70%, #000)',
      'var(--t2)',
      'color-mix(in srgb, var(--t2) 58%, #fff)',
    ]);
  });
});
