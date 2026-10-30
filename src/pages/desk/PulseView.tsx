// Вид «Пульс мира» главной зоны (F5, Q8): что происходит без партии. Календарь на три десятидневки, фракции и их
// отношения, боги партии, индексы цен поселений, веса встреч. Только мастеру: на столе игроков вида нет. «Требует
// решения» — входящие правой колонки, здесь не повторяются (факт живёт в одном месте); ждущее значение стоит рядом
// с нынешним бирюзой симуляции. Данные — проекция pulseOf(state), сам вид ничего не меняет. Напряжения (Д3, 7.2) —
// по весу; по умолчанию — кампании (место кампании или сторона — её фракция), «весь мир» — переключателем вида.
import { useState, type ReactNode, type RefObject } from 'react';
import {
  PULSE_DAYS, TENDAY, eraOf, formatHarptos, harptos, holyList, inDays, nextHolyDay, pricedGoods, pulseOf, tensionThreadState,
  type PulseEventKind, type PulsePriceCell, type Tension,
} from '../../campaign';
import { FactionGraph, GOODS_LABEL, MOON_ICONS, TensionList, signed } from '../../components';
import { SECONDS_PER_DAY, type State } from '../../engine';
import { ref, type EntityRef } from '../../entities';
import { Icon } from '../../icons/Icon';
import type { IconName } from '../../icons/icons.generated';
import { HEAD } from './styles';

const EVENT_ICON: Readonly<Record<PulseEventKind, IconName>> = {
  festival: 'ent-event', 'moon-full': MOON_ICONS.full, 'moon-new': MOON_ICONS.new, holy: 'ent-deity', season: 'tempo', thread: 'threads',
};
const EVENT_TITLE: Readonly<Record<PulseEventKind, string>> = {
  festival: 'Праздник Харптоса', 'moon-full': 'Selûne', 'moon-new': 'Selûne', holy: 'Святой день бога партии', season: 'Сезон', thread: 'Нить остывает: симуляция предложит её закрыть',
};

function Panel({ icon, color, title, note, children, part }: { icon: IconName; color: string; title: string; note?: string; children: ReactNode; part: string }) {
  return (
    <section aria-label={title} data-part={part} className="flex flex-col bg-pn shadow-bevel min-w-0">
      <div className={HEAD}>
        <Icon name={icon} size={16} color={color} title={title} />
        <span>{title}</span>
        {note ? <span className="type-key text-t2 normal-case">{note}</span> : null}
      </div>
      <div className="p-3 flex flex-col gap-2">{children}</div>
    </section>
  );
}

/** Индекс цены: 100 — база; выше — ▲ (дороже), ниже — ▼; ждущее — «→ N» бирюзой. */
function PriceCell({ cell }: { cell: PulsePriceCell }) {
  const mark = (n: number) => (n > 100 ? <span className="text-fx-debuff-hi" title="дороже базовой"> ▲</span> : n < 100 ? <span className="text-fx-heal-hi" title="дешевле базовой"> ▼</span> : null);
  return (
    <span className="type-num-15 text-tx whitespace-nowrap">
      {cell.index}{mark(cell.index)}
      {cell.pending !== undefined ? <span className="text-src-sim" title="Ждёт решения: так станет, если принять"> → {cell.pending}</span> : null}
    </span>
  );
}

export interface PulseViewProps {
  state: State;
  mainRef: RefObject<HTMLElement | null>;
  onOpenEntity: (ref: EntityRef) => void;
  /** Напряжения; null — справочник мира ещё грузится. */
  tensions?: readonly Tension[] | null;
  onThread?: (t: Tension) => void;
  /** Ветки «что если» (Д4) — панель страницы: сторы веток живут на ней, вид их только показывает. */
  branches?: ReactNode;
}

const SCOPE_BTN = 'type-num-12 uppercase px-2 py-0.5 bg-cd shadow-bevel text-t2 cursor-pointer aria-pressed:text-gd-hi aria-pressed:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)]';

/** Напряжение кампании: стоит в её месте или одна из сторон — её фракция. */
const ofCampaign = (t: Tension) => t.locationId !== undefined || t.sides.some(s => s.ref.startsWith('faction:'));

