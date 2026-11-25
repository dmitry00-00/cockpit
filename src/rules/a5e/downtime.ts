import { isSkillId, type SkillId } from '../srd/abilities';
import { parseRef, type EntityRef } from '../../entities/ref';
import { COIN_BY_ID, isCoinId } from '../srd/coins';
import { a5eTrainLanguageOrTool } from './downtimeTrain';

/** A5E downtime periods. The cockpit maps Harptos tendays to one five-workday downtime week as a table rule. */
export type A5eDowntimePeriod = 'tenday' | 'month' | 'season' | 'year';
export type A5eLongDowntimeResult = 'success' | 'failure' | 'failure-by-5';
export const A5E_DOWNTIME_ACTIVITIES = [
  'craft', 'gather-information', 'recovery', 'religious-devotion', 'research', 'spellcraft', 'train', 'work',
] as const;
export type A5eDowntimeActivity = typeof A5E_DOWNTIME_ACTIVITIES[number];
export type A5eInformationObscurity = 'uncommon' | 'esoteric' | 'hidden' | 'secret';
export type A5eDevotionSimilarity = 'strongly-aligned' | 'aligned' | 'neutral' | 'opposed' | 'strongly-opposed';

export interface A5eDevotionActivitySpec {
  dc: number;
  offeringGp: number;
  label: string;
}

export type A5eWorkDifficulty = 'easy' | 'average' | 'hard' | 'very-hard';
export interface A5eWorkActivitySpec {
  dc: number;
  lifestyle: 'poor' | 'moderate' | 'rich';
  earningsDice: 1 | 3 | 6 | 10;
}

const WORK_DIFFICULTY: Readonly<Record<A5eWorkDifficulty, A5eWorkActivitySpec>> = {
  easy: { dc: 10, lifestyle: 'poor', earningsDice: 1 },
  average: { dc: 15, lifestyle: 'moderate', earningsDice: 3 },
  hard: { dc: 20, lifestyle: 'rich', earningsDice: 6 },
  'very-hard': { dc: 25, lifestyle: 'rich', earningsDice: 10 },
};

/** A5E SRD Adventuring §8 Work table (legal work). */
export function a5eWorkActivitySpec(difficulty: A5eWorkDifficulty): A5eWorkActivitySpec {
  return WORK_DIFFICULTY[difficulty];
}

export function isA5eWorkDifficulty(value: unknown): value is A5eWorkDifficulty {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(WORK_DIFFICULTY, value);
}

const DEVOTION_SIMILARITY: Readonly<Record<A5eDevotionSimilarity, A5eDevotionActivitySpec>> = {
  'strongly-aligned': { dc: 10, offeringGp: 10, label: 'Сильно соответствует' },
  aligned: { dc: 15, offeringGp: 25, label: 'Соответствует' },
  neutral: { dc: 20, offeringGp: 50, label: 'Нейтрально' },
  opposed: { dc: 25, offeringGp: 100, label: 'Противоречит' },
  'strongly-opposed': { dc: 30, offeringGp: 500, label: 'Резко противоречит' },
};

export const A5E_DEVOTION_SIMILARITIES: readonly A5eDevotionSimilarity[] = [
  'strongly-aligned', 'aligned', 'neutral', 'opposed', 'strongly-opposed',
];

/** A5E SRD Adventuring §8: the Narrator rates the character's ethos against the deity. */
export function a5eDevotionActivitySpec(similarity: A5eDevotionSimilarity): A5eDevotionActivitySpec {
  return DEVOTION_SIMILARITY[similarity];
}

/** One Devotion check grants one favor plus one per full 5 points above its DC. */
export function a5eDevotionFavorAward(total: number, dc: number): number {
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(dc) || dc < 1) throw new RangeError('A5E devotion needs integer total and positive DC');
  return total < dc ? 0 : 1 + Math.floor((total - dc) / 5);
}

export interface A5eInformationActivitySpec {
  dc: number;
  weeks: number;
  minimumCostGp: number;
  costLabel: string;
  skill: 'investigation' | 'arcana-or-history';
}

export interface A5eDowntimeCoinStack {
  stackId: string;
  itemId: string;
  qty: number;
}

export interface A5eDowntimeCoinPayment {
  stackId: string;
  qty: number;
}

/** A private, event-sourced information project that can span several downtime periods. */
export interface A5eInformationProject {
  id: string;
  actorId: string;
  actorName: string;
  activity: 'gather-information' | 'research';
  subject: string;
  obscurity: A5eInformationObscurity;
  skill: SkillId;
  suitableLibrary?: boolean;
  requiredWeeks: number;
  completedWeeks: number;
  costPaidGp: number;
  createdSec: number;
  updatedSec: number;
  source: 'a5e-srd:adventuring-8';
  status: 'active' | 'succeeded' | 'failed';
  result?: A5eInformationCheckOutcome;
  lastCheckTotal?: number;
}

/** The deliberately narrow Train slice: one manually named language learned with a confirmed tutor. */
export interface A5eLanguageTrainingProject {
  id: string;
  actorId: string;
  actorName: string;
  activity: 'train';
  training: {
    languageId: string;
    languageName: string;
    tutorName: string;
    tutorConfirmed: true;
    intelligenceModifier: number;
    requiredMonths: number;
    completedMonths: number;
  };
  lastStep: A5eLanguageTrainingStep;
  costPaidGp: number;
  createdSec: number;
  updatedSec: number;
  source: 'a5e-srd:adventuring-8';
  status: 'active' | 'succeeded';
}

