// Компоненты шага 5 (HANDOFF §14) одной точкой входа. Все они тупые: состояние и колбэки — пропсами,
// в стор не ходят. Проекции из актёра (partyRowOf, chipsOf, actorCardProps, stackItemOf) лежат рядом
// с компонентами, чтобы корешок партии, карточка и стопка красили одни и те же числа одинаково.
export {
  HpBar, hpLevel, hpGeometry, hpText, hpWord,
  type HpBarProps, type HpTriple, type HpLevel, type HpFlash, type HpWord,
} from './HpBar';
export { DeathSaves, clampSaves, type DeathSavesProps, type DeathSaveCount } from './DeathSaves';
export { StatTile, signedMod, tileEdge, type StatTileProps } from './StatTile';
export {
  ConditionChip, CONDITION_ORDER, conditionTip, conditionChipProps, concentrationChipProps, effectChipProps,
  chipsOf, formatRemaining,
  type ConditionChipProps, type ChipKind, type ChipSpec,
} from './ConditionChip';
export { ConditionGrid, toggleCommand, exhaustionCommand, type ConditionGridProps } from './ConditionGrid';
export { PartySpine, type PartySpineProps } from './PartySpine';
export { PartySpineRow, partyRowOf, partyRowDescription, lineageOf, type PartySpineRowProps, type PartyRow, type AwayLocation } from './PartySpineRow';
export {
  HpControl, HpPopover, parseAmount, digitsOnly, lastDamageOf, QUICK_DAMAGE, QUICK_TEMP,
  type HpControlProps, type HpPopoverProps, type DamageRef,
} from './HpControl';
export {
  EntityCard, ENTITY, ORIGIN, cardShadow, visibleTabs, hpStat, actorCardProps, raceLabel,
  placeCardProps, factionCardProps, placeEntityType, populationLabel, priceLabel, DANGER_LABELS,
  TAB_OVERVIEW, TAB_CONDITIONS, TAB_GEAR, TAB_ACTIONS, TAB_DM,
  type EntityCardProps, type EntityCardTab, type EntityStat, type EntityType, type Origin, type StatTone, type ActorCardProps, type ActorCardOptions,
  type PlaceCardProps, type PlaceCardOptions,
} from './EntityCard';
export {
  Paperdoll, SLOT_IDS, SLOTS, slotTitle, weaponTitle, dollItemsOf,
  type PaperdollProps, type SlotId, type SlotItem, type Weapon, type InventoryItem,
} from './Paperdoll';
export { CardStack, stackItemTitle, stackItemOf, type CardStackProps, type CardStackItem } from './CardStack';
// Шаг 6 — бой: токен и полоса инициативы, боевая сетка, карточка броска. Тоже тупые; проекции
// (initiativeTokenOf, battleTokenOf, rollHistoryOf, lastRollOf) — рядом с компонентами.
export {
  InitiativeToken, TokenHpStrip, initiativeTokenOf, initiativeTokenTitle, initiativeTokenDescription, initiativeTokenShadow, tokenHpPct,
  type InitiativeTokenProps,
} from './InitiativeToken';
export { InitiativeBar, type InitiativeBarProps, type InitiativeBarEntry } from './InitiativeBar';
export {
  BattleGrid, battleTokenOf, battleTokenTitle, battleTokenDescription, battleTokenShadow, conePoints,
  BATTLE_CELL_DEFAULT, TOKEN_CONDITIONS_MAX,
  type BattleGridProps, type BattleToken, type BattleWall, type BattleCone,
} from './BattleGrid';
export {
  RollModal, rollHistoryOf, lastRollOf, diceSides, HISTORY_MAX,
  type RollModalProps, type RollHistoryItem, type RollOutcome,
} from './RollModal';
// Шаг 7 — журнал и нити: запись с каскадом и напоминанием, фильтр, карточка нити, предложение мира.
// Тоже тупые: части текста, сводки нитей и дельты — проекции движка, фильтр — состояние вида на странице.
export {
  JournalEntry, JournalCascade, JournalReminder, journalText, CASCADE_ICON, ENTRY_ORIGIN,
  type JournalEntryProps, type JournalCascadeProps, type JournalReminderProps,
} from './JournalEntry';
export {
  ThreadFilter, toggleIn,
  type ThreadFilterProps, type ThreadFilterThread, type ThreadFilterScale,
} from './ThreadFilter';
// Подписи, порядок и темп уровней — одно место на фильтр, сводку, предложение мира, лестницу и карточку места.
export { SCALE_LABELS, SCALE_ORDER, SCALE_TEMPO_LABELS } from './scales';
export { ThreadCard, entryCountLabel, type ThreadCardProps, type ThreadCardRow } from './ThreadCard';
export { WorldDelta, worldDeltaProps, type WorldDeltaProps } from './WorldDelta';
// Шаг 8 — шаг времени: темп и «Шаг», небесная полоса, фазы суток, сводка «Что изменилось». Тоже тупые:
// темп, фаза, луна и группы — пропсами со страницы; summaryGroups — проекция дельт без колбэков.
export {
  TimeTempo, TEMPO_ORDER, TEMPO_LABELS, parseSteps, STEP_LONG_PRESS_MS, STEPS_MIN, STEPS_MAX,
  type TimeTempoProps,
} from './TimeTempo';
export { CelestialBar, MOON_PHASES, MOON_LABELS, MOON_ICONS, type CelestialBarProps, type MoonPhase } from './CelestialBar';
export { DayPhaseStrip, DAY_PHASES, DAY_PHASE_LABELS, DAY_PHASE_ICONS, type DayPhaseStripProps, type DayPhase } from './DayPhaseStrip';
export {
  ChangeSummary, summaryGroups,
  type ChangeSummaryProps, type ChangeSummaryGroup, type ChangeSummaryItem,
} from './ChangeSummary';