export function PulseView({ state, mainRef, onOpenEntity, tensions, onThread, branches }: PulseViewProps) {
  const [world, setWorld] = useState(false);
  const pulse = pulseOf(state);
  const priced = pricedGoods(pulse.prices);
  const shownTensions = tensions ? (world ? tensions : tensions.filter(ofCampaign)) : null;
  const today = Math.floor(state.time.sec / SECONDS_PER_DAY) * SECONDS_PER_DAY;
  const era = eraOf(harptos(today).year);
  const dayLabel = (sec: number) => formatHarptos(sec).replace(/,.*$/, '').replace(/ \d+ DR$/, '');
  const tendays = [0, 1, 2].map(k => ({
    from: today + k * TENDAY * SECONDS_PER_DAY,
    to: today + (k * TENDAY + TENDAY - 1) * SECONDS_PER_DAY,
    events: pulse.events.filter(e => e.days >= k * TENDAY && e.days < (k + 1) * TENDAY),
  }));
  const maxWeight = Math.max(2, ...pulse.encounters.flatMap(r => r.entries.flatMap(e => [e.weight, e.pending ?? 0])));
  return (
    <section aria-label="Пульс мира" ref={mainRef} className="relative flex-1 min-w-0 min-h-0 flex flex-col gap-4 p-4 overflow-auto">
      <Panel icon="tempo" color="var(--t2)" title="Календарь" note={`следующие ${PULSE_DAYS} дней`} part="pulse-calendar">
        <div className="grid grid-cols-3 gap-3">
          {tendays.map((t, k) => (
            <div key={k} className="flex flex-col gap-1 min-w-0" role="group" aria-label={`${dayLabel(t.from)} — ${dayLabel(t.to)}`}>
              <span className="type-num-12 uppercase text-t2">{dayLabel(t.from)} — {dayLabel(t.to)}</span>
              <ul className="flex flex-col gap-1">
                {t.events.map((e, i) => (
                  <li key={i} className="flex items-start gap-2 bg-cd shadow-bevel px-2 py-1" data-kind={e.kind}>
                    <Icon name={EVENT_ICON[e.kind]} size={16} color={e.kind === 'thread' ? 'var(--src-sim)' : e.kind === 'holy' ? 'var(--ent-deity)' : 'var(--t2)'} title={EVENT_TITLE[e.kind]} className="mt-0.5 flex-none" />
                    <span className="flex flex-col min-w-0">
                      <span className="type-body-sm text-tx truncate" title={e.label}>{e.label}</span>
                      <span className="type-key text-t2">{dayLabel(e.sec)} · {inDays(e.days)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 items-start">
        <Panel icon="ent-faction" color="var(--ent-faction)" title="Фракции и отношения" part="pulse-factions">
          <FactionGraph factions={pulse.factions} edges={pulse.edges} onOpen={id => onOpenEntity(ref('faction', id))} />
          <ul aria-label="Обозначения" className="flex flex-wrap gap-x-4 gap-y-1 type-body-xs text-t2">
            <li className="flex items-center gap-1"><svg width="28" height="8" aria-hidden><line x1="0" y1="4" x2="28" y2="4" stroke="var(--fx-heal-hi)" strokeWidth="2.5" /></svg>союз</li>
            <li className="flex items-center gap-1"><svg width="28" height="8" aria-hidden><line x1="0" y1="4" x2="28" y2="4" stroke="var(--fx-debuff-hi)" strokeWidth="2" strokeDasharray="7 5" /></svg>соперничество</li>
            <li className="flex items-center gap-1"><svg width="28" height="8" aria-hidden><line x1="0" y1="2" x2="28" y2="2" stroke="var(--fx-damage-hi)" strokeWidth="1.5" /><line x1="0" y1="6" x2="28" y2="6" stroke="var(--fx-damage-hi)" strokeWidth="1.5" /></svg>вражда</li>
            <li className="text-src-sim">→ бирюзой — ждёт решения</li>
          </ul>
        </Panel>
        {pulse.gods.length > 0 ? (
          <Panel icon="ent-deity" color="var(--ent-deity)" title="Боги партии" part="pulse-gods">
            <ul className="flex flex-col gap-2">
              {pulse.gods.map(g => {
                const next = nextHolyDay(state.time.sec, era, new Set([g.id]));
                return (
                  <li key={g.id} className="flex flex-col gap-0.5 bg-cd shadow-bevel px-2 py-1.5">
                    <button type="button" onClick={() => onOpenEntity(ref('deity', g.id))} title={`Карточка бога: ${g.name}`} className="self-start type-h-15 text-tx hover:text-gd-hi underline decoration-t2 underline-offset-2 cursor-pointer">{g.name}</button>
                    <span className="type-body-sm text-t2">молятся: {g.worshippers.join(', ')}</span>
                    {next ? <span className="type-body-sm text-t2">святой день {inDays(next.days)} — {holyList(next.holy)}</span> : null}
                  </li>
                );
              })}
            </ul>
          </Panel>
        ) : null}
      </div>

      {branches ? (
        <Panel icon="threads" color="var(--src-sim)" title="Ветки «что если»" note="копия мира в памяти — основная линия не меняется, игрокам не видна" part="pulse-branches">
          {branches}
        </Panel>
      ) : null}

      {tensions === undefined ? null : (
        <Panel icon="pulse" color="var(--fx-debuff-hi)" title="Напряжения" note={shownTensions ? `${shownTensions.length} · по весу — сколько фактов держат` : 'справочник мира грузится'} part="pulse-tensions">
          <div role="group" aria-label="Охват напряжений" className="flex items-center gap-1">
            <button type="button" aria-pressed={!world} onClick={() => setWorld(false)} className={SCOPE_BTN} title="Места кампании и её фракции">кампания</button>
            <button type="button" aria-pressed={world} onClick={() => setWorld(true)} className={SCOPE_BTN} title="Все напряжения справочника в год кампании">весь мир{tensions ? ` · ${tensions.length}` : ''}</button>
          </div>
          {shownTensions ? (
            <TensionList tensions={shownTensions} onOpen={onOpenEntity} {...(onThread ? { onThread } : {})} threadState={t => tensionThreadState(state, t)} className="max-h-[28rem] overflow-auto" />
          ) : null}
        </Panel>
      )}

      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 items-start">
        {pulse.prices.length > 0 ? (
          <Panel icon="pin-shop" color="var(--t2)" title="Цены" note="индекс: 100 — базовая" part="pulse-prices">
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-0 min-w-full">
                <thead>
                  <tr>
                    <th className="text-left px-2 py-1 type-key text-t2 font-normal">Поселение</th>
                    <th className="text-right px-2 py-1 type-key text-t2 font-normal" title="Надбавка места ко всему">общий</th>
                    {priced.map(g => <th key={g} className="text-right px-2 py-1 type-key text-t2 font-normal">{GOODS_LABEL[g]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {pulse.prices.map(r => (
                    <tr key={r.id} data-place={r.id}>
                      <th scope="row" className="text-left px-2 py-1 type-body text-tx font-normal" style={{ boxShadow: 'inset 0 -1px 0 var(--lo)' }}>{r.name}</th>
                      <td className="text-right px-2 py-1" style={{ boxShadow: 'inset 0 -1px 0 var(--lo)' }}><PriceCell cell={r.all} /></td>
                      {priced.map(g => <td key={g} data-goods={g} className="text-right px-2 py-1" style={{ boxShadow: 'inset 0 -1px 0 var(--lo)' }}><PriceCell cell={r.goods[g]} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ) : null}
        {pulse.encounters.length > 0 ? (
          <Panel icon="ent-monster" color="var(--ent-monster)" title="Встречи" note="множитель к доле в таблице" part="pulse-encounters">
            {pulse.encounters.map(r => (
              <div key={r.id} className="flex flex-col gap-1" role="group" aria-label={`Встречи: ${r.name}`}>
                <span className="type-h-15 text-tx">{r.name}</span>
                {r.entries.map(e => (
                  <div key={e.key} className="grid grid-cols-[minmax(0,1fr)_120px_auto] items-center gap-2">
                    <span className="type-body-sm text-tx truncate" title={e.key}>{e.key}</span>
                    <span className="h-2 bg-hp-track shadow-bevel-in relative" aria-hidden>
                      <span className="absolute inset-y-0 left-0 bg-ent-monster" style={{ width: `${(e.weight / maxWeight) * 100}%` }} />
                    </span>
                    <span className="type-num-15 text-tx whitespace-nowrap">
                      ×{e.weight}
                      {e.pending !== undefined ? <span className="text-src-sim" title="Ждёт решения: так станет, если принять"> → ×{e.pending}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </Panel>
        ) : null}
      </div>
      <p className="type-body-xs text-t2">Отношения: {signed(-3)}…{signed(3)}. Решения — во входящих справа.</p>
    </section>
  );
}

export default PulseView;
