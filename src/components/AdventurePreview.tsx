import { useMemo, useState } from 'react';
import { ArtImage } from '../art/ArtImage';
import { FIRST_PACK_GENERIC_SHOPKEEPER_ART, FIRST_PACK_NODE_ART } from '../art/firstPackArtwork';
import type { AdventureRouteState, AdventureSession } from '../engine/state';
import { authoredRoutePaths, planAdventureRoute } from '../campaign/adventureRoutes';
import { AdventurePlanView } from './AdventurePlanView';
import { adventureForPlayers, adventureHandoutsForPlayers, parseAdventureBundle, type AdventureKind } from '../packages/adventure';
import { adventureSceneRunSheet } from '../packages/adventureRunSheet';
import type { EntityRef } from '../entities/ref';
const LABEL: Record<AdventureKind,string> = {location:'Места',route:'Маршруты',npc:'Персонажи',creature:'Противники',scene:'Сцены',thread:'Нити',fact:'Факты',plan:'Планы',handout:'Раздатки',proposal:'Предложения',item:'Предметы'};
const RELATION: Record<string,string> = {at:'Место',within:'Внутри',on:'На дороге',plan:'План',from:'Откуда',via:'Через',to:'Куда',participant:'Участник',thread:'Нить','discover-in':'Узнать в сцене',depicts:'Изображает','after-scene':'После сцены',fact:'Факт',route:'Маршрут','associated-place':'Связанное место','encountered-at':'Где встречается',contains:'Содержит',carries:'Несёт', 'refers-to-item':'Предмет','requested-by':'Кому принадлежит / кто запросил',unlocks:'Открывает'};
const BTN = 'cursor-pointer text-gd underline underline-offset-2 focus-visible:outline focus-visible:outline-1 focus-visible:outline-gd';
interface AdventurePreviewProps {
  data: unknown;
  session?: AdventureSession;
  party?: readonly { id: string; name: string }[];
  startPending?: boolean;
  pendingOutcomeIds?: readonly string[];
  pendingRouteStates?: Readonly<Record<string, AdventureRouteState['status']>>;
  revealedFactNodeIds?: readonly string[];
  actionError?: string;
  onOpenEntity?: (ref: EntityRef) => void;
  onSetParty?: () => void;
  onStart?: (privateTableUseConfirmed: boolean) => void;
  onOutcome?: (sceneId: string) => void;
  onRouteStatus?: (routeId: string, status: AdventureRouteState['status'], reason: string) => void;
  onRevealFact?: (factNodeId: string) => void;
}
/** DM-only reading surface. Following links is navigation, never a campaign command. */
export function AdventurePreview({ data, session, party = [], startPending = false, pendingOutcomeIds = [], pendingRouteStates = {}, revealedFactNodeIds = [], actionError, onOpenEntity, onSetParty, onStart, onOutcome, onRouteStatus, onRevealFact }: AdventurePreviewProps) {
  const parsed = useMemo(() => { try { return {bundle:parseAdventureBundle(session?.graph ?? data)}; } catch(e) { return {error:e instanceof Error ? e.message : String(e)}; } },[data,session?.graph]);
  const [selected,setSelected] = useState<string>();
  const [kind,setKind] = useState<AdventureKind>('scene');
  const [privateTableUseConfirmed,setPrivateTableUseConfirmed] = useState(false);
  const [routeFrom,setRouteFrom] = useState('');
  const [routeTo,setRouteTo] = useState('');
  const [routeReason,setRouteReason] = useState('');
  if (!parsed.bundle) return <p role="alert">{parsed.error}</p>;
  const b = parsed.bundle;
  const routePaths = authoredRoutePaths(b, session?.routeStates ?? {});
  const routeLocations = b.nodes.filter(n => n.kind === 'location');
  const routePlan = session && routeFrom && routeTo ? planAdventureRoute(b, session.routeStates ?? {}, routeFrom, routeTo) : null;
  const node = b.nodes.find(n => n.id === selected) ?? b.nodes.find(n => n.id === b.entry)!;
  const sources = new Map(b.sources.map(s => [s.id,s]));
  const backlinks = b.nodes.flatMap(n => n.links.filter(l => l.target === node.id).map(l => ({node:n,relation:l.relation})));
  const outcomeProposal = node.kind === 'scene' ? b.nodes.find(n => n.kind === 'proposal' && n.links.some(link => link.relation === 'after-scene' && link.target === node.id)) : undefined;
  const outcomeAccepted = !!outcomeProposal && (session?.resolvedProposalIds ?? []).includes(outcomeProposal.id);
  const outcomePending = !!outcomeProposal && pendingOutcomeIds.includes(outcomeProposal.id);
  const runSheet = node.kind === 'scene' ? adventureSceneRunSheet(b, node.id) : undefined;
  const revealed = new Set(revealedFactNodeIds);
  const playerProjection = adventureForPlayers(b, revealed);
  const playerHandouts = adventureHandoutsForPlayers(b, revealed);
  const factRevealed = node.kind === 'fact' && revealed.has(node.id);
  const shopLocationRoleArt = node.id === 'barthen' ? FIRST_PACK_GENERIC_SHOPKEEPER_ART : undefined;
  const art = FIRST_PACK_NODE_ART[node.id as keyof typeof FIRST_PACK_NODE_ART] ?? shopLocationRoleArt;
  return <section aria-label={`Разметка приключения: ${b.title}`} className="flex flex-col gap-2 mt-2">
    <p className="type-body-sm text-t2">{b.scope}</p>
    <p className="type-body-xs text-t2">{b.version} · {b.distribution} · {b.nodes.length} записей · {b.campaignYear === null ? 'Год не задан' : `Год: ${b.campaignYear}`}</p>
    <p className="type-body-sm text-tx">{session ? 'В сессии сохранён source-linked граф: ' + b.nodes.length + ' игровых записей с исходными связями и страницами. Они доступны как сущности этой сессии; геометрия, числовые блоки и участники партии не создаются автоматически.' : 'Просмотр разметки. Места, участники и предложения ещё не активированы в кампании. Сведения предназначены мастеру.'}</p>
    <p className="type-body-xs text-t2">Сеттинг: {b.setting} · правила: {b.rules.length ? b.rules.join(', ') : 'не выбраны; сценарий остаётся повествовательным и не задаёт числовые проверки'}. Пакет предназначен для мастера.</p>
    {!session && onStart ? <div className="flex flex-col gap-2 bg-pl p-2" aria-label="Первый запуск">
      <h4 className="type-h-17">Первый запуск · 5–10 минут</h4>
      {party.length ? <p className="type-body-xs text-t2">Партия: {party.map(member => member.name).join(' · ')}</p> : b.rules.length ? <p role="alert">Для запуска с выбранными правилами нужна действующая партия.</p> : <p className="type-body-xs text-t2">Можно начать мастерскую повествовательную сессию без партии и привязать героев позже.</p>}
      <p className="type-body-xs text-t2">Точка входа: {node.name}. Подготовка сцены показывает связанные места, планы, участников, факты и предметы; актёры и тактические карты не активируются автоматически.</p>
      {b.distribution === 'table' ? <label className="flex items-start gap-1 type-body-xs text-t2"><input type="checkbox" checked={privateTableUseConfirmed} onChange={e => setPrivateTableUseConfirmed(e.target.checked)} /><span>Использую этот table-only пакет только в закрытой игре, без его публикации или включения в открытый пакет.</span></label> : null}
      <button type="button" className={BTN} disabled={b.rules.length > 0 && !party.length || b.distribution === 'table' && !privateTableUseConfirmed || startPending} onClick={() => onStart(privateTableUseConfirmed)}>
        {startPending ? 'Запуск ожидает принятия во входящих' : 'Предложить первый запуск'}
      </button>
    </div> : null}
    {session ? <div className="flex flex-col gap-1 bg-pl p-2 type-body-sm" aria-label="Активная игровая сессия">
      <h4 className="type-h-17">Активная сессия · {session.status === 'active' ? 'идёт' : 'исход отмечен'}</h4>
      <p>Партия: {session.partyIds.length ? session.partyIds.map(id => party.find(member => member.id === id)?.name ?? id).join(' · ') : 'пока не привязана; подготовка идёт без героев'}</p>
      {!session.partyIds.length && party.length && onSetParty ? <button type="button" className={BTN} onClick={onSetParty}>Предложить привязать действующую партию</button> : null}
      <p className="text-t2">Сеттинг: {session.settingPackageId} · правила: {session.rulesPackageIds.length ? session.rulesPackageIds.join(', ') : 'не выбраны'} · доступ: {session.distribution}</p>
      <p className="text-t2">Мастер выбирает маршрут или сцену по исходным связям. Пины и расстояния не создаются без геометрии источника.</p>
      <div className="mt-1 border-t border-bd pt-1" aria-label="Раскрытие фактов">
        <p className="text-t2">Игрокам открыто фактов: {revealed.size}. Выберите факт в списке, чтобы раскрыть его или проверить статус.</p>
      </div>
      <section className="mt-1 border-t border-bd pt-1" aria-label="Маршруты и их доступность">
        <h5 className="type-key">Маршруты и их доступность</h5>
        {routePaths.length ? <ul className="mt-1 flex flex-col gap-1">
          {routePaths.map(route => {
            const pendingStatus = pendingRouteStates[route.id];
            const canChange = session.status === 'active' && !!onRouteStatus && route.locationIds.length >= 2 && !pendingStatus;
            return <li key={route.id} className="flex flex-wrap items-center gap-1">
              <span className="mr-auto"><span aria-hidden="true">{route.status === 'open' ? '●' : '×'}</span> {route.name} · {route.status === 'open' ? 'доступен' : 'закрыт'}</span>
              {pendingStatus ? <span role="status">Ожидает принятия: {pendingStatus === 'open' ? 'открыть' : 'закрыть'}</span> : null}
              {route.state?.reason ? <span className="basis-full text-t2">Причина: {route.state.reason}</span> : null}
              {route.state ? <span className="basis-full type-body-xs text-t2">Изменение зафиксировано в журнале.</span> : null}
              {onRouteStatus ? <button type="button" className={BTN} disabled={!canChange} onClick={() => onRouteStatus(route.id, route.status === 'open' ? 'closed' : 'open', routeReason)}>
                {route.status === 'open' ? 'Закрыть маршрут' : 'Открыть маршрут'}
              </button> : null}
            </li>;
          })}
        </ul> : <p className="text-t2">В пакете нет описанных маршрутов.</p>}
        {onRouteStatus && session.status === 'active' ? <label className="mt-1 block text-t2">Причина изменения, если нужна
          <input aria-label="Причина изменения маршрута" value={routeReason} maxLength={240} onChange={event => setRouteReason(event.target.value)} className="block w-full bg-cd text-tx" />
        </label> : null}
        <p className="mt-1 type-body-xs text-t2">Статус кампании накладывается на неизменяемую топологию пакета. Геометрия, расстояние и обратное направление без источника не предполагаются.</p>
      </section>
      <section className="mt-1 border-t border-bd pt-1" aria-label="Планировщик маршрутов">
        <h5 className="type-key">Планировщик маршрутов</h5>
        <label className="block text-t2">Откуда
          <select aria-label="Начало маршрута" value={routeFrom} onChange={event => setRouteFrom(event.target.value)} className="block w-full bg-cd text-tx">
            <option value="">Выберите место</option>{routeLocations.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}
          </select>
        </label>
        <label className="block text-t2">Куда
          <select aria-label="Конец маршрута" value={routeTo} onChange={event => setRouteTo(event.target.value)} className="block w-full bg-cd text-tx">
            <option value="">Выберите место</option>{routeLocations.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}
          </select>
        </label>
        {routeFrom && routeTo ? routePlan
          ? <p role="status">Путь по связям пакета: {routePlan.locationIds.map(id => b.nodes.find(place => place.id === id)?.name ?? id).join(' → ')}. Маршруты: {routePlan.routeIds.map(id => b.nodes.find(item => item.id === id)?.name ?? id).join(' · ') || 'без перехода'}.</p>
          : <p role="status">Нет доступного пути между этими местами по открытым маршрутам пакета.</p>
          : <p className="text-t2">Выберите места. План строится только по открытым связям; мили и время не рассчитываются.</p>}
      </section>
      {outcomeProposal && session?.status === 'active' && onOutcome ? <div className="mt-1 border-t border-bd pt-1">
        <p className="text-t2">Предложение «{outcomeProposal.name}» связано со сценой «{node.name}». Принятие запишет только решение мастера, без награды и изменений мира; запись можно отменить через журнал.</p>
        {outcomeAccepted ? <p role="status">Исход отмечен. Запись можно отменить в журнале.</p> : outcomePending ? <p role="status">Предложение находится во входящих.</p> : <button type="button" className={BTN} onClick={() => onOutcome(node.id)}>Предложить отметить исход этой сцены</button>}
      </div> : null}
    </div> : null}
    <label className="type-body-sm text-t2">Раздел разметки
      <select value={kind} onChange={e => setKind(e.target.value as AdventureKind)} className="block w-full bg-wl text-tx">
        {Object.entries(LABEL).filter(([k]) => b.nodes.some(n => n.kind === k)).map(([k,label]) => <option key={k} value={k}>{label} · {b.nodes.filter(n => n.kind === k).length}</option>)}
      </select>
    </label>
    <ul aria-label={LABEL[kind]} className="flex flex-wrap gap-x-3 gap-y-1 type-body-sm">
      {b.nodes.filter(n => n.kind === kind).map(n => <li key={n.id}><button type="button" className={BTN} aria-pressed={n.id === node.id} onClick={() => setSelected(n.id)}>{n.name}</button></li>)}
    </ul>
    <article aria-label={`Запись: ${node.name}`} className="p-2 bg-wl flex flex-col gap-2 type-body-sm">
      <h4 className="type-h-20">{node.name}</h4>
      <p>{node.summary}</p>
      {node.settingEntityRef ? <p className="type-body-xs text-t2">Справочник Planetos: {onOpenEntity
        ? <button type="button" className={BTN} onClick={() => onOpenEntity(node.settingEntityRef!)}>Открыть карточку · {node.settingEntityRef}</button>
        : node.settingEntityRef}. Сущность не создаётся в кампании автоматически.</p> : null}
      {runSheet ? <section aria-label={`Игровая вертикаль сцены: ${node.name}`} className="flex flex-col gap-2 border border-br bg-pl p-2">
        <h5 className="type-h-17">Подготовка игровой сцены</h5>
        <div>
          <strong>Место и план</strong>
          {runSheet.places.length ? <ul>{runSheet.places.map(place => <li key={place.id}>
            <button type="button" className={BTN} onClick={() => setSelected(place.id)}>{place.name}</button>
          </li>)}</ul> : <p className="text-t2">У сцены нет связанного места.</p>}
          {runSheet.plans.length ? <ul aria-label="Планы сцены">{runSheet.plans.map(plan => <li key={plan.id}>
            <button type="button" className={BTN} onClick={() => setSelected(plan.id)}>Открыть план · {plan.name}</button>
            <span className="text-t2"> · PDF {plan.planGeometry?.pdfPage ?? '—'}</span>
          </li>)}</ul> : <p className="text-t2">Для места нет связанного плана в выборке.</p>}
        </div>
        <div>
          <strong>Участники · {runSheet.participants.length}</strong>
          {runSheet.participants.length ? <ul>{runSheet.participants.map(participant => <li key={participant.id}>
            <button type="button" className={BTN} onClick={() => setSelected(participant.id)}>{participant.name}</button>
            {participant.kind === 'creature' ? <span className="text-t2"> · {participant.engineBinding ? `точная ссылка ${participant.engineBinding.id}` : 'профиль требует отдельной проверки'}</span> : null}
          </li>)}</ul> : <p className="text-t2">Участники не указаны.</p>}
        </div>
        <div>
          <strong>Факты и предметы</strong>
          {runSheet.facts.length ? <ul aria-label="Факты сцены">{runSheet.facts.map(fact => {
            const isRevealed = revealed.has(fact.id);
            return <li key={fact.id}>
              <button type="button" className={BTN} onClick={() => setSelected(fact.id)}>{fact.name}</button>
              {session && isRevealed ? <span className="text-t2"> · открыто игрокам</span>
                : session?.status === 'active' && onRevealFact ? <button type="button" className={`ml-2 ${BTN}`} onClick={() => onRevealFact(fact.id)}>Раскрыть</button>
                  : <span className="text-t2"> · только мастеру</span>}
            </li>;
          })}</ul> : <p className="text-t2">С этой сценой не связаны раскрываемые факты.</p>}
          {runSheet.items.length ? <ul aria-label="Предметы сцены">{runSheet.items.map(item => <li key={item.id}>
            <button type="button" className={BTN} onClick={() => setSelected(item.id)}>{item.name}</button>
          </li>)}</ul> : <p className="text-t2">Связанных предметов нет.</p>}
        </div>
        {runSheet.threads.length ? <p><strong>Нити:</strong> {runSheet.threads.map((thread, index) => <span key={thread.id}>
          {index ? ' · ' : ''}<button type="button" className={BTN} onClick={() => setSelected(thread.id)}>{thread.name}</button>
        </span>)}</p> : null}
        {runSheet.proposals.length ? <p className="text-t2">Для этой сцены есть отдельное предложение исхода ниже; оно не меняет награды и состояние мира автоматически.</p>
          : <p className="text-t2">Отдельный маркер исхода в выборке не задан. Решения и последствия остаются у мастера.</p>}
        <p className="type-body-xs text-t2">Движение токенов, инициатива и поле видимости работают в MapTool; эта разметка плана — редакторская и не является боевой геометрией.</p>
      </section> : null}
      {node.mapRef ? <p className="text-t2">Точка карты: {node.mapRef.mapId} · {node.mapRef.key} · {node.mapRef.coords[0]}, {node.mapRef.coords[1]} px исходника · редакторская опора, не канонические координаты. Источник привязки: {node.mapRef.source}.</p> : null}
      {node.planGeometry ? <p className="text-t2">Масштаб источника: PDF {node.planGeometry.pdfPage} · {node.planGeometry.calibration.kind === 'grid' ? `${node.planGeometry.calibration.feetPerCell} футов на клетку` : `шкала в футах: ${node.planGeometry.calibration.feetMarks.join(' · ')}`} · {node.planGeometry.runtimeGeometry ? 'открыта редакторская геометрия областей' : 'runtime-геометрия пока не добавлена'}.</p> : null}
      {node.kind === 'plan' && node.planGeometry?.runtimeGeometry ? <AdventurePlanView key={node.id} node={node} bundle={b} onOpenNode={setSelected} /> : null}
      {art ? <figure className="flex flex-col gap-1">
        <ArtImage asset={art} alt={`${node.name} · ${shopLocationRoleArt ? 'обобщённый торговец' : 'авторская иллюстрация'}`} width={node.kind === 'scene' ? 320 : 128} sizes={node.kind === 'scene' ? '(max-width: 420px) 100vw, 320px' : '128px'} />
        <figcaption className="type-body-xs text-t2">{shopLocationRoleArt
          ? 'Обобщённый образ торговца для контекста места; это не портрет Elmar/Elmina и не уточнение личности.'
          : 'Авторская painterly-иллюстрация связана с этой записью по ID. Сцены передают настроение, не карту; существа не задают статистику или состав встречи; портреты — интерпретации, не книжные изображения.'}</figcaption>
      </figure> : null}
      {node.preparation ? <p className="text-t2">Подготовка: {node.preparation}</p> : null}
      {node.engineBinding ? <p className="text-t2">Профиль движка: {node.engineBinding.packageId}@{node.engineBinding.packageVersion} · {node.engineBinding.kind}/{node.engineBinding.id} · {node.engineBinding.application === 'per-member' ? 'отдельно для каждого члена группы' : 'профиль одного существа'}. Ссылка сверена вручную; статистика и актёр в кампанию не копируются.</p> : null}
      <p className="text-t2">{node.audience === 'dm' ? 'Только мастер' : 'Открытая запись пакета'}</p>
      {node.kind === 'fact' && session ? <div className="border-t border-bd pt-1">
        {factRevealed ? <p role="status" className="text-t2">Факт открыт игрокам.</p>
          : onRevealFact ? <button type="button" className={BTN} onClick={() => onRevealFact(node.id)}>Раскрыть игрокам и добавить в раздатки</button>
            : <p className="text-t2">Запустите сессию, чтобы раскрывать факты игрокам.</p>}
      </div> : null}
      <ul aria-label="Источники записи" className="text-t2">
        {node.evidence.map((e,i) => <li key={i}>{sources.get(e.source)?.origin === 'hb' ? 'Авторское дополнение' : 'Источник'}: {sources.get(e.source)?.title}{e.pages.length ? ` · PDF ${e.pages.join(', ')}` : ''}</li>)}
      </ul>
      {node.links.length ? <ul aria-label="Связи записи">{node.links.map((l,i) => <li key={i}>{RELATION[l.relation] ?? l.relation}: <button type="button" className={BTN} onClick={() => setSelected(l.target)}>{b.nodes.find(n => n.id === l.target)!.name}</button></li>)}</ul> : null}
      {backlinks.length ? <details><summary className="cursor-pointer text-t2">Связанные записи · {backlinks.length}</summary><ul>{backlinks.map((l,i) => <li key={i}><button type="button" className={BTN} onClick={() => setSelected(l.node.id)}>{l.node.name}</button> · {RELATION[l.relation] ?? l.relation}</li>)}</ul></details> : null}
    </article>
    <details aria-label="Предпросмотр для игроков" className="bg-pl p-2">
      <summary className="cursor-pointer type-body-sm">Проверить проекцию игрокам · {playerProjection.nodes.length} открытых записей</summary>
      {playerProjection.nodes.length ? <ul className="mt-1 flex flex-col gap-1 type-body-sm">{playerProjection.nodes.map(entry => <li key={entry.id}><strong>{entry.name}</strong> · {entry.summary}</li>)}</ul> : <p className="mt-1 type-body-xs text-t2">До явного раскрытия нет открытых записей.</p>}
      {playerHandouts.map(handout => <section key={handout.id} className="mt-2 border-t border-bd pt-1" aria-label={handout.name}>
        <strong>{handout.name}</strong><p>{handout.summary}</p>
        {handout.entries.length ? <ul>{handout.entries.map(entry => <li key={entry.id}><strong>{entry.name}</strong> · {entry.summary}</li>)}</ul>
          : handout.id === 'town-leads' ? <p className="text-t2">Пока нет раскрытых зацепок.</p> : null}
      </section>)}
      <p className="mt-1 type-body-xs text-t2">Секретные факты и ссылки на скрытые записи отсутствуют.</p>
    </details>
    {actionError ? <p role="alert" className="text-fx-damage-hi">{actionError}</p> : null}
  </section>;
}
