import { useEffect, useRef, useState } from 'react';
import type { PreparedCosmicSimulation } from '../../campaign/prepareCosmic';
import { COSMIC_EVENT_LABEL, type CosmicEventKind, type CosmicRequestInput } from '../../campaign/cosmic';
import type { State } from '../../engine/state';
import { BTN } from './styles';

interface Props {
  state: State;
  prepare: () => Promise<PreparedCosmicSimulation | null>;
  propose: (input: Omit<CosmicRequestInput, 'timeEventId'>) => Promise<string>;
}
const FIELD = 'min-w-0 w-full bg-wl text-tx shadow-bevel-in px-2 py-1 type-body-sm';

/** Manual planetary/cosmic scenario authoring; sources identify the body, not the authored event. */
export function CosmicPlanner({ state, prepare, propose }: Props) {
  const [open, setOpen] = useState(false);
  const [prepared, setPrepared] = useState<PreparedCosmicSimulation | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [eventKind, setEventKind] = useState<CosmicEventKind>('authored');
  const [text, setText] = useState('');
  const [durationDays, setDurationDays] = useState('30');
  const [playerVisible, setPlayerVisible] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const alive = useRef(true);
  const busy = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setMessage(''); setError(''); }, [state.world]);
  const targets = prepared?.targets() ?? [];
  const target = targets.find(item => item.id === targetId) ?? targets.find(item => item.id === 'body:toril') ?? targets[0];
  const days = Number(durationDays);
  const valid = !!target && !!text.trim() && text.trim().length <= 500 && Number.isSafeInteger(days) && days >= 1 && days <= 36_500;
  const load = async () => {
    setOpen(true);
    if (busy.current || prepared) return;
    busy.current = true; setLoading(true); setError('');
    try {
      const next = await prepare();
      if (!alive.current) return;
      if (!next) { setError('Справочник Realmspace не подготовлен.'); return; }
      const options = next.targets();
      if (!options.length) { setError('Каталоги планов и Realmspace не содержат доступных целей.'); setPrepared(next); return; }
      setPrepared(next); setTargetId(options.find(option => option.id === 'body:toril')?.id ?? options[0].id);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { busy.current = false; if (alive.current) setLoading(false); }
  };
  const submit = async () => {
    if (busy.current || !valid || !target) return;
    busy.current = true; setSending(true); setError(''); setMessage('');
    try {
      const result = await propose({ targetId: target.id, eventKind, text: text.trim(), durationDays: days, playerVisible });
      if (alive.current) setMessage(result);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { busy.current = false; if (alive.current) setSending(false); }
  };
  return <div className="flex flex-col gap-2 min-w-0">
    <p className="type-body-sm text-t2">Каталоги дают план, тело и доступные ссылки. Участники, ход конфликта и последствия задаёт мастер; автоматических орбитальных или божественных эффектов нет.</p>
    <button type="button" className={`${BTN} self-start`} aria-expanded={open} onClick={() => { if (open) setOpen(false); else void load(); }}>
      {open ? 'Скрыть космический сценарий' : 'Подготовить космический сценарий'}
    </button>
    {open ? <div className="flex flex-col gap-2 min-w-0" aria-label="Космический сценарий">
      {loading ? <p role="status" className="type-body-sm text-t2">Загружается каталог Realmspace…</p> : null}
      {prepared && targets.length ? <form className="flex flex-col gap-2 min-w-0" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <label className="type-body-sm text-t2">Цель<select aria-label="Цель процесса" className={FIELD} value={target?.id ?? ''} onChange={event => setTargetId(event.target.value)}>
          {targets.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select></label>
        {target?.refs.length ? <p className="type-body-xs text-t2">Ссылки цели: {target.refs.join('; ')}</p> : <p className="type-body-xs text-t2">Для этой цели каталог не содержит отдельной книжной ссылки.</p>}
        <label className="type-body-sm text-t2">Тип процесса<select aria-label="Тип космического процесса" className={FIELD} value={eventKind} onChange={event => setEventKind(event.target.value as CosmicEventKind)}>
          {(Object.keys(COSMIC_EVENT_LABEL) as CosmicEventKind[]).map(kind => <option key={kind} value={kind}>{COSMIC_EVENT_LABEL[kind]}</option>)}
        </select></label>
        <label className="type-body-sm text-t2">Сценарий и последствие, введённые мастером<textarea aria-label="Космическое событие" className={FIELD} rows={2} maxLength={500} required value={text} onChange={event => setText(event.target.value)} /></label>
        <label className="type-body-sm text-t2">Срок до предложения последствия, дни<input aria-label="Срок космического процесса" className={FIELD} type="number" min="1" max="36500" step="1" required value={durationDays} onChange={event => setDurationDays(event.target.value)} /></label>
        <label className="flex items-center gap-2 type-body-sm text-t2"><input type="checkbox" checked={playerVisible} onChange={event => setPlayerVisible(event.target.checked)} />После завершения показать итог игрокам</label>
        <button type="submit" className={`${BTN} self-start disabled:opacity-50`} disabled={sending || !valid}>{sending ? 'Готовится предложение…' : 'Предложить процесс'}</button>
        <p className="type-body-xs text-t2">Если выбранного плана или тела ещё нет в кампанийной лестнице, он добавится при принятии предложения.</p>
      </form> : null}
      {error ? <p role="alert" className="type-body-sm text-fx-debuff-hi">{error}</p> : null}
      {message ? <p role="status" className="type-body-sm text-src-sim">{message}</p> : null}
    </div> : null}
  </div>;
}
