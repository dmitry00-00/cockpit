// Ветки «что если» (Д4, DESIGN): копия мира в памяти — второй стор движка от нынешнего состояния. В ветке мастер
// принимает предложения и шагает временем теми же функциями, что на столе; основная линия не меняется. «Оставить» —
// события ветки уходят в лог с теми же id (EventLog.adopt), «Отбросить» — ветка просто забывается. Ветка живёт только
// в памяти страницы: ни в localStorage, ни на стол игроков она не попадает.
import { memoryStore } from './persist';
import { createEngineStore, type EngineStore, type EngineStoreApi } from './store';

export interface Branch {
  id: string;
  name: string;
  /** Длина основного лога, когда ветку открыли: ушёл вперёд — оставить нельзя. */
  baseLength: number;
  store: EngineStoreApi;
}

export function openBranch(main: Pick<EngineStore, 'state' | 'events'>, id: string, name: string): Branch {
  return { id, name, baseLength: main.events.length, store: createEngineStore(main.state, { persist: memoryStore() }) };
}

/** Можно ли оставить: основная линия с тех пор не изменилась. */
export const branchFresh = (main: Pick<EngineStore, 'events'>, b: Branch): boolean => main.events.length === b.baseLength;

export function keepBranch(main: Pick<EngineStore, 'adopt'>, b: Branch): void {
  main.adopt(b.store.getState().events, b.baseLength);
}
