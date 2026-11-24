import { useEffect, useMemo, useState } from 'react';
import type { AdventureBundle } from '../packages/adventure';
import {
  addScoreBeat, addScoreBranch, analyzeSessionScore, moveScoreBeat, newSessionScoreDraft, removeScoreBeat,
  sessionScoreStorageKey, validateSessionScoreDraft,
  type SessionScoreBeat, type SessionScoreCatalogEntry, type SessionScoreDraft,
} from './sessionScore';

const FIELD = 'w-full min-w-0 bg-wl shadow-bevel-in text-tx type-body-sm px-2 py-1';
const BTN = 'cursor-pointer text-gd underline underline-offset-2 focus-visible:outline focus-visible:outline-1 focus-visible:outline-gd disabled:opacity-40 disabled:cursor-not-allowed';

interface SessionScoreEditorProps {
  bundle: AdventureBundle;
  campaign: { scope: string; settingPackageId: string; partyActorIds: readonly string[] };
  party: readonly { id: string; name: string }[];
  catalog: readonly SessionScoreCatalogEntry[];
}

function sceneName(bundle: AdventureBundle, id: string): string {
  return bundle.nodes.find(node => node.id === id && node.kind === 'scene')?.name ?? id;
}

function BeatCard({ beat, index, total, bundle, analysis, plannedSceneIds, onEdit, onMove, onRemove, onAddBranch }: {
  beat: SessionScoreBeat;
  index: number;
  total: number;
  bundle: AdventureBundle;
  analysis: ReturnType<typeof analyzeSessionScore>['scenes'][number] | undefined;
  plannedSceneIds: readonly string[];
  onEdit: (next: SessionScoreBeat) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
  onAddBranch: (targetSceneId: string, label: string) => boolean;
}) {
  const scene = bundle.nodes.find(node => node.id === beat.sceneId && node.kind === 'scene');
  const plannedScenes = new Set(plannedSceneIds);
  const alternatives = bundle.nodes.filter(node => node.kind === 'scene' && node.id !== beat.sceneId && plannedScenes.has(node.id));
  const [branchTarget, setBranchTarget] = useState(alternatives[0]?.id ?? '');
  const [branchLabel, setBranchLabel] = useState('');
  useEffect(() => {
    if (!alternatives.some(item => item.id === branchTarget)) setBranchTarget(alternatives[0]?.id ?? '');
  }, [alternatives.map(item => item.id).join('|'), branchTarget]);
  const branch = () => {
    if (onAddBranch(branchTarget, branchLabel)) setBranchLabel('');
  };
  if (!scene) return null;
  return <article className="bg-wl shadow-bevel-in p-3 flex flex-col gap-3" aria-label={'Сцена партитуры: ' + scene.name}>
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div><p className="type-body-xs text-t2">Эпизод {index + 1}</p><h3 className="type-h-20">{scene.name}</h3></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BTN} aria-label={'Поднять сцену ' + scene.name} disabled={index === 0} onClick={() => onMove(-1)}>Выше</button>
        <button type="button" className={BTN} aria-label={'Опустить сцену ' + scene.name} disabled={index === total - 1} onClick={() => onMove(1)}>Ниже</button>
        <button type="button" className={BTN} onClick={onRemove}>Убрать</button>
      </div>
    </header>
    <label className="type-body-xs text-t2">Оценка времени, минут
      <input className={FIELD} type="number" min={1} max={1000} step={5} value={beat.expectedMinutes ?? ''}
        onChange={event => onEdit({ ...beat, expectedMinutes: event.target.value === '' ? null : Number(event.target.value) })} />
    </label>
    <label className="type-body-xs text-t2">Заметка мастеру · только эта рабочая партитура
      <textarea className={FIELD} rows={3} maxLength={5000} value={beat.gmCue} placeholder="Секрет, цель сцены, темп подачи или вопрос игрокам"
        onChange={event => onEdit({ ...beat, gmCue: event.target.value })} />
    </label>

    <section className="border-t border-bd pt-2 flex flex-col gap-2" aria-label={'Связанные материалы: ' + scene.name}>
      <h4 className="type-body-sm text-gd-hi">Материалы и зависимости</h4>
      {analysis ? <>
        <p className="type-body-xs text-t2">Суть: {analysis.summary}</p>
        <p className="type-body-xs text-t2">Подсказка проведения: {analysis.preparation ?? 'не заполнена'}</p>
        <p className="type-body-xs text-t2">Места: {analysis.places.map(item => item.name).join(' · ') || 'не привязаны'}</p>
        <p className="type-body-xs text-t2">Карты и планы: {analysis.plans.map(item => item.name + (item.planGeometry?.pdfPage ? ' · стр. ' + item.planGeometry.pdfPage : '')).join(' · ') || 'не привязаны'}</p>
        <p className="type-body-xs text-t2">NPC и противники: {analysis.participants.map(item => item.name + (item.engineBinding ? ' · ' + item.engineBinding.packageId + '@' + item.engineBinding.packageVersion : item.kind === 'creature' ? ' · профиль правил не закреплён' : '')).join(' · ') || 'не указаны'}</p>
        <p className="type-body-xs text-t2">Факты, предметы и нити: {analysis.facts.length + analysis.items.length + analysis.threads.length} связей · {analysis.items.map(item => item.name).join(' · ') || 'предметы не указаны'}</p>
        {analysis.proposals.length ? <p className="type-body-xs text-t2">Возможные последствия (не применены): {analysis.proposals.map(item => item.name).join(' · ')}</p> : null}
        <details className="type-body-xs text-t2"><summary>Источники материалов · {analysis.materialSources.length}</summary><ul>{analysis.materialSources.map((source, sourceIndex) => <li key={sourceIndex}>{source}</li>)}</ul></details>
        {analysis.missingMaterials.length ? <ul className="type-body-xs text-fx-damage-hi" aria-label={'Не приложенные материалы: ' + scene.name}>{analysis.missingMaterials.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul> : <p className="type-body-xs text-gd">Связанные обязательные источники присутствуют.</p>}
      </> : <p className="type-body-xs text-t2">Сцена не найдена в закреплённом графе.</p>}
    </section>

    <section className="border-t border-bd pt-2 flex flex-col gap-2" aria-label={'Развилки сцены: ' + scene.name}>
      <h4 className="type-body-sm text-gd-hi">Развилки и переходы</h4>
      <p className="type-body-xs text-t2">Основной порядок задаёт список партитуры. Здесь можно отметить явный альтернативный переход.</p>
      {beat.branches.length ? <ul className="type-body-xs">{beat.branches.map(item => <li key={item.targetSceneId}>
        Если «{item.label}» → {sceneName(bundle, item.targetSceneId)}
        <button type="button" className={'ml-2 ' + BTN} aria-label={'Убрать развилку ' + item.label} onClick={() => onEdit({ ...beat, branches: beat.branches.filter(branchItem => branchItem.targetSceneId !== item.targetSceneId) })}>Убрать</button>
      </li>)}</ul> : <p className="type-body-xs text-t2">Явных развилок пока нет.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
        <select className={FIELD} aria-label={'Целевая сцена развилки ' + scene.name} value={branchTarget} onChange={event => setBranchTarget(event.target.value)}>
          {alternatives.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <input className={FIELD} aria-label={'Условие развилки ' + scene.name} value={branchLabel} placeholder="Условие или решение игроков" onChange={event => setBranchLabel(event.target.value)} />
        <button type="button" className={BTN} disabled={!alternatives.length || !branchTarget || !branchLabel.trim()} onClick={branch}>Добавить развилку</button>
      </div>
    </section>
  </article>;
}

export function SessionScoreEditor({ bundle, campaign, party, catalog }: SessionScoreEditorProps) {
  const storageKey = sessionScoreStorageKey(campaign.scope, bundle.id);
  const [draft, setDraft] = useState(() => newSessionScoreDraft(bundle, campaign, catalog));
  const [selectedScene, setSelectedScene] = useState(bundle.entry);
  const [status, setStatus] = useState('');
  const [loadWarning, setLoadWarning] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    const fresh = newSessionScoreDraft(bundle, campaign, catalog);
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setDraft(validateSessionScoreDraft(JSON.parse(saved), bundle, campaign.scope));
        setStatus('Восстановлен локальный черновик подготовки.');
      } else {
        setDraft(fresh);
        setStatus('');
      }
      setLoadWarning('');
    } catch (error) {
      setDraft(fresh);
      setLoadWarning((error instanceof Error ? error.message : String(error)) + ' Старый файл не перезаписан.');
    }
  }, [storageKey, bundle.id, bundle.version]);

  const analysis = useMemo(() => analyzeSessionScore(bundle, draft, catalog, campaign), [bundle, draft, catalog, campaign.settingPackageId, campaign.partyActorIds.join('|')]);
  const sceneNodes = bundle.nodes.filter(node => node.kind === 'scene');
  const currentParty = campaign.partyActorIds.map(id => party.find(member => member.id === id)?.name ?? id);
  const edit = (update: (current: SessionScoreDraft) => SessionScoreDraft) => {
    setDraft(current => ({ ...update(current), status: 'draft' }));
    setStatus('Есть несохранённые изменения.');
  };
  const save = (next: SessionScoreDraft, ready: boolean) => {
    try {
      const checked = validateSessionScoreDraft({ ...next, status: ready ? 'ready' : 'draft' }, bundle, campaign.scope);
      localStorage.setItem(storageKey, JSON.stringify(checked));
      setDraft(checked);
      setStatus(ready ? 'Партитура подтверждена для ведения. Игровая сессия не запущена.' : 'Черновик сохранён только в этом браузере.');
      setActionError('');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };
  const markReady = () => {
    if (!analysis.canMarkReady) {
      setActionError(analysis.blockers.join(' '));
      return;
    }
    save(draft, true);
  };
  const addScene = () => {
    try {
      edit(current => addScoreBeat(current, bundle, selectedScene));
      setActionError('');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  return <section className="bg-cd shadow-bevel p-3 flex flex-col gap-3" aria-label="Партитура подготовки сессии">
    <header className="flex flex-wrap justify-between gap-2">
      <div><h2 className="type-h-20 text-gd-hi">Партитура подготовки</h2>
        <p className="type-body-xs text-t2">{bundle.id}@{bundle.version} · мастерская подготовки</p></div>
      <span className="type-body-xs text-gd-hi">{draft.status === 'ready' ? 'Подтверждена к ведению' : 'Черновик'}</span>
    </header>
    <p className="type-body-sm">Партитура связывает порядок сцен, развилки и материалы. Это локальная подготовка мастера: она не меняет кампанию, мир или журнал событий.</p>
    <section className="grid grid-cols-1 sm:grid-cols-3 gap-2" aria-label="Параметры сессии">
      <p className="type-body-xs text-t2">Сеттинг кампании: {campaign.settingPackageId} · партия: {currentParty.join(' · ') || 'не выбрана'}</p>
      <label className="type-body-xs text-t2">Целевая длительность, минут
        <input className={FIELD} type="number" min={1} max={1000} step={15} value={draft.targetMinutes ?? ''}
          onChange={event => edit(current => ({ ...current, targetMinutes: event.target.value === '' ? null : Number(event.target.value) }))} />
      </label>
      <label className="type-body-xs text-t2">Темп проведения
        <select className={FIELD} value={draft.pacing} onChange={event => edit(current => ({ ...current, pacing: event.target.value as SessionScoreDraft['pacing'] }))}>
          <option value="measured">Размеренный</option><option value="balanced">Ровный</option><option value="brisk">Быстрый</option>
        </select>
      </label>
    </section>
    <section className="bg-wl p-2 flex flex-col gap-1" aria-label="Закреплённые версии материалов">
      <h3 className="type-body-sm text-gd-hi">Материалы и версии</h3>
      <p className="type-body-xs text-t2">Приключение: {bundle.title} · {bundle.id}@{bundle.version}</p>
      {analysis.packagePins.map(pin => <p key={pin.id} className={'type-body-xs ' + (pin.status === 'ready' ? 'text-gd' : 'text-fx-damage-hi')}>
        {pin.title}: {pin.status === 'ready' ? pin.pinnedVersion : pin.status === 'missing' ? 'не установлен' : 'закреплён ' + pin.pinnedVersion + ', сейчас ' + pin.currentVersion}
      </p>)}
      <p className="type-body-xs text-t2">Партия в партитуре: {draft.campaign.partyActorIds.map(id => party.find(member => member.id === id)?.name ?? id).join(' · ') || 'пусто'} · текущая партия: {currentParty.join(' · ') || 'пусто'}.</p>
    </section>
    <div className="bg-wl p-2 type-body-sm" role="status" aria-live="polite">
      Оценка сцен: {analysis.estimatedMinutes} мин. · без оценки: {analysis.unestimatedScenes}
      {draft.targetMinutes !== null ? ' · цель: ' + draft.targetMinutes + ' мин.' : ''}
      {analysis.durationComplete && draft.targetMinutes !== null ? ' · отклонение: ' + (analysis.estimatedMinutes - draft.targetMinutes) + ' мин.' : ''}
    </div>
    {analysis.blockers.length ? <ul className="type-body-xs text-fx-damage-hi" aria-label="Блокеры партитуры">{analysis.blockers.map((item, index) => <li key={index}>{item}</li>)}</ul> : null}
    {draft.campaign.settingPackageId !== campaign.settingPackageId || JSON.stringify([...draft.campaign.partyActorIds].sort()) !== JSON.stringify([...campaign.partyActorIds].sort()) ? <button type="button" className={BTN} onClick={() => edit(current => ({ ...current, campaign: { ...current.campaign, settingPackageId: campaign.settingPackageId, partyActorIds: [...campaign.partyActorIds] } }))}>Актуализировать привязку к кампании</button> : null}
    {loadWarning ? <p role="alert" className="type-body-xs text-fx-damage-hi">{loadWarning}</p> : null}
    {actionError ? <p role="alert" className="type-body-xs text-fx-damage-hi">{actionError}</p> : null}
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
      <label className="type-body-xs text-t2">Добавить сцену
        <select className={FIELD} value={selectedScene} onChange={event => setSelectedScene(event.target.value)}>
          {sceneNodes.map(scene => <option key={scene.id} value={scene.id}>{scene.name}</option>)}
        </select>
      </label>
      <button type="button" className={BTN} disabled={!sceneNodes.length} onClick={addScene}>Добавить в партитуру</button>
    </div>
    {draft.beats.length ? <ol className="flex flex-col gap-3" aria-label="Порядок сцен партитуры">
      {draft.beats.map((beat, index) => <li key={beat.id}>
        <BeatCard beat={beat} index={index} total={draft.beats.length} bundle={bundle} analysis={analysis.scenes.find(scene => scene.beatId === beat.id)} plannedSceneIds={draft.beats.map(item => item.sceneId)}
          onEdit={next => edit(current => ({ ...current, beats: current.beats.map(item => item.id === beat.id ? next : item) }))}
          onMove={offset => edit(current => moveScoreBeat(current, beat.id, offset))}
          onRemove={() => edit(current => removeScoreBeat(current, beat.id))}
          onAddBranch={(targetSceneId, label) => { try { edit(current => addScoreBranch(current, bundle, beat.id, targetSceneId, label)); setActionError(''); return true; } catch (error) { setActionError(error instanceof Error ? error.message : String(error)); return false; } }} />
      </li>)}
    </ol> : <p className="type-body-sm text-t2">Добавьте первую сцену. Граф приключения не перестраивается.</p>}
    <footer className="flex flex-wrap gap-3">
      <button type="button" className={BTN} onClick={() => save(draft, false)}>Сохранить черновик</button>
      <button type="button" className={BTN} disabled={!analysis.canMarkReady} onClick={markReady}>Подтвердить партитуру</button>
    </footer>
    {status ? <p role="status" className="type-body-xs text-gd-hi">{status}</p> : null}
  </section>;
}
