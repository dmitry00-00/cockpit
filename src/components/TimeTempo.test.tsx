// TimeTempo: группа «Темп времени» — Radix ToggleGroup из семи ступеней (radio, подпись TEMPO_LABELS, title
// «Темп: …») на подложке lo с зазором 1px; включённая — gd-hi и нижняя полоса 3px gd; клик отдаёт темп,
// повторный клик по включённой ничего не снимает; кнопка «Шаг» словом с иконкой tempo (никакого ▶),
// title «Продвинуть время на один шаг · T», aria-keyshortcuts — onStep(1); Shift+клик и долгое нажатие
// (500 мс) открывают поле «сколько шагов», Enter с числом 1–99 → onStep(n), вне диапазона — ничего;
// disabled — ступени недоступны, шаг доступен. parseSteps — чистая.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEMPO_SECONDS, type Tempo } from '../engine';
import { tonePaths } from '../icons/Icon';
import { ICONS } from '../icons/icons.generated';
import { STEPS_MAX, STEPS_MIN, STEP_LONG_PRESS_MS, TEMPO_LABELS, TEMPO_ORDER, TimeTempo, parseSteps } from './TimeTempo';

const EMOJI = /\p{Extended_Pictographic}/u;
const pathsOf = (svg: Element) => Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('d'));
const noop = () => {};

afterEach(() => vi.useRealTimers());

const group = () => screen.getByRole('group', { name: 'Темп времени' });
const tempos = () => screen.getByRole('radiogroup', { name: 'Темп' });
const radios = () => within(tempos()).getAllByRole('radio');
const step = () => screen.getByRole('button', { name: 'Шаг' });
const field = () => screen.queryByRole('textbox', { name: 'Сколько шагов' });

describe('TEMPO_ORDER и TEMPO_LABELS', () => {
  it('семь темпов от раунда к году — каждый есть в TEMPO_SECONDS движка и у каждого русская подпись без эмодзи', () => {
    expect(TEMPO_ORDER).toHaveLength(7);
    expect(TEMPO_ORDER).toEqual(['round', '10min', 'hour', 'day', 'tenday', 'season', 'year']);
    expect(TEMPO_LABELS).toEqual({
      round: 'Раунд', '10min': '10 мин', hour: 'Час', day: 'День', tenday: 'Десятидневка', season: 'Сезон', year: 'Год',
    });
    for (const t of TEMPO_ORDER) {
      expect(TEMPO_LABELS[t]).toBeTruthy();
      expect(TEMPO_LABELS[t]).not.toMatch(EMOJI);
      expect(TEMPO_SECONDS[t]).toBeGreaterThan(0);
    }
    // Порядок — по возрастанию шага: лестница темпов и лестница секунд совпадают.
    const secs = TEMPO_ORDER.map(t => TEMPO_SECONDS[t]);
    expect([...secs].sort((a, b) => a - b)).toEqual(secs);
  });
});

describe('parseSteps', () => {
  it('целое от 1 до 99; ноль, пусто, сто, минус и дробь — null', () => {
    expect(STEPS_MIN).toBe(1);
    expect(STEPS_MAX).toBe(99);
    expect(parseSteps('1')).toBe(1);
    expect(parseSteps('12')).toBe(12);
    expect(parseSteps('99')).toBe(99);
    expect(parseSteps('0')).toBeNull();
    expect(parseSteps('')).toBeNull();
    expect(parseSteps('100')).toBeNull();
    expect(parseSteps('-3')).toBeNull();
    expect(parseSteps('1.5')).toBeNull();
    expect(parseSteps('abc')).toBeNull();
  });
});

