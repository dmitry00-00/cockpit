import type { NpcAttitude } from '../../engine/events';
import type { SkillId } from './abilities';

/** Structured SRD 5.2.1 Influence rule used by the social check UI and resolver. */
export const INFLUENCE_RULE = Object.freeze({
  id: 'srd-5.2.1-influence',
  label: 'Influence',
  source: 'Dungeons & Dragons System Reference Document 5.2.1',
  license: 'CC BY 4.0',
  skills: ['deception', 'intimidation', 'performance', 'persuasion', 'animal-handling'] as const satisfies readonly SkillId[],
  /** Animal Handling applies to gently coaxing Beasts and Monstrosities. */
  animalTypes: ['Beast', 'Monstrosity'] as const,
  defaultDc: (intelligence: number) => Math.max(15, intelligence),
  cooldownSec: 24 * 60 * 60,
  attitude: {
    friendly: 'advantage',
    indifferent: 'normal',
    hostile: 'disadvantage',
  } satisfies Readonly<Record<NpcAttitude, 'advantage' | 'normal' | 'disadvantage'>>,
} as const);
