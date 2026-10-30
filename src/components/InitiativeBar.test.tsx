// InitiativeBar: подвал 72px с раундом, рядом токенов в переданном порядке (полоса не сортирует), текущий
// и выбранный — по id, «Ход» с клавишей в тултипе, «Закончить бой» только с колбэком; 0 HP остаётся в ряду;
// запас по высоте под масштаб 125 % — отступами, ряд прокручивается по горизонтали.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { seedEngine } from '../campaign';
import { InitiativeBar, type InitiativeBarEntry } from './InitiativeBar';
import { initiativeTokenOf } from './InitiativeToken';

const EMOJI = /\p{Extended_Pictographic}/u;

const ENTRIES: InitiativeBarEntry[] = [
  { id: 'lair', name: 'Пещера', type: 'location', initiative: 20, lair: true },
  { id: 'korrin', name: 'Korrin Battlehammer', type: 'pc', initiative: 18, hp: { current: 49, max: 49, temp: 0 } },
  { id: 'bo', name: 'Bo Tambernack', type: 'pc', initiative: 15, hp: { current: 41, max: 49, temp: 0 } },
  { id: 'captain', name: 'Bandit Captain', type: 'monster', initiative: 14, hp: { current: 45, max: 65, temp: 0 }, legendary: 3 },
  { id: 'bandit-3', name: 'Bandit 3', type: 'monster', initiative: 6, hp: { current: 0, max: 11, temp: 0 } },
];

const bar = () => screen.getByRole('contentinfo', { name: 'Бой' });
const order = () => within(bar()).getByRole('list', { name: 'Порядок инициативы' });
const tokens = () => Array.from(order().querySelectorAll('button[data-actor]')) as HTMLButtonElement[];

