// Состояние — проекция лога. Здесь только форма; менять его может лишь reduce.ts.
import type { SettlementDraft } from '../map/settlementDraft';
import type { EntityRef } from '../entities/ref';
import type { AbilityId, SkillId } from '../rules/srd/abilities';
import type { ConditionId } from '../rules/srd/conditions';
import type { MonsterId } from '../rules/srd/monsters';
import type { ResourceId } from '../rules/srd/resources';
import type { PortraitRef } from '../art/portrait';
import type { ConditionSnapshot, NpcRelationship, NpcSocialState, PersonGiftState, ScaleLevel, Tempo, TradeOffer, TurnAdvanced } from './events';
import { DEFAULT_SETTING_PACKAGE } from '../packages/settings';
import type { AdventureBundle } from '../packages/adventure';
import type { Source } from '../rules/compendium';
import type { A5eStressEffect } from '../rules/a5e/strife';
import type { A5eDowntimeProject } from '../rules/a5e/downtime';
import type { MaterialAssessment } from '../rules/materials/classification';
import type { ProgressValue } from './progress';
export { isProgressValue } from './progress';
export type { ProgressValue } from './progress';

export type ActorKind = 'pc' | 'npc' | 'monster';
export type RestLayer = 'srd' | 'a5e';
export type A5eTrack = 'fatigue' | 'strife';
export interface A5eConditions { fatigue?: number; strife?: number; mentalStress?: A5eStressEffect }

/** A rules-neutral reference to who owns an item. Supply remains a separate campaign resource. */
export type InventoryOwner = { kind: 'actor'; id: string } | { kind: 'party' };
export type InventoryContainerKind = 'camp' | 'transport';
/** A campaign transport is a named entity; no capacity, speed, or other rule is implied by its existence. */
export interface PartyTransport { id: string; name: string }
/** Explicitly registered party storage; creation is a DM action, never inferred from rest or travel history. */
export interface InventoryContainer {
  id: string;
  name: string;
  kind: InventoryContainerKind;
  /** A camp may be explicitly tied to a canonical campaign location. */
  locationId?: string;
  /** Transport storage points to the separate campaign transport entity. Optional only for old saves. */
  transportId?: string;
}
export type InventoryStorage = { kind: 'actor'; id: string } | { kind: 'party' } | { kind: 'container'; id: string };
/** A stack is a stable campaign entity; ownership and physical storage are deliberately independent. */
export interface InventoryStack {
  id: string;
  itemId: string;
  qty: number;
  owner: InventoryOwner;
  storage: InventoryStorage;
  /** Private by default; only explicitly player-visible stacks enter player projections. */
  visibility?: 'dm' | 'players';
  attunedTo?: string;
  /** Explicit worn slot supported by the current sheet: armor or shield. Carried items are not equipped by default. */
  wornAs?: 'armor' | 'shield';
}

/**
 * Лист персонажа — из чего выведены hp.max, ac и passivePerception (src/campaign/derive.ts). Здесь ссылки
 * на компендиум (id расы, класса, умений), а не копии текста: карточка (шаг 5) достаёт текст по id.
 */
