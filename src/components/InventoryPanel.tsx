import { useMemo, useState } from 'react';
import type { Actor, InventoryContainer, InventoryOwner, InventoryStack, InventoryStorage } from '../engine/state';
import { attunementRequirement } from '../engine/inventory';
import { ITEMS, armorIdOfItem } from '../rules/srd/equipment';
import { MAGIC_ITEMS, MAGIC_ITEM_LIST } from '../rules/srd/magicItems';
import { COINS, COIN_BY_ID, COIN_WEIGHT_PER_POUND, isCoinId } from '../rules/srd/coins';
import { ref } from '../entities/ref';
import { useOpenEntity } from './openEntity';
import { ArtImage } from '../art/ArtImage';
import { firstPackItemArtwork } from '../art/firstPackArtwork';

const FIELD = 'h-7 min-w-0 px-1 type-body-sm text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';
const BTN = 'type-key uppercase px-1.5 py-1 bg-cd shadow-bevel text-t2 cursor-pointer hover:text-tx focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';

export interface InventoryPanelProps {
  actor: Actor;
  stacks: readonly InventoryStack[];
  containers?: readonly InventoryContainer[];
  dmView: boolean;
  onGain?: (stack: InventoryStack) => void;
  onExchange?: (stackId: string, qty: number, toCoinId: string, toQty: number, receiveStackId: string) => void;
  onMove?: (stackId: string, qty: number, to: InventoryStorage, splitStackId?: string) => void;
  onTransfer?: (stackId: string, qty: number, owner: InventoryOwner, to: InventoryStorage, splitStackId?: string) => void;
  onLose?: (stackId: string, qty: number) => void;
  onAttune?: (stackId: string, actorId?: string) => void;
  onEquip?: (stackId: string, actorId: string, wornAs: 'armor' | 'shield') => void;
  onUnequip?: (stackId: string, actorId: string) => void;
}

const itemName = (id: string) => ITEMS[id]?.name ?? MAGIC_ITEMS[id]?.name ?? id;

function newStackId(actorId: string): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `item:${encodeURIComponent(actorId)}:${id}`;
}

