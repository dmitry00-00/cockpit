// ScaleLadder: nav «Лестница масштабов» высотой bar-scale на подложке lo с зазором 1px; ступень — кнопка
// с data-scale, иконкой scale-<id> (title — подпись уровня) и именем места Forum type-h-15 uppercase;
// текущая — aria-current, gd-hi и нижняя полоса 3px gd (форма, не только цвет), в тултипе подсказка про
// [ и ]; сжатие при семи и более ступенях — по имени только текущая и соседи, дальние одной иконкой;
// тултип «Уровень · Место · темп: …», у ступени без места без второго куска; клик отдаёт id; между
// ступенями — только «›», aria-hidden, t2 (не t4). ladderStepTitle — чистая.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SCALE_LEVELS, type ScaleLevel } from '../engine';
import { tonePaths } from '../icons/Icon';
import { ICONS } from '../icons/icons.generated';
import { LADDER_COMPACT_FROM, ScaleLadder, ladderStepTitle, type ScaleStep } from './ScaleLadder';
import { SCALE_LABELS, SCALE_ORDER, SCALE_TEMPO_LABELS } from './scales';

const EMOJI = /\p{Extended_Pictographic}/u;
const pathsOf = (svg: Element) => Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('d'));

/** Путь партии §13 сверху вниз: одно место на уровень; на уровне боя места нет — подпись уровня. */
const PATH: ScaleStep[] = [
  { id: 'cosmology', label: 'Великое Колесо' },
  { id: 'plane', label: 'Материальный' },
  { id: 'system', label: 'Realmspace' },
  { id: 'planet', label: 'Toril' },
  { id: 'continent', label: 'Faerûn' },
  { id: 'region', label: 'Sword Coast North' },
  { id: 'settlement', label: 'Neverwinter' },
  { id: 'building', label: 'Южные ворота' },
  { id: 'battle', label: SCALE_LABELS.battle },
];
/** Короткий путь — шесть ступеней, сжатие по умолчанию не включается. */
const SHORT = PATH.slice(3);

const nav = () => screen.getByRole('navigation', { name: 'Лестница масштабов' });
const steps = () => within(nav()).getAllByRole('button');
const step = (id: ScaleLevel) => nav().querySelector(`button[data-scale="${id}"]`) as HTMLButtonElement;
const seps = () => Array.from(nav().querySelectorAll('[data-part="sep"]'));
/** Имя на ступени — текст span; textContent кнопки цепляет и <title> иконки, поэтому он здесь не годится. */
const nameOf = (b: HTMLElement) => b.querySelector('span')?.textContent ?? null;

describe('SCALE_TEMPO_LABELS', () => {
  it('у каждого из девяти уровней есть темп словами, по-русски, без эмодзи; бой — раунды, регион — дни, планета — сезоны (HANDOFF §3)', () => {
    expect(SCALE_ORDER).toBe(SCALE_LEVELS);
    for (const s of SCALE_ORDER) {
      expect(SCALE_TEMPO_LABELS[s], s).toBeTruthy();
      expect(SCALE_TEMPO_LABELS[s], s).not.toMatch(EMOJI);
      expect(SCALE_LABELS[s], s).toBeTruthy();
    }
    expect(SCALE_TEMPO_LABELS.battle).toBe('раунды');
    expect(SCALE_TEMPO_LABELS.region).toBe('дни');
    expect(SCALE_TEMPO_LABELS.planet).toBe('сезоны');
    expect(SCALE_TEMPO_LABELS.building).toBe('10 минут');
  });
});

