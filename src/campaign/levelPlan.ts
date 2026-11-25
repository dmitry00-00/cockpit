// Локальный дальний план: каждый уровень считается только существующими Д8-функциями.
// План — временные решения формы, не события и не мутация актора.
import type { Actor } from '../engine';
import { levelUp, levelUpPlan, LevelUpError, type LevelUpChoice } from './levelUp';
import { previewLevelUp, type LevelUpPreview } from './levelUpPreview';

export interface LevelPlanStep {
  level: number;
  choice: LevelUpChoice;
  preview?: Extract<LevelUpPreview, { kind: 'ready' }>;
}
export interface LevelPlanResult {
  /** Только полностью рассчитанные последовательные уровни. */
  steps: readonly LevelPlanStep[];
  /** Не полностью рассчитанный уровень с сохранённым решением и диагностикой. В steps/actor не включён. */
  candidate?: LevelPlanStep;
  /** Итог последнего полностью рассчитанного уровня; исходный актёр возвращается для пустого плана. */
  actor: Actor;
  validThrough: number;
  /** Текстовые умения без схемы выбора делают дальнейшую проекцию неполной. */
  limitation?: string;
  error?: string;
}

/** Рассчитать заполненный префикс плана. Результат не отправляет события и не мутирует вход. */
export function calculateLevelPlan(actor: Actor, targetLevel: number, choices: readonly LevelUpChoice[]): LevelPlanResult {
  const start = actor.sheet?.level;
  if (start === undefined) return { steps: [], actor, validThrough: 0, error: 'У персонажа нет листа.' };
  const target = Math.max(start, Math.min(20, Math.floor(targetLevel)));
  const count = Math.min(choices.length, target - start);
  const steps: LevelPlanStep[] = [];
  let current = actor;
  for (let i = 0; i < count; i++) {
    let level: number;
    try { level = levelUpPlan(current).level; }
    catch (e) { return { steps, actor: current, validThrough: current.sheet!.level, error: e instanceof Error ? e.message : String(e) }; }
    const selectedPlan = levelUpPlan(current, choices[i].subclassId);
    const unresolvedFeatureChoices = selectedPlan.featureChoices.filter(fc =>
      fc.unavailableReason || (choices[i].featureChoices?.[fc.id]?.length ?? 0) !== fc.required,
    );
    if (selectedPlan.unsupportedChoices.length || unresolvedFeatureChoices.length) {
      return {
        steps, candidate: { level, choice: choices[i] }, actor: current,
        validThrough: current.sheet!.level,
        limitation: `Для уровня ${level} расчёт неполон: ${[
          ...selectedPlan.unsupportedChoices,
          ...unresolvedFeatureChoices.map(fc => fc.unavailableReason ?? `не завершён выбор «${fc.label}» (${choices[i].featureChoices?.[fc.id]?.length ?? 0} из ${fc.required}).`),
        ].join(' ')}`,
      };
    }
    const preview = previewLevelUp(current, choices[i]);
    if (preview.kind === 'invalid') return { steps, actor: current, validThrough: current.sheet!.level, error: preview.reason };
    if (preview.warnings.length) {
      return {
        steps, candidate: { level, choice: choices[i], preview }, actor: current,
        validThrough: current.sheet!.level,
        limitation: `Для уровня ${level} расчёт неполон: ${preview.warnings.join(' ')}`,
      };
    }
    steps.push({ level, choice: choices[i], preview });
    current = preview.actor;
  }
  let error: string | undefined;
  if (steps.length < target - start) {
    try { levelUpPlan(current); }
    catch (e) { error = e instanceof LevelUpError ? e.message : e instanceof Error ? e.message : String(e); }
  }
  return { steps, actor: current, validThrough: current.sheet!.level, ...(error ? { error } : {}) };
}

/** Сохраняет выбор только если тот же расчёт Д8 принимает его. */
export function validatePlanChoice(actor: Actor, choice: LevelUpChoice): string | null {
  try { levelUp(actor, choice); return null; }
  catch (e) { return e instanceof Error ? e.message : String(e); }
}
