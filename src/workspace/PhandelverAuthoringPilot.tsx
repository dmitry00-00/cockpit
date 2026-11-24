import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdventureBundle } from '../packages/adventure';
import { AdventurePlanView } from '../components/AdventurePlanView';
import { getRuntimePlanGeometry } from '../packages/phandelverRuntimePlans';
import { BTN } from '../pages/desk/styles';
import { validateDraft, type AuthoredRecord, type PackageDraft } from './packageDraft';
import { compareReferenceSets, PHANDELVER_PILOT_PLANS, PHANDELVER_PILOT_RECAP, resolvePilotNarrative, resolvePlanReferences } from './phandelverAuthoring';

const FIELD = 'w-full min-w-0 bg-wl shadow-bevel-in text-tx type-body-sm px-2 py-1';
const kindNames: Record<string, string> = { location: 'место', route: 'маршрут', scene: 'сцена', thread: 'задача', plan: 'план', npc: 'персонаж', creature: 'существо', fact: 'сведение' };
const kindName = (kind: string) => kindNames[kind] ?? kind;

export interface PhandelverAuthoringPilotProps {
  bundle: AdventureBundle;
  draft: PackageDraft;
  installedPackages: readonly { id: string; version: string }[];
  onDraftChange: (draft: PackageDraft) => void;
}

