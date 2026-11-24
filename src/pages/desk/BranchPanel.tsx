// Панель «Ветки «что если»» в «Пульсе» (Д4): открыть ветку от нынешнего мира, в ней — принять или отклонить ждущее,
// шагнуть на три десятидневки (симуляция предлагает, как на столе), «Принять всё ждущее», отменить шаг ветки. Рядом —
// только то, что разошлось с основной линией: дата, отношения, известность, цены, нити, решения. «Оставить» — события
// ветки в журнал; «Отбросить» — ветки нет. Только мастеру: у игроков «Пульса» нет вовсе.
import { useState } from 'react';
import { diffWorld, stepTime, TENDAY, type DiffGroup } from '../../campaign';
import { worldDeltaFreshness, type Branch, type State } from '../../engine';
import { MAX_BRANCHES } from './useBranches';

const BTN = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const BTN_MAIN = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 bg-linear-to-b from-pl to-cd shadow-[var(--bevel),inset_0_-2px_0_var(--gd)] text-gd-hi cursor-pointer enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const GROUP_LABEL: Readonly<Record<DiffGroup, string>> = {
  time: 'время', party: 'партия', relation: 'отношения', faction: 'фракции', location: 'места', thread: 'нити', delta: 'предложения',
};

export interface BranchPanelProps {
  main: State;
  branches: readonly Branch[];
  onOpen: (name: string) => void;
  onKeep: (id: string) => void;
  onDrop: (id: string) => void;
  fresh: (b: Branch) => boolean;
}

export function BranchPanel({ main, branches, onOpen, onKeep, onDrop, fresh }: BranchPanelProps) {
  const [name, setName] = useState('');
  const states = [main, ...branches.map(b => b.store.getState().state)];
  const rows = branches.length ? diffWorld(states) : [];
  const nextName = name.trim() || (branches.length === 0 ? 'Если партия поможет' : 'Если нет');
  return (
    <div className="flex flex-col gap-3" data-part="branches">
      {branches.length < MAX_BRANCHES ? (
        <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); onOpen(nextName); setName(''); }}>
          <input aria-label="Имя ветки" value={name} placeholder={nextName} onChange={e => setName(e.target.value)} className="h-7 px-2 w-64 type-body-sm text-tx bg-wl shadow-bevel-in placeholder:text-t2 focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]" />
          <button type="submit" className={BTN_MAIN} title="Копия мира в памяти: в ней можно принимать и шагать временем, основная линия не меняется">Открыть ветку</button>
        </form>
      ) : null}
      {branches.map(b => {
        const api = b.store.getState();
        const pending = Object.values(api.state.deltas).filter(d => d.status === 'pending');
        const stale = pending.filter(d => !worldDeltaFreshness(api.state, d).current);
        const ok = fresh(b);
        return (
          <section key={b.id} aria-label={`Ветка: ${b.name}`} data-branch={b.id} className="flex flex-col gap-2 bg-cd shadow-bevel p-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="type-h-15 text-src-sim">{b.name}</span>
              <span className="type-key text-t2">событий в ветке: {api.events.length}</span>
              <span className="ml-auto flex items-center gap-1 flex-wrap">
                <button type="button" className={BTN} onClick={() => stepTime(api, 'tenday', 3)} title={`Шаг ${3 * TENDAY} дней в ветке: симуляция предложит, что случилось`}>Три десятидневки</button>
                <button type="button" className={BTN} disabled={pending.length === 0 || stale.length > 0} onClick={() => pending.forEach(d => api.accept(d.id))} title={stale.length ? 'Сначала пересчитайте устаревшие предложения' : 'В ветке принять всё, что ждёт решения'}>Принять всё ждущее</button>
                <button type="button" className={BTN} disabled={!api.canUndo} onClick={() => api.undo()} title="Отменить последнее в ветке">Отменить</button>
                <button type="button" className={BTN_MAIN} disabled={!ok || api.events.length === 0} onClick={() => onKeep(b.id)} title={ok ? 'События ветки — в журнал основной линии; другие ветки закроются' : 'Основная линия ушла вперёд — ветку не оставить, только отбросить'}>Оставить</button>
                <button type="button" className={BTN} onClick={() => onDrop(b.id)} title="Забыть ветку">Отбросить</button>
              </span>
            </div>
            {stale.length ? <p role="status" aria-live="polite" className="type-body-xs text-fx-debuff-hi">В ветке устарели предложения: {stale.length}. Пересчёт обязателен.</p> : null}
            {pending.length > 0 ? (
              <ul aria-label={`Ждёт решения в ветке ${b.name}`} className="flex flex-col gap-1 m-0 p-0 list-none">
                {pending.map(d => {
                  const freshness = worldDeltaFreshness(api.state, d);
                  return <li key={d.id} className="flex items-center gap-2 type-body-sm">
                    <span className="flex-1 min-w-0 truncate text-tx" title={`${d.subject}: ${d.was} → ${d.now} · ${d.cause}`}>{d.subject}: {d.was} → <span className="text-src-sim">{d.now}</span></span>
                    {freshness.current ? null : <span data-part="freshness" className="type-body-xs text-fx-debuff-hi">Пересчёт обязателен: {freshness.message}</span>}
                    <button type="button" className={BTN} disabled={!freshness.current} onClick={() => api.accept(d.id)}>Принять</button>
                    <button type="button" className={BTN} title={freshness.current ? 'Отклонить' : 'Отклонить устаревшее предложение'} onClick={() => api.reject(d.id)}>{freshness.current ? 'Отклонить' : 'Отклонить устаревшее предложение'}</button>
                  </li>;
                })}
              </ul>
            ) : null}
          </section>
        );
      })}
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table aria-label="Разница с основной линией" className="border-separate border-spacing-0 min-w-full">
            <thead>
              <tr>
                <th className="text-left px-2 py-1 type-key text-t2 font-normal">Что</th>
                <th className="text-left px-2 py-1 type-key text-t2 font-normal">Основная</th>
                {branches.map(b => <th key={b.id} className="text-left px-2 py-1 type-key text-src-sim font-normal">{b.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key} data-diff={r.key}>
                  <th scope="row" className="text-left px-2 py-1 type-body-sm text-tx font-normal" style={{ boxShadow: 'inset 0 -1px 0 var(--lo)' }}>
                    <span className="type-key text-t2">{GROUP_LABEL[r.group]} · </span>{r.label}
                  </th>
                  {r.values.map((v, i) => (
                    <td key={i} className={`px-2 py-1 type-body-sm ${i > 0 && v !== r.values[0] ? 'text-src-sim' : 'text-tx'}`} style={{ boxShadow: 'inset 0 -1px 0 var(--lo)' }}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export default BranchPanel;
