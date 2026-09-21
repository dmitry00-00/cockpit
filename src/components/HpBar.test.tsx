// HpBar: пороги заливки ровно как в прототипе, временные хиты — отдельный сегмент, не ломающий
// проценты, 0 HP — пустой жёлоб с aria-valuenow 0, вспышка — класс на жёлобе по пропу: сама полоса
// хиты не сравнивает (единственный источник вспышки — последнее событие лога, useHpFlashes).
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HpBar, hpGeometry, hpLevel, hpText, type HpTriple } from './HpBar';

const EMOJI = /\p{Extended_Pictographic}/u;
const hp = (current: number, max: number, temp = 0): HpTriple => ({ current, max, temp });

const meter = () => screen.getByRole('meter', { name: /Хиты/ });
const fill = () => meter().querySelector('[data-part="fill"]') as HTMLElement;
const temp = () => meter().querySelector('[data-part="temp"]') as HTMLElement | null;

describe('hpLevel — пороги прототипа', () => {
  it('выше половины — high, ровно половина — уже mid', () => {
    expect(hpLevel(26, 50)).toBe('high');
    expect(hpLevel(25, 50)).toBe('mid');
    expect(hpLevel(49, 49)).toBe('high');
  });
  it('выше четверти — mid, ровно четверть — уже low', () => {
    expect(hpLevel(13, 50)).toBe('mid');
    expect(hpLevel(12, 50)).toBe('low');
    expect(hpLevel(0, 38)).toBe('low');
  });
  it('max 0 — low, а не деление на ноль', () => {
    expect(hpLevel(0, 0)).toBe('low');
  });
});

describe('hpGeometry и hpText', () => {
  it('жёлоб — max + temp: при полных хитах заливка укорачивается, штрих добирает до 100', () => {
    const g = hpGeometry(hp(32, 32, 5));
    expect(g.pct).toBeCloseTo((32 / 37) * 100, 6);
    expect(g.tempPct).toBeCloseTo((5 / 37) * 100, 6);
    expect(g.pct + g.tempPct).toBeCloseTo(100, 6);
  });
  it('без временных штриха нет, проценты по max', () => {
    expect(hpGeometry(hp(41, 49))).toEqual({ pct: (41 / 49) * 100, tempPct: 0 });
    expect(hpGeometry(hp(0, 0))).toEqual({ pct: 0, tempPct: 0 });
  });
  it('число: «41/49», с временными «32/32 +5»', () => {
    expect(hpText(hp(41, 49))).toBe('41/49');
    expect(hpText(hp(32, 32, 5))).toBe('32/32 +5');
    expect(hpText(hp(0, 38))).toBe('0/38');
  });
});

describe('HpBar', () => {
  it('meter: aria-valuenow/max, текст значения, сердце с title «Хиты»', () => {
    const { container } = render(<HpBar hp={hp(41, 49)} />);
    const m = meter();
    expect(m).toHaveAttribute('aria-valuenow', '41');
    expect(m).toHaveAttribute('aria-valuemax', '49');
    expect(m).toHaveAttribute('aria-valuemin', '0');
    expect(m).toHaveAttribute('aria-valuetext', '41 из 49');
    expect(screen.getByText('41/49')).toHaveClass('type-num-15');
    expect(screen.getByRole('img', { name: 'Хиты' })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(EMOJI);
  });

  it('заливка — класс по порогу: 26/50 high, 25/50 mid, 12/50 low', () => {
    const { rerender } = render(<HpBar hp={hp(26, 50)} />);
    expect(fill()).toHaveClass('bg-hp-high');
    rerender(<HpBar hp={hp(25, 50)} />);
    expect(fill()).toHaveClass('bg-hp-mid');
    expect(fill()).not.toHaveClass('bg-hp-high');
    rerender(<HpBar hp={hp(12, 50)} />);
    expect(fill()).toHaveClass('bg-hp-low');
  });

  it('ширина заливки — процент от max, движение шагами', () => {
    render(<HpBar hp={hp(41, 49)} />);
    expect(fill().style.width).toBe(`${(41 / 49) * 100}%`);
    expect(fill().className).toContain('steps(8,end)');
    expect(temp()).toBeNull();
  });

  it('временные хиты: отдельный сегмент справа от заливки с title, число «+5», порог без temp', () => {
    render(<HpBar hp={hp(32, 32, 5)} />);
    const f = fill();
    const t = temp()!;
    expect(t).not.toBeNull();
    expect(t).toHaveAttribute('title', 'Временные HP: 5');
    expect(t.style.left).toBe(f.style.width);
    expect(parseFloat(f.style.width) + parseFloat(t.style.width)).toBeCloseTo(100, 6);
    expect(f).toHaveClass('bg-hp-high');
    expect(screen.getByText('32/32 +5')).toBeInTheDocument();
    expect(meter()).toHaveAttribute('aria-valuetext', '32 из 32, временные 5');
    expect(meter()).toHaveAttribute('aria-valuenow', '32');
  });

  it('временные не красят полосу: 10/40 +40 — low, заливка 12.5 %', () => {
    render(<HpBar hp={hp(10, 40, 40)} />);
    expect(fill()).toHaveClass('bg-hp-low');
    expect(fill().style.width).toBe('12.5%');
    expect(temp()!.style.width).toBe('50%');
  });

  it('0 HP: aria-valuenow 0, заливка 0 %, low, «0/38»', () => {
    render(<HpBar hp={hp(0, 38)} />);
    expect(meter()).toHaveAttribute('aria-valuenow', '0');
    expect(fill().style.width).toBe('0%');
    expect(fill()).toHaveClass('bg-hp-low');
    expect(screen.getByText('0/38')).toBeInTheDocument();
  });

  it('icon={false} — сердца нет; label уходит в имя meter', () => {
    render(<HpBar hp={hp(41, 49)} icon={false} label="Bo Tambernack" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('meter', { name: 'Хиты Bo Tambernack' })).toBeInTheDocument();
  });

  it('flash меняет тень жёлоба: damage/heal вместо bevel-in, null — обратно', () => {
    const { rerender } = render(<HpBar hp={hp(33, 49)} flash="damage" />);
    expect(meter()).toHaveClass('shadow-flash-damage');
    expect(meter()).not.toHaveClass('shadow-bevel-in');
    rerender(<HpBar hp={hp(40, 49)} flash="heal" />);
    expect(meter()).toHaveClass('shadow-flash-heal');
    rerender(<HpBar hp={hp(40, 49)} flash={null} />);
    expect(meter()).toHaveClass('shadow-bevel-in');
    expect(meter()).not.toHaveClass('shadow-flash-heal');
  });

  it('compact: число 12px, жёлоб 12px', () => {
    render(<HpBar hp={hp(11, 11)} compact />);
    expect(screen.getByText('11/11')).toHaveClass('type-num-12');
    expect(meter()).toHaveClass('h-3');
  });

  it('в разметке нет пиктограмм и слова про радиус', () => {
    const { container } = render(<HpBar hp={hp(32, 32, 5)} flash="heal" />);
    expect(container.innerHTML).not.toMatch(EMOJI);
    expect(container.innerHTML).not.toMatch(/border-radius/);
  });
});
