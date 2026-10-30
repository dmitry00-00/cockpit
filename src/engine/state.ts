// Состояние — проекция лога. Здесь только форма; менять его может лишь reduce.ts.
import type { EntityRef } from '../entities/ref';
import type { AbilityId, SkillId } from '../rules/srd/abilities';
import type { ConditionId } from '../rules/srd/conditions';
import type { MonsterId } from '../rules/srd/monsters';
import type { ResourceId } from '../rules/srd/resources';
import type { ConditionSnapshot, ScaleLevel, Tempo } from './events';

export type ActorKind = 'pc' | 'npc' | 'monster';

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
  /** Рост, вес, возраст — как на бумажном листе; заполняется, когда игрок сказал. */
  bio?: { height?: string; weight?: string; age?: number };
  /** Компетентность: навыки (и «thieves-tools») с удвоенным бонусом мастерства. Нет поля — нет компетентности. */
  expertise?: readonly string[];
  /** Сделанные выборы умений: боевой стиль, избранный враг, предок дракона… — подписью и id вариантов. */
  choices?: readonly { id: string; label: string; values: readonly { id: string; name: string }[] }[];
  /** Заклинательство по SRD: характеристика, Сл спасброска и бонус атаки заклинанием, заклинания SRD по id. */
  spellcasting?: {
    ability: AbilityId;
    saveDc: number;
    attack: number;
    kind: 'known' | 'prepared' | 'spellbook';
    maxLevel: number;
    cantrips: readonly string[];
    spells: readonly string[];
    /** Всегда подготовлены (домен, клятва) и не считаются. */
    always: readonly string[];
  };
  /** Черты (feats) из таблицы владельца: id, имя, где взяты (раса или уровень ASI), +1 к характеристике. */
  feats?: readonly { id: string; name: string; at: 'race' | number; asi?: AbilityId }[];
  /** Снаряжение — предметы SRD по id с количеством (content/srd/equipment.json). */
  equipment?: readonly { id: string; qty: number }[];
  /** Атаки оружием из снаряжения: бонус к попаданию и урон уже посчитаны по листу. */
  attacks?: readonly { id: string; name: string; toHit: number; damage: string; damageType: string; proficient: boolean; range?: string; disadvantage?: string }[];
}

/** Действующий эффект заклинания без концентрации (Mage Armor): состоянием SRD не является, событий для него нет. */
export interface ActiveEffect {
  name: string;
  untilSec?: number;
  sourceId?: string;
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
}

export interface Encounter {
  active: boolean;
  round: number;
  turnIndex: number;
  /** Порядок инициативы — id актёров. */
  order: readonly string[];
}

export interface WorldDeltaVariant { id: string; now: string; cause: string }

/**
 * Что принятие предложения меняет в мире — числом, а не текстом (шаг 8). Без патча предложение остаётся
 * словами: журнал его помнит, а числа мира не трогает. Редьюсер записывает «было → стало» в след события,
 * поэтому откат точен.
 */
export type WorldPatch =
  | { kind: 'faction'; id: string; field: 'influencePercent' | 'renown' | 'trend'; value: number }
  | { kind: 'location'; id: string; field: 'pricePercent'; value: number }
  | { kind: 'location'; id: string; field: 'danger'; value: 'low' | 'medium' | 'high' }
  | { kind: 'thread'; id: string; status: 'open' | 'closed' }
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
  // Организация справочника становится фракцией кампании (E10, E5) — и обратное, снимок для отката.
  | { kind: 'newFaction'; faction: Faction }
  | { kind: 'removeFaction'; id: string }
  // Новая нить из напряжения (Д3, ROADMAP 7.3) — и обратное ей, снимок для отката принятия.
  | { kind: 'newThread'; thread: Thread }
  | { kind: 'removeThread'; id: string }
  // Процессы мира (SIMULATION.md С1, решение пользователя 30.10.2026): процесс целиком — завести или обновить, и
  // обратное — снимок для отката; составной патч — стадия процесса и её последствия одним принятием.
  | { kind: 'process'; process: Process }
  | { kind: 'removeProcess'; id: string }
  | { kind: 'batch'; patches: readonly WorldPatch[] };

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
  /** Вдали от партии (процессы мира, решение пользователя 30.10.2026): в сводке шага — свёрнутой группой «Сводка мира». */
  far?: boolean;
}

export interface Fact {
  id: string;
  text: string;
  visibility: 'dm' | 'players';
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
  danger?: 'low' | 'medium' | 'high';
  /** Надбавка к ценам в процентах: +10 → «цены +10%». */
  pricePercent?: number;
  /** Надбавка к цене отдельных товаров, в процентах (ROADMAP 3.3); нет товара — базовая. */
  prices?: Partial<Record<GoodsId, number>>;
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
  /** Влияние в процентах и его тренд за шаг времени. */
  influencePercent?: number;
  trend?: number;
  goal?: string;
  /** Организация или держава справочника (`organization:…`, `kingdom:…`): её карточка по вики (ROADMAP 3.3, TASKS К). */
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
  ended?: boolean;
  /** Причина начала: нить, факт, событие канона. */
  causeId?: string;
}

export interface State {
  time: { sec: number; tempo: Tempo };
  actors: Record<string, Actor>;
  party: readonly string[];
  encounter: Encounter;
  deltas: Record<string, WorldDelta>;
  facts: Record<string, Fact>;
  world: World;
  /** Общий запас партии, Supply A5E (SUPPLY_CHANGED); нет поля — ноль (сессии до 29.10.2026). */
  supply?: number;
  /** Тетрадь партии (KNOWLEDGE_REVEALED, Д6): что игроки знают о сущностях справочника; ключ — ссылка. */
  knowledge?: Record<EntityRef, KnownEntity>;
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