describe('TimeTempo', () => {
  it('группа «Темп времени»: radiogroup «Темп» на подложке lo с зазором 1px, семь ступеней по порядку с подписями и title «Темп: …», у каждой type-num-12 uppercase bg-cd', () => {
    render(<TimeTempo value="hour" onChange={noop} onStep={noop} />);
    expect(group()).toBeInTheDocument();
    expect(tempos()).toHaveClass('bg-lo', 'gap-px', 'p-px');
    const items = radios();
    expect(items).toHaveLength(7);
    expect(items.map(r => r.textContent)).toEqual(['Раунд', '10 мин', 'Час', 'День', 'Десятидневка', 'Сезон', 'Год']);
    items.forEach((r, i) => {
      const t = TEMPO_ORDER[i];
      expect(r).toHaveAttribute('type', 'button');
      expect(r).toHaveAttribute('data-tempo', t);
      expect(r).toHaveAttribute('title', `Темп: ${TEMPO_LABELS[t]}`);
      expect(r).toHaveClass('type-num-12', 'uppercase', 'bg-cd', 'px-2', 'py-1');
      expect(r).not.toBeDisabled();
    });
    expect(group().textContent).not.toMatch(EMOJI);
    expect(group().textContent).not.toContain('▶');
  });

  it('включённая ступень: aria-checked, text-gd-hi и нижняя полоса 3px gd под фаской (форма, не только цвет); остальные — t2 с фаской', () => {
    render(<TimeTempo value="tenday" onChange={noop} onStep={noop} />);
    const on = screen.getByRole('radio', { name: 'Десятидневка' });
    expect(on).toHaveAttribute('aria-checked', 'true');
    expect(on).toHaveAttribute('data-state', 'on');
    expect(on).toHaveClass('text-gd-hi');
    expect(on.className).toContain('shadow-[var(--bevel),inset_0_-3px_0_var(--gd)]');
    expect(on).not.toHaveClass('text-t2');
    const off = radios().filter(r => r.getAttribute('aria-checked') === 'false');
    expect(off).toHaveLength(6);
    for (const r of off) {
      expect(r).toHaveClass('text-t2', 'shadow-bevel');
      expect(r.className).not.toContain('inset_0_-3px_0_var(--gd)');
    }
  });

  it('клик по ступени отдаёт темп; клик по включённой не снимает значение — onChange не зовётся; компонент сам темп не меняет', () => {
    const onChange = vi.fn();
    render(<TimeTempo value="hour" onChange={onChange} onStep={noop} />);
    fireEvent.click(screen.getByRole('radio', { name: 'День' }));
    expect(onChange).toHaveBeenLastCalledWith('day');
    fireEvent.click(screen.getByRole('radio', { name: 'Год' }));
    expect(onChange).toHaveBeenLastCalledWith('year');
    expect(onChange).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('radio', { name: 'Час' }));
    expect(onChange).toHaveBeenCalledTimes(2);
    // Пропсы не менялись — «Час» всё ещё включён.
    expect(screen.getByRole('radio', { name: 'Час' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'День' })).toHaveAttribute('aria-checked', 'false');
  });

  it('«Шаг» — словом с иконкой tempo 16 (не ▶), title «Продвинуть время на один шаг · T», aria-keyshortcuts=T, как BTN; клик → onStep(1)', () => {
    const onStep = vi.fn();
    render(<TimeTempo value="hour" onChange={noop} onStep={onStep} />);
    const b = step();
    expect(b).toHaveAttribute('type', 'button');
    expect(b).toHaveAttribute('title', 'Продвинуть время на один шаг · T');
    expect(b).toHaveAttribute('aria-keyshortcuts', 'T');
    expect(b).toHaveClass('type-num-12', 'uppercase', 'bg-cd', 'shadow-bevel', 'text-t2', 'px-2', 'py-1');
    expect(b).toHaveTextContent('Шаг');
    expect(b.textContent).not.toContain('▶');
    const icon = within(b).getByRole('img', { name: 'Шаг времени' });
    expect(icon).toHaveAttribute('width', '16');
    expect(pathsOf(icon)).toEqual(tonePaths(ICONS.tempo).filter(Boolean));
    expect(icon.querySelector('path[fill*="currentColor"]')).not.toBeNull();
    fireEvent.click(b);
    expect(onStep).toHaveBeenCalledTimes(1);
    expect(onStep).toHaveBeenLastCalledWith(1);
    expect(field()).toBeNull();
  });

  it('Shift+клик открывает поле «Сколько шагов» (утопленное, в фокусе) без шага; Enter с 12 → onStep(12), поле закрывается', () => {
    const onStep = vi.fn();
    render(<TimeTempo value="day" onChange={noop} onStep={onStep} />);
    expect(field()).toBeNull();
    fireEvent.click(step(), { shiftKey: true });
    expect(onStep).not.toHaveBeenCalled();
    const input = field() as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveClass('type-num-12', 'text-tx', 'bg-wl', 'shadow-bevel-in');
    expect(input.getAttribute('title')).toContain('Enter');
    fireEvent.change(input, { target: { value: '12' } });
    expect(input).toHaveValue('12');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onStep).toHaveBeenCalledTimes(1);
    expect(onStep).toHaveBeenLastCalledWith(12);
    expect(field()).toBeNull();
  });

  it('число вне 1–99 не проходит: «0» и «100» — Enter ничего не делает, поле остаётся; буквы вырезаются; Esc закрывает без шага', () => {
    const onStep = vi.fn();
    render(<TimeTempo value="day" onChange={noop} onStep={onStep} />);
    fireEvent.click(step(), { shiftKey: true });
    const input = field() as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onStep).not.toHaveBeenCalled();
    expect(field()).not.toBeNull();
    fireEvent.change(input, { target: { value: '100' } });
    expect(input).toHaveValue('100');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onStep).not.toHaveBeenCalled();
    expect(field()).not.toBeNull();
    fireEvent.change(input, { target: { value: '1x2' } });
    expect(input).toHaveValue('12');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onStep).not.toHaveBeenCalled();
    expect(field()).toBeNull();
  });

  it('долгое нажатие 500 мс открывает поле, а клик при отпускании шаг не делает; короткое нажатие — обычный шаг', () => {
    vi.useFakeTimers();
    const onStep = vi.fn();
    render(<TimeTempo value="day" onChange={noop} onStep={onStep} />);
    expect(STEP_LONG_PRESS_MS).toBe(500);
    fireEvent.pointerDown(step(), { pointerType: 'mouse' });
    act(() => { vi.advanceTimersByTime(STEP_LONG_PRESS_MS - 1); });
    expect(field()).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(field()).not.toBeNull();
    fireEvent.pointerUp(step(), { pointerType: 'mouse' });
    fireEvent.click(step());
    expect(onStep).not.toHaveBeenCalled();
    fireEvent.change(field() as HTMLInputElement, { target: { value: '3' } });
    fireEvent.keyDown(field() as HTMLInputElement, { key: 'Enter' });
    expect(onStep).toHaveBeenLastCalledWith(3);
    expect(field()).toBeNull();
    // Короткое нажатие: таймер не дошёл — click делает один шаг.
    fireEvent.pointerDown(step(), { pointerType: 'mouse' });
    act(() => { vi.advanceTimersByTime(100); });
    fireEvent.pointerUp(step(), { pointerType: 'mouse' });
    fireEvent.click(step());
    expect(onStep).toHaveBeenCalledTimes(2);
    expect(onStep).toHaveBeenLastCalledWith(1);
    expect(field()).toBeNull();
    // Увод указателя до срока гасит таймер.
    fireEvent.pointerDown(step(), { pointerType: 'mouse' });
    fireEvent.pointerLeave(step());
    act(() => { vi.advanceTimersByTime(STEP_LONG_PRESS_MS * 2); });
    expect(field()).toBeNull();
  });

  it('disabled (бой — раунды): все ступени недоступны, включённая остаётся видна, «Шаг» доступен и делает шаг', () => {
    const onChange = vi.fn();
    const onStep = vi.fn();
    render(<TimeTempo value="round" onChange={onChange} onStep={onStep} disabled />);
    for (const r of radios()) expect(r).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Раунд' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Раунд' })).toHaveClass('text-gd-hi');
    fireEvent.click(screen.getByRole('radio', { name: 'Час' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(step()).not.toBeDisabled();
    fireEvent.click(step());
    expect(onStep).toHaveBeenLastCalledWith(1);
  });

  it('сторож: нет эмодзи и ▶, hex, rounded, text-t3 и text-t4 (полоса часов — плита); у каждой иконки title; className уходит на корень', () => {
    const { container } = render(<TimeTempo value="season" onChange={noop} onStep={noop} className="ml-auto" />);
    fireEvent.click(step(), { shiftKey: true });
    expect(group()).toHaveClass('ml-auto');
    expect(container.innerHTML).not.toMatch(EMOJI);
    expect(container.textContent).not.toContain('▶');
    for (const el of [group(), ...group().querySelectorAll('*')]) {
      const cls = el.getAttribute('class') ?? '';
      expect(cls).not.toMatch(/#[0-9a-f]{3,6}\b/i);
      expect(cls).not.toMatch(/rounded/);
      expect(cls).not.toMatch(/(^|\s)text-t3(\s|$)/);
      expect(cls).not.toMatch(/(^|\s)text-t4(\s|$)/);
    }
    for (const b of within(group()).getAllByRole('button')) expect(b.getAttribute('title')).toBeTruthy();
    for (const r of radios()) expect(r.getAttribute('title')).toBeTruthy();
    for (const icon of group().querySelectorAll('svg')) expect(icon.querySelector('title')?.textContent).toBeTruthy();
    const all: Tempo[] = [...TEMPO_ORDER];
    expect(all).toHaveLength(7);
  });
});

describe('БА3: компактная полоса', () => {
  it('редкие темпы раскрываются, выбранный редкий остаётся виден; рекомендация отдельно от текущего', () => {
    const onChange=vi.fn(),onStep=vi.fn();
    const {rerender}=render(<TimeTempo value="hour" recommended="day" compact onChange={onChange} onStep={onStep}/>);
    expect(screen.queryByRole('radio',{name:'Год'})).toBeNull();
    expect(screen.getByText('Текущий шаг: Час')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Другие темпы'}));
    expect(screen.getByRole('radio',{name:'Год'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Выбрать рекомендацию'}));
    expect(onChange).toHaveBeenCalledWith('day');expect(onStep).not.toHaveBeenCalled();
    rerender(<TimeTempo value="year" recommended="day" compact onChange={onChange} onStep={onStep}/>);
    fireEvent.click(screen.getByRole('button',{name:'Другие темпы'}));
    expect(screen.getByRole('radio',{name:'Год'})).toHaveAttribute('aria-checked','true');
    expect(screen.queryByRole('radio',{name:'Сезон'})).toBeNull();
  });
});
