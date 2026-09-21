// InitiativeToken: плита 48×48 с числом инициативы, иконкой типа и полоской хитов; текущий ход — масштаб 125 %
// и кольцо token-active (data-active / aria-current); выбранный — золотое кольцо без масштаба; 0 HP гаснет,
// но остаётся; легендарные — пипки; логово — слот на 20 без хитов; проекция актёра из сида.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { seedEngine } from '../campaign';
import { tonePaths } from '../icons/Icon';
import { ICONS } from '../icons/icons.generated';
import { ENTITY } from './EntityCard';
import type { HpTriple } from './HpBar';
import {
  InitiativeToken, initiativeTokenDescription, initiativeTokenOf, initiativeTokenShadow, initiativeTokenTitle, tokenHpPct,
} from './InitiativeToken';

const EMOJI = /\p{Extended_Pictographic}/u;
const hp = (current: number, max: number, temp = 0): HpTriple => ({ current, max, temp });
const pathsOf = (svg: Element) => Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('d'));

const token = () => screen.getByRole('button');
const init = () => token().querySelector('[data-part="init"]') as HTMLElement;
const fill = () => token().querySelector('[data-part="hp"] [data-part="fill"]') as HTMLElement | null;
const pips = () => token().querySelector('[data-part="legendary"]') as HTMLElement | null;

describe('проекции', () => {
  it('initiativeTokenOf: тип из kind, хиты — та же тройка из State, legendary не задан', () => {
    const store = seedEngine();
    const { actors } = store.getState().state;
    const bo = initiativeTokenOf(actors.bo, 15);
    expect(bo).toEqual({ id: 'bo', name: 'Bo Tambernack', type: 'pc', initiative: 15, hp: actors.bo.hp });
    expect(bo.hp).toBe(actors.bo.hp);
    expect('legendary' in bo).toBe(false);
    expect(initiativeTokenOf(actors.captain, 14)).toMatchObject({ id: 'captain', type: 'monster', initiative: 14, hp: { current: 45, max: 65 } });
    expect(initiativeTokenOf({ ...actors.bo, kind: 'npc', sheet: undefined }, 3).type).toBe('npc');
  });

  it('tokenHpPct: доля от max без временных, в пределах 0–100, max 0 — ноль', () => {
    expect(tokenHpPct(hp(41, 49))).toBeCloseTo((41 / 49) * 100, 6);
    expect(tokenHpPct(hp(32, 32, 5))).toBe(100);
    expect(tokenHpPct(hp(0, 38))).toBe(0);
    expect(tokenHpPct(hp(0, 0))).toBe(0);
    expect(tokenHpPct(hp(60, 49))).toBe(100);
  });

  it('title и сводка: имя, инициатива, хиты; у логова — «Логово» и без хитов; 0 HP — «0 хитов из»', () => {
    expect(initiativeTokenTitle({ name: 'Bo Tambernack', initiative: 15, hp: hp(41, 49) })).toBe('Bo Tambernack · инициатива 15 · хиты 41/49');
    expect(initiativeTokenTitle({ name: 'Lyra', initiative: 12, hp: hp(32, 32, 5) })).toBe('Lyra · инициатива 12 · хиты 32/32 +5');
    expect(initiativeTokenTitle({ name: 'Пещера', initiative: 20, lair: true })).toBe('Логово · инициатива 20');
    expect(initiativeTokenDescription({ name: 'Bo Tambernack', initiative: 15, hp: hp(41, 49) })).toBe('Bo Tambernack, инициатива 15, хиты 41 из 49');
    expect(initiativeTokenDescription({ name: 'Lyra', initiative: 12, hp: hp(32, 32, 5) })).toBe('Lyra, инициатива 12, хиты 32 из 32, временные 5');
    expect(initiativeTokenDescription({ name: 'Bandit 3', initiative: 6, hp: hp(0, 11) })).toBe('Bandit 3, инициатива 6, 0 хитов из 11');
    expect(initiativeTokenDescription({ name: 'Bandit Captain', initiative: 14, hp: hp(45, 65), legendary: 3 })).toBe('Bandit Captain, инициатива 14, хиты 45 из 65, легендарных действий 3');
    expect(initiativeTokenDescription({ name: 'x', initiative: 20, lair: true })).toBe('Логово, инициатива 20');
  });

  it('тень по состоянию: четыре сочетания, фокус всегда добавляет gd, у хода — token-active снаружи', () => {
    expect(initiativeTokenShadow(false, false)).toBe('shadow-bevel focus-visible:shadow-[var(--bevel),var(--glow-gold)]');
    expect(initiativeTokenShadow(true, false)).toContain('shadow-[var(--bevel),var(--token-active)]');
    expect(initiativeTokenShadow(false, true)).toContain('shadow-[var(--bevel),var(--glow-gold)]');
    expect(initiativeTokenShadow(true, true)).toContain('shadow-[var(--bevel),var(--glow-gold),var(--token-active)]');
    for (const a of [false, true]) for (const s of [false, true]) expect(initiativeTokenShadow(a, s)).toMatch(/focus-visible:shadow-\[[^\]]*glow-gold/);
  });
});

