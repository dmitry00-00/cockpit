// CelestialBar: группа «Небесные тела» — строка type-body-sm t2 с зазором 12px; луна — иконка фазы цветом
// src-canon с title из MOON_LABELS и той же подписью; ближайшее событие — scale-system цветом ent-plane,
// подпись и отсчёт tx; план — scale-plane, только если передан (на Материальном строки нет).
// MOON_LABELS/MOON_ICONS — по одной на каждую из четырёх фаз, иконки есть в наборе.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { tonePaths } from '../icons/Icon';
import { ICONS } from '../icons/icons.generated';
import { CelestialBar, MOON_ICONS, MOON_LABELS, MOON_PHASES, type MoonPhase } from './CelestialBar';

const EMOJI = /\p{Extended_Pictographic}/u;
const pathsOf = (svg: Element) => Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('d'));

const bar = () => screen.getByRole('group', { name: 'Небесные тела' });
const part = (name: string) => bar().querySelector(`[data-part="${name}"]`) as HTMLElement | null;

describe('MOON_PHASES, MOON_LABELS и MOON_ICONS', () => {
  it('четыре фазы по циклу; у каждой подпись с Selûne латиницей и своя иконка moon-* из набора', () => {
    expect(MOON_PHASES).toEqual(['new', 'waxing', 'full', 'waning']);
    expect(MOON_LABELS).toEqual({ new: 'Selûne новая', waxing: 'Selûne растёт', full: 'Selûne полная', waning: 'Selûne убывает' });
    expect(MOON_ICONS).toEqual({ new: 'moon-new', waxing: 'moon-waxing', full: 'moon-full', waning: 'moon-waning' });
    for (const p of MOON_PHASES) {
      expect(MOON_LABELS[p]).toContain('Selûne');
      expect(MOON_LABELS[p]).not.toMatch(EMOJI);
      expect(ICONS[MOON_ICONS[p]]).toBeTruthy();
    }
    expect(new Set(Object.values(MOON_ICONS)).size).toBe(4);
  });
});

describe('CelestialBar', () => {
  it('только луна: группа type-body-sm t2 с gap-3; иконка фазы 16 цветом src-canon с title подписи, подпись рядом; ни события, ни плана', () => {
    render(<CelestialBar moon="waxing" />);
    expect(bar()).toHaveClass('type-body-sm', 'text-t2', 'gap-3', 'whitespace-nowrap');
    const moon = part('moon') as HTMLElement;
    expect(moon).toHaveAttribute('data-moon', 'waxing');
    expect(moon).toHaveAttribute('title', 'Фаза Selûne: Selûne растёт');
    expect(moon).toHaveTextContent('Selûne растёт');
    const icon = within(moon).getByRole('img', { name: 'Selûne растёт' });
    expect(icon).toHaveAttribute('width', '16');
    expect(pathsOf(icon)).toEqual(tonePaths(ICONS['moon-waxing']).filter(Boolean));
    expect(icon.querySelector('path[fill*="--src-canon"]')).not.toBeNull();
    expect(part('next')).toBeNull();
    expect(part('plane')).toBeNull();
    expect(bar().querySelectorAll('svg')).toHaveLength(1);
  });

  it('каждая фаза рисует свою иконку и подпись', () => {
    const { rerender } = render(<CelestialBar moon="new" />);
    for (const p of MOON_PHASES as readonly MoonPhase[]) {
      rerender(<CelestialBar moon={p} />);
      const icon = within(part('moon') as HTMLElement).getByRole('img', { name: MOON_LABELS[p] });
      expect(pathsOf(icon)).toEqual(tonePaths(ICONS[MOON_ICONS[p]]).filter(Boolean));
      expect(part('moon')).toHaveTextContent(MOON_LABELS[p]);
    }
  });

  it('ближайшее событие: scale-system 16 цветом ent-plane с title «Ближайшее небесное событие», подпись t2 и отсчёт tx', () => {
    render(<CelestialBar moon="full" next={{ label: 'Полнолуние', countdown: 'через 3 дня' }} />);
    const next = part('next') as HTMLElement;
    expect(next).toHaveAttribute('title', 'Ближайшее небесное событие');
    const icon = within(next).getByRole('img', { name: 'Ближайшее небесное событие' });
    expect(icon).toHaveAttribute('width', '16');
    expect(pathsOf(icon)).toEqual(tonePaths(ICONS['scale-system']).filter(Boolean));
    expect(icon.querySelector('path[fill*="--ent-plane"]')).not.toBeNull();
    expect(within(next).getByText('Полнолуние')).not.toHaveClass('text-tx');
    const count = next.querySelector('[data-part="countdown"]') as HTMLElement;
    expect(count).toHaveTextContent('через 3 дня');
    expect(count).toHaveClass('text-tx');
    expect(part('plane')).toBeNull();
  });

  it('план — только если передан: scale-plane 16 цветом ent-plane, title «Текущий план», имя латиницей как пришло; пустая строка = нет плана', () => {
    const { rerender } = render(<CelestialBar moon="full" next={{ label: 'Соединение Selûne и Tears', countdown: 'через 41 день' }} plane="Feywild" />);
    const plane = part('plane') as HTMLElement;
    expect(plane).toHaveAttribute('title', 'Текущий план');
    expect(plane).toHaveTextContent('Feywild');
    const icon = within(plane).getByRole('img', { name: 'Текущий план' });
    expect(pathsOf(icon)).toEqual(tonePaths(ICONS['scale-plane']).filter(Boolean));
    expect(icon.querySelector('path[fill*="--ent-plane"]')).not.toBeNull();
    // Порядок частей: луна · событие · план.
    expect(Array.from(bar().children).map(c => c.getAttribute('data-part'))).toEqual(['moon', 'next', 'plane']);
    rerender(<CelestialBar moon="full" plane="" />);
    expect(part('plane')).toBeNull();
    expect(part('next')).toBeNull();
  });

  it('сторож: нет эмодзи, hex, rounded, text-t3 и text-t4 (полоса часов — плита); у каждой иконки title; className уходит на корень', () => {
    const { container } = render(<CelestialBar moon="waning" next={{ label: 'Новолуние', countdown: 'через 5 дней' }} plane="Shadowfell" className="ml-4" />);
    expect(bar()).toHaveClass('ml-4');
    expect(container.innerHTML).not.toMatch(EMOJI);
    for (const el of [bar(), ...bar().querySelectorAll('*')]) {
      const cls = el.getAttribute('class') ?? '';
      expect(cls).not.toMatch(/#[0-9a-f]{3,6}\b/i);
      expect(cls).not.toMatch(/rounded/);
      expect(cls).not.toMatch(/(^|\s)text-t3(\s|$)/);
      expect(cls).not.toMatch(/(^|\s)text-t4(\s|$)/);
    }
    const icons = bar().querySelectorAll('svg');
    expect(icons).toHaveLength(3);
    for (const icon of icons) expect(icon.querySelector('title')?.textContent).toBeTruthy();
    expect(within(bar()).queryAllByRole('button')).toHaveLength(0);
  });
});
