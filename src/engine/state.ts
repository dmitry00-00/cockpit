// Состояние — проекция лога. Здесь только форма; менять его может лишь reduce.ts.
import type { AbilityId } from '../rules/srd/abilities';
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
  /** Скорость ходьбы, футов — по расе SRD; лист показывает числом. */
  speed?: number;
  /** Мировоззрение словами игрока: «Нейтральный». */
  alignment?: string;
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
  attacks?: readonly { id: string; name: string; toHit: number; damage: string; damageType: string; proficient: boolean; range?: string }[];
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
  | { kind: 'thread'; id: string; status: 'open' | 'closed' };

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
}

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
}

export interface State {
  time: { sec: number; tempo: Tempo };
  actors: Record<string, Actor>;
  party: readonly string[];
  encounter: Encounter;
  deltas: Record<string, WorldDelta>;
  facts: Record<string, Fact>;
  world: World;
}

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
