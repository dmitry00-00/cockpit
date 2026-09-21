// Состояния 5e SRD 5.1, Appendix PH-A: Conditions. Текст — дословно из источника (CC-BY-4.0, см. LICENSE.md).
// Источник: https://www.dnd5eapi.co/api/2014/conditions/<id>, снято 2026-09-18; сверено с https://api.open5e.com/v1/sections/conditions/.
// Здесь нет React и нет пересказа: если формулировки нет в SRD, её нет и здесь.

export const CONDITION_IDS = [
  'blinded',
  'charmed',
  'deafened',
  'exhaustion',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
] as const;

export type ConditionId = (typeof CONDITION_IDS)[number];

/** Уровень истощения: SRD измеряет его шестью уровнями, тумблера нет. */
export type ExhaustionLevel = 1 | 2 | 3 | 4 | 5 | 6;

export const EXHAUSTION_MAX_LEVEL = 6;

export interface Condition {
  id: ConditionId;
  /** Английское имя SRD — по нему ищут в книгах. */
  name: string;
  /** Русская подпись для интерфейса. */
  label: string;
  /** invisible — бафф, остальные дебаффы. */
  kind: 'debuff' | 'buff';
  /** Абзацы SRD дословно, на английском. У истощения — всё, кроме таблицы уровней: она в levels. */
  text: readonly string[];
  /** Только у exhaustion: эффекты уровней 1–6 дословно из таблицы SRD. */
  levels?: readonly { level: ExhaustionLevel; effect: string }[];
  source: string;
}

