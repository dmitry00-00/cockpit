import { useRef, useState } from 'react';
import type { PreparedSimulation } from '../../campaign/prepareSimulation';
import type { EpidemicTreatment } from '../../campaign/urban';
import type { State } from '../../engine/state';
import { BTN } from './styles';

type UrbanSimulation = Pick<PreparedSimulation,
  'proposeFamine' | 'proposeEpidemic' | 'proposeCityFaction' | 'proposeBlockade' | 'endBlockade' | 'proposeFactionRelation'>;
export interface UrbanPlannerSimulation extends UrbanSimulation {
  epidemicTreatment: (world: State['world'], locationId: string, year: number) => EpidemicTreatment;
}

interface Props {
  world: State['world'];
  year: number;
  prepare: () => Promise<UrbanPlannerSimulation | null>;
  famine: (locationId: string, initialOrder?: number) => Promise<string>;
  epidemic: (locationId: string, initialCases: number, r0: number) => Promise<string>;
  cityFaction: (locationId: string) => Promise<string>;
  blockade: (locationId: string) => Promise<string>;
  endBlockade: (processId: string) => Promise<string>;
  relation: (a: string, b: string, value: number) => Promise<string>;
}

const FIELD = 'min-w-0 w-full bg-wl text-tx shadow-bevel-in px-2 py-1 type-body-sm';
const ACTION = `${BTN} self-start`;
const PROCESS_LABEL: Readonly<Record<string, string>> = { famine: 'Голод', epidemic: 'Эпидемия', revolt: 'Волнения', blockade: 'Блокада' };

