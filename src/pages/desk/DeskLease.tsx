// Один стол на машину (И2, 30.10.2026): две вкладки стола писали один лог в localStorage, и последняя сохранившая
// затирала другую. Теперь пишет только вкладка, у которой блокировка браузера (Web Locks) `DESK_LOCK`; остальные
// стол не монтируют вовсе — нечему сохранять. «Открыть здесь» забирает блокировку (steal): прежняя вкладка теряет её
// и закрывает стол, эта поднимает его из хранилища — лог там свежий, стор пишет его на каждом событии. Закрыли
// вкладку-хозяина — ждущая получает стол сама. Нет Web Locks (старый браузер, не защищённый контекст) — защиты нет,
// стол как раньше.
import { useEffect, useRef, useState, type ReactNode } from 'react';

export const DESK_LOCK = 'dm-cockpit:desk';

/** Сколько ждать блокировку, прежде чем сказать «стол открыт в другой вкладке»: в StrictMode первое монтирование
 *  отпускает её чуть позже, чем просит второе. */
export const LEASE_WAIT_MS = 400;

export type Lease = 'pending' | 'owner' | 'other' | 'lost';

type Locks = Pick<LockManager, 'request'>;

const defaultLocks = (): Locks | undefined => (typeof navigator !== 'undefined' ? navigator.locks : undefined);

export function useDeskLease(locks: Locks | undefined = defaultLocks(), name = DESK_LOCK): { lease: Lease; takeOver: () => void } {
  const [lease, setLease] = useState<Lease>(locks ? 'pending' : 'owner');
  /** Отпустить то, что держим, и отменить ждущий запрос. */
  const drop = useRef<() => void>(() => {});

  const hold = (steal: boolean) => {
    if (!locks) return;
    drop.current();
    const ctl = new AbortController();
    let release = () => {};
    let granted = false;
    const timer = steal ? undefined : setTimeout(() => { if (!granted) setLease(l => (l === 'lost' ? l : 'other')); }, LEASE_WAIT_MS);
    drop.current = () => { clearTimeout(timer); ctl.abort(); release(); };
    locks.request(name, steal ? { steal: true } : { signal: ctl.signal }, () => {
      if (ctl.signal.aborted) return undefined;
      granted = true;
      clearTimeout(timer);
      setLease('owner');
      return new Promise<void>(r => { release = r; });
    }).catch(() => {
      // Отменили сами (размонтирование, перехват здесь же) — молчим; забрала другая вкладка — стол закрывается, а
      // вкладка снова встаёт в очередь: закроют ту — стол вернётся сюда.
      if (ctl.signal.aborted) return;
      setLease('lost');
      hold(false);
    });
  };

  useEffect(() => {
    hold(false);
    return () => drop.current();
  }, [locks, name]); // hold — функция рендера; блокировку берём один раз на монтирование

  return { lease, takeOver: () => hold(true) };
}

export function DeskLease({ children, locks }: { children: ReactNode; locks?: Locks }) {
  const { lease, takeOver } = useDeskLease(locks ?? defaultLocks());
  if (lease === 'owner') return <>{children}</>;
  if (lease === 'pending') return <p role="status" className="p-4 type-body text-t2">Стол открывается…</p>;
  return (
    <main aria-label="Стол в другой вкладке" data-part="desk-lease" className="p-6 flex flex-col items-start gap-3 max-w-[640px]">
      <h1 className="type-h-17 text-tx">{lease === 'lost' ? 'Стол забрала другая вкладка' : 'Стол уже открыт в другой вкладке'}</h1>
      <p className="type-body text-t2">
        Журнал сессии один на браузер: две вкладки стола затирали бы друг друга. Здесь стол закрыт, всё сохранено в той вкладке.
        Закройте её — стол откроется здесь сам, или заберите его сюда.
      </p>
      <button type="button" onClick={takeOver} className="type-num-12 uppercase px-3 py-1 bg-linear-to-b from-pl to-cd shadow-[var(--bevel),inset_0_-2px_0_var(--gd)] text-gd-hi cursor-pointer focus-visible:shadow-[var(--bevel),inset_0_-2px_0_var(--gd),var(--glow-gold)]">
        Открыть здесь
      </button>
    </main>
  );
}