export type A5eDowntimeProject = A5eInformationProject | A5eLanguageTrainingProject;

export interface A5eDowntimeProjectStep {
  beforeWeeks: number;
  creditedWeeks: number;
  afterWeeks: number;
  requiredWeeks: number;
  completes: boolean;
  checkOutcome?: A5eInformationCheckOutcome;
}

export interface A5eLanguageTrainingStep {
  period: Exclude<A5eDowntimePeriod, 'tenday'>;
  beforeMonths: number;
  creditedMonths: number;
  afterMonths: number;
  requiredMonths: number;
  costChargedGp: number;
  completes: boolean;
}

export function a5eLanguageId(languageName: string): string {
  const normalized = languageName.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
  if (!normalized) throw new RangeError('A5E language training needs a language name');
  return `trained-language:${encodeURIComponent(normalized)}`;
}

/** Full calendar intervals only; a tenday cannot be converted into a Train month. */
export function a5eTrainingPeriodMonths(period: A5eDowntimePeriod): number {
  switch (period) {
    case 'month': return 1;
    case 'season': return 3;
    case 'year': return 12;
    case 'tenday': throw new RangeError('A5E Train language progress requires a full month, season, or year');
  }
}

export function newA5eLanguageTrainingProjectId(
  projects: readonly A5eDowntimeProject[],
  actorId: string,
  languageName: string,
): string {
  const normalized = languageName.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
  if (!actorId.trim() || !normalized) throw new RangeError('A5E language training needs an actor and language');
  const base = `a5e-train-language:${encodeURIComponent(actorId)}:${encodeURIComponent(normalized)}`;
  const ids = new Set(projects.map(project => project.id));
  if (!ids.has(base)) return base;
  for (let attempt = 2; attempt < Number.MAX_SAFE_INTEGER; attempt += 1) {
    const candidate = `${base}:${attempt}`;
    if (!ids.has(candidate)) return candidate;
  }
  throw new RangeError('A5E language-training project ID space exhausted');
}

export function a5eLanguageTrainingStep(
  period: A5eDowntimePeriod,
  project: Pick<A5eLanguageTrainingProject['training'], 'requiredMonths' | 'completedMonths'>,
): A5eLanguageTrainingStep {
  if (period === 'tenday') throw new RangeError('A5E Train language progress requires a full month, season, or year');
  const periodMonths = a5eTrainingPeriodMonths(period);
  if (!Number.isSafeInteger(project.requiredMonths) || project.requiredMonths < 1
    || !Number.isSafeInteger(project.completedMonths) || project.completedMonths < 0
    || project.completedMonths >= project.requiredMonths) {
    throw new RangeError('A5E language training project needs remaining, positive months');
  }
  const afterMonths = Math.min(project.requiredMonths, project.completedMonths + periodMonths);
  const creditedMonths = afterMonths - project.completedMonths;
  return {
    period,
    beforeMonths: project.completedMonths,
    creditedMonths,
    afterMonths,
    requiredMonths: project.requiredMonths,
    costChargedGp: creditedMonths * 50,
    completes: afterMonths >= project.requiredMonths,
  };
}

/** Total coin value carried by one character for an information activity, in copper pieces. */
export function a5eDowntimeCoinBalance(stacks: readonly A5eDowntimeCoinStack[]): number {
  return stacks.reduce((total, stack) => {
    if (!isCoinId(stack.itemId) || !Number.isSafeInteger(stack.qty) || stack.qty < 0) return total;
    const next = total + stack.qty * COIN_BY_ID[stack.itemId].copperValue;
    if (!Number.isSafeInteger(next)) throw new RangeError('A5E downtime coin balance exceeds the safe integer range');
    return next;
  }, 0);
}

/**
 * Plan exact payment from existing character-carried coin stacks for A5E SRD §8 minimum costs.
 * No coins are created or exchanged: the caller records the returned quantities with ITEM_LOST.
 */
