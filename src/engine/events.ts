// Доменные события — единственный источник правды (HANDOFF §7). Тринадцать типов из пакета плюс восемь,
// добавленных решением владельца 19.09.2026 (сборка боя, концентрация, появление и уход актёров, само
// предложение симуляции — иначе они жили вне лога и ломали реплей), плюс отдых и ресурсы персонажа (трата и
// восстановление) — решения владельца 21.09.2026, поход партии и открытие места игрокам — решения владельца
// 27.10.2026. Навигация, оверлеи, фильтры, слои и режим «глазами игроков»
// событиями не являются.
import type { ConditionId } from '../rules/srd/conditions';
import type { TravelPaceId } from '../rules/srd/travel';
import type { ResourceId } from '../rules/srd/resources';
import type { AbilityId, SkillId } from '../rules/srd/abilities';
import type { A5eStressEffect } from '../rules/a5e/strife';
import type { A5eDevotionSimilarity, A5eDowntimeProject, A5eWorkDifficulty } from '../rules/a5e/downtime';
import type { EntityRef } from '../entities/ref';
import type { AdventureBundle } from '../packages/adventure';
import type { A5ePrestigeProfile, A5eTrack, Actor, CharacterSheet, GoodsId, InventoryContainer, InventoryStack, InventoryStorage, InventoryOwner, KnownFact, Location, PartyTransport, RestLayer, TimelinePlanRecord, WorldDelta, WorldPatch } from './state';

/** Что меняет повышение и правка листа: лист, хиты, AC, пассивное внимание. */
export interface SheetSnapshot { sheet: CharacterSheet; hp: { current: number; max: number }; ac: number; passivePerception: number }

export type ScaleLevel =
  | 'cosmology' | 'plane' | 'system' | 'planet' | 'continent'
  | 'region' | 'settlement' | 'building' | 'battle';

/** Девять уровней лестницы масштабов по порядку — от Великого Колеса до боевой клетки (HANDOFF §3). */
export const SCALE_LEVELS: readonly ScaleLevel[] = ['cosmology', 'plane', 'system', 'planet', 'continent', 'region', 'settlement', 'building', 'battle'];

/** Темп мировых часов: семь ступеней переключателя (HANDOFF §8, TimeTempo). */
export type Tempo = 'round' | '10min' | 'hour' | 'day' | 'tenday' | 'season' | 'year';

export const TEMPO_SECONDS: Readonly<Record<Tempo, number>> = {
  round: 6,
  '10min': 600,
  hour: 3600,
  day: 86_400,
  tenday: 10 * 86_400,
  season: 90 * 86_400, // Харптос: 360 дней в году, четыре сезона по 90; вставные праздники — дело календаря (шаг 8)
  year: 365 * 86_400,
};

