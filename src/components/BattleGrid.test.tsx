// BattleGrid: провал wl с фаской внутрь и размером cols×rows×cell; SVG-слой скрыт от AT — сетка t4, стены cd/br,
// конус SRD (вершина у грани клетки источника, дальний край шириной в длину); токены — кнопки на клетках с
// хитами, состояниями (до трёх иконок), «в шаблоне» по решению мастера, активный/выбранный/лежащий;
// проекция актёра из сида.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { seedEngine } from '../campaign';
import { tonePaths } from '../icons/Icon';
import { ICONS } from '../icons/icons.generated';
import { CONDITIONS } from '../rules/srd';
import {
  BattleGrid, TOKEN_CONDITIONS_MAX, battleTokenDescription, battleTokenOf, battleTokenShadow, battleTokenTitle, conePoints,
  type BattleToken,
} from './BattleGrid';
import { ENTITY } from './EntityCard';

const EMOJI = /\p{Extended_Pictographic}/u;
const pathsOf = (svg: Element) => Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('d'));

const TOKENS: BattleToken[] = [
  { id: 'bo', name: 'Bo Tambernack', type: 'pc', x: 0, y: 3, hp: { current: 41, max: 49, temp: 0 }, conditions: [], down: false },
  { id: 'bandit-1', name: 'Bandit 1', type: 'monster', x: 5, y: 2, hp: { current: 11, max: 11, temp: 0 }, conditions: [], down: false },
  { id: 'bandit-2', name: 'Bandit 2', type: 'monster', x: 5, y: 4, hp: { current: 8, max: 11, temp: 0 }, conditions: ['prone'], down: false },
  { id: 'captain', name: 'Bandit Captain', type: 'monster', x: 8, y: 3, hp: { current: 45, max: 65, temp: 0 }, conditions: [], down: false },
  { id: 'bandit-3', name: 'Bandit 3', type: 'monster', x: 9, y: 6, hp: { current: 0, max: 11, temp: 0 }, conditions: [], down: true },
];

const grid = () => screen.getByRole('group', { name: 'Боевая сетка' });
const svg = () => grid().querySelector('svg') as SVGSVGElement;
const tokenOf = (id: string) => grid().querySelector(`button[data-actor="${id}"]`) as HTMLButtonElement;