export const CONDITIONS: Readonly<Record<ConditionId, Condition>> = {
  blinded: {
    id: 'blinded',
    name: 'Blinded',
    label: 'Ослеплён',
    kind: 'debuff',
    text: [
      'A blinded creature can\'t see and automatically fails any ability check that requires sight.',
      'Attack rolls against the creature have advantage, and the creature\'s attack rolls have disadvantage.',
    ],
    source: 'SRD 5.1, Appendix PH-A: Conditions (CC-BY-4.0)',
  },
  charmed: {
    id: 'charmed',
    name: 'Charmed',
    label: 'Очарован',
    kind: 'debuff',
    text: [
      'A charmed creature can\'t attack the charmer or target the charmer with harmful abilities or magical effects.',
      'The charmer has advantage on any ability check to interact socially with the creature.',
    ],
    source: 'SRD 5.1, Appendix PH-A: Conditions (CC-BY-4.0)',
  },
  deafened: {
    id: 'deafened',
    name: 'Deafened',
    label: 'Оглушён',
    kind: 'debuff',
    text: [
      'A deafened creature can\'t hear and automatically fails any ability check that requires hearing.',
    ],
    source: 'SRD 5.1, Appendix PH-A: Conditions (CC-BY-4.0)',
  },
  exhaustion: {
    id: 'exhaustion',
    name: 'Exhaustion',
    label: 'Истощение',
    kind: 'debuff',
    text: [
      'Some special abilities and environmental hazards, such as starvation and the long-term effects of freezing or scorching temperatures, can lead to a special condition called exhaustion. Exhaustion is measured in six levels. An effect can give a creature one or more levels of exhaustion, as specified in the effect\'s description.',
      'If an already exhausted creature suffers another effect that causes exhaustion, its current level of exhaustion increases by the amount specified in the effect\'s description.',
      'A creature suffers the effect of its current level of exhaustion as well as all lower levels. For example, a creature suffering level 2 exhaustion has its speed halved and has disadvantage on ability checks.',
      'An effect that removes exhaustion reduces its level as specified in the effect\'s description, with all exhaustion effects ending if a creature\'s exhaustion level is reduced below 1.',
      'Finishing a long rest reduces a creature\'s exhaustion level by 1, provided that the creature has also ingested some food and drink.',
    ],
    levels: [
      { level: 1, effect: 'Disadvantage on ability checks' },
      { level: 2, effect: 'Speed halved' },
      { level: 3, effect: 'Disadvantage on attack rolls and saving throws' },
      { level: 4, effect: 'Hit point maximum halved' },
      { level: 5, effect: 'Speed reduced to 0' },
      { level: 6, effect: 'Death' },
    ],
    source: 'SRD 5.1, Appendix PH-A: Conditions (CC-BY-4.0)',
  },
  frightened: {
    id: 'frightened',
    name: 'Frightened',
    label: 'Испуган',
    kind: 'debuff',
    text: [
      'A frightened creature has disadvantage on ability checks and attack rolls while the source of its fear is within line of sight.',
      'The creature can\'t willingly move closer to the source of its fear.',
    ],
    source: 'SRD 5.1, Appendix PH-A: Conditions (CC-BY-4.0)',
  },
  grappled: {
    id: 'grappled',
    name: 'Grappled',
    label: 'Схвачен',
    kind: 'debuff',
    text: [
      'A grappled creature\'s speed becomes 0, and it can\'t benefit from any bonus to its speed.',
      'The condition ends if the grappler is incapacitated (see the condition).',
      'The condition also ends if an effect removes the grappled creature from the reach of the grappler or grappling effect, such as when a creature is hurled away by the thunderwave spell.',
    ],
    source: 'SRD 5.1, Appendix PH-A: Conditions (CC-BY-4.0)',
  },
  incapacitated: {
    id: 'incapacitated',
    name: 'Incapacitated',
    label: 'Недееспособен',
    kind: 'debuff',
    text: [
      'An incapacitated creature can\'t take actions or reactions.',
    ],
    source: 'SRD 5.1, Appendix PH-A: Conditions (CC-BY-4.0)',
  },
  invisible: {
    id: 'invisible',
    name: 'Invisible',
    label: 'Невидим',
    kind: 'buff',
    text: [
      'An invisible creature is impossible to see without the aid of magic or a special sense. For the purpose of hiding, the creature is heavily obscured. The creature\'s location can be detected by any noise it makes or any tracks it leaves.',
      'Attack rolls against the creature have disadvantage, and the creature\'s attack rolls have advantage.',
    ],
    source: 'SRD 5.1, Appendix PH-A: Conditions (CC-BY-4.0)',
  },
  paralyzed: {
    id: 'paralyzed',
    name: 'Paralyzed',
    label: 'Парализован',
    kind: 'debuff',
    text: [
      'A paralyzed creature is incapacitated (see the condition) and can\'t move or speak.',
      'The creature automatically fails Strength and Dexterity saving throws.',
      'Attack rolls against the creature have advantage.',
      'Any attack that hits the creature is a critical hit if the attacker is within 5 feet of the creature.',
    ],
    source: 'SRD 5.1, Appendix PH-A: Conditions (CC-BY-4.0)',
  },
  petrified: {
    id: 'petrified',
    name: 'Petrified',
    label: 'Окаменел',
    kind: 'debuff',
    text: [
      'A petrified creature is transformed, along with any nonmagical object it is wearing or carrying, into a solid inanimate substance (usually stone). Its weight increases by a factor of ten, and it ceases aging.',
      'The creature is incapacitated (see the condition), can\'t move or speak, and is unaware of its surroundings.',
      'Attack rolls against the creature have advantage.',
      'The creature automatically fails Strength and Dexterity saving throws.',
      'The creature has resistance to all damage.',
      'The creature is immune to poison and disease, although a poison or disease already in its system is suspended, not neutralized.',
    ],
    source: 'SRD 5.1, Appendix PH-A: Conditions (CC-BY-4.0)',
  },
  poisoned: {
    id: 'poisoned',
    name: 'Poisoned',
    label: 'Отравлен',
    kind: 'debuff',
    text: [
      'A poisoned creature has disadvantage on attack rolls and ability checks.',
    ],
    source: 'SRD 5.1, Appendix PH-A: Conditions (CC-BY-4.0)',
  },
  prone: {
    id: 'prone',
    name: 'Prone',
    label: 'Сбит с ног',
    kind: 'debuff',
    text: [
      'A prone creature\'s only movement option is to crawl, unless it stands up and thereby ends the condition.',
      'The creature has disadvantage on attack rolls.',
      'An attack roll against the creature has advantage if the attacker is within 5 feet of the creature. Otherwise, the attack roll has disadvantage.',
    ],
    source: 'SRD 5.1, Appendix PH-A: Conditions (CC-BY-4.0)',
  },
  restrained: {
    id: 'restrained',
    name: 'Restrained',
    label: 'Опутан',
    kind: 'debuff',
    text: [
      'A restrained creature\'s speed becomes 0, and it can\'t benefit from any bonus to its speed.',
      'Attack rolls against the creature have advantage, and the creature\'s attack rolls have disadvantage.',
      'The creature has disadvantage on Dexterity saving throws.',
    ],
    source: 'SRD 5.1, Appendix PH-A: Conditions (CC-BY-4.0)',
  },
  stunned: {
    id: 'stunned',
    name: 'Stunned',
    label: 'Ошеломлён',
    kind: 'debuff',
    text: [
      'A stunned creature is incapacitated (see the condition), can\'t move, and can speak only falteringly.',
      'The creature automatically fails Strength and Dexterity saving throws.',
      'Attack rolls against the creature have advantage.',
    ],
    source: 'SRD 5.1, Appendix PH-A: Conditions (CC-BY-4.0)',
  },
  unconscious: {
    id: 'unconscious',
    name: 'Unconscious',
    label: 'Без сознания',
    kind: 'debuff',
    text: [
      'An unconscious creature is incapacitated (see the condition), can\'t move or speak, and is unaware of its surroundings.',
      'The creature drops whatever it\'s holding and falls prone.',
      'The creature automatically fails Strength and Dexterity saving throws.',
      'Attack rolls against the creature have advantage.',
      'Any attack that hits the creature is a critical hit if the attacker is within 5 feet of the creature.',
    ],
    source: 'SRD 5.1, Appendix PH-A: Conditions (CC-BY-4.0)',
  },
};

/** Сужение произвольной строки до ConditionId — для payload событий. */
export function isConditionId(value: string): value is ConditionId {
  return (CONDITION_IDS as readonly string[]).includes(value);
}
