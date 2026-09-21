// ThreadFilter: две строки чипов с подписями «Нить»/«Масштаб» (type-key t3, 72px), чип нити «#Имя»,
// чип масштаба с иконкой scale-* и подписью; пустой фильтр = все (aria-pressed=false у всех); включённый —
// gd-hi и нижняя полоса 3px gd (форма, не только цвет); count в чипе, если передан; клик отдаёт id и
// новое положение; секции без элементов не рисуются. toggleIn — чистая, без дублей; SCALE_ORDER — девять
// уровней, у каждого подпись.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SCALE_LEVELS, type ScaleLevel } from '../engine';
import { tonePaths } from '../icons/Icon';
import { ICONS } from '../icons/icons.generated';
import { SCALE_LABELS, SCALE_ORDER, ThreadFilter, toggleIn, type ThreadFilterScale, type ThreadFilterThread } from './ThreadFilter';

const EMOJI = /\p{Extended_Pictographic}/u;
const pathsOf = (svg: Element) => Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('d'));

const THREADS: ThreadFilterThread[] = [
  { id: 'caravan', name: 'The Missing Caravan', count: 4 },
  { id: 'well', name: 'Old Owl Well', count: 3 },
  { id: 'moon', name: 'Луна и стая' },
];
const SCALES: ThreadFilterScale[] = [{ id: 'region', count: 2 }, { id: 'settlement' }, { id: 'battle' }];

const noop = () => {};
const group = () => screen.getByRole('group', { name: 'Фильтр журнала' });
const threadRow = () => screen.getByRole('group', { name: 'Нить' });
const scaleRow = () => screen.getByRole('group', { name: 'Масштаб' });

describe('SCALE_ORDER и SCALE_LABELS', () => {
  it('девять уровней от космологии к бою — тот же список, что у движка; у каждого русская подпись', () => {
    expect(SCALE_ORDER).toHaveLength(9);
    expect(SCALE_ORDER).toEqual(['cosmology', 'plane', 'system', 'planet', 'continent', 'region', 'settlement', 'building', 'battle']);
    expect(SCALE_ORDER).toBe(SCALE_LEVELS);
    expect(SCALE_LABELS).toEqual({
      cosmology: 'Космология', plane: 'План', system: 'Система', planet: 'Планета', continent: 'Континент',
      region: 'Регион', settlement: 'Поселение', building: 'Здание', battle: 'Бой',
    });
    for (const s of SCALE_ORDER) {
      expect(SCALE_LABELS[s]).toBeTruthy();
      expect(SCALE_LABELS[s]).not.toMatch(EMOJI);
      expect(ICONS[`scale-${s}`]).toBeTruthy();
    }
  });
});

describe('toggleIn', () => {
  it('добавляет без дублей, убирает, порядок остальных сохраняет, исходный список не трогает', () => {
    const list: readonly string[] = ['a', 'b'];
    expect(toggleIn(list, 'c', true)).toEqual(['a', 'b', 'c']);
    expect(toggleIn(list, 'a', true)).toEqual(['a', 'b']);
    expect(toggleIn(list, 'a', false)).toEqual(['b']);
    expect(toggleIn(list, 'z', false)).toEqual(['a', 'b']);
    expect(toggleIn([], 'a', true)).toEqual(['a']);
    expect(toggleIn([], 'a', false)).toEqual([]);
    expect(list).toEqual(['a', 'b']);
    expect(toggleIn(list, 'a', true)).not.toBe(list);
    const scales: readonly ScaleLevel[] = ['region'];
    expect(toggleIn(scales, 'battle', true)).toEqual(['region', 'battle']);
  });
});

