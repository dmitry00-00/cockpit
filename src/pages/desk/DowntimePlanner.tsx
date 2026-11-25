import { useState } from 'react';
import { A5E_DEVOTION_SIMILARITIES, A5E_DOWNTIME_ACTIVITIES, a5eDevotionActivitySpec, a5eDevotionFavorAward, a5eDowntimeCoinBalance, a5eDowntimeProjectStep, a5eInformationActivitySpec, a5eInformationCheckOutcome, a5eLanguageId, a5eLanguageTrainingStep, a5eWorkActivitySpec, isA5eWorkDifficulty, newA5eDowntimeProjectId, newA5eLanguageTrainingProjectId, planA5eDowntimeCoinPayment, resolveA5eLongDowntimeCheck, type A5eDevotionSimilarity, type A5eDowntimeActivity, type A5eDowntimeActivityRecord, type A5eDowntimeCoinStack, type A5eDowntimePeriod, type A5eDowntimeProject, type A5eLanguageTrainingProject, type A5eLongDowntimeResult, type A5eInformationObscurity, type A5eWorkDifficulty } from '../../rules/a5e/downtime';
import { a5eTrainLanguageOrTool } from '../../rules/a5e/downtimeTrain';
import { SKILL_IDS, SKILLS, type SkillId } from '../../rules/srd/abilities';
import type { EntityRef } from '../../entities/ref';

const PERIODS: ReadonlyArray<{ id: A5eDowntimePeriod; label: string; duration: string }> = [
  { id: 'tenday', label: 'Десятидневка', duration: '10 дней · 1 занятие на персонажа' },
  { id: 'month', label: 'Месяц', duration: '30 дней · длинная свёртка A5E' },
  { id: 'season', label: 'Сезон', duration: '90 дней · длинная свёртка A5E' },
  { id: 'year', label: 'Год', duration: '365 дней · длинная свёртка A5E' },
];
const ACTIVITIES: ReadonlyArray<{ id: A5eDowntimeActivity; label: string }> = [
  { id: 'craft', label: 'Ремесло' }, { id: 'gather-information', label: 'Сбор сведений' },
  { id: 'recovery', label: 'Восстановление' }, { id: 'religious-devotion', label: 'Религиозное служение' },
  { id: 'research', label: 'Исследование' }, { id: 'spellcraft', label: 'Магическое ремесло' },
  { id: 'train', label: 'Тренировка' }, { id: 'work', label: 'Работа' },
];
const OBSCURITY: ReadonlyArray<{ id: A5eInformationObscurity; label: string }> = [
  { id: 'uncommon', label: 'Необычные сведения' }, { id: 'esoteric', label: 'Эзотерические сведения' },
  { id: 'hidden', label: 'Скрытые сведения' }, { id: 'secret', label: 'Тайные сведения' },
];
const DEVOTION_LABEL: Readonly<Record<A5eDevotionSimilarity, string>> = {
  'strongly-aligned': 'Сильно соответствует', aligned: 'Соответствует', neutral: 'Нейтрально',
  opposed: 'Противоречит', 'strongly-opposed': 'Резко противоречит',
};
const WORK_DIFFICULTY_LABEL: Readonly<Record<A5eWorkDifficulty, string>> = {
  easy: 'Лёгкая', average: 'Средняя', hard: 'Трудная', 'very-hard': 'Очень трудная',
};

