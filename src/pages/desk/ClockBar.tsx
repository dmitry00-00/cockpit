// Полоса мировых часов (HANDOFF §4): мини-циферблат Харптоса (щелчок — откидная панель с полным календарём), дата, погода, луна, раунд боя, вид главной зоны и
// инструменты мастера — инициатива, отдых, темп и шаг, «Игроки». На столе игроков инструментов нет (F8).
// Пропсы — те же имена, что на странице: компонент — перенос её разметки, состояние держит страница.
import { Popover } from 'radix-ui';
import { dayPhase, formatHarptos, harptos, inDays, moonState, weatherLabel, weatherOf } from '../../campaign';
import {
  CelestialBar, HarptosDial, InitiativeEditor, RestForm, TimeTempo, DAY_PHASE_LABELS, type InitiativeRow, type RestRow,
} from '../../components';
import type { InitiativeEntry, RestHitDice, RestKind, State, Tempo } from '../../engine';
import { Icon } from '../../icons/Icon';
import { SIZES } from '../../styles/tokens.generated';
import { HarptosCalendar } from './HarptosCalendar';
import { shortHarptos } from './helpers';
import { BTN, SKY_ICON, VIEW_ICON, VIEW_LABEL, VIEW_TITLE } from './styles';

export interface ClockBarProps {
  /** Партия свёрнута в портреты: откидной календарь не заходит на неё (CLAUDE.md: оверлей не перекрывает партию). */
  railParty: boolean;
  state: State;
  encounter: State['encounter'];
  phase: ReturnType<typeof dayPhase>;
  narrow: boolean;
  weather: ReturnType<typeof weatherOf>;
  moon: ReturnType<typeof moonState>;
  combat: boolean;
  views: readonly ('desk' | 'time' | 'journal')[];
  shownView: 'desk' | 'time' | 'journal';
  setView: (view: 'desk' | 'time' | 'journal') => void;
  dmView: boolean;
  initiativeOpen: boolean;
  setInitiativeOpen: (open: boolean) => void;
  initiativeRows: InitiativeRow[];
  rollTotal: (formula: string, label: string) => number;
  applyInitiative: (order: InitiativeEntry[]) => void;
  restOpen: boolean;
  setRestOpen: (open: boolean) => void;
  restRows: RestRow[];
  onRest: (kind: RestKind, actorIds: string[], hitDice: RestHitDice[]) => void;
  tempo: Tempo;
  setTempoChoice: (tempo: Tempo) => void;
  onStep: (steps: number) => void;
  setPlayersView: (on: boolean) => void;
}

/** Ширина панели партии из токенов — левый отступ откидного календаря. */
const px = (name: string) => parseInt(SIZES.find(t => t.name === name)?.value ?? '0', 10);

export function ClockBar({
  railParty, state, encounter, phase, narrow, weather, moon, combat, views, shownView, setView, dmView, initiativeOpen,
  setInitiativeOpen, initiativeRows, rollTotal, applyInitiative, restOpen, setRestOpen, restRows, onRest,
  tempo, setTempoChoice, onStep, setPlayersView,
 }: ClockBarProps) {
  return (
    <header aria-label="Мировые часы" className="h-bar-clock flex-none flex items-center gap-3 px-3 bg-linear-to-b from-pl to-cd shadow-plate">
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label="Календарь Харптоса"
            title={`Фаза суток: ${DAY_PHASE_LABELS[phase].toLowerCase()} · календарь Харптоса`}
            className="flex flex-none cursor-pointer focus-visible:shadow-[var(--glow-gold)]"
            data-part="dial"
          >
            <HarptosDial hour={harptos(state.time.sec).hour} minute={harptos(state.time.sec).minute} phase={phase} phaseLabel={DAY_PHASE_LABELS[phase].toLowerCase()} size={28} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="start"
            sideOffset={4}
            collisionPadding={{ top: 8, right: 8, bottom: 8, left: px(railParty ? 'rail-portraits' : 'rail-party') + 8 }}
            sticky="always"
            aria-label="Календарь Харптоса" className="z-20 w-card-overlay max-w-[calc(100vw-16px)] max-h-[calc(100vh-64px)] overflow-auto shadow-float outline-none">
            <HarptosCalendar sec={state.time.sec} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <time className="type-num-15 text-gd whitespace-nowrap" title={narrow ? `Дата и время мира: ${formatHarptos(state.time.sec)}` : 'Дата и время мира'}>{narrow ? shortHarptos(state.time.sec) : formatHarptos(state.time.sec)}</time>
      {narrow ? null : <span className="type-num-12 uppercase text-t2" data-part="phase">{DAY_PHASE_LABELS[phase]}</span>}
      <span data-part="weather" title={`Погода: ${weatherLabel(weather)}`} className="flex flex-none items-center gap-1 whitespace-nowrap type-body-sm text-t2">
        <Icon name={SKY_ICON[weather.sky]} size={16} color="var(--t2)" title={weatherLabel(weather)} />
        <span>{narrow ? `${weather.tempC < 0 ? '\u2212' : '+'}${Math.abs(weather.tempC)} °C` : weatherLabel(weather)}</span>
      </span>
      <CelestialBar moon={moon.phase} next={{ label: 'Полнолуние', countdown: inDays(moon.daysToFull) }} compact={narrow} />
      {combat ? <span className="type-num-12 uppercase text-t2" data-part="round">Раунд {encounter.round}</span> : null}
      <div role="group" aria-label="Вид главной зоны" className="ml-auto flex items-center gap-1">
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
      {/* Инструменты мастера — темп, шаг, начало боя, переключатель режима — на столе игроков отсутствуют (F8). */}
      {dmView ? (
        <>
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
          {combat ? null : (
            // Отдых — вне боя (SRD: бой прерывает отдых); в бою кнопки нет вовсе.
            <Popover.Root open={restOpen} onOpenChange={setRestOpen}>
              <Popover.Trigger asChild>
                <button type="button" title="Отдых: короткий — час и кости хитов, долгий — восемь часов и хиты полны" className={BTN}>Отдых</button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content side="bottom" align="end" sideOffset={4} collisionPadding={8} aria-label="Отдых" className="z-20 outline-none">
                  <RestForm rows={restRows} onRoll={rollTotal} onRest={onRest} />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          )}
          <TimeTempo value={tempo} onChange={setTempoChoice} onStep={onStep} disabled={combat} />
          <button
            type="button"
            aria-pressed={false}
            title="Глазами игроков: секреты уходят из DOM · P"
            onClick={() => setPlayersView(true)}
            className={BTN}
          >
            Игроки
          </button>
        </>
      ) : null}
    </header>
  );
}

export default ClockBar;
