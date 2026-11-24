import { useEffect, useMemo, useRef, useState } from 'react';
import type { PreparedSimulation } from '../../campaign/prepareSimulation';
import type { RumorRoutePreview } from '../../campaign/rumor';
import type { CaravanPlaceOption } from '../../campaign/caravan';
import { SECONDS_PER_DAY } from '../../engine/state';
import { RUMOR_RULES } from '../../campaign/rumor';
import { BTN } from './styles';

export interface RumorOrder { from: string; to: string; checkpoints?: readonly string[]; text: string; speedMilesPerDay: number }
type RumorSimulation = Pick<PreparedSimulation, 'ready' | 'rumorPlaces' | 'previewRumorRoute'>;

interface Props {
  prepare: () => Promise<RumorSimulation | null>;
  propose: (order: RumorOrder) => Promise<string>;
}

const FIELD = 'min-w-0 w-full bg-wl text-tx shadow-bevel-in px-2 py-1 type-body-sm';
const placeLabel = (places: readonly CaravanPlaceOption[], id: string) => places.find(place => place.id === id)?.name ?? id;

function routeDays(route: RumorRoutePreview, speed: number): number | null {
  const seconds = route.edges.reduce((sum, edge) => sum + Math.max(1, Math.ceil(edge.miles / speed * SECONDS_PER_DAY)), 0);
  return Number.isSafeInteger(seconds) ? Math.ceil(seconds / SECONDS_PER_DAY) : null;
}