export interface DamageApplied { targetId: string; amount: number; type?: string; sourceId?: string; mechanicId?: string }
export interface HealingApplied { targetId: string; amount: number; sourceId?: string; mechanicId?: string }
export interface TempHpGranted { targetId: string; amount: number; sourceId?: string; mechanicId?: string }
/** Срок состояния: `until` — словами («конец следующего хода»), `untilSec` — мировым временем, тогда чип считает остаток и по истечении система напоминает. */
export interface ConditionAdded { targetId: string; conditionId: ConditionId; level?: number; until?: string; untilSec?: number }
export interface ConditionRemoved { targetId: string; conditionId: ConditionId }
/** Уровень отдельной A5E-шкалы; не связан с SRD exhaustion. */
export interface A5eTrackSet { actorId: string; track: A5eTrack; level: number; stressEffect?: A5eStressEffect; /** Downtime's once-per-period Strife recovery rule; reducer validates haven and cooldown. */ downtimeRelaxUntilSec?: number }
/** Explicit use of a once-per-long-rest A5E mental-stress benefit. */
export interface A5eStressEffectUsed { actorId: string; effect: 'distraught-aid' }
/** Character-specific A5E Prestige profile and center; never faction renown. */
export interface A5ePrestigeUpdated { actorId: string; profile: A5ePrestigeProfile; source: 'a5e-srd:adventuring-8' }
/** Campaign-level rest ruleset; old logs default to SRD because State.restLayer is absent. */
export interface CampaignRestLayerSet { layer: RestLayer }
/** Explicit campaign opt-in for stress/morale rules; legacy campaigns default to off. */
export interface CampaignStressThemeSet { enabled: boolean }
/** Campaign setting package (P3): selection is logged so replay, undo and redo retain package identity. */
export interface CampaignSettingPackageSet { packageId: string }
/** Immutable root of a new campaign; an optional authored template is catalogued but never launched automatically. */
export interface CampaignProfile {
  schema: 'campaign-profile/1';
  baseline: 'empty-campaign';
  settingPackageId: string;
  /** Optional immutable campaign template chosen at creation; legacy/blank campaigns omit it. */
  campaignPackageId?: string;
  /** Snapshot keeps catalog replay stable if the source package is later revised. */
  campaignBundle?: AdventureBundle;
  /** Location from the setting ladder to focus when the desk first opens. */
  entryLocationId?: string;
  /** Campaign-clock instant for the selected calendar; Planetos uses day 1 at 08:00. */
  startTimeSec?: number;
  /** Rules remain an independent choice; null means none selected. */
  rulesPackageId?: string | null;
}
export interface CampaignCreated { profile: CampaignProfile }
export interface GroupCheckRoll {
  skill: SkillId;
  dc: number;
  rolls: readonly { actorId: string; name: string; die: number; modifier: number; total: number; success: boolean }[];
  successes: number;
  passed: boolean;
}
export type NpcAttitude = 'friendly' | 'indifferent' | 'hostile';
/** PF1 Ultimate Campaign orientation for a specific PC–NPC relationship. */
export type NpcRelationshipType = 'friendship' | 'competition';
export interface NpcRelationship { score: number; type?: NpcRelationshipType; /** Level at which this PC last attempted a PF1 gift/insult check for this NPC. */ growthAtLevel?: number }
export interface PersonGiftRecord { eventId: string; giverId: string; giverName: string; itemId: string; qty: number; sec: number; note?: string }
/** Campaign-only gifts to one read-only canon person; one party gift per tenday. */
export interface PersonGiftState { giftAtSec: number; history: readonly PersonGiftRecord[] }
export interface NpcSocialState {
  attitude: NpcAttitude;
  /** Legacy party-wide PF1 score; retained because existing values have no reliable PC owner. */
  relationshipScore?: number;
  /** PF1 score/orientation is recorded per PC, as relationships are between one PC and one NPC. */
  relationships?: Readonly<Record<string, NpcRelationship>>;
  /** Failed Influence lockouts keyed by character id, skill, and normalized request. */
  failedRequests?: Readonly<Record<string, number>>;
  /** World time of the latest gift/gesture recorded for this NPC; house rule allows one per tenday. */
  giftAtSec?: number;
}
export interface NpcSocialUpdated {
  actorId: string;
  state: NpcSocialState;
  kind: 'attitude' | 'influence' | 'relationship' | 'relationship-growth' | 'relationship-transition' | 'gift';
  targetId?: string;
  gift?: string;
  skill?: SkillId;
  request?: string;
  dc?: number;
  total?: number;
  requestKey?: string;
  failedAtSec?: number;
  /** PF1 Ultimate Campaign growth action; `modifier` includes the sheet skill and the GM's ±4 roleplay adjustment. */
  relationshipGrowth?: { action: 'gift' | 'insult'; level: number; die: number; modifier: number; delta: number };
  /** PF1 Ultimate Campaign reversal; relationship scores may become fractional when halved. */
  relationshipTransition?: {
    transition: 'to-competition' | 'to-friendship';
    reason: string;
    fromScore: number;
    toScore: number;
    die?: number;
    modifier?: number;
    applyNearMissReduction?: boolean;
  };
  note: string;
}
/** Campaign overlay for a read-only canon person; the reference package itself is never changed. */
export interface PersonRelationshipUpdated {
  personId: string;
  personName: string;
  targetId: string;
  relationship?: NpcRelationship;
  /** PF1 special gift/insult check against this campaign-only canon-person relationship. */
  relationshipGrowth?: { action: 'gift' | 'insult'; level: number; die: number; modifier: number; delta: number };
  /** PF1 relationship reversal; transition checks and score halving are explicit in the event. */
  relationshipTransition?: {
    transition: 'to-competition' | 'to-friendship';
    reason: string;
    fromScore: number;
    toScore: number;
    die?: number;
    modifier?: number;
    applyNearMissReduction?: boolean;
  };
  skill?: SkillId;
  dc?: number;
  total?: number;
  note: string;
}
/** `group` — одна журнальная запись с броском d20 каждого выбранного персонажа. */
export interface DiceRolled {
  formula: string;
  dice: readonly number[];
  mod: number;
  total: number;
  hidden: boolean;
  label: string;
  /** Источник результата. Отсутствует в старых событиях и у обычного виртуального броска. */
  origin?: 'physical-manual' | 'connected-device';
  group?: GroupCheckRoll;
}
export interface TurnAdvanced {
  round: number;
  turnIndex: number;
  actorId: string;
  /** New phase-aware turn transition. Missing marker keeps historical replay semantics. */
  lairPhaseVersion?: 1;
  lairActionWindow?: { round: number; position: 'before-round' | 'after-current' | 'before-current' };
  lairActionWindowPassedRound?: number;
}
export interface TimeAdvanced { tempo: Tempo; steps: number; fromDay: number; toDay: number; fromSec: number; toSec: number }
export interface WorldDeltaAccepted { deltaId: string; subject: string; was: string; now: string; causeId: string }
export interface WorldDeltaRejected { deltaId: string; reason?: string }
export interface WorldDeltaRerolled { deltaId: string; variantId: string }
export interface FactRevealed { factId: string; audience: 'players' }
/** Заметка мастера. Секретна по умолчанию (решение Q1, 28.10.2026): игрокам видна только с visible: true. */
export interface NoteAdded { text: string; threadIds: readonly string[]; scale: ScaleLevel; visible?: boolean }
/** GM-authored date range. The record is prep only: no world state is inferred from it. */
export type TimelinePlanDraft = Omit<TimelinePlanRecord, 'status'>;
export interface TimelinePlanCreated { plan: TimelinePlanDraft }
export interface TimelinePlanCancelled { planId: string }
/** Hidden campaign-only progress update for a multi-period A5E information activity. */
export interface A5eDowntimeProjectUpdated { project: A5eDowntimeProject }
/** Character-specific A5E Key Knowledge earned from a successful information activity. */
export interface A5eKeyKnowledgeEarned {
  actorId: string;
  subjectRef: EntityRef;
  subjectName: string;
  amount: 1 | 2;
  source: 'a5e-srd:adventuring-8';
}
/** One point spent to gain advantage on a recorded ability check about its subject. */
export interface A5eKeyKnowledgeSpent {
  actorId: string;
  subjectRef: EntityRef;
  subjectName: string;
  /** Legacy D6 knowledge-check fields retained for existing campaign logs. */
  skill?: SkillId;
  dc?: number;
  /** General check or attack that used this point; omitted on legacy D6 events. */
  action?: { kind: 'check' | 'attack'; label: string; ability?: AbilityId; skill?: SkillId };
  total: number;
  source: 'a5e-srd:adventuring-8';
}
/** Character-specific A5E favor earned from Religious Devotion, associated with one deity. */
export interface A5eFavorEarned {
  actorId: string;
  deityRef: EntityRef;
  deityName: string;
  similarity: A5eDevotionSimilarity;
  skill: 'nature' | 'religion';
  checkTotal: number;
  amount: number;
  source: 'a5e-srd:adventuring-8';
}
/** Narrator-approved A5E boon paid for with deity-specific favor. */
export interface A5eFavorSpent {
  actorId: string;
  deityRef: EntityRef;
  deityName: string;
  amount: 1 | 2;
  boon: string;
  source: 'a5e-srd:adventuring-8';
}
/** One sourced legal A5E Work check and its income; the event also advances the next-same-skill penalty. */
export interface A5eWorkResolved {
  actorId: string;
  skill: SkillId;
  difficulty: A5eWorkDifficulty;
  total: number;
  disadvantageApplied: boolean;
  earningsDice?: readonly number[];
  earningsGp: number;
  source: 'a5e-srd:adventuring-8';
}

