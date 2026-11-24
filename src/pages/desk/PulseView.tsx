// Вид «Пульс мира» главной зоны (F5, Q8): что происходит без партии. Календарь на три десятидневки, фракции и их
// отношения, боги партии, индексы цен поселений, веса встреч. Только мастеру: на столе игроков вида нет. «Требует
// решения» — входящие правой колонки, здесь не повторяются (факт живёт в одном месте); ждущее значение стоит рядом
// с нынешним бирюзой симуляции. Данные — проекция pulseOf(state), сам вид ничего не меняет. Напряжения (Д3, 7.2) —
// по весу; по умолчанию — кампании (место кампании или сторона — её фракция), «весь мир» — переключателем вида.
import { useState, type ReactNode, type RefObject } from 'react';
import {
  calendarAdapterForState, PULSE_DAYS, TENDAY, eraOf, harptos, holyList, inDays, nextHolyDay, pricedGoods, pulseOf, tensionThreadState,
  type PulseEventKind, type PulsePriceCell, type Tension,
} from '../../campaign';
import { cosmicFieldsAt } from '../../campaign/cosmic';
import { partyLocationId } from '../../campaign/processes';
import { FactionGraph, FactionOrrery, GOODS_LABEL, MOON_ICONS, ProgressMeter, TensionList, signed } from '../../components';
import { SECONDS_PER_DAY, type Process, type State } from '../../engine';
import { ref, type EntityRef } from '../../entities';
import { Icon } from '../../icons/Icon';
import type { IconName } from '../../icons/icons.generated';
import { HEAD } from './styles';
import type { PreparedSimulation } from '../../campaign/prepareSimulation';
import { CaravanPlanner, type CaravanOrder } from './CaravanPlanner';
import { WarPlanner } from './WarPlanner';
import { UrbanPlanner, type UrbanPlannerSimulation } from './UrbanPlanner';
import { CosmicPlanner } from './CosmicPlanner';
import { RumorPlanner, type RumorOrder } from './RumorPlanner';
import type { WarOrder, WarOutcome, WarSettlementTerritoryTerms } from '../../campaign/war';
import type { CosmicRequestInput } from '../../campaign/cosmic';
import type { PreparedCosmicSimulation } from '../../campaign/prepareCosmic';
import { DEFAULT_SETTING_PACKAGE } from '../../packages/registry';

const EVENT_ICON: Readonly<Record<PulseEventKind, IconName>> = {
  festival: 'ent-event', 'moon-full': MOON_ICONS.full, 'moon-new': MOON_ICONS.new, holy: 'ent-deity', season: 'tempo', thread: 'threads',
};
const EVENT_TITLE: Readonly<Record<PulseEventKind, string>> = {
  festival: 'Праздник Харптоса', 'moon-full': 'Selûne', 'moon-new': 'Selûne', holy: 'Святой день бога партии', season: 'Сезон', thread: 'Часы нити: следующий тик будет предложен мастеру',
};

const eventTitle = (kind: PulseEventKind, isForgottenRealms: boolean): string => {
  if (kind === 'festival') return isForgottenRealms ? 'Праздник Харптоса' : 'Праздник';
  if (kind === 'moon-full' || kind === 'moon-new') return isForgottenRealms ? 'Selûne' : (kind === 'moon-full' ? 'Полнолуние' : 'Новолуние');
  return EVENT_TITLE[kind];
};