describe('InitiativeToken', () => {
  it('кнопка 48×48 с data-actor, title, sr-only сводкой; число утоплено и скрыто от AT; иконка типа 24 с title', () => {
    render(<InitiativeToken id="bo" name="Bo Tambernack" type="pc" initiative={15} hp={hp(41, 49)} />);
    const b = screen.getByRole('button', { name: /Bo Tambernack, инициатива 15, хиты 41 из 49/ });
    expect(b).toHaveAttribute('type', 'button');
    expect(b).toHaveAttribute('data-actor', 'bo');
    expect(b).toHaveAttribute('title', 'Bo Tambernack · инициатива 15 · хиты 41/49');
    expect(b).toHaveClass('size-12', 'cursor-pointer');
    expect(b.className).toContain('from-pl');
    expect(b).not.toHaveAttribute('data-active');
    expect(b).not.toHaveAttribute('aria-current');
    expect(b).toHaveAttribute('aria-pressed', 'false');
    expect(b.querySelector('.sr-only')).toHaveTextContent('Bo Tambernack, инициатива 15, хиты 41 из 49');
    expect(init()).toHaveTextContent('15');
    expect(init()).toHaveAttribute('aria-hidden', 'true');
    expect(init()).toHaveClass('type-num-12', 'bg-bg', 'shadow-bevel-in', 'text-t2');
    const icon = within(b).getByRole('img', { name: ENTITY.pc.label });
    expect(icon).toHaveAttribute('width', '24');
    expect(pathsOf(icon)).toEqual(tonePaths(ICONS['ent-pc']).filter(Boolean));
    expect(icon.querySelector('path[fill="var(--tx)"]')).not.toBeNull();
    expect(b.textContent).not.toMatch(EMOJI);
    expect(b.className).not.toMatch(/rounded/);
  });

  it('полоска хитов 5px: жёлоб hp-track с фаской внутрь, заливка по порогу, ширина в процентах от max', () => {
    const { rerender } = render(<InitiativeToken id="bo" name="Bo" type="pc" initiative={15} hp={hp(41, 49)} />);
    const track = token().querySelector('[data-part="hp"]') as HTMLElement;
    expect(track).toHaveClass('h-[5px]', 'bg-hp-track', 'shadow-bevel-in');
    expect(track).toHaveAttribute('aria-hidden', 'true');
    expect(fill()).toHaveClass('bg-hp-high');
    expect(fill()!.style.width).toBe(`${(41 / 49) * 100}%`);
    rerender(<InitiativeToken id="bo" name="Bo" type="pc" initiative={15} hp={hp(20, 49)} />);
    expect(fill()).toHaveClass('bg-hp-mid');
    rerender(<InitiativeToken id="bo" name="Bo" type="pc" initiative={15} hp={hp(5, 49)} />);
    expect(fill()).toHaveClass('bg-hp-low');
    // hp-* — заливки: текстом они не ставятся никому.
    for (const el of token().querySelectorAll('*')) expect(el.className.toString()).not.toMatch(/text-hp-/);
  });

  it('текущий ход: масштаб 125 %, кольцо token-active, плита pl, z-index, aria-current и data-active; число золотое', () => {
    const { rerender } = render(<InitiativeToken id="c" name="Bandit Captain" type="monster" initiative={14} hp={hp(45, 65)} active />);
    const b = token();
    expect(b).toHaveAttribute('data-active', 'true');
    expect(b).toHaveAttribute('aria-current', 'true');
    expect(b).toHaveClass('scale-125', 'bg-pl', 'z-10');
    expect(b.className).toContain('var(--token-active)');
    expect(b.className).not.toContain('from-pl');
    expect(init()).toHaveClass('text-gd-hi');
    expect(init()).not.toHaveClass('text-t2');
    // Движение — только шагами и короче 200 мс.
    expect(b.className).toMatch(/transition:transform_1[0-9]{2}ms_steps/);
    rerender(<InitiativeToken id="c" name="Bandit Captain" type="monster" initiative={14} hp={hp(45, 65)} />);
    expect(token()).not.toHaveClass('scale-125');
    expect(token().className).not.toContain('token-active');
  });

  it('выбранный: aria-pressed и золотое кольцо без масштаба; вместе с ходом — оба кольца', () => {
    const { rerender } = render(<InitiativeToken id="bo" name="Bo" type="pc" initiative={15} hp={hp(41, 49)} selected />);
    expect(token()).toHaveAttribute('aria-pressed', 'true');
    expect(token()).toHaveAttribute('data-selected', 'true');
    expect(token().className).toContain('shadow-[var(--bevel),var(--glow-gold)]');
    expect(token()).not.toHaveClass('scale-125');
    rerender(<InitiativeToken id="bo" name="Bo" type="pc" initiative={15} hp={hp(41, 49)} selected active />);
    expect(token().className).toContain('shadow-[var(--bevel),var(--glow-gold),var(--token-active)]');
    expect(token()).toHaveClass('scale-125');
  });

  it('0 HP: токен гаснет (op-disabled, data-down, иконка t3, заливка 0 %), но остаётся кнопкой с data-actor', () => {
    render(<InitiativeToken id="b3" name="Bandit 3" type="monster" initiative={6} hp={hp(0, 11)} />);
    const b = screen.getByRole('button', { name: /Bandit 3, инициатива 6, 0 хитов из 11/ });
    expect(b).toHaveAttribute('data-down', 'true');
    expect(b).toHaveAttribute('data-actor', 'b3');
    expect(b).toHaveClass('opacity-(--op-disabled)');
    expect(b).toHaveAttribute('title', 'Bandit 3 · инициатива 6 · хиты 0/11');
    const icon = within(b).getByRole('img', { name: ENTITY.monster.label });
    expect(icon.querySelector('path[fill="var(--t3)"]')).not.toBeNull();
    expect(icon.querySelector('path[fill="var(--tx)"]')).toBeNull();
    expect(fill()!.style.width).toBe('0%');
    expect(fill()).toHaveClass('bg-hp-low');
  });

  it('легендарные действия: столько пипок 4×4 gd сверху справа, с title и в сводке; без них блока нет', () => {
    const { rerender } = render(<InitiativeToken id="c" name="Bandit Captain" type="monster" initiative={14} hp={hp(45, 65)} legendary={3} />);
    const p = pips()!;
    expect(p).not.toBeNull();
    expect(p).toHaveAttribute('title', 'Легендарные действия: 3');
    expect(p).toHaveAttribute('aria-hidden', 'true');
    expect(p.children).toHaveLength(3);
    for (const pip of p.children) expect(pip).toHaveClass('size-1', 'bg-gd');
    expect(p).toHaveClass('absolute', 'right-0.5');
    expect(screen.getByRole('button', { name: /легендарных действий 3/ })).toBeInTheDocument();
    rerender(<InitiativeToken id="c" name="Bandit Captain" type="monster" initiative={14} hp={hp(45, 65)} legendary={0} />);
    expect(pips()).toBeNull();
    rerender(<InitiativeToken id="c" name="Bandit Captain" type="monster" initiative={14} hp={hp(45, 65)} />);
    expect(pips()).toBeNull();
  });

  it('слот логова на 20: иконка scale-building с title «Логово», без хитов, число 20', () => {
    render(<InitiativeToken id="lair" name="Пещера" type="location" initiative={20} lair />);
    const b = screen.getByRole('button', { name: /Логово, инициатива 20/ });
    expect(b).toHaveAttribute('data-lair', 'true');
    expect(b).toHaveAttribute('title', 'Логово · инициатива 20');
    const icon = within(b).getByRole('img', { name: 'Логово' });
    expect(pathsOf(icon)).toEqual(tonePaths(ICONS['scale-building']).filter(Boolean));
    expect(init()).toHaveTextContent('20');
    expect(b.querySelector('[data-part="hp"]')).toBeNull();
    expect(b).not.toHaveAttribute('data-down');
    expect(b).not.toHaveClass('opacity-(--op-disabled)');
  });

  it('клик отдаёт id; без onOpen клик не падает', () => {
    const onOpen = vi.fn();
    const { rerender } = render(<InitiativeToken id="bo" name="Bo" type="pc" initiative={15} hp={hp(41, 49)} onOpen={onOpen} />);
    fireEvent.click(token());
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('bo');
    rerender(<InitiativeToken id="bo" name="Bo" type="pc" initiative={15} hp={hp(41, 49)} />);
    expect(() => fireEvent.click(token())).not.toThrow();
  });

  it('сторож: нет эмодзи, нет t3 текстом на плите, нет hex-цветов в классах', () => {
    const { container } = render(<InitiativeToken id="c" name="Bandit Captain" type="monster" initiative={14} hp={hp(45, 65)} legendary={2} active />);
    expect(container.innerHTML).not.toMatch(EMOJI);
    for (const el of [token(), ...token().querySelectorAll('*')]) {
      const cls = el.getAttribute('class') ?? '';
      expect(cls).not.toMatch(/(^|\s)text-t3(\s|$)/);
      expect(cls).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    }
  });
});