/** Строка порядка инициативы: кто и с каким броском. */
export interface InitiativeEntry { actorId: string; initiative: number }
/** Бой начался: порядок целиком, раунд 1, ход первого. Внезапные — пропускают первый ход (решает мастер, событие лишь помнит). */
export interface EncounterStarted {
  order: readonly InitiativeEntry[];
  surprised?: readonly string[];
  lostFirstRoundActions?: readonly string[];
  /** New phase-aware encounter. Missing marker preserves historical lair-action replay. */
  lairPhaseVersion?: 1;
  /** New lair-context semantics. Missing marker preserves historical lair-action replay. */
  lairContextVersion?: 1;
  /** Required when lairContextVersion is 1: the GM confirmed the fight takes place in a lair. */
  lairContextConfirmed?: boolean;
}
export interface EncounterEnded { reason?: string }
/** DM marks one source-backed lair option for the current round; its mechanical effects are resolved manually. */
export interface LairActionUsed { actorId: string; optionId: string; optionName: string; source: string; round: number }
/** Порядок целиком заново — так откат тривиален: снимок «было → стало», а не разница. */
export interface InitiativeSet { order: readonly InitiativeEntry[] }
export interface ConcentrationStarted { actorId: string; spell: string; untilSec?: number }
/** Почему упала: спасбросок, другое заклинание с концентрацией, недееспособность, срок, решение мастера. */
export type ConcentrationEndReason = 'save' | 'cast' | 'unconscious' | 'expired' | 'dm';
export interface ConcentrationEnded { actorId: string; reason: ConcentrationEndReason }
/** Актёр в сессии — полным снимком: реплей не должен зависеть от того, что через месяц лежит в компендиуме. */
export interface ActorSpawned { actor: Actor; party?: boolean }
/** Canonical item commands describe intent; the reducer computes the resulting quantities and exact effect. */
export interface ItemGained { stack: InventoryStack }
export interface InventoryContainerCreated { container: InventoryContainer }
export interface InventoryContainerRemoved { containerId: string }
export interface TransportCreated { transport: PartyTransport }
export interface TransportRemoved { transportId: string }
export interface CoinsExchanged { stackId: string; qty: number; toCoinId: string; toQty: number; receiveStackId: string }
export interface ItemLost { stackId: string; qty: number; reason?: string }
export interface ItemMoved { stackId: string; qty: number; to: InventoryStorage; splitStackId?: string }
export interface ItemTransferred { stackId: string; qty: number; owner: InventoryOwner; to: InventoryStorage; splitStackId?: string }
/** Atomic DM gift: one party PC transfers an actual stack to an NPC; the receiver's tenday lockout is recorded with it. */
export interface ItemGifted { stackId: string; qty: number; giverId: string; recipientId: string; splitStackId?: string; note?: string }
/** Atomic gift to a read-only canon person; removes the item and records a campaign-only receipt. */
export interface PersonItemGifted { stackId: string; qty: number; giverId: string; personId: string; personName: string; splitStackId?: string; note?: string }
export interface TradePayment { stackId: string; qty: number; splitStackId?: string }
export type TradePriceSource =
  | { kind: 'rule' | 'house-rule'; citation: string; edition?: string }
  | { kind: 'market'; citation: string; edition: 'SRD 5.1'; locationId: string; locationName: string; goods: GoodsId; index: number; baseCopper: number; itemQty: number };
/** Saved DM-only offer: a proposal does not reserve inventory or transfer currency. */
export interface TradeOffer { id: string; trade: TradeCompleted; status: 'open' | 'withdrawn' | 'completed'; createdSec: number }
export interface TradeOfferCreated { offerId: string; trade: TradeCompleted }
export interface TradeOfferWithdrawn { offerId: string }
/** One confirmed item-for-coins exchange. Amounts are intent; reducer computes every resulting stack. */
export interface TradeCompleted {
  seller: InventoryOwner;
  buyer: InventoryOwner;
  itemStackId: string;
  itemQty: number;
  itemSplitStackId?: string;
  payments: readonly TradePayment[];
  priceCopper: number;
  priceSource: TradePriceSource;
  /** Opt-in safe journal summary; legacy and omitted values remain DM-only. */
  playerVisible?: boolean;
  /** Links an accepted saved offer to its atomic transfer event. */
  offerId?: string;
}
export interface AttunementChanged { stackId: string; actorId?: string }
export interface ItemEquipped { stackId: string; actorId: string; wornAs: 'armor' | 'shield' }
export interface ItemUnequipped { stackId: string; actorId: string }
/** Уход — флаг, а не удаление: старые события по актёру остаются валидными при реплее. Из порядка инициативы выбывает. */
export type ActorRemoveReason = 'dead' | 'fled' | 'left' | 'dm';
export interface ActorRemoved { actorId: string; reason?: ActorRemoveReason }
/** Предложение симуляции — снимком дельты. Не действие мастера: необратимо и без строки в журнале, как переброс. */
export interface WorldDeltaProposed { delta: WorldDelta }
/**
 * Отдых (решение владельца 21.09.2026). Короткий — кости хитов по актёру: сколько потрачено и сколько хитов
 * вернулось (игроки бросают сами, мастер вводит сумму с CON; кто не тратил — просто отдыхал). Долгий — хиты
 * полны, временные сгорают, SRD-истощение на уровень меньше, половина костей хитов (не меньше одной) возвращается.
 * `context` фиксирует выбранный слой и условия; старые события без него считаются SRD.
 * Часы двигает не отдых, а отдельный TIME_ADVANCED перед ним: время в системе меняет одно событие.
 */