describe('ThreadFilter', () => {
  it('две строки с подписями type-key uppercase t3 шириной 72px; чипы — кнопки aria-pressed; пустой фильтр = все, ни один не нажат', () => {
    render(<ThreadFilter threads={THREADS} scales={SCALES} activeThreads={[]} activeScales={[]} onThread={noop} onScale={noop} />);
    expect(group()).toBeInTheDocument();
    const tLabel = within(threadRow()).getByText('Нить');
    expect(tLabel).toHaveClass('type-key', 'uppercase', 'text-t3', 'w-18');
    expect(within(scaleRow()).getByText('Масштаб')).toHaveClass('type-key', 'uppercase', 'text-t3', 'w-18');
    const chips = within(group()).getAllByRole('button');
    expect(chips).toHaveLength(6);
    for (const c of chips) {
      expect(c).toHaveAttribute('type', 'button');
      expect(c).toHaveAttribute('aria-pressed', 'false');
      expect(c).toHaveClass('text-t2', 'shadow-bevel', 'type-body-sm');
      expect(c.className).toContain('from-pl');
      expect(c.className).not.toContain('inset_0_-3px_0_var(--gd)');
    }
    expect(within(threadRow()).getAllByRole('button').map(c => c.textContent)).toEqual(['#The Missing Caravan4', '#Old Owl Well3', '#Луна и стая']);
    expect(group().textContent).not.toMatch(EMOJI);
  });

  it('чип нити: имя «#Имя · count» для ассистивной технологии, title «Фильтр по нити: …», count — type-key t2 только если передан', () => {
    render(<ThreadFilter threads={THREADS} scales={[]} activeThreads={[]} activeScales={[]} onThread={noop} onScale={noop} />);
    const caravan = screen.getByRole('button', { name: '#The Missing Caravan · 4' });
    expect(caravan).toHaveAttribute('title', 'Фильтр по нити: The Missing Caravan');
    expect(caravan).toHaveAttribute('data-thread', 'caravan');
    const count = caravan.querySelector('[data-part="count"]') as HTMLElement;
    expect(count).toHaveTextContent('4');
    expect(count).toHaveClass('type-key', 'text-t2');
    const moon = screen.getByRole('button', { name: '#Луна и стая' });
    expect(moon.querySelector('[data-part="count"]')).toBeNull();
  });

  it('чип масштаба: иконка scale-<id> 16 цветом currentColor с title подписи, подпись SCALE_LABELS, имя «Подпись · count»', () => {
    render(<ThreadFilter threads={[]} scales={SCALES} activeThreads={[]} activeScales={[]} onThread={noop} onScale={noop} />);
    const region = screen.getByRole('button', { name: 'Регион · 2' });
    expect(region).toHaveAttribute('title', 'Фильтр по уровню масштаба: Регион');
    expect(region).toHaveAttribute('data-scale', 'region');
    const icon = within(region).getByRole('img', { name: 'Регион' });
    expect(icon).toHaveAttribute('width', '16');
    expect(pathsOf(icon)).toEqual(tonePaths(ICONS['scale-region']).filter(Boolean));
    expect(icon.querySelector('path[fill*="currentColor"]')).not.toBeNull();
    expect(within(region).getByText('Регион', { selector: 'span' })).toHaveClass('truncate');
    expect(screen.getByRole('button', { name: 'Поселение' })).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: 'Бой' })).getByRole('img', { name: 'Бой' })).toBeInTheDocument();
  });

  it('включённый чип: aria-pressed=true, text-gd-hi и нижняя полоса 3px gd под фаской; остальные — как были', () => {
    render(<ThreadFilter threads={THREADS} scales={SCALES} activeThreads={['well']} activeScales={['battle']} onThread={noop} onScale={noop} />);
    const well = screen.getByRole('button', { name: '#Old Owl Well · 3' });
    expect(well).toHaveAttribute('aria-pressed', 'true');
    expect(well).toHaveClass('text-gd-hi');
    expect(well.className).toContain('shadow-[var(--bevel),inset_0_-3px_0_var(--gd)]');
    expect(well).not.toHaveClass('text-t2');
    const battle = screen.getByRole('button', { name: 'Бой' });
    expect(battle).toHaveAttribute('aria-pressed', 'true');
    expect(battle).toHaveClass('text-gd-hi');
    const off = within(group()).getAllByRole('button').filter(b => b.getAttribute('aria-pressed') === 'false');
    expect(off).toHaveLength(4);
    for (const c of off) expect(c).toHaveClass('text-t2');
  });

  it('клик отдаёт id и новое положение: выключенный → true, включённый → false; компонент сам ничего не переключает', () => {
    const onThread = vi.fn();
    const onScale = vi.fn();
    render(<ThreadFilter threads={THREADS} scales={SCALES} activeThreads={['caravan']} activeScales={[]} onThread={onThread} onScale={onScale} />);
    fireEvent.click(screen.getByRole('button', { name: '#The Missing Caravan · 4' }));
    expect(onThread).toHaveBeenLastCalledWith('caravan', false);
    fireEvent.click(screen.getByRole('button', { name: '#Луна и стая' }));
    expect(onThread).toHaveBeenLastCalledWith('moon', true);
    fireEvent.click(screen.getByRole('button', { name: 'Регион · 2' }));
    expect(onScale).toHaveBeenLastCalledWith('region', true);
    expect(onThread).toHaveBeenCalledTimes(2);
    expect(onScale).toHaveBeenCalledTimes(1);
    // Пропсы не менялись — чип каравана всё ещё нажат.
    expect(screen.getByRole('button', { name: '#The Missing Caravan · 4' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('секция без элементов не рисуется: без нитей — только «Масштаб», без масштабов — только «Нить», без обоих — ничего', () => {
    const { rerender, container } = render(<ThreadFilter threads={[]} scales={SCALES} activeThreads={[]} activeScales={[]} onThread={noop} onScale={noop} />);
    expect(screen.queryByRole('group', { name: 'Нить' })).toBeNull();
    expect(scaleRow()).toBeInTheDocument();
    rerender(<ThreadFilter threads={THREADS} scales={[]} activeThreads={[]} activeScales={[]} onThread={noop} onScale={noop} />);
    expect(threadRow()).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Масштаб' })).toBeNull();
    rerender(<ThreadFilter threads={[]} scales={[]} activeThreads={[]} activeScales={[]} onThread={noop} onScale={noop} />);
    expect(container.innerHTML).toBe('');
  });

  it('сторож: на плите чипа нет text-t3 (подписи строк — вне чипов), нет hex, rounded и эмодзи; у иконок title; className уходит на корень', () => {
    render(<ThreadFilter threads={THREADS} scales={SCALES} activeThreads={['caravan']} activeScales={['region']} onThread={noop} onScale={noop} className="mb-2" />);
    expect(group()).toHaveClass('mb-2');
    for (const chip of within(group()).getAllByRole('button')) {
      for (const el of [chip, ...chip.querySelectorAll('*')]) {
        const cls = el.getAttribute('class') ?? '';
        expect(cls).not.toMatch(/(^|\s)text-t3(\s|$)/);
        expect(cls).not.toMatch(/(^|\s)text-t4(\s|$)/);
        expect(cls).not.toMatch(/#[0-9a-f]{3,6}\b/i);
        expect(cls).not.toMatch(/rounded/);
      }
    }
    for (const el of group().querySelectorAll('*')) expect(el.getAttribute('class') ?? '').not.toMatch(/rounded/);
    for (const icon of group().querySelectorAll('svg')) expect(icon.querySelector('title')?.textContent).toBeTruthy();
    expect(group().textContent).not.toMatch(EMOJI);
  });
});
