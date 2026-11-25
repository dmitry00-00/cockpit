// Хранение лога. MVP — localStorage; IndexedDB придёт тем же интерфейсом.
import type { DomainEvent } from './events';

export interface EventStore {
  load(): DomainEvent[] | null;
  /** false — не сохранилось (квота, приватный режим): стор поднимает saveFailed, стол говорит мастеру. */
  save(events: readonly DomainEvent[]): boolean | void;
  clear(): void;
  /** Сохраняет точную последнюю прочитанную строку до того, как восстановление заменит журнал. */
  preserveRecoveryCopy?(): boolean;
  /** Возвращает сохранённую исходную строку, если копия доступна. */
  loadRecoveryCopy?(): string | null;
}

/** localStorage could not be read at all; keep the saved value intact and recover in memory. */
export class EventStoreReadError extends Error {
  constructor(cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`не удалось прочитать сохранённый журнал: ${detail}`);
    this.name = 'EventStoreReadError';
  }
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

export function localStorageStore(key: string, storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): EventStore {
  // Resolve lazily so even the localStorage getter itself is covered by load/save recovery.
  const resolveStorage = () => storage ?? globalThis.localStorage;
  const recoveryKey = `${key}.recovery-original`;
  let loaded = false;
  let lastRaw: string | null = null;
  return {
    load() {
      let raw: string | null;
      try { raw = resolveStorage().getItem(key); }
      catch (err) { throw new EventStoreReadError(err); }
      loaded = true;
      lastRaw = raw;
      // Only an absent key means "no saved session". Empty or malformed text must enter recovery.
      return raw === null ? null : parseLog(raw);
    },
    save(events) {
      // Квота или приватный режим: сессия живёт в памяти, но молча это не проходит (И2, 30.10.2026) — стол предложит файл.
      try { resolveStorage().setItem(key, serializeLog(events)); return true; } catch { return false; }
    },
    clear() {
      try { resolveStorage().removeItem(key); } catch { /* нечего чистить */ }
    },
    preserveRecoveryCopy() {
      if (!loaded || lastRaw === null) return false;
      try {
        const target = resolveStorage();
        const previous = target.getItem(recoveryKey);
        if (previous !== null && previous !== lastRaw) {
          const archiveBase = `${recoveryKey}.${Date.now()}`;
          let archiveKey = archiveBase;
          let suffix = 1;
          while (target.getItem(archiveKey) !== null) archiveKey = `${archiveBase}-${suffix++}`;
          target.setItem(archiveKey, previous);
        }
        target.setItem(recoveryKey, lastRaw);
        return true;
      } catch { return false; }
    },
    loadRecoveryCopy() {
      try { return resolveStorage().getItem(recoveryKey); } catch { return null; }
    },
  };
}

export function memoryStore(): EventStore {
  let saved: DomainEvent[] | null = null;
  let recoveryCopy: string | null = null;
  return {
    load: () => (saved ? saved.map(e => ({ ...e })) : null),
    save: events => { saved = events.map(e => ({ ...e })); return true; },
    clear: () => { saved = null; },
    preserveRecoveryCopy: () => { if (!saved) return false; recoveryCopy = serializeLog(saved); return true; },
    loadRecoveryCopy: () => recoveryCopy,
  };
}