export interface CharacterSheet {
  level: number;
  raceId: string;
  subraceId?: string;
  classId: string;
  /** Подкласс компендиума, когда выбран (с уровня gainedAt); его умения — в features с уровнем получения. */
  subclassId?: string;
  /** Предыстория (rules/compendium/backgrounds.ts): два навыка уже в skills. */
  backgroundId?: string;
  /** Итоговые характеристики: база + расовые бонусы + увеличения по уровням. */
  abilities: Readonly<Record<AbilityId, number>>;
  proficiencyBonus: number;
  /** Владения навыками, включая расовые (у эльфа — Внимательность). */
  skills: readonly string[];
  /** Languages learned through supported downtime training; starting-language sources are not yet catalogued. */
  trainedLanguages?: readonly { id: string; name: string; source: 'a5e-srd:adventuring-8' }[];
  /** Умения класса по уровням из компендиума. */
  features: readonly { id: string; name: string; level: number }[];
  /** Черты расы и подрасы из компендиума. */
  traits: readonly { id: string; name: string }[];
  armor?: string;
  shield?: boolean;
  /** Mage Armor в AC листа (13 + DEX без доспеха) — дерево вывода AC (ROADMAP 5.4) знает, откуда 13. */
  mageArmor?: boolean;
  /** Скорость ходьбы, футов — по расе SRD; лист показывает числом. */
  speed?: number;
  /** Мировоззрение словами игрока: «Нейтральный». */
  alignment?: string;
  /**
   * Божество (E8): id записи справочника богов и имя латиницей — имя хранится, чтобы шапка листа не грузила справочник
   * богов (0,5 МБ); всё остальное о боге — в его карточке.
   */
  deity?: { id: string; name: string };
  /** Built-in id or bounded WebP data from a user file, embedded in the local campaign snapshot (Q12). */
  portrait?: PortraitRef;
  /** Родом из державы сеттинга (например, `kingdom:cormyr`); ссылка открывает её карточку. */
  homeland?: EntityRef;
  /** Рост, вес, возраст — как на бумажном листе; заполняется, когда игрок сказал. */
  bio?: { height?: string; weight?: string; age?: number };
  /** Компетентность: навыки (и «thieves-tools») с удвоенным бонусом мастерства. Нет поля — нет компетентности. */
  expertise?: readonly string[];
  /** Сделанные выборы умений: боевой стиль, избранный враг, предок дракона… — подписью и id вариантов. */
  choices?: readonly { id: string; label: string; values: readonly { id: string; name: string; at?: number; source?: Source; ruleset?: { id: string; version: string; layer: string } }[] }[];
  /** Заклинательство по SRD: характеристика, Сл спасброска и бонус атаки заклинанием, заклинания SRD по id. */
  spellcasting?: {
    ability: AbilityId;
    saveDc: number;
    attack: number;
    kind: 'known' | 'prepared' | 'spellbook';
    maxLevel: number;
    cantrips: readonly string[];
    spells: readonly string[];
    /** Лимит подготовленных заклинаний класса; сами spells остаются подготовленным списком. */
    preparedLimit?: number;
    /** Всегда подготовлены (домен, клятва) и не считаются. */
    always: readonly string[];
  };
  /** Черты: id и происхождение сохраняются; эффекты, которые движок не поддерживает, остаются описанием. */
  feats?: readonly {
    id: string; name: string; at: 'race' | number; asi?: AbilityId; source?: Source;
    ruleset?: { id: string; version: string; layer: string };
  }[];
  /** Снаряжение — предметы SRD по id с количеством (content/srd/equipment.json). */
  equipment?: readonly { id: string; qty: number }[];
  /** Атаки оружием из снаряжения: бонус к попаданию и урон уже посчитаны по листу. */
  attacks?: readonly { id: string; name: string; ability?: AbilityId; toHit: number; damage: string; damageType: string; proficient: boolean; range?: string; disadvantage?: string }[];
}

/** Действующий эффект заклинания без концентрации (Mage Armor): состоянием SRD не является, событий для него нет. */
export interface ActiveEffect {
  name: string;
  untilSec?: number;
  sourceId?: string;
}

/** Явная дополнительная награда A5E Prestige; количество очков задаёт ведущий по источнику правила. */
export interface A5ePrestigeAward {
  id: string;
  points: number;
  reason: string;
  source: 'stronghold' | 'great-deed' | 'class-feature' | 'table-rule';
}

/** Личный профиль Prestige персонажа. Фракционная известность хранится отдельно в Faction.renown. */
export interface A5ePrestigeProfile {
  centerLocationId?: string;
  awards: readonly A5ePrestigeAward[];
}