describe('проекции и геометрия', () => {
  it('battleTokenOf: тип из kind, клетка из pos, хиты — та же тройка, состояния — ключи, лежит при 0 хитов', () => {
    const store = seedEngine();
    const bo = store.getState().state.actors.bo;
    const t = battleTokenOf(bo, { x: 0, y: 3 });
    expect(t).toEqual({ id: 'bo', name: 'Bo Tambernack', type: 'pc', x: 0, y: 3, hp: bo.hp, conditions: [], down: false });
    expect(t.hp).toBe(bo.hp);
    const prone = battleTokenOf({ ...bo, conditions: { prone: {}, poisoned: { until: 'x' }, exhaustion: { level: 2 } } }, { x: 1, y: 1 });
    expect(prone.conditions).toEqual(['prone', 'poisoned', 'exhaustion']);
    store.getState().damage('bandit-3', 11);
    const dead = battleTokenOf(store.getState().state.actors['bandit-3'], { x: 9, y: 6 });
    expect(dead.down).toBe(true);
    expect(dead.hp?.current).toBe(0);
    expect(dead.type).toBe('monster');
    // Стол игроков (Q1): у монстра нет хитов числом — состояние словами.
    const seen = battleTokenOf(store.getState().state.actors['bandit-3'], { x: 9, y: 6 }, { players: true });
    expect(seen.hp).toBeUndefined();
    expect(seen).toMatchObject({ status: 'повержен', down: true });
  });

  it('conePoints: вершина у грани клетки источника, дальний край на length клеток шириной length (SRD)', () => {
    // Запад от (8,3) на 3 клетки при 48px: вершина на левой грани клетки, край на x=240 от y=96 до 240.
    expect(conePoints({ x: 8, y: 3, dir: 'w', length: 3 }, 48)).toBe('384,168 240,96 240,240');
    expect(conePoints({ x: 0, y: 0, dir: 'e', length: 2 }, 10)).toBe('10,5 30,15 30,-5');
    expect(conePoints({ x: 2, y: 2, dir: 'n', length: 1 }, 48)).toBe('120,96 144,48 96,48');
    expect(conePoints({ x: 2, y: 2, dir: 's', length: 2 }, 48)).toBe('120,144 72,240 168,240');
  });

  it('title и сводка: «Имя · 45/65 HP», задетый — «· в шаблоне»; сводка с клеткой, хитами словами, «лежит» и состояниями', () => {
    expect(battleTokenTitle(TOKENS[3], false)).toBe('Bandit Captain · 45/65 HP');
    expect(battleTokenTitle(TOKENS[1], true)).toBe('Bandit 1 · 11/11 HP · в шаблоне');
    expect(battleTokenDescription(TOKENS[0], false)).toBe('Bo Tambernack, клетка 0, 3, хиты 41 из 49');
    expect(battleTokenDescription(TOKENS[2], true)).toBe('Bandit 2, клетка 5, 4, хиты 8 из 11, в шаблоне, состояния: Сбит с ног');
    expect(battleTokenDescription(TOKENS[4], false)).toBe('Bandit 3, клетка 9, 6, 0 хитов из 11, лежит');
    expect(battleTokenDescription({ ...TOKENS[0], hp: { current: 32, max: 32, temp: 5 } }, false)).toBe('Bo Tambernack, клетка 0, 3, хиты 32 из 32, временные 5');
  });

  it('тень: восемь сочетаний — фаска всегда, gd при выборе, fx-buff-hi при шаблоне (под золотом — на 4px), token-active снаружи, фокус добавляет gd', () => {
    const seen = new Set<string>();
    for (const a of [false, true]) for (const s of [false, true]) for (const h of [false, true]) {
      const cls = battleTokenShadow(a, s, h);
      seen.add(cls);
      expect(cls).toMatch(/^shadow-(bevel|\[var\(--bevel\))/);
      expect(cls).toMatch(/focus-visible:shadow-\[[^\]]*glow-gold/);
      expect(cls.includes('token-active')).toBe(a);
      expect(/^shadow-\S*glow-gold/.test(cls)).toBe(s);
      expect(/^shadow-\S*fx-buff-hi/.test(cls)).toBe(h);
      if (s && h) expect(cls).toContain('inset_0_0_0_4px_var(--fx-buff-hi)');
      if (!s && h) expect(cls).toMatch(/^shadow-\S*inset_0_0_0_2px_var\(--fx-buff-hi\)/);
    }
    expect(seen.size).toBe(8);
  });
});

describe('BattleGrid', () => {
  it('group «Боевая сетка» на провале с фаской внутрь, размер cols×rows×cell; клетка по умолчанию 48', () => {
    const { rerender } = render(<BattleGrid cols={12} rows={8} tokens={[]} />);
    expect(grid()).toHaveClass('relative', 'bg-wl', 'shadow-bevel-in');
    expect(grid().style.width).toBe('576px');
    expect(grid().style.height).toBe('384px');
    expect(grid()).toHaveAttribute('data-cols', '12');
    rerender(<BattleGrid cols={4} rows={2} cell={72} tokens={[]} />);
    expect(grid().style.width).toBe('288px');
    expect(grid().style.height).toBe('144px');
  });

  it('SVG скрыт от AT: линии сетки (cols+1)+(rows+1) цветом t4; стены — cd со штрихом br; без стен и конуса их нет', () => {
    const { rerender } = render(<BattleGrid cols={12} rows={8} tokens={[]} walls={[{ x: 6, y: 0, h: 2 }, { x: 10, y: 3, w: 2 }]} />);
    expect(svg()).toHaveAttribute('aria-hidden', 'true');
    expect(svg()).toHaveAttribute('width', '576');
    const lines = svg().querySelectorAll('line');
    expect(lines).toHaveLength(13 + 9);
    for (const l of lines) expect(l).toHaveAttribute('stroke', 'var(--t4)');
    const walls = svg().querySelectorAll('rect[data-part="wall"]');
    expect(walls).toHaveLength(2);
    expect(walls[0]).toHaveAttribute('x', '288');
    expect(walls[0]).toHaveAttribute('y', '0');
    expect(walls[0]).toHaveAttribute('width', '48');
    expect(walls[0]).toHaveAttribute('height', '96');
    expect(walls[1]).toHaveAttribute('width', '96');
    expect(walls[1]).toHaveAttribute('height', '48');
    for (const w of walls) {
      expect(w).toHaveAttribute('fill', 'var(--cd)');
      expect(w).toHaveAttribute('stroke', 'var(--br)');
    }
    expect(svg().querySelector('polygon')).toBeNull();
    rerender(<BattleGrid cols={12} rows={8} tokens={[]} />);
    expect(svg().querySelectorAll('rect')).toHaveLength(0);
  });

  it('конус: полигон fx-buff с прозрачностью .28, штрих fx-buff-hi пунктиром, точки по conePoints', () => {
    render(<BattleGrid cols={12} rows={8} tokens={[]} cone={{ x: 8, y: 3, dir: 'w', length: 3 }} />);
    const cone = svg().querySelector('polygon[data-part="cone"]')!;
    expect(cone).not.toBeNull();
    expect(cone).toHaveAttribute('points', '384,168 240,96 240,240');
    expect(cone).toHaveAttribute('fill', 'var(--fx-buff)');
    expect(cone).toHaveAttribute('fill-opacity', '0.28');
    expect(cone).toHaveAttribute('stroke', 'var(--fx-buff-hi)');
    expect(cone).toHaveAttribute('stroke-dasharray', '4 4');
  });

  it('токен: кнопка на клетке (cell−4 с отступом 2), data-actor, title, sr-only «клетка x, y», иконка типа 24, полоска хитов', () => {
    render(<BattleGrid cols={12} rows={8} tokens={TOKENS} />);
    expect(grid().querySelectorAll('button[data-actor]')).toHaveLength(5);
    const bo = tokenOf('bo');
    expect(bo).toHaveAttribute('type', 'button');
    expect(bo).toHaveAttribute('title', 'Bo Tambernack · 41/49 HP');
    expect(bo.style.left).toBe('2px');
    expect(bo.style.top).toBe(`${3 * 48 + 2}px`);
    expect(bo.style.width).toBe('44px');
    expect(bo.style.height).toBe('44px');
    expect(bo).toHaveClass('absolute', 'cursor-pointer');
    expect(bo.className).toContain('from-pl');
    expect(bo.querySelector('.sr-only')).toHaveTextContent('Bo Tambernack, клетка 0, 3, хиты 41 из 49');
    expect(screen.getByRole('button', { name: /клетка 0, 3/ })).toBe(bo);
    const icon = within(bo).getByRole('img', { name: ENTITY.pc.label });
    expect(icon).toHaveAttribute('width', '24');
    expect(pathsOf(icon)).toEqual(tonePaths(ICONS['ent-pc']).filter(Boolean));
    const fill = bo.querySelector('[data-part="hp"] [data-part="fill"]') as HTMLElement;
    expect(fill).toHaveClass('bg-hp-high');
    expect(fill.style.width).toBe(`${(41 / 49) * 100}%`);
    expect(bo.querySelector('[data-part="hp"]')).toHaveClass('h-[5px]', 'bg-hp-track', 'shadow-bevel-in');
    expect(bo).not.toHaveAttribute('aria-current');
    expect(bo).toHaveAttribute('aria-pressed', 'false');
    expect(bo.querySelector('[data-part="conditions"]')).toBeNull();
    const captain = tokenOf('captain');
    expect(captain.style.left).toBe(`${8 * 48 + 2}px`);
    expect(captain.style.top).toBe(`${3 * 48 + 2}px`);
  });

  it('активный: плита pl, кольцо token-active, aria-current, z-index, без масштаба; выбранный — aria-pressed и золото', () => {
    render(<BattleGrid cols={12} rows={8} tokens={TOKENS} activeId="captain" selectedId="bo" />);
    const captain = tokenOf('captain');
    expect(captain).toHaveAttribute('data-active', 'true');
    expect(captain).toHaveAttribute('aria-current', 'true');
    expect(captain).toHaveClass('bg-pl', 'z-10');
    expect(captain.className).toContain('var(--token-active)');
    expect(captain.className).not.toMatch(/scale-/);
    expect(grid().querySelectorAll('[data-active]')).toHaveLength(1);
    const bo = tokenOf('bo');
    expect(bo).toHaveAttribute('aria-pressed', 'true');
    expect(bo).toHaveAttribute('data-selected', 'true');
    expect(bo.className).toContain('shadow-[var(--bevel),var(--glow-gold)]');
    expect(bo).not.toHaveAttribute('aria-current');
  });

  it('задетый шаблоном: внутреннее кольцо fx-buff-hi, data-affected, «· в шаблоне» в title и сводке; решает список, не конус', () => {
    render(<BattleGrid cols={12} rows={8} tokens={TOKENS} cone={{ x: 8, y: 3, dir: 'w', length: 3 }} affected={['bandit-1', 'bandit-2']} />);
    for (const id of ['bandit-1', 'bandit-2']) {
      const t = tokenOf(id);
      expect(t).toHaveAttribute('data-affected', 'true');
      expect(t.className).toContain('inset_0_0_0_2px_var(--fx-buff-hi)');
      expect(t.title).toMatch(/ · в шаблоне$/);
      expect(t.querySelector('.sr-only')).toHaveTextContent('в шаблоне');
    }
    // Капитан — источник конуса и геометрически в его вершине, но мастер его не назвал.
    expect(tokenOf('captain')).not.toHaveAttribute('data-affected');
    expect(tokenOf('captain').className).not.toContain('fx-buff-hi');
    expect(tokenOf('captain').title).toBe('Bandit Captain · 45/65 HP');
  });

  it('лежащий (0 HP): гаснет op-disabled, data-down, иконка t3, заливка 0 %, остаётся кнопкой на клетке', () => {
    render(<BattleGrid cols={12} rows={8} tokens={TOKENS} />);
    const dead = tokenOf('bandit-3');
    expect(dead).toHaveAttribute('data-down', 'true');
    expect(dead).toHaveClass('opacity-(--op-disabled)');
    expect(dead).toHaveAttribute('title', 'Bandit 3 · 0/11 HP');
    expect(dead.querySelector('.sr-only')).toHaveTextContent('0 хитов из 11, лежит');
    const icon = within(dead).getByRole('img', { name: ENTITY.monster.label });
    expect(icon.querySelector('path[fill="var(--t3)"]')).not.toBeNull();
    expect((dead.querySelector('[data-part="fill"]') as HTMLElement).style.width).toBe('0%');
    expect(dead.querySelector('[data-part="fill"]')).toHaveClass('bg-hp-low');
    expect(dead.style.left).toBe(`${9 * 48 + 2}px`);
  });

  it('состояния: до трёх иконок 16 сверху справа с title из SRD, бафф — fx-buff-hi, дебафф — fx-debuff-hi; четвёртое не рисуется, в сводке — все', () => {
    const many: BattleToken = { ...TOKENS[2], id: 'x', conditions: ['prone', 'invisible', 'poisoned', 'frightened'] };
    render(<BattleGrid cols={12} rows={8} tokens={[many]} />);
    const t = tokenOf('x');
    const box = t.querySelector('[data-part="conditions"]') as HTMLElement;
    expect(box).toHaveClass('absolute', '-top-2', '-right-1');
    const icons = within(box).getAllByRole('img');
    expect(icons).toHaveLength(TOKEN_CONDITIONS_MAX);
    expect(icons.map(i => i.getAttribute('aria-label'))).toEqual([CONDITIONS.prone.label, CONDITIONS.invisible.label, CONDITIONS.poisoned.label]);
    for (const i of icons) expect(i).toHaveAttribute('width', '16');
    expect(pathsOf(icons[0])).toEqual(tonePaths(ICONS['cond-prone']).filter(Boolean));
    // Тон иконки — от токена: cond-invisible рисуется без базового тона, поэтому ищется любой тон от нужного цвета.
    expect(icons[0].querySelector('path[fill*="--fx-debuff-hi"]')).not.toBeNull();
    expect(icons[0].querySelector('path[fill*="--fx-buff-hi"]')).toBeNull();
    expect(icons[1].querySelector('path[fill*="--fx-buff-hi"]')).not.toBeNull();
    expect(icons[1].querySelector('path[fill*="--fx-debuff-hi"]')).toBeNull();
    expect(within(box).queryByRole('img', { name: CONDITIONS.frightened.label })).toBeNull();
    expect(t.querySelector('.sr-only')).toHaveTextContent(`состояния: ${[CONDITIONS.prone.label, CONDITIONS.invisible.label, CONDITIONS.poisoned.label, CONDITIONS.frightened.label].join(', ')}`);
  });

  it('клик по токену — onSelect(id); без onSelect не падает; без токенов — только сетка', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<BattleGrid cols={12} rows={8} tokens={TOKENS} onSelect={onSelect} />);
    fireEvent.click(tokenOf('bandit-2'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('bandit-2');
    rerender(<BattleGrid cols={12} rows={8} tokens={TOKENS} />);
    expect(() => fireEvent.click(tokenOf('bo'))).not.toThrow();
    rerender(<BattleGrid cols={12} rows={8} tokens={[]} />);
    expect(grid().querySelectorAll('button')).toHaveLength(0);
    expect(svg()).not.toBeNull();
  });

  it('сторож: нет эмодзи, нет text-t3, нет hex-цветов и радиусов в классах, у всех иконок title', () => {
    const { container } = render(
      <BattleGrid cols={12} rows={8} tokens={TOKENS} walls={[{ x: 6, y: 0, h: 2 }]} cone={{ x: 8, y: 3, dir: 'w', length: 3 }} affected={['bandit-1']} activeId="captain" selectedId="bo" />
    );
    expect(container.innerHTML).not.toMatch(EMOJI);
    for (const el of [grid(), ...grid().querySelectorAll('*')]) {
      const cls = el.getAttribute('class') ?? '';
      expect(cls).not.toMatch(/(^|\s)text-t3(\s|$)/);
      expect(cls).not.toMatch(/#[0-9a-f]{3,6}\b/i);
      expect(cls).not.toMatch(/rounded/);
    }
    for (const icon of grid().querySelectorAll('button svg')) expect(icon.querySelector('title')?.textContent).toBeTruthy();
  });
});