export function planA5eDowntimeCoinPayment(
  stacks: readonly A5eDowntimeCoinStack[],
  costGp: number,
): A5eDowntimeCoinPayment[] | null {
  if (!Number.isSafeInteger(costGp) || costGp < 1) throw new RangeError('A5E downtime cost must be a positive integer number of gp');
  const target = costGp * COIN_BY_ID['coin:gp'].copperValue;
  if (!Number.isSafeInteger(target)) throw new RangeError('A5E downtime cost exceeds the safe integer range');

  const usable = stacks.flatMap((stack, index) => {
    if (!isCoinId(stack.itemId) || !Number.isSafeInteger(stack.qty) || stack.qty < 1 || !stack.stackId.trim()) return [];
    return [{ stackId: stack.stackId, qty: Math.min(stack.qty, Math.floor(target / COIN_BY_ID[stack.itemId].copperValue)), value: COIN_BY_ID[stack.itemId].copperValue, index }];
  }).filter(stack => stack.qty > 0);

  const reachable = new Uint8Array(target + 1);
  const previous = new Int32Array(target + 1);
  const chunkAt = new Int32Array(target + 1);
  previous.fill(-1);
  chunkAt.fill(-1);
  reachable[0] = 1;
  const chunks: { stackIndex: number; qty: number }[] = [];

  for (const stack of usable) {
    let remaining = stack.qty;
    let chunkSize = 1;
    while (remaining > 0) {
      const count = Math.min(chunkSize, remaining);
      const value = count * stack.value;
      const chunkIndex = chunks.length;
      chunks.push({ stackIndex: stack.index, qty: count });
      for (let amount = target; amount >= value; amount -= 1) {
        if (!reachable[amount] && reachable[amount - value]) {
          reachable[amount] = 1;
          previous[amount] = amount - value;
          chunkAt[amount] = chunkIndex;
        }
      }
      remaining -= count;
      chunkSize *= 2;
    }
  }

  if (!reachable[target]) return null;
  const paidByStack = new Map<string, number>();
  let amount = target;
  while (amount > 0) {
    const chunk = chunks[chunkAt[amount]];
    const stack = usable.find(item => item.index === chunk.stackIndex)!;
    paidByStack.set(stack.stackId, (paidByStack.get(stack.stackId) ?? 0) + chunk.qty);
    amount = previous[amount];
  }
  return [...paidByStack].map(([stackId, qty]) => ({ stackId, qty }));
}

const INFORMATION_OBSCURITY: Readonly<Record<A5eInformationObscurity, Omit<A5eInformationActivitySpec, 'skill'>>> = {
  uncommon: { dc: 10, weeks: 1, minimumCostGp: 10, costLabel: '10 gp' },
  esoteric: { dc: 15, weeks: 2, minimumCostGp: 25, costLabel: '25 gp' },
  hidden: { dc: 20, weeks: 3, minimumCostGp: 100, costLabel: '100 gp' },
  secret: { dc: 25, weeks: 5, minimumCostGp: 500, costLabel: '500+ gp' },
};

/** A5E SRD Adventuring §8 tables for Gather Information and Research. */
export function a5eInformationActivitySpec(activity: 'gather-information' | 'research', obscurity: A5eInformationObscurity): A5eInformationActivitySpec {
  return { ...INFORMATION_OBSCURITY[obscurity], skill: activity === 'gather-information' ? 'investigation' : 'arcana-or-history' };
}
export type A5eInformationCheckOutcome = 'success' | 'success-by-5' | 'failure' | 'failure-by-5';
export function a5eInformationCheckOutcome(total: number, dc: number): A5eInformationCheckOutcome {
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(dc) || dc < 1) throw new RangeError('A5E information check needs integer total and positive DC');
  if (total >= dc + 5) return 'success-by-5';
  if (total >= dc) return 'success';
  if (total <= dc - 5) return 'failure-by-5';
  return 'failure';
}

/**
 * Work credited to an information activity this period. A normal tenday is one workweek by table rule;
 * extended periods use the A5E SRD §8 success/failure bands for the selected project check.
 */
export function a5eDowntimeProjectStep(
  period: A5eDowntimePeriod,
  project: Pick<A5eInformationProject, 'requiredWeeks' | 'completedWeeks'>,
  checkTotal?: number,
  dc?: number,
): A5eDowntimeProjectStep {
  if (!Number.isSafeInteger(project.requiredWeeks) || project.requiredWeeks < 1
    || !Number.isSafeInteger(project.completedWeeks) || project.completedWeeks < 0
    || project.completedWeeks >= project.requiredWeeks) {
    throw new RangeError('A5E downtime project needs remaining, positive workweeks');
  }
  let creditedWeeks: number;
  let checkOutcome: A5eInformationCheckOutcome | undefined;
  if (period === 'tenday') {
    creditedWeeks = 1;
  } else {
    if (checkTotal === undefined || dc === undefined) throw new RangeError('Extended A5E downtime requires the selected activity check');
    checkOutcome = a5eInformationCheckOutcome(checkTotal, dc);
    creditedWeeks = a5eLongDowntimeWeeks(period, checkOutcome === 'success-by-5' ? 'success' : checkOutcome === 'failure-by-5' ? 'failure-by-5' : checkOutcome);
  }
  const afterWeeks = Math.min(project.requiredWeeks, project.completedWeeks + creditedWeeks);
  const completes = afterWeeks >= project.requiredWeeks;
  if (completes && checkTotal === undefined) throw new RangeError('The final A5E information check is required when the project reaches its time requirement');
  return { beforeWeeks: project.completedWeeks, creditedWeeks: afterWeeks - project.completedWeeks, afterWeeks, requiredWeeks: project.requiredWeeks, completes, ...(checkOutcome ? { checkOutcome } : {}) };
}

/** Stable project id, with a numbered attempt suffix when an earlier project for this query already exists. */
export function newA5eDowntimeProjectId(
  projects: readonly A5eDowntimeProject[],
  record: A5eDowntimeActivityRecord,
): string {
  if ((record.activity !== 'gather-information' && record.activity !== 'research') || !record.information?.subject.trim()) {
    throw new RangeError('A5E information project needs an activity and subject');
  }
  const info = record.information!;
  const normalized = info.subject.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
  const base = `a5e-downtime:${encodeURIComponent(record.actorId)}:${record.activity}:${info.obscurity}:${encodeURIComponent(normalized)}`;
  const ids = new Set(projects.map(project => project.id));
  if (!ids.has(base)) return base;
  for (let attempt = 2; attempt < Number.MAX_SAFE_INTEGER; attempt += 1) {
    const candidate = `${base}:${attempt}`;
    if (!ids.has(candidate)) return candidate;
  }
  throw new RangeError('A5E downtime project ID space exhausted');
}

