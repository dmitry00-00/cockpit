// Доменные события — единственный источник правды (HANDOFF §7). Тринадцать типов из пакета плюс восемь,
// добавленных решением владельца 19.09.2026 (сборка боя, концентрация, появление и уход актёров, само
// предложение симуляции — иначе они жили вне лога и ломали реплей), плюс отдых и ресурсы персонажа (трата и
// восстановление) — решения владельца 21.09.2026. Навигация, оверлеи, фильтры, слои и режим «глазами игроков»
// событиями не являются.
import type { ConditionId } from '../rules/srd/conditions';
import type { ResourceId } from '../rules/srd/resources';
import type { Actor, WorldDelta, WorldPatch } from './state';

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

export interface DamageApplied { targetId: string; amount: number; type?: string; sourceId?: string }
export interface HealingApplied { targetId: string; amount: number; sourceId?: string }
export interface TempHpGranted { targetId: string; amount: number; sourceId?: string }
/** Срок состояния: `until` — словами («конец следующего хода»), `untilSec` — мировым временем, тогда чип считает остаток и по истечении система напоминает. */
export interface ConditionAdded { targetId: string; conditionId: ConditionId; level?: number; until?: string; untilSec?: number }
export interface ConditionRemoved { targetId: string; conditionId: ConditionId }
export interface DiceRolled { formula: string; dice: readonly number[]; mod: number; total: number; hidden: boolean; label: string }
export interface TurnAdvanced { round: number; turnIndex: number; actorId: string }
export interface TimeAdvanced { tempo: Tempo; steps: number; fromDay: number; toDay: number; fromSec: number; toSec: number }
export interface WorldDeltaAccepted { deltaId: string; subject: string; was: string; now: string; causeId: string }
export interface WorldDeltaRejected { deltaId: string; reason?: string }
export interface WorldDeltaRerolled { deltaId: string; variantId: string }
export interface FactRevealed { factId: string; audience: 'players' }
export interface NoteAdded { text: string; threadIds: readonly string[]; scale: ScaleLevel }

/** Строка порядка инициативы: кто и с каким броском. */
export interface InitiativeEntry { actorId: string; initiative: number }
/** Бой начался: порядок целиком, раунд 1, ход первого. Внезапные — пропускают первый ход (решает мастер, событие лишь помнит). */
export interface EncounterStarted { order: readonly InitiativeEntry[]; surprised?: readonly string[] }
export interface EncounterEnded { reason?: string }
/** Порядок целиком заново — так откат тривиален: снимок «было → стало», а не разница. */
export interface InitiativeSet { order: readonly InitiativeEntry[] }
export interface ConcentrationStarted { actorId: string; spell: string; untilSec?: number }
/** Почему упала: спасбросок, другое заклинание с концентрацией, недееспособность, срок, решение мастера. */
export type ConcentrationEndReason = 'save' | 'cast' | 'unconscious' | 'expired' | 'dm';
export interface ConcentrationEnded { actorId: string; reason: ConcentrationEndReason }
/** Актёр в сессии — полным снимком: реплей не должен зависеть от того, что через месяц лежит в компендиуме. */
export interface ActorSpawned { actor: Actor; party?: boolean }
/** Уход — флаг, а не удаление: старые события по актёру остаются валидными при реплее. Из порядка инициативы выбывает. */
export type ActorRemoveReason = 'dead' | 'fled' | 'left' | 'dm';
export interface ActorRemoved { actorId: string; reason?: ActorRemoveReason }
/** Предложение симуляции — снимком дельты. Не действие мастера: необратимо и без строки в журнале, как переброс. */
export interface WorldDeltaProposed { delta: WorldDelta }
/**
 * Отдых (решение владельца 21.09.2026). Короткий — кости хитов по актёру: сколько потрачено и сколько хитов
 * вернулось (игроки бросают сами, мастер вводит сумму с CON; кто не тратил — просто отдыхал). Долгий — хиты
 * полны, временные сгорают, истощение на уровень меньше, половина костей хитов (не меньше одной) возвращается.
 * Часы двигает не отдых, а отдельный TIME_ADVANCED перед ним: время в системе меняет одно событие.
 */
