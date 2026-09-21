// Хуки над стором: вспышка — по последнему событию лога (и только по новому), горячие клавиши — по коду
// клавиши; ни один из них не хранит хиты.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedEngine } from '../campaign';
import type { DomainEvent } from './events';
import { hpFlashOf, isUndoKey, useHpFlashes, useUndoKeys } from './useEngine';

afterEach(() => vi.useRealTimers());

const ev = (type: DomainEvent['type'], payload: object, extra: Partial<DomainEvent> = {}): DomainEvent =>
  ({ id: 'x', seq: 0, at: 0, worldSec: 0, type, payload, ...extra } as DomainEvent);

describe('hpFlashOf', () => {
  it('урон — damage; лечение и временные хиты — heal; отмена — наоборот; повтор — как исходное', () => {
    expect(hpFlashOf(ev('DAMAGE_APPLIED', { targetId: 'bo', amount: 8 }))).toEqual({ targetId: 'bo', flash: 'damage' });
    expect(hpFlashOf(ev('HEALING_APPLIED', { targetId: 'bo', amount: 8 }))).toEqual({ targetId: 'bo', flash: 'heal' });
    expect(hpFlashOf(ev('TEMP_HP_GRANTED', { targetId: 'lyra', amount: 5 }))).toEqual({ targetId: 'lyra', flash: 'heal' });
    expect(hpFlashOf(ev('DAMAGE_APPLIED', { targetId: 'bo', amount: 8 }, { undoes: 'e1' }))).toEqual({ targetId: 'bo', flash: 'heal' });
    expect(hpFlashOf(ev('HEALING_APPLIED', { targetId: 'bo', amount: 8 }, { undoes: 'e1' }))).toEqual({ targetId: 'bo', flash: 'damage' });
    expect(hpFlashOf(ev('DAMAGE_APPLIED', { targetId: 'bo', amount: 8 }, { redoes: 'e1' }))).toEqual({ targetId: 'bo', flash: 'damage' });
  });

  it('остальные события полосу не трогают; нет события — нет вспышки', () => {
    expect(hpFlashOf(ev('DICE_ROLLED', { formula: '1d20', dice: [7], mod: 0, total: 7, hidden: false, label: '' }))).toBeNull();
    expect(hpFlashOf(ev('CONDITION_ADDED', { targetId: 'bo', conditionId: 'blinded' }))).toBeNull();
    expect(hpFlashOf(undefined)).toBeNull();
  });
});

describe('useHpFlashes', () => {
  it('на первом рендере лог сида не вспыхивает; новый урон — damage по актёру на 200 мс, потом пусто', () => {
    vi.useFakeTimers();
    const store = seedEngine();
    const { result } = renderHook(() => useHpFlashes(store));
    expect(result.current).toEqual({});

    act(() => { store.getState().damage('bo', 3); });
    expect(result.current).toEqual({ bo: 'damage' });
    act(() => { vi.advanceTimersByTime(199); });
    expect(result.current).toEqual({ bo: 'damage' });
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toEqual({});

    act(() => { store.getState().undo(); });
    expect(result.current).toEqual({ bo: 'heal' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toEqual({});
  });

  it('событие без хитов не вспыхивает и не продлевает чужую вспышку', () => {
    vi.useFakeTimers();
    const store = seedEngine();
    const { result } = renderHook(() => useHpFlashes(store));
    act(() => { store.getState().rollDice('1d20'); });
    expect(result.current).toEqual({});
    act(() => { store.getState().damage('bo', 3); });
    act(() => { vi.advanceTimersByTime(100); });
    act(() => { store.getState().rollDice('1d20'); });
    expect(result.current).toEqual({ bo: 'damage' });
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toEqual({});
  });
});

describe('снимки стора', () => {
  it('каждый dispatch даёт новый массив events — даже бросок кости, который state не меняет', () => {
    const store = seedEngine();
    const before = store.getState();
    store.getState().rollDice('1d20');
    const after = store.getState();
    expect(after.events).not.toBe(before.events);
    expect(after.events).toHaveLength(before.events.length + 1);
    expect(after.state).toBe(before.state);
  });
});

describe('isUndoKey и useUndoKeys', () => {
  it('Ctrl+Z и Cmd+Z по коду клавиши: русская раскладка не мешает; Alt и голая z — нет', () => {
    const k = (o: Partial<Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey'>>) =>
      isUndoKey({ key: '', code: '', ctrlKey: false, metaKey: false, altKey: false, ...o });
    expect(k({ key: 'z', code: 'KeyZ', ctrlKey: true })).toBe(true);
    expect(k({ key: 'я', code: 'KeyZ', ctrlKey: true })).toBe(true);
    expect(k({ key: 'z', code: '', metaKey: true })).toBe(true);
    expect(k({ key: 'Z', code: 'KeyZ', ctrlKey: true })).toBe(true);
    expect(k({ key: 'z', code: 'KeyZ' })).toBe(false);
    expect(k({ key: 'z', code: 'KeyZ', ctrlKey: true, altKey: true })).toBe(false);
    expect(k({ key: 'y', code: 'KeyY', ctrlKey: true })).toBe(false);
  });

  it('Ctrl+Z отменяет, Ctrl+Shift+Z повторяет, событие клавиши гасится; после размонтирования — ничего', () => {
    const store = seedEngine();
    const { unmount } = renderHook(() => useUndoKeys(store));
    const hp = () => store.getState().state.actors.captain.hp.current;
    expect(hp()).toBe(45);

    const down = new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, cancelable: true });
    act(() => { window.dispatchEvent(down); });
    expect(hp()).toBe(65);
    expect(down.defaultPrevented).toBe(true);
    expect(store.getState().toast).toMatch(/^Отменено: /);

    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, shiftKey: true })); });
    expect(hp()).toBe(45);
    expect(store.getState().toast).toMatch(/^Повторено: /);

    const plain = new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', cancelable: true });
    act(() => { window.dispatchEvent(plain); });
    expect(hp()).toBe(45);
    expect(plain.defaultPrevented).toBe(false);

    unmount();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true })); });
    expect(hp()).toBe(45);
  });
});