export interface Actor {
  id: string;
  name: string;
  kind: ActorKind;
  hp: { current: number; max: number; temp: number };
  ac: number;
  passivePerception: number;
  /** Состояния SRD; у истощения — уровень 1–6, у остальных — срок, если есть. */
  conditions: Partial<Record<ConditionId, ConditionSnapshot>>;
  /** Отдельные шкалы A5E; отсутствие/0 означает, что состояние не набрано. Fatigue без верхней границы в локальном journey source; Strife — 0–7. */
  a5eConditions?: A5eConditions;
  /** Время завершения последнего A5E long rest (секунды игрового времени); старые логи заполняют поле при реплее. */
  a5eLastLongRestAt?: number;
  /** End of the latest downtime interval in which this character used the table-rule Strife recovery. */
  a5eDowntimeRelaxUntilSec?: number;
  /** Использовал ли персонаж преимущество Distraught с последнего завершённого долгого отдыха. */
  a5eDistraughtAidUsed?: boolean;
  /** Концентрация — ставится и снимается событиями CONCENTRATION_STARTED / ENDED (решение владельца 19.09.2026). */
  concentration?: { spell: string; untilSec?: number };
  /** Эффекты со сроком, которые не концентрация и не состояние SRD — тоже данные актёра. */
  effects?: readonly ActiveEffect[];
  /** Бросок инициативы: ставится ENCOUNTER_STARTED / INITIATIVE_SET; у сида — заранее известный. */
  initiative?: number;
  /** Потраченные кости хитов (REST_TAKEN): всего их — уровень листа, кость — по классу SRD; нет поля — ноль. */
  hitDiceSpent?: number;
  /** Потраченное по ресурсам (RESOURCE_SPENT / RESTORED): id → сколько; максимум выводится из листа (campaign/resources.ts). Нет записи — не тратил. */
  resourcesSpent?: Readonly<Partial<Record<ResourceId, number>>>;
  /** Выбыл (ACTOR_REMOVED): убит, сбежал, ушёл. Остаётся в состоянии, чтобы старые события по нему реплеились. */
  removed?: boolean;
  /** Где актёр, если отделился от партии. */
  locationId?: string;
  /** Клетка на сетке боя (TOKEN_MOVED); нет — расстановка сида или не стоит на сетке. */
  cell?: { x: number; y: number };
  /** У персонажа игрока — лист, у монстра — блок статов SRD по id. Карточка читает отсюда. */
  sheet?: CharacterSheet;
  monsterId?: MonsterId;
  /** DM-only отношение активного NPC/монстра к партии и повторные провалы Influence. */
  social?: NpcSocialState;
  /** Персональные очки Key Knowledge A5E по субъекту; отсутствующее поле означает ноль. */
  a5eKeyKnowledge?: Partial<Record<EntityRef, number>>;
  /** Личный Prestige A5E и выбранный центр; faction renown не влияет на это значение. */
  a5ePrestige?: A5ePrestigeProfile;
  /** Персональная милость A5E по божеству; отдельна от церковного влияния Q7. */
  a5eFavor?: Partial<Record<EntityRef, number>>;
  /** Навыки, на которых следующая A5E legal Work-проверка получает помеху после результата 5 или ниже. */
  a5eWorkDisadvantageSkills?: readonly SkillId[];
}

export interface Encounter {
  active: boolean;
  round: number;
  turnIndex: number;
  /** Порядок инициативы — id актёров. */
  order: readonly string[];
  /** A5E Obsessed failures: actors skip their first round of actions, recorded at encounter start. */
  lostFirstRoundActions?: readonly string[];
  /** Latest marked lair option per monster, used to enforce once-per-round and no consecutive repeats. */
  lairActionsUsed?: Readonly<Record<string, { round: number; optionId: string }>>;
  /** Initiative-20 lair phase inserted between turns. */
  lairActionWindow?: { round: number; position: 'before-round' | 'after-current' | 'before-current' };
  /** Prevents initiative edits from reopening a lair phase already passed this round. */
  lairActionWindowPassedRound?: number;
  /** Versioned initiative-20 phase semantics; absent in historical encounters. */
  lairPhaseVersion?: 1;
  /** Versioned lair-context gate; absent in historical encounters. */
  lairContextVersion?: 1;
  /** Whether the GM confirmed this encounter takes place in this creature's lair. */
  lairContextConfirmed?: boolean;
}

export interface WorldDeltaVariant { id: string; now: string; cause: string }

/** Campaign-only political status for a settlement; the catalog's kingdom/place links remain untouched. */
export interface SettlementPolityRecord {
  status: 'independent';
  separatedFrom: { kingdomId: string; kingdomName: string };
  atSec: number;
  source: string;
}

export interface EpidemicExposure {
  id: string;
  incubationDays: number;
  treatmentPerDay: number;
  treatmentTemples: number;
  treatmentSource: string;
}

/**
 * Что принятие предложения меняет в мире — числом, а не текстом (шаг 8). Без патча предложение остаётся
 * словами: журнал его помнит, а числа мира не трогает. Редьюсер записывает «было → стало» в след события,
 * поэтому откат точен.
 */
