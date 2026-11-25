import { useEffect, useMemo, useState } from 'react';
import { adventureOutcomeDelta } from '../campaign/adventureSession';
import { adventureFactRecordId, parseAdventureBundle, type AdventureNode } from '../packages/adventure';
import { adventureSceneRunSheet } from '../packages/adventureRunSheet';
import type { State, WorldDelta, WorldPatch } from '../engine/state';
import { campaignPlanScope } from '../campaign/planScope';
import { emitFeedback } from '../feedback/feedback';
import {
  sessionScoreStorageKey, validateSessionScoreDraft,
  type SessionScoreDraft,
} from './sessionScore';
import {
  newSessionRunProgress, sessionRunStorageKey, setRunCurrentBeat, toggleRunBeatViewed,
  validateSessionRunProgress, type SessionRunProgress,
} from './sessionRun';

const BTN = 'cursor-pointer text-gd underline underline-offset-2 focus-visible:outline focus-visible:outline-1 focus-visible:outline-gd disabled:opacity-40 disabled:cursor-not-allowed';
const FIELD = 'min-w-0 bg-wl px-2 py-1 type-body-sm text-tx shadow-bevel-in';
const KIND_LABEL: Record<AdventureNode['kind'], string> = {
  location: 'Место', route: 'Маршрут', npc: 'NPC', creature: 'Противник', scene: 'Сцена', thread: 'Нить',
  fact: 'Сведение', plan: 'План', handout: 'Раздатка', proposal: 'Исход', item: 'Предмет / реквизит',
};

function patchList(patch: WorldPatch | undefined): WorldPatch[] {
  return patch?.kind === 'batch' ? patch.patches.flatMap(child => patchList(child)) : patch ? [patch] : [];
}

function firstBeatForScene(score: SessionScoreDraft, sceneId: string, afterIndex: number): string | undefined {
  return score.beats.slice(afterIndex + 1).find(beat => beat.sceneId === sceneId)?.id
    ?? score.beats.find(beat => beat.sceneId === sceneId)?.id;
}

export interface SessionScoreRunnerProps {
  state: State;
  onRevealFact: (factId: string) => void;
  onPropose: (delta: WorldDelta) => void;
}