export type RestKind = 'short' | 'long';
/** Правила/обстановка отдыха фиксируются в REST_TAKEN. Для A5E `suppliedActorIds` — решение мастера при общем запасе. */
export interface RestContext {
  layer: RestLayer;
  haven: boolean;
  roughingIt?: boolean;
  supplyConsumed?: boolean;
  suppliedActorIds?: readonly string[];
  /** New A5E long rests carry these markers; absent on legacy logs to preserve their replay. */
  a5eCadence?: '24h-v1';
  a5eStartHp?: 'min-1-v1';
  /** Versioned actual elapsed period, sleep, and strenuous interruptions for a logged A5E long-rest attempt. */
  a5eTiming?: 'period-v1' | 'period-v2';
  a5eDurationHours?: number;
  /** Hours asleep in the recorded period; required by period-v2 (A5E §8 requires at least six). */
  a5eSleepHours?: number;
  a5eStrenuousMinutes?: number;
  /** Actors whose Sleepless Wisdom save failed: they receive short-rest benefits instead of long-rest benefits. */
  a5eSleeplessFailedActorIds?: readonly string[];
}
export interface RestHitDice { actorId: string; dice: number; healed: number }
/** Ресурс, который короткий отдых возвращает целиком: система предлагает по правилу SRD, мастер видит список в форме. Долгий возвращает все — без списка. */
export interface RestResource { actorId: string; resourceId: ResourceId }
export interface RestTaken { kind: RestKind; actorIds: readonly string[]; hitDice?: readonly RestHitDice[]; resources?: readonly RestResource[]; context?: RestContext }

/**
 * Ресурсы персонажа (решение владельца 21.09.2026): ячейки заклинаний, ярость, ци, применения умений. Лог хранит
 * id ресурса и числа; подпись и правило отдыха — в реестре SRD (src/rules/srd/resources.ts). `max` — сколько
 * ресурса всего на момент события (из таблицы класса или формулы умения): по нему редьюсер проверяет трату, а
 * журнал пишет «2 из 4», не заглядывая в компендиум. Состояние держит только потраченное — максимум выводится.
 */
export interface ResourceSpent { actorId: string; resourceId: ResourceId; amount: number; max: number }
export interface ResourceRestored { actorId: string; resourceId: ResourceId; amount: number; max: number }

/**
 * Поход партии по карте (решение владельца 27.10.2026): путь линейкой от места партии до места назначения.
 * Партия переезжает в `toId` целиком; часы двигает не поход, а TIME_ADVANCED перед ним — как у отдыха.
 * Путь — точки исходника карты `map`: из них проекция выводит пройденное для тумана знаний.
 */
export interface PartyTraveled {
  fromId?: string;
  toId: string;
  map: string;
  points: readonly { x: number; y: number }[];
  miles: number;
  pace: TravelPaceId;
  /** Дни пути по таблице Travel Pace SRD, до десятых. */
  days: number;
  /** По трудной местности (SRD Difficult Terrain: вдвое медленнее) — отметил мастер. */
  difficult?: boolean;
  /** Сколько миль пути по трудной местности — посчитала карта местности (лес, болото, горы, лёд); дни уже с ними. */
  difficultMiles?: number;
}
/** Место открыто игрокам (решение владельца 27.10.2026): туман знаний вокруг него снят и на столе игроков. */
export interface PlaceRevealed { locationId: string }

/**
 * Общий запас партии — Supply A5E (решение владельца 29.10.2026): еда и вода одним числом на всю партию. «1 Supply …
 * sustain a Small-or Medium-sized creature for a day», съедается на каждом длинном отдыхе; не съел — уровень усталости
 * (A5E fatigue — ставит мастер, состояние не из SRD). `amount` — сколько, без знака: направление даёт причина.
 * `shortfall` — сколько не хватило на еду (только у «съедено»; тогда `amount` может быть нулём).
 */
export type SupplyReason = 'bought' | 'foraged' | 'found' | 'eaten' | 'lost';
export const SUPPLY_REASONS: readonly SupplyReason[] = ['bought', 'foraged', 'found', 'eaten', 'lost'];
/** Причины, по которым припасы убывают. */
export const SUPPLY_SPENDS: ReadonlySet<SupplyReason> = new Set(['eaten', 'lost']);
export interface SupplyChanged { reason: SupplyReason; amount: number; shortfall?: number }

/**
 * Токен актёра на сетке боя переместился (Q17, решение владельца 29.10.2026): клетка до и после, откуда пришло —
 * мост к столу VTT (MapTool, `onTokenMove`) или мастер. Клетки — как у сетки VTT; клетка «до» — снимком, чтобы журнал
 * и отмена не зависели от расстановки сида.
 */
export type TokenMoveSource = 'maptool' | 'dm';
export interface GridCell { x: number; y: number }
export interface TokenMoved { actorId: string; from?: GridCell; to: GridCell; source: TokenMoveSource }

/**
 * Партия узнала факт карточки (Д6, решение владельца 29.10.2026): ссылка на сущность, строка её паспорта снимком
 * (запись не зависит от справочника и куска мира), кто узнал и проверкой ли. Без `check` — волей мастера; с проверкой
 * — навык SRD, Сл (правило стола: таблица типичных DC SRD) и итог броска, не ниже Сл: неудача ничего не открывает.
 */
