import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RasterLayer } from './RasterLayer';
import { createTilesGl, type TilesGlOptions } from './tilesGl';
import type { TileRect } from './projection';

// Общий setup заранее загружает WorldMap и его зависимости.
vi.hoisted(() => vi.resetModules());
vi.mock('./tilesGl', () => ({ createTilesGl: vi.fn() }));
const view = { x: 128, y: 128, scale: 1 };
const vp = { w: 256, h: 256 };
const tile: TileRect = { key: '0/0_0', z: 0, url: '/tiles/0/0_0.webp', left: 0, top: 0, width: 256, height: 256,
  box: { x0: 0, y0: 0, x1: 256, y1: 256 } };
let options: TilesGlOptions;
let draw = vi.fn();
let dispose = vi.fn();
const props = () => ({ tiles: [tile], view, vp, dpr: 2, pixelated: false });

beforeEach(() => {
  history.replaceState(null, '', '/');
  draw = vi.fn(); dispose = vi.fn();
  vi.mocked(createTilesGl).mockImplementation((_canvas, opts = {}) => {
    options = opts;
    return { draw, dispose, stats: () => ({ ready: 0, loading: 1, textureBytes: 0, meshBytes: 0 }) };
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); history.replaceState(null, '', '/'); });

describe('RasterLayer', () => {
  it('оставляет DOM до готовности подложки, затем использует GPU с тем же кадром', () => {
    const { container, rerender } = render(<RasterLayer {...props()} />);
    expect(draw).toHaveBeenLastCalledWith(view, vp, 2, [tile], false);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(tile.url);
    act(() => options.onCoverage?.(true));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-renderer="webgl2"]')).not.toBeNull();
    const next = { ...tile, url: '/clean/0/0_0.webp' };
    rerender(<RasterLayer {...props()} tiles={[next]} />);
    expect(draw).toHaveBeenLastCalledWith(view, vp, 2, [next], false);
    act(() => options.onCoverage?.(false));
    expect(container.querySelector('img')?.getAttribute('src')).toBe(next.url);
  });

  it('потеря контекста освобождает GPU и возвращает DOM', () => {
    const { container, unmount } = render(<RasterLayer {...props()} />);
    act(() => options.onCoverage?.(true));
    act(() => options.onLost?.());
    expect(container.querySelector('[data-renderer="dom"]')).not.toBeNull();
    expect(container.querySelector('img')).not.toBeNull();
    expect(dispose).toHaveBeenCalledTimes(1);
    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('отказ загрузки GPU возвращает DOM; сообщение о недоступности относится к подложке', () => {
    const onError = vi.fn();
    const { container } = render(<RasterLayer {...props()} onError={onError} />);
    act(() => options.onError?.(tile));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-renderer="dom"] img')).not.toBeNull();
  });

  it('без WebGL2 остаётся прежний DOM-путь', () => {
    vi.mocked(createTilesGl).mockReturnValue(null);
    const { container } = render(<RasterLayer {...props()} />);
    expect(container.querySelector('[data-renderer="dom"] img')).not.toBeNull();
  });

  it('renderer=canvas принудительно отключает GPU и не меняет адреса тайлов', () => {
    history.replaceState(null, '', '/?renderer=canvas');
    const { container } = render(<RasterLayer {...props()} />);
    expect(createTilesGl).not.toHaveBeenCalled();
    expect(container.querySelector('img')?.getAttribute('src')).toBe(tile.url);
  });
});