// Шаг 9 — режим «глазами игроков».
export { PlayerFrame, PLAYER_FRAME_LABEL, type PlayerFrameProps } from './PlayerFrame';

// Шаг 10 — лестница масштабов: навигация по девяти уровням; выше региона — карточки (placeCardProps, factionCardProps выше).
export { ScaleLadder, ladderStepTitle, LADDER_COMPACT_FROM, type ScaleLadderProps, type ScaleStep } from './ScaleLadder';

// Живой стол (21.09.2026): то, чего не хватало, чтобы сыграть MVP за столом, — редактор инициативы (числа
// игроков вводит мастер, монстрам бросает система), появление противника из блока SRD, начало концентрации.
// Тоже тупые: строки, блоки и колбэки — пропсами; снимки актёров и порядок собирает страница из campaign/encounter.
export {
  InitiativeEditor, parseInitiative, initiativeFormula, orderFromDrafts,
  type InitiativeEditorProps, type InitiativeRow,
} from './InitiativeEditor';
export { SpawnForm, parseCount, filterOptions, type SpawnFormProps, type SpawnOption } from './SpawnForm';
export { ConcentrationForm, CONCENTRATION_DURATIONS, type ConcentrationFormProps } from './ConcentrationForm';
export { RestForm, REST_LABELS, parseDice, parseHealed, diceFormula, type RestFormProps, type RestRow } from './RestForm';
// F9 — планшет: свёрнутая боковая панель — полоса иконок 40px; что свёрнуто и раскрыто — состояние страницы.
export { IconRail, type IconRailProps, type IconRailItem } from './IconRail';
export { PartyPortraits, type PartyPortraitsProps } from './PartyPortraits';
export { EntityViewBody, cardTypeOf, type EntityViewBodyProps } from './EntityViewBody';
export { OpenEntityContext, useOpenEntity } from './openEntity';
export { HarptosDial, PHASE_HOURS, dialPoint, type HarptosDialProps } from './HarptosDial';
// Ресурсы персонажа пипками (решение владельца 21.09.2026): максимум и потраченное пропсами, события пишет страница.
export { ResourcePips, PIPS_MAX, parsePoolAmount, type ResourcePipsProps, type ResourcePipsKind } from './ResourcePips';
// Русские подписи характеристик и навыков — слой вида, одна таблица на стол и редактор.
export { ABILITY_LABEL, SKILL_LABEL, SKILLS_BY_ABILITY } from './labels';
// Секции листа из редактора персонажа: выборы умений, атаки, заклинания, снаряжение — одни на карточке стола и в редакторе.
export { IconGrid, type IconGridItem } from './IconGrid';
export { abilityIcon, classIcon, raceIcon, schoolIcon, featIcon, featureIcon, traitIcon, TRAIT_ICON } from './sheetIcons';
export { SheetChoices, SheetFeats, SheetAttacks, SheetSpells, SheetEquipment, dollExtrasOf, choiceValueLabel, spellTitle, itemLabel } from './SheetSections';

// Лист по бумажной карточке владельца и поверхности из макетов 27.10.2026: паспорт данных, подвал партии со сводкой
// выборки, лист сравнения. Тупые: числа — из campaign/sheetView.ts.
export { AbilityScores, SkillList, ProficiencyMark, DataPassport, PcHeader, bySkillLabel, type AbilityCell, type SkillCell, type SkillProficiency, type PassportData, type PcHeaderData } from './PcSheet';
export { PartyFooter, type PartyFooterProps, type PartySummaryData } from './PartyFooter';
export { CompareSheet, bestOf, type CompareSheetProps, type CompareColumn } from './CompareSheet';