export interface KnowledgeCheck { skill: SkillId; dc: number; total: number }

/**
 * Персонаж поднял уровень (Q10, решение владельца 29.10.2026): лист после повышения снимком (реплей не зависит от
 * компендиума), новый максимум хитов, AC и пассивное внимание; как получены хиты — средним SRD или броском кости.
 * Отмена возвращает уровень, хиты и ресурсы: максимум ресурсов выводится из листа.
 */
export interface CharacterLeveled {
  actorId: string;
  sheet: CharacterSheet;
  hpMax: number;
  ac: number;
  passivePerception: number;
  hp: { method: 'average' | 'roll'; value: number };
  /** Что дал уровень словами — для журнала: умения, подкласс, увеличение. */
  gained: readonly string[];
}

/** Поля паспорта листа, которые правятся вне механики: мировоззрение, божество, родная держава и биография. */
export type SheetPatch = Partial<Pick<CharacterSheet, 'alignment' | 'deity' | 'homeland' | 'bio'>>;
/** Правка листа вне механики — с причиной, она в журнале. */
export interface SheetEdited { actorId: string; patch: SheetPatch; reason: string }
export interface KnowledgeRevealed {
  ref: EntityRef;
  /** Имя сущности как на карточке — для тетради и журнала. */
  name: string;
  fact: { label: string; value: string };
  /** Кто узнал — актёр партии; нет — партия целиком. */
  by?: string;
  check?: KnowledgeCheck;
}

export interface PayloadByType {
  DAMAGE_APPLIED: DamageApplied;
  HEALING_APPLIED: HealingApplied;
  TEMP_HP_GRANTED: TempHpGranted;
  CONDITION_ADDED: ConditionAdded;
  CONDITION_REMOVED: ConditionRemoved;
  A5E_TRACK_SET: A5eTrackSet;
  A5E_STRESS_EFFECT_USED: A5eStressEffectUsed;
  A5E_PRESTIGE_UPDATED: A5ePrestigeUpdated;
  CAMPAIGN_REST_LAYER_SET: CampaignRestLayerSet;
  CAMPAIGN_STRESS_THEME_SET: CampaignStressThemeSet;
  CAMPAIGN_SETTING_PACKAGE_SET: CampaignSettingPackageSet;
  CAMPAIGN_CREATED: CampaignCreated;
  DICE_ROLLED: DiceRolled;
  NPC_SOCIAL_UPDATED: NpcSocialUpdated;
  PERSON_RELATIONSHIP_UPDATED: PersonRelationshipUpdated;
  TURN_ADVANCED: TurnAdvanced;
  TIME_ADVANCED: TimeAdvanced;
  WORLD_DELTA_ACCEPTED: WorldDeltaAccepted;
  WORLD_DELTA_REJECTED: WorldDeltaRejected;
  WORLD_DELTA_REROLLED: WorldDeltaRerolled;
  FACT_REVEALED: FactRevealed;
  NOTE_ADDED: NoteAdded;
  TIMELINE_PLAN_CREATED: TimelinePlanCreated;
  TIMELINE_PLAN_CANCELLED: TimelinePlanCancelled;
  A5E_DOWNTIME_PROJECT_UPDATED: A5eDowntimeProjectUpdated;
  A5E_KEY_KNOWLEDGE_EARNED: A5eKeyKnowledgeEarned;
  A5E_KEY_KNOWLEDGE_SPENT: A5eKeyKnowledgeSpent;
  A5E_FAVOR_EARNED: A5eFavorEarned;
  A5E_FAVOR_SPENT: A5eFavorSpent;
  A5E_WORK_RESOLVED: A5eWorkResolved;
  ENCOUNTER_STARTED: EncounterStarted;
  ENCOUNTER_ENDED: EncounterEnded;
  LAIR_ACTION_USED: LairActionUsed;
  INITIATIVE_SET: InitiativeSet;
  CONCENTRATION_STARTED: ConcentrationStarted;
  CONCENTRATION_ENDED: ConcentrationEnded;
  ACTOR_SPAWNED: ActorSpawned;
  ITEM_GAINED: ItemGained;
  INVENTORY_CONTAINER_CREATED: InventoryContainerCreated;
  INVENTORY_CONTAINER_REMOVED: InventoryContainerRemoved;
  TRANSPORT_CREATED: TransportCreated;
  TRANSPORT_REMOVED: TransportRemoved;
  COINS_EXCHANGED: CoinsExchanged;
  ITEM_LOST: ItemLost;
  ITEM_MOVED: ItemMoved;
  ITEM_TRANSFERRED: ItemTransferred;
  ITEM_GIFTED: ItemGifted;
  PERSON_ITEM_GIFTED: PersonItemGifted;
  TRADE_COMPLETED: TradeCompleted;
  TRADE_OFFER_CREATED: TradeOfferCreated;
  TRADE_OFFER_WITHDRAWN: TradeOfferWithdrawn;
  ATTUNEMENT_CHANGED: AttunementChanged;
  ITEM_EQUIPPED: ItemEquipped;
  ITEM_UNEQUIPPED: ItemUnequipped;
  ACTOR_REMOVED: ActorRemoved;
  WORLD_DELTA_PROPOSED: WorldDeltaProposed;
  REST_TAKEN: RestTaken;
  RESOURCE_SPENT: ResourceSpent;
  RESOURCE_RESTORED: ResourceRestored;
  PARTY_TRAVELED: PartyTraveled;
  PLACE_REVEALED: PlaceRevealed;
  SUPPLY_CHANGED: SupplyChanged;
  KNOWLEDGE_REVEALED: KnowledgeRevealed;
  CHARACTER_LEVELED: CharacterLeveled;
  SHEET_EDITED: SheetEdited;
  TOKEN_MOVED: TokenMoved;
}

