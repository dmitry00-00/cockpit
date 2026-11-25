import type { AbilityId, SkillId } from '../rules/srd/abilities';
import type { A5eStressEffect } from '../rules/a5e/strife';

/** A5E Tracked Conditions: effects of current Strife level stack with all lower levels. */
const STRIFE_LEVELS = [
  'Помеха проверкам Интеллекта, Мудрости и Харизмы.',
  'Помеха проверкам концентрации.',
  'В свой ход можно совершить действие или бонусное действие, но не оба.',
  'Помеха броскам атаки и спасброскам с Интеллектом, Мудростью или Харизмой.',
  'Кратковременный эффект ментального стресса по таблице A5E (d10, длительность 1d6 дней).',
  'Нельзя накладывать заклинания, кроме заговоров.',
  'Длительный эффект ментального стресса по таблице A5E (d10); он заменяет краткий эффект.',
] as const;

/** Краткая сводка A5E Strife для листа мастера; эффект каждого нижнего уровня сохраняется. */
export function strifeSummary(level: number): string[] {
  const current = Math.max(0, Math.min(7, Math.floor(level)));
  return STRIFE_LEVELS.slice(0, current);
}

export function strifeTooltip(level: number): string {
  return strifeSummary(level).map((effect, index) => `${index + 1}. ${effect}`).join('\n');
}

export type StrifeRollIntent =
  | { kind: 'check'; ability: AbilityId; skill?: SkillId; purpose?: 'detect-hidden-foe' | 'detect-danger-during-rest' | 'escape-combat-or-danger' | 'persuade-aid' | 'recall-knowledge' | 'resist-grapple-or-restraint' | 'end-combat' | 'find-lucky-charm'; targetAttitude?: 'friendly' | 'indifferent' | 'hostile'; socialPurpose?: 'avoid-combat' | 'dissuade-action' | 'deception-about-taken-item' }
  | { kind: 'concentration' }
  | { kind: 'attack'; ability?: AbilityId; firstAttackOfTurn?: boolean; charmMoreThan30Feet?: boolean }
  | { kind: 'save'; ability: AbilityId; purpose?: 'resist-grapple-or-restraint'; charmMoreThan30Feet?: boolean }
  | { kind: 'initiative' };

/** Whether the cumulative A5E Strife track imposes disadvantage on this d20 roll. */
export function strifeDisadvantage(level: number, intent: StrifeRollIntent): boolean {
  if (level >= 2 && intent.kind === 'concentration') return true;
  if (level >= 4 && (intent.kind === 'attack' || intent.kind === 'save')) {
    return intent.ability === 'int' || intent.ability === 'wis' || intent.ability === 'cha';
  }
  return level >= 1 && intent.kind === 'check'
    && (intent.ability === 'int' || intent.ability === 'wis' || intent.ability === 'cha');
}

export function strifeRollMode(enabled: boolean, level: number, intent: StrifeRollIntent): 'normal' | 'disadvantage' {
  return enabled && strifeDisadvantage(level, intent) ? 'disadvantage' : 'normal';
}

export type RollMode = 'normal' | 'advantage' | 'disadvantage';

