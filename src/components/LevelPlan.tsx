// Дальний план повышений — временная форма поверх существующих levelUp/previewLevelUp.
import { useEffect, useMemo, useState } from 'react';
import type { Actor } from '../engine';
import { calculateLevelPlan, validatePlanChoice } from '../campaign/levelPlan';
import { levelUpPlan, type LevelUpChoice } from '../campaign/levelUp';
import { previewLevelUp } from '../campaign/levelUpPreview';
import { classById, FEATS } from '../rules/compendium';
import { SPELLS } from '../rules/srd/spells';
import { LevelUpForm } from './LevelUpForm';
import { levelPlanFingerprint, loadBrowserLevelPlan, saveBrowserLevelPlan } from '../campaign/levelPlanStorage';

const FIELD = 'h-8 px-2 type-body-sm text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';

function restoreDraft(actor: Actor, fingerprint: string, storageId = actor.id) {
  const saved = loadBrowserLevelPlan(storageId, fingerprint, actor.sheet?.level ?? 0);
  if (!saved) return undefined;
  let current = actor;
  const choices: LevelUpChoice[] = [];
  for (const choice of saved.choices) {
    if (validatePlanChoice(current, choice)) break;
    const preview = previewLevelUp(current, choice);
    if (preview.kind !== 'ready') break;
    choices.push(choice);
    current = preview.actor;
    if (preview.warnings.length) break;
  }
  return { target: saved.target, choices };
}