/** Prepare one information-project update and an activity record for the private downtime journal. */
export function prepareA5eDowntimeProject(
  period: A5eDowntimePeriod,
  record: A5eDowntimeActivityRecord,
  existing: A5eInformationProject | undefined,
  atSec: number,
): { project: A5eDowntimeProject; record: A5eDowntimeActivityRecord } {
  const activity = record.activity;
  if (activity !== 'gather-information' && activity !== 'research') throw new RangeError('Only Gather Information and Research use information projects');
  const info = record.information;
  if (!info?.subject.trim()) throw new RangeError('Information project needs a subject');
  const spec = a5eInformationActivitySpec(activity, info.obscurity);
  const validSkill = activity === 'gather-information' ? info.skill === 'investigation' : info.skill === 'arcana' || info.skill === 'history';
  if (!validSkill) throw new RangeError('Invalid A5E information-project skill');
  if (existing && (existing.status !== 'active' || existing.actorId !== record.actorId || existing.activity !== activity
    || existing.subject !== info.subject.trim() || existing.obscurity !== info.obscurity || existing.skill !== info.skill
    || (existing.suitableLibrary === true) !== (info.suitableLibrary === true) || info.projectId !== existing.id)) {
    throw new RangeError('Selected A5E information project no longer matches this activity');
  }
  const projectId = info.projectId?.trim();
  if (!projectId) throw new RangeError('A5E information project needs a stable id');
  const base = existing ?? {
    id: projectId,
    actorId: record.actorId,
    actorName: record.actorName,
    activity,
    subject: info.subject.trim(),
    obscurity: info.obscurity,
    skill: info.skill,
    ...(activity === 'research' && info.suitableLibrary ? { suitableLibrary: true } : {}),
    requiredWeeks: spec.weeks,
    completedWeeks: 0,
    costPaidGp: activity === 'research' && info.suitableLibrary ? 0 : spec.minimumCostGp,
    createdSec: atSec,
    updatedSec: atSec,
    source: 'a5e-srd:adventuring-8' as const,
    status: 'active' as const,
  };
  const step = a5eDowntimeProjectStep(period, base, info.check?.total, spec.dc);
  const outcome = info.check ? a5eInformationCheckOutcome(info.check.total, spec.dc) : undefined;
  const terminalStatus = step.completes ? outcome === 'success' || outcome === 'success-by-5' ? 'succeeded' : 'failed' : 'active';
  const project: A5eDowntimeProject = {
    ...base,
    completedWeeks: step.afterWeeks,
    updatedSec: atSec,
    status: terminalStatus,
    ...(outcome ? { result: outcome, lastCheckTotal: info.check!.total } : {}),
  };
  return {
    project,
    record: {
      ...record,
      information: {
        ...info,
        subject: info.subject.trim(),
        progress: step,
        paymentCharged: !existing,
        ...(!step.completes || terminalStatus !== 'succeeded' ? { target: undefined, facts: [] } : {}),
      },
    },
  };
}

/** Prepare one tutor-based language-training period without a check or generic extended roll. */
export function prepareA5eLanguageTrainingProject(
  period: A5eDowntimePeriod,
  record: A5eDowntimeActivityRecord,
  existing: A5eLanguageTrainingProject | undefined,
  atSec: number,
): { project: A5eLanguageTrainingProject; record: A5eDowntimeActivityRecord } {
  const training = record.training;
  if (record.activity !== 'train' || !training?.languageName.trim() || !training.tutorName.trim()
    || training.tutorConfirmed !== true || record.extendedCheck) {
    throw new RangeError('A5E Train needs a language, tutor name, Narrator confirmation, and no extended check');
  }
  const languageName = training.languageName.normalize('NFKC').trim().replace(/\s+/g, ' ');
  const tutorName = training.tutorName.normalize('NFKC').trim().replace(/\s+/g, ' ');
  const languageId = a5eLanguageId(languageName);
  const spec = a5eTrainLanguageOrTool(training.intelligenceModifier, 'tutor');
  if (spec.timeUnit !== 'month' || spec.costGp !== spec.duration * 50) throw new RangeError('Unsupported A5E tutor training terms');
  if (existing && (existing.status !== 'active' || existing.actorId !== record.actorId
    || existing.training.languageId !== languageId || existing.training.languageName !== languageName
    || existing.training.tutorName !== tutorName || existing.training.tutorConfirmed !== true
    || existing.training.intelligenceModifier !== training.intelligenceModifier
    || existing.training.requiredMonths !== spec.duration || training.projectId !== existing.id)) {
    throw new RangeError('Selected A5E language-training project no longer matches this activity');
  }
  const projectId = training.projectId?.trim();
  if (!projectId) throw new RangeError('A5E language training needs a stable project id');
  const base: Omit<A5eLanguageTrainingProject, 'lastStep'> = existing ?? {
    id: projectId,
    actorId: record.actorId,
    actorName: record.actorName,
    activity: 'train',
    training: {
      languageId,
      languageName,
      tutorName,
      tutorConfirmed: true,
      intelligenceModifier: training.intelligenceModifier,
      requiredMonths: spec.duration,
      completedMonths: 0,
    },
    costPaidGp: 0,
    createdSec: atSec,
    updatedSec: atSec,
    source: 'a5e-srd:adventuring-8',
    status: 'active',
  };
  const progress = a5eLanguageTrainingStep(period, base.training);
  const project: A5eLanguageTrainingProject = {
    ...base,
    training: { ...base.training, completedMonths: progress.afterMonths },
    lastStep: progress,
    costPaidGp: base.costPaidGp + progress.costChargedGp,
    updatedSec: atSec,
    status: progress.completes ? 'succeeded' : 'active',
  };
  return {
    project,
    record: { ...record, training: { ...training, languageId, languageName, tutorName, progress } },
  };
}