/** City crisis controls create pending proposals; every campaign change still passes through event acceptance. */
export function UrbanPlanner({ world, year, prepare, famine, epidemic, cityFaction, blockade, endBlockade, relation }: Props) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [simulation, setSimulation] = useState<UrbanPlannerSimulation | null>(null);
  const [locationId, setLocationId] = useState('');
  const [order, setOrder] = useState('6');
  const [initialCases, setInitialCases] = useState('1');
  const [r0, setR0] = useState('1.5');
  const [relationA, setRelationA] = useState('');
  const [relationB, setRelationB] = useState('');
  const [relationValue, setRelationValue] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const pending = useRef(false);

  const settlements = Object.values(world.locations).filter(location => location.scale === 'settlement')
    .sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.id.localeCompare(b.id));
  const factions = Object.values(world.factions).sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.id.localeCompare(b.id));
  const selectedLocation = settlements.find(location => location.id === locationId) ?? settlements[0];
  const selectedCityFaction = selectedLocation?.ref ? factions.find(faction => faction.ref === selectedLocation.ref) : undefined;
  const availableBlockade = settlements.filter(location => location.ref?.startsWith('place:') && !Object.values(world.processes ?? {}).some(process => {
    const data = process.data as { targetPlaceId?: string } | undefined;
    return process.kind === 'blockade' && !process.ended && data?.targetPlaceId === location.ref?.slice('place:'.length);
  }));
  const runningBlockades = Object.values(world.processes ?? {}).filter(process => process.kind === 'blockade' && !process.ended
    && !(process.data as { relationFactions?: readonly string[] } | undefined)?.relationFactions);
  const activeUrban = Object.values(world.processes ?? {}).filter(process => ['famine', 'epidemic', 'revolt'].includes(process.kind) && !process.ended);
  const independentCities = Object.entries(world.settlementPolity ?? {}).map(([locationId, polity]) => ({
    location: world.locations[locationId], polity,
  })).filter((entry): entry is { location: NonNullable<typeof entry.location>; polity: typeof entry.polity } => !!entry.location)
    .sort((a, b) => a.location.name.localeCompare(b.location.name, 'ru'));
  const selectedA = factions.find(faction => faction.id === relationA) ?? factions[0];
  const selectedB = factions.find(faction => faction.id === relationB) ?? factions.find(faction => faction.id !== selectedA?.id);
  const treatment = selectedLocation && simulation ? simulation.epidemicTreatment(world, selectedLocation.id, year) : null;

  const openPlanner = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true); setError('');
    if (ready) return;
    setBusy(true);
    try {
      const result = await prepare();
      if (!result) throw new Error('Подготовка процессов города недоступна. Повторите загрузку.');
      setSimulation(result);
      setReady(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  };

  const submit = async (action: () => Promise<string>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setMessage('');
    try { setMessage(await action()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { pending.current = false; setBusy(false); }
  };

  return <div className="flex flex-col gap-2 min-w-0">
    <p className="type-body-sm text-t2">Голод, эпидемия, волнения, блокада и отношение фракций меняются только после принятия предложения мастером.</p>
    <button type="button" className={ACTION} aria-expanded={open} onClick={() => void openPlanner()}>
      {open ? 'Скрыть городские процессы' : 'Управлять городскими процессами'}
    </button>
    {open ? <div className="flex flex-col gap-3 min-w-0" aria-label="Городские процессы">
      {busy && !ready ? <p role="status" className="type-body-sm text-t2">Подготовка…</p> : null}
      {settlements.length ? <>
        <label className="type-body-sm text-t2">Поселение
          <select aria-label="Поселение" className={FIELD} value={selectedLocation?.id ?? ''} onChange={event => setLocationId(event.target.value)}>
            {settlements.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-1 min-[760px]:grid-cols-2 gap-2">
          <section className="flex flex-col gap-2 bg-cd shadow-bevel p-2" aria-label="Голод и эпидемия">
            <h3 className="type-h-15 text-tx">Кризис поселения</h3>
            <p className="type-body-xs text-t2">Для голода нужны явно записанный нулевой запас еды, население и порядок. Начало эпидемии указывает мастер.</p>
            <p className="type-body-xs text-t2">Караван проверяет заражение при выходе по доле больных в городе; заражённый случай проходит инкубацию 1–4 дня. Каждый подтверждённый храм лечит до 2 человек в день.</p>
            <label className="type-body-xs text-t2">Начальный порядок, если ещё не задан
              <input className={FIELD} aria-label="Начальный порядок" type="number" min="0" max="10" step="1" value={order} onChange={event => setOrder(event.target.value)} />
            </label>
            <button type="button" className={ACTION} disabled={busy || !selectedLocation || selectedLocation.stock?.food !== 0 || !Number.isInteger(Number(order)) || Number(order) < 0 || Number(order) > 10}
              onClick={() => selectedLocation && void submit(() => famine(selectedLocation.id, Number(order)))}>
              Предложить голод
            </button>
            <label className="type-body-xs text-t2">Начальные случаи
              <input className={FIELD} aria-label="Начальные случаи эпидемии" type="number" min="1" max={Math.max(1, (selectedLocation?.population ?? 2) - 1)} step="1" value={initialCases} onChange={event => setInitialCases(event.target.value)} />
            </label>
            <label className="type-body-xs text-t2">R₀, правило стола 1,5–2
              <input className={FIELD} aria-label="R0 эпидемии" type="number" min="1.5" max="2" step="0.1" value={r0} onChange={event => setR0(event.target.value)} />
            </label>
            {treatment ? <p className="type-body-xs text-t2" aria-live="polite">
              Лечение в {selectedLocation?.name}: {treatment.temples} подтверждённых храмов, до {treatment.perDay} больных в день. {treatment.source}
            </p> : <p className="type-body-xs text-t2">Откройте панель, чтобы загрузить доступные сведения о храмах и лечении.</p>}
            <button type="button" className={ACTION} disabled={busy || !selectedLocation || !Number.isInteger(Number(initialCases)) || Number(initialCases) < 1 || Number(initialCases) >= (selectedLocation.population ?? 0) || Number(r0) < 1.5 || Number(r0) > 2}
              onClick={() => selectedLocation && void submit(() => epidemic(selectedLocation.id, Number(initialCases), Number(r0)))}>
              Предложить вспышку Sewer Plague
            </button>
          </section>

          <section className="flex flex-col gap-2 bg-cd shadow-bevel p-2" aria-label="Блокада и отношения">
            <h3 className="type-h-15 text-tx">Отношения фракций и блокада</h3>
            <p className="type-body-xs text-t2">Отношение городов по шкале −3…+3 меняет торговый поток: +2 — ×1,5; −2 — ×0,5; −3 — блокада. Для городов нужны явные фракции кампании.</p>
            {selectedLocation?.ref?.startsWith('place:') && !selectedCityFaction ? <button type="button" className={ACTION} disabled={busy}
              onClick={() => selectedLocation && void submit(() => cityFaction(selectedLocation.id))}>Подключить {selectedLocation.name} как фракцию</button> : null}
            {factions.length >= 2 ? <>
              <label className="type-body-xs text-t2">Фракция A
                <select aria-label="Фракция A" className={FIELD} value={selectedA?.id ?? ''} onChange={event => setRelationA(event.target.value)}>
                  {factions.map(faction => <option key={faction.id} value={faction.id}>{faction.name}</option>)}
                </select>
              </label>
              <label className="type-body-xs text-t2">Фракция B
                <select aria-label="Фракция B" className={FIELD} value={selectedB?.id ?? ''} onChange={event => setRelationB(event.target.value)}>
                  {factions.filter(faction => faction.id !== selectedA?.id).map(faction => <option key={faction.id} value={faction.id}>{faction.name}</option>)}
                </select>
              </label>
              <label className="type-body-xs text-t2">Отношение −3…+3
                <select aria-label="Значение отношения" className={FIELD} value={relationValue} onChange={event => setRelationValue(event.target.value)}>
                  {[-3, -2, -1, 0, 1, 2, 3].map(value => <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>)}
                </select>
              </label>
              <button type="button" className={ACTION} disabled={busy || !selectedA || !selectedB || selectedA.id === selectedB.id}
                onClick={() => selectedA && selectedB && void submit(() => relation(selectedA.id, selectedB.id, Number(relationValue)))}>
                Предложить изменение отношений
              </button>
            </> : <p className="type-body-sm text-t2">Для настройки отношений нужны как минимум две фракции кампании.</p>}
            {selectedLocation && availableBlockade.some(location => location.id === selectedLocation.id) ? <button type="button" className={ACTION} disabled={busy}
              onClick={() => void submit(() => blockade(selectedLocation.id))}>Предложить блокаду · {selectedLocation.name}</button> : null}
            {runningBlockades.map(process => <button key={process.id} type="button" className={ACTION} disabled={busy}
              onClick={() => void submit(() => endBlockade(process.id))}>Предложить снять блокаду · {process.name}</button>)}
          </section>
        </div>
      </> : <p className="type-body-sm text-t2">В кампании пока нет поселений. Городские процессы не запускаются по справочнику без явного состояния кампании.</p>}
      <p className="type-body-xs text-t2">При успешном восстании город выходит из державы только при единственном подтверждённом членстве; канонический справочник не меняется.</p>
      {activeUrban.length ? <section aria-label="Активные внутренние процессы" className="flex flex-col gap-1">
        <h3 className="type-h-15 text-tx">Активные процессы</h3>
        <ul className="flex flex-col gap-1">{activeUrban.map(process => {
          const incubation = [1, 2, 3, 4].reduce((sum, days) => sum + (process.vars[`incubating${days}`] ?? 0), 0);
          const data = process.data as { treatmentPerDay?: number; treatmentTemples?: number; treatmentSource?: string } | undefined;
          const detail = process.kind === 'epidemic'
            ? ` · инкубация ${Math.round(incubation)} · больные ${Math.round(process.vars.infected ?? 0)} · храмы ${data?.treatmentTemples ?? 0}, лечение ${data?.treatmentPerDay ?? 0}/день${data?.treatmentSource ? ` · ${data.treatmentSource}` : ''}`
            : '';
          return <li key={process.id} className="type-body-sm text-t2">
            <div>{PROCESS_LABEL[process.kind] ?? process.kind} · {process.name} · {process.stage}{detail}</div>
            {process.kind === 'epidemic' && data?.treatmentSource ? <p className="type-body-xs text-t2">Источник лечебной мощности: {data.treatmentSource}</p> : null}
          </li>;
        })}</ul>
      </section> : null}
      {independentCities.length ? <section aria-label="Города, вышедшие из державы" className="flex flex-col gap-1">
        <h3 className="type-h-15 text-tx">Города, вышедшие из державы</h3>
        <ul className="flex flex-col gap-1">{independentCities.map(({ location, polity }) => <li key={location.id} className="type-body-sm text-t2">
          {location.name} · независим от {polity.separatedFrom.kingdomName}
        </li>)}</ul>
      </section> : null}
      {error ? <p role="alert" className="type-body-sm text-fx-damage-hi">{error}</p> : null}
      {message ? <p role="status" className="type-body-sm text-src-sim">{message}</p> : null}
    </div> : null}
  </div>;
}
