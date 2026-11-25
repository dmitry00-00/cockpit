// Вид «Время» главной зоны (F6): выбранный календарный адаптер и доступные ему фазы суток/луны, затем сводка
// предложений после шага времени с «Принять» и «Отклонить». Харптос и Selûne показаны только в пакете FR.
// Сводка — только мастеру; компонент получает состояние и колбэки пропсами.
import type { RefObject } from 'react';
import { NEAR_SCALES, inDays } from '../../campaign';
import type { CalendarAdapter } from '../../campaign/calendar';
import { ChangeSummary, DayPhaseStrip, MOON_ICONS, MOON_LABELS, TEMPO_LABELS, inSummaryGroup, summaryGroups, type DayPhase } from '../../components';
import { worldDeltaFreshness, type EngineStoreApi, type ScaleLevel, type State, type Tempo } from '../../engine';
import { Icon } from '../../icons/Icon';
import { SemanticMark } from '../../art/SemanticMark';
import { MOON_ART } from '../../art/semanticBindings';
import { HarptosCalendar } from '../../lazyParts';
import { HEAD, MOON_PHASES } from './styles';
import { DowntimePlanner } from './DowntimePlanner';
import type { A5eDowntimeActivityRecord, A5eDowntimePeriod } from '../../rules/a5e/downtime';
import { partyPlaceId } from '../../engine';
import type { SkillId } from '../../rules/srd/abilities';
import { sheetViewOf } from '../../campaign/sheetView';
import { stateIds, stateView } from '../../entities/state';
import { isCoinId } from '../../rules/srd/coins';
import { ref } from '../../entities/ref';
import { abilityMod } from '../../campaign/derive';

export interface TimeViewProps {
  /** Время мира и адаптер выбранного календаря. */
  sec: number;
  calendar: CalendarAdapter;
  isForgottenRealms: boolean;
  /** Боги с листов партии — святые дни в календаре (E8). */
  partyDeities?: ReadonlySet<string>;
  mainRef: RefObject<HTMLElement | null>;
  dmView: boolean;
  tempo: Tempo;
  lastStep: { eventId: string; deltaIds: string[] } | null;
  stepDeltas: State['deltas'][string][];
  scaleLabel: (scale: ScaleLevel) => string;
  decide: (deltaId: string, verdict: 'accept' | 'reject') => unknown;
  api: ReturnType<EngineStoreApi['getState']>;
  /** «Перейти к этому дню» из календаря — только мастеру. */
  onGoTo?: (daySec: number) => void;
  onDowntime?: (period: A5eDowntimePeriod, records: readonly A5eDowntimeActivityRecord[]) => void;
  onRollDowntime?: (actorId: string, skill: SkillId, modifier: number, dc: number, disadvantage?: boolean, forceHidden?: boolean) => { die: number; total: number };
  onRollDowntimeEarnings?: (actorId: string, formula: string, label: string) => { dice: readonly number[]; total: number };
  onSpendFavor?: (payload: { actorId: string; deityRef: import('../../entities/ref').EntityRef; deityName: string; amount: 1 | 2; boon: string }) => void;
}

const PHASES = new Set<DayPhase>(['morning', 'day', 'evening', 'night']);
const GENERIC_MOON_LABELS = { new: 'Новолуние', waxing: 'Растущая', full: 'Полнолуние', waning: 'Убывающая' } as const;