const PROCESS_LABEL: Readonly<Record<string, string>> = {
  caravan: 'Караван', 'trade-line': 'Торговая линия', war: 'Война держав', siege: 'Осада', blockade: 'Блокада',
  famine: 'Голод', epidemic: 'Эпидемия', revolt: 'Восстание', cosmic: 'Космический процесс', rumor: 'Слух',
};
const PROCESS_STAGE_LABEL: Readonly<Record<string, string>> = {
  transit: 'в пути', blocked: 'маршрут перекрыт', arrived: 'прибыл', lost: 'потерян', scheduled: 'по расписанию',
  mobilization: 'мобилизация', campaign: 'кампания', protracted: 'затяжная война', peace: 'мир', capitulation: 'капитуляция',
  active: 'действует', shortage: 'нехватка', outbreak: 'вспышка', incubation: 'инкубация', infectious: 'заражение',
  unrest: 'волнения', revolt: 'восстание', siege: 'осада', ongoing: 'идёт', observing: 'наблюдение', completed: 'завершён',
  travel: 'в пути', stopped: 'остановлена', stabilized: 'стабилизирован', relieved: 'прекратился', exhausted: 'исчерпан',
  lifted: 'снят', ended: 'завершена', invalid: 'ошибка данных',
};
const COSMIC_SCALE_LABEL: Readonly<Record<string, string>> = { cosmology: 'космология', plane: 'план', system: 'система', planet: 'планета' };

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
  /** Graph preparation and preview never dispatch campaign events. */
  onPrepareCaravans?: () => Promise<PreparedSimulation | null>;
  onSendCaravan?: (order: CaravanOrder) => Promise<string>;
  onEndTradeLine?: (processId: string) => Promise<string>;
  onPrepareRumors?: () => Promise<PreparedSimulation | null>;
  onSendRumor?: (order: RumorOrder) => Promise<string>;
  onPrepareWar?: () => Promise<PreparedSimulation | null>;
  onProposeWar?: (order: WarOrder) => Promise<string>;
  onProposeWarBlockade?: (warProcessId: string, locationId: string) => Promise<string>;
  onProposeWarSiege?: (warProcessId: string, locationId: string) => Promise<string>;
  onProposeWarSettlement?: (warProcessId: string, outcome: WarOutcome, territoryTerms?: WarSettlementTerritoryTerms) => Promise<string>;
  onProposeWarTerritoryControl?: (warProcessId: string, placeId: string, controllerId: string | null) => Promise<string>;
  onPrepareUrban?: () => Promise<UrbanPlannerSimulation | null>;
  onProposeFamine?: (locationId: string, initialOrder?: number) => Promise<string>;
  onProposeEpidemic?: (locationId: string, initialCases: number, r0: number) => Promise<string>;
  onProposeCityFaction?: (locationId: string) => Promise<string>;
  onProposeBlockade?: (locationId: string) => Promise<string>;
  onEndBlockade?: (processId: string) => Promise<string>;
  onProposeFactionRelation?: (a: string, b: string, value: number) => Promise<string>;
  onPrepareCosmic?: () => Promise<PreparedCosmicSimulation | null>;
  onProposeCosmic?: (input: Omit<CosmicRequestInput, 'timeEventId'>) => Promise<string>;
  /** Share or hide a process clock through the ordinary pending world-delta path. */
  onProcessClockVisibility?: (process: Process, visible: boolean, label: string) => void;
  /** Ветки «что если» (Д4) — панель страницы: сторы веток живут на ней, вид их только показывает. */
  branches?: ReactNode;
}

const SCOPE_BTN = 'type-num-12 uppercase px-2 py-0.5 bg-cd shadow-bevel text-t2 cursor-pointer aria-pressed:text-gd-hi aria-pressed:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)]';

/** Напряжение кампании: стоит в её месте или одна из сторон — её фракция. */
const ofCampaign = (t: Tension) => t.locationId !== undefined || t.sides.some(s => s.ref.startsWith('faction:'));