export type EventType = keyof PayloadByType;

export const EVENT_TYPES = Object.freeze([
  'DAMAGE_APPLIED', 'HEALING_APPLIED', 'TEMP_HP_GRANTED', 'CONDITION_ADDED', 'CONDITION_REMOVED', 'A5E_TRACK_SET', 'A5E_STRESS_EFFECT_USED', 'A5E_PRESTIGE_UPDATED', 'CAMPAIGN_REST_LAYER_SET', 'CAMPAIGN_STRESS_THEME_SET', 'CAMPAIGN_SETTING_PACKAGE_SET', 'CAMPAIGN_CREATED',
  'DICE_ROLLED', 'NPC_SOCIAL_UPDATED', 'PERSON_RELATIONSHIP_UPDATED', 'TURN_ADVANCED', 'TIME_ADVANCED', 'WORLD_DELTA_ACCEPTED', 'WORLD_DELTA_REJECTED',
  'WORLD_DELTA_REROLLED', 'FACT_REVEALED', 'NOTE_ADDED', 'A5E_DOWNTIME_PROJECT_UPDATED', 'A5E_KEY_KNOWLEDGE_EARNED', 'A5E_KEY_KNOWLEDGE_SPENT', 'A5E_FAVOR_EARNED', 'A5E_FAVOR_SPENT', 'A5E_WORK_RESOLVED',
  // решение владельца 19.09.2026
  'ENCOUNTER_STARTED', 'ENCOUNTER_ENDED', 'LAIR_ACTION_USED', 'INITIATIVE_SET', 'CONCENTRATION_STARTED', 'CONCENTRATION_ENDED',
  'ACTOR_SPAWNED', 'ACTOR_REMOVED', 'WORLD_DELTA_PROPOSED',
  // E7: reversible campaign inventory operations.
  'ITEM_GAINED', 'INVENTORY_CONTAINER_CREATED', 'INVENTORY_CONTAINER_REMOVED', 'TRANSPORT_CREATED', 'TRANSPORT_REMOVED', 'COINS_EXCHANGED', 'ITEM_LOST', 'ITEM_MOVED', 'ITEM_TRANSFERRED', 'ITEM_GIFTED', 'PERSON_ITEM_GIFTED', 'TRADE_OFFER_CREATED', 'TRADE_OFFER_WITHDRAWN', 'TRADE_COMPLETED', 'ATTUNEMENT_CHANGED', 'ITEM_EQUIPPED', 'ITEM_UNEQUIPPED',
  // решение владельца 21.09.2026
  'REST_TAKEN', 'RESOURCE_SPENT', 'RESOURCE_RESTORED',
  // решение владельца 27.10.2026
  'PARTY_TRAVELED', 'PLACE_REVEALED',
  // решение владельца 29.10.2026
  'SUPPLY_CHANGED', 'KNOWLEDGE_REVEALED', 'CHARACTER_LEVELED', 'SHEET_EDITED', 'TOKEN_MOVED',
  // User-authored chronology plans: private, reversible, and separate from simulation outcomes.
  'TIMELINE_PLAN_CREATED', 'TIMELINE_PLAN_CANCELLED',
] as const satisfies readonly EventType[]);

/** Обратимость и попадание в журнал — колонки таблицы HANDOFF §7. */
export const EVENT_META: Readonly<Record<EventType, { reversible: boolean; journal: boolean }>> = {
  DAMAGE_APPLIED: { reversible: true, journal: true },
  HEALING_APPLIED: { reversible: true, journal: true },
  TEMP_HP_GRANTED: { reversible: true, journal: true },
  CONDITION_ADDED: { reversible: true, journal: true },
  CONDITION_REMOVED: { reversible: true, journal: true },
  A5E_TRACK_SET: { reversible: true, journal: true },
  A5E_STRESS_EFFECT_USED: { reversible: true, journal: true },
  A5E_PRESTIGE_UPDATED: { reversible: true, journal: true },
  CAMPAIGN_REST_LAYER_SET: { reversible: true, journal: true },
  CAMPAIGN_STRESS_THEME_SET: { reversible: true, journal: true },
  CAMPAIGN_SETTING_PACKAGE_SET: { reversible: true, journal: true },
  CAMPAIGN_CREATED: { reversible: false, journal: false },
  DICE_ROLLED: { reversible: false, journal: true },
  NPC_SOCIAL_UPDATED: { reversible: true, journal: true },
  PERSON_RELATIONSHIP_UPDATED: { reversible: true, journal: true },
  TURN_ADVANCED: { reversible: true, journal: true },
  TIME_ADVANCED: { reversible: true, journal: true },
  WORLD_DELTA_ACCEPTED: { reversible: true, journal: true },
  WORLD_DELTA_REJECTED: { reversible: true, journal: true },
  WORLD_DELTA_REROLLED: { reversible: true, journal: false },
  FACT_REVEALED: { reversible: true, journal: true },
  NOTE_ADDED: { reversible: true, journal: true },
  TIMELINE_PLAN_CREATED: { reversible: true, journal: true },
  TIMELINE_PLAN_CANCELLED: { reversible: true, journal: true },
  // Project queries and progress are DM-only; journalEntries marks the entry secret for player projections.
  A5E_DOWNTIME_PROJECT_UPDATED: { reversible: true, journal: true },
  // Key Knowledge is a private character resource; public facts remain separate KNOWLEDGE_REVEALED events.
  A5E_KEY_KNOWLEDGE_EARNED: { reversible: true, journal: true },
  A5E_KEY_KNOWLEDGE_SPENT: { reversible: true, journal: true },
  A5E_FAVOR_EARNED: { reversible: true, journal: true },
  A5E_FAVOR_SPENT: { reversible: true, journal: true },
  A5E_WORK_RESOLVED: { reversible: true, journal: true },
  ENCOUNTER_STARTED: { reversible: true, journal: true },
  ENCOUNTER_ENDED: { reversible: true, journal: true },
  LAIR_ACTION_USED: { reversible: true, journal: true },
  INITIATIVE_SET: { reversible: true, journal: true },
  CONCENTRATION_STARTED: { reversible: true, journal: true },
  CONCENTRATION_ENDED: { reversible: true, journal: true },
  ACTOR_SPAWNED: { reversible: true, journal: true },
  ITEM_GAINED: { reversible: true, journal: true },
  INVENTORY_CONTAINER_CREATED: { reversible: true, journal: true },
  INVENTORY_CONTAINER_REMOVED: { reversible: true, journal: true },
  TRANSPORT_CREATED: { reversible: true, journal: true },
  TRANSPORT_REMOVED: { reversible: true, journal: true },
  COINS_EXCHANGED: { reversible: true, journal: true },
  ITEM_LOST: { reversible: true, journal: true },
  ITEM_MOVED: { reversible: true, journal: true },
  ITEM_TRANSFERRED: { reversible: true, journal: true },
  ITEM_GIFTED: { reversible: true, journal: true },
  PERSON_ITEM_GIFTED: { reversible: true, journal: true },
  TRADE_OFFER_CREATED: { reversible: true, journal: true },
  TRADE_OFFER_WITHDRAWN: { reversible: true, journal: true },
  TRADE_COMPLETED: { reversible: true, journal: true },
  ATTUNEMENT_CHANGED: { reversible: true, journal: true },
  ITEM_EQUIPPED: { reversible: true, journal: true },
  ITEM_UNEQUIPPED: { reversible: true, journal: true },
  ACTOR_REMOVED: { reversible: true, journal: true },
  WORLD_DELTA_PROPOSED: { reversible: false, journal: false },
  REST_TAKEN: { reversible: true, journal: true },
  RESOURCE_SPENT: { reversible: true, journal: true },
  RESOURCE_RESTORED: { reversible: true, journal: true },
  PARTY_TRAVELED: { reversible: true, journal: true },
  PLACE_REVEALED: { reversible: true, journal: true },
  SUPPLY_CHANGED: { reversible: true, journal: true },
  KNOWLEDGE_REVEALED: { reversible: true, journal: true },
  CHARACTER_LEVELED: { reversible: true, journal: true },
  SHEET_EDITED: { reversible: true, journal: true },
  TOKEN_MOVED: { reversible: true, journal: true },
};

