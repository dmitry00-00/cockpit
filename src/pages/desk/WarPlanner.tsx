import { useRef, useState } from 'react';
import type { PreparedSimulation } from '../../campaign/prepareSimulation';
import { warDeterminationSuggestion, type WarOrder, type WarOutcome, type WarPartyOption, type WarSettlementTerritoryTerms } from '../../campaign/war';
import type { WarStrengthEvidence } from '../../campaign/l8Military';
import type { State } from '../../engine/state';
import { BTN } from './styles';

type WarPlannerSimulation = Pick<PreparedSimulation, 'warParties' | 'warPlaces' | 'previewWarFront'>;

interface Props {
  year: number;
  world: State['world'];
  prepare: () => Promise<WarPlannerSimulation | null>;
  propose: (order: WarOrder) => Promise<string>;
  proposeBlockade: (warProcessId: string, locationId: string) => Promise<string>;
  proposeSiege: (warProcessId: string, locationId: string) => Promise<string>;
  proposeSettlement?: (warProcessId: string, outcome: WarOutcome, territoryTerms?: WarSettlementTerritoryTerms) => Promise<string>;
  proposeTerritoryControl?: (warProcessId: string, placeId: string, controllerId: string | null) => Promise<string>;
}

const FIELD = 'min-w-0 w-full bg-wl text-tx shadow-bevel-in px-2 py-1 type-body-sm';
const determinationValue = (world: State['world'], party: Pick<WarPartyOption, 'id' | 'government'>) =>
  String(world.kingdomOrder?.[party.id]?.value ?? warDeterminationSuggestion(party.government).value);

