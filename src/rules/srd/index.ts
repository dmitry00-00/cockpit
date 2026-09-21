// Данные правил 5e SRD 5.1 (CC-BY-4.0, атрибуция в LICENSE.md). Только данные и чистые функции, React здесь нет.
export {
  CONDITION_IDS,
  CONDITIONS,
  EXHAUSTION_MAX_LEVEL,
  isConditionId,
  type Condition,
  type ConditionId,
  type ExhaustionLevel,
} from './conditions';
export {
  CONCENTRATION,
  COVER,
  COVER_GENERAL,
  DIFFICULTY_CLASSES,
  DIFFICULTY_CLASSES_SOURCE,
  LIGHT,
  concentrationSaveDc,
  type Cover,
  type CoverId,
  type DifficultyClass,
  type Light,
  type LightId,
} from './checks';
export { ACTION_IDS, ACTION_LIST, ACTIONS, type ActionId, type CombatAction } from './actions';
export { ABILITY_IDS, ABILITIES, ABILITIES_SOURCE, SKILL_IDS, SKILLS, isSkillId, type AbilityId, type SkillId } from './abilities';
export { SRD_CLASS_IDS, SRD_CLASSES, HIT_POINTS_RULE, ASI_RULE, ABILITY_SCORE_CAP, isSrdClassId, type SrdClass, type SrdClassId } from './classes';
export { ARMOR_IDS, ARMOR, SHIELD, MEDIUM_ARMOR_DEX_CAP, ARMOR_RULES, MAGE_ARMOR, isArmorId, type Armor, type ArmorCategory, type ArmorId } from './armor';
export { MONSTER_IDS, MONSTERS, MONSTER_LIST, MONSTERS_SOURCE, isMonsterId, type Monster, type MonsterAction, type MonsterAttack, type MonsterId } from './monsters';
export {
  RESOURCES,
  RESOURCE_IDS,
  featureResources,
  isResourceId,
  restoreOn,
  slotLevelOf,
  type FeatureResource,
  type Resource,
  type ResourceId,
} from './resources';
export { SRD_RACES, SRD_RACE_IDS, isSrdRaceId, srdRaceSpeed, type SrdRace, type SrdRaceId } from './races';
