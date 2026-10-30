// Колесо глобуса (M16): приближение к точке до предела маски, шаг дальше — переход на плоскую карту; отдаление — до
// целого диска. Канвас jsdom не рисует — проверяется приближение в data-zoom и ответ onZoomIn.
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Globe, globeMaxZoom } from './Globe';
import { PLANET_MASKS } from './planet';

const mask = PLANET_MASKS.toril;

describe('Globe — колесо', () => {
  it('приближает до предела маски, следующий шаг — onZoomIn с центром и радиусом; отдаление — до целого диска', () => {
    const onZoomIn = vi.fn();
    const { container } = render(<Globe mask={mask} rot={120} sun={120} onZoomIn={onZoomIn} />);
    const view = container.querySelector<HTMLElement>('[data-part="globe-view"]')!;
    expect(view.dataset.zoom).toBe('1.00');
    const max = globeMaxZoom(mask, 44);
    expect(max).toBeGreaterThan(1);
    for (let i = 0; i < 20 && Number(view.dataset.zoom) < Number(max.toFixed(2)); i++) fireEvent.wheel(view, { deltaY: -100 });
    expect(Number(view.dataset.zoom)).toBeCloseTo(max, 2);
    expect(onZoomIn).not.toHaveBeenCalled();
    fireEvent.wheel(view, { deltaY: -100 });
    expect(onZoomIn).toHaveBeenCalledTimes(1);
    expect(onZoomIn.mock.calls[0][0]).toMatchObject({ zoom: max });
    expect(onZoomIn.mock.calls[0][0].radiusPx).toBeGreaterThan(0);
    for (let i = 0; i < 20; i++) fireEvent.wheel(view, { deltaY: 100 });
    expect(view.dataset.zoom).toBe('1.00');
  });

  it('старт с точки (возврат с карты): центр — её долгота', () => {
    const { container } = render(<Globe mask={mask} rot={0} sun={0} focus={{ lon: 200, lat: 30, zoom: 1 }} />);
    expect(container.querySelector('canvas')).toHaveAttribute('data-rot', '200');
  });
});