/** GM-authored, explicitly table-ruled rumor route; the authored text is not exposed before an accepted arrival. */
export function RumorPlanner({ prepare, propose }: Props) {
  const [open, setOpen] = useState(false);
  const [prepared, setPrepared] = useState<RumorSimulation | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [checkpoints, setCheckpoints] = useState<string[]>([]);
  const [checkpointCandidate, setCheckpointCandidate] = useState('');
  const [text, setText] = useState('');
  const [speed, setSpeed] = useState('20');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const alive = useRef(true);
  const busy = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const places = useMemo(() => prepared?.rumorPlaces() ?? [], [prepared]);
  const route = useMemo(() => prepared && from && to ? prepared.previewRumorRoute(from, to, checkpoints) : null, [prepared, from, to, checkpoints]);
  const speedValue = Number(speed);
  const days = route && Number.isFinite(speedValue) && speedValue > 0 ? routeDays(route, speedValue) : null;
  const valid = !!route && !!text.trim() && text.trim().length <= RUMOR_RULES.maximumTextLength && days !== null;

  const load = async () => {
    setOpen(true);
    if (busy.current || prepared?.ready) return;
    busy.current = true; setLoading(true); setError('');
    try {
      const next = await prepare();
      if (!alive.current) return;
      if (!next?.ready) { setError('Граф дорог недоступен. Можно повторить загрузку.'); return; }
      const options = next.rumorPlaces();
      if (options.length < 2) { setPrepared(next); setError('Для слухов нужны как минимум два поселения в графе дорог.'); return; }
      setPrepared(next);
      const origin = options.find(place => place.name.toLowerCase() === 'waterdeep') ?? options[0]!;
      const destination = options.find(place => place.name.toLowerCase() === 'neverwinter' && place.id !== origin.id)
        ?? options.find(place => place.id !== origin.id)!;
      setFrom(origin.id); setTo(destination.id);
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { busy.current = false; if (alive.current) setLoading(false); }
  };

  const submit = async () => {
    if (busy.current || !valid || !route) return;
    busy.current = true; setSending(true); setError(''); setMessage('');
    try {
      const result = await propose({ from, to, ...(checkpoints.length ? { checkpoints: [...checkpoints] } : {}), text: text.trim(), speedMilesPerDay: speedValue });
      if (alive.current) setMessage(result);
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { busy.current = false; if (alive.current) setSending(false); }
  };
  const checkpointOptions = places.filter(place => place.id !== from && place.id !== to && !checkpoints.includes(place.id));
  const addCheckpoint = () => {
    if (!checkpointCandidate || checkpoints.includes(checkpointCandidate)) return;
    setCheckpoints(current => [...current, checkpointCandidate]);
    setCheckpointCandidate('');
    setError(''); setMessage('');
  };

  return <div className="flex flex-col gap-2 min-w-0">
    <p className="type-body-sm text-t2">Задайте, что услышат игроки, и путь вести по дорогам. Скорость — правило стола; до прибытия содержание и маршрут скрыты от игроков.</p>
    <button type="button" className={`${BTN} self-start`} aria-expanded={open} onClick={() => { if (open) setOpen(false); else void load(); }}>
      {open ? 'Скрыть планирование слуха' : 'Отправить слух по дорогам'}
    </button>
    {open ? <div className="flex flex-col gap-2 min-w-0" aria-label="Планирование слуха">
      {loading ? <p role="status" className="type-body-sm text-t2">Загружается граф дорог…</p> : null}
      {!prepared?.ready && !loading ? <button type="button" className={`${BTN} self-start`} onClick={() => void load()}>Повторить загрузку дорог</button> : null}
      {prepared?.ready && places.length >= 2 ? <form className="flex flex-col gap-2 min-w-0" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <div className="grid grid-cols-1 min-[640px]:grid-cols-2 gap-2">
          <label className="type-body-sm text-t2 min-w-0">Откуда идёт весть<select aria-label="Откуда идёт весть" className={FIELD} value={from} onChange={event => { const value = event.target.value; setFrom(value); setCheckpoints(current => current.filter(id => id !== value)); setError(''); setMessage(''); }}>
            {places.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}
          </select></label>
          <label className="type-body-sm text-t2 min-w-0">Куда дойдёт весть<select aria-label="Куда дойдёт весть" className={FIELD} value={to} onChange={event => { const value = event.target.value; setTo(value); setCheckpoints(current => current.filter(id => id !== value)); setError(''); setMessage(''); }}>
            {places.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}
          </select></label>
          <label className="type-body-sm text-t2 min-w-0">Скорость, миль в день · правило стола<input aria-label="Скорость слуха" className={FIELD} type="number" min="0" step="any" required value={speed} onChange={event => { setSpeed(event.target.value); setError(''); setMessage(''); }} /></label>
        </div>
        <div className="flex flex-col gap-1" aria-label="Контрольные точки слуха">
          <label className="type-body-sm text-t2 min-w-0">Добавить контрольный пункт<select aria-label="Контрольный пункт слуха" className={FIELD} value={checkpointCandidate} onChange={event => setCheckpointCandidate(event.target.value)}>
            <option value="">Без промежуточного пункта</option>{checkpointOptions.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}
          </select></label>
          <button type="button" className={`${BTN} self-start`} disabled={!checkpointCandidate} onClick={addCheckpoint}>Добавить пункт</button>
          {checkpoints.length ? <ol className="type-body-xs text-t2" aria-label="Выбранные контрольные пункты">{checkpoints.map((id, index) => <li key={`${id}-${index}`} className="flex items-center gap-2">
            <span>{index + 1}. {placeLabel(places, id)}</span><button type="button" className="underline" onClick={() => { setCheckpoints(current => current.filter((_, i) => i !== index)); setError(''); setMessage(''); }}>Убрать</button>
          </li>)}</ol> : null}
        </div>
        <label className="type-body-sm text-t2 min-w-0">Текст, который узнают игроки<textarea aria-label="Текст слуха" className={FIELD} rows={2} maxLength={RUMOR_RULES.maximumTextLength} required value={text} onChange={event => { setText(event.target.value); setError(''); setMessage(''); }} /></label>
        {route ? <section className="type-body-xs text-t2" aria-label="Маршрут слуха">
          <p>Путь: {route.nodes.map(id => placeLabel(places, id)).join(' → ')} · {route.miles.toLocaleString('ru-RU')} мили</p>
          <p>Оценка срока: {days === null ? 'слишком велик для точного расчёта' : `${days} дн. при выбранной скорости`}</p>
        </section> : <p className="type-body-xs text-t2">Для этой пары поселений нет сухопутного пути.</p>}
        <button type="submit" className={`${BTN} self-start disabled:opacity-50`} disabled={sending || !valid}>{sending ? 'Готовится предложение…' : 'Предложить слух'}</button>
        <p className="type-body-xs text-t2">По прибытии мастер отдельно принимает предложение. После принятия слух появляется в сцене места назначения.</p>
      </form> : null}
      {error ? <p role="alert" className="type-body-sm text-fx-debuff-hi">{error}</p> : null}
      {message ? <p role="status" className="type-body-sm text-src-sim">{message}</p> : null}
    </div> : null}
  </div>;
}