/** Direct roll modifiers from the A5E SRD Mental Stress Effects; situation-dependent clauses stay manual. */
export function mentalStressRollMode(effect: A5eStressEffect | undefined, intent: StrifeRollIntent): RollMode {
  if (!effect) return 'normal';
  const skill = intent.kind === 'check' ? intent.skill : undefined;
  const check = intent.kind === 'check';
  const save = intent.kind === 'save';
  const initiative = intent.kind === 'initiative';
  const attack = intent.kind === 'attack';
  const id = effect.id;

  if (id === 'bewildered' && check && skill && ['deception', 'intimidation', 'performance', 'persuasion'].includes(skill)) return 'disadvantage';
  if (id === 'cowed' && check && skill === 'intimidation') return 'disadvantage';
  if (id === 'cowed' && check && skill === 'persuasion' && intent.socialPurpose === 'avoid-combat') return 'advantage';
  if (id === 'distraught') {
    if (intent.kind === 'check' && skill === 'persuasion' && intent.purpose === 'persuade-aid'
      && (intent.targetAttitude === 'friendly' || intent.targetAttitude === 'indifferent')) return 'advantage';
    if ((check && (skill === 'deception' || skill === 'performance')) || initiative) return 'disadvantage';
  }
  if (id === 'enraged' && check) return intent.ability === 'str' ? 'advantage' : 'disadvantage';
  if (id === 'flippant') {
    if (check && intent.ability === 'dex') return 'advantage';
    // A5E SRD: disadvantage on Wisdom checks and on saving throws (all abilities).
    if ((check && intent.ability === 'wis') || save) return 'disadvantage';
  }
  if (id === 'musical' && check && skill) {
    if (skill === 'performance') return 'advantage';
    if (skill === 'deception' || skill === 'intimidation' || skill === 'stealth') return 'disadvantage';
  }
  if (id === 'obsessed' && check && skill === 'stealth') return 'disadvantage';
  if (id === 'on-edge') {
    if ((check && skill === 'perception') || initiative) return 'advantage';
    if (check) return 'disadvantage';
  }
  if (id === 'sleepless' && check && skill === 'perception' && intent.purpose === 'detect-danger-during-rest') return 'advantage';
  if (id === 'sleepless') return 'normal';
  if (id === 'terrorized' && check && skill === 'perception') return 'advantage';
  if (id === 'terrorized' && check && intent.purpose === 'escape-combat-or-danger'
    && ['str', 'dex', 'con'].includes(intent.ability)) return 'advantage';

  if (id === 'covetous') {
    if (check && skill === 'sleight-of-hand') return 'advantage';
    if (save && intent.ability === 'wis') return 'disadvantage';
    if (check && skill === 'deception' && intent.socialPurpose === 'deception-about-taken-item') return 'disadvantage';
  }
  if (id === 'hopeless' && initiative) return 'disadvantage';
  if (id === 'hopeless' && check && skill === 'persuasion' && intent.socialPurpose === 'dissuade-action') return 'advantage';
  if (id === 'memory-wipe' && check && ((skill && ['arcana', 'history', 'nature', 'religion'].includes(skill)) || intent.purpose === 'recall-knowledge')) return 'disadvantage';
  if (id === 'inimical' && (check || save) && intent.purpose === 'resist-grapple-or-restraint') return 'disadvantage';
  if (id === 'murderous' && initiative) return 'disadvantage';
  if (id === 'murderous' && attack && intent.firstAttackOfTurn) return 'advantage';
  if (id === 'peacekeeping' && initiative) return 'disadvantage';
  if (id === 'peacekeeping' && check && intent.purpose === 'end-combat') return 'advantage';
  if (id === 'superstitious') {
    if ((attack || save) && intent.charmMoreThan30Feet) return 'disadvantage';
    if (check && intent.purpose === 'find-lucky-charm' && (skill === 'investigation' || skill === 'perception')) return 'advantage';
  }
  if (id === 'suspicious' && check && skill) {
    if (skill === 'sleight-of-hand' || (skill === 'perception' && intent.purpose === 'detect-hidden-foe')) return 'advantage';
    if (skill === 'insight') return 'disadvantage';
  }
  // Distorted perceptions, situational hostility, phobia, and once-per-turn effects need context
  // that the current roll controls do not carry (target, distance, trigger, or attack order).
  if (attack) return 'normal';
  return 'normal';
}

/** Combine any number of simultaneous sources; one or more advantages cancel one or more disadvantages. */
export function resolveRollModes(...modes: readonly RollMode[]): RollMode {
  const advantage = modes.includes('advantage');
  const disadvantage = modes.includes('disadvantage');
  if (advantage === disadvantage) return 'normal';
  return advantage ? 'advantage' : 'disadvantage';
}

/** Pairwise helper retained for callers that combine exactly two sources. */
export function combineRollModes(a: RollMode, b: RollMode): RollMode {
  return resolveRollModes(a, b);
}