export type WorldPatch =
  | { kind: 'faction'; id: string; field: 'influencePercent' | 'renown' | 'trend' | 'standing'; value: number }
  | { kind: 'location'; id: string; field: 'pricePercent'; value: number }
  | { kind: 'location'; id: string; field: 'danger'; value: 'low' | 'medium' | 'high' }
  | { kind: 'location'; id: string; field: 'haven'; value: boolean }
  | { kind: 'locationGeo'; id: string; geo: LocationGeo | null }
  | { kind: 'population'; id: string; value: number | null }
  | { kind: 'order'; id: string; value: number | null }
  | { kind: 'kingdomOrder'; kingdomId: string; value: number | null; source: string }
  | { kind: 'thread'; id: string; status: 'open' | 'closed' }
  | { kind: 'threadClock'; id: string; clock: ProgressClock | null }
  | { kind: 'threadFront'; id: string; front: DungeonWorldFront | null }
  // Модель мира (ROADMAP 3.3, Q6, решение владельца 28.10.2026): отношение двух фракций — оба конца сразу, −3…+3.
  | { kind: 'relation'; id: string; other: string; value: number }
  // Надбавка к цене товара в месте, в процентах; 0 — базовая.
  | { kind: 'price'; id: string; goods: GoodsId; value: number }
  // Запас товара в месте (С3): число в единицах товара; null — запас на равновесии, поля нет.
  | { kind: 'stock'; id: string; goods: GoodsId; value: number | null }
  // Вес встречи в месте: множитель к её доле в таблице, 1 — как в таблице, 0 — не встречается.
  | { kind: 'encounter'; id: string; key: string; value: number }
  // Новое место (M8, ROADMAP 3.5) и обратное ему — снимок «было» при откате принятия.
  | { kind: 'newLocation'; location: Location }
  | { kind: 'removeLocation'; id: string }
  // Campaign-only control overlay for a gazetteer place; canonical ownership is not rewritten.
  | { kind: 'territoryControl'; warProcessId: string; placeId: string; controller: TerritoryController | null }
  // City secession is campaign state, separate from war-front control and canonical kingdom membership.
  | { kind: 'settlementPolity'; locationId: string; value: SettlementPolityRecord | null }
  // Организация справочника становится фракцией кампании (E10, E5) — и обратное, снимок для отката.
  | { kind: 'newFaction'; faction: Faction }
  | { kind: 'removeFaction'; id: string }
  // Новая нить из напряжения (Д3, ROADMAP 7.3) — и обратное ей, снимок для отката принятия.
  | { kind: 'newThread'; thread: Thread }
  | { kind: 'removeThread'; id: string }
  // Импортированный материал хранится как черновая запись кампании; запись появляется только после принятия входящего предложения.
  | { kind: 'importedContent'; content: ImportedContent }
  | { kind: 'removeImportedContent'; id: string }
  // A generated HB mechanic gets a narrow runtime adapter only after a separate accepted proposal.
  | { kind: 'homebrewMechanicRuntime'; binding: HomebrewMechanicRuntime }
  | { kind: 'removeHomebrewMechanicRuntime'; id: string }
  // An adventure becomes a live session only through an accepted, explicit launch proposal.
  | { kind: 'adventureSession'; session: AdventureSession }
  | { kind: 'removeAdventureSession'; id: string }
  | { kind: 'settlementPlan'; plan: SettlementPlanRecord }
  | { kind: 'removeSettlementPlan'; id: string }
  // Процессы мира (SIMULATION.md С1, решение пользователя 30.10.2026): процесс целиком — завести или обновить, и
  // обратное — снимок для отката; составной патч — стадия процесса и её последствия одним принятием.
  | { kind: 'process'; process: Process }
  | { kind: 'removeProcess'; id: string }
  // Concurrent disease ticks and caravan arrivals merge by location and keep exact snapshots for undo/replay.
  | { kind: 'epidemicExposure'; locationId: string; exposure: EpidemicExposure; template: Process }
  | { kind: 'epidemicExposureRestore'; locationId: string; disease: string; processes: readonly Process[] }
  | { kind: 'epidemicState'; base: Process; process: Process }
  // Rumors and authored cosmic events become campaign facts only after accepting their pending proposal.
  | { kind: 'newFact'; fact: Fact }
  | { kind: 'removeFact'; id: string }
  | { kind: 'batch'; patches: readonly WorldPatch[] };

/** Semantic state read by a simulation result in addition to the fields it will overwrite. */
export type WorldReadDependency = { kind: 'caravan-route-clearance'; placeId: string };
export interface WorldReadSnapshot {
  dependency: WorldReadDependency;
  /** Canonical JSON of the active blockade/front process identities at this route node. */
  value: string;
}

/** Предложение симуляции: пока мастер не решил, в мире стоит `was`, а `now` живёт только здесь. */
export interface WorldDelta {
  id: string;
  scale: ScaleLevel;
  subject: string;
  was: string;
  now: string;
  cause: string;
  causeId: string;
  status: 'pending' | 'accepted' | 'rejected';
  variants?: readonly WorldDeltaVariant[];
  variantId?: string;
  /** Нити, к которым относится предложение; без них нить — causeId, если он указывает на нить. */
  threadIds?: readonly string[];
  /** Что меняется в мире при принятии; у вариантов переброса свой патч не ведётся — переброс меняет слова. */
  patch?: WorldPatch;
  /** Reducer-captured optimistic precondition for every field touched by patch; never trusted from proposal input. */
  patchBase?: WorldPatch;
  /** Reducer-derived read set and its snapshot; route closure changes can invalidate a caravan outcome without changing its write set. */
  readDependencies?: readonly WorldReadDependency[];
  readBase?: readonly WorldReadSnapshot[];
  /** Вдали от партии (процессы мира, решение пользователя 30.10.2026): в сводке шага — свёрнутой группой «Сводка мира». */
  far?: boolean;
}

