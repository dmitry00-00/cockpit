// Журнал не теряется молча (И2, 30.10.2026): квота браузера кончилась — стор поднимает saveFailed, стол говорит
// мастеру и даёт сохранить файлом; место вернулось — полоса уходит. Одна вкладка стола на браузер: вторая не монтирует
// стол, «Открыть здесь» забирает его, закрыли хозяина — ждущая открывает сама.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedEngine } from '../../campaign';
import { localStorageStore } from '../../engine';
import { DeskPage } from '../DeskPage';
import { DeskLease } from './DeskLease';
import { fixed, mount } from './testkit';

afterEach(() => vi.unstubAllGlobals());

/** Хранилище с переключаемой квотой. */
function quotaStorage() {
  const data = new Map<string, string>();
  let full = false;
  return {
    setFull: (v: boolean) => { full = v; },
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { if (full) throw new DOMException('quota', 'QuotaExceededError'); data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  };
}

describe('сохранение журнала', () => {
  it('квота: save → false, saveFailed, полоса с «Сохранить файлом»; место вернулось — полосы нет', () => {
    const storage = quotaStorage();
    const persist = localStorageStore('k', storage);
    expect(persist.save([])).toBe(true);
    const store = seedEngine({ persist, ...fixed() });
    mount(store);
    expect(screen.queryByRole('alert')).toBeNull();
    storage.setFull(true);
    act(() => { store.getState().rollDice('1d20'); });
    expect(store.getState().saveFailed).toBe(true);
    expect(screen.getByRole('alert')).toHaveTextContent('Журнал больше не сохраняется в браузере');
    expect(screen.getByRole('button', { name: 'Сохранить файлом' })).toBeInTheDocument();
    storage.setFull(false);
    act(() => { store.getState().rollDice('1d20'); });
    expect(store.getState().saveFailed).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('показывает экспорт исходного повреждённого журнала и скачивает его без изменений', async () => {
    const source = '{broken';
    const values = new Map<string, string>([['campaign', source]]);
    const persist = localStorageStore('campaign', {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: key => { values.delete(key); },
    });
    seedEngine({ persist, ...fixed(), onRecover: () => {} }); // восстанавливает сид, сохранив исходную строку
    expect(values.get('campaign')).not.toBe(source);
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:recovery');
    const revokeObjectURL = vi.fn();
    const URLShim = class extends globalThis.URL {};
    Object.assign(URLShim, { createObjectURL, revokeObjectURL });
    vi.stubGlobal('URL', URLShim);
    const clicks: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicks.push(this); });

    render(<DeskPage persist={persist} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Сохранённый исходный текст журнала доступен');
    fireEvent.click(screen.getByRole('button', { name: 'Скачать исходную запись' }));

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    if (!blob) throw new Error('Не создан файл исходного журнала');
    const downloadedText = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(downloadedText).toBe(source);
    expect(clicks[0]?.download).toBe('dm-cockpit-recovery-original.txt');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:recovery');
  });
});

/** Web Locks в миниатюре: один держатель, очередь, steal, отмена сигналом — как в спецификации. */
function fakeLocks() {
  type Entry = { cb: (l: Lock | null) => unknown; resolve: (v: unknown) => void; reject: (e: unknown) => void; signal?: AbortSignal };
  let holder: Entry | null = null;
  const queue: Entry[] = [];
  const abort = () => new DOMException('aborted', 'AbortError');
  const grant = (e: Entry) => {
    holder = e;
    Promise.resolve(e.cb({ name: 'x', mode: 'exclusive' } as Lock)).then(v => {
      if (holder !== e) return;
      holder = null;
      e.resolve(v);
      const next = queue.shift();
      if (next) grant(next);
    });
  };
  return {
    request(_name: string, opts: LockOptions, cb: (l: Lock | null) => unknown) {
      return new Promise((resolve, reject) => {
        const e: Entry = { cb, resolve, reject, ...(opts.signal ? { signal: opts.signal } : {}) };
        if (opts.steal) {
          const was = holder;
          holder = null;
          was?.reject(abort());
          grant(e);
        } else if (holder) {
          queue.push(e);
          opts.signal?.addEventListener('abort', () => {
            const i = queue.indexOf(e);
            if (i >= 0) { queue.splice(i, 1); reject(abort()); }
          });
        } else grant(e);
      });
    },
  } as unknown as Pick<LockManager, 'request'>;
}

describe('одна вкладка стола', () => {
  it('вторая ждёт и говорит «уже открыт»; «Открыть здесь» забирает; закрыли хозяина — ждущая открывает сама', async () => {
    const locks = fakeLocks();
    const a = render(<DeskLease locks={locks}><p>стол A</p></DeskLease>);
    expect(await screen.findByText('стол A')).toBeInTheDocument();
    const b = render(<DeskLease locks={locks}><p>стол B</p></DeskLease>);
    expect(await screen.findByText('Стол уже открыт в другой вкладке', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.queryByText('стол B')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Открыть здесь' }));
    expect(await screen.findByText('стол B')).toBeInTheDocument();
    expect(await screen.findByText('Стол забрала другая вкладка')).toBeInTheDocument();
    expect(screen.queryByText('стол A')).toBeNull();

    b.unmount();
    expect(await screen.findByText('стол A')).toBeInTheDocument();
    a.unmount();
  });

  it('без Web Locks — стол сразу, как раньше', () => {
    render(<DeskLease locks={undefined}><p>стол</p></DeskLease>);
    expect(screen.getByText('стол')).toBeInTheDocument();
  });
});