export function LevelPlan({ actor, planScope }: { actor: Actor; planScope?: string }) {
  const currentLevel = actor.sheet?.level ?? 0;
  const fingerprint = levelPlanFingerprint(actor.sheet);
  const storageId = planScope ? `${planScope}:${actor.id}` : actor.id;
  const identity = `${storageId}:${fingerprint}`;
  const [savedFor, setSavedFor] = useState(() => identity);
  const [initial] = useState(() => restoreDraft(actor, fingerprint, storageId));
  const [wasRestored,setWasRestored] = useState(Boolean(initial));
  const className = actor.sheet ? classById(actor.sheet.classId)?.nameRu ?? actor.sheet.classId : '—';
  const [target, setTarget] = useState(initial?.target ?? Math.min(20, currentLevel + 1));
  const [choices, setChoices] = useState<LevelUpChoice[]>(initial?.choices ?? []);
  const [storageFailed, setStorageFailed] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [editingChoice, setEditingChoice] = useState<LevelUpChoice | null>(null);
  const result = useMemo(() => calculateLevelPlan(actor, target, choices), [actor, target, choices]);
  const index = editing ?? choices.length;
  const prefix = choices.slice(0, index);
  const beforeEdit = useMemo(() => calculateLevelPlan(actor, target, prefix), [actor, target, prefix]);
  const stepActor = beforeEdit.actor;
  let nextPlan;
  let planError = '';
  try { nextPlan = levelUpPlan(stepActor); }
  catch (e) { planError = e instanceof Error ? e.message : String(e); }
  const canOpenStep = Boolean(nextPlan && nextPlan.level <= target && !beforeEdit.limitation && !beforeEdit.error);
  const finished = result.validThrough >= target || currentLevel >= target;
  const save = (choice: LevelUpChoice) => {
    const selectedPlan = levelUpPlan(stepActor, choice.subclassId);
    const unresolvedFeatureChoices = selectedPlan.featureChoices.some(fc =>
      fc.unavailableReason || (choice.featureChoices?.[fc.id]?.length ?? 0) !== fc.required,
    );
    const invalid = selectedPlan.unsupportedChoices.length || unresolvedFeatureChoices ? null : validatePlanChoice(stepActor, choice);
    if (invalid) return;
    setChoices([...prefix, choice]);
    setEditing(null);
    setEditingChoice(null);
  };
  const revise = (at: number) => { setEditingChoice(choices[at] ?? null); setChoices(choices.slice(0, at)); setEditing(at); };

  useEffect(() => {
    if (savedFor !== identity) {
      const restored = restoreDraft(actor, fingerprint, storageId);
      setWasRestored(Boolean(restored));
      setChoices(restored?.choices ?? []);
      setTarget(restored?.target ?? Math.min(20, currentLevel + 1));
      setEditing(null); setEditingChoice(null); setSavedFor(identity);
      return;
    }
    setStorageFailed(!saveBrowserLevelPlan(storageId, fingerprint, { target, choices }));
  }, [actor.id, currentLevel, fingerprint, identity, storageId, choices, target, savedFor]);

  return <section aria-label="План повышений" className="flex flex-col gap-3 bg-pn shadow-bevel p-3" data-part="level-plan">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div><h4 className="type-h-17 text-tx">План повышений</h4><p className="type-body-sm text-t2">{actor.name} · {className} · текущий уровень {currentLevel}. Черновик только для просмотра; кампания и журнал не меняются.</p></div>
      {currentLevel < 20 ? <label className="type-body-sm text-t2 flex items-center gap-2">Планировать до
        <select aria-label="Планировать до уровня" className={FIELD} value={target} onChange={e => { const level = Number(e.target.value); setTarget(level); setChoices(current => current.slice(0, Math.max(0, level - currentLevel))); setEditing(null); setEditingChoice(null); }}>
          {Array.from({ length: 20 - currentLevel }, (_, i) => currentLevel + i + 1).map(level => <option key={level} value={level}>{level}-го уровня</option>)}
        </select>
      </label> : <span className="type-body-sm text-t2">Достигнут предел 20-го уровня.</span>}
    </header>
    {wasRestored && savedFor === identity ? <p className="type-body-xs text-t2" role="status">Черновик плана восстановлен из этого браузера.</p> : null}
    {storageFailed ? <p className="type-body-xs text-t2" role="status">Браузер не сохранил черновик. План останется доступен, пока эта форма открыта.</p> : null}
    {choices.length ? <ol aria-label="Заполненные шаги плана" className="flex flex-col gap-2">
      {choices.map((choice, i) => {
        const step = result.steps[i] ?? (result.candidate?.level === currentLevel + i + 1 ? result.candidate : undefined);
        const incomplete = step === result.candidate;
        const subclassName = choice.subclassId ? classById(actor.sheet?.classId ?? '')?.subclasses.find(s => s.id === choice.subclassId)?.name ?? 'не найден в компендиуме' : '';
        const featName = choice.featId ? FEATS.find(f => f.id === choice.featId)?.nameRu ?? 'не найдена в компендиуме' : '';
        const spellNames = choice.spells?.map(id => SPELLS[id]?.name ?? 'заклинание не найдено').join(', ');
        return <li key={`${i}:${step?.level ?? currentLevel + i + 1}`} className={`flex flex-wrap items-center gap-2 px-2 py-2 ${incomplete ? 'bg-pn shadow-[inset_3px_0_0_var(--gd)]' : 'bg-cd shadow-bevel-in'}`}>
          <span className={`type-h-15 ${incomplete ? 'text-t2' : 'text-gd'}`}>{step?.level ?? currentLevel + i + 1}-й уровень{incomplete ? ' · расчёт неполон' : ''}</span>
          <span className="type-body-sm text-tx flex-1">{choice.hp.method === 'average' ? `хиты: среднее ${step?.preview?.change.hp.value ?? 'не рассчитано'}` : `хиты: бросок ${step?.preview?.change.hp.value ?? 'не рассчитано'}`}{subclassName ? ` · подкласс ${subclassName}` : ''}{choice.asi ? ` · ${Object.entries(choice.asi).map(([ab, n]) => `+${n} ${ab.toUpperCase()}`).join(', ')}` : ''}{featName ? ` · черта ${featName}` : ''}{spellNames ? ` · ${spellNames}` : ''}</span>
        <button type="button" className="type-body-sm text-gd underline" onClick={() => revise(i)}>Изменить выбор {step?.level ?? currentLevel + i + 1}-го уровня</button>
        </li>;
      })}
    </ol> : null}
    {result.error ? <p role="status" className="type-body-sm text-hp-low">Расчёт остановлен на {result.validThrough}-м уровне: {result.error}</p> : null}
    {result.limitation ? <p role="status" className="type-body-sm text-t2">Полный расчёт подтверждён до {result.validThrough}-го уровня. {result.limitation} Поздние шаги не рассчитываются.</p> : null}
    {finished && !result.error && !result.limitation ? <section aria-label="Итог плана" className="bg-wl shadow-bevel-in p-2">
      <h5 className="type-h-15 text-tx">Расчётный итог · {result.validThrough}-й уровень</h5>
      <p className="type-body-sm text-t2">Механический результат последовательного применения заполненных шагов. Актёр и журнал кампании не менялись.</p>
      <p className="type-body-sm text-tx">Хиты {result.actor.hp.current}/{result.actor.hp.max} · КД {result.actor.ac} · мастерство +{result.actor.sheet?.proficiencyBonus}</p>
      <p className="type-body-sm text-t2">Сверьте решения каждого уровня выше; итог существует только для заполненной последовательности.</p>
    </section> : null}
    {canOpenStep && nextPlan ? <div>
      <p className="type-body-sm text-gd-hi">Ближайший незавершённый шаг: {nextPlan.level}-й уровень. Расчёт до {beforeEdit.validThrough}-го уровня.</p>
      <LevelUpForm key={`${nextPlan.level}:${index}`} intent="plan" plan={nextPlan} abilities={stepActor.sheet!.abilities}
        planForSubclass={subclassId => levelUpPlan(stepActor, subclassId)}
        onPlanChoice={save} initialChoice={editing === null ? undefined : editingChoice ?? undefined} onPreview={choice => previewLevelUp(stepActor, choice)} />
    </div> : null}
    {!canOpenStep && !result.error && !result.limitation && !finished ? <p role="status" className="type-body-sm text-t2">{planError || `Заполните решения до ${target}-го уровня.`}</p> : null}
    <p className="type-body-xs text-t3">Данные источника и ограничения Д8 сохраняются. Изобретатель и выборы, описанные только текстом, не автоматизируются.</p>
  </section>;
}

export default LevelPlan;