export type RestKind = 'short' | 'long';
export interface RestHitDice { actorId: string; dice: number; healed: number }
/** Ресурс, который короткий отдых возвращает целиком: система предлагает по правилу SRD, мастер видит список в форме. Долгий возвращает все — без списка. */
export interface RestResource { actorId: string; resourceId: ResourceId }
export interface RestTaken { kind: RestKind; actorIds: readonly string[]; hitDice?: readonly RestHitDice[]; resources?: readonly RestResource[] }

/**
 * Ресурсы персонажа (решение владельца 21.09.2026): ячейки заклинаний, ярость, ци, применения умений. Лог хранит
 * id ресурса и числа; подпись и правило отдыха — в реестре SRD (src/rules/srd/resources.ts). `max` — сколько
 * ресурса всего на момент события (из таблицы класса или формулы умения): по нему редьюсер проверяет трату, а
 * журнал пишет «2 из 4», не заглядывая в компендиум. Состояние держит только потраченное — максимум выводится.
 */
export interface ResourceSpent { actorId: string; resourceId: ResourceId; amount: number; max: number }
export interface ResourceRestored { actorId: string; resourceId: ResourceId; amount: number; max: number }

export interface PayloadByType {
  DAMAGE_APPLIED: DamageApplied;
  HEALING_APPLIED: HealingApplied;
  TEMP_HP_GRANTED: TempHpGranted;
  CONDITION_ADDED: ConditionAdded;
  CONDITION_REMOVED: ConditionRemoved;
  DICE_ROLLED: DiceRolled;
  TURN_ADVANCED: TurnAdvanced;
  TIME_ADVANCED: TimeAdvanced;
  WORLD_DELTA_ACCEPTED: WorldDeltaAccepted;
  WORLD_DELTA_REJECTED: WorldDeltaRejected;
  WORLD_DELTA_REROLLED: WorldDeltaRerolled;
  FACT_REVEALED: FactRevealed;
  NOTE_ADDED: NoteAdded;
  ENCOUNTER_STARTED: EncounterStarted;
  ENCOUNTER_ENDED: EncounterEnded;
  INITIATIVE_SET: InitiativeSet;
  CONCENTRATION_STARTED: ConcentrationStarted;
  CONCENTRATION_ENDED: ConcentrationEnded;
  ACTOR_SPAWNED: ActorSpawned;
  ACTOR_REMOVED: ActorRemoved;
  WORLD_DELTA_PROPOSED: WorldDeltaProposed;
  REST_TAKEN: RestTaken;
  RESOURCE_SPENT: ResourceSpent;
  RESOURCE_RESTORED: ResourceRestored;
}

export type EventType = keyof PayloadByType;

export const EVENT_TYPES = Object.freeze([
  'DAMAGE_APPLIED', 'HEALING_APPLIED', 'TEMP_HP_GRANTED', 'CONDITION_ADDED', 'CONDITION_REMOVED',
  'DICE_ROLLED', 'TURN_ADVANCED', 'TIME_ADVANCED', 'WORLD_DELTA_ACCEPTED', 'WORLD_DELTA_REJECTED',
  'WORLD_DELTA_REROLLED', 'FACT_REVEALED', 'NOTE_ADDED',
  // решение владельца 19.09.2026
  'ENCOUNTER_STARTED', 'ENCOUNTER_ENDED', 'INITIATIVE_SET', 'CONCENTRATION_STARTED', 'CONCENTRATION_ENDED',
  'ACTOR_SPAWNED', 'ACTOR_REMOVED', 'WORLD_DELTA_PROPOSED',
  // решение владельца 21.09.2026
  'REST_TAKEN', 'RESOURCE_SPENT', 'RESOURCE_RESTORED',
] as const satisfies readonly EventType[]);