/** Команда — то, что просит интерфейс. Событие — то, что легло в лог. */
export type Command = { [T in EventType]: { type: T; payload: PayloadByType[T] } }[EventType];
/** One command in a prepared atomic group; normally the time event carries the reserved plan ID. */
export interface TransactionCommand { command: Command; eventId?: string }

/**
 * Запись лога. Отмена — компенсирующее событие того же типа с `undoes`; повтор — с `redoes`.
 * Такое событие не применяет payload заново, а откатывает или повторяет записанный `effect`
 * исходного — поэтому урон, съевший временные хиты и упёршийся в ноль, откатывается точно.
 */
export interface DomainEvent<T extends EventType = EventType> {
  id: string;
  seq: number;
  /** Время стены, мс — для журнала и сортировки. Мировое время живёт в состоянии. */
  at: number;
  /** Мировое время на момент события, секунды от начала кампании. */
  worldSec: number;
  /** Опциональная корреляция события с одной встречей; не влияет на механику и отсутствует в старых журналах. */
  interactionId?: string;
  /** Optional atomic event group. Absent from older logs. */
  transactionId?: string;
  type: T;
  payload: PayloadByType[T];
  undoes?: string;
  redoes?: string;
  /** Что событие сделало на самом деле — заполняется при применении, см. reduce.ts. */
  effect?: Effect;
}

export interface ThreadTouchSnapshot { id: string; before: number; after: number }

