// Хуки страницы над стором. Стор создаёт и держит страница; компоненты получают срезы состояния и
// колбэки пропсами (CLAUDE.md «Состояние»). Здесь три вещи, которые нужны любому экрану над логом:
// срез стора, вспышка полосы хитов по последнему событию и горячие клавиши отмены. Ни одна из них
// не хранит хиты: вспышка помнит id события, а не число.
import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { DomainEvent, PayloadByType } from './events';
import type { EngineStore, EngineStoreApi } from './store';

/** Срез стора с подпиской: `useEngine(api, s => s.state)`. Тонкая обёртка, чтобы страницы не тянули zustand сами. */
export function useEngine<T>(api: EngineStoreApi, selector: (s: EngineStore) => T): T {
  return useStore(api, selector);
}

export type HpFlashKind = 'damage' | 'heal';

export interface HpFlashHit {
  targetId: string;
  flash: HpFlashKind;
}

/** Предел движения в системе — 200 мс (CLAUDE.md «Визуальный язык»). */
export const HP_FLASH_MS = 200;

/**
 * Какую вспышку даёт событие: урон — damage, лечение и временные хиты — heal. Компенсация (undoes)
 * восстанавливает след в обратную сторону, поэтому отменённый урон вспыхивает как лечение; повтор
 * (redoes) — как исходное. Остальные события полосу не трогают.
 */
export function hpFlashOf(event: DomainEvent | undefined): HpFlashHit | null {
  if (!event) return null;
  let flash: HpFlashKind;
  switch (event.type) {
    case 'DAMAGE_APPLIED':
      flash = 'damage';
      break;
    case 'HEALING_APPLIED':
    case 'TEMP_HP_GRANTED':
      flash = 'heal';
      break;
    default:
      return null;
  }
  if (event.undoes) flash = flash === 'damage' ? 'heal' : 'damage';
  const { targetId } = event.payload as PayloadByType['DAMAGE_APPLIED'];
  return { targetId, flash };
}

/**
 * Вспышка по последнему событию лога стора: карта «актёр → вид» на HP_FLASH_MS, потом пусто. Событие,
 * которое уже было в логе при первом рендере, не вспыхивает: отблеск бывает только у действия,
 * сделанного при открытом экране. Состояние вида, не домена — хранится id события.
 */
export function useHpFlashes(api: EngineStoreApi, ms: number = HP_FLASH_MS): Readonly<Record<string, HpFlashKind>> {
  const last = useStore(api, s => (s.events.length > 0 ? s.events[s.events.length - 1] : undefined));
  const lastId = last?.id;
  const seen = useRef(lastId);
  // Таймер — в ref, а не в cleanup эффекта: событие без хитов (бросок кости) не должно гасить чужую вспышку.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shown, setShown] = useState<HpFlashHit | null>(null);
  useEffect(() => {
    if (lastId === undefined || lastId === seen.current) return;
    seen.current = lastId;
    const hit = hpFlashOf(last);
    if (!hit) return;
    if (timer.current !== null) clearTimeout(timer.current);
    setShown(hit);
    timer.current = setTimeout(() => {
      timer.current = null;
      setShown(null);
    }, ms);
  }, [last, lastId, ms]);
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);
  return shown ? { [shown.targetId]: shown.flash } : {};
}

/** Ctrl+Z / Ctrl+Shift+Z (и Cmd на Mac) — по коду клавиши, чтобы русская раскладка не мешала. */
export function isUndoKey(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
  return e.code === 'KeyZ' || e.key.toLowerCase() === 'z';
}

/**
 * Горячие клавиши отмены на всём окне: Ctrl+Z — undo, Ctrl+Shift+Z — redo. Нативная отмена в поле
 * ввода гасится: за столом Ctrl+Z значит «верни последнее действие», а не «верни букву».
 * `enabled: false` — стол игроков (шаг 9): клавиш мастера на нём нет.
 */
export function useUndoKeys(api: EngineStoreApi, enabled = true): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (!isUndoKey(e)) return;
      e.preventDefault();
      const s = api.getState();
      if (e.shiftKey) s.redo();
      else s.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [api, enabled]);
}
