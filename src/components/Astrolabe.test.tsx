// И5: прибор даёт тот же шаг времени, что кнопки темпа, и отменяется Ctrl+Z (критерий ПР1 в TASKS).
import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useStore } from 'zustand';
import { SEED_SEC, seedEngine } from '../campaign/seed';
import { stepTime } from '../campaign/simulation';
import { daysInYear, harptos, secOf, yearSlots, yearStartSec } from '../campaign/calendar';
import { TimeTempo } from './TimeTempo';
import { SECONDS_PER_DAY } from '../engine/state';
import type { DomainEvent, Tempo } from '../engine/events';
import type { EngineStoreApi } from '../engine';
import { Astrolabe } from './Astrolabe';
import { hourDeg, moonDisc, normalizeStep, reteDeg, ringDeg, ringSlots, snapReteMinutes, yearPosOnRing } from './astrolabeModel';

// jsdom 26 без PointerEvent: fireEvent.pointer* создаёт простое Event без clientX и pointerId. Замена на MouseEvent
// с pointerId — только для этих тестов.
if (typeof window !== 'undefined' && !('PointerEvent' in window)) {
  class PointerEventShim extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; }
  }
  (window as unknown as { PointerEvent: typeof PointerEventShim }).PointerEvent = PointerEventShim;
}

const fixed = () => {
  let t = 1000;
  let n = 0;
  return { clock: { now: () => t++ }, ids: { next: () => `e${++n}` } };
};
const lastTime = (store: EngineStoreApi) => [...store.getState().events].reverse().find(e => e.type === 'TIME_ADVANCED') as DomainEvent<'TIME_ADVANCED'>;
const strip = (e: DomainEvent) => ({ type: e.type, payload: e.payload });

/** Прибор над стором — как страница: onAdvance → stepTime (DeskPage.onStep). */
function Bound({ store, tempo = 'hour' }: { store: EngineStoreApi; tempo?: Tempo }) {
  const sec = useStore(store, s => s.state.time.sec);
  const combat = useStore(store, s => s.state.encounter.active);
  return <Astrolabe sec={sec} tempo={tempo} disabled={combat} onAdvance={(t, n) => { stepTime(store.getState(), t, n); }} />;
}