/** Prepare project updates and progress annotations from the current private campaign state. */
export function prepareA5eDowntimePeriod(
  period: A5eDowntimePeriod,
  records: readonly A5eDowntimeActivityRecord[],
  projects: readonly A5eDowntimeProject[],
  atSec: number,
): { records: readonly A5eDowntimeActivityRecord[]; updates: readonly A5eDowntimeProject[] } {
  const updates: A5eDowntimeProject[] = [];
  const planned = records.map(record => {
    if (record.activity === 'train') {
      const projectId = record.training?.projectId;
      const existing = projectId ? projects.find((project): project is A5eLanguageTrainingProject => project.id === projectId && project.activity === 'train') : undefined;
      const next = prepareA5eLanguageTrainingProject(period, record, existing, atSec);
      if (!existing && projects.some(project => project.id === next.project.id)) throw new RangeError('A5E project id already exists');
      updates.push(next.project);
      return next.record;
    }
    if (record.activity !== 'gather-information' && record.activity !== 'research') return record;
    const projectId = record.information?.projectId;
    const existing = projectId ? projects.find((project): project is A5eInformationProject => project.id === projectId && project.activity !== 'train') : undefined;
    const next = prepareA5eDowntimeProject(period, record, existing, atSec);
    if (!existing && projects.some(project => project.id === next.project.id)) throw new RangeError('A5E project id already exists');
    updates.push(next.project);
    return next.record;
  });
  return { records: planned, updates };
}

export function downtimeTimeStep(period: A5eDowntimePeriod): { tempo: 'tenday' | 'season' | 'year'; steps: number } {
  switch (period) {
    case 'tenday': return { tempo: 'tenday', steps: 1 };
    case 'month': return { tempo: 'tenday', steps: 3 };
    case 'season': return { tempo: 'season', steps: 1 };
    case 'year': return { tempo: 'year', steps: 1 };
  }
}

export interface A5eDowntimeActivityRecord {
  actorId: string;
  actorName: string;
  activity: A5eDowntimeActivity;
  /** Master-entered outcome. The activity-specific checks and rewards need an explicit rules source. */
  outcome: string;
  relaxStrife?: boolean;
  /** Explicit DC and total entered from the selected activity's sourced check for extended downtime. */
  extendedCheck?: { dc?: number; total?: number };
  information?: {
    obscurity: A5eInformationObscurity;
    subject: string;
    skill: SkillId;
    /** Research may waive fees only when the Narrator confirms access to a suitable library. */
    suitableLibrary?: boolean;
    check?: { total: number; die?: number; modifier?: number };
    target?: { ref: EntityRef; name: string };
    facts?: readonly { label: string; value: string }[];
    projectId?: string;
    progress?: A5eDowntimeProjectStep;
    paymentCharged?: boolean;
  };
  training?: {
    languageId?: string;
    languageName: string;
    tutorName: string;
    intelligenceModifier: number;
    tutorConfirmed: boolean;
    projectId?: string;
    progress?: A5eLanguageTrainingStep;
  };
  devotion?: {
    deityRef: EntityRef;
    deityName: string;
    similarity: A5eDevotionSimilarity;
    skill: 'nature' | 'religion';
    sacredSiteConfirmed: boolean;
    offeringWaived?: boolean;
    offeringWaiverReason?: string;
    check?: { total: number; die?: number; modifier?: number };
  };
  work?: {
    difficulty: A5eWorkDifficulty;
    skill: SkillId;
    check?: { total: number; die?: number; modifier?: number };
    disadvantageApplied?: boolean;
    earnings?: { dice?: readonly number[]; gp: number };
  };
}

const ACTIVITY_LABELS: Readonly<Record<A5eDowntimeActivity, string>> = {
  craft: 'Ремесло',
  'gather-information': 'Сбор сведений',
  recovery: 'Восстановление',
  'religious-devotion': 'Религиозное служение',
  research: 'Исследование',
  spellcraft: 'Магическое ремесло',
  train: 'Тренировка',
  work: 'Работа',
};

/**
 * Validate and format a single private journal entry for one downtime period.
 * The engine remains responsible for advancing time; activity-specific numbers/effects are not inferred here.
 */
