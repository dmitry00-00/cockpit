// Компонент Icon: каждая из 105 иконок даёт <svg role="img"> с <title>, не больше четырёх <path>,
// color перекрашивает fill по формуле pal(), tonePaths покрывает все клетки без потерь.
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Icon, iconPalette, tonePaths } from './Icon';
import { ICONS, ICON_NAMES, IPAL } from './icons.generated';
import { pal } from './palette';

afterEach(cleanup);

/** Число клеток тона t в сетке. */
const countTone = (grid: string, t: number) => grid.split('').filter((c) => c === String(t)).length;
/** Суммарная длина отрезков в пути одного тона: сумма всех `h n`. */
const pathCells = (d: string) => [...d.matchAll(/h(\d+)v1/g)].reduce((s, m) => s + Number(m[1]), 0);

describe('Icon', () => {
  it('каждая из 105 иконок рендерится: svg[role=img], title, aria-label, ≤ 4 path', () => {
    expect(ICON_NAMES.length).toBe(105);
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} title={`Иконка ${name}`} />);
      const svg = container.querySelector('svg');
      expect(svg, name).not.toBeNull();
      expect(svg!.getAttribute('role'), name).toBe('img');
      expect(svg!.getAttribute('aria-label'), name).toBe(`Иконка ${name}`);
      expect(svg!.getAttribute('viewBox'), name).toBe('0 0 16 16');
      expect(svg!.getAttribute('shape-rendering'), name).toBe('crispEdges');
      expect(svg!.getAttribute('width'), name).toBe('16');
      expect(svg!.getAttribute('height'), name).toBe('16');
      expect(svg!.style.imageRendering, name).toBe('pixelated');
      const title = svg!.querySelector('title');
      expect(title?.textContent, name).toBe(`Иконка ${name}`);
      const paths = svg!.querySelectorAll('path');
      expect(paths.length, name).toBeGreaterThan(0);
      expect(paths.length, name).toBeLessThanOrEqual(4);
      unmount();
    }
  });

  it('size задаёт width/height, viewBox остаётся 16', () => {
    const { container } = render(<Icon name="dice" size={48} title="Кость" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('48');
    expect(svg.getAttribute('height')).toBe('48');
    expect(svg.getAttribute('viewBox')).toBe('0 0 16 16');
  });

  it('без color — fill из IPAL, с color — четыре тона по pal()', () => {
    const own = render(<Icon name="hp" title="Хиты" />);
    const ownFills = [...own.container.querySelectorAll('path')].map((p) => p.getAttribute('fill'));
    for (const f of ownFills) expect(IPAL.hp).toContain(f);
    own.unmount();

    const tinted = render(<Icon name="hp" title="Хиты" color="#57a89b" />);
    const fills = [...tinted.container.querySelectorAll('path')].map((p) => p.getAttribute('fill'));
    const expected = pal('#57a89b');
    for (const f of fills) expect(expected).toContain(f);
    expect(fills).not.toEqual(ownFills);
    tinted.unmount();

    const token = render(<Icon name="hp" title="Хиты" color="var(--t2)" />);
    const tokenFills = [...token.container.querySelectorAll('path')].map((p) => p.getAttribute('fill'));
    expect(tokenFills).toContain('var(--t2)');
    expect(tokenFills.some((f) => f?.startsWith('color-mix('))).toBe(true);
  });

  it('паритет pal(): iconPalette без color равна IPAL, а pal(IPAL[n][2]) равна IPAL[n]', () => {
    for (const name of ICON_NAMES) {
      expect(iconPalette(name)).toBe(IPAL[name]);
      expect(pal(IPAL[name][2]), name).toEqual([...IPAL[name]]);
    }
  });

  it('tonePaths: сумма отрезков каждого тона равна числу его клеток, пустой тон — пустая строка', () => {
    for (const name of ICON_NAMES) {
      const grid = ICONS[name];
      const paths = tonePaths(grid);
      for (let t = 1; t <= 4; t++) {
        const cells = countTone(grid, t);
        const d = paths[t - 1];
        expect(pathCells(d), `${name} тон ${t}`).toBe(cells);
        if (cells === 0) expect(d, `${name} тон ${t}`).toBe('');
        else expect(d, `${name} тон ${t}`).toMatch(/^(M\d+ \d+h\d+v1h-\d+z)+$/);
      }
    }
  });

  it('className и style доходят до svg, style не перебивает size', () => {
    const { container } = render(<Icon name="map" title="Карта" className="x" style={{ opacity: 0.5 }} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('class')).toBe('x');
    expect(svg.style.opacity).toBe('0.5');
    expect(svg.style.display).toBe('block');
  });
});