export interface Fact {
  id: string;
  text: string;
  visibility: 'dm' | 'players';
  /** A public rumor is local knowledge at its destination, not a claim that the content is true. */
  category?: 'rumor';
  scale?: ScaleLevel;
  subjectId?: string;
  /** Нити, к которым относится факт: секрет показывается в карточке нити. */
  threadIds?: readonly string[];
}

/** Место на лестнице масштабов: поселение, регион… Числа — как в §13, без единиц в имени поля. */
export interface Location {
  id: string;
  name: string;
  scale: ScaleLevel;
  parentId?: string;
  population?: number;
  /** Optional campaign settlement order on the 0–10 table-rule scale; absence is not inferred for catalog places. */
  order?: number;
  danger?: 'low' | 'medium' | 'high';
  /** Надбавка к ценам в процентах: +10 → «цены +10%». */
  pricePercent?: number;
  /** Надбавка к цене отдельных товаров, в процентах (ROADMAP 3.3); нет товара — базовая. */
  prices?: Partial<Record<GoodsId, number>>;
  /** Haven A5E: безопасное место для полноценного сна; отсутствие поля равно false. */
  haven?: boolean;
  /** Запас товара (С3): еда — в днях на жителя (A5E Supply), остальное — 0–10, 5 — норма. Нет товара — запас на
   *  равновесии места (world/econ.ts), поле заводит только торговля. */
  stock?: Partial<Record<GoodsId, number>>;
  /** Веса встреч: ключ — кто встречается, латиницей («Werewolf»), значение — множитель к доле в таблице; нет — ×1. */
  encounters?: Record<string, number>;
  /** Место справочника карты (`place:…`) — его карточка даёт богов, церкви, организации и жителей по вики. */
  ref?: EntityRef;
  /** Где место на карте мира: пиксели исходного растра карты `map` (content/maps/<map>.json). */
  geo?: LocationGeo;
  /** Открыто игрокам (PLACE_REVEALED): туман знаний вокруг места снят и на их столе. */
  revealed?: boolean;
}

export interface LocationGeo {
  map: string;
  x: number;
  y: number;
  /** Полуширина рамки, в которую карта вписывает место на его уровне; ry — полувысота, если рамка не квадрат. */
  r?: number;
  ry?: number;
}

export interface Faction {
  id: string;
  name: string;
  /** Известность партии у фракции. */
  renown: number;
  /** Отношение фракции к партии (A5E/правило кампании), отдельное от известности. */
  standing?: number;
  /** Влияние в процентах и его тренд за шаг времени. */
  influencePercent?: number;
  trend?: number;
  goal?: string;
  /** Ссылка на организацию/державу справочника или явно активированное место (`place:…`) кампании. */
  ref?: EntityRef;
  /** Отношения с другими фракциями −3…+3, симметрично: у обеих сторон одно число; нет — 0. */
  relations?: Record<string, number>;
}

/**
 * Товары для цен мест (ROADMAP 3.3): разделы таблиц снаряжения SRD 5.1 (Weapons, Armor, Adventuring Gear, Mounts and
 * Vehicles, Food Drink and Lodging) и зелья — то, что покупает партия. Короткий закрытый список: симуляция двигает цену
 * раздела, а не вещи.
 */
export const SRD_GOODS = ['weapons', 'armor', 'gear', 'food', 'mounts', 'potions'] as const;
/**
 * Двенадцать товаров торговли (SIMULATION.md С3, решение пользователя 30.10.2026): разделы SRD и шесть грузов, к
 * которым сводятся экспорт и импорт держав вики (scripts/econ-from-wiki.py). Порядок — сначала разделы SRD.
 */
export const GOODS = [...SRD_GOODS, 'wine', 'cloth', 'timber', 'metal', 'precious', 'spices'] as const;
export type GoodsId = (typeof GOODS)[number];

/** Нить сюжета: открыта когда-то, последнее внимание — тогда-то; «без внимания N дней» считается от времени сида. */
export interface Thread {
  id: string;
  name: string;
  status: 'open' | 'closed';
  openedSec: number;
  lastTouchedSec: number;
  /** Optional GM-authored progress clock. The tick interval is a table rule, not inferred from the thread. */
  clock?: ProgressClock;
  /** Optional Dungeon World front: GM-authored dangers and portents, advanced only through accepted proposals. */
  front?: DungeonWorldFront;
}

