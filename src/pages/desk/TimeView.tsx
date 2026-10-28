// Вид «Время» главной зоны (F6): фаза суток, календарь Харптоса (циферблат, месяц, год), фазы Selûne с обратным отсчётом и сводка «что изменилось» после
// шага времени — предложения этого шага с «Принять» и «Отклонить». Сводка — только мастеру. Пропсы — те же имена,
// что на странице: компонент — перенос её разметки, состояние держит страница.
import type { RefObject } from 'react';
import { NEAR_SCALES, dayPhase, inDays, moonState } from '../../campaign';
import { ChangeSummary, DayPhaseStrip, MOON_ICONS, MOON_LABELS, TEMPO_LABELS, summaryGroups } from '../../components';
import type { EngineStoreApi, ScaleLevel, State, Tempo } from '../../engine';
import { Icon } from '../../icons/Icon';
import { HarptosCalendar } from './HarptosCalendar';
import { HEAD, MOON_PHASES } from './styles';

export interface TimeViewProps {
  /** Время мира — для календаря Харптоса. */
  sec: number;
  mainRef: RefObject<HTMLElement | null>;
  dmView: boolean;
  phase: ReturnType<typeof dayPhase>;
  moon: ReturnType<typeof moonState>;
  tempo: Tempo;
  lastStep: { eventId: string; deltaIds: string[] } | null;
  stepDeltas: State['deltas'][string][];
  scaleLabel: (scale: ScaleLevel) => string;
  decide: (deltaId: string, verdict: 'accept' | 'reject') => unknown;
  api: ReturnType<EngineStoreApi['getState']>;
}

export function TimeView({ sec, mainRef, dmView, phase, moon, tempo, lastStep, stepDeltas, scaleLabel, decide, api }: TimeViewProps) {
  return (
    <section aria-label="Шаг времени" ref={mainRef} className="relative flex-1 min-w-0 min-h-0 flex flex-col gap-4 p-4 overflow-auto">
      <DayPhaseStrip value={phase} />
      <HarptosCalendar sec={sec} />
      <div className="flex flex-col bg-pn shadow-bevel">
        <div className={HEAD}>
          <Icon name="scale-system" size={16} color="var(--ent-plane)" title="Небесные тела" />
          <span>Небесные тела</span>
          <span className="type-key text-t2 normal-case">темп часов: {TEMPO_LABELS[tempo].toLowerCase()}</span>
        </div>
        {/* Планетарий (Orrery) — уровень звёздной системы, шаг 10; здесь — фазы Selûne и обратный отсчёт. */}
        <ol aria-label="Фазы Selûne" className="flex flex-col gap-1 p-3">
          {MOON_PHASES.map(ph => (
            <li key={ph} aria-current={ph === moon.phase ? 'true' : undefined} className={`flex items-center gap-2 type-body-sm ${ph === moon.phase ? 'text-tx' : 'text-t2'}`}>
              <Icon name={MOON_ICONS[ph]} size={16} color={ph === moon.phase ? 'var(--src-canon)' : 'var(--t2)'} title={MOON_LABELS[ph]} />
              <span>{MOON_LABELS[ph]}</span>
              {ph === 'full' ? <span className="type-key text-t2">{inDays(moon.daysToFull)}</span> : null}
              {ph === 'new' ? <span className="type-key text-t2">{inDays(moon.daysToNew)}</span> : null}
            </li>
          ))}
        </ol>
      </div>
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
          groups={summaryGroups(stepDeltas, scaleLabel, NEAR_SCALES).map(g => ({
            ...g,
            items: g.items.map(it => ({ ...it, onAccept: () => decide(it.id, 'accept'), onReject: () => decide(it.id, 'reject') })),
          }))}
          onAcceptAll={groupId => { for (const d of stepDeltas) if (d.scale === groupId) api.accept(d.id); }}
        />
      </div>
      ) : null}
    </section>
  );
}

export default TimeView;
