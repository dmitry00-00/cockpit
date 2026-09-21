// Проверки и обстановка боя из 5e SRD 5.1: таблица DC, концентрация, укрытие, освещение.
// Текст — дословно из источника (CC-BY-4.0, см. LICENSE.md). Источник: https://www.dnd5eapi.co/api/2014/rule-sections/
// (ability-checks, casting-a-spell, cover, the-environment), снято 2026-09-18; тире в «Vision and Light» сверены
// с https://api.open5e.com/v1/sections/environment/. Здесь нет React и нет пересказа.

/** Строка таблицы Typical Difficulty Classes. */
export interface DifficultyClass {
  /** Английская подпись SRD. */
  label: string;
  /** Русская подпись для интерфейса. */
  labelRu: string;
  dc: number;
}

/** SRD 5.1, Using Ability Scores: Ability Checks — Typical Difficulty Classes. */
export const DIFFICULTY_CLASSES: readonly DifficultyClass[] = [
  { label: 'Very easy', labelRu: 'Очень легко', dc: 5 },
  { label: 'Easy', labelRu: 'Легко', dc: 10 },
  { label: 'Medium', labelRu: 'Средне', dc: 15 },
  { label: 'Hard', labelRu: 'Сложно', dc: 20 },
  { label: 'Very hard', labelRu: 'Очень сложно', dc: 25 },
  { label: 'Nearly impossible', labelRu: 'Почти невозможно', dc: 30 },
];

export const DIFFICULTY_CLASSES_SOURCE = 'SRD 5.1, Using Ability Scores: Ability Checks (CC-BY-4.0)';

/** Что ломает концентрацию — три фактора из SRD, дословно. */
export const CONCENTRATION = {
  text: [
    "Normal activity, such as moving and attacking, doesn't interfere with concentration. The following factors can break concentration:",
    "Casting another spell that requires concentration. You lose concentration on a spell if you cast another spell that requires concentration. You can't concentrate on two spells at once.",
    "Taking damage. Whenever you take damage while you are concentrating on a spell, you must make a Constitution saving throw to maintain your concentration. The DC equals 10 or half the damage you take, whichever number is higher. If you take damage from multiple sources, such as an arrow and a dragon's breath, you make a separate saving throw for each source of damage.",
    'Being incapacitated or killed. You lose concentration on a spell if you are incapacitated or if you die.',
  ],
  source: 'SRD 5.1, Spellcasting: Casting a Spell, Concentration (CC-BY-4.0)',
} as const;

/**
 * DC спасброска Телосложения на удержание концентрации после урона.
 *
 * SRD 5.1, Casting a Spell — Concentration, «Taking damage»: «Whenever you take damage while you are
 * concentrating on a spell, you must make a Constitution saving throw to maintain your concentration.
 * The DC equals 10 or half the damage you take, whichever number is higher. If you take damage from
 * multiple sources, such as an arrow and a dragon's breath, you make a separate saving throw for each
 * source of damage.»
 *
 * Половина округляется вниз по общему правилу SRD (Round Down). Зовётся на каждый источник урона отдельно.
 */
export function concentrationSaveDc(damage: number): number {
  return Math.max(10, Math.floor(damage / 2));
}

export type CoverId = 'half' | 'three-quarters' | 'total';

export interface Cover {
  id: CoverId;
  /** Английское имя SRD. */
  name: string;
  /** Русская подпись для интерфейса. */
  label: string;
  /** Бонус к AC и спасброскам Ловкости; у полного укрытия его нет — цель нельзя выбрать вовсе. */
  acBonus: number | null;
  /** Абзац SRD дословно. */
  text: readonly string[];
  source: string;
}

const COVER_SOURCE = 'SRD 5.1, Combat: Cover (CC-BY-4.0)';