/** The planner stores no campaign state; explicit submit creates a pending, reversible proposal. */
export function WarPlanner({ year, world, prepare, propose, proposeBlockade, proposeSiege, proposeSettlement, proposeTerritoryControl }: Props) {
  const [open, setOpen] = useState(false);
  const [parties, setParties] = useState<ReturnType<WarPlannerSimulation['warParties']>>([]);
  const [simulation, setSimulation] = useState<WarPlannerSimulation | null>(null);
  const [sideA, setSideA] = useState('');
  const [sideB, setSideB] = useState('');
  const [frontFrom, setFrontFrom] = useState('');
  const [frontTo, setFrontTo] = useState('');
  const [strengthA, setStrengthA] = useState('');
  const [strengthB, setStrengthB] = useState('');
  const [strengthEvidenceA, setStrengthEvidenceA] = useState<WarStrengthEvidence>();
  const [strengthEvidenceB, setStrengthEvidenceB] = useState<WarStrengthEvidence>();
  const [determinationA, setDeterminationA] = useState('');
  const [determinationB, setDeterminationB] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const busy = useRef(false);
  const [selectedWarId, setSelectedWarId] = useState('');
  const [blockadeLocationId, setBlockadeLocationId] = useState('');
  const [siegeLocationId, setSiegeLocationId] = useState('');
  const [settlementOutcome, setSettlementOutcome] = useState<WarOutcome>('status-quo');
  const [settlementTerritoryChoices, setSettlementTerritoryChoices] = useState<Record<string, 'side-a' | 'side-b' | 'clear' | ''>>({});
  const [territoryPlaceId, setTerritoryPlaceId] = useState('');
  const [territoryControllerSide, setTerritoryControllerSide] = useState<'side-a' | 'side-b' | ''>('side-a');

  const activeWars = Object.values(world.processes ?? {}).filter(process => process.kind === 'war' && !process.ended);
  const selectedWar = activeWars.find(process => process.id === selectedWarId) ?? activeWars[0];
  const selectedWarData = selectedWar?.data as { sideA?: { id?: string; name?: string }; sideB?: { id?: string; name?: string } } | undefined;
  const selectedPartyA = parties.find(party => party.id === sideA);
  const selectedPartyB = parties.find(party => party.id === sideB);
  const orderRecordA = world.kingdomOrder?.[sideA];
  const orderRecordB = world.kingdomOrder?.[sideB];
  const orderSuggestionA = selectedPartyA ? warDeterminationSuggestion(selectedPartyA.government) : undefined;
  const orderSuggestionB = selectedPartyB ? warDeterminationSuggestion(selectedPartyB.government) : undefined;
  const strengthNote = (party: typeof selectedPartyA) => {
    if (!party?.strengthSuggestion) return 'подсказки для выбранного года/типа нет; требуется ручной ввод';
    const { value, source, sourceUrl } = party.strengthSuggestion;
    return <>{value} · {sourceUrl ? <a className="underline" href={sourceUrl} target="_blank" rel="noreferrer">{source}</a> : source}</>;
  };
  const orderNote = (party: typeof selectedPartyA, record: typeof orderRecordA, suggestion: typeof orderSuggestionA) => <>
    {record ? `${record.value} · ${record.source}` : `предложено ${suggestion?.value} · ${suggestion?.source}`}
    {party?.referenceUrl ? <> · <a className="underline" href={party.referenceUrl} target="_blank" rel="noreferrer">статья {party.name}</a></> : null}
  </>;
  const candidatePanel = (party: typeof selectedPartyA, side: 'A' | 'B', selected?: WarStrengthEvidence) => party?.l8StrengthCandidates?.map(candidate => (
    <section key={`${side}:${candidate.reviewId}`} className="flex flex-col gap-1 border border-t2/30 p-2" aria-label={`Кандидат L8 для стороны ${side}`}>
      <p className="type-body-sm text-t2">L8-кандидат «{candidate.amountRaw} {candidate.unitRaw}», {candidate.year} DR → сила {candidate.value}. Он не принят как факт; значение попадёт только в это предложение, если мастер его выберет.</p>
      <details className="type-body-xs text-t2">
        <summary className="cursor-pointer">Цитата, источник и примечания проверки</summary>
        <blockquote className="border-l-2 border-t2/40 pl-2 mt-1">{candidate.excerpt}</blockquote>
        <p className="mt-1">Источник: <a className="underline" href={candidate.sourceUrl} target="_blank" rel="noreferrer">{candidate.sourceTitle}</a> · revision {candidate.revisionId} · {candidate.sourceTimestamp} · {candidate.sourceLicenseId}</p>
        {candidate.sourceCitations.map((citation, index) => <p key={`${candidate.reviewId}:cite:${index}`}>Сноска: {citation}</p>)}
        {candidate.reviewNotes.map((note, index) => <p key={`${candidate.reviewId}:note:${index}`}>{note}</p>)}
        <p>SHA-256 страницы XML: {candidate.sourceWikitextSha256}. Внешняя книга из сноски отдельно не проверена.</p>
      </details>
      <button type="button" className={`${BTN} self-start`} disabled={selected?.candidateId === candidate.reviewId}
        onClick={() => {
          if (side === 'A') { setStrengthA(String(candidate.value)); setStrengthEvidenceA(candidate.evidence); }
          else { setStrengthB(String(candidate.value)); setStrengthEvidenceB(candidate.evidence); }
        }}>
        {selected?.candidateId === candidate.reviewId ? `Выбран для стороны ${side}` : `Подставить силу ${candidate.value} для стороны ${side}`}
      </button>
    </section>
  ));
  const sideAName = selectedWarData?.sideA?.name ?? 'сторона A';
  const sideBName = selectedWarData?.sideB?.name ?? 'сторона B';
  const blockadePlaces = Object.values(world.locations).filter(location => location.scale === 'settlement' && location.ref?.startsWith('place:'))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.id.localeCompare(b.id));
  const selectedBlockadeLocation = blockadePlaces.find(location => location.id === blockadeLocationId) ?? blockadePlaces[0];
  const frontPlacesA = simulation?.warPlaces(sideA, year) ?? [];
  const frontPlacesB = simulation?.warPlaces(sideB, year) ?? [];
  const frontPreview = simulation && sideA && sideB
    ? simulation.previewWarFront(sideA, sideB, year, frontPlacesA.find(place => place.id === frontFrom)?.id, frontPlacesB.find(place => place.id === frontTo)?.id)
    : { ok: false as const, reason: 'загрузите данные маршрутов' };
  const selectedWarFront = selectedWar?.data?.front as { nodes?: readonly { id: string }[]; locationIds?: readonly string[] } | undefined;
  const territoryPlaces = selectedWar && ['campaign', 'protracted'].includes(selectedWar.stage)
    ? (selectedWarFront?.nodes ?? []).flatMap((node, index) => {
      const location = world.locations[selectedWarFront?.locationIds?.[index] ?? ''];
      return location?.scale === 'settlement' && location.ref === `place:${node.id}` ? [{ placeId: node.id, location }] : [];
    })
    : [];
  const selectedTerritoryPlace = territoryPlaces.find(place => place.placeId === territoryPlaceId) ?? territoryPlaces[0];
  const currentTerritoryController = selectedTerritoryPlace ? world.territoryControl?.[selectedTerritoryPlace.placeId] : undefined;
  const selectedTerritoryControllerId = territoryControllerSide === 'side-a' ? selectedWarData?.sideA?.id
    : territoryControllerSide === 'side-b' ? selectedWarData?.sideB?.id : null;
  const territoryControlIsNoOp = territoryControllerSide
    ? !!currentTerritoryController && currentTerritoryController.kingdomId === selectedTerritoryControllerId
    : !currentTerritoryController;
  const siegePlaces = selectedWar && ['campaign', 'protracted'].includes(selectedWar.stage)
    ? (selectedWarFront?.locationIds ?? []).map(id => world.locations[id]).filter((location): location is NonNullable<typeof location> =>
      !!location && location.scale === 'settlement' && Number.isFinite(location.stock?.food) && (location.stock?.food ?? 0) > 0)
    : [];
  const selectedSiegeLocation = siegePlaces.find(location => location.id === siegeLocationId) ?? siegePlaces[0];

  const load = async () => {
    if (busy.current || parties.length) return;
    busy.current = true; setLoading(true); setError('');
    try {
      const simulation = await prepare();
      if (!simulation) throw new Error('Симуляция войны недоступна. Повторите загрузку.');
      const options = simulation.warParties(year);
      if (options.length < 2) throw new Error('В справочнике этого года найдено меньше двух держав.');
      setParties(options);
      setSimulation(simulation);
      setSideA(options[0].id);
      setStrengthA(options[0].strengthSuggestion ? String(options[0].strengthSuggestion.value) : '');
      setStrengthEvidenceA(undefined);
      const second = options.find(option => option.id !== options[0].id);
      setSideB(second?.id ?? '');
      setStrengthB(second?.strengthSuggestion ? String(second.strengthSuggestion.value) : '');
      setStrengthEvidenceB(undefined);
      setDeterminationA(determinationValue(world, options[0]));
      setDeterminationB(second ? determinationValue(world, second) : '');
      setFrontFrom(simulation.warPlaces(options[0].id, year)[0]?.id ?? '');
      setFrontTo(second ? simulation.warPlaces(second.id, year)[0]?.id ?? '' : '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { busy.current = false; setLoading(false); }
  };

  const valid = sideA && sideB && sideA !== sideB
    && frontPreview.ok
    && [strengthA, strengthB].every(value => value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 10)
    && [determinationA, determinationB].every(value => value.trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 10);

  const submit = async () => {
    if (busy.current || !valid) return;
    const a = parties.find(party => party.id === sideA);
    const b = parties.find(party => party.id === sideB);
    if (!a || !b) return;
    const orderSource = (party: WarPartyOption, value: number) => {
      const stored = world.kingdomOrder?.[party.id];
      if (stored?.value === value) return stored.source;
      const suggestion = warDeterminationSuggestion(party.government);
      return suggestion.value === value ? suggestion.source : 'ручной ввод мастера · research/world-models.md §4.0.1, §4.2.3';
    };
    busy.current = true; setSending(true); setError(''); setMessage('');
    try {
        setMessage(await propose({
        sideA: a, sideB: b,
        strengthA: Number(strengthA), strengthB: Number(strengthB),
          ...(strengthEvidenceA ? { strengthEvidenceA } : {}),
          ...(strengthEvidenceB ? { strengthEvidenceB } : {}),
        determinationA: Number(determinationA), determinationB: Number(determinationB),
        determinationSourceA: orderSource(a, Number(determinationA)),
        determinationSourceB: orderSource(b, Number(determinationB)),
        ...(frontPreview.ok ? { front: frontPreview.front } : {}),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { busy.current = false; setSending(false); }
  };

  const submitBlockade = async () => {
    if (busy.current || !selectedWar || !selectedBlockadeLocation) return;
    busy.current = true; setSending(true); setError(''); setMessage('');
    try {
      setMessage(await proposeBlockade(selectedWar.id, selectedBlockadeLocation.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { busy.current = false; setSending(false); }
  };

  const submitSiege = async () => {
    if (busy.current || !selectedWar || !selectedSiegeLocation) return;
    busy.current = true; setSending(true); setError(''); setMessage('');
    try { setMessage(await proposeSiege(selectedWar.id, selectedSiegeLocation.id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { busy.current = false; setSending(false); }
  };

  const submitSettlement = async () => {
    if (busy.current || !selectedWar || !proposeSettlement) return;
    const territoryTerms: Record<string, string | null> = {};
    for (const { placeId } of territoryPlaces) {
      const choice = settlementTerritoryChoices[placeId];
      if (choice === 'side-a' && selectedWarData?.sideA?.id) territoryTerms[placeId] = selectedWarData.sideA.id;
      else if (choice === 'side-b' && selectedWarData?.sideB?.id) territoryTerms[placeId] = selectedWarData.sideB.id;
      else if (choice === 'clear') territoryTerms[placeId] = null;
    }
    busy.current = true; setSending(true); setError(''); setMessage('');
    try { setMessage(await proposeSettlement(selectedWar.id, settlementOutcome, territoryTerms)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { busy.current = false; setSending(false); }
  };

  const submitTerritoryControl = async () => {
    if (busy.current || !selectedWar || !selectedTerritoryPlace || !proposeTerritoryControl) return;
    const controllerId = selectedTerritoryControllerId;
    if (territoryControllerSide && !controllerId) return;
    busy.current = true; setSending(true); setError(''); setMessage('');
    try { setMessage(await proposeTerritoryControl(selectedWar.id, selectedTerritoryPlace.placeId, controllerId ?? null)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { busy.current = false; setSending(false); }
  };

  return <div className="flex flex-col gap-2 min-w-0">
    <p className="type-body-sm text-t2">План войны создаёт ожидающее решения предложение. Сила может получить подсказку из данных на выбранный год или явно заданного типа державы; мастер её подтверждает или меняет. Отдельный L8-кандидат доступен только при точном совпадении державы и года и применяется лишь по выбору мастера к этой войне: он не становится принятым фактом мира. Порядок предлагает базовое значение 6 и только явно описанный бонус магократии/теократии; мастер подтверждает или меняет.</p>
    <button type="button" className={`${BTN} self-start`} aria-expanded={open} onClick={() => {
      if (open) setOpen(false);
      else { setOpen(true); void load(); }
    }}>{open ? 'Скрыть планирование войны' : 'Спланировать войну'}</button>
    {open ? <div className="flex flex-col gap-2 min-w-0" aria-label="Планирование войны">
      {loading ? <p role="status" className="type-body-sm text-t2">Загружается список держав…</p> : null}
      {!parties.length && !loading ? <button type="button" className={`${BTN} self-start`} onClick={() => void load()}>Повторить загрузку держав</button> : null}
      {parties.length ? <form className="flex flex-col gap-2 min-w-0" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <div className="grid grid-cols-1 min-[640px]:grid-cols-2 gap-2">
          <label className="type-body-sm text-t2 min-w-0">Сторона A<select className={FIELD} value={sideA} onChange={event => { const id = event.target.value; const party = parties.find(option => option.id === id); setSideA(id); setStrengthA(party?.strengthSuggestion ? String(party.strengthSuggestion.value) : ''); setStrengthEvidenceA(undefined); setDeterminationA(party ? determinationValue(world, party) : ''); setFrontFrom(simulation?.warPlaces(id, year)[0]?.id ?? ''); setError(''); setMessage(''); }}>
            {parties.map(party => <option key={party.id} value={party.id}>{party.name}</option>)}
          </select></label>
          <label className="type-body-sm text-t2 min-w-0">Сторона B<select className={FIELD} value={sideB} onChange={event => { const id = event.target.value; const party = parties.find(option => option.id === id); setSideB(id); setStrengthB(party?.strengthSuggestion ? String(party.strengthSuggestion.value) : ''); setStrengthEvidenceB(undefined); setDeterminationB(party ? determinationValue(world, party) : ''); setFrontTo(simulation?.warPlaces(id, year)[0]?.id ?? ''); setError(''); setMessage(''); }}>
            {parties.map(party => <option key={party.id} value={party.id}>{party.name}</option>)}
          </select></label>
          <label className="type-body-sm text-t2 min-w-0">Сила A, шкала 0–10<input className={FIELD} type="number" min="0" max="10" step="0.1" required value={strengthA} onChange={event => { setStrengthA(event.target.value); setStrengthEvidenceA(undefined); }} /></label>
          <label className="type-body-sm text-t2 min-w-0">Сила B, шкала 0–10<input className={FIELD} type="number" min="0" max="10" step="0.1" required value={strengthB} onChange={event => { setStrengthB(event.target.value); setStrengthEvidenceB(undefined); }} /></label>
          <label className="type-body-sm text-t2 min-w-0">Решимость A, шкала 0–10<input className={FIELD} type="number" min="0" max="10" step="1" required value={determinationA} onChange={event => setDeterminationA(event.target.value)} /></label>
          <label className="type-body-sm text-t2 min-w-0">Решимость B, шкала 0–10<input className={FIELD} type="number" min="0" max="10" step="1" required value={determinationB} onChange={event => setDeterminationB(event.target.value)} /></label>
        </div>
        {candidatePanel(selectedPartyA, 'A', strengthEvidenceA)}
        {candidatePanel(selectedPartyB, 'B', strengthEvidenceB)}
        <p className="type-body-xs text-t2">Сила A: {strengthNote(selectedPartyA)}. Сила B: {strengthNote(selectedPartyB)}. Порядок A: {orderNote(selectedPartyA, orderRecordA, orderSuggestionA)}. Порядок B: {orderNote(selectedPartyB, orderRecordB, orderSuggestionB)}.</p>
        <div className="grid grid-cols-1 min-[640px]:grid-cols-2 gap-2">
          <label className="type-body-sm text-t2 min-w-0">Начало фронта · держава A<select className={FIELD} value={frontFrom} onChange={event => setFrontFrom(event.target.value)}>
            {frontPlacesA.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}
          </select></label>
          <label className="type-body-sm text-t2 min-w-0">Конец фронта · держава B<select className={FIELD} value={frontTo} onChange={event => setFrontTo(event.target.value)}>
            {frontPlacesB.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}
          </select></label>
        </div>
        <p role={frontPreview.ok ? 'status' : 'alert'} className={`type-body-sm ${frontPreview.ok ? 'text-t2' : 'text-fx-debuff-hi'}`}>
          {frontPreview.ok ? `Пеший фронт: ${frontPreview.front.nodes[0].name} — ${frontPreview.front.nodes.at(-1)?.name}; ${frontPreview.front.nodes.length} мест, ${frontPreview.front.miles} миль, ${frontPreview.front.days} дн.; A5E tier ${frontPreview.front.tier}.` : frontPreview.reason}
        </p>
        <p className="type-body-sm text-t2">Модель: research/world-models.md §4.2; фронт строится по пешему маршруту карты. Порядок предлагает базовое значение 6 и только явно описанный бонус магократии/теократии; мастер подтверждает или меняет. Принятое начало войны сохраняет его, а проигранный разгром снижает на 1. Все последствия появляются только после принятия предложения.</p>
        <button type="submit" className={`${BTN} self-start disabled:opacity-50`} disabled={sending || !valid}>{sending ? 'Готовится предложение…' : 'Предложить войну'}</button>
      </form> : null}
      {activeWars.length && blockadePlaces.length ? <section className="flex flex-col gap-2 border-t border-t2/30 pt-2" aria-label="Блокада маршрута в связи с войной">
        <h4 className="type-key text-t2">Блокада маршрута в связи с войной</h4>
        <p className="type-body-sm text-t2">Блокада — отдельное ручное решение. Фронт войны строится по выбранным местам держав; торговые маршруты через него приостанавливаются.</p>
        <label className="type-body-sm text-t2 min-w-0">Война<select className={FIELD} value={selectedWar?.id ?? ''} onChange={event => { setSelectedWarId(event.target.value); setSettlementTerritoryChoices({}); }}>
          {activeWars.map(war => <option key={war.id} value={war.id}>{war.name}</option>)}
        </select></label>
        <label className="type-body-sm text-t2 min-w-0">Поселение под блокадой<select className={FIELD} value={selectedBlockadeLocation?.id ?? ''} onChange={event => setBlockadeLocationId(event.target.value)}>
          {blockadePlaces.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select></label>
        <button type="button" className={`${BTN} self-start`} disabled={sending} onClick={() => void submitBlockade()}>{sending ? 'Готовится предложение…' : 'Предложить блокаду'}</button>
      </section> : null}
      {activeWars.length ? <section className="flex flex-col gap-2 border-t border-t2/30 pt-2" aria-label="Осада на фронте войны">
        <h4 className="type-key text-t2">Осада на фронте войны</h4>
        <p className="type-body-sm text-t2">Осада начинается вручную для города на активном фронте, если в кампании явно записан запас еды в днях. За каждый принятый дневной такт запас уменьшается на один день.</p>
        {siegePlaces.length ? <>
          <label className="type-body-sm text-t2 min-w-0">Осаждённое поселение<select className={FIELD} value={selectedSiegeLocation?.id ?? ''} onChange={event => setSiegeLocationId(event.target.value)}>
            {siegePlaces.map(location => <option key={location.id} value={location.id}>{location.name} · {location.stock?.food} дн. еды</option>)}
          </select></label>
          <button type="button" className={`${BTN} self-start`} disabled={sending || !selectedSiegeLocation} onClick={() => void submitSiege()}>{sending ? 'Готовится предложение…' : 'Предложить осаду'}</button>
        </> : <p className="type-body-sm text-t2">Для выбранной войны нет города фронта с явно записанным запасом еды больше нуля.</p>}
      </section> : null}
      {activeWars.length && proposeSettlement ? <section className="flex flex-col gap-2 border-t border-t2/30 pt-2" aria-label="Урегулирование войны">
        <h4 className="type-key text-t2">Урегулирование войны</h4>
        <p className="type-body-sm text-t2">Решение мастера завершает конфликт, снимает связанные осады и возобновляет открытые рейсы. Контроль поселений можно задать вручную; из исхода войны он не выводится.</p>
        {territoryPlaces.length ? <fieldset className="flex flex-col gap-2 border border-t2/30 p-2">
          <legend className="type-key text-t2">Территориальные условия</legend>
          <p className="type-body-xs text-t2">Пустой выбор сохраняет запись как есть. «Сбросить» удаляет только кампанийную запись и не меняет справочник.</p>
          {territoryPlaces.map(({ placeId, location }) => <label key={placeId} className="type-body-sm text-t2 min-w-0">{location.name}<select className={FIELD} value={settlementTerritoryChoices[placeId] ?? ''} onChange={event => setSettlementTerritoryChoices(values => ({ ...values, [placeId]: event.target.value as 'side-a' | 'side-b' | 'clear' | '' }))}>
            <option value="">{world.territoryControl?.[placeId] ? `Оставить как есть · ${world.territoryControl[placeId].kingdomName}` : 'Без изменения · контроль не записан'}</option>
            <option value="side-a">Контроль: {sideAName}</option>
            <option value="side-b">Контроль: {sideBName}</option>
            {world.territoryControl?.[placeId] ? <option value="clear">Сбросить кампанийную запись</option> : null}
          </select></label>)}
        </fieldset> : null}
        <label className="type-body-sm text-t2 min-w-0">Исход по решению мастера<select className={FIELD} value={settlementOutcome} onChange={event => setSettlementOutcome(event.target.value as WarOutcome)}>
          <option value="status-quo">Без назначенного победителя</option>
          <option value="side-a">Победа {sideAName}</option>
          <option value="side-b">Победа {sideBName}</option>
        </select></label>
        <button type="button" className={`${BTN} self-start`} disabled={sending || !selectedWar} onClick={() => void submitSettlement()}>{sending ? 'Готовится предложение…' : 'Предложить урегулирование'}</button>
      </section> : null}
      {proposeTerritoryControl && territoryPlaces.length ? <section className="flex flex-col gap-2 border-t border-t2/30 pt-2" aria-label="Контроль территории на фронте">
        <h4 className="type-key text-t2">Контроль территории на фронте</h4>
        <p className="type-body-sm text-t2">Отдельная запись решения мастера для поселения на активном фронте. Победа в бою сама по себе контроль не меняет; запись не переписывает справочник держав.</p>
        <label className="type-body-sm text-t2 min-w-0">Поселение фронта<select className={FIELD} value={selectedTerritoryPlace?.placeId ?? ''} onChange={event => setTerritoryPlaceId(event.target.value)}>
          {territoryPlaces.map(place => <option key={place.placeId} value={place.placeId}>{place.location.name}</option>)}
        </select></label>
        {currentTerritoryController ? <p className="type-body-sm text-t2">Сейчас записано: {currentTerritoryController.kingdomName}.</p> : <p className="type-body-sm text-t2">Кампанийная запись контроля не задана.</p>}
        <label className="type-body-sm text-t2 min-w-0">Записать контроль<select className={FIELD} value={territoryControllerSide} onChange={event => setTerritoryControllerSide(event.target.value as 'side-a' | 'side-b' | '')}>
          <option value="side-a">{sideAName}</option>
          <option value="side-b">{sideBName}</option>
          <option value="">Сбросить кампанийную запись</option>
        </select></label>
        <button type="button" className={`${BTN} self-start`} disabled={sending || !selectedTerritoryPlace || territoryControlIsNoOp} onClick={() => void submitTerritoryControl()}>{sending ? 'Готовится предложение…' : 'Предложить запись контроля'}</button>
      </section> : null}
      {error ? <p role="alert" className="type-body-sm text-fx-debuff-hi">{error}</p> : null}
      {message ? <p role="status" className="type-body-sm text-src-sim">{message}</p> : null}
    </div> : null}
  </div>;
}