export interface FrontPortent { id: string; text: string; fulfilled: boolean }
export interface FrontDanger {
  id: string;
  name: string;
  impulse: string;
  impendingDoom: string;
  portents: readonly FrontPortent[];
  /** GM-authored record that the doom came to pass; not a simulation of its world effects. */
  resolution?: { text: string; atSec: number };
}
/** Prep notes from Dungeon World, stored as GM-only thread data; no automatic world effects are inferred. */
export interface DungeonWorldFront {
  /** Fixed provenance: Dungeon World SRD, Fronts; this is prep structure, not imported game mechanics. */
  source: 'dungeon-world-srd:fronts';
  type: 'adventure' | 'campaign';
  stakes: readonly string[];
  dangers: readonly FrontDanger[];
  cast?: readonly string[];
}

/** Progress display only. Filling it creates no consequence; the GM authors the resulting proposal. */
export interface ProgressClock extends ProgressValue {
  /** World-time baseline for tenday ticks; legacy clocks use the thread's lastTouchedSec. */
  startedSec?: number;
  /** Explicitly opened to players; stages, causes and the configured consequence remain private. */
  playerVisible?: boolean;
  /** GM-authored neutral caption used only on the player projection of a process clock. */
  playerLabel?: string;
}

/**
 * Мир вне партии. Меняется одним путём — принятием предложения с патчем (WORLD_DELTA_ACCEPTED, шаг 8):
 * влияние и известность фракции, надбавка к ценам и опасность места, статус нити. Предложение без патча
 * остаётся словами. Пока мастер не решил, здесь стоит старое значение.
 */
export interface World {
  locations: Record<string, Location>;
  factions: Record<string, Faction>;
  threads: Record<string, Thread>;
  /** Процессы мира (SIMULATION.md): войны, караваны, голод…; нет в старых файлах сессии — пусто. */
  processes?: Record<string, Process>;
  /** Принятые локальные импорты из файлов; сохраняется только нормализованная выборка полей. */
  importedContent?: Record<string, ImportedContent>;
  /** Explicitly approved, narrow adapters for generated HB mechanics; never included in player projections. */
  activeHomebrewMechanics?: Record<string, HomebrewMechanicRuntime>;
  /** Active table sessions reference an accepted source package; they do not copy book text into player state. */
  adventureSessions?: Record<string, AdventureSession>;
  /** Accepted authored geometry, keyed by campaign location; never replaces a canonical package plan. */
  settlementPlans?: Record<string, SettlementPlanRecord>;
  /** Explicit GM-authored campaign control; catalog kingdom membership remains unchanged. */
  territoryControl?: Record<string, TerritoryController>;
  /** Campaign-only city secession records, keyed by campaign location id. */
  settlementPolity?: Record<string, SettlementPolityRecord>;
  /** Campaign-only order scores for polities; catalog records and player projections remain unchanged. */
  kingdomOrder?: Record<string, KingdomOrderRecord>;
  /** Explicit GM-authored calendar plans. They do not advance time or imply world outcomes. */
  timelinePlans?: Record<string, TimelinePlanRecord>;
}

export interface TimelinePlanRecord {
  id: string;
  title: string;
  details: string;
  startSec: number;
  endSec: number;
  source: string;
  visibility: 'dm';
  status: 'active' | 'cancelled';
}

export interface KingdomOrderRecord {
  value: number;
  source: string;
}

export interface TerritoryController {
  kingdomId: string;
  kingdomName: string;
}

export interface SettlementPlanRecord {
  locationId: string;
  settingPackageId: string;
  mapId: string;
  draft: SettlementDraft;
}

export type ImportedContentKind = 'character' | 'monster' | 'mechanic' | 'dungeon' | 'location' | 'scene' | 'token' | 'adventure';
export interface ImportedContent {
  id: string;
  kind: ImportedContentKind;
  name: string;
  sourceFormat: 'foundry' | '5etools' | 'uvtt' | 'maptool' | 'json';
  sourceFile: string;
  /** Декларация, прочитанная из файла; отсутствие/неизвестность запрещает выдавать материал за открытый. */
  rights?: { status: 'declared' | 'unverified'; license?: string };
  /** Draft mechanic classification from parsed source; never trusted as an accepted rule by itself. */
  materialAssessment?: MaterialAssessment;
  /** Машиночитаемая запись, ограниченная импортёром; не является активным актёром/местом до отдельной сборки. */
  data: Readonly<Record<string, unknown>>;
}

/** Runtime supports only direct hit-point changes; the source and exact numeric claim stay in importedContent. */
export type HomebrewRuntimeEffect = 'damage' | 'healing' | 'temporary-hp';
export interface HomebrewMechanicRuntime {
  /** One adapter per accepted HB mechanic; this key is also the mechanic's source ID in use events. */
  contentId: string;
  numericClaimId: string;
  effect: HomebrewRuntimeEffect;
}