/** A small authoring-only vertical; changes remain in React draft state until the parent saves. */
export function PhandelverAuthoringPilot({ bundle, draft, installedPackages, onDraftChange }: PhandelverAuthoringPilotProps) {
  const [planIds, setPlanIds] = useState<string[]>([...PHANDELVER_PILOT_PLANS]);
  const [recap, setRecap] = useState(PHANDELVER_PILOT_RECAP);
  const [selectedMapNode, setSelectedMapNode] = useState('');
  const [status, setStatus] = useState('');
  const [reviewedMapOnly, setReviewedMapOnly] = useState(false);
  const [reviewedTextOnly, setReviewedTextOnly] = useState(false);
  const [ambiguousChoices, setAmbiguousChoices] = useState<Record<string, string>>({});
  const [ignoredUnknown, setIgnoredUnknown] = useState<Record<string, boolean>>({});
  const savedPilotRecord = draft.records.find(record => record.id === 'phandelver-opening-summary');
  const savedPlanIds = savedPilotRecord?.references?.filter(reference => reference.packageId === bundle.id && reference.version === bundle.version && (PHANDELVER_PILOT_PLANS as readonly string[]).includes(reference.nodeId)).map(reference => reference.nodeId);
  const resetReferenceReview = useCallback(() => {
    setReviewedMapOnly(false);
    setReviewedTextOnly(false);
    setAmbiguousChoices({});
    setIgnoredUnknown({});
  }, []);
  const resetSetReview = useCallback(() => {
    setReviewedMapOnly(false);
    setReviewedTextOnly(false);
  }, []);
  useEffect(() => {
    setRecap(savedPilotRecord?.text ?? PHANDELVER_PILOT_RECAP);
    setPlanIds(savedPilotRecord ? [...new Set(savedPlanIds ?? [])] : [...PHANDELVER_PILOT_PLANS]);
    resetReferenceReview();
  }, [savedPilotRecord?.id, savedPilotRecord?.text, savedPilotRecord?.references, resetReferenceReview]);
  const map = useMemo(() => resolvePlanReferences(bundle, planIds), [bundle, planIds]);
  const narrative = useMemo(() => resolvePilotNarrative(bundle, recap), [bundle, recap]);
  const nodeById = useMemo(() => new Map(bundle.nodes.map(node => [node.id, node])), [bundle]);
  const mapIds = [...new Set([...map.planIds, ...map.spatialIds, ...map.contextIds])];
  const chosenAmbiguousIds = narrative.ambiguous.flatMap(item => {
    const choice = ambiguousChoices[item.label];
    return choice && item.candidates.includes(choice) ? [choice] : [];
  });
  const narrativeIds = [...new Set([...narrative.mentions.map(item => item.nodeId), ...chosenAmbiguousIds])];
  const comparison = compareReferenceSets(mapIds, narrativeIds);
  const referenceIds = [...new Set([...mapIds, ...narrativeIds])];
  const unresolvedAmbiguous = narrative.ambiguous.filter(item => !item.candidates.includes(ambiguousChoices[item.label] ?? ''));
  const unresolvedUnknown = narrative.unknown.filter(name => ignoredUnknown[name] !== true);
  const mismatchUnreviewed = (comparison.mapOnlyIds.length > 0 && !reviewedMapOnly)
    || (comparison.textOnlyIds.length > 0 && !reviewedTextOnly);
  const blocked = unresolvedAmbiguous.length > 0 || unresolvedUnknown.length > 0 || mismatchUnreviewed || referenceIds.length === 0;

  const addToDraft = () => {
    try {
      const references = referenceIds.map(nodeId => ({ packageId: bundle.id, version: bundle.version, nodeId }));
      const record: AuthoredRecord = {
        id: 'phandelver-opening-summary', kind: 'scene', name: 'Начало Фанделвера · авторский черновик',
        text: recap.trim(), audience: 'dm', source: 'Авторский пересказ; ссылки на БА23 сохранены как ссылки, не как перенесённые записи.', references,
      };
      const next: PackageDraft = { ...draft, records: [...draft.records.filter(item => item.id !== record.id), record] };
      const checked = validateDraft(next, installedPackages);
      onDraftChange(checked);
      setStatus(`Черновик обновлён: ${references.length} ссылок БА23. Кампания и её исходы не менялись.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const selectPlanTarget = (nodeId: string) => {
    setSelectedMapNode(nodeId);
    const matchingPlans = PHANDELVER_PILOT_PLANS.filter(planId => {
      const plan = nodeById.get(planId);
      return !!plan && getRuntimePlanGeometry(plan, bundle)?.areas.some(area => area.targetNodeId === nodeId);
    });
    if (matchingPlans.length) {
      resetReferenceReview();
      setPlanIds(current => [...new Set([...current, ...matchingPlans])]);
    }
  };

  return <section className="bg-cd shadow-bevel p-3 flex flex-col gap-3" aria-label="Авторская вертикаль Фанделвера">
    <header>
      <h2 className="type-h-20 text-tx">Авторская вертикаль · начало «Шахт Фанделвера»</h2>
      <p className="type-body-xs text-t2">План и короткий собственный пересказ связываются общими ссылками на существующие записи БА23. Результаты игры не фиксируются.</p>
    </header>

    <fieldset className="flex flex-col gap-2">
      <legend className="type-body-sm">Планы из БА23 · выберите контекст карты</legend>
      <div className="flex flex-wrap gap-3">{PHANDELVER_PILOT_PLANS.map(planId => {
        const node = nodeById.get(planId);
        return node ? <label key={planId} className="type-body-sm"><input type="checkbox" checked={planIds.includes(planId)} onChange={event => { resetReferenceReview(); setPlanIds(current => event.target.checked ? [...current, planId] : current.filter(id => id !== planId)); }}/>{node.name}</label> : null;
      })}</div>
      {PHANDELVER_PILOT_PLANS.filter(planId => planIds.includes(planId)).map(planId => {
        const plan = nodeById.get(planId);
        return plan ? <details key={planId}>
          <summary className="cursor-pointer type-body-sm">Открыть план «{plan.name}»</summary>
          <AdventurePlanView node={plan} bundle={bundle} onOpenNode={selectPlanTarget}/>
        </details> : null;
      })}
      {selectedMapNode ? <p className="type-body-xs text-t2" role="status">Отмечена область БА23: {nodeById.get(selectedMapNode)?.name ?? selectedMapNode}</p> : null}
    </fieldset>

    <label className="type-body-sm">Короткий авторский пересказ<textarea className={FIELD} rows={4} value={recap} onChange={event => { resetReferenceReview(); setRecap(event.target.value); setStatus(''); }}/></label>
    <p className="type-body-xs text-t2">Система точно сопоставляет полные имена и ID из БА23. Неизвестные названия в кавычках и имена, отмеченные как <code>[[так]]</code>, выводятся на проверку до внесения.</p>

    <section className="bg-wl shadow-bevel-in p-2 flex flex-col gap-2" aria-label="Результат разрешения ссылок">
      <h3 className="type-body-sm">Сверка карты и пересказа · до внесения в черновик</h3>
      {comparison.sharedIds.length ? <div aria-label="Согласованные ссылки">
        <h4 className="type-body-xs text-t2">Согласовано планом и текстом</h4>
        <ul className="flex flex-col gap-1 type-body-xs">{comparison.sharedIds.map(id => {
          const node = nodeById.get(id);
          if (!node) return null;
          return <li key={id}><strong>{node.name}</strong> · {kindName(node.kind)} · <code>{bundle.id}@{bundle.version}/{id}</code></li>;
        })}</ul>
      </div> : <p className="type-body-xs text-t2">План и текст пока не содержат общих ссылок.</p>}
      {comparison.mapOnlyIds.length ? <fieldset className="border border-amber-700 p-2" aria-label="Только в разметке карты">
        <legend className="type-body-xs text-gd-hi">Только в разметке карты · {comparison.mapOnlyIds.length}</legend>
        <ul className="flex flex-col gap-1 type-body-xs">{comparison.mapOnlyIds.map(id => {
          const node = nodeById.get(id);
          return node ? <li key={id}><strong>{node.name}</strong> · <code>{bundle.id}@{bundle.version}/{id}</code> · {map.spatialIds.includes(id) ? 'точная привязка области' : 'контекст плана'}</li> : null;
        })}</ul>
        <label className="type-body-xs"><input type="checkbox" checked={reviewedMapOnly} onChange={event => setReviewedMapOnly(event.target.checked)}/> Проверил список; сохранить все эти точные ссылки карты</label>
      </fieldset> : null}
      {comparison.textOnlyIds.length ? <fieldset className="border border-amber-700 p-2" aria-label="Только в пересказе">
        <legend className="type-body-xs text-gd-hi">Только в пересказе · {comparison.textOnlyIds.length}</legend>
        <ul className="flex flex-col gap-1 type-body-xs">{comparison.textOnlyIds.map(id => {
          const node = nodeById.get(id);
          return node ? <li key={id}><strong>{node.name}</strong> · <code>{bundle.id}@{bundle.version}/{id}</code></li> : null;
        })}</ul>
        <label className="type-body-xs"><input type="checkbox" checked={reviewedTextOnly} onChange={event => setReviewedTextOnly(event.target.checked)}/> Проверил список; сохранить все эти точные ссылки пересказа</label>
      </fieldset> : null}
      {narrative.ambiguous.length ? <div className="text-red-300 type-body-xs">
        <strong>Неоднозначные имена · выберите точную запись БА23:</strong>
        {narrative.ambiguous.map((item, index) => <fieldset key={`${item.label}-${index}`} aria-label={`Неоднозначное имя ${item.label}`}>
          <legend>«{item.label}»</legend>
          {item.candidates.map(id => {
            const node = nodeById.get(id);
            return node ? <label key={id} className="block"><input type="radio" name={`ambiguous-${index}`} value={id} checked={ambiguousChoices[item.label] === id} onChange={() => { resetSetReview(); setAmbiguousChoices(current => ({ ...current, [item.label]: id })); }}/>{node.name} · <code>{bundle.id}@{bundle.version}/{id}</code></label> : null;
          })}
        </fieldset>)}
      </div> : null}
      {narrative.unknown.length ? <fieldset className="text-red-300 type-body-xs" aria-label="Нераспознанные имена">
        <legend><strong>Нераспознанные имена · решите для каждого</strong></legend>
        <p role="alert">Нераспознанные имена не считаются ссылками, пока вы явно не оставите их обычным текстом.</p>
        {narrative.unknown.map(name => <label key={name} className="block"><input type="checkbox" checked={ignoredUnknown[name] === true} onChange={event => { resetSetReview(); setIgnoredUnknown(current => ({ ...current, [name]: event.target.checked })); }}/> «{name}» оставляю обычным текстом, без ссылки БА23</label>)}
      </fieldset> : null}
      {map.routeIdsWithoutGeometry.length ? <p className="type-body-xs text-gd-hi">Пробел геометрии: БА23 задаёт топологию маршрутов {map.routeIdsWithoutGeometry.map(id => `«${nodeById.get(id)?.name ?? id}»`).join(', ')} связями между местами, но выбранные планы не содержат их трассировки. На карту маршрут не нанесён.</p> : <p className="type-body-xs text-t2">Маршрутная геометрия не добавлена. Связи БА23, если есть, остаются только контекстом.</p>}
    </section>

    <div className="flex flex-wrap gap-2">
      <button type="button" className={BTN} disabled={blocked} onClick={addToDraft}>Внести ссылки и пересказ в черновик</button>
      {blocked ? <span role="status" className="type-body-xs text-gd-hi">Сохранение заблокировано: проверьте каждое расхождение, выберите точные записи для неоднозначных имён и отметьте неизвестные имена как обычный текст.</span> : null}
    </div>
    {status ? <p role="status" className="type-body-xs text-gd-hi">{status}</p> : null}
    <p className="type-body-xs text-t2">Изменится только рабочий черновик. Чтобы сохранить его локально, используйте отдельную кнопку «Сохранить черновик» ниже. Ни сцены, ни персонажи, ни факты в кампанию не добавляются.</p>
  </section>;
}
