// DeathSaves: шесть пипок, успехи первыми, закрашенные подняты фаской и подписаны,
// всё вне 0..3 сжимается; строка 16px — ровно как полоса HP, которую она заменяет.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DeathSaves, clampSaves } from './DeathSaves';

const EMOJI = /\p{Extended_Pictographic}/u;
const pips = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('[data-on]')];

describe('clampSaves', () => {
  it('0..3 как есть, больше — 3, меньше нуля и NaN — 0, дробь — вниз', () => {
    expect(clampSaves(0)).toBe(0);
    expect(clampSaves(3)).toBe(3);
    expect(clampSaves(5)).toBe(3);
    expect(clampSaves(-2)).toBe(0);
    expect(clampSaves(NaN)).toBe(0);
    expect(clampSaves(2.9)).toBe(2);
  });
});

describe('DeathSaves', () => {
  it('ровно шесть пипок: три успеха, затем три провала', () => {
    const { container } = render(<DeathSaves saves={0} fails={0} />);
    const all = pips(container);
    expect(all).toHaveLength(6);
    const save = container.querySelector('[data-part="save"]')!;
    const fail = container.querySelector('[data-part="fail"]')!;
    expect(save.querySelectorAll('[data-on]')).toHaveLength(3);
    expect(fail.querySelectorAll('[data-on]')).toHaveLength(3);
    expect(save.compareDocumentPosition(fail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const p of all) {
      expect(p).toHaveClass('bg-wl', 'shadow-bevel-in');
      expect(p).toHaveAttribute('data-on', 'false');
    }
    expect(container.textContent).not.toMatch(EMOJI);
  });

  it('1 успех и 2 провала — как у Aldric на PNG: зелёный, тёмный, тёмный, красный, красный, тёмный', () => {
    const { container } = render(<DeathSaves saves={1} fails={2} />);
    const on = pips(container).map(p => p.getAttribute('data-on'));
    expect(on).toEqual(['true', 'false', 'false', 'true', 'true', 'false']);
    const [s1, , , f1, f2] = pips(container);
    expect(s1).toHaveClass('bg-fx-heal', 'shadow-bevel');
    expect(s1).not.toHaveClass('shadow-bevel-in');
    expect(f1).toHaveClass('bg-fx-damage', 'shadow-bevel');
    expect(f2).toHaveClass('bg-fx-damage');
  });

  it('закрашенная пипка подписана исходом, пустая — «нет»; группа читает счёт', () => {
    const { container } = render(<DeathSaves saves={1} fails={2} />);
    const titles = pips(container).map(p => p.getAttribute('title'));
    expect(titles).toEqual([
      'Успех спасброска от смерти',
      'Успех спасброска от смерти: нет',
      'Успех спасброска от смерти: нет',
      'Провал спасброска от смерти',
      'Провал спасброска от смерти',
      'Провал спасброска от смерти: нет',
    ]);
    expect(screen.getByRole('group', { name: 'Спасброски от смерти: успехов 1 из 3, провалов 2 из 3' })).toBeInTheDocument();
  });

  it('счёт сверх триады сжимается: 7 успехов — три закрашенных, не семь пипок', () => {
    const { container } = render(<DeathSaves saves={7} fails={-1} />);
    expect(pips(container)).toHaveLength(6);
    expect(pips(container).filter(p => p.getAttribute('data-on') === 'true')).toHaveLength(3);
    expect(screen.getByRole('group').getAttribute('aria-label')).toContain('успехов 3 из 3, провалов 0 из 3');
  });

  it('строка 16px — та же высота, что у полосы HP', () => {
    render(<DeathSaves saves={0} fails={0} />);
    expect(screen.getByRole('group')).toHaveClass('h-4');
  });
});