/** Точный след события в состоянии: достаточно, чтобы откатить без пересчёта. */
export type Effect =
  | { kind: 'hp'; targetId: string; before: HpSnapshot; after: HpSnapshot }
  | { kind: 'condition'; targetId: string; conditionId: ConditionId; before?: ConditionSnapshot; after?: ConditionSnapshot }
  | { kind: 'a5e-track'; actorId: string; track: A5eTrack; before?: number; after?: number; beforeStress?: A5eStressEffect; afterStress?: A5eStressEffect; beforeDowntimeRelaxUntilSec?: number; afterDowntimeRelaxUntilSec?: number }
  | { kind: 'a5e-stress-use'; actorId: string; before?: boolean; after?: boolean }
  | { kind: 'a5e-prestige'; actorId: string; before?: A5ePrestigeProfile; after?: A5ePrestigeProfile }
  | { kind: 'rest-layer'; before?: RestLayer; after?: RestLayer }
  | { kind: 'stress-theme'; before?: boolean; after?: boolean }
  | { kind: 'setting-package'; before?: string; after?: string; beforeRoot?: string; afterRoot?: string; locations?: readonly { id: string; before?: Location; after?: Location }[] }
  | { kind: 'turn'; before: TurnSnapshot; after: TurnSnapshot }
  | { kind: 'time'; before: number; after: number }
  /** Presence of a simulation proposal; reversible only for new transactional time steps. */
  | { kind: 'delta-proposal'; deltaId: string; before?: WorldDelta; after?: WorldDelta }
  | { kind: 'delta'; deltaId: string; before: DeltaSnapshot; after: DeltaSnapshot; threads?: readonly ThreadTouchSnapshot[] }
  | { kind: 'fact'; factId: string; before: 'dm' | 'players'; after: 'dm' | 'players'; threads?: readonly ThreadTouchSnapshot[] }
  | { kind: 'note'; noteId: string; threads?: readonly ThreadTouchSnapshot[] }
  | { kind: 'encounter'; before: EncounterSnapshot; after: EncounterSnapshot }
  | { kind: 'concentration'; actorId: string; before?: ConcentrationSnapshot; after?: ConcentrationSnapshot }
  | { kind: 'actor'; actorId: string; before?: Actor; after?: Actor; party: { before: readonly string[]; after: readonly string[] }; encounter: { before: EncounterSnapshot; after: EncounterSnapshot }; inventory?: { present: { before: boolean; after: boolean }; stacks: readonly { id: string; before?: InventoryStack; after?: InventoryStack }[] } }
  | { kind: 'inventory'; inventoryPresent: { before: boolean; after: boolean }; stacks: readonly { id: string; before?: InventoryStack; after?: InventoryStack }[]; actors: readonly { actorId: string; before: Actor; after: Actor }[]; offer?: { id: string; before: TradeOffer; after: TradeOffer } }
  | { kind: 'trade-offer'; id: string; offersPresent: { before: boolean; after: boolean }; before?: TradeOffer; after?: TradeOffer }
  | { kind: 'person-gift'; inventoryPresent: { before: boolean; after: boolean }; stacks: readonly { id: string; before?: InventoryStack; after?: InventoryStack }[]; actors: readonly { actorId: string; before: Actor; after: Actor }[]; personId: string; before?: PersonGiftState; after?: PersonGiftState }
  | { kind: 'inventory-container'; containersPresent: { before: boolean; after: boolean }; id: string; before?: InventoryContainer; after?: InventoryContainer }
  | { kind: 'transport'; transportsPresent: { before: boolean; after: boolean }; id: string; before?: PartyTransport; after?: PartyTransport }
  | { kind: 'rest'; actors: readonly { actorId: string; before: RestSnapshot; after: RestSnapshot }[] }
  | { kind: 'resource'; actorId: string; resourceId: ResourceId; before: number; after: number }
  | { kind: 'travel'; actors: readonly { actorId: string; before?: string; after?: string }[] }
  | { kind: 'place'; locationId: string; before: boolean; after: boolean }
  | { kind: 'supply'; before: number; after: number }
  /** Клетка токена на сетке боя: до (нет — не стоял) и после. */
  | { kind: 'cell'; actorId: string; before?: GridCell; after?: GridCell }
  /** Лист актёра снимком до и после: повышение уровня и правка листа. */
  | { kind: 'sheet'; actorId: string; before: SheetSnapshot; after: SheetSnapshot }
  /** Знание партии: факт `label` о `ref` — был ли он в тетради до события и после. */
  | { kind: 'knowledge'; ref: EntityRef; name: string; label: string; before: KnownFact | null; after: KnownFact | null }
  | { kind: 'npc-social'; actorId: string; before?: NpcSocialState; after?: NpcSocialState }
  | { kind: 'person-relationships'; personId: string; before?: Readonly<Record<string, NpcRelationship>>; after?: Readonly<Record<string, NpcRelationship>> }
  | { kind: 'a5e-downtime-project'; projectId: string; before?: A5eDowntimeProject; after?: A5eDowntimeProject; sheet?: { actorId: string; before: SheetSnapshot; after: SheetSnapshot } }
  | { kind: 'a5e-key-knowledge'; actorId: string; subjectRef: EntityRef; before?: number; after?: number }
  | { kind: 'a5e-favor'; actorId: string; deityRef: EntityRef; before?: number; after?: number }
  | { kind: 'a5e-work-disadvantage'; actorId: string; before?: readonly SkillId[]; after?: readonly SkillId[] }
  | { kind: 'timeline-plan'; id: string; plansPresent: { before: boolean; after: boolean }; before?: TimelinePlanRecord; after?: TimelinePlanRecord }
  | { kind: 'none' };

export interface HpSnapshot { current: number; temp: number }
export interface ConditionSnapshot { level?: number; until?: string; untilSec?: number }
export interface TurnSnapshot {
  round: number;
  turnIndex: number;
  actorId: string | null;
  lairPhaseVersion?: 1;
  lairActionWindow?: { round: number; position: 'before-round' | 'after-current' | 'before-current' };
  lairActionWindowPassedRound?: number;
}
/** Снимок предложения; `world` — значение поля мира, которое трогает патч (до и после), чтобы принятие откатывалось точно. */
export interface DeltaSnapshot { status: 'pending' | 'accepted' | 'rejected'; now: string; cause?: string; variantId?: string; world?: WorldPatch }
/** Бой целиком плюс броски инициативы актёров — всё, что меняют ENCOUNTER_* и INITIATIVE_SET. */
export interface EncounterSnapshot {
  active: boolean;
  round: number;
  turnIndex: number;
  order: readonly string[];
  initiative: Readonly<Record<string, number | undefined>>;
  lostFirstRoundActions?: readonly string[];
  lairActionsUsed?: Readonly<Record<string, { round: number; optionId: string }>>;
  lairPhaseVersion?: 1;
  lairContextVersion?: 1;
  lairContextConfirmed?: boolean;
  lairActionWindow?: { round: number; position: 'before-round' | 'after-current' | 'before-current' };
  lairActionWindowPassedRound?: number;
}
export interface ConcentrationSnapshot { spell: string; untilSec?: number }
/** Всё, что трогает отдых у одного актёра: хиты с временными, уровень истощения, потраченные кости хитов. */
/** `resourcesSpent` — потраченное по ресурсам до отдыха; нет поля — нечего было возвращать. */
export interface RestSnapshot { hp: HpSnapshot; exhaustion?: number; a5eFatigue?: number; a5eStrife?: number; a5eLastLongRestAt?: number; a5eDistraughtAidUsed?: boolean; hitDiceSpent: number; resourcesSpent?: Readonly<Record<string, number>> }
