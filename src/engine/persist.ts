// Хранение лога. MVP — localStorage; IndexedDB придёт тем же интерфейсом.
import type { DomainEvent } from './events';

export interface EventStore {
  load(): DomainEvent[] | null;
  /** false — не сохранилось (квота, приватный режим): стор поднимает saveFailed, стол говорит мастеру. */
  save(events: readonly DomainEvent[]): boolean | void;
  clear(): void;
}

export const LOG_FORMAT = 1;

interface Envelope { format: number; events: DomainEvent[] }

/** Лог в текст — тот же конверт, что в localStorage; им же сохраняется файл сессии. */
export function serializeLog(events: readonly DomainEvent[]): string {
  const env: Envelope = { format: LOG_FORMAT, events: [...events] };
  return JSON.stringify(env);
}

/** Текст → лог; не тот формат или не JSON — ошибка с причиной (файл не тот, версия другая), а не null. */
export function parseLog(text: string): DomainEvent[] {
  let env: unknown;
  try {
    env = JSON.parse(text);
  } catch {
    throw new Error('это не JSON');
  }
  const e = env as Partial<Envelope> | null;
  if (!e || typeof e !== 'object' || !Array.isArray(e.events)) throw new Error('в файле нет журнала событий');
  if (e.format !== LOG_FORMAT) throw new Error(`формат журнала ${String(e.format)}, а стол читает ${LOG_FORMAT}`);
  return e.events;
}

export function localStorageStore(key: string, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = globalThis.localStorage): EventStore {
  return {
    load() {
      let raw: string | null;
      try { raw = storage.getItem(key); } catch { return null; }
      if (!raw) return null;
      try {
        return parseLog(raw);
      } catch {
        return null;
      }
    },
    save(events) {
      // Квота или приватный режим: сессия живёт в памяти, но молча это не проходит (И2, 30.10.2026) — стол предложит файл.
      try { storage.setItem(key, serializeLog(events)); return true; } catch { return false; }
    },
    clear() {
      try { storage.removeItem(key); } catch { /* нечего чистить */ }
    },
  };
}

export function memoryStore(): EventStore {
  let saved: DomainEvent[] | null = null;
  return {
    load: () => (saved ? saved.map(e => ({ ...e })) : null),
    save: events => { saved = events.map(e => ({ ...e })); return true; },
    clear: () => { saved = null; },
  };
}
