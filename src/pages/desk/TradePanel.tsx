import { useMemo, useState, type FormEvent } from 'react';
import type { InventoryOwner, InventoryStack } from '../../engine/state';
import type { TradeCompleted, TradeOffer, TradePayment, TradePriceSource } from '../../engine/events';
import type { PartyMarketContext } from '../../campaign/partyContext';
import { GOODS_LABEL } from '../../components/labels';
import { COIN_BY_ID, isCoinId } from '../../rules/srd/coins';
import { ITEMS } from '../../rules/srd/equipment';
import { MAGIC_ITEMS } from '../../rules/srd/magicItems';
import { marketGoodsOf, marketItemQuoteOf, srdBaseItemPriceOf } from '../../campaign/tradeQuote';

const FIELD = 'h-7 min-w-0 px-1 type-body-sm text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';
const BTN = 'type-key uppercase px-1.5 py-1 bg-cd shadow-bevel text-t2 cursor-pointer hover:text-tx focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const itemName = (id: string) => ITEMS[id]?.name ?? MAGIC_ITEMS[id]?.name ?? id;
const ownerKey = (owner: InventoryOwner) => owner.kind === 'party' ? 'party' : `actor:${owner.id}`;
const sameOwner = (a: InventoryOwner, b: InventoryOwner) => ownerKey(a) === ownerKey(b);
const splitId = (owner: InventoryOwner) => `item:${encodeURIComponent(owner.kind === 'party' ? 'party' : owner.id)}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
const interactionId = () => `trade:${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
type TradeReview = { trade: TradeCompleted; itemLabel: string; paymentLabels: readonly string[] };

/** DM-only trade composer. Prices are supplied by the table; the engine validates and applies the exact coin transfer. */
export function TradePanel({ inventory, actors, market, offers = [], onCreateOffer, onWithdrawOffer, onComplete }: {
  inventory: readonly InventoryStack[];
  actors: readonly { id: string; name: string; kind?: 'pc' | 'npc' | 'monster'; inParty?: boolean }[];
  market?: PartyMarketContext;
  offers?: readonly TradeOffer[];
  onCreateOffer?: (offerId: string, trade: TradeCompleted) => void;
  onWithdrawOffer?: (offerId: string) => void;
  onComplete: (trade: TradeCompleted, interactionId: string) => void;
}) {
  const owners = useMemo(() => {
    const result = new Map<string, InventoryOwner>();
    for (const stack of inventory) result.set(ownerKey(stack.owner), stack.owner);
    if (inventory.some(stack => stack.owner.kind === 'party')) result.set('party', { kind: 'party' });
    return [...result.values()];
  }, [inventory]);
  const names = new Map(actors.map(actor => [actor.id, actor.name]));
  const sellerOwners = owners.filter(owner => inventory.some(stack => sameOwner(stack.owner, owner) && !isCoinId(stack.itemId)));
  const [sellerKey, setSellerKey] = useState('');
  const seller = sellerOwners.find(owner => ownerKey(owner) === sellerKey) ?? sellerOwners[0];
  const buyerOwners = owners.filter(owner => inventory.some(stack => sameOwner(stack.owner, owner) && isCoinId(stack.itemId)));
  const [buyerKey, setBuyerKey] = useState('');
  const buyer = buyerOwners.find(owner => ownerKey(owner) === buyerKey && !sameOwner(owner, seller ?? { kind: 'party' }))
    ?? buyerOwners.find(owner => !seller || !sameOwner(owner, seller));
  const offered = inventory.filter(stack => seller && sameOwner(stack.owner, seller) && !isCoinId(stack.itemId) && !stack.wornAs && !stack.attunedTo);
  const [itemStackId, setItemStackId] = useState('');
  const item = offered.find(stack => stack.id === itemStackId) ?? offered[0];
  const basePrice = item ? srdBaseItemPriceOf(item.itemId) : undefined;
  const [itemQty, setItemQty] = useState('1');
  const paymentStacks = inventory.filter(stack => buyer && sameOwner(stack.owner, buyer) && isCoinId(stack.itemId));
  const [paymentQty, setPaymentQty] = useState<Record<string, string>>({});
  const [priceKind, setPriceKind] = useState<TradePriceSource['kind']>('house-rule');
  const [playerVisible, setPlayerVisible] = useState(false);
  const [edition, setEdition] = useState('');
  const [citation, setCitation] = useState('');
  const [error, setError] = useState('');
  const [proposal, setProposal] = useState<TradeReview | null>(null);
  const count = Number(itemQty);
  const sellerActor = seller?.kind === 'actor' ? actors.find(actor => actor.id === seller.id) : undefined;
  const partyPurchase = buyer?.kind === 'party' || buyer?.kind === 'actor' && actors.some(actor => actor.id === buyer.id && actor.inParty);
  const marketEligible = sellerActor?.kind === 'npc' && partyPurchase;
  const publicPurchaseEligible = marketEligible && item?.visibility === 'players';
  const marketGood = item && marketEligible ? marketGoodsOf(item.itemId) : undefined;
  const marketCell = marketGood && market ? market.goods.find(row => row.id === marketGood) : undefined;
  const marketQuote = item && marketGood && market && marketCell
    ? marketItemQuoteOf({ itemId: item.itemId, qty: count, locationId: market.locationId, locationName: market.locationName, goods: marketGood, index: marketCell.index })
    : undefined;
  const payments: TradePayment[] = paymentStacks.flatMap(stack => {
    const qty = Number(paymentQty[stack.id] ?? '0');
    if (!Number.isSafeInteger(qty) || qty <= 0 || qty > stack.qty) return [];
    return [{ stackId: stack.id, qty, ...(qty < stack.qty && seller ? { splitStackId: splitId(seller) } : {}) }];
  });
  const copper = payments.reduce((sum, payment) => {
    const stack = paymentStacks.find(candidate => candidate.id === payment.stackId)!;
    return sum + BigInt(payment.qty) * BigInt(COIN_BY_ID[stack.itemId as keyof typeof COIN_BY_ID].copperValue);
  }, 0n);
  const validPayments = payments.length > 0 && paymentStacks.every(stack => {
    const raw = paymentQty[stack.id] ?? '0';
    const qty = Number(raw);
    return raw === '' || Number.isSafeInteger(qty) && qty >= 0 && qty <= stack.qty;
  });
  const valid = Boolean(seller && buyer && !sameOwner(seller, buyer) && item && Number.isSafeInteger(count) && count > 0 && count <= (item?.qty ?? 0) && validPayments && copper > 0n && copper <= BigInt(Number.MAX_SAFE_INTEGER) && (priceKind === 'market' ? marketQuote && copper === BigInt(marketQuote.priceCopper) : citation.trim() && (priceKind !== 'rule' || edition.trim())));

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || !seller || !buyer || !item) return;
    const trade: TradeCompleted = {
      seller,
      buyer,
      itemStackId: item.id,
      itemQty: count,
      ...(count < item.qty ? { itemSplitStackId: splitId(buyer) } : {}),
      payments,
      priceCopper: Number(copper),
      priceSource: priceKind === 'rule' ? { kind: 'rule', edition: edition.trim(), citation: citation.trim() }
        : priceKind === 'market' && marketQuote ? { kind: 'market', edition: 'SRD 5.1', citation: `Индекс ${marketQuote.index}% · ${marketQuote.locationName}`, locationId: marketQuote.locationId, locationName: marketQuote.locationName, goods: marketQuote.goods, index: marketQuote.index, baseCopper: marketQuote.copper, itemQty: marketQuote.qty }
          : { kind: 'house-rule', citation: citation.trim() },
      ...(publicPurchaseEligible && playerVisible ? { playerVisible: true } : {}),
    };
    const paymentLabels = payments.map(payment => {
      const stack = paymentStacks.find(candidate => candidate.id === payment.stackId)!;
      return `${payment.qty} ${COIN_BY_ID[stack.itemId as keyof typeof COIN_BY_ID]?.name ?? stack.itemId}`;
    });
    setProposal({ trade, itemLabel: `${itemName(item.itemId)} · ${count} шт.`, paymentLabels });
    setError('');
  }

  function complete() {
    if (!proposal) return;
    try {
      onComplete(proposal.trade, interactionId());
      setProposal(null);
      setPaymentQty({});
      setItemQty('1');
      setPlayerVisible(false);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function loadOffer(offer: TradeOffer) {
    const itemStack = inventory.find(stack => stack.id === offer.trade.itemStackId);
    const itemLabel = `${itemName(itemStack?.itemId ?? offer.trade.itemStackId)} · ${offer.trade.itemQty} шт.`;
    const paymentLabels = offer.trade.payments.map(payment => {
      const stack = inventory.find(candidate => candidate.id === payment.stackId);
      return `${payment.qty} ${COIN_BY_ID[stack?.itemId as keyof typeof COIN_BY_ID]?.name ?? stack?.itemId ?? payment.stackId}`;
    });
    setProposal({ trade: { ...offer.trade, offerId: offer.id }, itemLabel, paymentLabels });
    setError('');
  }

  function saveOffer() {
    if (!proposal || !onCreateOffer) return;
    const offerId = `trade-offer:${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
    try {
      onCreateOffer(offerId, proposal.trade);
      setProposal({ ...proposal, trade: { ...proposal.trade, offerId } });
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const ownerLabel = (owner: InventoryOwner) => owner.kind === 'party' ? 'Партия' : names.get(owner.id) ?? owner.id;
  const marketContext = market?.goods.length ? <details className="col-span-2 rounded-sm border border-bd px-2 py-1" data-part="trade-market-context">
    <summary className="cursor-pointer text-t2 focus-visible:shadow-[var(--glow-gold)]">Индекс рынка · {market.locationName}</summary>
    <p className="mt-1 text-t3">Индексы к базовому рынку; это не готовые цены отдельных предметов.</p>
    <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1" aria-label={`Индексы рынка: ${market.locationName}`}>
      {market.goods.map(row => <li key={row.id}>{GOODS_LABEL[row.id]}: {row.index}%{row.pending !== undefined ? ` → ${row.pending}% (ждёт решения)` : ''}</li>)}
    </ul>
  </details> : null;
  if ((sellerOwners.length === 0 || buyerOwners.length === 0) && !proposal && offers.length === 0) return <details className="type-body-sm text-tx" data-part="trade-panel">
    <summary className="cursor-pointer text-gd focus-visible:shadow-[var(--glow-gold)]">Покупка и продажа</summary>
    <p className="mt-2 text-t3">Для сделки нужны предметы продавца и монеты покупателя.</p>
  </details>;

  return <details className="type-body-sm text-tx" data-part="trade-panel">
    <summary className="cursor-pointer text-gd focus-visible:shadow-[var(--glow-gold)]">Покупка и продажа</summary>
    {offers.length ? <section className="mt-2 flex flex-col gap-1" aria-label="Предложения сделок">
      <h3 className="type-key uppercase text-gd">Сохранённые предложения</h3>
      <p className="text-t3">Предложение сохраняет условия, но не резервирует вещь или монеты; при принятии проверяется актуальный запас.</p>
      <ul className="flex flex-col gap-1">
        {offers.map(offer => <li key={offer.id} className="flex flex-wrap items-center gap-2 border-t border-t-bd pt-1" data-offer-status={offer.status}>
          <span className="min-w-0 flex-1">{ownerLabel(offer.trade.seller)} → {ownerLabel(offer.trade.buyer)} · {itemName(inventory.find(stack => stack.id === offer.trade.itemStackId)?.itemId ?? offer.trade.itemStackId)} · {offer.trade.priceCopper.toLocaleString('ru-RU')} мм · {offer.status === 'open' ? 'открыто' : offer.status === 'completed' ? 'проведено' : 'отозвано'}</span>
          {offer.status === 'open' ? <>
            <button type="button" className={BTN} onClick={() => loadOffer(offer)}>Проверить предложение</button>
            {onWithdrawOffer ? <button type="button" className={BTN} onClick={() => onWithdrawOffer(offer.id)}>Отозвать</button> : null}
          </> : null}
        </li>)}
      </ul>
    </section> : null}
    {proposal ? <section className="mt-2 flex flex-col gap-2" aria-label="Проверка условий сделки" data-part="trade-review">
      <h3 className="type-h-15 text-gd">Проверьте условия сделки</h3>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        {proposal.trade.offerId ? <><dt className="text-t2">Предложение</dt><dd>{proposal.trade.offerId}</dd></> : null}
        <dt className="text-t2">Продавец</dt><dd>{ownerLabel(proposal.trade.seller)}</dd>
        <dt className="text-t2">Покупатель</dt><dd>{ownerLabel(proposal.trade.buyer)}</dd>
        <dt className="text-t2">Предмет</dt><dd>{proposal.itemLabel}</dd>
        <dt className="text-t2">Оплата</dt><dd>{proposal.paymentLabels.join(' + ')} · итого {proposal.trade.priceCopper.toLocaleString('ru-RU')} мм</dd>
        <dt className="text-t2">Цена</dt><dd>{proposal.trade.priceSource.kind === 'market' ? `SRD 5.1 · ${proposal.trade.priceSource.index}% · ${proposal.trade.priceSource.locationName}` : proposal.trade.priceSource.kind === 'rule' ? `${proposal.trade.priceSource.edition} · ` : 'Правило стола · '}{proposal.trade.priceSource.citation}</dd>
      </dl>
      {marketContext}
      <p className="type-body-xs text-t3">До подтверждения имущество не меняется. Проведение сделки перенесёт предмет и указанную оплату одним обратимым событием.</p>
      <div className="flex flex-wrap justify-end gap-2">
        {onCreateOffer && !proposal.trade.offerId ? <button type="button" className={BTN} onClick={saveOffer}>Сохранить предложение</button> : null}
        <button type="button" className={BTN} onClick={() => { setProposal(null); setError(''); }}>Изменить условия</button>
        <button type="button" className={BTN} onClick={complete}>{proposal.trade.offerId ? 'Принять и провести' : 'Провести сделку'}</button>
      </div>
      {error ? <p role="alert" className="text-er">{error}</p> : null}
    </section> : <form className="mt-2 grid grid-cols-2 gap-2" aria-label="Покупка или продажа" onSubmit={prepare}>
      {marketContext}
      <label className="flex min-w-0 flex-col gap-1 text-t2">Продавец
        <select className={FIELD} aria-label="Продавец" value={seller ? ownerKey(seller) : ''} onChange={event => { setSellerKey(event.target.value); setItemStackId(''); }}>
          {sellerOwners.map(owner => <option key={ownerKey(owner)} value={ownerKey(owner)}>{ownerLabel(owner)}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-t2">Покупатель
        <select className={FIELD} aria-label="Покупатель" value={buyer ? ownerKey(buyer) : ''} onChange={event => { setBuyerKey(event.target.value); setPaymentQty({}); }}>
          {buyerOwners.filter(owner => !seller || !sameOwner(owner, seller)).map(owner => <option key={ownerKey(owner)} value={ownerKey(owner)}>{ownerLabel(owner)}</option>)}
        </select>
      </label>
      <label className="col-span-2 flex min-w-0 flex-col gap-1 text-t2">Предмет
        <select className={FIELD} aria-label="Предмет сделки" value={item?.id ?? ''} onChange={event => setItemStackId(event.target.value)}>
          {offered.map(stack => <option key={stack.id} value={stack.id}>{itemName(stack.itemId)} · {stack.qty} шт.</option>)}
        </select>
      </label>
      {publicPurchaseEligible ? <label className="col-span-2 flex items-center gap-2 text-t2">
        <input type="checkbox" checked={playerVisible} onChange={event => setPlayerVisible(event.target.checked)} />
        Показать игрокам факт покупки (без имени торговца и его остатков)
      </label> : null}
      {basePrice ? <p className="col-span-2 text-t3" aria-label="Базовая цена предмета" data-part="trade-srd-base-price">
        Базовая цена {basePrice.citation}: {basePrice.cost} ({basePrice.copper.toLocaleString('ru-RU')} мм). {marketQuote ? `Для ${count} шт. в ${marketQuote.locationName}, индекс ${marketQuote.index}%: ${marketQuote.priceCopper.toLocaleString('ru-RU')} мм.` : 'Текущая рыночная цена для этой вещи недоступна.'}
      </p> : null}
      <label className="flex flex-col gap-1 text-t2">Количество
        <input className={FIELD} aria-label="Количество предмета" type="number" min="1" max={item?.qty ?? 1} step="1" value={itemQty} onChange={event => setItemQty(event.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-t2">Основание цены
        <select className={FIELD} aria-label="Основание цены" value={priceKind} onChange={event => setPriceKind(event.target.value as TradePriceSource['kind'])}>
          <option value="house-rule">Правило стола</option><option value="rule">Правило источника</option>{marketQuote ? <option value="market">Цена рынка · {marketQuote.locationName}</option> : null}
        </select>
      </label>
      {priceKind === 'rule' ? <label className="col-span-2 flex flex-col gap-1 text-t2">Редакция
        <input className={FIELD} aria-label="Редакция правила" value={edition} onChange={event => setEdition(event.target.value)} placeholder="Например, SRD 5.1" />
      </label> : null}
      {priceKind !== 'market' ? <label className="col-span-2 flex flex-col gap-1 text-t2">Ссылка или основание
        <input className={FIELD} aria-label="Источник цены" value={citation} onChange={event => setCitation(event.target.value)} placeholder="Источник, страница или решение мастера" />
      </label> : <p className="col-span-2 text-t3">Оплата должна точно совпасть с рассчитанной ценой; индекс проверится заново при проведении.</p>}
      <fieldset className="col-span-2 min-w-0 border-t border-t-bd pt-2">
        <legend className="px-1 type-key uppercase text-gd">Оплата · {buyer ? ownerLabel(buyer) : 'покупатель'}</legend>
        {paymentStacks.length ? <ul className="flex flex-col gap-1">
          {paymentStacks.map(stack => <li key={stack.id} className="flex items-center gap-2">
            <label className="min-w-0 flex-1 text-t2" htmlFor={`trade-payment-${stack.id}`}>{COIN_BY_ID[stack.itemId as keyof typeof COIN_BY_ID].name} · есть {stack.qty}</label>
            <input className={`${FIELD} w-20`} id={`trade-payment-${stack.id}`} aria-label={`Оплатить: ${COIN_BY_ID[stack.itemId as keyof typeof COIN_BY_ID].name}`} type="number" min="0" max={stack.qty} step="1" value={paymentQty[stack.id] ?? '0'} onChange={event => setPaymentQty(current => ({ ...current, [stack.id]: event.target.value }))} />
          </li>)}
        </ul> : <p className="text-t3">У покупателя нет монет.</p>}
        <p className="mt-1 type-num-12 text-tx">Итого: {copper.toLocaleString('ru-RU')} мм</p>
      </fieldset>
      <div className="col-span-2 flex items-center justify-between gap-2">
        <span className="type-body-sm text-t3">Сначала проверьте стороны, предмет, цену и точную оплату.</span>
        <button type="submit" className={BTN} disabled={!valid}>Проверить условия</button>
      </div>
      {error ? <p role="alert" className="col-span-2 text-er">{error}</p> : null}
    </form>}
  </details>;
}