export function a5eDowntimeJournalText(
  period: A5eDowntimePeriod,
  participantIds: readonly string[],
  records: readonly A5eDowntimeActivityRecord[],
): string {
  const shape = downtimePeriodShape(period);
  const expected = new Set(participantIds);
  if (!expected.size || expected.size !== participantIds.length || participantIds.some(id => !id.trim())) {
    throw new RangeError('A5E downtime needs a non-empty, unique participant list');
  }
  if (records.length !== expected.size) throw new RangeError('Every downtime participant needs exactly one activity');
  const seen = new Set<string>();
  const lines = records.map(record => {
    if (!expected.has(record.actorId) || seen.has(record.actorId) || !record.actorName.trim()
      || (!record.outcome.trim() && !(record.activity === 'work' && record.work?.check) && record.activity !== 'train')) {
      throw new RangeError('Downtime activity records must match participants and include an outcome');
    }
    if (!(A5E_DOWNTIME_ACTIVITIES as readonly string[]).includes(record.activity)) {
      throw new RangeError('Unknown A5E downtime activity');
    }
    const informationActivity = record.activity === 'gather-information' || record.activity === 'research';
    if (informationActivity && (!record.information?.subject.trim() || !(record.information.obscurity in INFORMATION_OBSCURITY))) {
      throw new RangeError('Gather Information and Research need a target and obscurity category');
    }
    if (!informationActivity && record.information) throw new RangeError('Information target is only valid for Gather Information or Research');
    if (record.activity !== 'train' && record.training) throw new RangeError('Language-training details are only valid for Train');
    if (record.activity === 'train') {
      const training = record.training;
      if (!training?.languageName.trim() || !training.tutorName.trim() || training.tutorConfirmed !== true
        || !Number.isSafeInteger(training.intelligenceModifier) || training.languageId !== a5eLanguageId(training.languageName)
        || !training.projectId?.trim() || !training.progress
        || record.extendedCheck || record.information || record.devotion || record.work) {
        throw new RangeError('A5E Train needs a confirmed tutor, named language, project progress, and no unrelated checks');
      }
      const progress = training.progress;
      let expected: A5eLanguageTrainingStep;
      try { expected = a5eLanguageTrainingStep(period, { requiredMonths: progress.requiredMonths, completedMonths: progress.beforeMonths }); }
      catch { throw new RangeError('A5E Train needs a full, valid calendar interval and remaining project time'); }
      if (progress.period !== expected.period || progress.beforeMonths !== expected.beforeMonths
        || progress.creditedMonths !== expected.creditedMonths || progress.afterMonths !== expected.afterMonths
        || progress.requiredMonths !== expected.requiredMonths || progress.costChargedGp !== expected.costChargedGp
        || progress.completes !== expected.completes) {
        throw new RangeError('A5E language-training progress or monthly cost is invalid');
      }
    }
    if (record.information?.suitableLibrary && record.activity !== 'research') throw new RangeError('A suitable library can waive Research costs only');
    if (record.activity !== 'religious-devotion' && record.devotion) throw new RangeError('Devotion details are only valid for Religious Devotion');
    if (record.activity !== 'work' && record.work) throw new RangeError('Work details are only valid for Work');
    if (record.activity === 'work') {
      if (period !== 'tenday') throw new RangeError('Legal Work is only automated for a single tenday');
      const work = record.work;
      if (!work || !isA5eWorkDifficulty(work.difficulty) || !isSkillId(work.skill) || !work.check || typeof work.disadvantageApplied !== 'boolean') {
        throw new RangeError('Legal Work needs a sourced difficulty, skill, and check');
      }
      const spec = a5eWorkActivitySpec(work.difficulty);
      const check = work.check;
      if (!Number.isSafeInteger(check.total) || (check.die !== undefined && (!Number.isInteger(check.die) || check.die < 1 || check.die > 20))
        || (check.modifier !== undefined && !Number.isSafeInteger(check.modifier))
        || (check.die !== undefined && (check.modifier === undefined || check.total !== check.die + check.modifier))) {
        throw new RangeError('Invalid A5E Work check');
      }
      if (check.total >= spec.dc) {
        const earnings = work.earnings;
        if (!earnings || !Number.isSafeInteger(earnings.gp) || earnings.gp < spec.earningsDice || earnings.gp > spec.earningsDice * 6
          || (earnings.dice !== undefined && (earnings.dice.length !== spec.earningsDice || earnings.dice.some(die => !Number.isInteger(die) || die < 1 || die > 6)
            || earnings.gp !== earnings.dice.reduce((sum, die) => sum + die, 0)))) {
          throw new RangeError('Successful A5E Work needs its exact sourced earnings roll');
        }
      } else if (work.earnings) {
        throw new RangeError('Failed A5E Work cannot earn coin');
      }
    }
    if (record.activity === 'religious-devotion') {
      if (period !== 'tenday') throw new RangeError('Religious Devotion favor is only automated for a single tenday; longer-period reward scaling remains manual');
      const devotion = record.devotion;
      const deity = devotion && parseRef(devotion.deityRef);
      if (!devotion || deity?.kind !== 'deity' || !devotion.deityName.trim() || !A5E_DEVOTION_SIMILARITIES.includes(devotion.similarity)
        || (devotion.skill !== 'nature' && devotion.skill !== 'religion') || devotion.sacredSiteConfirmed !== true || !devotion.check) {
        throw new RangeError('Religious Devotion needs a deity, confirmed sacred site, sourced similarity, and check');
      }
      if (devotion.offeringWaived !== undefined && typeof devotion.offeringWaived !== 'boolean') throw new RangeError('Invalid A5E offering waiver');
      if (devotion.offeringWaived && !devotion.offeringWaiverReason?.trim()) throw new RangeError('A5E offering waiver needs the Narrator-approved character action');
      const check = devotion.check;
      if (!Number.isSafeInteger(check.total) || (check.die !== undefined && (!Number.isInteger(check.die) || check.die < 1 || check.die > 20))
        || (check.modifier !== undefined && !Number.isSafeInteger(check.modifier))
        || (check.die !== undefined && (check.modifier === undefined || check.total !== check.die + check.modifier))) {
        throw new RangeError('Invalid A5E Religious Devotion check');
      }
    }
    seen.add(record.actorId);
    const details = record.activity === 'train' && record.training
      ? (() => {
        const training = record.training!;
        const progress = training.progress!;
        return ` · язык ${training.languageName} · наставник ${training.tutorName} (подтверждён мастером) · ${progress.afterMonths}/${progress.requiredMonths} мес. · оплачено ${progress.costChargedGp} gp за этот промежуток${progress.completes ? ' · язык освоен' : ''}`;
      })()
      : informationActivity && record.information
      ? (() => {
        const spec = a5eInformationActivitySpec(record.activity as 'gather-information' | 'research', record.information!.obscurity);
        const validSkill = record.activity === 'gather-information'
          ? record.information!.skill === 'investigation'
          : record.information!.skill === 'arcana' || record.information!.skill === 'history';
        const check = record.information!.check;
        if (!validSkill || (check && !Number.isSafeInteger(check.total))) throw new RangeError('Invalid A5E information check');
        if (check?.die !== undefined && (check.die < 1 || check.die > 20 || !Number.isInteger(check.die))) throw new RangeError('A5E information check die must be 1–20');
        if (check?.modifier !== undefined && !Number.isSafeInteger(check.modifier)) throw new RangeError('A5E information check modifier must be an integer');
        if (check?.die !== undefined && (check.modifier === undefined || check.total !== check.die + check.modifier)) throw new RangeError('A5E information die and modifier do not match the total');
        const outcome = check ? a5eInformationCheckOutcome(check.total, spec.dc) : undefined;
        const progress = record.information!.progress;
        const expectedFacts = progress?.completes ? (outcome === 'success-by-5' ? 2 : outcome === 'success' ? 1 : 0)
          : (!progress && outcome ? (outcome === 'success-by-5' ? 2 : outcome === 'success' ? 1 : 0) : 0);
        if (progress && (progress.requiredWeeks !== spec.weeks || progress.afterWeeks < progress.beforeWeeks
          || progress.afterWeeks > progress.requiredWeeks || progress.completes !== (progress.afterWeeks >= progress.requiredWeeks)
          || (progress.completes && !check) || (!progress.completes && record.information!.facts?.length))) {
          throw new RangeError('A5E project progress and check do not match');
        }
        const facts = record.information!.facts ?? [];
        if (facts.length !== expectedFacts || (expectedFacts > 0 && !record.information!.target)) throw new RangeError(`A5E ${outcome ?? 'project'} requires ${expectedFacts} confirmed fact(s) linked to a campaign entity`);
        if (facts.some(fact => !fact.label.trim() || !fact.value.trim()) || new Set(facts.map(fact => fact.label.trim())).size !== facts.length) throw new RangeError('A5E downtime facts need unique labels and non-empty values');
        const resultText: Readonly<Record<A5eInformationCheckOutcome, string>> = { success: 'успех · запрошенные сведения; +1 Key Knowledge', 'success-by-5': 'успех на 5+ · дополнительный факт; +2 Key Knowledge всего', failure: 'провал · сведения не получены', 'failure-by-5': 'провал на 5+ · ложные сведения или осложнение' };
        const factText = facts.length ? ` · ${facts.map(fact => `${fact.label.trim()}: ${fact.value.trim()}`).join(' / ')}` : '';
        const paymentText = record.information!.paymentCharged === false ? 'оплата уже внесена в прошлый промежуток'
          : record.activity === 'research' && record.information!.suitableLibrary
          ? 'подходящая библиотека подтверждена мастером · расходы на исследование отменены'
          : `стоимость ${spec.costLabel} (списан минимум ${spec.minimumCostGp} gp)`;
        const checkResult = outcome ? progress && !progress.completes ? `проверка прогресса: ${outcome}` : resultText[outcome] : '';
        const checkText = check ? ` · ${record.information!.skill} ${check.total} против DC ${spec.dc} · ${checkResult}` : '';
        const progressText = progress ? ` · проект ${progress.afterWeeks}/${progress.requiredWeeks} нед.` : '';
        return ` · ${record.information!.subject.trim()}${record.information!.target ? ` → ${record.information!.target.name}` : ''}${checkText} · нужно ${spec.weeks} нед.${progressText} · ${paymentText}${factText}`;
      })()
      : record.activity === 'religious-devotion' && record.devotion
      ? (() => {
        const spec = a5eDevotionActivitySpec(record.devotion!.similarity);
        const check = record.devotion!.check!;
        const award = a5eDevotionFavorAward(check.total, spec.dc);
        return ` · ${record.devotion!.deityName} · ${spec.label.toLowerCase()} · ${record.devotion!.skill} ${check.total} против DC ${spec.dc} · ${record.devotion!.offeringWaived ? `подношение отменено мастером: ${record.devotion!.offeringWaiverReason!.trim()}` : `подношение ${spec.offeringGp} gp`}${record.devotion!.sacredSiteConfirmed ? ' · священное место подтверждено' : ''} · ${award ? `+${award} favor` : 'favor не получена'}`;
      })()
      : record.activity === 'work' && record.work
      ? (() => {
        const spec = a5eWorkActivitySpec(record.work!.difficulty);
        const check = record.work!.check!;
        const succeeded = check.total >= spec.dc;
        return ` · legal · ${record.work!.skill} ${check.total} против DC ${spec.dc}${succeeded
          ? ` · lifestyle ${spec.lifestyle} · доход ${spec.earningsDice}d6 = ${record.work!.earnings!.gp} gp`
          : ` · дохода и lifestyle нет${check.total <= 5 ? ' · помеха на следующую проверку работы тем же навыком' : ''}`}`;
      })()
      : '';
    let extended = '';
    if (record.activity === 'train') {
      if (period === 'tenday') throw new RangeError('A5E Train language progress cannot use a tenday');
    } else if (period !== 'tenday') {
      const check = informationActivity ? record.information?.check : record.extendedCheck;
      const dc = informationActivity
        ? a5eInformationActivitySpec(record.activity as 'gather-information' | 'research', record.information!.obscurity).dc
        : record.extendedCheck?.dc;
      if (!check || check.total === undefined || !Number.isSafeInteger(check.total) || dc === undefined || !Number.isSafeInteger(dc)) throw new RangeError('Every extended downtime activity needs a sourced DC and check total');
      const result = resolveA5eLongDowntimeCheck(period, check.total, dc);
      const labels: Readonly<Record<A5eLongDowntimeResult, string>> = { success: 'успех', failure: 'провал', 'failure-by-5': 'провал на 5+' };
      extended = ` · длинная свёртка: ${check.total} против DC ${dc} — ${labels[result.result]}, зачтено ${result.successfulWeeks} нед.`;
    } else if (record.extendedCheck) {
      throw new RangeError('Extended check is only valid for month, season, or year downtime');
    }
    return `${record.actorName} — ${ACTIVITY_LABELS[record.activity]}${details}${extended}${record.outcome.trim() ? `: ${record.outcome.trim()}` : ''}${record.relaxStrife ? ' · «Развеяться» (−1 Strife)' : ''}`;
  });
  return `Промежуток A5E · ${period} · ${shape.calendarDays} дней (${shape.downtimeWeeks} нед.)\n${lines.join('\n')}`;
}

