// Мок-кампания §13 (шаг 4): сид поверх event log, производные по SRD, календарь Харптоса (заготовка шага 8).
export {
  harptos, secOf, formatHarptos, MONTHS, FESTIVALS, EPOCH_YEAR, DAYS_PER_MONTH, DAYS_PER_YEAR,
  dayPhase, seasonOf, SEASON_LABELS, moonState, fullMoonsBetween, inDays, nextFestival, MOON_CYCLE_DAYS, MOON_FULL_EPOCH_SEC,
  TENDAY, yearSlots, festivalAfter, monthBefore, monthDays, type YearSlotView, type MonthDay,
  type HarptosDate, type HarptosInput, type MonthName, type FestivalName, type DayPhase, type Season, type MoonPhase, type MoonState, type NextFestival,
} from './calendar';
export {
  abilityMod, maxHp, armorClass, passivePerception, proficiencyBonusOf, abilityScores, deriveCharacter, deriveDraft,
  classSkillChoices, classArmorProficiency, srdClassOf, DeriveError, TRAIT_EFFECTS,
  type AbilityScores, type ArmorChoice, type Improvement, type PcSpec, type DerivedCharacter, type ChosenFeature, type SheetSpellcasting,
} from './derive';
export { PARTY, PARTY_LEVEL, BO, KORRIN, LYRA, ALDRIC } from './party';
export { seedWorld, seedDeltas, seedFacts, LOCATION, FACTION, THREAD, DELTA, FACT } from './world';
export { SEED_SEC, seedState, seedLog, seedEngine, pcActor, sheetOf, monsterActor } from './seed';
export { seedBattlefield, placedActors, type Battlefield, type Cell } from './battlefield';
export { simulate, stepTime, tendaysCrossed, placeChain, NEAR_SCALES, THREAD_COLD_DAYS, type SimulationInput } from './simulation';
export { pulseOf, pulseEvents, priceRowOf, PULSE_DAYS, type Pulse, type PulseEvent, type PulseEventKind, type PulseEdge, type PulseFaction, type PulsePriceRow, type PulsePriceCell, type PulseEncounterRow, type PulseGod } from './pulse';
export { newPlaceDelta, type NewPlaceInput } from './newPlace';
export { renownDelta, organizationFactionDelta, factionOfOrganization } from './renown';
// Бой за живым столом: появление противников из блоков SRD и инициатива — чистые функции, события пишет страница.
export { initiativeMod, encounterCandidates, sortInitiative, currentOrder, nextActorId, suggestMonsterName, spawnMonsters } from './encounter';
// Отдых (решение владельца 21.09.2026): кости хитов по листу, кандидаты, takeRest = TIME_ADVANCED + REST_TAKEN.
export { REST_HOURS, hitDiceOf, conModOf, hitDiceFormula, restCandidates, takeRest, type HitDicePool, type RestResult } from './rest';
// Погода — проекция календаря для полосы часов (§4): не состояние и не событие.
export { weatherOf, weatherLabel, SKY_LABELS, WIND_LABELS, WEATHER_SEED, type Weather, type Sky, type Wind } from './weather';
// Ресурсы персонажа (решение владельца 21.09.2026): максимум из таблицы класса и умений SRD, потраченное из состояния.
export { resourcePoolsOf, tableResources, poolLabel, restResourcesOf, type ResourcePool } from './resources';
export { travel, travelCalendarDays, type TravelResult } from './travel';
// Лист числами для карточки, сводки партии и сравнения; паспорт данных листа (раса, класс, источники, пробелы).
export {
  sheetViewOf, saveProficiencies, passportOf, missingFieldsOf, partySummaryOf, concentrationSpellsOf, GROUP_CHECKS, SOURCE_LABEL,
  type SheetView, type AbilityView, type SkillView, type Proficiency, type Passport, type PartySummary, type SkillLeader,
} from './sheetView';
export { EDITION_ORDER, cosmologyOf, eraOf, type Era } from './era';
export {
  HOLY_DEITIES, SOLAR_LABEL, holyDaysOn, holyLabel, holyList, holyRulesAt, holyWhat, inHolyScope, isAnnual, nextHolyDay, nextHolyDayFor, partyDeitiesOf,
  type HolyDay, type HolyDeity, type HolyRule, type HolyScope, type NextHolyDay, type Solar,
} from './holyDays';
export { actionOdds, monsterSaves, oddsTargetOf, sheetAttackOdds, sheetSpellOdds, type ActionOdds, type AttackRow, type OddsTarget, type SaveRow } from './odds';
export { explain, explainText, signedTotal, type DeriveStep, type ExplainKey, type Explanation } from './explain';
// Место как сцена (Д2, ROADMAP 6.1): проекция «что здесь сейчас» — календарь, вера, силы, люди, рынок, округа, нити, канон.
export { sceneOf, regionOfKind, SCENE_TITLE, SCENE_CANON_EVENTS, type Scene, type SceneAt, type SceneCanon, type SceneLink, type SceneOptions, type SceneRow, type SceneSection, type SceneSectionId } from './scene';