export function PulseView({ state, mainRef, onOpenEntity, tensions, onThread, onPrepareCaravans, onSendCaravan, onEndTradeLine, onPrepareRumors, onSendRumor, onPrepareWar, onProposeWar, onProposeWarBlockade, onProposeWarSiege, onProposeWarSettlement, onProposeWarTerritoryControl, onPrepareUrban, onProposeFamine, onProposeEpidemic, onProposeCityFaction, onProposeBlockade, onEndBlockade, onProposeFactionRelation, onPrepareCosmic, onProposeCosmic, onProcessClockVisibility, branches }: PulseViewProps) {
  const [world, setWorld] = useState(false);
  const [factionView, setFactionView] = useState<'network' | 'orrery'>('network');
  const [processClockLabels, setProcessClockLabels] = useState<Record<string, string>>({});
  const [processClockVisibility, setProcessClockVisibility] = useState<Record<string, boolean>>({});
  const pulse = pulseOf(state);
  const partyPlace = partyLocationId(state);
  const isForgottenRealms = (state.settingPackageId ?? DEFAULT_SETTING_PACKAGE) === DEFAULT_SETTING_PACKAGE;
  const cosmicContext = partyPlace ? cosmicFieldsAt(state, partyPlace) : [];
  const calendar = calendarAdapterForState(state);
  const priced = pricedGoods(pulse.prices);
  const shownTensions = tensions ? (world ? tensions : tensions.filter(ofCampaign)) : null;
  const today = Math.floor(state.time.sec / SECONDS_PER_DAY) * SECONDS_PER_DAY;
  const year = calendar.yearAt(today);
  const era = isForgottenRealms && year !== null ? eraOf(year) : undefined;
  const dayLabel = (sec: number) => calendar.formatCompactDate(sec);
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
                    <Icon name={EVENT_ICON[e.kind]} size={16} color={e.kind === 'thread' ? 'var(--src-sim)' : e.kind === 'holy' ? 'var(--ent-deity)' : 'var(--t2)'} title={eventTitle(e.kind, isForgottenRealms)} className="mt-0.5 flex-none" />
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

      {Object.values(state.world.processes ?? {}).some(process => !process.ended) ? (
        <Panel icon="pulse" color="var(--src-sim)" title="Процессы мира" note="исходы ждут решения" part="pulse-processes">
          <ul aria-label="Активные процессы" className="flex flex-col gap-2">
            {Object.values(state.world.processes ?? {}).filter(process => !process.ended).sort((a, b) => a.nextSec - b.nextSec || a.id.localeCompare(b.id)).map(process => {
              const visible = processClockVisibility[process.id] ?? !!process.clock?.playerVisible;
              const label = (processClockLabels[process.id] ?? process.clock?.playerLabel ?? '').trim();
              const visibilityPending = Object.values(state.deltas).some(delta => delta.status === 'pending' && delta.subject === `Часы процесса · ${process.name}`);
              return (
              <li key={process.id} className="flex flex-col gap-1 bg-cd shadow-bevel px-2 py-1.5" data-process={process.id}>
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="type-h-15 text-tx truncate" title={process.name}>{process.name}</span>
                  <span className="ml-auto type-key text-t2 shrink-0">{PROCESS_LABEL[process.kind] ?? process.kind} · {PROCESS_STAGE_LABEL[process.stage] ?? process.stage}</span>
                </div>
                {process.clock ? <ProgressMeter value={process.clock} label={`Часы процесса ${process.name}`} /> : null}
                <span className="type-body-xs text-t2">Следующий такт: {calendar.formatDate(process.nextSec)} · предложение ещё не определено</span>
                {process.clock && onProcessClockVisibility ? (
                  <details className="mt-1 px-2 py-1 bg-pl type-body-xs text-t2">
                    <summary className="cursor-pointer">Открыть часы игрокам</summary>
                    <form className="mt-1 flex flex-wrap items-end gap-1" onSubmit={event => {
                      event.preventDefault();
                      const submittedLabel = (processClockLabels[process.id] ?? process.clock?.playerLabel ?? '').trim();
                      if (visible && !submittedLabel) return;
                      onProcessClockVisibility(process, visible, submittedLabel);
                    }}>
                      <label className="flex items-center gap-1">
                        <span>Подпись игрокам</span>
                        <input aria-label={`Подпись часов для игроков ${process.name}`} maxLength={120}
                          value={processClockLabels[process.id] ?? process.clock?.playerLabel ?? ''}
                          onChange={event => setProcessClockLabels(values => ({ ...values, [process.id]: event.target.value }))}
                          className="min-w-32 px-1 bg-cd text-tx" />
                      </label>
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={processClockVisibility[process.id] ?? !!process.clock?.playerVisible}
                          onChange={event => setProcessClockVisibility(values => ({ ...values, [process.id]: event.target.checked }))} />
                        <span>Показывать счётчик</span>
                      </label>
                      <button type="submit" className={SCOPE_BTN} disabled={visibilityPending || (visible && !label)}>
                        {visibilityPending ? 'Сначала решите входящее' : 'Предложить изменение'}
                      </button>
                    </form>
                    <p className="mt-1">Игроки увидят только выбранную подпись и деления: без названия стадии, маршрута и даты такта.</p>
                  </details>
                ) : null}
              </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      {isForgottenRealms && onSendCaravan && onPrepareCaravans ? (
        <Panel icon="pin-shop" color="var(--src-sim)" title="Торговля между городами" note="правило стола" part="pulse-caravan">
          <CaravanPlanner prepare={onPrepareCaravans} propose={onSendCaravan} endLine={onEndTradeLine} world={state.world} />
        </Panel>
      ) : null}

      {onPrepareRumors && onSendRumor ? (
        <Panel icon="threads" color="var(--src-sim)" title="Слухи" note="скорость — правило стола" part="pulse-rumors">
          <RumorPlanner prepare={onPrepareRumors} propose={onSendRumor} />
        </Panel>
      ) : null}

      {isForgottenRealms && onPrepareWar && onProposeWar && onProposeWarBlockade && onProposeWarSiege ? (
        <Panel icon="ent-faction" color="var(--src-sim)" title="Войны держав" note="правило стола" part="pulse-wars">
          <WarPlanner year={harptos(today).year} world={state.world} prepare={onPrepareWar} propose={onProposeWar} proposeBlockade={onProposeWarBlockade} proposeSiege={onProposeWarSiege} proposeSettlement={onProposeWarSettlement} proposeTerritoryControl={onProposeWarTerritoryControl} />
        </Panel>
      ) : null}

      {isForgottenRealms && onPrepareUrban && onProposeFamine && onProposeEpidemic && onProposeCityFaction && onProposeBlockade && onEndBlockade && onProposeFactionRelation ? (
        <Panel icon="ent-faction" color="var(--src-sim)" title="Города и внутренние процессы" note="С5 · правило стола" part="pulse-urban">
          <UrbanPlanner world={state.world} year={harptos(today).year} prepare={onPrepareUrban} famine={onProposeFamine} epidemic={onProposeEpidemic}
            cityFaction={onProposeCityFaction} blockade={onProposeBlockade} endBlockade={onEndBlockade} relation={onProposeFactionRelation} />
        </Panel>
      ) : null}

      {isForgottenRealms && cosmicContext.length ? (
        <Panel icon="scale-plane" color="var(--ent-plane)" title="Космическое поле места партии" note="наследуется по лестнице" part="pulse-cosmic-context">
          <ul className="flex flex-col gap-1">
            {cosmicContext.map(field => (
              <li key={field.processId} className="flex flex-col gap-1 bg-cd shadow-bevel px-2 py-1.5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <strong className="type-body-sm text-tx">{field.label} · {field.targetName}</strong>
                  <span className="type-key text-t2">{COSMIC_SCALE_LABEL[field.targetScale]} · {field.distance ? `унаследовано через ${field.distance} ступ.` : 'задано здесь'}</span>
                </div>
                <p className="type-body-sm text-t2">{field.text}</p>
                {field.sourceRefs.length ? <span className="type-body-xs text-t2">Ссылки цели: {field.sourceRefs.join('; ')}</span> : null}
              </li>
            ))}
          </ul>
          <p className="type-body-xs text-t2">Поле даёт контекст места; числовые эффекты и последствия определяет мастер.</p>
        </Panel>
      ) : null}

      {isForgottenRealms && onPrepareCosmic && onProposeCosmic ? (
        <Panel icon="scale-plane" color="var(--ent-plane)" title="Космические и планетарные процессы" note="С6 · правило стола" part="pulse-cosmic">
          <CosmicPlanner state={state} prepare={onPrepareCosmic} propose={onProposeCosmic} />
        </Panel>
      ) : null}

      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 items-start">
        <Panel icon="ent-faction" color="var(--ent-faction)" title="Фракции и отношения" part="pulse-factions">
          <div role="group" aria-label="Представление фракций" className="flex gap-1">
            <button type="button" aria-pressed={factionView === 'network'} onClick={() => setFactionView('network')} className={`${SCOPE_BTN} ${factionView === 'network' ? 'text-gd-hi' : ''}`}>Связи</button>
            <button type="button" aria-pressed={factionView === 'orrery'} onClick={() => setFactionView('orrery')} className={`${SCOPE_BTN} ${factionView === 'orrery' ? 'text-gd-hi' : ''}`}>Орерий</button>
          </div>
          {factionView === 'orrery' ? (
            <>
              <FactionOrrery factions={pulse.factions} edges={pulse.edges} gods={pulse.gods}
                onOpenFaction={id => onOpenEntity(ref('faction', id))} onOpenDeity={id => onOpenEntity(ref('deity', id))} />
              <p className="type-body-xs text-t2">Радиус тела фракции показывает влияние из модели мира (0–100%); размер не задаёт игровую силу. Орбиты — схема связей, не географический масштаб.</p>
            </>
          ) : (
            <>
              <FactionGraph factions={pulse.factions} edges={pulse.edges} onOpen={id => onOpenEntity(ref('faction', id))} />
              <ul aria-label="Обозначения" className="flex flex-wrap gap-x-4 gap-y-1 type-body-xs text-t2">
                <li className="flex items-center gap-1"><svg width="28" height="8" aria-hidden><line x1="0" y1="4" x2="28" y2="4" stroke="var(--fx-heal-hi)" strokeWidth="2.5" /></svg>союз</li>
                <li className="flex items-center gap-1"><svg width="28" height="8" aria-hidden><line x1="0" y1="4" x2="28" y2="4" stroke="var(--fx-debuff-hi)" strokeWidth="2" strokeDasharray="7 5" /></svg>соперничество</li>
                <li className="flex items-center gap-1"><svg width="28" height="8" aria-hidden><line x1="0" y1="2" x2="28" y2="2" stroke="var(--fx-damage-hi)" strokeWidth="1.5" /><line x1="0" y1="6" x2="28" y2="6" stroke="var(--fx-damage-hi)" strokeWidth="1.5" /></svg>вражда</li>
                <li className="text-src-sim">→ бирюзой — ждёт решения</li>
              </ul>
            </>
          )}
        </Panel>
        {pulse.gods.length > 0 ? (
          <Panel icon="ent-deity" color="var(--ent-deity)" title="Пантеон партии" note={era ? `отношения по эпохе ${era}` : undefined} part="pulse-gods">
            <ul aria-label="Граф отношений богов партии" className="flex flex-col gap-2">
              {pulse.gods.map(g => {
                const next = era ? nextHolyDay(state.time.sec, era, new Set([g.id])) : undefined;
                return (
                  <li key={g.id} className="flex flex-col gap-0.5 bg-cd shadow-bevel px-2 py-1.5">
                    <button type="button" onClick={() => onOpenEntity(ref('deity', g.id))} title={`Карточка бога: ${g.name}`} className="self-start type-h-15 text-tx hover:text-gd-hi underline decoration-t2 underline-offset-2 cursor-pointer">{g.name}</button>
                    <span className="type-body-sm text-t2">молятся: {g.worshippers.join(', ')}</span>
                    {g.relations.length ? (
                      <ul aria-label={`Связи бога ${g.name}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
                        {g.relations.map((relation, i) => (
                          <li key={`${relation.kind}:${relation.id}:${i}`} className="inline-flex items-center gap-1 type-body-sm">
                            <span className="text-t2" aria-label={relation.kind === 'serves' ? 'служит' : relation.kind === 'served-by' ? 'ему служит' : 'аспект'}>
                              {relation.kind === 'serves' ? 'служит →' : relation.kind === 'served-by' ? '← служит' : 'аспект ↔'}
                            </span>
                            <button type="button" onClick={() => onOpenEntity(ref('deity', relation.id))} title={`Карточка бога: ${relation.name}`} className="text-tx hover:text-gd-hi underline decoration-t2 underline-offset-2 cursor-pointer">{relation.name}</button>
                          </li>
                        ))}
                      </ul>
                    ) : <span className="type-body-sm text-t2">связи в справочнике не указаны</span>}
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