export function DowntimePlanner({ participants, targets, projects = [], onApply, onRoll, onRollEarnings, onSpendFavor }: {
  participants: readonly { id: string; name: string; strife: number; keyKnowledge?: Partial<Record<EntityRef, number>>; favor?: Partial<Record<EntityRef, number>>; deity?: { ref: EntityRef; name: string }; intelligenceModifier?: number; trainedLanguages?: readonly { id: string; name: string }[]; relaxation: 'available' | 'period-used' | 'unavailable'; mods: Partial<Record<SkillId, number>>; workDisadvantageSkills?: readonly SkillId[]; coinStacks?: readonly A5eDowntimeCoinStack[] }[];
  targets: readonly { ref: EntityRef; name: string }[];
  projects?: readonly A5eDowntimeProject[];
  onApply: (period: A5eDowntimePeriod, records: readonly A5eDowntimeActivityRecord[]) => void;
  onRoll?: (actorId: string, skill: SkillId, modifier: number, dc: number, disadvantage?: boolean, forceHidden?: boolean) => { die: number; total: number };
  onRollEarnings?: (actorId: string, formula: string, label: string) => { dice: readonly number[]; total: number };
  onSpendFavor?: (payload: { actorId: string; deityRef: EntityRef; deityName: string; amount: 1 | 2; boon: string }) => void;
}) {
  const [period, setPeriod] = useState<A5eDowntimePeriod>('tenday');
  const [records, setRecords] = useState<A5eDowntimeActivityRecord[]>(() => participants.map(({ id, name }) => ({
    actorId: id, actorName: name, activity: 'recovery' as const, outcome: '',
  })));
  const [error, setError] = useState('');
  const [favorUses, setFavorUses] = useState<Record<string, { deityRef: string; amount: 1 | 2; boon: string }>>({});
  const informationProjects = projects.filter((project): project is Exclude<A5eDowntimeProject, A5eLanguageTrainingProject> => project.activity !== 'train');
  const trainingProjects = projects.filter((project): project is A5eLanguageTrainingProject => project.activity === 'train');
  const updateFacts = (recordIndex: number, required: number, factIndex: number, patch: Partial<{ label: string; value: string }>) => {
    setRecords(current => current.map((row, i) => i === recordIndex ? {
      ...row,
      information: { ...row.information!, facts: Array.from({ length: required }, (_, j) => ({ ...(row.information?.facts?.[j] ?? { label: '', value: '' }), ...(j === factIndex ? patch : {}) })) },
    } : row));
  };
  const keyKnowledgeSummary = (actorId: string) => {
    const points = participants.find(participant => participant.id === actorId)?.keyKnowledge ?? {};
    return Object.entries(points).filter(([, amount]) => Number.isSafeInteger(amount) && (amount ?? 0) > 0)
      .map(([ref, amount]) => `${targets.find(target => target.ref === ref)?.name ?? ref} ×${amount}`).join(' · ');
  };
  const favorSummary = (actorId: string) => {
    const participant = participants.find(item => item.id === actorId);
    const favor = participant?.favor ?? {};
    return Object.entries(favor).filter(([, amount]) => Number.isSafeInteger(amount) && (amount ?? 0) > 0)
      .map(([deityRef, amount]) => `${participant?.deity?.ref === deityRef ? participant.deity.name : deityRef} ×${amount}`).join(' · ');
  };
  const trainingProjectFor = (record: A5eDowntimeActivityRecord) => trainingProjects.find(project =>
    project.id === record.training?.projectId && project.actorId === record.actorId && project.status === 'active',
  );
  const trainingStepFor = (record: A5eDowntimeActivityRecord, index: number) => {
    const participant = participants[index];
    if (record.activity !== 'train' || !record.training || !participant || period === 'tenday') return undefined;
    try {
      const project = trainingProjectFor(record);
      const spec = a5eTrainLanguageOrTool(project?.training.intelligenceModifier ?? participant.intelligenceModifier ?? 0, 'tutor');
      return a5eLanguageTrainingStep(period, {
        requiredMonths: project?.training.requiredMonths ?? spec.duration,
        completedMonths: project?.training.completedMonths ?? 0,
      });
    } catch { return undefined; }
  };
  if (!participants.length) return null;
  return <details className="flex flex-col bg-pn shadow-bevel">
    <summary className="type-body-sm text-tx cursor-pointer p-3">Оформить промежуток (A5E)</summary>
    <form className="flex flex-col gap-3 p-3 pt-0" onSubmit={event => {
      event.preventDefault();
      const missingNarrative = records.find(record => record.activity !== 'work' && record.activity !== 'train' && !record.outcome.trim());
      if (missingNarrative) { setError(`Укажите исход занятия: ${missingNarrative.actorName}.`); return; }
      if (period === 'tenday' && records.some(record => record.activity === 'train')) { setError('Train для языка недоступна за десятидневку: выберите месяц, сезон или год.'); return; }
      const duplicateActiveTraining = records.find(record => record.activity === 'train' && record.training?.languageName.trim()
        && trainingProjects.some(project => project.actorId === record.actorId && project.status === 'active'
          && project.training.languageId === a5eLanguageId(record.training!.languageName) && project.id !== record.training!.projectId));
      if (duplicateActiveTraining) { setError(`${duplicateActiveTraining.actorName}: для этого языка уже есть активный Train-проект. Выберите его вместо «Новый проект».`); return; }
      const invalidTraining = records.find((record, index) => record.activity === 'train' && (
        !record.training?.languageName.trim() || !record.training.tutorName.trim() || record.training.tutorConfirmed !== true
        || !Number.isSafeInteger(record.training.intelligenceModifier)
        || record.training.intelligenceModifier !== (trainingProjectFor(record)?.training.intelligenceModifier ?? participants[index]?.intelligenceModifier)
        || !trainingStepFor(record, index)
        || (!!record.training.projectId && !trainingProjectFor(record))
        || (participants[index]?.trainedLanguages ?? []).some(language => language.id === a5eLanguageId(record.training?.languageName ?? ''))
      ));
      if (invalidTraining) { setError(`${invalidTraining.actorName}: укажите новый язык, имя наставника и подтвердите наставника мастером.`); return; }
      const unsupportedLongWork = period !== 'tenday' && records.find(record => record.activity === 'work');
      if (unsupportedLongWork) { setError('Legal Work пока рассчитана только на одну десятидневку; длинный доход и lifestyle не сворачиваются автоматически.'); return; }
      const invalidWork = records.find(record => record.activity === 'work' && (!record.work || !isA5eWorkDifficulty(record.work.difficulty)
        || !record.work.check || !Number.isSafeInteger(record.work.check.total) || typeof record.work.disadvantageApplied !== 'boolean'));
      if (invalidWork) { setError(`${invalidWork.actorName}: выберите сложность Legal Work и совершите проверку.`); return; }
      const missingWorkEarnings = records.find(record => {
        if (record.activity !== 'work' || !record.work?.check) return false;
        const spec = a5eWorkActivitySpec(record.work.difficulty);
        return record.work.check.total >= spec.dc
          ? !record.work.earnings || (record.work.earnings.dice !== undefined && record.work.earnings.dice.length !== spec.earningsDice) || !Number.isSafeInteger(record.work.earnings.gp)
          : !!record.work.earnings;
      });
      if (missingWorkEarnings) { setError(`${missingWorkEarnings.actorName}: для успеха бросьте указанный доход; при провале дохода нет.`); return; }
      const unsupportedLongDevotion = period !== 'tenday' && records.find(record => record.activity === 'religious-devotion');
      if (unsupportedLongDevotion) { setError('Для Religious Devotion длинная свёртка не начисляет favor автоматически: выберите одну десятидневку или зафиксируйте это занятие отдельно по решению мастера.'); return; }
      const invalidDevotion = records.find((record, index) => record.activity === 'religious-devotion'
        && (!participants[index]?.deity || !record.devotion || record.devotion.deityRef !== participants[index]?.deity?.ref
          || !record.devotion.sacredSiteConfirmed || !record.devotion.check
          || (record.devotion.offeringWaived === true && !record.devotion.offeringWaiverReason?.trim())));
      if (invalidDevotion) { setError(`${invalidDevotion.actorName}: нужны божество на листе, подтверждённое священное место и итог проверки служения.`); return; }
      const missingTarget = records.find(record => (record.activity === 'gather-information' || record.activity === 'research') && !record.information?.subject.trim());
      if (missingTarget) { setError(`Укажите цель сведений для ${missingTarget.actorName}.`); return; }
      const dueCheck = records.find(record => {
        if ((record.activity !== 'gather-information' && record.activity !== 'research') || !record.information) return false;
        const spec = a5eInformationActivitySpec(record.activity, record.information.obscurity);
        const existing = informationProjects.find(project => project.id === record.information?.projectId && project.status === 'active');
        if (period !== 'tenday') return !record.information.check;
        return (existing?.completedWeeks ?? 0) + 1 >= spec.weeks && !record.information.check;
      });
      if (dueCheck) { setError(`Для завершения проекта или длинной свёртки нужен итог проверки: ${dueCheck.actorName}.`); return; }
      const missingExtendedCheck = period !== 'tenday' && records.find(record =>
        record.activity !== 'gather-information' && record.activity !== 'research'
        && record.activity !== 'train'
        && (!Number.isSafeInteger(record.extendedCheck?.dc) || (record.extendedCheck?.dc ?? 0) < 1 || !Number.isSafeInteger(record.extendedCheck?.total)),
      );
      if (missingExtendedCheck) { setError(`${missingExtendedCheck.actorName}: укажите DC по таблице занятия и итог проверки для длинной свёртки.`); return; }
      const missingKnowledge = records.find(record => {
        if ((record.activity !== 'gather-information' && record.activity !== 'research') || !record.information?.check) return false;
        const spec = a5eInformationActivitySpec(record.activity, record.information.obscurity);
        const result = a5eInformationCheckOutcome(record.information.check.total, spec.dc);
        const existing = informationProjects.find(project => project.id === record.information?.projectId && project.status === 'active');
        let completes = false;
        try { completes = a5eDowntimeProjectStep(period, { requiredWeeks: spec.weeks, completedWeeks: existing?.completedWeeks ?? 0 }, record.information.check.total, spec.dc).completes; } catch { return false; }
        const count = completes ? result === 'success-by-5' ? 2 : result === 'success' ? 1 : 0 : 0;
        return count > 0 && (!record.information.target || record.information.facts?.length !== count || record.information.facts.some(fact => !fact.label.trim() || !fact.value.trim()));
      });
      if (missingKnowledge) { setError(`Для успеха ${missingKnowledge.actorName} укажите связанную сущность и факты для тетради партии.`); return; }
      const missingPayment = records.find((record, index) => {
        if (record.activity !== 'gather-information' && record.activity !== 'research') return false;
        if (informationProjects.some(project => project.id === record.information?.projectId && project.status === 'active')) return false;
        if (record.activity === 'research' && record.information?.suitableLibrary) return false;
        const spec = a5eInformationActivitySpec(record.activity, record.information?.obscurity ?? 'uncommon');
        return planA5eDowntimeCoinPayment(participants[index]?.coinStacks ?? [], spec.minimumCostGp) === null;
      });
      if (missingPayment) {
        const index = records.findIndex(record => record.actorId === missingPayment.actorId);
        const spec = a5eInformationActivitySpec(missingPayment.activity as 'gather-information' | 'research', missingPayment.information?.obscurity ?? 'uncommon');
        const balance = a5eDowntimeCoinBalance(participants[index]?.coinStacks ?? []);
        setError(`${missingPayment.actorName}: для этого занятия нужны ${spec.minimumCostGp} gp точной оплатой; сейчас доступно ${formatCoinBalance(balance)}. Сначала обменяйте монеты или выберите исследование в подходящей библиотеке.`);
        return;
      }
      const missingTrainingPayment = records.find((record, index) => record.activity === 'train'
        && trainingStepFor(record, index)
        && planA5eDowntimeCoinPayment(participants[index]?.coinStacks ?? [], trainingStepFor(record, index)!.costChargedGp) === null);
      if (missingTrainingPayment) {
        const index = records.findIndex(record => record.actorId === missingTrainingPayment.actorId);
        const balance = a5eDowntimeCoinBalance(participants[index]?.coinStacks ?? []);
        setError(`${missingTrainingPayment.actorName}: за этот промежуток нужно точно оплатить ${trainingStepFor(missingTrainingPayment, index)?.costChargedGp ?? 0} gp из расчёта 50 gp за месяц; сейчас доступно ${formatCoinBalance(balance)}.`);
        return;
      }
      const missingDevotionPayment = records.find((record, index) => record.activity === 'religious-devotion'
        && record.devotion && !record.devotion.offeringWaived
        && planA5eDowntimeCoinPayment(participants[index]?.coinStacks ?? [], a5eDevotionActivitySpec(record.devotion.similarity).offeringGp) === null);
      if (missingDevotionPayment) {
        const index = records.findIndex(record => record.actorId === missingDevotionPayment.actorId);
        const amount = missingDevotionPayment.devotion ? a5eDevotionActivitySpec(missingDevotionPayment.devotion.similarity).offeringGp : 0;
        const balance = a5eDowntimeCoinBalance(participants[index]?.coinStacks ?? []);
        setError(`${missingDevotionPayment.actorName}: для подношения нужно ${amount} gp точной оплатой; сейчас доступно ${formatCoinBalance(balance)}.`);
        return;
      }
      setError('');
      const withProjectIds = records.map(record => {
        if ((record.activity === 'gather-information' || record.activity === 'research') && record.information && !record.information.projectId) {
          return { ...record, information: { ...record.information, projectId: newA5eDowntimeProjectId(informationProjects, record) } };
        }
        if (record.activity === 'train' && record.training && !record.training.projectId) {
          return { ...record, training: {
            ...record.training,
            languageId: a5eLanguageId(record.training.languageName),
            projectId: newA5eLanguageTrainingProjectId(projects, record.actorId, record.training.languageName),
            progress: trainingStepFor(record, records.findIndex(row => row.actorId === record.actorId)),
          } };
        }
        if (record.activity === 'train' && record.training) {
          return { ...record, training: {
            ...record.training,
            languageId: a5eLanguageId(record.training.languageName),
            progress: trainingStepFor(record, records.findIndex(row => row.actorId === record.actorId)),
          } };
        }
        return record;
      });
      // Keep the chosen stable ID in the planner after applying (or cancelling) the preview,
      // so the next period resumes this exact project instead of opening a new paid attempt.
      setRecords(withProjectIds);
      onApply(period, withProjectIds);
    }}>
      <label className="flex flex-col gap-1 type-body-sm text-tx">Период
        <select className="bg-cd text-tx px-2 py-2" value={period} onChange={event => {
          const next = event.target.value as A5eDowntimePeriod;
          setPeriod(next);
          if (next === 'tenday') setRecords(current => current.map(row => row.activity === 'train'
            ? { ...row, activity: 'recovery', training: undefined, extendedCheck: undefined }
            : { ...row, extendedCheck: undefined }));
        }}>
          {PERIODS.map(item => <option key={item.id} value={item.id}>{item.label} — {item.duration}</option>)}
        </select>
      </label>
      <p className="type-body-xs text-t2">На каждого участника — одно занятие. Train для языка засчитывает только полные интервалы: месяц = 1, сезон = 3, год = 12 месяцев; десятидневка недоступна. Для прочих длинных занятий используйте свёртку только по их правилам.</p>
      {records.map((record, index) => <fieldset key={record.actorId} className="flex flex-col gap-2 border border-cd p-2">
        <legend className="type-body-sm text-tx px-1">{record.actorName}</legend>
        {keyKnowledgeSummary(record.actorId) ? <p className="type-body-xs text-t2">Key Knowledge: {keyKnowledgeSummary(record.actorId)}</p> : null}
        {favorSummary(record.actorId) ? <p className="type-body-xs text-t2">A5E favor: {favorSummary(record.actorId)}</p> : null}
        {onSpendFavor ? (() => {
          const participant = participants[index];
          if (!participant) return null;
          const balances = Object.entries(participant.favor ?? {}).filter(([, amount]) => Number.isSafeInteger(amount) && (amount ?? 0) > 0);
          const firstBalance = balances[0];
          if (!firstBalance) return null;
          const saved = favorUses[record.actorId];
          const selectedRef = balances.some(([deityRef]) => deityRef === saved?.deityRef) ? saved!.deityRef : firstBalance[0];
          const available = participant.favor?.[selectedRef as EntityRef] ?? 0;
          const amount: 1 | 2 = saved?.amount === 2 && available >= 2 ? 2 : 1;
          const boon = saved?.boon ?? '';
          return <fieldset className="flex flex-col gap-2 border border-cd p-2">
            <legend className="type-body-xs text-t2 px-1">Потратить favor · решение Narrator</legend>
            <p className="type-body-xs text-t2">1 favor — малое полезное благо; 2 favor могут дать эффект заклинания 1-го круга, если Narrator одобрит. Благо хранится в секретной записи мастера.</p>
            <label className="flex flex-col gap-1 type-body-xs text-t2">Божество
              <select className="bg-cd text-tx px-2 py-2" value={selectedRef} onChange={event => setFavorUses(current => ({ ...current, [record.actorId]: { deityRef: event.target.value, amount: 1, boon: current[record.actorId]?.boon ?? '' } }))}>
                {balances.map(([deityRef, balance]) => <option key={deityRef} value={deityRef}>{participant.deity?.ref === deityRef ? participant.deity.name : deityRef} · {balance}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 type-body-xs text-t2">Сколько очков
              <select className="bg-cd text-tx px-2 py-2" value={amount} onChange={event => setFavorUses(current => ({ ...current, [record.actorId]: { deityRef: selectedRef, amount: Number(event.target.value) as 1 | 2, boon: current[record.actorId]?.boon ?? '' } }))}>
                <option value={1}>1 · малое благо</option>
                {available >= 2 ? <option value={2}>2 · возможен эффект заклинания 1-го круга</option> : null}
              </select>
            </label>
            <label className="flex flex-col gap-1 type-body-xs text-t2">Утверждённое благо
              <input className="bg-cd text-tx px-2 py-1" maxLength={500} value={boon} onChange={event => setFavorUses(current => ({ ...current, [record.actorId]: { deityRef: selectedRef, amount, boon: event.target.value } }))} placeholder="Кратко опишите, что одобрил Narrator" />
            </label>
            <button type="button" className="type-body-xs text-tx bg-cd px-2 py-1 self-start" disabled={!boon.trim() || available < amount} onClick={() => {
              onSpendFavor({ actorId: record.actorId, deityRef: selectedRef as EntityRef,
                deityName: participant.deity?.ref === selectedRef ? participant.deity.name : selectedRef.replace(/^deity:/, ''), amount, boon: boon.trim() });
              setFavorUses(current => ({ ...current, [record.actorId]: { deityRef: selectedRef, amount: 1, boon: '' } }));
            }}>Записать благо и потратить</button>
          </fieldset>;
        })() : null}
        <label className="flex flex-col gap-1 type-body-xs text-t2">Занятие
          <select className="bg-cd text-tx px-2 py-2" value={record.activity} onChange={event => setRecords(current => current.map((row, i) => i === index ? {
            ...row,
            activity: event.target.value as A5eDowntimeActivity,
            information: ['gather-information', 'research'].includes(event.target.value) ? {
              obscurity: row.information?.obscurity ?? 'uncommon', subject: row.information?.subject ?? '',
              skill: event.target.value === 'gather-information' ? 'investigation' : 'arcana',
            } : undefined,
            devotion: event.target.value === 'religious-devotion' && participants[index]?.deity ? {
              deityRef: participants[index].deity!.ref, deityName: participants[index].deity!.name,
              similarity: 'neutral', skill: 'religion', sacredSiteConfirmed: false,
            } : undefined,
            training: event.target.value === 'train' ? {
              languageName: row.training?.languageName ?? '',
              tutorName: row.training?.tutorName ?? '',
              intelligenceModifier: participants[index]?.intelligenceModifier ?? 0,
              tutorConfirmed: false,
            } : undefined,
            work: event.target.value === 'work' ? { difficulty: 'easy', skill: 'performance' } : undefined,
          } : row))}>
            {ACTIVITIES.filter(item => (A5E_DOWNTIME_ACTIVITIES as readonly string[]).includes(item.id)).map(item => <option key={item.id} value={item.id} disabled={(item.id === 'religious-devotion' || item.id === 'work') && period !== 'tenday' || item.id === 'train' && (period === 'tenday' || participants[index]?.intelligenceModifier === undefined)}>{item.label}{item.id === 'religious-devotion' && period !== 'tenday' ? ' · только одна десятидневка' : item.id === 'work' && period !== 'tenday' ? ' · только одна десятидневка' : item.id === 'train' && period === 'tenday' ? ' · месяц, сезон или год' : item.id === 'train' && participants[index]?.intelligenceModifier === undefined ? ' · нет листа для INT' : ''}</option>)}
          </select>
        </label>
        {period !== 'tenday' && record.activity !== 'gather-information' && record.activity !== 'research' && record.activity !== 'train' ? <fieldset className="flex flex-col gap-2 border border-cd p-2">
          <legend className="type-body-xs text-t2 px-1">Проверка длинного промежутка · {record.actorName}</legend>
          <p className="type-body-xs text-t2">Внесите DC из таблицы выбранного занятия и итог уже совершённой проверки. Число зачтённых недель считается по A5E SRD §8.</p>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 type-body-xs text-t2">DC
              <input aria-label={`DC длинной свёртки: ${record.actorName}`} type="number" min="1" step="1" className="bg-cd text-tx px-2 py-1 w-20" value={record.extendedCheck?.dc ?? ''} onChange={event => setRecords(current => current.map((row, i) => i === index ? { ...row, extendedCheck: { ...row.extendedCheck, dc: event.target.value === '' ? undefined : Number(event.target.value) } } : row))} />
            </label>
            <label className="flex items-center gap-2 type-body-xs text-t2">Итог
              <input aria-label={`Итог длинной свёртки: ${record.actorName}`} type="number" step="1" className="bg-cd text-tx px-2 py-1 w-20" value={record.extendedCheck?.total ?? ''} onChange={event => setRecords(current => current.map((row, i) => i === index ? { ...row, extendedCheck: { ...row.extendedCheck, total: event.target.value === '' ? undefined : Number(event.target.value) } } : row))} />
            </label>
          </div>
          {record.extendedCheck?.dc !== undefined && record.extendedCheck.total !== undefined
            && Number.isSafeInteger(record.extendedCheck.dc) && record.extendedCheck.dc >= 1 && Number.isSafeInteger(record.extendedCheck.total)
            ? <p className="type-body-xs text-t2">{extendedResultLabel(resolveA5eLongDowntimeCheck(period, record.extendedCheck.total, record.extendedCheck.dc).result)} · зачтено {resolveA5eLongDowntimeCheck(period, record.extendedCheck.total, record.extendedCheck.dc).successfulWeeks} нед.</p>
            : null}
        </fieldset> : null}
        {record.activity === 'train' && record.training ? (() => {
          const training = record.training!;
          const participant = participants[index];
          const activeProject = trainingProjectFor(record);
          const spec = a5eTrainLanguageOrTool(training.intelligenceModifier, 'tutor');
          const progress = trainingStepFor(record, index);
          const balance = a5eDowntimeCoinBalance(participant.coinStacks ?? []);
          const updateTraining = (patch: Partial<typeof training>) => setRecords(current => current.map((row, i) => i === index
            ? { ...row, training: { ...row.training!, ...patch } } : row));
          return period === 'tenday'
            ? <p className="type-body-xs text-t2">Train для языка доступна только за полный месяц, сезон или год; десятидневка не засчитывает прогресс.</p>
            : <fieldset className="flex flex-col gap-2 border border-cd p-2">
              <legend className="type-body-xs text-t2 px-1">Train · один язык с наставником · A5E SRD §8</legend>
              <p className="type-body-xs text-t2">Мастер вручную задаёт язык и наставника и подтверждает наставника. Срок — 12 − INT модификатор месяцев; оплата — 50 gp за каждый засчитанный месяц. Проверка не предусмотрена: язык осваивается в конце срока.</p>
              {trainingProjects.some(project => project.actorId === record.actorId && project.status === 'active') ? <label className="flex flex-col gap-1 type-body-xs text-t2">Проект обучения
                <select className="bg-cd text-tx px-2 py-2" value={training.projectId ?? ''} onChange={event => {
                  const selected = trainingProjects.find(project => project.id === event.target.value && project.actorId === record.actorId && project.status === 'active');
                  updateTraining(selected ? {
                    projectId: selected.id, languageId: selected.training.languageId, languageName: selected.training.languageName,
                    tutorName: selected.training.tutorName, tutorConfirmed: true,
                    intelligenceModifier: selected.training.intelligenceModifier,
                  } : { projectId: undefined, languageId: undefined, languageName: '', tutorName: '', tutorConfirmed: false,
                    intelligenceModifier: participant.intelligenceModifier ?? 0 });
                }}>
                  <option value="">Новый проект</option>
                  {trainingProjects.filter(project => project.actorId === record.actorId && project.status === 'active').map(project => <option key={project.id} value={project.id}>{project.training.languageName} · {project.training.completedMonths}/{project.training.requiredMonths} мес. · наставник {project.training.tutorName}</option>)}
                </select>
              </label> : null}
              <label className="flex flex-col gap-1 type-body-xs text-t2">Язык для изучения
                <input className="bg-cd text-tx px-2 py-2" maxLength={80} readOnly={!!activeProject} value={training.languageName} onChange={event => updateTraining({ languageName: event.target.value, languageId: undefined, projectId: undefined, tutorConfirmed: false })} placeholder="Введите название языка" />
              </label>
              <label className="flex flex-col gap-1 type-body-xs text-t2">Имя наставника
                <input className="bg-cd text-tx px-2 py-2" maxLength={100} readOnly={!!activeProject} value={training.tutorName} onChange={event => updateTraining({ tutorName: event.target.value, projectId: undefined, tutorConfirmed: false })} placeholder="Введите имя наставника" />
              </label>
              <label className="flex items-center gap-2 type-body-xs text-tx">
                <input type="checkbox" checked={activeProject ? true : training.tutorConfirmed} disabled={!!activeProject} onChange={event => updateTraining({ tutorConfirmed: event.target.checked })} />
                Мастер подтверждает, что наставник доступен для этого обучения
              </label>
              <p className="type-body-xs text-t2">INT {training.intelligenceModifier >= 0 ? '+' : ''}{training.intelligenceModifier} · срок {spec.duration} мес. · {activeProject ? `проект ${activeProject.training.completedMonths}/${activeProject.training.requiredMonths} мес. уже оплачен на ${activeProject.costPaidGp} gp` : 'новый проект'}.</p>
              {progress ? <p className="type-body-xs text-t2">Этот шаг: +{progress.creditedMonths} мес. · проект станет {progress.afterMonths}/{progress.requiredMonths} мес.{progress.completes ? ' · язык добавится в лист' : ''} · стоимость {progress.costChargedGp} gp · точная сумма у персонажа: {formatCoinBalance(balance)}.</p>
                : <p className="type-body-xs text-t2">Нужен полный календарный интервал month, season или year.</p>}
              <p className="type-body-xs text-t2">Уже освоенные через эту механику языки: {(participant.trainedLanguages ?? []).map(language => language.name).join(', ') || 'нет записей'}.</p>
            </fieldset>;
        })() : null}
        {record.activity === 'work' && record.work ? (() => {
          const work = record.work!;
          const spec = a5eWorkActivitySpec(work.difficulty);
          const modifier = participants[index].mods[work.skill] ?? 0;
          const check = work.check;
          const success = check ? check.total >= spec.dc : false;
          const disadvantage = participants[index].workDisadvantageSkills?.includes(work.skill) === true;
          const updateWork = (patch: Partial<typeof work>) => setRecords(current => current.map((row, i) => i === index
            ? { ...row, work: { ...row.work!, ...patch } } : row));
          return period !== 'tenday'
            ? <p className="type-body-xs text-t2">Legal Work доступна для автоматического расчёта только за одну десятидневку.</p>
            : <fieldset className="flex flex-col gap-2 border border-cd p-2">
              <legend className="type-body-xs text-t2 px-1">Legal Work · A5E SRD §8</legend>
              <p className="type-body-xs text-t2">Мастер подтверждает подходящий навык. Таблица определяет DC, поддерживаемый lifestyle и доход; инструменты пока не автоматизированы.</p>
              <label className="flex flex-col gap-1 type-body-xs text-t2">Сложность
                <select className="bg-cd text-tx px-2 py-2" value={work.difficulty} onChange={event => updateWork({ difficulty: event.target.value as A5eWorkDifficulty, check: undefined, disadvantageApplied: undefined, earnings: undefined })}>
                  {(Object.keys(WORK_DIFFICULTY_LABEL) as A5eWorkDifficulty[]).map(difficulty => <option key={difficulty} value={difficulty}>{WORK_DIFFICULTY_LABEL[difficulty]}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 type-body-xs text-t2">Навык, одобренный мастером
                <select className="bg-cd text-tx px-2 py-2" value={work.skill} onChange={event => updateWork({ skill: event.target.value as SkillId, check: undefined, disadvantageApplied: undefined, earnings: undefined })}>
                  {SKILL_IDS.map(skill => <option key={skill} value={skill}>{SKILLS[skill].name}</option>)}
                </select>
              </label>
              <p className="type-body-xs text-t2">DC {spec.dc} · при успехе lifestyle {spec.lifestyle} и {spec.earningsDice}d6 gp{disadvantage ? ` · помеха на ${work.skill} за прошлый провал` : ''}</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 type-body-xs text-t2">Итог проверки
                  <input aria-label={`Итог Legal Work: ${record.actorName}`} type="number" step="1" className="bg-cd text-tx px-2 py-1 w-20" value={check?.total ?? ''} onChange={event => updateWork({ check: event.target.value === '' ? undefined : { total: Number(event.target.value) }, disadvantageApplied: event.target.value === '' ? undefined : disadvantage, earnings: undefined })} />
                </label>
                {onRoll && participants[index].mods[work.skill] !== undefined ? <button type="button" className="type-body-xs text-tx bg-cd px-2 py-1" onClick={() => {
                  const result = onRoll(record.actorId, work.skill, modifier, spec.dc, disadvantage, true);
                  updateWork({ check: { total: result.total, die: result.die, modifier }, disadvantageApplied: disadvantage, earnings: undefined });
                }}>Бросить {SKILLS[work.skill].name} {modifier >= 0 ? `+${modifier}` : modifier}{disadvantage ? ' с помехой' : ''}</button> : null}
              </div>
              {check ? success ? <>
                <p className="type-body-xs text-t2">Успех · поддержан lifestyle {spec.lifestyle}. Бросьте {spec.earningsDice}d6 gp или внесите выпавшую сумму.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 type-body-xs text-t2">Доход, gp
                    <input aria-label={`Доход Legal Work: ${record.actorName}`} type="number" min={spec.earningsDice} max={spec.earningsDice * 6} step="1" className="bg-cd text-tx px-2 py-1 w-20" value={work.earnings?.gp ?? ''} onChange={event => updateWork({ earnings: event.target.value === '' ? undefined : { gp: Number(event.target.value) } })} />
                  </label>
                  {onRollEarnings ? <button type="button" className="type-body-xs text-tx bg-cd px-2 py-1" onClick={() => {
                    const result = onRollEarnings(record.actorId, `${spec.earningsDice}d6`, `${record.actorName} · A5E Work · доход`);
                    updateWork({ earnings: { dice: result.dice, gp: result.total } });
                  }}>Бросить {spec.earningsDice}d6 gp</button> : null}
                </div>
                {work.earnings ? <p className="type-body-xs text-t2">Доход: {work.earnings.dice?.length ? `${work.earnings.dice.join('+')} = ` : ''}{work.earnings.gp} gp</p> : null}
              </> : <p className="type-body-xs text-t2">Провал · дохода и lifestyle нет{check.total <= 5 ? ' · следующая проверка работы тем же навыком будет с помехой' : ''}</p> : null}
            </fieldset>;
        })() : null}
        {record.activity === 'religious-devotion' ? period !== 'tenday'
          ? <p className="type-body-xs text-t2">Для длинного промежутка формула считает недели, но SRD не уточняет, как повторять начисление favor за один сжатый бросок. Автоматическое начисление здесь отключено.</p>
          : record.devotion ? (() => {
            const devotion = record.devotion!;
            const spec = a5eDevotionActivitySpec(devotion.similarity);
            const modifier = participants[index].mods[devotion.skill] ?? 0;
            const check = devotion.check;
            const award = check ? a5eDevotionFavorAward(check.total, spec.dc) : undefined;
            const updateDevotion = (patch: Partial<typeof devotion>) => setRecords(current => current.map((row, i) => i === index
              ? { ...row, devotion: { ...row.devotion!, ...patch } } : row));
            return <fieldset className="flex flex-col gap-2 border border-cd p-2">
              <legend className="type-body-xs text-t2 px-1">Религиозное служение · A5E SRD §8</legend>
              <p className="type-body-xs text-t2">Божество: {devotion.deityName}. Narrator определяет сходство философии; точные DC и подношение заданы SRD.</p>
              <label className="flex flex-col gap-1 type-body-xs text-t2">Сходство философии с божеством
                <select className="bg-cd text-tx px-2 py-2" value={devotion.similarity} onChange={event => updateDevotion({ similarity: event.target.value as A5eDevotionSimilarity, check: undefined })}>
                  {A5E_DEVOTION_SIMILARITIES.map(similarity => <option key={similarity} value={similarity}>{DEVOTION_LABEL[similarity]}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 type-body-xs text-t2">Проверка
                <select className="bg-cd text-tx px-2 py-2" value={devotion.skill} onChange={event => updateDevotion({ skill: event.target.value as 'nature' | 'religion', check: undefined })}>
                  <option value="nature">Nature</option><option value="religion">Religion</option>
                </select>
              </label>
              <label className="flex items-center gap-2 type-body-xs text-tx"><input type="checkbox" checked={devotion.sacredSiteConfirmed} onChange={event => updateDevotion({ sacredSiteConfirmed: event.target.checked })} />Мастер подтверждает доступ к святилищу, храму или другому священному месту</label>
              <label className="flex items-center gap-2 type-body-xs text-tx"><input type="checkbox" checked={devotion.offeringWaived === true} onChange={event => updateDevotion({ offeringWaived: event.target.checked, offeringWaiverReason: event.target.checked ? devotion.offeringWaiverReason : undefined })} />Мастер отменяет подношение по конкретному действию персонажа</label>
              {devotion.offeringWaived ? <label className="flex flex-col gap-1 type-body-xs text-t2">Основание для отмены подношения
                <input className="bg-cd text-tx px-2 py-1" value={devotion.offeringWaiverReason ?? ''} onChange={event => updateDevotion({ offeringWaiverReason: event.target.value })} />
              </label> : null}
              <p className="type-body-xs text-t2">DC {spec.dc} · подношение {devotion.offeringWaived ? 'отменено мастером' : `${spec.offeringGp} gp`} · монет у персонажа: {formatCoinBalance(a5eDowntimeCoinBalance(participants[index].coinStacks ?? []))}</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 type-body-xs text-t2">Итог
                  <input aria-label={`Итог Religious Devotion: ${record.actorName}`} type="number" step="1" className="bg-cd text-tx px-2 py-1 w-20" value={check?.total ?? ''} onChange={event => updateDevotion({ check: event.target.value === '' ? undefined : { total: Number(event.target.value) } })} />
                </label>
                {onRoll ? <button type="button" className="type-body-xs text-tx bg-cd px-2 py-1" onClick={() => {
                  const result = onRoll(record.actorId, devotion.skill, modifier, spec.dc);
                  updateDevotion({ check: { total: result.total, die: result.die, modifier } });
                }}>Бросить {devotion.skill} {modifier >= 0 ? `+${modifier}` : modifier}</button> : null}
              </div>
              {check ? <p className="type-body-xs text-t2">{check.die !== undefined ? `${check.die}${check.modifier !== undefined && check.modifier >= 0 ? '+' : ''}${check.modifier ?? ''} = ` : ''}{check.total} против DC {spec.dc} · {award ? `+${award} favor` : 'favor не получена'}</p> : null}
            </fieldset>;
          })()
          : <p className="type-body-xs text-t2">Для Religious Devotion укажите божество на листе персонажа.</p> : null}
        {record.activity === 'gather-information' || record.activity === 'research' ? <>
          {informationProjects.some(project => project.actorId === record.actorId && project.status === 'active') ? <label className="flex flex-col gap-1 type-body-xs text-t2">Проект
            <select className="bg-cd text-tx px-2 py-2" value={record.information?.projectId ?? ''} onChange={event => {
              const selected = informationProjects.find(project => project.id === event.target.value && project.actorId === record.actorId && project.status === 'active');
              setRecords(current => current.map((row, i) => i === index ? { ...row, information: selected ? {
                projectId: selected.id, subject: selected.subject, obscurity: selected.obscurity, skill: selected.skill,
                suitableLibrary: selected.suitableLibrary, check: undefined,
              } : { subject: '', obscurity: 'uncommon', skill: record.activity === 'gather-information' ? 'investigation' : 'arcana' } } : row));
            }}>
              <option value="">Новый проект</option>
              {informationProjects.filter(project => project.actorId === record.actorId && project.status === 'active').map(project => <option key={project.id} value={project.id}>{project.subject} · {project.completedWeeks}/{project.requiredWeeks} нед.</option>)}
            </select>
          </label> : null}
          <label className="flex flex-col gap-1 type-body-xs text-t2">Цель/вопрос
            <input className="bg-cd text-tx px-2 py-2" readOnly={!!record.information?.projectId} value={record.information?.subject ?? ''} onChange={event => setRecords(current => current.map((row, i) => i === index ? { ...row, information: { obscurity: row.information?.obscurity ?? 'uncommon', skill: row.information?.skill ?? 'investigation', subject: event.target.value, suitableLibrary: row.information?.suitableLibrary, check: undefined } } : row))} placeholder="Что именно ищет персонаж" />
          </label>
          {record.activity === 'research' ? <label className="flex flex-col gap-1 type-body-xs text-t2">Навык
            <select className="bg-cd text-tx px-2 py-2" disabled={!!record.information?.projectId} value={record.information?.skill === 'history' ? 'history' : 'arcana'} onChange={event => setRecords(current => current.map((row, i) => i === index ? { ...row, information: { obscurity: row.information?.obscurity ?? 'uncommon', subject: row.information?.subject ?? '', suitableLibrary: row.information?.suitableLibrary, skill: event.target.value as 'arcana' | 'history', check: undefined } } : row))}>
              <option value="arcana">Arcana</option><option value="history">History</option>
            </select>
          </label> : <p className="type-body-xs text-t2">Навык: Investigation</p>}
          {record.activity === 'research' ? <label className="flex items-center gap-2 type-body-xs text-t2"><input type="checkbox" disabled={!!record.information?.projectId} checked={record.information?.suitableLibrary === true} onChange={event => setRecords(current => current.map((row, i) => i === index ? { ...row, information: { ...row.information!, suitableLibrary: event.target.checked } } : row))} />Мастер подтверждает доступ к подходящей библиотеке — расходы можно отменить</label> : null}
          <label className="flex flex-col gap-1 type-body-xs text-t2">Категория сведений
            <select className="bg-cd text-tx px-2 py-2" disabled={!!record.information?.projectId} value={record.information?.obscurity ?? 'uncommon'} onChange={event => setRecords(current => current.map((row, i) => i === index ? { ...row, information: { obscurity: event.target.value as A5eInformationObscurity, subject: row.information?.subject ?? '', skill: row.information?.skill ?? 'investigation', suitableLibrary: row.information?.suitableLibrary, check: undefined } } : row))}>
              {OBSCURITY.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          {record.information ? (() => {
            const spec = a5eInformationActivitySpec(record.activity as 'gather-information' | 'research', record.information.obscurity);
            const skill = record.information.skill;
            const modifier = participants[index].mods[skill] ?? 0;
            const check = record.information.check;
            const selectedProject = informationProjects.find(item => item.id === record.information?.projectId && item.actorId === record.actorId);
            const project = selectedProject?.status === 'active' ? selectedProject : undefined;
            const terminalProject = selectedProject && selectedProject.status !== 'active' ? selectedProject : undefined;
            const beforeWeeks = selectedProject?.completedWeeks ?? 0;
            const needsCheck = !terminalProject && (period !== 'tenday' || beforeWeeks + 1 >= spec.weeks);
            let progress = null;
            if (!terminalProject && check) {
              try { progress = a5eDowntimeProjectStep(period, { requiredWeeks: spec.weeks, completedWeeks: beforeWeeks }, check.total, spec.dc); } catch { /* Invalid input remains visible for correction. */ }
            } else if (!terminalProject && period === 'tenday') {
              try { progress = a5eDowntimeProjectStep(period, { requiredWeeks: spec.weeks, completedWeeks: beforeWeeks }); } catch { /* No valid remaining project week. */ }
            }
            const balance = a5eDowntimeCoinBalance(participants[index].coinStacks ?? []);
            const waived = record.activity === 'research' && record.information.suitableLibrary === true;
            const alreadyPaid = !!project;
            return <div className="flex flex-col gap-1">
              <p className="type-body-xs text-t2">DC {spec.dc} · требуется {spec.weeks} нед. · {terminalProject
                ? `предыдущая попытка завершена: ${beforeWeeks}/${spec.weeks} нед. · ${terminalProject.status === 'succeeded' ? 'успех' : 'провал'}`
                : `проект ${beforeWeeks}/${spec.weeks} нед. · ${alreadyPaid ? 'расходы внесены ранее' : waived ? 'расходы отменены по решению мастера' : `стоимость ${spec.costLabel} (минимум ${spec.minimumCostGp} gp) · при персонаже: ${formatCoinBalance(balance)}`}`}</p>
              {terminalProject ? <button type="button" className="type-body-xs text-tx bg-cd px-2 py-1 self-start" onClick={() => setRecords(current => current.map((row, i) => i === index ? {
                ...row,
                information: { ...row.information!, projectId: undefined, check: undefined, target: undefined, facts: [], progress: undefined, paymentCharged: undefined },
              } : row))}>Начать новую попытку</button> : null}
              {!terminalProject && needsCheck ? <label className="flex items-center gap-2 type-body-xs text-t2">Итог проверки
                <input aria-label={`Итог проверки: ${record.actorName}`} type="number" step="1" className="bg-cd text-tx px-2 py-1 w-20" value={check?.total ?? ''} onChange={event => setRecords(current => current.map((row, i) => i === index ? { ...row, information: { ...row.information!, check: event.target.value === '' ? undefined : { total: Number(event.target.value) }, facts: [] } } : row))} />
              </label> : !terminalProject ? <p className="type-body-xs text-t2">Будет зачтена 1 неделя. Проверка понадобится, когда срок проекта закончится.</p> : null}
              {needsCheck && onRoll && participants[index].mods[skill] !== undefined ? <button type="button" className="type-body-xs text-tx bg-cd px-2 py-1 self-start" onClick={() => {
                const result = onRoll(record.actorId, skill, modifier, spec.dc);
                setRecords(current => current.map((row, i) => i === index ? { ...row, information: { ...row.information!, check: { total: result.total, die: result.die, modifier }, facts: [] } } : row));
              }}>Бросить {skill} {modifier >= 0 ? `+${modifier}` : modifier}</button> : null}
              {check ? (() => {
                const result = a5eInformationCheckOutcome(check.total, spec.dc);
                const factCount = progress?.completes ? result === 'success-by-5' ? 2 : result === 'success' ? 1 : 0 : 0;
                const facts = record.information?.facts ?? [];
                return <>
                  <p className="type-body-xs text-t2">{check.die !== undefined ? `${check.die}${check.modifier !== undefined && check.modifier >= 0 ? '+' : ''}${check.modifier ?? ''} = ` : ''}{check.total} против DC {spec.dc} · {progress && !progress.completes ? `проверка прогресса: ${result}` : result}{progress ? ` · проект ${progress.afterWeeks}/${progress.requiredWeeks} нед.` : ''}</p>
                  {period !== 'tenday' ? (() => {
                    const extended = resolveA5eLongDowntimeCheck(period, check.total, spec.dc);
                    return <p className="type-body-xs text-t2">Длинная свёртка: {extendedResultLabel(extended.result)} · зачтено {extended.successfulWeeks} нед. A5E</p>;
                  })() : null}
                  {factCount ? <>
                    <label className="flex flex-col gap-1 type-body-xs text-t2">Сущность для тетради Д6 — факты станут видны игрокам
                      <select className="bg-cd text-tx px-2 py-2" value={record.information?.target?.ref ?? ''} onChange={event => {
                        const target = targets.find(item => item.ref === event.target.value);
                        setRecords(current => current.map((row, i) => i === index ? { ...row, information: { ...row.information!, target: target ? { ref: target.ref, name: target.name } : undefined } } : row));
                      }}>
                        <option value="">Выбрать сущность</option>
                        {targets.map(target => <option key={target.ref} value={target.ref}>{target.name} · {target.ref}</option>)}
                      </select>
                    </label>
                    {Array.from({ length: factCount }, (_, factIndex) => <fieldset key={factIndex} className="flex flex-col gap-1 border border-cd p-2">
                      <legend className="type-body-xs text-t2 px-1">Факт {factIndex + 1}</legend>
                      <label className="flex flex-col gap-1 type-body-xs text-t2">Название
                        <input className="bg-cd text-tx px-2 py-1" value={facts[factIndex]?.label ?? ''} onChange={event => updateFacts(index, factCount, factIndex, { label: event.target.value })} />
                      </label>
                      <label className="flex flex-col gap-1 type-body-xs text-t2">Значение
                        <input className="bg-cd text-tx px-2 py-1" value={facts[factIndex]?.value ?? ''} onChange={event => updateFacts(index, factCount, factIndex, { value: event.target.value })} />
                      </label>
                    </fieldset>)}
                  </> : null}
                </>;
              })() : null}
            </div>;
          })() : null}
        </> : null}
        {record.activity !== 'train' ? <label className="flex flex-col gap-1 type-body-xs text-t2">Исход по решению мастера
          <input className="bg-cd text-tx px-2 py-2" value={record.outcome} onChange={event => setRecords(current => current.map((row, i) => i === index ? { ...row, outcome: event.target.value } : row))} placeholder="Краткий результат, включая бросок и Сл при необходимости" />
        </label> : null}
        {participants[index].strife > 0 ? (participants[index].relaxation === 'available'
          ? <label className="flex items-center gap-2 type-body-xs text-tx"><input type="checkbox" checked={record.relaxStrife === true} onChange={event => setRecords(current => current.map((row, i) => i === index ? { ...row, relaxStrife: event.target.checked } : row))} />Развеяться: снять 1 Strife (правило стола)</label>
          : <p className="type-body-xs text-t2">Развеяться недоступно: {participants[index].relaxation === 'period-used' ? 'персонаж уже использовал это в текущем промежутке.' : 'нужны включённая тема Strife и укрытие.'}</p>) : null}
      </fieldset>)}
      {error ? <p role="alert" className="type-body-sm text-gd-hi">{error}</p> : null}
      <button type="submit" className="type-body-sm bg-pl text-gd-hi shadow-bevel px-3 py-2 cursor-pointer focus-visible:shadow-[var(--glow-gold)]">Проверить и перейти к разбору времени</button>
    </form>
  </details>;
}

function extendedResultLabel(result: A5eLongDowntimeResult): string {
  return result === 'success' ? 'Успех' : result === 'failure' ? 'Провал' : 'Провал на 5+';
}

function formatCoinBalance(copper: number): string {
  const gp = Math.floor(copper / 100);
  const sp = Math.floor((copper % 100) / 10);
  const cp = copper % 10;
  return [gp ? `${gp} gp` : '', sp ? `${sp} sp` : '', cp ? `${cp} cp` : ''].filter(Boolean).join(' ') || '0 gp';
}