/** Три степени укрытия. Складываться не могут: действует только самая защищающая. */
export const COVER: Readonly<Record<CoverId, Cover>> = {
  half: {
    id: 'half',
    name: 'Half cover',
    label: 'Половинное укрытие',
    acBonus: 2,
    text: [
      'A target with half cover has a +2 bonus to AC and Dexterity saving throws. A target has half cover if an obstacle blocks at least half of its body. The obstacle might be a low wall, a large piece of furniture, a narrow tree trunk, or a creature, whether that creature is an enemy or a friend.',
    ],
    source: COVER_SOURCE,
  },
  'three-quarters': {
    id: 'three-quarters',
    name: 'Three-quarters cover',
    label: 'Укрытие на три четверти',
    acBonus: 5,
    text: [
      'A target with three-quarters cover has a +5 bonus to AC and Dexterity saving throws. A target has three-quarters cover if about three-quarters of it is covered by an obstacle. The obstacle might be a portcullis, an arrow slit, or a thick tree trunk.',
    ],
    source: COVER_SOURCE,
  },
  total: {
    id: 'total',
    name: 'Total cover',
    label: 'Полное укрытие',
    acBonus: null,
    text: [
      "A target with total cover can't be targeted directly by an attack or a spell, although some spells can reach such a target by including it in an area of effect. A target has total cover if it is completely concealed by an obstacle.",
    ],
    source: COVER_SOURCE,
  },
};

/** Общие абзацы раздела Cover — для панели справки. */
export const COVER_GENERAL = {
  text: [
    'Walls, trees, creatures, and other obstacles can provide cover during combat, making a target more difficult to harm. A target can benefit from cover only when an attack or other effect originates on the opposite side of the cover.',
    "There are three degrees of cover. If a target is behind multiple sources of cover, only the most protective degree of cover applies; the degrees aren't added together. For example, if a target is behind a creature that gives half cover and a tree trunk that gives three-quarters cover, the target has three-quarters cover.",
  ],
  source: COVER_SOURCE,
} as const;

export type LightId = 'bright' | 'dim' | 'darkness';

export interface Light {
  id: LightId;
  /** Английское имя SRD. */
  name: string;
  /** Русская подпись для интерфейса. */
  label: string;
  /** Насколько область затемнена: dim — lightly obscured, darkness — heavily obscured. */
  obscured: 'none' | 'lightly' | 'heavily';
  /** Абзацы SRD дословно: сначала о категории света, потом о степени затемнения, которую она создаёт. */
  text: readonly string[];
  source: string;
}

const LIGHT_SOURCE = 'SRD 5.1, Adventuring: The Environment, Vision and Light (CC-BY-4.0)';

/** Три категории освещения. */
export const LIGHT: Readonly<Record<LightId, Light>> = {
  bright: {
    id: 'bright',
    name: 'Bright light',
    label: 'Яркий свет',
    obscured: 'none',
    text: [
      'Bright light lets most creatures see normally.',
      'Even gloomy days provide bright light, as do torches, lanterns, fires, and other sources of illumination within a specific radius.',
    ],
    source: LIGHT_SOURCE,
  },
  dim: {
    id: 'dim',
    name: 'Dim light',
    label: 'Тусклый свет',
    obscured: 'lightly',
    text: [
      'Dim light, also called shadows, creates a lightly obscured area. An area of dim light is usually a boundary between a source of bright light, such as a torch, and surrounding darkness. The soft light of twilight and dawn also counts as dim light. A particularly brilliant full moon might bathe the land in dim light.',
      'In a lightly obscured area, such as dim light, patchy fog, or moderate foliage, creatures have disadvantage on Wisdom (Perception) checks that rely on sight.',
    ],
    source: LIGHT_SOURCE,
  },
  darkness: {
    id: 'darkness',
    name: 'Darkness',
    label: 'Темнота',
    obscured: 'heavily',
    text: [
      'Darkness creates a heavily obscured area.',
      'Characters face darkness outdoors at night (even most moonlit nights), within the confines of an unlit dungeon or a subterranean vault, or in an area of magical darkness.',
      'A heavily obscured area—such as darkness, opaque fog, or dense foliage—blocks vision entirely. A creature effectively suffers from the blinded condition (see appendix PH-A) when trying to see something in that area.',
    ],
    source: LIGHT_SOURCE,
  },
};