export function TimeView({ sec, calendar, isForgottenRealms, partyDeities, mainRef, dmView, tempo, lastStep, stepDeltas, scaleLabel, decide, api, onGoTo, onDowntime, onRollDowntime, onRollDowntimeEarnings, onSpendFavor }: TimeViewProps) {
  const phaseId = calendar.dayPhaseAt?.(sec);
  const phase = phaseId && PHASES.has(phaseId as DayPhase) ? phaseId as DayPhase : undefined;
  const moon = calendar.moonAt?.(sec);
  const currentPlaceId = partyPlaceId(api.state);
  const inHaven = !!(currentPlaceId && api.state.world.locations[currentPlaceId]?.haven);
  const downtimeParticipants = api.state.party.map(id => api.state.actors[id]).filter(actor => actor && !actor.removed).map(actor => ({
    id: actor.id,
    name: actor.name,
    strife: actor.a5eConditions?.strife ?? 0,
    keyKnowledge: actor.a5eKeyKnowledge,
    favor: actor.a5eFavor,
    workDisadvantageSkills: actor.a5eWorkDisadvantageSkills,
    deity: actor.sheet?.deity ? { ref: ref('deity', actor.sheet.deity.id), name: actor.sheet.deity.name } : undefined,
    intelligenceModifier: actor.sheet ? abilityMod(actor.sheet.abilities.int) : undefined,
    trainedLanguages: actor.sheet?.trainedLanguages,
    mods: Object.fromEntries((sheetViewOf(actor)?.skills ?? []).map(skill => [skill.id, skill.mod])),
    relaxation: !api.state.a5eStrifeEnabled || !inHaven ? 'unavailable' as const
      : (actor.a5eDowntimeRelaxUntilSec ?? 0) > sec ? 'period-used' as const : 'available' as const,
    coinStacks: Object.values(api.state.inventory ?? {})
      .filter(stack => stack.owner.kind === 'actor' && stack.owner.id === actor.id && stack.storage.kind === 'actor' && stack.storage.id === actor.id && isCoinId(stack.itemId))
      .map(stack => ({ stackId: stack.id, itemId: stack.itemId, qty: stack.qty })),
  }));
  const knowledgeTargets = (['actor', 'location', 'faction', 'thread'] as const)
    .flatMap(kind => stateIds(api.state, kind).map(id => stateView(api.state, kind, id)))
    .filter((view): view is NonNullable<typeof view> => !!view)
    .map(view => ({ ref: view.ref, name: view.name }));
  const changeGroups = summaryGroups(stepDeltas, scaleLabel, NEAR_SCALES).map(group => {
    const deltas = stepDeltas.filter(delta => inSummaryGroup(delta, group.id));
    const freshness = new Map(deltas.map(delta => [delta.id, worldDeltaFreshness(api.state, delta)]));
    const staleCount = [...freshness.values()].filter(result => !result.current).length;
    return {
      ...group,
      ...(staleCount ? { staleCount } : {}),
      items: group.items.map(item => {
        const status = freshness.get(item.id);
        const staleReason = status && !status.current ? status.message : undefined;
        return {
          ...item,
          ...(staleReason ? { staleReason } : {}),
          onAccept: staleReason ? undefined : () => decide(item.id, 'accept'),
          onReject: () => decide(item.id, 'reject'),
        };
      }),
    };
  });
  return (
    <section aria-label="Шаг времени" ref={mainRef} className="relative flex-1 min-w-0 min-h-0 flex flex-col gap-4 p-4 overflow-auto">
      {phase ? <DayPhaseStrip value={phase} /> : null}
      {isForgottenRealms && calendar.id === 'harptos'
        ? <HarptosCalendar sec={sec} partyDeities={partyDeities} {...(onGoTo ? { onGoTo } : {})} />
        : <section aria-label="Календарь" className="flex flex-col gap-2 bg-pn p-3 shadow-bevel">
          <div className={HEAD}><Icon name="scale-system" size={16} color="var(--t2)" title="Календарь кампании" /><span>Календарь кампании</span></div>
          <p className="type-body-sm text-tx">{calendar.formatDate(sec)}</p>
          {calendar.seasonLabelAt ? <p className="type-body-sm text-t2">Сезон · {calendar.seasonLabelAt(sec)}</p> : null}
        </section>}
      {moon ? <div className="flex flex-col bg-pn shadow-bevel">
        <div className={HEAD}>
          <Icon name="scale-system" size={16} color="var(--ent-plane)" title="Небесные тела" />
          <span>{isForgottenRealms ? 'Небесные тела' : 'Луна'}</span>
          <span className="type-key text-t2 normal-case">темп часов: {TEMPO_LABELS[tempo].toLowerCase()}</span>
        </div>
        <ol aria-label={isForgottenRealms ? 'Фазы Selûne' : 'Фазы луны'} className="flex flex-col gap-1 p-3">
          {MOON_PHASES.map(ph => {
            const label = isForgottenRealms ? MOON_LABELS[ph] : GENERIC_MOON_LABELS[ph];
            return <li key={ph} aria-current={ph === moon.phase ? 'true' : undefined} className={`flex items-center gap-2 type-body-sm ${ph === moon.phase ? 'text-tx' : 'text-t2'}`}>
              <SemanticMark asset={MOON_ART[ph]} icon={MOON_ICONS[ph]} size={16} color={ph === moon.phase ? 'var(--src-canon)' : 'var(--t2)'} title={label} />
              <span>{label}</span>
              {ph === 'full' ? <span className="type-key text-t2">{inDays(moon.daysToFull)}</span> : null}
              {ph === 'new' ? <span className="type-key text-t2">{inDays(moon.daysToNew)}</span> : null}
            </li>;
          })}
        </ol>
      </div> : null}
      {dmView ? (
      <DowntimePlanner key={downtimeParticipants.map(actor => actor.id).join('|')} participants={downtimeParticipants} targets={knowledgeTargets} projects={Object.values(api.state.a5eDowntimeProjects ?? {})} onApply={(period, records) => onDowntime?.(period, records)} onRoll={onRollDowntime} onRollEarnings={onRollDowntimeEarnings} onSpendFavor={onSpendFavor} />
      ) : null}
      {dmView ? (
      <div className="flex flex-col bg-pn shadow-bevel">
        <div className={HEAD}>
          <Icon name="pulse" size={16} color="var(--src-sim)" title="Что изменилось" />
          <span>Что изменилось</span>
          {lastStep ? <span className="type-key text-t2 normal-case">после шага · ждут решения: {stepDeltas.length}</span> : null}
        </div>
        <ChangeSummary
          className="p-3"
          emptyText={lastStep ? 'Всё решено — предложения этого шага разобраны.' : 'Сводка появится после шага времени: выбери темп в полосе часов и нажми «Шаг» (или T).'}
          groups={changeGroups}
          onAcceptAll={groupId => { for (const d of stepDeltas) if (inSummaryGroup(d, groupId)) api.accept(d.id); }}
        />
      </div>
      ) : null}
    </section>
  );
}

export default TimeView;