export function SessionScoreRunner({ state, onRevealFact, onPropose }: SessionScoreRunnerProps) {
  const [scope] = useState(() => campaignPlanScope());
  const sessions = useMemo(() => Object.values(state.world.adventureSessions ?? {})
    .filter(session => session.status === 'active')
    .sort((a, b) => a.title.localeCompare(b.title)), [state.world.adventureSessions]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const session = sessions.find(item => item.id === selectedSessionId) ?? sessions[0];
  const [score, setScore] = useState<SessionScoreDraft | null>(null);
  const [progress, setProgress] = useState<SessionRunProgress | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [status, setStatus] = useState('');
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const runKey = session ? sessionRunStorageKey(scope, session.id) : '';

  useEffect(() => {
    setScore(null);
    setProgress(null);
    setLoadError('');
    setActionError('');
    setStatus('');
    if (!session) return;
    try {
      const bundle = parseAdventureBundle(session.graph);
      const rawScore = localStorage.getItem(sessionScoreStorageKey(scope, session.id));
      if (!rawScore) throw new Error('Для этой сессии ещё нет сохранённой партитуры.');
      const loadedScore = validateSessionScoreDraft(JSON.parse(rawScore), bundle, scope);
      if (loadedScore.status !== 'ready') throw new Error('Партитура ещё не подтверждена к ведению.');
      if (loadedScore.campaign.settingPackageId !== session.settingPackageId) throw new Error('Сеттинг черновика не совпадает с активной сессией.');
      if (JSON.stringify([...loadedScore.campaign.partyActorIds].sort()) !== JSON.stringify([...session.partyIds].sort())) throw new Error('Состав партии в черновике не совпадает с активной сессией.');
      if (loadedScore.packagePins.some(pin => !pin.version)) throw new Error('Не все версии сеттинга и правил закреплены в партитуре.');
      setScore(loadedScore);
      const storedProgress = localStorage.getItem(sessionRunStorageKey(scope, session.id));
      setProgress(storedProgress
        ? validateSessionRunProgress(JSON.parse(storedProgress), loadedScore, session)
        : newSessionRunProgress(loadedScore, session));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, [scope, session?.id, session?.graph.version]);

  const currentBeatIndex = score && progress ? score.beats.findIndex(beat => beat.id === progress.currentBeatId) : -1;
  const currentBeat = currentBeatIndex >= 0 ? score?.beats[currentBeatIndex] : undefined;
  const bundle = session ? session.graph : undefined;
  const scene = bundle && currentBeat ? bundle.nodes.find(node => node.kind === 'scene' && node.id === currentBeat.sceneId) : undefined;
  const runSheet = bundle && currentBeat ? adventureSceneRunSheet(bundle, currentBeat.sceneId) : undefined;
  const materialNodes = runSheet ? [
    ...runSheet.places, ...runSheet.plans, ...runSheet.participants, ...runSheet.facts, ...runSheet.items,
    ...runSheet.threads, ...runSheet.proposals,
  ] : [];
  const selectedMaterial = materialNodes.find(node => node.id === selectedMaterialId);
  const sourceById = new Map(bundle?.sources.map(source => [source.id, source]) ?? []);
  const pendingOutcomeIds = session ? Object.values(state.deltas).filter(delta => delta.status === 'pending')
    .flatMap(delta => patchList(delta.patch))
    .filter((patch): patch is Extract<WorldPatch, { kind: 'adventureSession' }> => patch.kind === 'adventureSession' && patch.session.id === session.id)
    .flatMap(patch => patch.session.resolvedProposalIds ?? []) : [];
  const activePartyNames = session?.partyIds.map(id => state.actors[id]?.name ?? id) ?? [];
  const totalMinutes = score?.beats.reduce((sum, beat) => sum + (beat.expectedMinutes ?? 0), 0) ?? 0;
  const unestimated = score?.beats.filter(beat => beat.expectedMinutes === null).length ?? 0;

  const saveProgress = (next: SessionRunProgress, message: string) => {
    setProgress(next);
    setActionError('');
    setStatus(message);
    try {
      localStorage.setItem(runKey, JSON.stringify(next));
    } catch {
      setLoadError('Хранилище браузера недоступно: указатель сцены действует только до закрытия панели.');
    }
  };
  const goToBeat = (beatId: string) => {
    if (!score || !progress) return;
    try {
      const next = setRunCurrentBeat(progress, score, beatId);
      saveProgress(next, 'Переход изменил только локальный указатель. Журнал кампании не менялся.');
      setSelectedMaterialId('');
      emitFeedback('confirm', 'master');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };
  const resetProgress = () => {
    if (!score || !session) return;
    try {
      const next = newSessionRunProgress(score, session);
      setProgress(next);
      localStorage.setItem(runKey, JSON.stringify(next));
      setLoadError('');
      setStatus('Локальный указатель начат с первой сцены.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };
  const revealFact = (factId: string) => {
    try { onRevealFact(factId); setActionError(''); }
    catch (error) { setActionError(error instanceof Error ? error.message : String(error)); }
  };
  const toggleViewed = () => {
    if (!score || !progress || !currentBeat) return;
    try {
      const next = toggleRunBeatViewed(progress, score, currentBeat.id);
      saveProgress(next, next.viewedBeatIds.includes(currentBeat.id)
        ? 'Сцена отмечена просмотренной только в локальном плане.'
        : 'Локальная отметка сцены снята.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  return <details className="mx-2 mb-2 bg-pl shadow-plate" aria-label="Ведение сессии по партитуре">
    <summary className="cursor-pointer flex items-center gap-2 px-2 py-2 type-h-15 text-gd-hi">
      <span>Проведение по партитуре</span>
      {scene ? <span className="min-w-0 truncate type-body-xs text-t2">· {scene.name}</span> : null}
    </summary>
    <div className="flex flex-col gap-2 p-2 type-body-sm">
      <p className="type-body-xs text-t2">Переходы и отметки просмотра хранятся отдельно от журнала. Фактические изменения используйте через действия кампании.</p>
      {sessions.length > 1 ? <label className="flex flex-col gap-1 type-body-xs text-t2">Активное приключение
        <select className={FIELD} value={session?.id ?? ''} onChange={event => setSelectedSessionId(event.target.value)}>
          {sessions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </label> : null}
      {!sessions.length ? <p className="type-body-xs text-t2">Нет активной приключенческой сессии. Сначала прими запуск приключения во «Входящих».</p> : null}
      {session && !score ? <div className="flex flex-col gap-1" role={loadError ? 'alert' : 'status'}>
        <p>{loadError || 'Загружается партитура…'}</p>
        <a className={BTN} href="#/workshop">Открыть Мастерскую</a>
      </div> : null}
      {session && score && !progress ? <div className="flex flex-col gap-1" role="alert">
        <p>{loadError || 'Локальный указатель не загружен.'}</p>
        <button type="button" className={BTN} onClick={resetProgress}>Начать указатель с первой сцены</button>
      </div> : null}
      {session && score && progress && bundle && currentBeat && scene ? <>
        {loadError ? <div role="alert" className="type-body-xs text-fx-damage-hi">{loadError}</div> : null}
        <section className="bg-wl p-2 flex flex-col gap-1" aria-label="Текущая сцена сессии">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><p className="type-body-xs text-t2">Сцена {currentBeatIndex + 1} из {score.beats.length} · сессия активна</p><h3 className="type-h-20">{scene.name}</h3></div>
            <span className="type-body-xs text-t2">{currentBeat?.expectedMinutes === null ? 'время не оценено' : `${currentBeat?.expectedMinutes} мин.`}</span>
          </div>
          <p>{scene.summary}</p>
          {scene.preparation ? <p className="whitespace-pre-wrap text-t2">Памятка: {scene.preparation}</p> : null}
          {currentBeat?.gmCue ? <p className="whitespace-pre-wrap text-t2">Заметка мастера: {currentBeat.gmCue}</p> : null}
          <p className="type-body-xs text-t2">Состав при запуске: {activePartyNames.join(' · ') || 'пусто'} · план: {totalMinutes} мин. {unestimated ? `· без оценки сцен: ${unestimated}` : ''} · просмотрено сцен: {progress.viewedBeatIds.length}/{score.beats.length}</p>
          <p className="type-body-xs text-t2">Источник сцены: {scene.evidence.map(evidence => { const source = sourceById.get(evidence.source); return `${source?.title ?? evidence.source}${evidence.pages.length ? ` · стр. ${evidence.pages.join(', ')}` : ''}${source?.sha256 ? ` · ${source.sha256.slice(0, 12)}` : ''}`; }).join(' · ') || 'не указан'}</p>
          <details className="type-body-xs text-t2"><summary>Закреплённые версии · {score.packagePins.length + 1}</summary><ul><li>{score.title} · {score.adventure.id}@{score.adventure.version}</li>{score.packagePins.map(pin => <li key={pin.id}>{pin.title} · {pin.id}@{pin.version ?? 'версия не закреплена'}</li>)}</ul></details>
          <p className="type-body-xs text-t2">Плановая отметка: {progress.viewedBeatIds.includes(currentBeat.id) ? 'просмотрена; это не подтверждение исхода в мире' : 'не просмотрена'}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BTN} disabled={currentBeatIndex <= 0} data-feedback-skip onClick={() => goToBeat(score.beats[currentBeatIndex - 1].id)}>Предыдущая</button>
            <button type="button" className={BTN} disabled={currentBeatIndex < 0 || currentBeatIndex >= score.beats.length - 1} data-feedback-skip onClick={() => goToBeat(score.beats[currentBeatIndex + 1].id)}>Следующая</button>
            <button type="button" className={BTN} onClick={toggleViewed}>{progress.viewedBeatIds.includes(currentBeat.id) ? 'Снять отметку просмотра' : 'Отметить просмотренной'}</button>
          </div>
          {currentBeat?.branches.length ? <section className="border-t border-bd pt-2" aria-label="Альтернативные переходы">
            <h4 className="type-body-sm text-gd-hi">Развилки</h4>
            <ul className="flex flex-col gap-1">{currentBeat.branches.map(branch => {
              const targetId = firstBeatForScene(score, branch.targetSceneId, currentBeatIndex);
              const targetScene = bundle.nodes.find(node => node.kind === 'scene' && node.id === branch.targetSceneId);
              return targetId ? <li key={branch.targetSceneId}>
                <button type="button" className={BTN} data-feedback-skip onClick={() => goToBeat(targetId)}>Если «{branch.label}» → {targetScene?.name ?? branch.targetSceneId}</button>
              </li> : null;
            })}</ul>
          </section> : null}
        </section>

        <section className="bg-wl p-2 flex flex-col gap-2" aria-label="Карточки и реквизит сцены">
          <h4 className="type-body-sm text-gd-hi">Карточки и реквизит</h4>
          {materialNodes.length ? <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {materialNodes.map(node => <li key={node.id}><button type="button" className={BTN} aria-expanded={selectedMaterialId === node.id}
              onClick={() => setSelectedMaterialId(value => value === node.id ? '' : node.id)}>{KIND_LABEL[node.kind]} · {node.name}</button></li>)}
          </ul> : <p className="type-body-xs text-t2">У сцены пока нет связанных карточек.</p>}
          {selectedMaterial ? <article className="border-t border-bd pt-2" aria-label={`Карточка материала ${selectedMaterial.name}`}>
            <h5 className="type-body-sm text-gd-hi">{selectedMaterial.name}</h5>
            <p className="whitespace-pre-wrap">{selectedMaterial.summary}</p>
            {selectedMaterial.preparation ? <p className="whitespace-pre-wrap text-t2">Подготовка: {selectedMaterial.preparation}</p> : null}
            {selectedMaterial.kind === 'plan' ? <p className="type-body-xs text-t2">План · PDF {selectedMaterial.planGeometry?.pdfPage ?? 'страница не указана'}{selectedMaterial.planGeometry?.runtimeGeometry ? ` · геометрия ${selectedMaterial.planGeometry.runtimeGeometry.id}` : ' · runtime-геометрии нет'}</p> : null}
            {selectedMaterial.kind === 'fact' ? (() => {
              const factId = adventureFactRecordId(session.id, selectedMaterial.id);
              const revealed = state.facts[factId]?.visibility === 'players';
              return revealed
                ? <p role="status" className="type-body-xs text-t2">Сведение открыто игрокам.</p>
                : <button type="button" className={BTN} onClick={() => revealFact(factId)}>Раскрыть игрокам и добавить в журнал</button>;
            })() : null}
            <ul aria-label="Источники карточки" className="type-body-xs text-t2">{selectedMaterial.evidence.map((evidence, index) => {
              const source = sourceById.get(evidence.source);
              return <li key={index}>{source?.title ?? evidence.source}{evidence.pages.length ? ` · стр. ${evidence.pages.join(', ')}` : ''}{source?.sha256 ? ` · ${source.sha256.slice(0, 12)}` : ''}</li>;
            })}</ul>
          </article> : null}
        </section>

        {runSheet?.proposals.length ? <section className="bg-wl p-2" aria-label="Исходы текущей сцены">
          <h4 className="type-body-sm text-gd-hi">Предложенные последствия</h4>
          {runSheet.proposals.map(proposal => {
            const accepted = (session.resolvedProposalIds ?? []).includes(proposal.id);
            const pending = pendingOutcomeIds.includes(proposal.id);
            return <div key={proposal.id} className="flex flex-col gap-1 border-t border-bd pt-1">
              <p>{proposal.name} · {proposal.summary}</p>
              {accepted ? <p role="status" className="type-body-xs text-t2">Отмечено принятым событием кампании.</p>
                : pending ? <p role="status" className="type-body-xs text-t2">Предложение ждёт решения во «Входящих».</p>
                  : <button type="button" className={BTN} onClick={() => {
                    try { onPropose(adventureOutcomeDelta(state, session, scene.id, proposal.id)); setActionError(''); }
                    catch (error) { setActionError(error instanceof Error ? error.message : String(error)); }
                  }}>Предложить отметить исход сцены</button>}
            </div>;
          })}
          <p className="type-body-xs text-t2">Принятие пишет обратимую запись о выборе мастера; награды и изменения мира применяются отдельно.</p>
        </section> : null}
        {actionError ? <p role="alert" className="type-body-xs text-fx-damage-hi">{actionError}</p> : null}
        {status ? <p role="status" aria-live="polite" className="type-body-xs text-t2">{status}</p> : null}
      </> : null}
    </div>
  </details>;
}
