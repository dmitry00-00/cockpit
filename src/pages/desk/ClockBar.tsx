// Полоса мировых часов (HANDOFF §4): мини-циферблат Харптоса (щелчок — откидная панель с полным календарём), дата, погода, луна, раунд боя, вид главной зоны и
// инструменты мастера — инициатива, отдых, темп и шаг, «Игроки». На столе игроков инструментов нет (F8).
// Пропсы — те же имена, что на странице: компонент — перенос её разметки, состояние держит страница.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Dialog, Popover } from 'radix-ui';
import { calendarAdapterForState, dayPhase, harptos, inDays, partyDeitiesOf, weatherLabel, weatherOf } from '../../campaign';
import {
  CelestialBar, HarptosDial, InitiativeEditor, TimeTempo, TEMPO_ORDER, DAY_PHASE_LABELS, type InitiativeRow, type RestRow,
} from '../../components';
import { OpenEntityContext, useOpenEntity } from '../../components/openEntity';
import type { EntityRef } from '../../entities';
import type { A5eTrack, DomainEvent, InitiativeEntry, RestContext, RestHitDice, RestKind, RestLayer, State, Tempo } from '../../engine';
import { DEFAULT_SETTING_PACKAGE } from '../../packages/registry';
import { Icon } from '../../icons/Icon';
import { SemanticMark } from '../../art/SemanticMark';
import { WEATHER_ART } from '../../art/semanticBindings';
import { Astrolabe, HarptosCalendar, RestForm } from '../../lazyParts';
import { HostPanel } from '../../player/HostPanel';
import { BTN, SKY_ICON, VIEW_ICON, VIEW_LABEL, VIEW_TITLE, type DeskView } from './styles';
import './ClockBar.css';

export interface ClockBarProps {
  /** Dedicated bottom-right layout slot; keeps the dial outside the top action bar. */
  clockDock?: HTMLElement | null;
  revision?: number;
  events?: readonly DomainEvent[];
  /** Партия свёрнута в портреты: откидной календарь не заходит на неё (CLAUDE.md: оверлей не перекрывает партию). */
  railParty: boolean;
  state: State;
  encounter: State['encounter'];
  phase: ReturnType<typeof dayPhase>;
  narrow: boolean;
  weather: ReturnType<typeof weatherOf>;
  combat: boolean;
  views: readonly DeskView[];
  shownView: DeskView;
  setView: (view: DeskView) => void;
  dmView: boolean;
  initiativeOpen: boolean;
  setInitiativeOpen: (open: boolean) => void;
  initiativeRows: InitiativeRow[];
  rollTotal: (formula: string, label: string, actorId?: string, intent?: { kind: 'save'; ability: 'wis' } | { kind: 'check'; ability: 'wis'; skill: 'perception'; purpose: 'detect-danger-during-rest' }) => number;
  applyInitiative: (order: InitiativeEntry[], lairContextConfirmed?: boolean) => void;
  restOpen: boolean;
  setRestOpen: (open: boolean) => void;
  restRows: RestRow[];
  supplyAvailable: number;
  restLayer: RestLayer;
  stressEnabled?: boolean;
  onRestLayerChange: (layer: RestLayer) => void;
  restPlace?: { id: string; name: string; haven?: boolean };
  nowSec: number;
  onA5eTrackSet: (actorId: string, track: A5eTrack, level: number) => void;
  onRest: (kind: RestKind, actorIds: string[], hitDice: RestHitDice[], context: RestContext) => void;
  tempo: Tempo;
  campaignYear: number | null;
  ringYear: number | null;
  onRingYearChange: (year: number | null) => void;
  recommendedTempo: Tempo;
  stepPreparing?: boolean;
  setTempoChoice: (tempo: Tempo) => void;
  onStep: (steps: number) => void;
  onStepAtTempo: (tempo: Tempo, steps: number) => void;
  setPlayersView: (on: boolean) => void;
}

