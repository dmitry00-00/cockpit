import { useEffect, useMemo, useRef, useState } from 'react';
import type { PreparedSimulation } from '../../campaign/prepareSimulation';
import { GOODS, type GoodsId, type State } from '../../engine/state';
import type { CaravanTransport } from '../../campaign/caravan';
import { GOODS_LABEL } from '../../components/labels';
import { BTN } from './styles';

export interface CaravanOrder {
  from: string;
  to: string;
  goods: GoodsId;
  quantity: number;
  escort: number;
  transport?: CaravanTransport;
  checkpoints?: readonly string[];
  /** Set to create a recurring line instead of a single departure. */
  intervalDays?: number;
}
export type CaravanPlannerSimulation = Pick<PreparedSimulation, 'ready' | 'caravanPlaces' | 'previewCaravanRoute'>;

interface Props {
  prepare: () => Promise<CaravanPlannerSimulation | null>;
  propose: (order: CaravanOrder) => Promise<string>;
  endLine?: (processId: string) => Promise<string>;
  world?: State['world'];
}

const FIELD = 'min-w-0 w-full bg-wl text-tx shadow-bevel-in px-2 py-1 type-body-sm';
const number = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

/** Navigation and route preview are local UI state; only the explicit submit proposes a world change. */
export function CaravanPlanner({ prepare, propose, endLine, world }: Props) {
  const [open, setOpen] = useState(false);
  const [prepared, setPrepared] = useState<CaravanPlannerSimulation | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [goods, setGoods] = useState<GoodsId>('cloth');
  const [quantity, setQuantity] = useState('1');
  const [escort, setEscort] = useState('3');
  const [transport, setTransport] = useState<CaravanTransport>('any');
  const [checkpoints, setCheckpoints] = useState<string[]>([]);
  const [checkpointCandidate, setCheckpointCandidate] = useState('');
  const [schedule, setSchedule] = useState<'once' | 'regular'>('once');
  const [intervalDays, setIntervalDays] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const alive = useRef(true);
  const busy = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setMessage(''); setError(''); }, [world]);
  const places = useMemo(() => prepared?.caravanPlaces() ?? [], [prepared]);
  const preview = useMemo(() => prepared && from && to
    ? prepared.previewCaravanRoute(from, to, { transport, checkpoints }) : null,
  [prepared, from, to, transport, checkpoints]);
  const labels = useMemo(() => new Map(places.map(p => [p.id, p.name])), [places]);
  const activeLines = Object.values(world?.processes ?? {}).filter(process => process.kind === 'trade-line' && !process.ended);

  const load = async () => {
    setOpen(true);
    if (busy.current) return;
    if (prepared?.ready) return;
    busy.current = true; setLoading(true); setError('');
    try {
      const next = await prepare();
      if (!alive.current) return;
      if (!next?.ready) { setError('Граф торговых путей недоступен. Можно повторить загрузку.'); return; }
      const options = next.caravanPlaces();
      if (!options.length) { setError('В графе пока нет поселений для каравана.'); return; }
      setPrepared(next);
      const origin = options.find(p => p.name.toLowerCase() === 'waterdeep') ?? options[0];
      const destination = options.find(p => p.name.toLowerCase() === 'neverwinter' && p.id !== origin.id)
        ?? options.find(p => p.id !== origin.id);
      setFrom(origin.id); setTo(destination?.id ?? '');
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
    } finally { busy.current = false; if (alive.current) setLoading(false); }
  };
  const validCargo = Number.isFinite(Number(quantity)) && Number(quantity) > 0
    && escort.trim() !== '' && Number.isInteger(Number(escort)) && Number(escort) >= 0 && Number(escort) <= 5
    && (schedule === 'once' || (Number.isSafeInteger(Number(intervalDays)) && Number(intervalDays) > 0));
  const submit = async () => {
    if (busy.current || !preview?.ok || !validCargo) return;
    busy.current = true; setSending(true); setError(''); setMessage('');
    try {
      const result = await propose({
        from, to, goods, quantity: Number(quantity), escort: Number(escort),
        ...(transport !== 'any' ? { transport } : {}),
        ...(checkpoints.length ? { checkpoints: [...checkpoints] } : {}),
        ...(schedule === 'regular' ? { intervalDays: Number(intervalDays) } : {}),
      });
      if (alive.current) setMessage(result);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
    } finally { busy.current = false; if (alive.current) setSending(false); }
  };
  const stopLine = async (processId: string) => {
    if (!endLine || busy.current) return;
    busy.current = true; setError(''); setMessage('');
    try {
      const result = await endLine(processId);
      if (alive.current) setMessage(result);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
    } finally { busy.current = false; }
  };
  const addCheckpoint = () => {
    if (!checkpointCandidate || checkpoints.includes(checkpointCandidate)) return;
    setCheckpoints(current => [...current, checkpointCandidate]);
    setCheckpointCandidate('');
  };
  const checkpointOptions = places.filter(place => place.id !== from && place.id !== to && !checkpoints.includes(place.id));

  return <div className="flex flex-col gap-2 min-w-0">
    <p className="type-body-sm text-t2">Выберите поселения и груз. Отправление и последствия изменят мир только после принятия предложений.</p>
    {activeLines.length ? <section className="flex flex-col gap-1" aria-label="Регулярные торговые линии">
      <h4 className="type-key text-t2">Регулярные линии</h4>
      {activeLines.map(line => {
        const every = typeof line.data?.intervalDays === 'number' ? line.data.intervalDays : null;
        return <div key={line.id} className="flex flex-wrap items-center gap-2 type-body-sm text-tx">
          <span>{line.name}{every ? ` · каждые ${every} дн.` : ''}</span>
          {endLine ? <button type="button" className={BTN} disabled={sending || loading} onClick={() => void stopLine(line.id)}>Остановить линию</button> : null}
        </div>;
      })}
    </section> : null}
    <button type="button" className={`${BTN} self-start`} aria-expanded={open} onClick={() => { if (open) setOpen(false); else void load(); }}>
      {open ? 'Скрыть планирование каравана' : 'Спланировать караван'}
    </button>
    {open ? <div className="flex flex-col gap-2 min-w-0" aria-label="Планирование каравана">
      {loading ? <p role="status" className="type-body-sm text-t2">Загружаются торговые пути…</p> : null}
      {!prepared?.ready && !loading ? <button type="button" className={`${BTN} self-start`} onClick={() => void load()}>Повторить загрузку путей</button> : null}
      {prepared?.ready ? <form className="flex flex-col gap-2 min-w-0" onSubmit={e => { e.preventDefault(); void submit(); }}>
        <div className="grid grid-cols-1 min-[640px]:grid-cols-2 gap-2">
          <label className="type-body-sm text-t2 min-w-0">Откуда<select className={FIELD} value={from} onChange={e => { const value = e.target.value; setFrom(value); setCheckpoints(current => current.filter(id => id !== value)); setMessage(''); setError(''); }}>
            {places.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></label>
          <label className="type-body-sm text-t2 min-w-0">Куда<select className={FIELD} value={to} onChange={e => { const value = e.target.value; setTo(value); setCheckpoints(current => current.filter(id => id !== value)); setMessage(''); setError(''); }}>
            <option value="">Выберите поселение</option>
            {places.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></label>
          <label className="type-body-sm text-t2 min-w-0">Груз<select className={FIELD} value={goods} onChange={e => { setGoods(e.target.value as GoodsId); setError(''); setMessage(''); }}>
            {GOODS.map(g => <option key={g} value={g}>{GOODS_LABEL[g]}</option>)}
          </select></label>
          <label className="type-body-sm text-t2 min-w-0">Способ перевозки<select className={FIELD} value={transport} onChange={e => { setTransport(e.target.value as CaravanTransport); setError(''); setMessage(''); }}>
            <option value="any">Любой доступный путь</option><option value="land">Только суша</option><option value="water">Только вода</option>
          </select></label>
          <label className="type-body-sm text-t2 min-w-0">Объём, единицы запаса<input className={FIELD} type="number" min="0" step="any" required value={quantity} onChange={e => { setQuantity(e.target.value); setError(''); setMessage(''); }} /></label>
          <label className="type-body-sm text-t2 min-w-0">Охрана, шкала 0–5<input className={FIELD} type="number" min="0" max="5" step="1" required value={escort} onChange={e => { setEscort(e.target.value); setError(''); setMessage(''); }} /></label>
          <label className="type-body-sm text-t2 min-w-0">Отправления<select className={FIELD} value={schedule} onChange={e => { setSchedule(e.target.value as 'once' | 'regular'); setError(''); setMessage(''); }}>
            <option value="once">Один рейс</option><option value="regular">Регулярная линия</option>
          </select></label>
          {schedule === 'regular' ? <label className="type-body-sm text-t2 min-w-0">Интервал, дней<input className={FIELD} type="number" min="1" step="1" required value={intervalDays} onChange={e => { setIntervalDays(e.target.value); setError(''); setMessage(''); }} /></label> : null}
        </div>
        <div className="flex flex-col gap-1" aria-label="Контрольные точки маршрута">
          <label className="type-body-sm text-t2 min-w-0">Добавить контрольную точку<select className={FIELD} value={checkpointCandidate} onChange={e => setCheckpointCandidate(e.target.value)}>
            <option value="">Без промежуточной точки</option>{checkpointOptions.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}
          </select></label>
          <button type="button" className={`${BTN} self-start`} disabled={!checkpointCandidate} onClick={addCheckpoint}>Добавить точку</button>
          {checkpoints.map((id, index) => <div key={id} className="flex flex-wrap items-center gap-1 type-body-sm text-tx">
            <span>{index + 1}. {labels.get(id) ?? id}</span>
            <button type="button" className={BTN} aria-label={`Поднять ${labels.get(id) ?? id}`} disabled={index === 0} onClick={() => setCheckpoints(current => {
              const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next;
            })}>↑</button>
            <button type="button" className={BTN} aria-label={`Опустить ${labels.get(id) ?? id}`} disabled={index === checkpoints.length - 1} onClick={() => setCheckpoints(current => {
              const next = [...current]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next;
            })}>↓</button>
            <button type="button" className={BTN} aria-label={`Убрать ${labels.get(id) ?? id}`} onClick={() => setCheckpoints(current => current.filter((_, i) => i !== index))}>Убрать</button>
          </div>)}
          {checkpoints.length ? <p className="type-body-sm text-t2">Точки задают порядок пути; закупка и выгрузка происходят только в начале и конце.</p> : null}
        </div>
        {schedule === 'regular' ? <p className="type-body-sm text-t2">Первый рейс начнётся через выбранный интервал. Отправления, срок которых попал в один шаг времени, входят в одно предложение симуляции; нехватка груза, места или блокада пропустит соответствующий цикл. Остановка линии не отзывает уже отправленные караваны.</p> : null}
        {preview?.ok ? <div className="type-body-sm text-tx flex flex-col gap-1" aria-label="Предпросмотр торгового пути">
          <span>{number(preview.route.miles)} мили · примерно {number(preview.route.days)} дня</span>
          <span>{[...new Set(preview.route.edges.map(edge => ({ road: 'Дороги', water: 'Водный путь', land: 'Пересечённая местность' })[edge.mode]))].join(' · ')}</span>
          <span className="break-words">{preview.route.nodes.map(id => labels.get(id) ?? 'Поселение').join(' → ')}</span>
          <span className="text-t2">Модель каравана v1 · правило стола; промежуточные поселения проверяются как участки пути</span>
        </div> : preview ? <p role="status" className="type-body-sm text-t2">{preview.message}</p> : null}
        <button type="submit" className={`${BTN} self-start disabled:opacity-50`} disabled={sending || !preview?.ok || !validCargo}>{sending ? 'Готовится предложение…' : schedule === 'regular' ? 'Предложить регулярную линию' : 'Предложить отправку'}</button>
      </form> : null}
      {error ? <p role="alert" className="type-body-sm text-fx-debuff-hi">{error}</p> : null}
      {message ? <p role="status" className="type-body-sm text-src-sim">{message}</p> : null}
    </div> : null}
  </div>;
}
