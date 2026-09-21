// DayPhaseStrip: список «Фаза суток» из четырёх ячеек «Утро · День · Вечер · Ночь» по 1fr, 64px, плита pn
// с фаской, иконка 24 (dawn/day/dusk/night) и подпись type-num-12 uppercase; текущая — aria-current,
// кольцо glow-gold поверх фаски и подпись gd-hi, остальные t2; кликов нет — время двигает только шаг.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { tonePaths } from '../icons/Icon';
import { ICONS } from '../icons/icons.generated';
import { DAY_PHASES, DAY_PHASE_ICONS, DAY_PHASE_LABELS, DayPhaseStrip } from './DayPhaseStrip';

const EMOJI = /\p{Extended_Pictographic}/u;
const pathsOf = (svg: Element) => Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('d'));

const strip = () => screen.getByRole('list', { name: 'Фаза суток' });
const cells = () => within(strip()).getAllByRole('listitem');

describe('DAY_PHASES, DAY_PHASE_LABELS и DAY_PHASE_ICONS', () => {
  it('четыре фазы от утра к ночи; подписи русские, иконки dawn/day/dusk/night есть в наборе', () => {
    expect(DAY_PHASES).toEqual(['morning', 'day', 'evening', 'night']);
    expect(DAY_PHASE_LABELS).toEqual({ morning: 'Утро', day: 'День', evening: 'Вечер', night: 'Ночь' });
    expect(DAY_PHASE_ICONS).toEqual({ morning: 'dawn', day: 'day', evening: 'dusk', night: 'night' });
    for (const p of DAY_PHASES) {
      expect(DAY_PHASE_LABELS[p]).not.toMatch(EMOJI);
      expect(ICONS[DAY_PHASE_ICONS[p]]).toBeTruthy();
    }
  });
});

describe('DayPhaseStrip', () => {
  it('список из четырёх ячеек по порядку, сетка 4×1fr; ячейка 64px на плите pn с фаской, иконка 24 с title подписи и подпись type-num-12 uppercase', () => {
    render(<DayPhaseStrip value="morning" />);
    expect(strip()).toHaveClass('grid', 'grid-cols-4');
    const items = cells();
    expect(items).toHaveLength(4);
    expect(items.map(c => c.getAttribute('data-phase'))).toEqual(['morning', 'day', 'evening', 'night']);
    expect(items.map(c => c.querySelector('span')?.textContent)).toEqual(['Утро', 'День', 'Вечер', 'Ночь']);
    items.forEach((c, i) => {
      const p = DAY_PHASES[i];
      expect(c).toHaveClass('h-16', 'bg-pn', 'flex', 'flex-col', 'items-center', 'justify-center');
      const icon = within(c).getByRole('img', { name: DAY_PHASE_LABELS[p] });
      expect(icon).toHaveAttribute('width', '24');
      expect(pathsOf(icon)).toEqual(tonePaths(ICONS[DAY_PHASE_ICONS[p]]).filter(Boolean));
      expect(icon.querySelector('path[fill*="currentColor"]')).not.toBeNull();
      expect(within(c).getByText(DAY_PHASE_LABELS[p], { selector: 'span' })).toHaveClass('type-num-12', 'uppercase');
    });
  });

  it('текущая — aria-current=true, имя «Утро · сейчас», кольцо glow-gold поверх фаски и gd-hi; остальные — t2 с фаской без aria-current', () => {
    render(<DayPhaseStrip value="evening" />);
    const on = screen.getByRole('listitem', { name: 'Вечер · сейчас' });
    expect(on).toHaveAttribute('aria-current', 'true');
    expect(on).toHaveAttribute('data-phase', 'evening');
    expect(on).toHaveClass('text-gd-hi');
    expect(on.className).toContain('shadow-[var(--bevel),var(--glow-gold)]');
    expect(on).not.toHaveClass('text-t2', 'shadow-bevel');
    const off = cells().filter(c => c !== on);
    expect(off).toHaveLength(3);
    for (const c of off) {
      expect(c).not.toHaveAttribute('aria-current');
      expect(c).toHaveClass('text-t2', 'shadow-bevel');
      expect(c.className).not.toContain('glow-gold');
    }
    expect(cells().filter(c => c.getAttribute('aria-current') === 'true')).toHaveLength(1);
  });

  it('шаг времени меняет фазу через пропс: текущая переезжает, ячеек по-прежнему четыре', () => {
    const { rerender } = render(<DayPhaseStrip value="night" />);
    expect(screen.getByRole('listitem', { name: 'Ночь · сейчас' })).toHaveAttribute('aria-current', 'true');
    rerender(<DayPhaseStrip value="day" />);
    expect(screen.getByRole('listitem', { name: 'День · сейчас' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('listitem', { name: 'Ночь' })).not.toHaveAttribute('aria-current');
    expect(cells()).toHaveLength(4);
  });

  it('кликов нет: ни одной кнопки и ни одного обработчика — время двигает только шаг темпа', () => {
    render(<DayPhaseStrip value="day" />);
    expect(within(strip()).queryAllByRole('button')).toHaveLength(0);
    for (const c of cells()) {
      expect(c.tagName).toBe('DIV');
      expect(c).not.toHaveAttribute('tabindex');
      expect(c.className).not.toContain('cursor-pointer');
    }
  });

  it('сторож: нет эмодзи, hex, rounded, text-t3 и text-t4; движение — только ступенями и не дольше 200 мс; у каждой иконки title; className уходит на список', () => {
    const { container } = render(<DayPhaseStrip value="morning" className="mb-2" />);
    expect(strip()).toHaveClass('mb-2');
    expect(container.innerHTML).not.toMatch(EMOJI);
    for (const el of [strip(), ...strip().querySelectorAll('*')]) {
      const cls = el.getAttribute('class') ?? '';
      expect(cls).not.toMatch(/#[0-9a-f]{3,6}\b/i);
      expect(cls).not.toMatch(/rounded/);
      expect(cls).not.toMatch(/(^|\s)text-t3(\s|$)/);
      expect(cls).not.toMatch(/(^|\s)text-t4(\s|$)/);
      for (const m of cls.matchAll(/(\d+)ms/g)) expect(Number(m[1])).toBeLessThanOrEqual(200);
    }
    const icons = strip().querySelectorAll('svg');
    expect(icons).toHaveLength(4);
    for (const icon of icons) expect(icon.querySelector('title')?.textContent).toBeTruthy();
  });
});