export function ClockBar({
  clockDock, revision = 0, events = [], state, encounter, phase, narrow, weather, combat, views, shownView, setView, dmView, initiativeOpen,
  setInitiativeOpen, initiativeRows, rollTotal, applyInitiative, restOpen, setRestOpen, restRows, supplyAvailable, restLayer, stressEnabled = false, onRestLayerChange, restPlace, nowSec, onA5eTrackSet, onRest,
  tempo, campaignYear, ringYear, onRingYearChange, recommendedTempo, stepPreparing, setTempoChoice, onStep, onStepAtTempo, setPlayersView,
 }: ClockBarProps) {
  const calendar = calendarAdapterForState(state);
  const isForgottenRealms = (state.settingPackageId ?? DEFAULT_SETTING_PACKAGE) === DEFAULT_SETTING_PACKAGE;
  const harptosCalendar = isForgottenRealms && calendar.id === 'harptos';
  const [timeOpen, setTimeOpen] = useState(false);
  const [timeMode, setTimeMode] = useState<'harptos' | 'astrolabe'>('harptos');
  const parentOpenEntity = useOpenEntity();
  const dateLabel = calendar.formatDate(state.time.sec);
  const closeTime = () => {
    setRestOpen(false);
    setTimeOpen(false);
  };
  const openCalendarEntity = parentOpenEntity
    ? (ref: EntityRef) => { closeTime(); parentOpenEntity(ref); }
    : null;
  const astrolabeMode = dmView && harptosCalendar && timeMode === 'astrolabe';
  const restControl = !combat ? (
    <Popover.Root open={restOpen} onOpenChange={setRestOpen}>
      <Popover.Trigger asChild><button type="button" title="Отдых: короткий — час и кости хитов, долгий — восемь часов и хиты полны" className={BTN}>Отдых</button></Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="start" sideOffset={4} collisionPadding={8} aria-label="Отдых" className="z-[60] outline-none">
          <RestForm rows={restRows} supplyAvailable={supplyAvailable} restLayer={restLayer} stressEnabled={stressEnabled} onRestLayerChange={onRestLayerChange} restPlace={restPlace} nowSec={nowSec} onA5eTrackSet={onA5eTrackSet} onRoll={rollTotal} onRest={onRest} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  ) : null;
  const timeTempoControl = (
    <>
      <TimeTempo value={tempo} recommended={recommendedTempo} availableTempos={calendar.addYears ? TEMPO_ORDER : TEMPO_ORDER.filter(t => t !== 'year')} compact onChange={setTempoChoice} onStep={steps => { closeTime(); onStep(steps); }} disabled={combat} stepDisabled={stepPreparing} />
      {stepPreparing ? <span role="status" className="type-body-xs text-t2">Готовлю шаг…</span> : null}
    </>
  );
  const tempoControls = (
    <div className="desk-time-controls flex flex-col gap-3 p-3 bg-cd shadow-bevel-in">
      {timeTempoControl}
      {restControl}
    </div>
  );
  const timeTrigger = (
    <Dialog.Trigger asChild>
      <button
        type="button"
        aria-label="Управление временем"
        title={`${dateLabel} · ${calendar.formatTime(state.time.sec)}${harptosCalendar ? ` · ${DAY_PHASE_LABELS[phase].toLowerCase()} · погода: ${weatherLabel(weather)}` : ''} · открыть календарь и время`}
        className="desk-time-trigger flex flex-none cursor-pointer focus-visible:shadow-[var(--glow-gold)]"
        data-part="dial"
      >
        {harptosCalendar ? <HarptosDial hour={harptos(state.time.sec).hour} minute={harptos(state.time.sec).minute} phase={phase} phaseLabel={DAY_PHASE_LABELS[phase].toLowerCase()} size={34} /> : null}
        <time className="type-num-12 text-gd whitespace-nowrap">{calendar.formatTime(state.time.sec)}</time>
        <span className="desk-time-trigger-date type-body-xs text-t2 truncate max-w-full">{calendar.formatCompactDate(state.time.sec)}</span>
      </button>
    </Dialog.Trigger>
  );
  return (
    <header aria-label="Панель действий стола" className="desk-clockbar desk-clockbar-compact flex-none bg-linear-to-b from-pl to-cd shadow-plate">
      <div className="desk-clock-context desk-clockbar-summary">
      <Dialog.Root open={timeOpen} onOpenChange={open => { setTimeOpen(open); if (!open) setRestOpen(false); }}>
        {clockDock ? createPortal(timeTrigger, clockDock) : timeTrigger}
        <Dialog.Portal>
          <Dialog.Overlay className="desk-time-overlay fixed inset-0 z-40 bg-[color-mix(in_srgb,var(--lo)_72%,transparent)]" />
          <Dialog.Content onEscapeKeyDown={event => event.stopPropagation()} aria-label="Управление временем" className="desk-time-dialog fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(960px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-auto bg-pn p-4 text-tx shadow-float outline-none">
            <div className="flex items-center gap-3">
              <Dialog.Title className="type-h-20 text-gd">Управление временем</Dialog.Title>
              <button type="button" aria-label="Закрыть управление временем" onClick={closeTime} className={`${BTN} ml-auto`}>Закрыть</button>
            </div>
            {dmView ? (
              <div role="group" aria-label="Инструмент времени" className="desk-time-mode flex flex-wrap gap-1">
                <button type="button" aria-pressed={timeMode === 'harptos'} onClick={() => setTimeMode('harptos')} className={`${BTN} ${timeMode === 'harptos' ? 'text-gd-hi' : ''}`}>{harptosCalendar ? 'Часы Харптоса' : 'Дата и часы'}</button>
                {harptosCalendar ? <button type="button" aria-pressed={astrolabeMode} onClick={() => setTimeMode('astrolabe')} className={`${BTN} ${astrolabeMode ? 'text-gd-hi' : ''}`}>Астролябия</button> : null}
              </div>
            ) : null}
            <div className="desk-time-dialog-context flex flex-wrap items-center gap-3 p-3 bg-cd shadow-bevel-in">
              {astrolabeMode ? null : <>
                <time className="type-num-15 text-gd">{dateLabel} · {calendar.formatTime(state.time.sec)}</time>
                {harptosCalendar ? <span data-part="phase" className="type-num-12 uppercase text-t2">{DAY_PHASE_LABELS[phase]}</span> : null}
                {calendar.moonAt ? isForgottenRealms
                  ? <CelestialBar moon={calendar.moonAt(state.time.sec).phase} next={{ label: 'Полнолуние', countdown: inDays(calendar.moonAt(state.time.sec).daysToFull) }} />
                  : <span data-part="moon" className="type-body-sm text-t2">Луна: {({ new: 'новолуние', waxing: 'растёт', full: 'полнолуние', waning: 'убывает' } as const)[calendar.moonAt(state.time.sec).phase]} · полнолуние {inDays(calendar.moonAt(state.time.sec).daysToFull)}</span>
                  : null}
              </>}
              {harptosCalendar ? <span data-part="weather" title={`Погода: ${weatherLabel(weather)}`} className="flex flex-none items-center gap-1 whitespace-nowrap type-body-sm text-t2">
                <SemanticMark asset={WEATHER_ART[weather.sky]} icon={SKY_ICON[weather.sky]} size={16} color="var(--t2)" title={weatherLabel(weather)} />
                <span>{weatherLabel(weather)} · {weather.tempC < 0 ? '−' : '+'}{Math.abs(weather.tempC)} °C</span>
              </span> : null}
              {combat ? <span className="type-num-12 uppercase text-t2" data-part="round">Раунд {encounter.round}</span> : null}
            </div>
            {astrolabeMode ? (
              <section aria-label="Астролябия мирового времени" className="desk-astrolabe-layout flex flex-wrap items-start gap-4">
                <div className="desk-astrolabe-instrument flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2 bg-cd p-2 shadow-bevel-in">
                    {campaignYear !== null && ringYear !== null ? <>
                    <label htmlFor="desk-astrolabe-year" className="type-body-sm text-t2">Год кольца и линзы</label>
                    <input
                      id="desk-astrolabe-year"
                      type="number"
                      min={1}
                      max={9999}
                      step={1}
                      inputMode="numeric"
                      aria-label="Год линзы карты и карточек"
                      value={ringYear}
                      onChange={event => {
                        const year = Number(event.target.value);
                        if (Number.isInteger(year) && year >= 1 && year <= 9999) onRingYearChange(year);
                      }}
                      className="h-8 w-24 px-2 type-num-12 text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]"
                    />
                    <span className="type-num-12 text-t2">DR</span>
                    {ringYear !== campaignYear ? (
                      <button type="button" onClick={() => onRingYearChange(campaignYear)} className={BTN} title={`Снять линзу и показать год кампании ${campaignYear} DR`}>К году кампании</button>
                    ) : null}
                    <span className="type-key text-t2">Кампания: {campaignYear}{calendar.yearSuffix ? ` ${calendar.yearSuffix}` : ''}</span>
                    </> : null}
                  </div>
                  {ringYear !== null ? <Astrolabe
                    sec={state.time.sec}
                    ringYear={ringYear}
                    tempo={tempo}
                    disabled={combat || stepPreparing}
                    partyDeities={new Set(partyDeitiesOf(state).keys())}
                    size={340}
                    onAdvance={(stepTempo, steps) => { closeTime(); onStepAtTempo(stepTempo, steps); }}
                  /> : null}
                </div>
                <div className="desk-astrolabe-controls min-w-0 flex-1">{tempoControls}</div>
              </section>
            ) : (
              <>
                {harptosCalendar ? <OpenEntityContext.Provider value={openCalendarEntity}>
                  <HarptosCalendar sec={state.time.sec} partyDeities={new Set(partyDeitiesOf(state).keys())} />
                </OpenEntityContext.Provider> : <section aria-label="Календарь сеттинга" className="p-3 bg-cd shadow-bevel-in">
                  <time className="type-num-15 text-gd">{dateLabel}</time>
                  {calendar.kind === 'counter' ? <p className="type-body-xs text-t2">В этом календаре нет года.</p> : null}
                </section>}
                {dmView ? tempoControls : null}
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <div role="group" aria-label="Главные действия и вид главной зоны" className="ml-auto flex items-center gap-1">
        {dmView ? <HostPanel state={state} revision={revision} events={events} /> : null}
        {views.map(v => (
          <button
            key={v}
            type="button"
            aria-pressed={shownView === v}
            aria-label={narrow ? VIEW_LABEL[v] : undefined}
            title={dmView ? VIEW_TITLE[v] : VIEW_LABEL[v]}
            onClick={() => setView(v)}
            className={`${BTN} ${shownView === v ? 'text-gd-hi' : ''}`}
          >
            {narrow ? <Icon name={VIEW_ICON[v]} size={16} color="currentColor" title={VIEW_LABEL[v]} /> : VIEW_LABEL[v]}
          </button>
        ))}
      </div>
      </div>
      {/* Инициатива, режим игроков и главные виды остаются доступны рядом с часами. */}
      {dmView ? (
        <div className="desk-clock-actions desk-clockbar-quick-actions">
          <Popover.Root open={initiativeOpen} onOpenChange={setInitiativeOpen}>
            <Popover.Trigger asChild>
              <button
                type="button"
                title={combat ? 'Порядок инициативы: поправить броски, вписать новичка' : 'Начать бой: броски инициативы — игроки называют, монстрам бросает стол'}
                className={BTN}
              >
                {combat ? 'Порядок' : 'Начать бой'}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content side="bottom" align="end" sideOffset={4} collisionPadding={8} aria-label="Инициатива" className="z-20 outline-none">
                <InitiativeEditor rows={initiativeRows} mode={combat ? 'set' : 'start'} onRoll={rollTotal} onApply={applyInitiative} />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <button
            type="button"
            aria-pressed={false}
            title="Глазами игроков: секреты уходят из DOM · P"
            onClick={() => setPlayersView(true)}
            className={BTN}
          >
            Игроки
          </button>
        </div>
      ) : null}
    </header>
  );
}

export default ClockBar;
