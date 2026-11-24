// Мок-кампания §13 (шаг 4): сид поверх event log, производные по SRD, календарь Харптоса (заготовка шага 8).
export {
  harptos, secOf, formatHarptos, MONTHS, FESTIVALS, EPOCH_YEAR, DAYS_PER_MONTH, DAYS_PER_YEAR,
  SHIELDMEET, isShieldmeetYear, daysInYear, yearStartDay, yearStartSec, sameDayIn, festivalsAfter,
  dayPhase, seasonOf, SEASON_LABELS, moonState, fullMoonsBetween, inDays, nextFestival, MOON_CYCLE_DAYS, MOON_FULL_EPOCH_SEC,
  TENDAY, yearSlots, festivalAfter, monthBefore, monthDays, type YearSlotView, type MonthDay,
  CALENDAR_ID, ACTIVE_CALENDAR_ADAPTER, calendarAdapterForSetting, calendarAdapterForState, type CalendarAdapter,
  type HarptosDate, type HarptosInput, type MonthName, type FestivalName, type DayPhase, type Season, type MoonPhase, type MoonState, type NextFestival,
} from './calendar';
export {
  abilityMod, maxHp, armorClass, passivePerception, proficiencyBonusOf, abilityScores, deriveCharacter, deriveDraft,
  classSkillChoices, classArmorProficiency, srdClassOf, DeriveError, TRAIT_EFFECTS,
  type AbilityScores, type ArmorChoice, type Improvement, type PcSpec, type DerivedCharacter, type ChosenFeature, type SheetSpellcasting,
} from './derive';
export { PARTY, PARTY_LEVEL, BO, KORRIN, LYRA, ALDRIC } from './party';
export { seedWorld, seedDeltas, seedFacts, LOCATION, FACTION, THREAD, DELTA, FACT } from './world';
export { SEED_SEC, seedState, seedStateForProfile, seedStateForEvents, createCampaignProfile, campaignProfileFromEvents, seedLog, seedEngine, pcActor, sheetOf, monsterActor } from './seed';
export { seedBattlefield, placedActors, type Battlefield, type Cell } from './battlefield';
export { simulate, stepTime, tendaysCrossed, placeChain, NEAR_SCALES, THREAD_TICK_DAYS, type SimulationInput } from './simulation';
export { simulateProcesses, registerProcessKind, processKinds, nearParty, partyLocationId, TICK_SEC, MAX_TICKS_PER_STEP, type ProcessKind, type ProcessKinds, type TickContext, type TickResult } from './processes';
export { frontDelta, fulfillPortentDelta, resolveDangerDelta } from './fronts';
export { d20, rollOf, hash32 } from './rng';
export { pulseOf, pulseEvents, priceRowOf, pricedGoods, PULSE_DAYS, type Pulse, type PulseEvent, type PulseEventKind, type PulseEdge, type PulseFaction, type PulsePriceRow, type PulsePriceCell, type PulseEncounterRow, type PulseGod } from './pulse';
export { newPlaceDelta, type NewPlaceInput } from './newPlace';
export { isMonsterReference, planReferenceActivation, type ReferenceActivationRequest, type ReferenceActivationPlan } from './activation';
export { renownDelta, standingDelta, referenceFactionDelta, factionOf } from './renown';
// Бой за живым столом: появление противников из блоков SRD и инициатива — чистые функции, события пишет страница.
export { initiativeMod, encounterCandidates, sortInitiative, currentOrder, nextActorId, suggestMonsterName, spawnMonsters, encounterMonsterId } from './encounter';
// Легендарные действия (Q13): число из абзаца блока, потраченное — ресурс актёра, возврат в начале своего хода.
export { LEGENDARY_RESOURCE, legendaryTrackOf, legendaryRegainOf, regainLegendary, type LegendaryTrack } from './legendary';
// Отдых (решение владельца 21.09.2026): кости хитов по листу, кандидаты, takeRest = TIME_ADVANCED + REST_TAKEN.
export { REST_HOURS, a5eRestCompletes, hitDiceOf, conModOf, hitDiceFormula, restCandidates, takeRest, locationHavenDelta, type HitDicePool, type RestResult } from './rest';
// Погода — проекция календаря для полосы часов (§4): не состояние и не событие.
export { weatherOf, weatherLabel, SKY_LABELS, WIND_LABELS, WIND_FROM_LABELS, WEATHER_SEED, type Weather, type Sky, type Wind, type WindDirection } from './weather';
// Ресурсы персонажа (решение владельца 21.09.2026): максимум из таблицы класса и умений SRD, потраченное из состояния.
export { resourcePoolsOf, tableResources, poolLabel, restResourcesOf, type ResourcePool } from './resources';
export { travel, travelCalendarDays, type TravelResult } from './travel';
export { prestigeRatingOf, prestigeProfileOf, prestigeProfileCommand, prestigeCoverage, type PrestigeCoverage } from './prestige';
export { supplyOf, mouthsOf, supplyCapacity, eatSupply } from './supply';
export { KNOWLEDGE_SKILLS, KNOWLEDGE_DC, KNOWLEDGE_RULE, isLore, knowledgeSkillOf, knownFacts, playersEntityView, knownLine, notebookOf, passiveScore, passiveVoices, deceptionDcOf, type PassiveVoice } from './knowledge';
export { pathOf, nextLevelText, partyGaps, CAPABILITY_LABEL, CAPABILITY_RULE, type CharacterPath, type PathStep, type PartyGap, type Capability } from './path';
export { levelUp, levelUpPlan, LevelUpError, type LevelUpChoice, type LevelUpPlan } from './levelUp';
// Лист числами для карточки, сводки партии и сравнения; паспорт данных листа (раса, класс, источники, пробелы).
export {
  sheetViewOf, saveProficiencies, passportOf, missingFieldsOf, partySummaryOf, concentrationSpellsOf, GROUP_CHECKS, SOURCE_LABEL,
  type SheetView, type AbilityView, type SkillView, type Proficiency, type Passport, type PartySummary, type SkillLeader,
} from './sheetView';
export { EDITION_ORDER, cosmologyOf, cosmologyOfSetting, eraOf, eraOfSetting, type Era } from './era';
export {
  HOLY_DEITIES, SOLAR_LABEL, holyDaysOn, holyLabel, holyList, holyRulesAt, holyWhat, inHolyScope, isAnnual, nextHolyDay, nextHolyDayFor, partyDeitiesOf,
  type HolyDay, type HolyDeity, type HolyRule, type HolyScope, type NextHolyDay, type Solar,
} from './holyDays';
export { actionOdds, monsterSaves, oddsTargetOf, sheetAttackOdds, sheetSpellOdds, type ActionOdds, type AttackRow, type OddsTarget, type SaveRow } from './odds';
export { explain, explainText, signedTotal, sheetAc, type DeriveStep, type ExplainKey, type Explanation } from './explain';
// Место как сцена (Д2, ROADMAP 6.1): проекция «что здесь сейчас» — календарь, вера, силы, люди, рынок, округа, нити, канон.
export { sceneOf, regionOfKind, SCENE_TITLE, SCENE_CANON_EVENTS, type Scene, type SceneAt, type SceneCanon, type SceneLink, type SceneOptions, type SceneRow, type SceneSection, type SceneSectionId } from './scene';
// Напряжения (Д3, ROADMAP 7.1–7.3): где сталкиваются интересы — факты цепочкой; «Сделать нитью» — предложение newThread.
export {
  tensionsOf, tensionsAt, influenceOf, tensionThreadDelta, tensionThreadId, tensionThreadState, TENSION_LABEL, RISING_RENOWN, RISING_RELATION,
  type InfluenceMarks, type Tension, type TensionCanon, type TensionFact, type TensionKind,
} from './tensions';
// Ветки «что если» (Д4): разница миров основной линии и веток — только разошедшееся.
export { diffWorld, type DiffGroup, type WorldDiffRow } from './branchDiff';
