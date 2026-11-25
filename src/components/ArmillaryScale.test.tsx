import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ArmillaryScale } from './ArmillaryScale';
import type { ScaleStep } from './ScaleLadder';

const STEPS: ScaleStep[] = [
  { id: 'planet', label: 'Toril' },
  { id: 'continent', label: 'Faerûn' },
  { id: 'region', label: 'Sword Coast North' },
  { id: 'settlement', label: 'Neverwinter' },
];

const openSphere = () => fireEvent.click(screen.getByRole('button', { name: 'Армиллярная сфера масштабов' }));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  });
});
afterAll(() => vi.unstubAllGlobals());

describe('ArmillaryScale', () => {
  it('opens the scale instrument, selects a ring, and keeps localized tempo in its accessible name', () => {
    const onSelect = vi.fn();
    render(<ArmillaryScale steps={STEPS} current="region" onSelect={onSelect} />);
    openSphere();

    const ring = screen.getByRole('button', { name: 'Neverwinter; темп: часы' });
    fireEvent.click(ring);

    expect(onSelect).toHaveBeenCalledWith('settlement');
    expect(screen.queryByRole('group', { name: 'Армиллярная сфера масштабов' })).not.toBeInTheDocument();
  });

  it('moves between adjacent levels with arrow keys and offers a button for every available level', () => {
    const onSelect = vi.fn();
    render(<ArmillaryScale steps={STEPS} current="region" onSelect={onSelect} />);
    openSphere();
    const levels = screen.getByRole('group', { name: 'Уровни масштаба' });
    const ring = screen.getByRole('button', { name: 'Sword Coast North; темп: дни' });

    fireEvent.keyDown(ring, { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenLastCalledWith('settlement');
    expect(within(levels).getAllByRole('button')).toHaveLength(STEPS.length);
    expect(levels).toBeInTheDocument();
  });

  it('rotates the sphere by dragging the selected ring and advances one available level', () => {
    const onSelect = vi.fn();
    const capture = vi.fn();
    const previousCapture = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'setPointerCapture');
    Object.defineProperty(SVGElement.prototype, 'setPointerCapture', { configurable: true, value: capture });
    render(<ArmillaryScale steps={STEPS} current="region" onSelect={onSelect} />);
    openSphere();
    const svg = screen.getByRole('group', { name: 'Кольца уровней карты' });
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, width: 236, height: 236, top: 0, right: 236, bottom: 236, left: 0,
      toJSON: () => ({}),
    });
    const ring = screen.getByRole('button', { name: 'Sword Coast North; темп: дни' });

    fireEvent.pointerDown(ring, { pointerId: 7, button: 0, clientX: 218, clientY: 118 });
    fireEvent.pointerMove(ring, { pointerId: 7, clientX: 169, clientY: 31 });
    fireEvent.pointerUp(ring, { pointerId: 7 });
    fireEvent.click(ring);
    if (previousCapture) Object.defineProperty(SVGElement.prototype, 'setPointerCapture', previousCapture);
    else Reflect.deleteProperty(SVGElement.prototype, 'setPointerCapture');

    expect(capture).toHaveBeenCalledWith(7);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('continent');
    expect(screen.getByRole('group', { name: 'Кольца уровней карты' })).not.toHaveClass('is-dragging');
  });
});