describe('InitiativeBar', () => {
  it('footer «Бой» высотой bar-combat на плите; раунд — подпись type-key и число type-num-24; отступ 6px под масштаб', () => {
    render(<InitiativeBar round={2} entries={ENTRIES} onNextTurn={() => {}} />);
    const f = bar();
    expect(f.tagName).toBe('FOOTER');
    expect(f).toHaveClass('h-bar-combat', 'shadow-plate', 'py-1.5', 'px-3');
    expect(f.className).toContain('from-pl');
    const round = f.querySelector('[data-part="round"]') as HTMLElement;
    expect(round).toHaveTextContent('Раунд2');
    expect(within(round).getByText('Раунд')).toHaveClass('type-key', 'uppercase', 'text-t2');
    expect(within(round).getByText('2')).toHaveClass('type-num-24', 'text-tx');
    expect(order()).toHaveClass('overflow-x-auto', 'gap-2', 'h-full');
    expect(f.textContent).not.toMatch(EMOJI);
  });

  it('токены — в переданном порядке, по одному на запись, с data-actor; логово и 0 HP в ряду остаются', () => {
    render(<InitiativeBar round={1} entries={ENTRIES} onNextTurn={() => {}} />);
    expect(within(order()).getAllByRole('listitem')).toHaveLength(5);
    expect(tokens().map(t => t.dataset.actor)).toEqual(['lair', 'korrin', 'bo', 'captain', 'bandit-3']);
    expect(tokens().map(t => t.querySelector('[data-part="init"]')?.textContent)).toEqual(['20', '18', '15', '14', '6']);
    const down = tokens().find(t => t.dataset.actor === 'bandit-3')!;
    expect(down).toHaveAttribute('data-down', 'true');
    expect(down).toHaveClass('opacity-(--op-disabled)');
    const lair = tokens().find(t => t.dataset.actor === 'lair')!;
    expect(lair).toHaveAttribute('data-lair', 'true');
    expect(within(lair).getByRole('img', { name: 'Логово' })).toBeInTheDocument();
    const captain = tokens().find(t => t.dataset.actor === 'captain')!;
    expect(captain.querySelector('[data-part="legendary"]')?.children).toHaveLength(3);
  });

  it('activeId — ровно один токен с aria-current, масштабом и z-index; selectedId — aria-pressed; остальные без', () => {
    const { rerender } = render(<InitiativeBar round={2} entries={ENTRIES} activeId="bo" selectedId="captain" onNextTurn={() => {}} />);
    const active = tokens().filter(t => t.hasAttribute('data-active'));
    expect(active.map(t => t.dataset.actor)).toEqual(['bo']);
    expect(active[0]).toHaveAttribute('aria-current', 'true');
    expect(active[0]).toHaveClass('scale-125', 'z-10');
    expect(tokens().filter(t => t.getAttribute('aria-pressed') === 'true').map(t => t.dataset.actor)).toEqual(['captain']);
    expect(tokens().filter(t => t.classList.contains('scale-125'))).toHaveLength(1);
    rerender(<InitiativeBar round={2} entries={ENTRIES} activeId="captain" onNextTurn={() => {}} />);
    expect(tokens().filter(t => t.hasAttribute('data-active')).map(t => t.dataset.actor)).toEqual(['captain']);
    expect(tokens().filter(t => t.getAttribute('aria-pressed') === 'true')).toHaveLength(0);
    rerender(<InitiativeBar round={2} entries={ENTRIES} activeId="nobody" onNextTurn={() => {}} />);
    expect(tokens().filter(t => t.hasAttribute('data-active'))).toHaveLength(0);
  });

  it('«Ход» зовёт onNextTurn, тултип с клавишей; «Закончить бой» — только с onEnd; клик по токену — onOpen(id)', () => {
    const onNextTurn = vi.fn();
    const onEnd = vi.fn();
    const onOpen = vi.fn();
    const { rerender } = render(<InitiativeBar round={2} entries={ENTRIES} onNextTurn={onNextTurn} onOpen={onOpen} />);
    const next = within(bar()).getByRole('button', { name: 'Ход' });
    expect(next).toHaveAttribute('title', 'Следующий ход · Space');
    expect(next).toHaveAttribute('type', 'button');
    expect(next).toHaveClass('type-num-12', 'uppercase', 'bg-cd', 'shadow-bevel', 'text-t2');
    expect(next.className).toContain('focus-visible:shadow-[var(--bevel),var(--glow-gold)]');
    fireEvent.click(next);
    expect(onNextTurn).toHaveBeenCalledTimes(1);
    expect(within(bar()).queryByRole('button', { name: 'Закончить бой' })).toBeNull();
    fireEvent.click(tokens()[2]);
    expect(onOpen).toHaveBeenCalledWith('bo');
    rerender(<InitiativeBar round={2} entries={ENTRIES} onNextTurn={onNextTurn} onEnd={onEnd} />);
    const end = within(bar()).getByRole('button', { name: 'Закончить бой' });
    expect(end).toHaveAttribute('title', 'Закончить бой');
    fireEvent.click(end);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onNextTurn).toHaveBeenCalledTimes(1);
  });

  it('из сида: порядок по инициативе через initiativeTokenOf — Korrin 18 первый, Bandit 3 последний', () => {
    const store = seedEngine();
    const { actors } = store.getState().state;
    const entries = Object.values(actors)
      .map(a => initiativeTokenOf(a, a.initiative ?? 0))
      .sort((a, b) => b.initiative - a.initiative);
    render(<InitiativeBar round={1} entries={entries} activeId={entries[0].id} onNextTurn={() => {}} />);
    expect(tokens().map(t => t.dataset.actor)).toEqual(['korrin', 'bo', 'captain', 'lyra', 'bandit-1', 'aldric', 'bandit-2', 'bandit-3']);
    expect(tokens()[0]).toHaveAttribute('aria-current', 'true');
    expect(tokens()[1]).toHaveAttribute('title', 'Bo Tambernack · инициатива 15 · хиты 41/49');
  });

  describe('легендарные действия (Q13)', () => {
    const DRAGON: InitiativeBarEntry = {
      id: 'dragon', name: 'Adult Red Dragon', type: 'monster', initiative: 12, hp: { current: 256, max: 256, temp: 0 },
      legendaryActions: {
        max: 3, spent: 1,
        intro: 'The dragon can take 3 legendary actions, choosing from the options below.',
        options: [
          { name: 'Detect', text: 'The dragon makes a Wisdom (Perception) check.', cost: 1 },
          { name: 'Wing Attack (Costs 2 Actions)', text: 'The dragon beats its wings.', cost: 2 },
        ],
      },
    };
    const pipsBtn = () => bar().querySelector('[data-legendary="dragon"]') as HTMLButtonElement | null;

    it('колонка пипок справа от токена: есть — gd, потрачено — утоплено; число в имени и тултипе; без колбэков — колонки нет', () => {
      const { rerender } = render(<InitiativeBar round={1} entries={[DRAGON]} onNextTurn={() => {}} onLegendarySpend={() => {}} />);
      const btn = pipsBtn()!;
      expect(btn).toHaveAttribute('title', 'Легендарные действия: 2 из 3 · варианты');
      expect(btn).toHaveAccessibleName('Легендарные действия: 2 из 3 · варианты: Adult Red Dragon');
      expect(Array.from(btn.children).map(p => (p as HTMLElement).dataset.on)).toEqual(['true', 'true', 'false']);
      expect(btn.previousElementSibling).toHaveAttribute('data-actor', 'dragon');
      expect(tokens()).toHaveLength(1);
      rerender(<InitiativeBar round={1} entries={[DRAGON]} onNextTurn={() => {}} />);
      expect(pipsBtn()).toBeNull();
    });

    it('щелчок — варианты над полосой дословно; «Потратить 2» при двух оставшихся зовёт onLegendarySpend и закрывает; дороже остатка — недоступно', () => {
      const onSpend = vi.fn();
      const onRestore = vi.fn();
      const { rerender } = render(<InitiativeBar round={1} entries={[DRAGON]} onNextTurn={() => {}} onLegendarySpend={onSpend} onLegendaryRestore={onRestore} />);
      fireEvent.click(pipsBtn()!);
      const pop = within(bar()).getByRole('dialog', { name: 'Легендарные действия: Adult Red Dragon' });
      expect(pop).toHaveClass('absolute', 'bottom-full', 'shadow-float', 'bg-pn');
      expect(pop).toHaveTextContent('The dragon can take 3 legendary actions, choosing from the options below.');
      expect(pop).toHaveTextContent('The dragon beats its wings.');
      expect(pop).toHaveTextContent('2 из 3');
      fireEvent.click(within(pop).getByRole('button', { name: 'Вернуть одно' }));
      expect(onRestore).toHaveBeenCalledWith('dragon', 1);
      fireEvent.click(within(pop).getByRole('button', { name: 'Потратить 2' }));
      expect(onSpend).toHaveBeenCalledWith('dragon', 2);
      expect(within(bar()).queryByRole('dialog')).toBeNull();
      // Осталось одно — вариант за два недоступен; ничего не потрачено — «Вернуть одно» нет.
      rerender(<InitiativeBar round={1} entries={[{ ...DRAGON, legendaryActions: { ...DRAGON.legendaryActions!, spent: 2 } }]} onNextTurn={() => {}} onLegendarySpend={onSpend} onLegendaryRestore={onRestore} />);
      fireEvent.click(pipsBtn()!);
      expect(within(bar()).getByRole('button', { name: 'Потратить 2' })).toBeDisabled();
      expect(within(bar()).getByRole('button', { name: 'Потратить 1' })).toBeEnabled();
      rerender(<InitiativeBar round={1} entries={[{ ...DRAGON, legendaryActions: { ...DRAGON.legendaryActions!, spent: 0 } }]} onNextTurn={() => {}} onLegendarySpend={onSpend} onLegendaryRestore={onRestore} />);
      expect(within(bar()).queryByRole('button', { name: 'Вернуть одно' })).toBeNull();
    });

    it('Esc и повторный щелчок закрывают варианты; Esc дальше полосы не уходит', () => {
      const onWindowKey = vi.fn();
      window.addEventListener('keydown', onWindowKey);
      render(<InitiativeBar round={1} entries={[DRAGON]} onNextTurn={() => {}} onLegendarySpend={() => {}} />);
      fireEvent.click(pipsBtn()!);
      expect(pipsBtn()).toHaveAttribute('aria-expanded', 'true');
      fireEvent.keyDown(pipsBtn()!, { key: 'Escape' });
      expect(within(bar()).queryByRole('dialog')).toBeNull();
      expect(onWindowKey).not.toHaveBeenCalled();
      fireEvent.click(pipsBtn()!);
      fireEvent.click(pipsBtn()!);
      expect(within(bar()).queryByRole('dialog')).toBeNull();
      window.removeEventListener('keydown', onWindowKey);
    });
  });

  it('сторож: t3 текстом на плите не ставится; hex-цветов в классах нет; пустой ряд — список без токенов', () => {
    render(<InitiativeBar round={1} entries={[]} onNextTurn={() => {}} />);
    for (const el of [bar(), ...bar().querySelectorAll('*')]) {
      const cls = el.getAttribute('class') ?? '';
      expect(cls).not.toMatch(/(^|\s)text-t3(\s|$)/);
      expect(cls).not.toMatch(/#[0-9a-f]{3,6}\b/i);
      expect(cls).not.toMatch(/rounded/);
    }
    expect(tokens()).toHaveLength(0);
  });
});
