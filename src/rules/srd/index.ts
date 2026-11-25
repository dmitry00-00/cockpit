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
// Магические предметы — не реэкспортом: модуль импортируют напрямую, чтобы 270 КБ данных ехали отдельным куском (ROADMAP 0.5).
export type { MagicItem, MagicItemRarity } from './magicItems';
export { MONSTER_IDS, MONSTERS, MONSTER_LIST, MONSTERS_SOURCE, MONSTER_LIBRARIES, MONSTER_ORIGIN_LABEL, SRD_MONSTER_IDS, isMonsterId, loadMonsterLibraries, loadSrdMonsters, monsterLibrariesLoaded, monsterOrigin, needsMonsterLibraries, type Monster, type MonsterLibrary, type MonsterAction, type MonsterAttack, type MonsterId, type MonsterOrigin } from './monsters';
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
  type RestoreOn,
} from './resources';
export { legendaryCost, legendaryCount, legendaryOf, type LegendaryActions, type LegendaryOption } from './legendary';
export { SRD_RACES, SRD_RACE_IDS, isSrdRaceId, srdRaceSpeed, type SrdRace, type SrdRaceId } from './races';
export { DIFFICULT_TERRAIN_FACTOR, TRAVEL_PACE_IDS, TRAVEL_PACES, travelDays, type TravelPace, type TravelPaceId } from './travel';
export { INFLUENCE_RULE } from './influence';
