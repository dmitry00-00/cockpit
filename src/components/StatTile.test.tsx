// StatTile: знак модификатора (U+2212, не дефис), очко только у характеристики, владение — золотая грань
// и квадратная метка, цвет грани из токена ab-*, бросок по клику через нативную кнопку, селектор без броска.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StatTile, signedMod, tileEdge } from './StatTile';

const EMOJI = /\p{Extended_Pictographic}/u;
const MINUS = '−';

describe('signedMod', () => {
  it('плюс у нуля и положительных, типографский минус у отрицательных', () => {
    expect(signedMod(3)).toBe('+3');
    expect(signedMod(0)).toBe('+0');
    expect(signedMod(-1)).toBe(`${MINUS}1`);
    expect(signedMod(-1)).not.toContain('-');
  });
});

describe('tileEdge', () => {
  it('грань — токен характеристики; без характеристики — lo; владение перекрывает всё золотом', () => {
    expect(tileEdge('dex', false)).toBe('shadow-[var(--bevel),inset_0_3px_0_var(--ab-dex)]');
    expect(tileEdge(undefined, undefined)).toBe('shadow-[var(--bevel),inset_0_3px_0_var(--lo)]');
    expect(tileEdge('dex', true)).toBe('shadow-[var(--bevel),inset_0_3px_0_var(--gd)]');
    expect(tileEdge('str', false)).toContain('--ab-str');
    expect(tileEdge('str', false)).not.toContain('#');
  });
});

describe('StatTile', () => {
  it('характеристика: подпись, «+3», очко 16, грань DEX, без метки владения', () => {
    const { container } = render(<StatTile label="DEX" mod={3} score={16} ability="dex" />);
    const btn = screen.getByRole('button', { name: /DEX/ });
    expect(btn).toHaveClass('shadow-[var(--bevel),inset_0_3px_0_var(--ab-dex)]');
    expect(screen.getByText('DEX')).toHaveClass('type-num-12', 'uppercase');
    expect(screen.getByText('+3')).toHaveClass('type-num-24');
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.queryByTitle('владение')).toBeNull();
    expect(container.textContent).not.toMatch(EMOJI);
  });

  it('отрицательный модификатор — «−1» с U+2212, дефиса в разметке нет', () => {
    render(<StatTile label="CHA" mod={-1} score={9} ability="cha" />);
    expect(screen.getByText(`${MINUS}1`)).toBeInTheDocument();
    expect(screen.queryByText('-1')).toBeNull();
  });

  it('навык: без score очка нет; владение — метка «владение» и золотая грань', () => {
    render(<StatTile label="Скрытность" mod={6} ability="dex" owned />);
    const btn = screen.getByRole('button', { name: /Скрытность/ });
    expect(btn.querySelectorAll('span')).toHaveLength(3);
    expect(screen.getByTitle('владение')).toHaveClass('bg-gd');
    expect(screen.getByRole('img', { name: 'владение' })).toBeInTheDocument();
    expect(btn).toHaveClass('shadow-[var(--bevel),inset_0_3px_0_var(--gd)]');
    expect(btn).not.toHaveClass('shadow-[var(--bevel),inset_0_3px_0_var(--ab-dex)]');
  });

  it('метка владения не меняет высоту плитки: она вне потока, в углу; классы высоты и отступов с owned и без совпадают', () => {
    const { rerender } = render(<StatTile label="Скрытность" mod={6} ability="dex" />);
    const sizing = (el: Element) => el.className.split(/\s+/).filter(c => /^(h-|min-h-|max-h-|p-|py-|pt-|pb-|gap-|leading-)/.test(c)).sort();
    const plain = sizing(screen.getByRole('button'));
    rerender(<StatTile label="Скрытность" mod={6} ability="dex" owned />);
    const btn = screen.getByRole('button');
    expect(sizing(btn)).toEqual(plain);
    expect(btn).toHaveClass('relative');
    const mark = screen.getByTitle('владение');
    expect(mark).toHaveClass('absolute', 'right-1', 'bottom-1', 'size-2');
    expect(mark.className).not.toMatch(/(^|\s)flex-none(\s|$)/);
    // В потоке — те же два span, что и без метки (подпись и модификатор); метка вне потока.
    expect(btn.querySelectorAll(':scope > span:not(.absolute)')).toHaveLength(2);
  });

  it('без владения и без ability — тёмная грань lo и без метки', () => {
    render(<StatTile label="Убеждение" mod={-2} />);
    expect(screen.getByRole('button')).toHaveClass('shadow-[var(--bevel),inset_0_3px_0_var(--lo)]');
    expect(screen.queryByTitle('владение')).toBeNull();
  });

  it('title по умолчанию «label · бросок d20», свой title перекрывает', () => {
    const { rerender } = render(<StatTile label="Природа" mod={5} />);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Природа · бросок d20');
    rerender(<StatTile label="Природа" mod={5} title="Природа · Bo" />);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Природа · Bo');
  });

  it('onRoll — по клику, ровно один раз; Enter даёт нативная кнопка type=button', () => {
    const onRoll = vi.fn();
    render(<StatTile label="STR" mod={1} score={12} ability="str" onRoll={onRoll} />);
    const btn = screen.getByRole('button', { name: /STR/ });
    fireEvent.click(btn);
    expect(onRoll).toHaveBeenCalledTimes(1);
    // Enter/Space на <button> активирует click сам браузер; jsdom этого не синтезирует,
    // поэтому утверждение — что это настоящая кнопка, а не div с обработчиком.
    expect(btn.tagName).toBe('BUTTON');
    expect(btn).toHaveAttribute('type', 'button');
    expect(btn).not.toHaveAttribute('tabindex');
    expect(btn).not.toHaveAttribute('aria-pressed');
  });

  it('disabled: клик не бросает, кнопка недоступна', () => {
    const onRoll = vi.fn();
    render(<StatTile label="WIS" mod={2} onRoll={onRoll} disabled />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onRoll).not.toHaveBeenCalled();
  });

  it('режим селектора: aria-pressed, onSelect вместо onRoll, выбранная — золотое кольцо и золотая подпись', () => {
    const onRoll = vi.fn();
    const onSelect = vi.fn();
    const { rerender } = render(<StatTile label="Атлетика" mod={4} ability="str" mode="select" onRoll={onRoll} onSelect={onSelect} />);
    const btn = screen.getByRole('button', { name: /Атлетика/ });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(btn).toHaveAttribute('title', 'Атлетика · выбрать');
    fireEvent.click(btn);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onRoll).not.toHaveBeenCalled();
    rerender(<StatTile label="Атлетика" mod={4} ability="str" mode="select" selected onRoll={onRoll} onSelect={onSelect} />);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn).toHaveClass('shadow-[var(--bevel),var(--glow-gold)]');
    expect(screen.getByText('Атлетика')).toHaveClass('text-gd');
  });

  it('фокус — золотое кольцо поверх фаски, наведение — только для доступной кнопки', () => {
    render(<StatTile label="CON" mod={3} score={16} ability="con" />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveClass('focus-visible:shadow-[var(--bevel),var(--glow-gold)]');
    expect(btn).toHaveClass('enabled:hover:from-pl');
    expect(btn.className).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});
