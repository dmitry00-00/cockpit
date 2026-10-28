// Иконки листа персонажа (решение владельца 27.10.2026): своя иконка у характеристики, класса, расы и школы магии;
// умение класса, черта и особенность расы — иконкой своего вида (атака, защита, движение, чувства…), а не своей:
// 16×16 из примитивов не различит 400 умений. Имя всегда в тултипе — иконка его не заменяет.
import type { IconName } from '../icons/Icon';
import { ICONS } from '../icons/icons.generated';
import type { AbilityId } from '../rules/srd/abilities';
import type { SpellSchool } from '../rules/srd/spells';
import type { Feat, FeatEffectKind, TraitKind } from '../rules/compendium';

const known = (name: string): name is IconName => name in ICONS;

export const abilityIcon = (id: AbilityId): IconName => `ab-${id}` as IconName;
export const schoolIcon = (school: SpellSchool): IconName => `school-${school}` as IconName;
/** Класс и раса компендиума: своя иконка по id; класс или раса не из набора (хоумбрю) — «персонаж» и «особенность». */
export const classIcon = (classId: string): IconName => (known(`cls-${classId}`) ? `cls-${classId}` : 'ent-pc') as IconName;
export const raceIcon = (raceId: string): IconName => (known(`race-${raceId}`) ? `race-${raceId}` : 'kind-other') as IconName;

/** Вид особенности расы (колонки листа «Кратко» в таблице владельца) → иконка. */
export const TRAIT_ICON: Readonly<Record<TraitKind, IconName>> = {
  'vision': 'kind-vision',
  'size': 'kind-size',
  'natural-armor': 'ac',
  'save': 'kind-save',
  'limbs': 'slot-hands',
  'resistance': 'kind-resist',
  'skill': 'kind-proficiency',
  'proficiency': 'kind-proficiency',
  'weapon-armor': 'slot-armor',
  'tool': 'kind-tool',
  'unarmed': 'kind-claw',
  'movement': 'move',
  'spell': 'spell',
  'sense': 'kind-sense',
  'other': 'kind-other',
};

/** Особенность расы: вид из таблицы; «прочее» таблицы — по словам, как умение класса («Везучий» — переброс). */
export function traitIcon(kind: TraitKind, name: string, text = ''): IconName {
  return kind === 'other' ? featureIcon(name, text) : TRAIT_ICON[kind];
}

/** Эффекты черты по старшинству: черта с заклинаниями — «заклинание», даже если даёт и навык. */
const FEAT_ORDER: readonly [FeatEffectKind, IconName][] = [
  ['spells', 'spell'], ['cantrips', 'spell'], ['damage', 'attack'], ['attack-roll', 'attack'], ['ac', 'ac'], ['hp', 'hp'],
  ['initiative', 'initiative'], ['speed', 'move'], ['saves', 'kind-save'], ['advantage', 'reroll'],
  ['weapons-armor', 'slot-armor'], ['skills', 'kind-proficiency'], ['tools', 'kind-tool'], ['bonus', 'kind-bonus'],
];

export function featIcon(feat: Pick<Feat, 'effects' | 'asi'> | undefined): IconName {
  if (!feat) return 'kind-other';
  for (const [k, icon] of FEAT_ORDER) if (feat.effects[k]) return icon;
  return feat.asi.length > 0 ? 'kind-bonus' : 'kind-other';
}

/**
 * Умение класса → вид по словам имени, а если имя молчит («Боевой стиль», «Дикий инстинкт») — по словам текста.
 * Порядок — от узкого к широкому: «Аура защиты» — аура, а не защита; «Дополнительная атака» — атака.
 */
const FEATURE_RULES: readonly [RegExp, IconName][] = [
  [/аур/i, 'kind-aura'],
  [/перебро/i, 'reroll'],
  [/дикий облик|облик|превращ|изменени[ея] формы/i, 'kind-shape'],
  [/спутник|компаньон|фамильяр|зверь\b/i, 'skill-animal'],
  [/ярост|тотем|звер|дикий чемпион/i, 'kind-claw'],
  [/увеличение характеристик/i, 'kind-bonus'],
  [/заклинан|заговор|магическ|магии|волшебн|воззван|инфузи|метамаги|ритуал|договор|божественный канал/i, 'spell'],
  [/инициатив/i, 'initiative'],
  [/второе дыхание|лечени|исцелени|наложение рук|восстанавлива\S* хит|хит|смерт|уцелевш/i, 'hp'],
  [/спасброс|уклонени/i, 'kind-save'],
  [/сопротивлени|иммунитет/i, 'kind-resist'],
  [/атак|удар|урон|критическ|боев\S* стил|превосходств|враг|противник|мощь/i, 'attack'],
  [/доспех|класс доспеха|без доспехов|защит/i, 'ac'],
  [/скорост|передвижени|рывок|лазани|плавани|быстр|проходить сквозь/i, 'move'],
  [/чувств|чутье|чутьё|зрени|видеть|слепо|исследовател|взгляд|обман|ложь/i, 'kind-sense'],
  [/компетентност|владени|навык|инструмент|язык|проверк|бонус мастерства|атлет/i, 'kind-proficiency'],
  [/преимуществ/i, 'reroll'],
  [/отдых|ци\b|очк\S* чародейства|вдохновени|применени/i, 'kind-rest'],
];

export function featureIcon(name: string, text = ''): IconName {
  // Импорт режет строки списков заклинаний подкласса на «умения»: «Огненные» — «ладони», «Туманное» — «облако».
  if (text && text.length < 25 && !/[.!?]/.test(text)) return 'spell';
  for (const [re, icon] of FEATURE_RULES) if (re.test(name)) return icon;
  for (const [re, icon] of FEATURE_RULES) if (re.test(text)) return icon;
  return 'kind-other';
}