/** Путь кнопок: TimeTempo с темпом «День», щелчок «Шаг» → stepTime(store, 'day', 1). */
function dayButtonEvent() {
  const store = seedEngine(fixed());
  render(<TimeTempo value="day" onChange={() => {}} onStep={n => { stepTime(store.getState(), 'day', n); }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Шаг' }));
  const e = lastTime(store);
  document.body.innerHTML = '';
  return { store, e };
}

describe('модель астролябии', () => {
  it('минуты — в событие: сутки ровно — темп «день»', () => {
    expect(normalizeStep(1440)).toEqual({ tempo: 'day', steps: 1 });
    expect(normalizeStep(180)).toEqual({ tempo: 'hour', steps: 3 });
    expect(normalizeStep(30)).toEqual({ tempo: '10min', steps: 3 });
    expect(normalizeStep(0)).toBeNull();
    expect(normalizeStep(-60)).toBeNull();
  });
  it('щелчок решётки — темп внутри суток, иначе час; назад — ноль', () => {
    expect(snapReteMinutes(360, 'hour')).toBe(1440);
    expect(snapReteMinutes(20, 'hour')).toBe(60);
    expect(snapReteMinutes(5, '10min')).toBe(20);
    expect(snapReteMinutes(200, 'day')).toBe(1440);
    expect(snapReteMinutes(100, 'tenday')).toBe(420);
    expect(snapReteMinutes(-90, 'hour')).toBe(0);
  });
  it('кольцо года — 360° без щелей; поворот решётки непрерывен через новый год', () => {
    for (const y of [1491, 1492]) {
      const s = ringSlots(y);
      expect(s[0].startDeg).toBe(0);
      expect(s[s.length - 1].endDeg).toBeCloseTo(360, 9);
      expect(s.length).toBe(17 + (daysInYear(y) === 366 ? 1 : 0));
    }
    const ny = secOf({ year: 1493, month: 'Hammer', day: 1 });
    const step = reteDeg(ny + 60) - reteDeg(ny - 60);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(1);
  });
  it('Selûne на сиде: растёт, освещено около 0.9', () => {
    const m = moonDisc(SEED_SEC);
    expect(m.phase).toBe('waxing');
    expect(m.waxing).toBe(true);
    expect(m.lit).toBeGreaterThan(0.85);
    expect(m.lit).toBeLessThan(0.95);
  });

  it('линза меняет год кольца, сохраняя месяц, день и положение времени кампании', () => {
    const sec = secOf({ year: 1492, month: 'Mirtul', day: 15, hour: 8 });
    const date = harptos(sec);
    const position = yearPosOnRing(sec, 1491);
    const slot = yearSlots(1491).find(s => s.month === date.month)!;
    const expectedDay = (slot.startSec - yearStartSec(1491)) / SECONDS_PER_DAY + date.day - 1 + (sec % SECONDS_PER_DAY) / SECONDS_PER_DAY;
    expect(position).toMatchObject({ year: 1491, diy: daysInYear(1491) });
    expect(position.doy).toBeCloseTo(expectedDay, 9);
    expect(((reteDeg(sec, 1491) + ringDeg(position.doy, position.diy)) % 360 + 360) % 360).toBeCloseTo(hourDeg(sec), 6);
  });
});

describe('астролябия и шаг времени', () => {
  it('сутки клавишей решётки (PageUp) — тот же TIME_ADVANCED, что «Шаг» с темпом «День»; Ctrl+Z возвращает', () => {
    const { e: byButton } = dayButtonEvent();
    const store = seedEngine(fixed());
    render(<Bound store={store} />);
    fireEvent.keyDown(screen.getByRole('slider', { name: /Решётка/ }), { key: 'PageUp' });
    const byDial = lastTime(store);
    expect(strip(byDial)).toEqual(strip(byButton));
    expect(byDial.payload).toMatchObject({ tempo: 'day', steps: 1, fromSec: SEED_SEC, toSec: SEED_SEC + SECONDS_PER_DAY });
    expect(screen.getByRole('status')).toHaveTextContent('Отменить — Ctrl+Z');
    act(() => store.getState().undo());
    expect(store.getState().state.time.sec).toBe(SEED_SEC);
  });

  it('полный оборот решётки указателем — сутки, одно событие на жест', () => {
    const { e: byButton } = dayButtonEvent();
    const store = seedEngine(fixed());
    render(<Bound store={store} />);
    const before = store.getState().events.length;
    const sun = document.querySelector('[data-part="sun"]')!;
    // jsdom: прямоугольник прибора нулевой, центр — (0, 0); обходим его по часовой шагами по 30°.
    const at = (deg: number) => ({ clientX: 100 * Math.sin((deg * Math.PI) / 180), clientY: -100 * Math.cos((deg * Math.PI) / 180), pointerId: 1, button: 0 });
    fireEvent.pointerDown(sun, at(0));
    for (let d = 30; d <= 360; d += 30) fireEvent.pointerMove(sun, at(d));
    expect(store.getState().events.length).toBe(before); // пока тянут — ничего в логе
    fireEvent.pointerUp(sun, at(360));
    const byDial = lastTime(store);
    expect(strip(byDial)).toEqual(strip(byButton));
    act(() => store.getState().undo());
    expect(store.getState().state.time.sec).toBe(SEED_SEC);
  });

  it('поворот назад ничего не пишет и говорит, что назад — Ctrl+Z', () => {
    const store = seedEngine(fixed());
    render(<Bound store={store} />);
    const before = store.getState().events.length;
    const sun = document.querySelector('[data-part="sun"]')!;
    const at = (deg: number) => ({ clientX: 100 * Math.sin((deg * Math.PI) / 180), clientY: -100 * Math.cos((deg * Math.PI) / 180), pointerId: 1, button: 0 });
    fireEvent.pointerDown(sun, at(90));
    fireEvent.pointerMove(sun, at(60));
    fireEvent.pointerMove(sun, at(30));
    fireEvent.pointerUp(sun, at(30));
    expect(store.getState().events.length).toBe(before);
    expect(screen.getByRole('status')).toHaveTextContent('только вперёд');
    fireEvent.keyDown(screen.getByRole('slider', { name: /Решётка/ }), { key: 'ArrowLeft' });
    expect(store.getState().events.length).toBe(before);
  });

  it('стрелка решётки — один щелчок темпа стола (час), одно событие на нажатие', () => {
    const store = seedEngine(fixed());
    render(<Bound store={store} />);
    const slider = screen.getByRole('slider', { name: /Решётка/ });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    const times = store.getState().events.filter(e => e.type === 'TIME_ADVANCED');
    expect(times.map(e => (e as DomainEvent<'TIME_ADVANCED'>).payload.tempo)).toEqual(['hour', 'hour']);
    expect(store.getState().state.time.sec).toBe(SEED_SEC + 2 * 3600);
    expect(slider).toHaveAttribute('aria-valuetext', expect.stringContaining('10:00'));
  });

  it('линейка: три дня вперёд черновиком, Enter — один шаг «день» × 3; Esc — отмена черновика', () => {
    const store = seedEngine(fixed());
    render(<Bound store={store} />);
    const rule = screen.getByRole('slider', { name: /Линейка/ });
    for (let i = 0; i < 3; i++) fireEvent.keyDown(rule, { key: 'ArrowRight' });
    expect(rule).toHaveAttribute('aria-valuenow', '3');
    expect(rule.getAttribute('aria-valuetext')).toMatch(/через 3 дня: 18 Mirtul 1492 DR.*Selûne полная/);
    expect(store.getState().events.some(e => e.type === 'TIME_ADVANCED')).toBe(false);
    fireEvent.keyDown(rule, { key: 'Enter' });
    expect(lastTime(store).payload).toMatchObject({ tempo: 'day', steps: 3 });
    fireEvent.keyDown(rule, { key: 'ArrowRight' });
    fireEvent.keyDown(rule, { key: 'Escape' });
    expect(rule).toHaveAttribute('aria-valuenow', '0');
    expect(store.getState().events.filter(e => e.type === 'TIME_ADVANCED')).toHaveLength(1);
  });

  it('в бою прибор заперт: клавиши ничего не пишут', () => {
    const store = seedEngine(fixed());
    act(() => store.getState().startEncounter());
    render(<Bound store={store} />);
    const before = store.getState().events.length;
    fireEvent.keyDown(screen.getByRole('slider', { name: /Решётка/ }), { key: 'PageUp' });
    fireEvent.keyDown(screen.getByRole('slider', { name: /Линейка/ }), { key: 'Enter' });
    expect(store.getState().events.length).toBe(before);
    expect(screen.getByRole('slider', { name: /Решётка/ })).toHaveAttribute('aria-disabled', 'true');
  });
});

