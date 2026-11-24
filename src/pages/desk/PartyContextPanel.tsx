import { useState, type ReactNode } from 'react';
import type { PartyContextSnapshot } from '../../campaign/partyContext';
import type { InventoryContainer, InventoryStack, InventoryStorage, PartyTransport } from '../../engine';
import type { TradeCompleted, TradeOffer } from '../../engine/events';
import { ITEMS } from '../../rules/srd/equipment';
import { MAGIC_ITEMS } from '../../rules/srd/magicItems';
import { ref } from '../../entities/ref';
import { useOpenEntity } from '../../components/openEntity';
import { TradePanel } from './TradePanel';

const FIELD = 'h-7 min-w-0 px-1 type-body-sm text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';
const BTN = 'type-key uppercase px-1.5 py-1 bg-cd shadow-bevel text-t2 cursor-pointer hover:text-tx focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const inventoryName = (itemId: string) => ITEMS[itemId]?.name ?? MAGIC_ITEMS[itemId]?.name ?? itemId;
const containerId = (kind: InventoryContainer['kind']) => `container:${kind}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;

function InventoryItemLabel({itemId,qty}:{itemId:string;qty:number}) {
  const openEntity=useOpenEntity();
  const name=inventoryName(itemId);
  const label=`${name} ×${qty}`;
  if(!openEntity||(!ITEMS[itemId]&&!MAGIC_ITEMS[itemId]))return <>{label}</>;
  return <button type="button" className="text-gd underline cursor-pointer text-left focus-visible:shadow-[var(--glow-gold)]" aria-label={`Открыть предмет: ${name}`} onClick={()=>openEntity(ref('item',itemId))}>{label}</button>;
}

function newSplitStackId(actorId: string) {
  const id = globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + Math.random().toString(36).slice(2);
  return 'item:' + encodeURIComponent(actorId) + ':' + id;
}

function StorageMoveControl({stack,destinations,actors,onMoveItem,onTransferItem}:{stack:InventoryStack;destinations:readonly {key:string;label:string;storage:InventoryStorage}[];actors:readonly {id:string;name:string}[];onMoveItem?:(stackId:string,qty:number,to:InventoryStorage,splitStackId?:string)=>void;onTransferItem?:(stackId:string,qty:number,actorId:string,splitStackId?:string)=>void}) {
  const [destinationKey,setDestinationKey]=useState(destinations[0]?.key??'');
  const [recipientId,setRecipientId]=useState(actors[0]?.id??'');
  const [quantity,setQuantity]=useState(String(stack.qty));
  const destination=destinations.find(option=>option.key===destinationKey)??destinations[0];
  const amount=Number(quantity);
  const validAmount=Number.isSafeInteger(amount)&&amount>0&&amount<=stack.qty;
  const recipient=actors.find(actor=>actor.id===recipientId)??actors[0];
  const splitId=()=>amount<stack.qty?newSplitStackId(stack.owner.kind==='actor'?stack.owner.id:recipient?.id??'party'):undefined;
  if((!destinations.length||!destination||!onMoveItem)&&(!recipient||!onTransferItem))return null;
  return <>
    <label className="sr-only" htmlFor={'storage-qty-'+stack.id}>Количество для действия {inventoryName(stack.itemId)}</label>
    <input id={'storage-qty-'+stack.id} className={FIELD+' w-14'} type="number" min="1" max={stack.qty} step="1" value={quantity} onChange={event=>setQuantity(event.target.value)} />
    {destination&&onMoveItem?<label className="sr-only" htmlFor={`storage-target-${stack.id}`}>Новое место хранения {inventoryName(stack.itemId)}</label>:null}
    {destination&&onMoveItem?<select id={`storage-target-${stack.id}`} className={FIELD} value={destination.key} onChange={event=>setDestinationKey(event.target.value)}>
      {destinations.map(option=><option key={option.key} value={option.key}>{option.label}</option>)}
    </select>:null}
    {destination&&onMoveItem?<button type="button" className={BTN} disabled={!validAmount} aria-label={`Переместить ${inventoryName(stack.itemId)}: ${stack.id}`} onClick={()=>{const split=splitId();if(split)onMoveItem(stack.id,amount,destination.storage,split);else onMoveItem(stack.id,amount,destination.storage);setQuantity(String(amount<stack.qty?stack.qty-amount:stack.qty));}}>Переместить</button>:null}
    {stack.owner.kind==='party'&&onTransferItem&&recipient?<>
      <label className="sr-only" htmlFor={'storage-recipient-'+stack.id}>Кому выдать {inventoryName(stack.itemId)}</label>
      <select id={'storage-recipient-'+stack.id} className={FIELD} value={recipient.id} onChange={event=>setRecipientId(event.target.value)}>
        {actors.map(actor=><option key={actor.id} value={actor.id}>{actor.name}</option>)}
      </select>
      <button type="button" className={BTN} disabled={!validAmount} aria-label={'Выдать '+inventoryName(stack.itemId)+' персонажу '+recipient.name} onClick={()=>{const split=splitId();if(split)onTransferItem(stack.id,amount,recipient.id,split);else onTransferItem(stack.id,amount,recipient.id);setQuantity(String(amount<stack.qty?stack.qty-amount:stack.qty));}}>Выдать</button>
    </>:null}
  </>;
}

/** Receives an audience-filtered projection. No store, guessed transport or camp inventory. */
export function PartyContextPanel({snapshot,onLocation,trailing,profile,dmView=false,containers=[],inventory=[],actors=[],tradeActors=actors,transports=[],locations=[],tradeOffers=[],onCreateContainer,onRemoveContainer,onCreateTransport,onRemoveTransport,onMoveItem,onTransferItem,onCreateTradeOffer,onWithdrawTradeOffer,onCompleteTrade,showTitle=true}:{snapshot:PartyContextSnapshot;onLocation?:(id:string)=>void;trailing?:ReactNode;profile?:ReactNode;showTitle?:boolean;dmView?:boolean;containers?:readonly InventoryContainer[];inventory?:readonly InventoryStack[];actors?:readonly {id:string;name:string}[];tradeActors?:readonly {id:string;name:string;kind?:'pc'|'npc'|'monster';inParty?:boolean}[];transports?:readonly PartyTransport[];locations?:readonly {id:string;name:string}[];tradeOffers?:readonly TradeOffer[];onCreateContainer?:(container:InventoryContainer)=>void;onRemoveContainer?:(containerId:string)=>void;onCreateTransport?:(transport:PartyTransport)=>void;onRemoveTransport?:(transportId:string)=>void;onMoveItem?:(stackId:string,qty:number,to:InventoryStorage,splitStackId?:string)=>void;onTransferItem?:(stackId:string,qty:number,actorId:string,splitStackId?:string)=>void;onCreateTradeOffer?:(offerId:string,trade:TradeCompleted)=>void;onWithdrawTradeOffer?:(offerId:string)=>void;onCompleteTrade?:(trade:TradeCompleted,interactionId:string)=>void}) {
  const [containerKind,setContainerKind]=useState<InventoryContainer['kind']>('camp');
  const [containerName,setContainerName]=useState('');
  const [campLocationId,setCampLocationId]=useState('');
  const [transportName,setTransportName]=useState('');
  const [transportId,setTransportId]=useState('');
  const selectedTransport=transports.find(transport=>transport.id===transportId)??transports[0];
  const {location,supply,lastJourney,lastRest}=snapshot;
  return <section aria-label="Состояние партии" className="flex items-center gap-3 p-3 bg-pn shadow-plate">
    <div className="flex flex-1 min-w-0 flex-col gap-3">
    <header className="flex flex-wrap items-center gap-3">
      {showTitle ? <h3 className="type-h-20 text-tx">Партия сейчас</h3> : null}
      <span className="type-body-sm text-t2">Участников: {snapshot.members}</span>
      {location ? onLocation ? <button type="button" className="type-body-sm text-gd underline cursor-pointer focus-visible:shadow-[var(--glow-gold)]" onClick={()=>onLocation(location.id)}>{location.name}</button> : <span className="type-body-sm text-tx">{location.name}</span> : null}
      {snapshot.split ? <span className="type-body-sm text-t2" data-part="party-split">Партия разделена{snapshot.positions?.length ? ` · ${snapshot.positions.map(place=>`${place.name} (${place.members})`).join(', ')}` : ''}</span> : null}
      {snapshot.locationIncomplete ? <>
        <span className="type-body-sm text-t2" data-part="party-location-incomplete">Общее место партии не подтверждено для всех участников</span>
        {snapshot.positions?.length ? <span className="type-body-sm text-t2" data-part="party-known-positions">Известные места: {snapshot.positions.map(place => `${place.name} (${place.members})`).join(', ')}</span> : null}
      </> : null}
      {location?.haven ? <span className="type-body-sm text-t2">Укрытие для отдыха</span> : null}
    </header>
    <dl className="flex flex-wrap items-baseline gap-x-3 gap-y-1 type-body-sm">
      <dt className="text-t2">Общие припасы</dt><dd className="type-num-15 text-tx">{supply.value}</dd>
      {supply.capacity !== null ? <><dt className="text-t2">Унесут</dt><dd className="type-num-15 text-tx">{supply.capacity}</dd></> : null}
      {supply.days !== undefined ? <><dt className="text-t2">Хватит на дней</dt><dd className="type-num-15 text-tx">{supply.days}</dd></> : null}
      {supply.perDay > 0 ? <><dt className="text-t2">Расход в день</dt><dd className="type-num-15 text-tx">{supply.perDay}</dd></> : null}
    </dl>
    {lastJourney ? <details className="type-body-sm text-tx">
      <summary className="cursor-pointer text-gd focus-visible:shadow-[var(--glow-gold)]">Последний переход</summary>
      <p>{lastJourney.from ? `${lastJourney.from} → ` : ''}{lastJourney.to}</p>
      <p>{lastJourney.miles} миль · {lastJourney.days} дн.</p>
    </details> : null}
    {lastRest ? <details className="type-body-sm text-tx">
      <summary className="cursor-pointer text-gd focus-visible:shadow-[var(--glow-gold)]">Последний отдых</summary>
      <p>{lastRest.kind === 'long' ? 'Долгий отдых' : 'Короткий отдых'}</p>
      <p>{lastRest.participants.join(', ')}</p>
    </details> : null}
    {profile ? <details className="type-body-sm text-tx" data-part="party-subject-profile">
      <summary className="cursor-pointer text-gd focus-visible:shadow-[var(--glow-gold)]">Общий профиль партии</summary>
      <div className="mt-2 min-h-48">{profile}</div>
    </details> : null}
    {dmView ? <details className="type-body-sm text-tx">
      <summary className="cursor-pointer text-gd focus-visible:shadow-[var(--glow-gold)]">Хранилища партии</summary>
      <p className="mt-1 type-body-sm text-t3">Создавайте лагерь или транспорт явно. Поход и отдых сами хранилище не создают.</p>
      <form className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-1" aria-label="Создать хранилище" onSubmit={event=>{
        event.preventDefault();
        const name=containerName.trim();
        if(!name||!onCreateContainer)return;
        if(containerKind==='transport'&&!selectedTransport)return;
        onCreateContainer({id:containerId(containerKind),name,kind:containerKind,...(containerKind==='camp'&&campLocationId?{locationId:campLocationId}:{}),...(containerKind==='transport'&&selectedTransport?{transportId:selectedTransport.id}:{})});
        setContainerName('');
      }}>
        <label className="sr-only" htmlFor="party-container-kind">Тип хранилища</label>
        <select id="party-container-kind" className={FIELD} value={containerKind} onChange={event=>setContainerKind(event.target.value as InventoryContainer['kind'])}>
          <option value="camp">Лагерь</option><option value="transport">Транспорт</option>
        </select>
        <label className="sr-only" htmlFor="party-container-name">Название хранилища</label>
        <input id="party-container-name" className={FIELD} value={containerName} onChange={event=>setContainerName(event.target.value)} placeholder="Название" />
        <button type="submit" className={BTN} disabled={!containerName.trim()||!onCreateContainer||containerKind==='transport'&&!selectedTransport}>Создать</button>
      </form>
      {containerKind==='transport' ? (transports.length ? <label className="mt-1 flex flex-wrap items-center gap-2 type-body-sm text-t2" htmlFor="party-container-transport">
        <span>Транспорт</span>
        <select id="party-container-transport" className={FIELD} value={selectedTransport?.id??''} onChange={event=>setTransportId(event.target.value)}>
          {transports.map(transport=><option key={transport.id} value={transport.id}>{transport.name}</option>)}
        </select>
      </label> : <p className="mt-1 type-body-sm text-t3">Сначала добавьте транспорт, затем создайте связанный грузовой контейнер.</p>) : null}
      {containerKind==='camp'&&locations.length?<label className="mt-1 flex flex-wrap items-center gap-2 type-body-sm text-t2" htmlFor="party-camp-location">
        <span>Место лагеря</span>
        <select id="party-camp-location" className={FIELD} value={campLocationId} onChange={event=>setCampLocationId(event.target.value)}>
          <option value="">Без привязки</option>
          {locations.map(place=><option key={place.id} value={place.id}>{place.name}</option>)}
        </select>
      </label>:null}
      <form className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-1 border-t border-t-bd pt-2" aria-label="Добавить транспорт" onSubmit={event=>{
        event.preventDefault();
        const name=transportName.trim();
        if(!name||!onCreateTransport)return;
        const transport={id:`transport:${globalThis.crypto?.randomUUID?.()??`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`,name};
        onCreateTransport(transport);
        setTransportName('');
        setTransportId(transport.id);
      }}>
        <label className="sr-only" htmlFor="party-transport-name">Название транспорта</label>
        <input id="party-transport-name" className={FIELD} value={transportName} onChange={event=>setTransportName(event.target.value)} placeholder="Добавить транспорт: название" />
        <button type="submit" className={BTN} disabled={!transportName.trim()||!onCreateTransport}>Добавить</button>
      </form>
      {transports.length ? <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 type-body-sm text-t2" aria-label="Транспорт партии">
        {transports.map(transport=><li key={transport.id} className="inline-flex items-center gap-1">
          <span>{transport.name}</span>
          <button type="button" className={BTN} disabled={!onRemoveTransport||containers.some(container=>container.transportId===transport.id)} aria-label={`Удалить транспорт ${transport.name}`} title={containers.some(container=>container.transportId===transport.id)?'Сначала удалите связанные грузовые контейнеры':'Удалить транспорт'} onClick={()=>onRemoveTransport?.(transport.id)}>×</button>
        </li>)}
      </ul> : null}
      {inventory.some(stack=>stack.owner.kind==='party'&&stack.storage.kind==='party')?<section className="mt-2" aria-label="Общий запас партии">
        <h4 className="type-key uppercase text-gd">Общий запас</h4>
        <ul className="mt-1 flex flex-col gap-1">
          {inventory.filter(stack=>stack.owner.kind==='party'&&stack.storage.kind==='party').map(stack=><li key={stack.id} className="flex flex-wrap items-center gap-1">
            <span className="min-w-0 flex-1 truncate"><InventoryItemLabel itemId={stack.itemId} qty={stack.qty}/> · владелец: партия</span>
            <StorageMoveControl stack={stack} actors={actors} destinations={containers.map(container=>({key:container.id,label:`${container.name} · ${container.kind==='camp'?'лагерь':'транспорт'}`,storage:{kind:'container' as const,id:container.id}}))} onMoveItem={onMoveItem} onTransferItem={onTransferItem}/>
          </li>)}
        </ul>
      </section>:null}
      {containers.length ? <ul className="mt-2 flex flex-col gap-2" aria-label="Хранилища партии">
        {containers.map(container=>{
          const contents=inventory.filter(stack=>stack.storage.kind==='container'&&stack.storage.id===container.id);
          return <li key={container.id} className="border-t border-t-bd pt-1">
            <div className="flex items-center gap-2"><h4 className="min-w-0 flex-1 type-key uppercase text-gd">{container.name} · {container.kind==='camp'?'лагерь':`транспорт: ${transports.find(transport=>transport.id===container.transportId)?.name??'не связан'}`}{container.locationId?` · ${locations.find(place=>place.id===container.locationId)?.name??'место не найдено'}`:''}</h4>
              {contents.length===0&&onRemoveContainer?<button type="button" className={BTN} aria-label={`Удалить пустое хранилище ${container.name}`} onClick={()=>onRemoveContainer(container.id)}>Удалить</button>:null}
            </div>
            {contents.length ? <ul className="mt-1 flex flex-col gap-1">
              {contents.map(stack=>{
                const ownerId=stack.owner.kind==='actor'?stack.owner.id:undefined;
                const owner=ownerId?actors.find(actor=>actor.id===ownerId)?.name??ownerId:'партия';
                const destinations=[{key:'party',label:'Общий запас партии',storage:{kind:'party' as const}},...containers.filter(other=>other.id!==container.id).map(other=>({key:other.id,label:`${other.name} · ${other.kind==='camp'?'лагерь':'транспорт'}`,storage:{kind:'container' as const,id:other.id}}))];
                return <li key={stack.id} className="flex flex-wrap items-center gap-1">
                  <span className="min-w-0 flex-1 truncate"><InventoryItemLabel itemId={stack.itemId} qty={stack.qty}/> · владелец: {owner}</span>
                  <StorageMoveControl stack={stack} actors={actors} destinations={destinations} onMoveItem={onMoveItem} onTransferItem={onTransferItem}/>
                </li>;
              })}
            </ul> : <p className="type-body-sm text-t3">Пусто</p>}
          </li>;
        })}
      </ul> : <p className="mt-2 type-body-sm text-t3">Хранилищ пока нет.</p>}
    </details> : null}
    {dmView && onCompleteTrade ? <TradePanel inventory={inventory} actors={tradeActors} market={snapshot.market} offers={tradeOffers} onCreateOffer={onCreateTradeOffer} onWithdrawOffer={onWithdrawTradeOffer} onComplete={onCompleteTrade}/> : null}
    </div>
    {trailing ? <div className="flex-none">{trailing}</div> : null}
  </section>;
}