export interface DowntimePeriodShape {
  /** Calendar days advanced by the world clock. */
  calendarDays: number;
  /** A5E downtime weeks represented by the period. */
  downtimeWeeks: number;
  /** Activities per character in a short period, before long-period compression. */
  activitiesPerCharacter: number;
}

/**
 * Short downtime is one Harptos tenday, treated as one A5E week with five working days by table rule.
 * A5E long-period values count the weeks represented by the roll's result band.
 */
export function downtimePeriodShape(period: A5eDowntimePeriod): DowntimePeriodShape {
  switch (period) {
    case 'tenday': return { calendarDays: 10, downtimeWeeks: 1, activitiesPerCharacter: 1 };
    case 'month': return { calendarDays: 30, downtimeWeeks: 4, activitiesPerCharacter: 1 };
    case 'season': return { calendarDays: 90, downtimeWeeks: 12, activitiesPerCharacter: 1 };
    case 'year': return { calendarDays: 365, downtimeWeeks: 52, activitiesPerCharacter: 1 };
  }
}

/** Number of successful downtime weeks credited by A5E for a long-period activity result. */
export function a5eLongDowntimeWeeks(period: Exclude<A5eDowntimePeriod, 'tenday'>, result: A5eLongDowntimeResult): number {
  // A5E long-period compression as recorded in research/game-mechanics.md §4.8:
  // month 4/2/0, season 12/6/3, year 52/26/13 for success/failure/failure by 5+.
  const weeks = {
    month: { success: 4, failure: 2, 'failure-by-5': 0 },
    season: { success: 12, failure: 6, 'failure-by-5': 3 },
    year: { success: 52, failure: 26, 'failure-by-5': 13 },
  } satisfies Record<Exclude<A5eDowntimePeriod, 'tenday'>, Record<A5eLongDowntimeResult, number>>;
  return weeks[period][result];
}

/** Resolve an explicit A5E extended-downtime check; the caller must source the activity DC. */
export function resolveA5eLongDowntimeCheck(
  period: Exclude<A5eDowntimePeriod, 'tenday'>,
  total: number,
  dc: number,
): { result: A5eLongDowntimeResult; successfulWeeks: number } {
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(dc) || dc < 1) {
    throw new RangeError('A5E downtime check needs integer total and positive integer DC');
  }
  const result: A5eLongDowntimeResult = total >= dc ? 'success' : total <= dc - 5 ? 'failure-by-5' : 'failure';
  return { result, successfulWeeks: a5eLongDowntimeWeeks(period, result) };
}