/** Campaign-level activation: an immutable, source-indexed graph snapshot becomes session-scoped game content. */
export interface AdventureSession {
  id: string;
  contentId: string;
  /** Typed locations, routes, scenes, people, creatures, threads and facts from the accepted package. */
  graph: AdventureBundle;
  title: string;
  distribution: 'open' | 'table' | 'internal';
  settingPackageId: string;
  rulesPackageIds: readonly string[];
  /** May be empty for a system-neutral GM preparation session; the active party can be attached later. */
  partyIds: readonly string[];
  entrySceneId: string;
  secretFactId: string;
  startedSec: number;
  status: 'active' | 'resolved';
  /** Accepted scene-outcome proposals; each entry is reversible through the campaign journal. */
  resolvedProposalIds?: readonly string[];
  /** Runtime availability layered over the immutable authored graph. Missing entries mean the authored route is open. */
  routeStates?: Readonly<Record<string, AdventureRouteState>>;
}

/** One accepted, reversible campaign decision about an authored route. */
export interface AdventureRouteState {
  status: 'open' | 'closed';
  causeId: string;
  reason: string;
  /** Campaign time when the master prepared this decision; the accepted journal event records the authoritative event time. */
  proposedSec: number;
}

/**
 * Процесс мира — машина стадий (SIMULATION.md): вид из реестра `campaign/processes.ts`, стадия, участники, такт.
 * Двигается только принятым предложением: стадия и последствия — патчем `batch`. Кончившийся остаётся историей.
 */
export interface Process {
  id: string;
  /** Вид из реестра процессов: «war», «caravan»… */
  kind: string;
  name: string;
  scale: ScaleLevel;
  stage: string;
  /** Участники — ссылки справочника («kingdom:cormyr») или id фракций и мест кампании. */
  parties: readonly string[];
  /** Где идёт: id места кампании, если есть. */
  at?: string;
  startedSec: number;
  /** Секунда следующего такта; такт — шаг вида процесса. */
  nextSec: number;
  /** Счётчики процесса — числа правил стола: сила сторон, дни в пути… */
  vars: Readonly<Record<string, number>>;
  /** Версионированные расширенные данные вида процесса; отсутствует у старых сохранений и обычных процессов. */
  data?: Readonly<Record<string, unknown>>;
  /** Optional visible progress projection supplied by this process kind (for example, caravan route legs). */
  clock?: ProgressClock;
  ended?: boolean;
  /** Причина начала: нить, факт, событие канона. */
  causeId?: string;
}

export interface State {
  /** Selected setting package; absent in legacy snapshots resolves to the default FR package. */
  settingPackageId?: string;
  /** Root of the selected setting's location tree; keeps scale navigation scoped across package changes. */
  settingRootId?: string;
  /** Package-ladder entry point for a newly created empty campaign; navigation preference, not party presence. */
  startLocationId?: string;
  time: { sec: number; tempo: Tempo };
  actors: Record<string, Actor>;
  /** Canonical event-sourced item stacks. Missing on older saves until deterministic legacy migration. */
  inventory?: Record<string, InventoryStack>;
  /** Named camp/transport storage explicitly created by the DM; never inferred from completed journeys or rests. */
  inventoryContainers?: Record<string, InventoryContainer>;
  /** Named campaign vehicles, separate from their cargo containers and without inferred mechanics. */
  transports?: Record<string, PartyTransport>;
  party: readonly string[];
  encounter: Encounter;
  deltas: Record<string, WorldDelta>;
  facts: Record<string, Fact>;
  world: World;
  /** Выбранный слой отдыха кампании; отсутствует в прежних сохранениях и трактуется как SRD. */
  restLayer?: RestLayer;
  /** Campaign opt-in for stress/morale mechanics; absent in legacy saves means off. */
  a5eStrifeEnabled?: boolean;
  /** Общий запас партии, Supply A5E (SUPPLY_CHANGED); нет поля — ноль (сессии до 29.10.2026). */
  supply?: number;
  /** Тетрадь партии (KNOWLEDGE_REVEALED, Д6): что игроки знают о сущностях справочника; ключ — ссылка. */
  knowledge?: Record<EntityRef, KnownEntity>;
  /** Campaign-only relationship overlays for read-only `person:` references; canonical person records remain untouched. */
  personRelationships?: Record<string, Readonly<Record<string, NpcRelationship>>>;
  /** Campaign-only physical gifts to read-only `person:` references; one per person per tenday. */
  personGifts?: Record<string, PersonGiftState>;
  /** Saved DM-only trade offers; open offers do not reserve inventory or coin stacks. */
  tradeOffers?: Record<string, TradeOffer>;
  /** Campaign-local, DM-only A5E information work; public projections never copy this field. */
  a5eDowntimeProjects?: Record<string, A5eDowntimeProject>;
}