describe('ladderStepTitle', () => {
  it('«Уровень · Место · темп: …»; без места — без второго куска; текущая — с подсказкой про [ и ]', () => {
    expect(ladderStepTitle({ id: 'region', label: 'Sword Coast North' })).toBe('Регион · Sword Coast North · темп: дни');
    expect(ladderStepTitle({ id: 'battle', label: 'Бой' })).toBe('Бой · темп: раунды');
    expect(ladderStepTitle({ id: 'settlement', label: 'Neverwinter' }, true)).toBe('Поселение · Neverwinter · темп: часы · [ и ] — вверх и вниз');
    expect(ladderStepTitle({ id: 'battle', label: 'Бой' }, true)).toBe('Бой · темп: раунды · [ и ] — вверх и вниз');
    expect(ladderStepTitle({ id: 'battle', label: 'Бой' })).not.toContain('Бой · Бой');
  });
});

describe('ScaleLadder', () => {
  it('nav «Лестница масштабов»: h-bar-scale, подложка lo с зазором 1px, overflow-x-auto; девять кнопок по порядку с data-scale и type=button', () => {
    render(<ScaleLadder steps={PATH} current="region" />);
    expect(nav()).toHaveClass('h-bar-scale', 'bg-lo', 'gap-px', 'p-px', 'overflow-x-auto', 'flex', 'items-stretch');
    expect(nav()).toHaveAttribute('data-orientation', 'horizontal');
    const all = steps();
    expect(all).toHaveLength(9);
    expect(all.map(b => b.getAttribute('data-scale'))).toEqual([...SCALE_ORDER]);
    for (const b of all) {
      expect(b).toHaveAttribute('type', 'button');
      expect(b).toHaveClass('type-h-15', 'uppercase', 'from-pl', 'to-cd');
      expect(b.getAttribute('title')).toBeTruthy();
    }
    // Разделителей на один меньше, чем ступеней; все aria-hidden, все — «›», цвет t2 (t4 текстом не ставится).
    expect(seps()).toHaveLength(8);
    for (const s of seps()) {
      expect(s).toHaveAttribute('aria-hidden', 'true');
      expect(s).toHaveTextContent('›');
      expect(s).toHaveClass('text-t2');
      expect(s).not.toHaveClass('text-t4');
    }
  });

  it('vertical: прокручиваемая колонка показывает имена всех уровней и сохраняет выбор/текущую ступень', () => {
    const onSelect = vi.fn();
    render(<ScaleLadder steps={PATH} current="region" onSelect={onSelect} orientation="vertical" />);
    expect(nav()).toHaveAttribute('data-orientation', 'vertical');
    expect(nav()).toHaveClass('flex-col', 'w-48', 'max-h-[70vh]', 'overflow-y-auto', 'overscroll-contain');
    expect(nav()).not.toHaveClass('h-bar-scale', 'overflow-x-auto');
    expect(steps().map(nameOf)).toEqual(PATH.map(s => s.label));
    expect(seps()).toHaveLength(PATH.length - 1);
    expect(step('region')).toHaveAttribute('aria-current', 'true');
    fireEvent.click(step('planet'));
    expect(onSelect).toHaveBeenCalledWith('planet');
  });

  it('vertical compact: квадратная колонка доступных иконок без дублирующей подписи места', () => {
    render(<ScaleLadder steps={PATH} current="region" compact orientation="vertical" />);
    expect(nav()).toHaveClass('w-14', 'overflow-y-auto');
    expect(nav()).not.toHaveClass('w-48');
    expect(nav().querySelectorAll('[data-named]')).toHaveLength(0);
    for (const s of PATH) {
      expect(step(s.id)).toHaveAttribute('aria-label', SCALE_LABELS[s.id]);
      expect(step(s.id)).toHaveAttribute('title', ladderStepTitle(s, s.id === 'region'));
      expect(within(step(s.id)).getByRole('img', { name: SCALE_LABELS[s.id] })).toBeInTheDocument();
    }
    expect(nav().querySelector('[data-part="current-scale"]')).toBeNull();
    expect(step('region')).toHaveAttribute('aria-current', 'true');
  });

  it('текущая: aria-current только у неё, text-gd-hi и нижняя полоса 3px gd под фаской; остальные — t2 с фаской', () => {
    render(<ScaleLadder steps={PATH} current="region" />);
    const on = step('region');
    expect(on).toHaveAttribute('aria-current', 'true');
    expect(on).toHaveClass('text-gd-hi');
    expect(on.className).toContain('shadow-[var(--bevel),inset_0_-3px_0_var(--gd)]');
    expect(on.className).toContain('focus-visible:shadow-[var(--bevel),inset_0_-3px_0_var(--gd),var(--glow-gold)]');
    expect(on).not.toHaveClass('text-t2');
    const off = steps().filter(b => b !== on);
    expect(off).toHaveLength(8);
    for (const b of off) {
      expect(b).not.toHaveAttribute('aria-current');
      expect(b).toHaveClass('text-t2', 'shadow-bevel');
      expect(b.className).toContain('focus-visible:shadow-[var(--bevel),var(--glow-gold)]');
      expect(b.className).not.toContain('inset_0_-3px_0_var(--gd)');
    }
  });

  it('иконка ступени — scale-<id> 16px с title подписью уровня, currentColor; имя — Forum по имени места', () => {
    render(<ScaleLadder steps={PATH} current="region" />);
    const b = step('region');
    const icon = within(b).getByRole('img', { name: 'Регион' });
    expect(icon).toHaveAttribute('width', '16');
    expect(pathsOf(icon)).toEqual(tonePaths(ICONS['scale-region']).filter(Boolean));
    expect(icon.querySelector('path[fill*="currentColor"]')).not.toBeNull();
    expect(within(b).getByText('Sword Coast North')).toHaveClass('truncate');
    expect(within(step('continent')).getByRole('img', { name: 'Континент' })).toBeInTheDocument();
  });

  it('сжатие по умолчанию при девяти ступенях: по имени — текущая и соседи, дальние — только иконкой, но с тултипом «Уровень · Место · темп»', () => {
    render(<ScaleLadder steps={PATH} current="region" />);
    expect(PATH.length).toBeGreaterThan(LADDER_COMPACT_FROM);
    const named = steps().filter(b => b.hasAttribute('data-named')).map(b => b.getAttribute('data-scale'));
    expect(named).toEqual(['continent', 'region', 'settlement']);
    expect(nameOf(step('continent'))).toBe('Faerûn');
    expect(nameOf(step('region'))).toBe('Sword Coast North');
    expect(nameOf(step('settlement'))).toBe('Neverwinter');
    // Дальние: текста нет, иконка есть, имя живёт в тултипе.
    for (const id of ['cosmology', 'plane', 'system', 'planet', 'building', 'battle'] as const) {
      const b = step(id);
      expect(nameOf(b), id).toBeNull();
      expect(within(b).getByRole('img', { name: SCALE_LABELS[id] }), id).toBeInTheDocument();
    }
    expect(step('cosmology')).toHaveAttribute('title', 'Космология · Великое Колесо · темп: годы');
    expect(step('planet')).toHaveAttribute('title', 'Планета · Toril · темп: сезоны');
    expect(step('region')).toHaveAttribute('title', 'Регион · Sword Coast North · темп: дни · [ и ] — вверх и вниз');
    expect(step('settlement')).toHaveAttribute('title', 'Поселение · Neverwinter · темп: часы');
    // Ступень без места — подпись уровня один раз.
    expect(step('battle')).toHaveAttribute('title', 'Бой · темп: раунды');
    // Подсказка про клавиши — только у текущей; aria-keyshortcuts нигде: клавиша не на этой кнопке.
    expect(steps().filter(b => (b.getAttribute('title') ?? '').includes('[ и ]')).map(b => b.getAttribute('data-scale'))).toEqual(['region']);
    for (const b of steps()) expect(b).not.toHaveAttribute('aria-keyshortcuts');
  });

  it('сжатие на краю: текущая — космология, по имени она и план; текущая — бой, по имени здание и бой', () => {
    const { rerender } = render(<ScaleLadder steps={PATH} current="cosmology" />);
    const named = () => steps().filter(b => b.hasAttribute('data-named')).map(b => b.getAttribute('data-scale'));
    expect(named()).toEqual(['cosmology', 'plane']);
    rerender(<ScaleLadder steps={PATH} current="battle" />);
    expect(named()).toEqual(['building', 'battle']);
    expect(nameOf(step('battle'))).toBe('Бой');
    expect(nameOf(step('cosmology'))).toBeNull();
  });

  it('шесть ступеней — без сжатия, все по имени; compact явно включает и выключает; текущей нет среди ступеней — все по имени', () => {
    const named = () => steps().filter(b => b.hasAttribute('data-named')).map(b => b.getAttribute('data-scale'));
    const { rerender } = render(<ScaleLadder steps={SHORT} current="region" />);
    expect(SHORT).toHaveLength(LADDER_COMPACT_FROM);
    expect(named()).toEqual(['planet', 'continent', 'region', 'settlement', 'building', 'battle']);
    expect(steps().map(nameOf)).toEqual(['Toril', 'Faerûn', 'Sword Coast North', 'Neverwinter', 'Южные ворота', 'Бой']);
    rerender(<ScaleLadder steps={SHORT} current="region" compact />);
    expect(named()).toEqual(['continent', 'region', 'settlement']);
    rerender(<ScaleLadder steps={PATH} current="region" compact={false} />);
    expect(named()).toHaveLength(9);
    // Текущей нет на пути (страница ещё не передала место) — сжимать не от чего.
    rerender(<ScaleLadder steps={PATH.slice(0, 7)} current="battle" />);
    expect(named()).toHaveLength(7);
    expect(steps().some(b => b.hasAttribute('aria-current'))).toBe(false);
  });

  it('клик по ступени отдаёт её id; без onSelect ступени остаются кнопками и клик ничего не ломает', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<ScaleLadder steps={PATH} current="region" onSelect={onSelect} />);
    fireEvent.click(step('planet'));
    expect(onSelect).toHaveBeenLastCalledWith('planet');
    fireEvent.click(step('region'));
    expect(onSelect).toHaveBeenLastCalledWith('region');
    expect(onSelect).toHaveBeenCalledTimes(2);
    // Компонент сам уровень не меняет — текущая та же.
    expect(step('region')).toHaveAttribute('aria-current', 'true');
    expect(step('planet')).not.toHaveAttribute('aria-current');
    rerender(<ScaleLadder steps={PATH} current="region" />);
    expect(() => fireEvent.click(step('planet'))).not.toThrow();
    expect(steps()).toHaveLength(9);
  });

  it('сторож: ни эмодзи, ни пиктограмм кроме «›»; нет hex, rounded, text-t3 и text-t4 (ступень — плита); у каждой иконки title; className уходит на корень', () => {
    const { container } = render(<ScaleLadder steps={PATH} current="settlement" compact={false} className="col-span-2" />);
    expect(nav()).toHaveClass('col-span-2');
    expect(container.innerHTML).not.toMatch(EMOJI);
    // Единственный символ полосы — «›»: убираем буквы, цифры, пробелы и точку-разделитель — остаются только крошки.
    const symbols = (nav().textContent ?? '').replace(/[\p{L}\p{N}\s·]/gu, '');
    expect(symbols).toBe('›'.repeat(8));
    for (const el of [nav(), ...nav().querySelectorAll('*')]) {
      const cls = el.getAttribute('class') ?? '';
      expect(cls).not.toMatch(/#[0-9a-f]{3,6}\b/i);
      expect(cls).not.toMatch(/rounded/);
      expect(cls).not.toMatch(/(^|\s)text-t3(\s|$)/);
      expect(cls).not.toMatch(/(^|\s)text-t4(\s|$)/);
      expect(el.getAttribute('style') ?? '').not.toMatch(/border-radius/);
    }
    for (const b of steps()) expect(b.getAttribute('title')).toBeTruthy();
    const icons = nav().querySelectorAll('svg');
    expect(icons).toHaveLength(9);
    for (const icon of icons) expect(icon.querySelector('title')?.textContent).toBeTruthy();
  });
});
