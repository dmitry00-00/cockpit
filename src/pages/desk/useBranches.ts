// Ветки «что если» на столе (Д4): до двух веток в памяти страницы — «если партия поможет» и «если нет». Подписка на
// сторы веток — чтобы вид перерисовывался от их событий. «Оставить» одну — остальные устарели (основная линия ушла
// вперёд), они закрываются.
import { useEffect, useReducer, useState } from 'react';
import { branchFresh, keepBranch, openBranch, type Branch, type EngineStoreApi } from '../../engine';

export const MAX_BRANCHES = 2;

export function useBranches(main: EngineStoreApi) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  // Новая сессия — новый стор: ветки старого мира закрываются.
  useEffect(() => () => setBranches([]), [main]);
  useEffect(() => {
    const off = branches.map(b => b.store.subscribe(bump));
    return () => off.forEach(u => u());
  }, [branches]);
  return {
    branches,
    open(name: string) {
      setBranches(bs => (bs.length >= MAX_BRANCHES ? bs : [...bs, openBranch(main.getState(), `branch-${bs.length + 1}-${main.getState().events.length}`, name)]));
    },
    drop(id: string) { setBranches(bs => bs.filter(b => b.id !== id)); },
    keep(id: string) {
      const b = branches.find(x => x.id === id);
      if (!b) return;
      keepBranch(main.getState(), b);
      setBranches([]);
    },
    fresh: (b: Branch) => branchFresh(main.getState(), b),
  };
}