/** Обратимость и попадание в журнал — колонки таблицы HANDOFF §7. */
export const EVENT_META: Readonly<Record<EventType, { reversible: boolean; journal: boolean }>> = {
  DAMAGE_APPLIED: { reversible: true, journal: true },
  HEALING_APPLIED: { reversible: true, journal: true },
  TEMP_HP_GRANTED: { reversible: true, journal: true },
  CONDITION_ADDED: { reversible: true, journal: true },
  CONDITION_REMOVED: { reversible: true, journal: true },
  DICE_ROLLED: { reversible: false, journal: true },
  TURN_ADVANCED: { reversible: true, journal: true },
  TIME_ADVANCED: { reversible: true, journal: true },
  WORLD_DELTA_ACCEPTED: { reversible: true, journal: true },
  WORLD_DELTA_REJECTED: { reversible: true, journal: true },
  WORLD_DELTA_REROLLED: { reversible: true, journal: false },
  FACT_REVEALED: { reversible: true, journal: true },
  NOTE_ADDED: { reversible: true, journal: true },
  ENCOUNTER_STARTED: { reversible: true, journal: true },
  ENCOUNTER_ENDED: { reversible: true, journal: true },
  INITIATIVE_SET: { reversible: true, journal: true },
  CONCENTRATION_STARTED: { reversible: true, journal: true },
  CONCENTRATION_ENDED: { reversible: true, journal: true },
  ACTOR_SPAWNED: { reversible: true, journal: true },
  ACTOR_REMOVED: { reversible: true, journal: true },
  WORLD_DELTA_PROPOSED: { reversible: false, journal: false },
  REST_TAKEN: { reversible: true, journal: true },
  RESOURCE_SPENT: { reversible: true, journal: true },
  RESOURCE_RESTORED: { reversible: true, journal: true },
};

/** Команда — то, что просит интерфейс. Событие — то, что легло в лог. */
export type Command = { [T in EventType]: { type: T; payload: PayloadByType[T] } }[EventType];

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
  type: T;
  payload: PayloadByType[T];
  undoes?: string;
  redoes?: string;
  /** Что событие сделало на самом деле — заполняется при применении, см. reduce.ts. */
  effect?: Effect;
}

/** Точный след события в состоянии: достаточно, чтобы откатить без пересчёта. */
export type Effect =
  | { kind: 'hp'; targetId: string; before: HpSnapshot; after: HpSnapshot }
  | { kind: 'condition'; targetId: string; conditionId: ConditionId; before?: ConditionSnapshot; after?: ConditionSnapshot }
  | { kind: 'turn'; before: TurnSnapshot; after: TurnSnapshot }
  | { kind: 'time'; before: number; after: number }
  | { kind: 'delta'; deltaId: string; before: DeltaSnapshot; after: DeltaSnapshot }
  | { kind: 'fact'; factId: string; before: 'dm' | 'players'; after: 'dm' | 'players' }
  | { kind: 'note'; noteId: string }
  | { kind: 'encounter'; before: EncounterSnapshot; after: EncounterSnapshot }
  | { kind: 'concentration'; actorId: string; before?: ConcentrationSnapshot; after?: ConcentrationSnapshot }
  | { kind: 'actor'; actorId: string; before?: Actor; after?: Actor; party: { before: readonly string[]; after: readonly string[] }; encounter: { before: EncounterSnapshot; after: EncounterSnapshot } }
  | { kind: 'rest'; actors: readonly { actorId: string; before: RestSnapshot; after: RestSnapshot }[] }
  | { kind: 'resource'; actorId: string; resourceId: ResourceId; before: number; after: number }
  | { kind: 'none' };

export interface HpSnapshot { current: number; temp: number }
export interface ConditionSnapshot { level?: number; until?: string; untilSec?: number }
export interface TurnSnapshot { round: number; turnIndex: number; actorId: string | null }
/** Снимок предложения; `world` — значение поля мира, которое трогает патч (до и после), чтобы принятие откатывалось точно. */
export interface DeltaSnapshot { status: 'pending' | 'accepted' | 'rejected'; now: string; cause?: string; variantId?: string; world?: WorldPatch }
/** Бой целиком плюс броски инициативы актёров — всё, что меняют ENCOUNTER_* и INITIATIVE_SET. */
export interface EncounterSnapshot { active: boolean; round: number; turnIndex: number; order: readonly string[]; initiative: Readonly<Record<string, number | undefined>> }
export interface ConcentrationSnapshot { spell: string; untilSec?: number }
/** Всё, что трогает отдых у одного актёра: хиты с временными, уровень истощения, потраченные кости хитов. */
/** `resourcesSpent` — потраченное по ресурсам до отдыха; нет поля — нечего было возвращать. */
export interface RestSnapshot { hp: HpSnapshot; exhaustion?: number; hitDiceSpent: number; resourcesSpent?: Readonly<Record<string, number>> }