export function InventoryPanel({ actor, stacks, containers = [], dmView, onGain, onExchange, onMove, onTransfer, onLose, onAttune, onEquip, onUnequip }: InventoryPanelProps) {
  const openEntity = useOpenEntity();
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('1');
  const [visibleToPlayers, setVisibleToPlayers] = useState(false);
  const [exchangeStackId, setExchangeStackId] = useState('');
  const [exchangeTo, setExchangeTo] = useState('coin:gp');
  const [exchangeQty, setExchangeQty] = useState('1');
  const [containerTargetId, setContainerTargetId] = useState('');
  const [moveQuantities, setMoveQuantities] = useState<Record<string, string>>({});
  const selectedItemArtwork = firstPackItemArtwork(itemId);
  const options = useMemo(() => [
    ...Object.values(ITEMS).map(item => ({ id: item.id, name: item.name, kind: 'mundane' as const })),
    ...MAGIC_ITEM_LIST.map(item => ({ id: item.id, name: item.name, kind: 'magic' as const })),
    ...COINS.map(coin => ({ id: coin.id, name: `${coin.name} (${coin.short})`, kind: 'coin' as const })),
  ].sort((a, b) => a.name.localeCompare(b.name)), []);
  const amount = Number.parseInt(qty, 10);
  const own = stacks.filter(stack => stack.owner.kind === 'actor' && stack.owner.id === actor.id && (dmView || stack.visibility === 'players'));
  const carried = own.filter(stack => stack.storage.kind === 'actor' && stack.storage.id === actor.id);
  const weight = carried.reduce((sum, stack) => {
    const item = ITEMS[stack.itemId];
    if (isCoinId(stack.itemId)) return sum + stack.qty / COIN_WEIGHT_PER_POUND;
    return item?.weight === undefined ? sum : sum + item.weight * stack.qty;
  }, 0);
  const strength = actor.sheet?.abilities.str;
  const capacity = strength === undefined ? undefined : strength * 15;
  const unknownWeight = carried.some(stack => !isCoinId(stack.itemId) && ITEMS[stack.itemId]?.weight === undefined);
  const attuned = own.filter(stack => stack.attunedTo === actor.id).length;
  const coinBalances = own.reduce((balances, stack) => {
    if (isCoinId(stack.itemId)) balances[stack.itemId] = (balances[stack.itemId] ?? 0) + stack.qty;
    return balances;
  }, {} as Partial<Record<(typeof COINS)[number]['id'], number>>);
  const coinStacks = own.filter(stack => isCoinId(stack.itemId));
  const exchangeStack = coinStacks.find(stack => stack.id === exchangeStackId) ?? coinStacks[0];
  const exchangeAmount = Number(exchangeQty);
  const exchangeResult = exchangeStack && isCoinId(exchangeStack.itemId) && isCoinId(exchangeTo)
    ? exchangeAmount * COIN_BY_ID[exchangeStack.itemId].copperValue / COIN_BY_ID[exchangeTo].copperValue
    : Number.NaN;
  const exchangeCanSubmit = Boolean(exchangeStack && exchangeStack.itemId !== exchangeTo && Number.isSafeInteger(exchangeAmount) && exchangeAmount > 0 && exchangeAmount <= exchangeStack.qty && Number.isSafeInteger(exchangeResult) && exchangeResult > 0 && onExchange);
  const containerTarget = containers.find(container => container.id === containerTargetId) ?? containers[0];
  const gear = own.filter(stack => !isCoinId(stack.itemId));
  const moveQtyOf = (stack: InventoryStack) => Number(moveQuantities[stack.id] ?? stack.qty);
  const validMoveQty = (stack: InventoryStack) => Number.isSafeInteger(moveQtyOf(stack)) && moveQtyOf(stack) > 0 && moveQtyOf(stack) <= stack.qty;
  const splitIdFor = (stack: InventoryStack, amount: number) => amount < stack.qty ? newStackId(actor.id) : undefined;
  const clearMoveQty = (stackId: string) => setMoveQuantities(current => { const next = { ...current }; delete next[stackId]; return next; });

  return (
    <section aria-label="Имущество персонажа" className="flex flex-col gap-2" data-part="inventory-panel">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="type-h-15 uppercase text-t2">Имущество</h3>
        <span className="type-num-12 text-t2" title={unknownWeight ? 'Некоторые предметы не имеют веса в открытом справочнике SRD; они не включены в сумму.' : 'Вес имущества по справочнику SRD'}>
          Вес {weight.toLocaleString('ru-RU')} фнт{capacity === undefined ? '' : ` / ${capacity} фнт`}{unknownWeight ? ' · часть без веса' : ''}
        </span>
      </div>
      {dmView && containers.length ? <label className="flex items-center gap-2 type-body-sm text-t2">
        Поместить в
        <select className={FIELD} aria-label="Целевой контейнер" value={containerTarget?.id ?? ''} onChange={event => setContainerTargetId(event.target.value)}>
          {containers.map(container => <option key={container.id} value={container.id}>{container.name} · {container.kind === 'camp' ? 'лагерь' : 'транспорт'}</option>)}
        </select>
      </label> : null}

      {Object.keys(coinBalances).length ? (
        <div className="flex flex-col gap-1">
          <h4 className="type-key uppercase text-t2">Монеты</h4>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1" aria-label="Монеты персонажа">
            {COINS.filter(coin => coinBalances[coin.id]).map(coin => {
              const stack = own.find(item => item.itemId === coin.id);
              return <li key={coin.id} className="flex items-center gap-1 type-body-sm">
                <span className="flex-1 text-tx">{coinBalances[coin.id]} {coin.short}</span>
                {dmView && stack ? <button type="button" className={BTN} aria-label={`Потерять одну монету: ${coin.name}`} onClick={() => onLose?.(stack.id, 1)}>−1</button> : null}
              </li>;
            })}
          </ul>
          {dmView && (onMove || onTransfer) ? <details className="type-body-sm">
            <summary className="cursor-pointer text-gd focus-visible:shadow-[var(--glow-gold)]">Действия со стеками монет</summary>
            <ul className="mt-1 flex flex-col gap-1" aria-label="Стеки монет">
              {coinStacks.map(stack => {
                const storedByActor=stack.storage.kind==='actor'&&stack.storage.id===actor.id;
                const storedContainerId=stack.storage.kind==='container'?stack.storage.id:undefined;
                const storedContainer=storedContainerId?containers.find(container=>container.id===storedContainerId):undefined;
                const where=storedByActor?'личное место':stack.storage.kind==='party'?'запас партии':storedContainer?.name??'контейнер';
                return <li key={stack.id} className="flex flex-wrap items-center gap-1">
                  <span className="min-w-0 flex-1 text-tx">{COIN_BY_ID[stack.itemId as keyof typeof COIN_BY_ID].name} ×{stack.qty} · {where}</span>
                  <label className="sr-only" htmlFor={'inventory-coin-move-qty-'+stack.id}>Количество монет для переноса</label>
                  <input id={'inventory-coin-move-qty-'+stack.id} className={FIELD+' w-14'} type="number" min="1" max={stack.qty} step="1" value={moveQuantities[stack.id]??String(stack.qty)} onChange={event=>setMoveQuantities(current=>({...current,[stack.id]:event.target.value}))}/>
                  <button type="button" className={BTN} disabled={!onMove||!validMoveQty(stack)} aria-label={storedByActor?'Убрать монеты в запас партии':'Взять монеты к себе'} onClick={()=>{const amount=moveQtyOf(stack),target=storedByActor?{kind:'party' as const}:{kind:'actor' as const,id:actor.id},split=splitIdFor(stack,amount);if(split)onMove?.(stack.id,amount,target,split);else onMove?.(stack.id,amount,target);clearMoveQty(stack.id);}}>{storedByActor?'В запас':'К себе'}</button>
                  {containerTarget?<button type="button" className={BTN} disabled={!onMove||!validMoveQty(stack)||stack.storage.kind==='container'&&stack.storage.id===containerTarget.id} aria-label={'Поместить монеты в '+containerTarget.name} onClick={()=>{const amount=moveQtyOf(stack),target={kind:'container' as const,id:containerTarget.id},split=splitIdFor(stack,amount);if(split)onMove?.(stack.id,amount,target,split);else onMove?.(stack.id,amount,target);clearMoveQty(stack.id);}}>В контейнер</button>:null}
                  <button type="button" className={BTN} disabled={!onTransfer||!validMoveQty(stack)} aria-label="Передать монеты партии" onClick={()=>{const amount=moveQtyOf(stack),split=splitIdFor(stack,amount);if(split)onTransfer?.(stack.id,amount,{kind:'party'},{kind:'party'},split);else onTransfer?.(stack.id,amount,{kind:'party'},{kind:'party'});clearMoveQty(stack.id);}}>Передать партии</button>
                </li>;
              })}
            </ul>
          </details> : null}
          {dmView ? <details className="type-body-sm">
            <summary className="cursor-pointer text-gd focus-visible:shadow-[var(--glow-gold)]">Обменять монеты</summary>
            <form className="mt-1 grid grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)_auto] gap-1" aria-label="Обменять монеты" onSubmit={event => {
              event.preventDefault();
              if (!exchangeCanSubmit || !exchangeStack) return;
              onExchange?.(exchangeStack.id, exchangeAmount, exchangeTo, exchangeResult, newStackId(actor.id));
              setExchangeQty('1');
            }}>
              <label className="sr-only" htmlFor={`inventory-exchange-source-${actor.id}`}>Откуда</label>
              <select id={`inventory-exchange-source-${actor.id}`} className={FIELD} value={exchangeStack?.id ?? ''} onChange={event => setExchangeStackId(event.target.value)}>
                {coinStacks.map(stack => <option key={stack.id} value={stack.id}>{COIN_BY_ID[stack.itemId as keyof typeof COIN_BY_ID].name} · {stack.qty}</option>)}
              </select>
              <label className="sr-only" htmlFor={`inventory-exchange-qty-${actor.id}`}>Количество для обмена</label>
              <input id={`inventory-exchange-qty-${actor.id}`} className={FIELD} type="number" min="1" step="1" value={exchangeQty} onChange={event => setExchangeQty(event.target.value)} />
              <label className="sr-only" htmlFor={`inventory-exchange-target-${actor.id}`}>На номинал</label>
              <select id={`inventory-exchange-target-${actor.id}`} className={FIELD} value={exchangeTo} onChange={event => setExchangeTo(event.target.value)}>
                {COINS.filter(coin => coin.id !== exchangeStack?.itemId).map(coin => <option key={coin.id} value={coin.id}>{coin.name}</option>)}
              </select>
              <button type="submit" className={BTN} disabled={!exchangeCanSubmit}>Обменять</button>
              <span className="col-span-full type-key text-t3">{exchangeCanSubmit ? `Получит: ${exchangeResult} ${COIN_BY_ID[exchangeTo as keyof typeof COIN_BY_ID].short}` : 'Выберите целое количество для обмена без потери стоимости.'}</span>
            </form>
          </details> : null}
        </div>
      ) : null}

      {gear.length ? (
        <ul className="flex flex-col gap-1" aria-label="Предметы персонажа">
          {gear.map(stack => {
            const magic = MAGIC_ITEMS[stack.itemId];
            const requirement = magic?.attunement.required
              ? attunementRequirement(actor, magic.attunement.by, magic.attunement.when)
              : 'unsupported';
            const canAttune = dmView && Boolean(magic?.attunement.required) && requirement === 'eligible' && (stack.attunedTo === actor.id || attuned < 3);
            const equipSlot = stack.itemId === 'shield' ? 'shield' : armorIdOfItem(stack.itemId) ? 'armor' : undefined;
            const slotOccupied = equipSlot ? own.some(other => other.id !== stack.id && other.wornAs === equipSlot) : false;
            const canEquip = Boolean(equipSlot) && stack.storage.kind === 'actor' && stack.storage.id === actor.id && stack.qty === 1 && !stack.wornAs && !slotOccupied && !(equipSlot === 'armor' && actor.sheet?.mageArmor);
            const storedByActor = stack.storage.kind === 'actor' && stack.storage.id === actor.id;
            const containerId = stack.storage.kind === 'container' ? stack.storage.id : undefined;
            const storedContainerName = containerId ? containers.find(container => container.id === containerId)?.name : undefined;
            const canOpenReference = Boolean(openEntity && (ITEMS[stack.itemId] || MAGIC_ITEMS[stack.itemId]));
            const artwork = firstPackItemArtwork(stack.itemId);
            return (
              <li key={stack.id} className="relative flex min-w-0 items-center gap-1 type-body-sm" title={magic?.typeLine ?? ITEMS[stack.itemId]?.text ?? itemName(stack.itemId)}>
                {artwork ? <ArtImage asset={artwork} alt="" width={32} sizes="32px" className="size-8 object-contain flex-none" /> : null}
                <span className="min-w-0 flex-1 truncate text-tx">{canOpenReference ? <button type="button" className="text-gd underline cursor-pointer max-w-full truncate text-left focus-visible:shadow-[var(--glow-gold)]" aria-label={`Открыть предмет: ${itemName(stack.itemId)}`} onClick={() => openEntity?.(ref('item', stack.itemId))}>{itemName(stack.itemId)}{stack.qty > 1 ? ` ×${stack.qty}` : ''}</button> : <>{itemName(stack.itemId)}{stack.qty > 1 ? ` ×${stack.qty}` : ''}</>}{stack.storage.kind === 'party' ? <span className="type-key text-t3"> · в запасе партии</span> : containerId ? <span className="type-key text-t3"> · {dmView ? storedContainerName ?? 'контейнер' : 'в общем хранилище'}</span> : null}{stack.wornAs ? <span className="type-key text-t3"> · надет</span> : null}</span>
                {stack.attunedTo === actor.id ? <span className="type-key text-gd-hi">настроен</span> : null}
                {dmView ? <details className="flex-none">
                  <summary className={BTN} aria-label={`Действия: ${itemName(stack.itemId)}`}>Действия</summary>
                  <div className="absolute right-0 top-full z-20 flex min-w-40 flex-col gap-1 border border-t-bd bg-pn p-2 shadow-plate">
                    {onMove || onTransfer ? <>
                      <label className="type-key text-t2" htmlFor={`inventory-move-qty-${stack.id}`}>Количество переноса</label>
                      <input id={`inventory-move-qty-${stack.id}`} className={FIELD} type="number" min="1" max={stack.qty} step="1" value={moveQuantities[stack.id] ?? String(stack.qty)} onChange={event=>setMoveQuantities(current=>({...current,[stack.id]:event.target.value}))} />
                    </> : null}
                    <button type="button" className={BTN} disabled={Boolean(stack.attunedTo) || !onMove || !validMoveQty(stack)}
                      title={stack.wornAs ? 'Перемещение снимет предмет с персонажа' : stack.attunedTo ? 'Сначала снимите настройку с предмета' : undefined}
                      onClick={() => { const amount=moveQtyOf(stack),target=storedByActor ? { kind: 'party' as const } : { kind: 'actor' as const,id:actor.id },split=splitIdFor(stack,amount); if(split)onMove?.(stack.id,amount,target,split);else onMove?.(stack.id,amount,target);clearMoveQty(stack.id); }}>
                      {storedByActor ? 'Убрать в запас' : 'Взять к себе'}
                    </button>
                    {containerTarget ? <button type="button" className={BTN} disabled={!onMove || Boolean(stack.attunedTo) || !validMoveQty(stack) || stack.storage.kind === 'container' && stack.storage.id === containerTarget.id}
                      title={stack.attunedTo ? 'Сначала снимите настройку с предмета' : stack.wornAs ? 'Перемещение снимет предмет с персонажа' : undefined}
                      aria-label={`Поместить ${itemName(stack.itemId)} в ${containerTarget.name}`}
                      onClick={() => { const amount=moveQtyOf(stack),target={kind:'container' as const,id:containerTarget.id},split=splitIdFor(stack,amount);if(split)onMove?.(stack.id,amount,target,split);else onMove?.(stack.id,amount,target);clearMoveQty(stack.id); }}>В контейнер</button> : null}
                    <button type="button" className={BTN} disabled={!onTransfer || Boolean(stack.attunedTo) || !validMoveQty(stack)}
                      title={stack.attunedTo ? 'Сначала снимите настройку с предмета' : 'Владелец и место хранения станут общими для партии'}
                      aria-label={`Передать партии: ${itemName(stack.itemId)}`}
                      onClick={() => { const amount=moveQtyOf(stack),split=splitIdFor(stack,amount);if(split)onTransfer?.(stack.id,amount,{kind:'party'},{kind:'party'},split);else onTransfer?.(stack.id,amount,{kind:'party'},{kind:'party'});clearMoveQty(stack.id); }}>Передать партии</button>
                    {equipSlot ? (stack.wornAs ? (
                      <button type="button" className={BTN} disabled={!onUnequip} aria-label={`Снять: ${itemName(stack.itemId)}`} onClick={() => onUnequip?.(stack.id, actor.id)}>Снять</button>
                    ) : (
                      <button type="button" className={BTN} disabled={!canEquip || !onEquip}
                        title={stack.qty !== 1 ? 'Сначала разделите стек на отдельные экземпляры' : slotOccupied ? `Сначала снимите уже надетый ${equipSlot === 'armor' ? 'доспех' : 'щит'}` : equipSlot === 'armor' && actor.sheet?.mageArmor ? 'Сначала завершите Mage Armor' : undefined}
                        onClick={() => onEquip?.(stack.id, actor.id, equipSlot!)}>Надеть</button>
                    )) : null}
                    {magic?.attunement.required ? <button type="button" className={BTN} disabled={!canAttune} title={requirement === 'unsupported' ? 'Ограничение настройки требует проверки мастером' : attuned >= 3 && stack.attunedTo !== actor.id ? 'Предел — три настроенных предмета' : undefined}
                      onClick={() => onAttune?.(stack.id, stack.attunedTo === actor.id ? undefined : actor.id)}>
                      {stack.attunedTo === actor.id ? 'Снять настройку' : 'Настроить'}
                    </button> : null}
                    <button type="button" className={BTN} aria-label={`Потерять одну единицу: ${itemName(stack.itemId)}`} title="Потерять одну единицу" onClick={() => onLose?.(stack.id, 1)}>Потерять ×1</button>
                  </div>
                </details> : null}
              </li>
            );
          })}
        </ul>
      ) : Object.keys(coinBalances).length === 0 ? <p className="type-body-sm text-t3">Имущества пока нет.</p> : null}

      {dmView ? (
        <form className="grid grid-cols-[minmax(0,1fr)_3.5rem_auto] gap-1" aria-label="Добавить имущество" onSubmit={event => {
          event.preventDefault();
          if (!itemId || !Number.isInteger(amount) || amount < 1 || !onGain) return;
          onGain({ id: newStackId(actor.id), itemId, qty: amount, owner: { kind: 'actor', id: actor.id }, storage: { kind: 'actor', id: actor.id }, visibility: visibleToPlayers ? 'players' : 'dm' });
          setQty('1');
        }}>
          <label className="sr-only" htmlFor={`inventory-item-${actor.id}`}>Предмет</label>
          <select id={`inventory-item-${actor.id}`} className={FIELD} value={itemId} onChange={event => setItemId(event.target.value)}>
            <option value="">Выбрать предмет…</option>
            <optgroup label="Снаряжение SRD">{options.filter(item => item.kind === 'mundane').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>
            <optgroup label="Магические предметы SRD">{options.filter(item => item.kind === 'magic').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>
            <optgroup label="Монеты SRD">{options.filter(item => item.kind === 'coin').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>
          </select>
          {selectedItemArtwork ? <span className="col-span-full inline-flex items-center gap-2 type-body-xs text-t2">
            <ArtImage asset={selectedItemArtwork} alt="" width={40} sizes="40px" className="size-10 object-contain flex-none" />
            {itemName(itemId)} · авторская иллюстрация
          </span> : null}
          <label className="sr-only" htmlFor={`inventory-qty-${actor.id}`}>Количество</label>
          <input id={`inventory-qty-${actor.id}`} className={FIELD} type="number" min="1" step="1" value={qty} onChange={event => setQty(event.target.value)} />
          <button type="submit" className={BTN} disabled={!itemId || !Number.isInteger(amount) || amount < 1 || !onGain}>Получить</button>
          <label className="col-span-full inline-flex items-center gap-1 type-key text-t2 cursor-pointer">
            <input type="checkbox" checked={visibleToPlayers} onChange={event => setVisibleToPlayers(event.target.checked)} />
            Игрокам
          </label>
        </form>
      ) : null}
    </section>
  );
}
