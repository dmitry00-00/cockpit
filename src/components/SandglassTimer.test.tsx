import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SandglassTimer } from './SandglassTimer';

afterEach(() => vi.useRealTimers());

describe('SandglassTimer', () => {
  it('measures only local turn time, pauses, resumes, and resets on the next turn', () => {
    vi.useFakeTimers();
    const { rerender } = render(<SandglassTimer active turnKey="1:0:bo" turnLabel="Раунд 1 · Bo" />);
    const timer = screen.getByRole('timer');
    expect(timer).toHaveTextContent('00:00');
    fireEvent.click(screen.getByRole('button', { name: 'Старт' }));
    act(() => { vi.advanceTimersByTime(1_300); });
    expect(timer).toHaveTextContent('00:01');
    fireEvent.click(screen.getByRole('button', { name: 'Пауза' }));
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(timer).toHaveTextContent('00:01');
    fireEvent.click(screen.getByRole('button', { name: 'Старт' }));
    act(() => { vi.advanceTimersByTime(1_100); });
    expect(timer).toHaveTextContent('00:02');
    rerender(<SandglassTimer active turnKey="1:1:korrin" turnLabel="Раунд 1 · Korrin" />);
    expect(timer).toHaveTextContent('00:00');
    expect(screen.getByRole('button', { name: 'Старт' })).toBeEnabled();
  });

  it('keeps the timer disabled until an encounter starts', () => {
    render(<SandglassTimer active={false} turnKey="inactive" turnLabel="Бой не начат" />);
    expect(screen.getByRole('button', { name: 'Старт' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('не меняет игровое время');
  });
});