/**
 * Pure transition used by the store and reducer for versioned encounter turns.
 * `hasLairActor` is supplied by the caller so this state module stays rules-data neutral.
 */
export function nextTurnTransition(state: Pick<State, 'encounter' | 'actors'>, hasLairActor: boolean): TurnAdvanced {
  const { encounter, actors } = state;
  const lost = new Set(encounter.round === 1 ? encounter.lostFirstRoundActions ?? [] : []);
  let turnIndex = encounter.turnIndex;
  let round = encounter.round;
  let lairActionWindow = encounter.lairActionWindow;
  let lairActionWindowPassedRound = encounter.lairActionWindowPassedRound;
  const advance = () => {
    turnIndex++;
    if (turnIndex >= encounter.order.length) { turnIndex = 0; round++; }
  };
  const openWindow = (phase: NonNullable<typeof lairActionWindow>) => { lairActionWindow = phase; };

  if (encounter.lairPhaseVersion !== 1) {
    let steps = 0;
    if (!lost.has(encounter.order[turnIndex])) steps++;
    do {
      advance();
      steps++;
    } while (round === 1 && lost.has(encounter.order[turnIndex]) && steps <= encounter.order.length + 1);
    return { round, turnIndex, actorId: encounter.order[turnIndex] ?? '' };
  }

  const allBelowTwenty = encounter.order.every(id => (actors[id]?.initiative ?? 0) < 20);
  const allAtLeastTwenty = encounter.order.every(id => (actors[id]?.initiative ?? 0) >= 20);

  if (lairActionWindow) {
    lairActionWindowPassedRound = lairActionWindow.round;
    const position = lairActionWindow.position;
    lairActionWindow = undefined;
    if (position === 'after-current') advance();
    // A round-start / before-current slot is before the actor already at the pointer.
    let skipped = 0;
    while (round === 1 && lost.has(encounter.order[turnIndex]) && skipped < encounter.order.length) {
      advance();
      skipped++;
    }
    if (hasLairActor && allBelowTwenty && round > encounter.round && !lairActionWindow) {
      openWindow({ round, position: 'before-round' });
    }
  } else {
    let previousIndex = turnIndex;
    let previousRound = round;
    let skipped = 0;
    while (skipped <= encounter.order.length) {
      advance();
      const wrapped = round > previousRound;
      if (hasLairActor && lairActionWindowPassedRound !== round) {
        if (wrapped && allBelowTwenty) {
          openWindow({ round, position: 'before-round' });
          break;
        }
        if (wrapped && allAtLeastTwenty && lairActionWindowPassedRound !== previousRound) {
          turnIndex = previousIndex;
          round = previousRound;
          openWindow({ round, position: 'after-current' });
          break;
        }
        const fromInitiative = actors[encounter.order[previousIndex]]?.initiative ?? 0;
        const toInitiative = actors[encounter.order[turnIndex]]?.initiative ?? 0;
        if (!wrapped && fromInitiative >= 20 && toInitiative < 20 && lairActionWindowPassedRound !== round) {
          turnIndex = previousIndex;
          openWindow({ round, position: 'after-current' });
          break;
        }
      }
      if (round !== 1 || !lost.has(encounter.order[turnIndex])) break;
      previousIndex = turnIndex;
      previousRound = round;
      skipped++;
    }
  }

  return {
    round, turnIndex, actorId: encounter.order[turnIndex] ?? '', lairPhaseVersion: 1,
    ...(lairActionWindow ? { lairActionWindow } : {}),
    ...(lairActionWindowPassedRound !== undefined ? { lairActionWindowPassedRound } : {}),
  };
}

/** Строка тетради: факт карточки снимком, когда узнали (секунды мира), кто и какой проверкой. */
export interface KnownFact {
  label: string;
  value: string;
  sec: number;
  by?: string;
  check?: { skill: SkillId; dc: number; total: number };
}
export interface KnownEntity { ref: EntityRef; name: string; facts: KnownFact[] }

export const SECONDS_PER_DAY = 86_400;

export function emptyState(): State {
  return {
    settingPackageId: DEFAULT_SETTING_PACKAGE,
    time: { sec: 0, tempo: 'hour' },
    actors: {},
    party: [],
    encounter: { active: false, round: 0, turnIndex: 0, order: [] },
    deltas: {},
    facts: {},
    world: { locations: {}, factions: {}, threads: {} },
  };
}

export const dayOf = (sec: number): number => Math.floor(sec / SECONDS_PER_DAY);
