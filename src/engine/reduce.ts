// Редьюсер: одно событие → новое состояние и точный след (effect). Чистая функция, без стора.
// Компенсирующее событие (undoes / redoes) не применяет payload заново, а восстанавливает `after`
// своего effect — он заранее собран из следа исходного события (см. log.ts).
import { validateSettlementDraft } from '../map/settlementDraft';
import { DEFAULT_SETTING_PACKAGE } from '../packages/settings';
import { PACKAGE_INDEX } from '../packages/index.generated';
import { parseAdventureBundle } from '../packages/adventure';
import { leveledSnapshot } from './characterLevel';
import { isProgressValue } from './progress';
import { castDraft, current, produce } from 'immer';
import { EXHAUSTION_MAX_LEVEL, isConditionId } from '../rules/srd/conditions';
import { RESOURCES, isResourceId } from '../rules/srd/resources';
import { TRAVEL_PACES } from '../rules/srd/travel';
import { isSkillId } from '../rules/srd/abilities';
import { MONSTERS } from '../rules/srd/monsters';
import { MAGIC_ITEMS } from '../rules/srd/magicItems';
import { lairActionsOf } from '../rules/book/lairActions';
import { COIN_BY_ID, isCoinId } from '../rules/srd/coins';
import { armorIdOfItem } from '../rules/srd/equipment';
import { isEntityRef, parseRef, type EntityRef } from '../entities/ref';
import { SUPPLY_REASONS, SUPPLY_SPENDS, TEMPO_SECONDS, type SheetPatch, type SheetSnapshot, type ConditionSnapshot, type DomainEvent, type Effect, type EncounterSnapshot, type HpSnapshot, type InitiativeEntry, type GridCell, type PayloadByType, type RestSnapshot, type ThreadTouchSnapshot } from './events';
import { attunementRequirement, legacyStacksForActor, withActorInventory } from './inventory';
import { GOODS, nextTurnTransition, type Actor, type InventoryOwner, type InventoryStack, type InventoryStorage, type KnownFact, type Location, type State, type TimelinePlanRecord, type WorldDelta, type WorldPatch, type WorldReadDependency } from './state';
import { isSettingPackageId } from '../packages/settings';
import { activeA5eStressEffect, isA5eStressEffect } from '../rules/a5e/strife';
import { a5eRestCompletes } from '../rules/a5e/rest';
import { A5E_DEVOTION_SIMILARITIES, a5eDevotionActivitySpec, a5eDevotionFavorAward, a5eInformationActivitySpec, a5eInformationCheckOutcome, a5eLanguageId, a5eTrainingPeriodMonths, a5eWorkActivitySpec, isA5eWorkDifficulty } from '../rules/a5e/downtime';
import { a5eTrainLanguageOrTool } from '../rules/a5e/downtimeTrain';
import { abilityMod } from '../campaign/derive';
import { isUserPortraitDataUrl } from '../art/userPortrait';
import { isBuiltInPortraitId } from '../art/portraitIds';
import { partyPlaceId } from './ladder';
import { priceRowOf } from '../campaign/pulse';
import { marketGoodsOf, marketItemQuoteOf, srdBaseItemPriceOf } from '../campaign/tradeQuote';
import { homebrewMechanicRuntimeBindingError, homebrewMechanicRuntimeUseError } from '../import/homebrewRuntime';
import { caravanRouteClearanceSnapshot } from '../campaign/routeClearance';
import { settingNavigationFor } from '../campaign/settingNavigation';

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineError';
  }
}

function actorOf(state: State, id: string) {
  const a = state.actors[id];
  if (!a) throw new EngineError(`нет актёра ${id}`);
  return a;
}

function positive(n: number, what: string) {
  if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) throw new EngineError(`${what}: нужно целое больше нуля, получено ${n}`);
}

const normalizeInfluenceRequest = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');

const hpSnap = (hp: HpSnapshot): HpSnapshot => ({ current: hp.current, temp: hp.temp });

/** Снимок боя вместе с бросками инициативы всех, кто в порядке, — след ENCOUNTER_* и INITIATIVE_SET. */
function encounterSnap(state: State, extraIds: readonly string[] = []): EncounterSnapshot {
  const initiative: Record<string, number | undefined> = {};
  for (const id of [...state.encounter.order, ...extraIds]) initiative[id] = state.actors[id]?.initiative;
  return {
    active: state.encounter.active, round: state.encounter.round, turnIndex: state.encounter.turnIndex,
    order: [...state.encounter.order], initiative,
    ...(state.encounter.lostFirstRoundActions ? { lostFirstRoundActions: [...state.encounter.lostFirstRoundActions] } : {}),
    ...(state.encounter.lairActionsUsed ? {
      lairActionsUsed: Object.fromEntries(Object.entries(state.encounter.lairActionsUsed).map(([id, use]) => [id, { ...use }])),
    } : {}),
    ...(state.encounter.lairPhaseVersion !== undefined ? { lairPhaseVersion: state.encounter.lairPhaseVersion } : {}),
    ...(state.encounter.lairContextVersion !== undefined ? { lairContextVersion: state.encounter.lairContextVersion } : {}),
    ...(state.encounter.lairContextConfirmed !== undefined ? { lairContextConfirmed: state.encounter.lairContextConfirmed } : {}),
    ...(state.encounter.lairActionWindow ? { lairActionWindow: { ...state.encounter.lairActionWindow } } : {}),
    ...(state.encounter.lairActionWindowPassedRound !== undefined ? { lairActionWindowPassedRound: state.encounter.lairActionWindowPassedRound } : {}),
  };
}

function putEncounter(draft: State, snap: EncounterSnapshot) {
  draft.encounter.active = snap.active;
  draft.encounter.round = snap.round;
  draft.encounter.turnIndex = snap.turnIndex;
  draft.encounter.order = [...snap.order];
  if (snap.lostFirstRoundActions) draft.encounter.lostFirstRoundActions = [...snap.lostFirstRoundActions];
  else delete draft.encounter.lostFirstRoundActions;
  if (snap.lairActionsUsed) draft.encounter.lairActionsUsed = structuredClone(snap.lairActionsUsed);
  else delete draft.encounter.lairActionsUsed;
  if (snap.lairPhaseVersion !== undefined) draft.encounter.lairPhaseVersion = snap.lairPhaseVersion;
  else delete draft.encounter.lairPhaseVersion;
  if (snap.lairContextVersion !== undefined) draft.encounter.lairContextVersion = snap.lairContextVersion;
  else delete draft.encounter.lairContextVersion;
  if (snap.lairContextConfirmed !== undefined) draft.encounter.lairContextConfirmed = snap.lairContextConfirmed;
  else delete draft.encounter.lairContextConfirmed;
  if (snap.lairActionWindow) draft.encounter.lairActionWindow = { ...snap.lairActionWindow };
  else delete draft.encounter.lairActionWindow;
  if (snap.lairActionWindowPassedRound !== undefined) draft.encounter.lairActionWindowPassedRound = snap.lairActionWindowPassedRound;
  else delete draft.encounter.lairActionWindowPassedRound;
  for (const [id, init] of Object.entries(snap.initiative)) {
    const a = draft.actors[id];
    if (!a) continue;
    if (init === undefined) delete a.initiative;
    else a.initiative = init;
  }
}

/** След отдыха у актёра: хиты, уровень истощения, потраченные кости хитов и ресурсы. */
function restSnap(a: Actor): RestSnapshot {
  const snap: RestSnapshot = { hp: hpSnap(a.hp), hitDiceSpent: a.hitDiceSpent ?? 0 };
  if (a.conditions.exhaustion?.level !== undefined) snap.exhaustion = a.conditions.exhaustion.level;
  if (a.a5eConditions?.fatigue !== undefined) snap.a5eFatigue = a.a5eConditions.fatigue;
  if (a.a5eConditions?.strife !== undefined) snap.a5eStrife = a.a5eConditions.strife;
  if (a.a5eLastLongRestAt !== undefined) snap.a5eLastLongRestAt = a.a5eLastLongRestAt;
  if (a.a5eDistraughtAidUsed !== undefined) snap.a5eDistraughtAidUsed = a.a5eDistraughtAidUsed;
  if (a.resourcesSpent && Object.keys(a.resourcesSpent).length > 0) snap.resourcesSpent = { ...a.resourcesSpent };
  return snap;
}

function putRest(a: Actor, snap: RestSnapshot) {
  a.hp.current = snap.hp.current;
  a.hp.temp = snap.hp.temp;
  if (snap.exhaustion === undefined) delete a.conditions.exhaustion;
  else a.conditions.exhaustion = { ...a.conditions.exhaustion, level: snap.exhaustion };
  const a5e = { ...(a.a5eConditions ?? {}) };
  if (snap.a5eFatigue === undefined || snap.a5eFatigue === 0) delete a5e.fatigue;
  else a5e.fatigue = snap.a5eFatigue;
  if (snap.a5eStrife === undefined || snap.a5eStrife === 0) delete a5e.strife;
  else a5e.strife = snap.a5eStrife;
  if (Object.keys(a5e).length > 0) a.a5eConditions = a5e;
  else delete a.a5eConditions;
  if (snap.a5eLastLongRestAt === undefined) delete a.a5eLastLongRestAt;
  else a.a5eLastLongRestAt = snap.a5eLastLongRestAt;
  if (snap.a5eDistraughtAidUsed === undefined) delete a.a5eDistraughtAidUsed;
  else a.a5eDistraughtAidUsed = snap.a5eDistraughtAidUsed;
  if (snap.hitDiceSpent === 0) delete a.hitDiceSpent;
  else a.hitDiceSpent = snap.hitDiceSpent;
  if (snap.resourcesSpent) a.resourcesSpent = { ...snap.resourcesSpent };
  else delete a.resourcesSpent;
}

/** Потраченное по ресурсу; без записи — ноль. */
const spentOf = (a: Actor, id: string): number => (a.resourcesSpent as Record<string, number> | undefined)?.[id] ?? 0;

/** Записать потраченное: ноль — убрать запись, пустая карта — убрать поле, чтобы состояние не копило нули. */
function putSpent(a: Actor, id: string, n: number) {
  const map = { ...(a.resourcesSpent ?? {}) } as Record<string, number>;
  if (n === 0) delete map[id];
  else map[id] = n;
  if (Object.keys(map).length === 0) delete a.resourcesSpent;
  else a.resourcesSpent = map;
}

/** Обычное число костей хитов за долгий отдых: половина уровня, минимум одна (SRD/A5E). */
export function hitDiceRegained(level: number): number {
  return Math.max(1, Math.floor(level / 2));
}

/** A5E Roughing It возвращает половину обычного числа костей хитов. */
export function hitDiceRegainedRoughingIt(level: number): number {
  return Math.floor(hitDiceRegained(level) / 2);
}

/** Порядок инициативы: только существующие, не выбывшие, без повторов, хоть один. */
function checkOrder(state: State, order: readonly InitiativeEntry[]) {
  if (order.length === 0) throw new EngineError('порядок инициативы пуст');
  const seen = new Set<string>();
  for (const { actorId, initiative } of order) {
    const a = actorOf(state, actorId);
    if (a.removed) throw new EngineError(`${a.name} выбыл и в бой не встаёт`);
    if (seen.has(actorId)) throw new EngineError(`${a.name} дважды в порядке инициативы`);
    if (!Number.isFinite(initiative)) throw new EngineError(`инициатива ${a.name}: не число`);
    seen.add(actorId);
  }
}

function checkDescendingInitiative(order: readonly InitiativeEntry[]) {
  for (let i = 1; i < order.length; i++) {
    if (order[i - 1].initiative < order[i].initiative) throw new EngineError('порядок инициативы должен идти по убыванию');
  }
}

function hasLairActionProfile(state: State, ids: readonly string[] = state.encounter.order): boolean {
  return ids.some(id => {
    const actor = state.actors[id];
    return Boolean(actor && !actor.removed && lairActionsOf(actor.monsterId));
  });
}

function hasLairActionActor(state: State, ids: readonly string[] = state.encounter.order): boolean {
  return ids.some(id => {
    const actor = state.actors[id];
    return Boolean(actor && !actor.removed && actor.hp.current > 0 && lairActionsOf(actor.monsterId));
  });
}

/**
 * Куда встаёт ход после перестановки: тот же актёр, если он в новом порядке; иначе — первый после него
 * по старому кругу, кто в новом порядке есть; никого — начало.
 */
function nextTurnIndex(oldOrder: readonly string[], turnIndex: number, newOrder: readonly string[]): number {
  if (newOrder.length === 0) return 0;
  for (let step = 0; step < oldOrder.length; step++) {
    const id = oldOrder[(turnIndex + step) % oldOrder.length];
    const i = newOrder.indexOf(id);
    if (i >= 0) return i;
  }
  return 0;
}

/** Проверка снимка актёра при появлении: форма, а не смысл — редьюсер не знает правил класса. */
function checkActor(actor: Actor) {
  if (!actor.id || !actor.name) throw new EngineError('актёру нужны id и имя');
  if (!Number.isFinite(actor.hp?.max) || actor.hp.max < 0 || actor.hp.current < 0 || actor.hp.current > actor.hp.max || actor.hp.temp < 0) throw new EngineError(`хиты ${actor.name}: current ≤ max, temp ≥ 0`);
  const portrait = actor.sheet?.portrait;
  if (portrait !== undefined && !isBuiltInPortraitId(portrait) && !isUserPortraitDataUrl(portrait)) throw new EngineError(`портрет ${actor.name}: неизвестная ссылка или неверный WebP-файл`);
}

function checkInventoryOwner(state: State, owner: InventoryOwner) {
  if (owner?.kind === 'party') return;
  if (owner?.kind === 'actor' && owner.id && state.actors[owner.id]) return;
  throw new EngineError('владелец вещи должен быть партией или существующим актёром');
}

function checkInventoryStorage(state: State, storage: InventoryStorage) {
  if (storage?.kind === 'party') return;
  if (storage?.kind === 'actor' && storage.id && state.actors[storage.id]) return;
  if (storage?.kind === 'container' && storage.id && state.inventoryContainers?.[storage.id]) return;
  throw new EngineError('хранилище вещи должно быть партией, существующим актёром или созданным контейнером');
}

const sameInventoryOwner = (a: InventoryOwner, b: InventoryOwner) => a.kind === b.kind && (a.kind === 'party' || (b.kind === 'actor' && a.id === b.id));
const storageForOwner = (owner: InventoryOwner): InventoryStorage => owner.kind === 'party' ? { kind: 'party' } : { kind: 'actor', id: owner.id };
function checkActiveTradeOwner(state: State, owner: InventoryOwner) {
  checkInventoryOwner(state, owner);
  if (owner.kind === 'actor' && state.actors[owner.id]?.removed) throw new EngineError(`выбывший актёр ${owner.id} не участвует в сделке`);
}

function movableStack(state: State, stackId: string, qty: number, splitStackId?: string): InventoryStack {
  const stack = state.inventory?.[stackId];
  if (!stack) throw new EngineError(`нет стека вещи ${stackId}`);
  positive(qty, 'количество вещи');
  if (qty > stack.qty) throw new EngineError(`в стеке ${stackId} только ${stack.qty} шт.`);
  if (qty < stack.qty) {
    if (!splitStackId?.trim()) throw new EngineError('для частичного переноса нужен id нового стека');
    if (state.inventory?.[splitStackId]) throw new EngineError(`стек ${splitStackId} уже есть`);
  } else if (splitStackId !== undefined) throw new EngineError('id нового стека нужен только для частичного переноса');
  if (stack.attunedTo) throw new EngineError('сначала снимите настройку с предмета');
  return stack;
}

/** Проверяет команду до записи в лог: то, что не пройдёт, в лог не попадает. */
export function validate(state: State, event: Pick<DomainEvent, 'type' | 'payload'>): void {
  switch (event.type) {
    case 'DAMAGE_APPLIED':
    case 'HEALING_APPLIED':
    case 'TEMP_HP_GRANTED': {
      const p = event.payload as PayloadByType['DAMAGE_APPLIED'];
      actorOf(state, p.targetId);
      positive(p.amount, event.type);
      if (p.mechanicId !== undefined) {
        const effect = event.type === 'DAMAGE_APPLIED' ? 'damage' : event.type === 'HEALING_APPLIED' ? 'healing' : 'temporary-hp';
        const error = homebrewMechanicRuntimeUseError(state, p.mechanicId, effect, p.amount);
        if (error) throw new EngineError(error);
      }
      return;
    }
    case 'CONDITION_ADDED': {
      const p = event.payload as PayloadByType['CONDITION_ADDED'];
      actorOf(state, p.targetId);
      if (!isConditionId(p.conditionId)) throw new EngineError(`нет такого состояния в SRD: ${p.conditionId}`);
      if (p.untilSec !== undefined && p.untilSec <= state.time.sec) throw new EngineError('состояние: срок уже прошёл');
      if (p.level !== undefined) {
        if (p.conditionId !== 'exhaustion') throw new EngineError(`уровень есть только у истощения`);
        if (p.level < 1 || p.level > EXHAUSTION_MAX_LEVEL || Math.floor(p.level) !== p.level) throw new EngineError(`уровень истощения 1–${EXHAUSTION_MAX_LEVEL}, получен ${p.level}`);
      }
      return;
    }
    case 'CONDITION_REMOVED': {
      const p = event.payload as PayloadByType['CONDITION_REMOVED'];
      const a = actorOf(state, p.targetId);
      if (!isConditionId(p.conditionId)) throw new EngineError(`нет такого состояния в SRD: ${p.conditionId}`);
      if (!a.conditions[p.conditionId]) throw new EngineError(`у ${a.name} нет состояния ${p.conditionId}`);
      return;
    }
    case 'A5E_TRACK_SET': {
      const p = event.payload as PayloadByType['A5E_TRACK_SET'];
      const a = actorOf(state, p.actorId);
      if (p.track !== 'fatigue' && p.track !== 'strife') throw new EngineError(`неизвестная A5E-шкала: ${String(p.track)}`);
      if (!Number.isInteger(p.level) || p.level < 0) throw new EngineError(`${p.track}: уровень должен быть целым от 0`);
      if (p.track === 'strife' && p.level > 7) throw new EngineError('Strife: уровни 0–7');
      if (p.stressEffect) {
        const beforeStrife = a.a5eConditions?.strife ?? 0;
        const validThreshold = p.stressEffect.kind === 'short'
          ? beforeStrife < 5 && p.level >= 5 && p.level < 7
          : beforeStrife < 7 && p.level >= 7;
        const keepsLongEffect = p.stressEffect.kind === 'short'
          && activeA5eStressEffect(a.a5eConditions?.mentalStress, state.time.sec)?.kind === 'long';
        if (p.track !== 'strife' || !isA5eStressEffect(p.stressEffect) || !state.a5eStrifeEnabled || !validThreshold || keepsLongEffect) {
          throw new EngineError('некорректный эффект ментального стресса A5E для выбранной темы или уровня');
        }
      }
      if (p.downtimeRelaxUntilSec !== undefined) {
        const beforeStrife = a.a5eConditions?.strife ?? 0;
        const placeId = partyPlaceId(state);
        const place = placeId ? state.world.locations[placeId] : undefined;
        if (p.track !== 'strife' || !Number.isSafeInteger(p.downtimeRelaxUntilSec) || p.downtimeRelaxUntilSec <= state.time.sec
          || !state.a5eStrifeEnabled || beforeStrife < 1 || p.level !== beforeStrife - 1 || !place?.haven
          || (a.a5eDowntimeRelaxUntilSec ?? 0) > state.time.sec) {
          throw new EngineError('развеяться можно раз за промежуток, при включённой теме Strife и в укрытии');
        }
      }
      if (a.removed) throw new EngineError(`${a.name} выбыл`);
      return;
    }
    case 'A5E_STRESS_EFFECT_USED': {
      const p = event.payload as PayloadByType['A5E_STRESS_EFFECT_USED'];
      const a = actorOf(state, p.actorId);
      if (p.effect !== 'distraught-aid' || !state.a5eStrifeEnabled
        || activeA5eStressEffect(a.a5eConditions?.mentalStress, state.time.sec)?.kind !== 'short'
        || activeA5eStressEffect(a.a5eConditions?.mentalStress, state.time.sec)?.id !== 'distraught'
        || a.a5eDistraughtAidUsed === true || a.removed) {
        throw new EngineError('преимущество Distraught сейчас недоступно или уже использовано');
      }
      return;
    }
    case 'A5E_PRESTIGE_UPDATED': {
      const p = event.payload as PayloadByType['A5E_PRESTIGE_UPDATED'];
      const actor = actorOf(state, p.actorId);
      const profile = p.profile;
      const awardSources = ['stronghold', 'great-deed', 'class-feature', 'table-rule'];
      if (actor.kind !== 'pc' || actor.removed || !state.party.includes(actor.id)
        || p.source !== 'a5e-srd:adventuring-8'
        || !profile || !Array.isArray(profile.awards)
        || (profile.centerLocationId !== undefined && (typeof profile.centerLocationId !== 'string' || !state.world.locations[profile.centerLocationId]))
        || profile.awards.some(award => !award || typeof award.id !== 'string' || !award.id.trim()
          || !Number.isSafeInteger(award.points) || award.points < 1
          || typeof award.reason !== 'string' || !award.reason.trim() || award.reason.length > 500
          || !awardSources.includes(award.source))
        || new Set(profile.awards.map(award => award.id)).size !== profile.awards.length) {
        throw new EngineError('некорректный личный профиль A5E Prestige');
      }
      return;
    }
    case 'CAMPAIGN_REST_LAYER_SET': {
      const p = event.payload as PayloadByType['CAMPAIGN_REST_LAYER_SET'];
      if (p.layer !== 'srd' && p.layer !== 'a5e') throw new EngineError(`слой отдыха должен быть SRD или A5E, получен ${String(p.layer)}`);
      return;
    }
    case 'CAMPAIGN_STRESS_THEME_SET': {
      const p = event.payload as PayloadByType['CAMPAIGN_STRESS_THEME_SET'];
      if (typeof p.enabled !== 'boolean') throw new EngineError('тема стресса кампании должна быть включена или выключена');
      return;
    }
    case 'CAMPAIGN_SETTING_PACKAGE_SET': {
      const p = event.payload as PayloadByType['CAMPAIGN_SETTING_PACKAGE_SET'];
      if (typeof p.packageId !== 'string' || !isSettingPackageId(p.packageId)) throw new EngineError(`пакет сеттинга не найден: ${String(p.packageId)}`);
      try { settingNavigationFor(p.packageId, state.world.locations); }
      catch (error) { throw new EngineError(`не удалось подготовить навигацию пакета ${p.packageId}: ${error instanceof Error ? error.message : String(error)}`); }
      return;
    }
    case 'CAMPAIGN_CREATED': {
      const p = event.payload as PayloadByType['CAMPAIGN_CREATED'];
      const profile = p?.profile;
      let campaignBundle: ReturnType<typeof parseAdventureBundle> | undefined;
      try { campaignBundle = profile?.campaignBundle ? parseAdventureBundle(profile.campaignBundle) : undefined; }
      catch (error) { throw new EngineError(`снимок выбранной кампании некорректен: ${error instanceof Error ? error.message : String(error)}`); }
      const campaignSnapshotMatches = profile?.campaignPackageId === undefined
        ? campaignBundle === undefined
        : campaignBundle?.id === profile.campaignPackageId && campaignBundle.setting === profile.settingPackageId;
      if (profile?.schema !== 'campaign-profile/1' || profile.baseline !== 'empty-campaign'
        || typeof profile.settingPackageId !== 'string' || !isSettingPackageId(profile.settingPackageId)
        || !campaignSnapshotMatches
        || state.settingPackageId !== profile.settingPackageId
        || (profile.entryLocationId !== undefined && (typeof profile.entryLocationId !== 'string' || !state.world.locations[profile.entryLocationId]))
        || (profile.startTimeSec !== undefined && !Number.isSafeInteger(profile.startTimeSec))
        || (profile.rulesPackageId !== undefined && profile.rulesPackageId !== null && (typeof profile.rulesPackageId !== 'string' || !profile.rulesPackageId.trim()))) {
        throw new EngineError('некорректный начальный профиль кампании');
      }
      return;
    }
    case 'TURN_ADVANCED': {
      const p = event.payload as PayloadByType['TURN_ADVANCED'];
      actorOf(state, p.actorId);
      if (p.round < 1 || p.turnIndex < 0) throw new EngineError('раунд от 1, ход от 0');
      // Порядок инициативы ставят ENCOUNTER_STARTED / INITIATIVE_SET; ход по нему только идёт.
      if (!state.encounter.active) throw new EngineError('бой не начат');
      const order = state.encounter.order;
      if (order[p.turnIndex] !== p.actorId) throw new EngineError(`ход ${p.turnIndex} в порядке инициативы — не ${p.actorId}`);
      if (state.encounter.lairPhaseVersion === 1) {
        const expected = nextTurnTransition(state, hasLairActionActor(state));
        const sameWindow = p.lairActionWindow?.round === expected.lairActionWindow?.round
          && p.lairActionWindow?.position === expected.lairActionWindow?.position;
        if (p.lairPhaseVersion !== 1 || p.round !== expected.round || p.turnIndex !== expected.turnIndex
          || p.actorId !== expected.actorId || !sameWindow
          || p.lairActionWindowPassedRound !== expected.lairActionWindowPassedRound) {
          throw new EngineError('переход хода не совпадает с очередью инициативы и фазой логова');
        }
        return;
      }
      if (p.lairPhaseVersion !== undefined) throw new EngineError('версия фазы логова не совпадает с боем');
      if (p.lairActionWindow) {
        if (!hasLairActionActor(state)) throw new EngineError('в этом бою нет участника с действиями логова');
        if (state.encounter.lairActionWindow && (p.lairActionWindow.round <= state.encounter.lairActionWindow.round
          || p.lairActionWindowPassedRound !== state.encounter.lairActionWindow.round)) {
          throw new EngineError('окно действия логова уже открыто');
        }
        if (state.encounter.lairActionWindowPassedRound === state.encounter.round) throw new EngineError('окно действия логова уже пройдено в этом раунде');
        if (p.lairActionWindow.round !== p.round) throw new EngineError('окно логова относится к другому раунду');
        if (p.lairActionWindow.position === 'after-current') {
          const currentId = order[state.encounter.turnIndex];
          if (p.round !== state.encounter.round || p.turnIndex !== state.encounter.turnIndex || p.actorId !== currentId || (state.actors[currentId]?.initiative ?? 0) < 20) {
            throw new EngineError('окно логова после хода открывается только после участника с инициативой 20 или выше');
          }
          const nextIndex = state.encounter.turnIndex + 1;
          const hasLowerActor = nextIndex < order.length && (state.actors[order[nextIndex]]?.initiative ?? 0) < 20;
          const finalAllHighActor = state.encounter.turnIndex === order.length - 1 && order.every(id => (state.actors[id]?.initiative ?? 0) >= 20);
          if (!hasLowerActor && !finalAllHighActor) throw new EngineError('окно логова открывается на границе инициативы 20');
        } else if (p.lairActionWindow.position === 'before-current') {
          const currentId = order[state.encounter.turnIndex];
          if (p.round !== state.encounter.round || p.turnIndex !== state.encounter.turnIndex || p.actorId !== currentId || (state.actors[currentId]?.initiative ?? 0) >= 20) {
            throw new EngineError('окно логова перед ходом требует текущего участника с инициативой ниже 20');
          }
        } else if (p.round !== state.encounter.round + 1 || p.turnIndex !== 0 || order.some(id => (state.actors[id]?.initiative ?? 0) >= 20)) {
          throw new EngineError('окно начала раунда открывается только перед первым участником с инициативой ниже 20');
        }
      }
      if (p.lairActionWindowPassedRound !== undefined && p.lairActionWindowPassedRound < 1) throw new EngineError('раунд закрытого окна логова должен быть положительным');
      if (state.encounter.lairActionWindow && p.lairActionWindowPassedRound !== state.encounter.lairActionWindow.round) {
        throw new EngineError('закрытие окна логова должно зафиксировать пройденный раунд');
      }
      if (!state.encounter.lairActionWindow && p.lairActionWindowPassedRound !== undefined
        && p.lairActionWindowPassedRound !== state.encounter.lairActionWindowPassedRound) {
        throw new EngineError('раунд пройденного окна логова меняется только при закрытии окна');
      }
      return;
    }
    case 'LAIR_ACTION_USED': {
      const p = event.payload as PayloadByType['LAIR_ACTION_USED'];
      const actor = actorOf(state, p.actorId);
      const profile = lairActionsOf(actor.monsterId);
      const option = profile?.options.find(candidate => candidate.id === p.optionId);
      if (!state.encounter.active || !state.encounter.order.includes(actor.id) || actor.removed || actor.hp.current <= 0) {
        throw new EngineError(`${actor.name}: действие логова доступно только дееспособному участнику текущего боя`);
      }
      if (!profile || !option || p.optionName !== option.name || p.source !== profile.source) {
        throw new EngineError(`${actor.name}: действие логова не совпадает с поддержанным книжным источником`);
      }
      if (state.encounter.lairContextVersion === 1 && state.encounter.lairContextConfirmed !== true) {
        throw new EngineError(`${actor.name}: действие логова недоступно без подтверждения, что бой проходит в логове`);
      }
      if (state.encounter.lairPhaseVersion === 1) {
        if (p.round !== state.encounter.lairActionWindow?.round || p.round !== state.encounter.round) {
          throw new EngineError(`${actor.name}: сейчас не открыт слот инициативы 20 для действия логова`);
        }
      } else if (p.round !== state.encounter.round) {
        // Historical encounters did not record the initiative-20 phase; keep their old event semantics.
        throw new EngineError(`${actor.name}: действие логова относится к другому раунду`);
      }
      const previous = state.encounter.lairActionsUsed?.[actor.id];
      if (previous?.round === p.round) throw new EngineError(`${actor.name}: действие логова уже выбрано в этом раунде`);
      if (previous?.round === p.round - 1 && previous.optionId === p.optionId) {
        throw new EngineError(`${actor.name}: нельзя повторять тот же вариант логова два раунда подряд`);
      }
      return;
    }
    case 'ENCOUNTER_STARTED': {
      const p = event.payload as PayloadByType['ENCOUNTER_STARTED'];
      if (state.encounter.active) throw new EngineError('бой уже идёт');
      if (p.lairPhaseVersion !== undefined && p.lairPhaseVersion !== 1) throw new EngineError('неизвестная версия фазы логова');
      if (p.lairContextVersion !== undefined && p.lairContextVersion !== 1) throw new EngineError('неизвестная версия контекста логова');
      if (p.lairContextVersion === 1 && typeof p.lairContextConfirmed !== 'boolean') throw new EngineError('версия контекста логова требует подтверждения мастера');
      if (p.lairContextVersion === undefined && p.lairContextConfirmed !== undefined) throw new EngineError('подтверждение логова требует версионного маркера');
      checkOrder(state, p.order);
      if (p.lairPhaseVersion === 1 && hasLairActionProfile(state, p.order.map(entry => entry.actorId))) checkDescendingInitiative(p.order);
      for (const id of p.surprised ?? []) if (!p.order.some(o => o.actorId === id)) throw new EngineError(`внезапный ${id} не в порядке инициативы`);
      const lost = p.lostFirstRoundActions ?? [];
      if (new Set(lost).size !== lost.length) throw new EngineError('актёр дважды отмечен как потерявший действия первого раунда');
      for (const id of lost) {
        const actor = actorOf(state, id);
        if (!p.order.some(entry => entry.actorId === id)) throw new EngineError(`${id} потерял действия, но не включён в инициативу`);
        if (!state.a5eStrifeEnabled || activeA5eStressEffect(actor.a5eConditions?.mentalStress, state.time.sec)?.id !== 'obsessed') {
          throw new EngineError(`${actor.name}: потеря действий первого раунда требует активного эффекта A5E Obsessed`);
        }
      }
      return;
    }
    case 'ENCOUNTER_ENDED':
      if (!state.encounter.active) throw new EngineError('бой не идёт');
      return;
    case 'INITIATIVE_SET': {
      const p = event.payload as PayloadByType['INITIATIVE_SET'];
      checkOrder(state, p.order);
      if (state.encounter.active && state.encounter.lairPhaseVersion === 1
        && (hasLairActionProfile(state) || hasLairActionProfile(state, p.order.map(entry => entry.actorId)))) {
        checkDescendingInitiative(p.order);
        const unchanged = p.order.length === state.encounter.order.length && p.order.every((entry, index) =>
          entry.actorId === state.encounter.order[index] && entry.initiative === state.actors[entry.actorId]?.initiative);
        if (!unchanged) throw new EngineError('в бою с фазой логова порядок и инициативу меняют после его завершения');
      }
      return;
    }
    case 'CONCENTRATION_STARTED': {
      const p = event.payload as PayloadByType['CONCENTRATION_STARTED'];
      const a = actorOf(state, p.actorId);
      if (a.removed) throw new EngineError(`${a.name} выбыл`);
      if (!p.spell.trim()) throw new EngineError('концентрация: нужно название заклинания');
      if (p.untilSec !== undefined && p.untilSec <= state.time.sec) throw new EngineError('концентрация: срок уже прошёл');
      return;
    }
    case 'CONCENTRATION_ENDED': {
      const p = event.payload as PayloadByType['CONCENTRATION_ENDED'];
      const a = actorOf(state, p.actorId);
      if (!a.concentration) throw new EngineError(`${a.name} не концентрируется`);
      return;
    }
    case 'ACTOR_SPAWNED': {
      const p = event.payload as PayloadByType['ACTOR_SPAWNED'];
      checkActor(p.actor);
      if (state.actors[p.actor.id]) throw new EngineError(`актёр ${p.actor.id} уже есть`);
      return;
    }
    case 'ITEM_GAINED': {
      const { stack } = event.payload as PayloadByType['ITEM_GAINED'];
      if (!stack?.id?.trim() || !stack.itemId?.trim()) throw new EngineError('вещи нужны id стека и ссылка на предмет');
      positive(stack.qty, 'количество вещи');
      if (state.inventory?.[stack.id]) throw new EngineError(`стек ${stack.id} уже есть`);
      if (stack.attunedTo !== undefined) throw new EngineError('новую вещь сначала добавьте без настройки');
      if (stack.wornAs !== undefined) throw new EngineError('новую вещь сначала добавьте без надетого состояния');
      checkInventoryOwner(state, stack.owner);
      checkInventoryStorage(state, stack.storage);
      return;
    }
    case 'INVENTORY_CONTAINER_CREATED': {
      const container = (event.payload as PayloadByType['INVENTORY_CONTAINER_CREATED']).container;
      if (!container?.id?.trim() || !container.name?.trim()) throw new EngineError('контейнеру нужны id и название');
      if (container.kind !== 'camp' && container.kind !== 'transport') throw new EngineError('тип контейнера должен быть camp или transport');
      if (container.locationId && container.kind !== 'camp') throw new EngineError('место можно привязать только к лагерю');
      if (container.locationId && !state.world.locations[container.locationId]) throw new EngineError(`нет места ${container.locationId} для лагеря`);
      if (container.transportId && container.kind !== 'transport') throw new EngineError('транспорт можно привязать только к грузовому контейнеру');
      if (container.transportId && !state.transports?.[container.transportId]) throw new EngineError(`нет транспорта ${container.transportId} для контейнера`);
      if (state.inventoryContainers?.[container.id]) throw new EngineError(`контейнер ${container.id} уже есть`);
      return;
    }
    case 'INVENTORY_CONTAINER_REMOVED': {
      const containerId = (event.payload as PayloadByType['INVENTORY_CONTAINER_REMOVED']).containerId;
      if (!state.inventoryContainers?.[containerId]) throw new EngineError(`нет контейнера ${containerId}`);
      if (Object.values(state.inventory ?? {}).some(stack => stack.storage.kind === 'container' && stack.storage.id === containerId)) throw new EngineError('сначала переместите все вещи из контейнера');
      return;
    }
    case 'TRANSPORT_CREATED': {
      const transport = (event.payload as PayloadByType['TRANSPORT_CREATED']).transport;
      if (!transport?.id?.trim() || !transport.name?.trim()) throw new EngineError('транспорту нужны id и название');
      if (state.transports?.[transport.id]) throw new EngineError(`транспорт ${transport.id} уже есть`);
      return;
    }
    case 'TRANSPORT_REMOVED': {
      const transportId = (event.payload as PayloadByType['TRANSPORT_REMOVED']).transportId;
      if (!state.transports?.[transportId]) throw new EngineError(`нет транспорта ${transportId}`);
      if (Object.values(state.inventoryContainers ?? {}).some(container => container.transportId === transportId)) throw new EngineError('сначала отвяжите грузовые контейнеры от транспорта');
      return;
    }
    case 'COINS_EXCHANGED': {
      const p = event.payload as PayloadByType['COINS_EXCHANGED'];
      const stack = state.inventory?.[p.stackId];
      if (!stack || !isCoinId(stack.itemId)) throw new EngineError(`нет монетного стека ${p.stackId}`);
      if (!Number.isSafeInteger(p.qty) || !Number.isSafeInteger(p.toQty)) throw new EngineError('количество монет должно быть безопасным целым числом');
      positive(p.qty, 'количество обмениваемых монет');
      positive(p.toQty, 'количество получаемых монет');
      if (p.qty > stack.qty) throw new EngineError(`в стеке ${p.stackId} только ${stack.qty} шт.`);
      if (!isCoinId(p.toCoinId) || p.toCoinId === stack.itemId) throw new EngineError('выберите другой номинал монет SRD');
      if (BigInt(p.qty) * BigInt(COIN_BY_ID[stack.itemId].copperValue) !== BigInt(p.toQty) * BigInt(COIN_BY_ID[p.toCoinId].copperValue)) throw new EngineError('номиналы обмена неравноценны по SRD');
      if (!p.receiveStackId?.trim() || state.inventory?.[p.receiveStackId]) throw new EngineError('нужен новый id для получаемого стека монет');
      if (stack.attunedTo || stack.wornAs) throw new EngineError('этот стек нельзя обменять как монеты');
      return;
    }
    case 'ITEM_LOST': {
      const p = event.payload as PayloadByType['ITEM_LOST'];
      const stack = state.inventory?.[p.stackId];
      if (!stack) throw new EngineError(`нет стека вещи ${p.stackId}`);
      positive(p.qty, 'количество вещи');
      if (p.qty > stack.qty) throw new EngineError(`в стеке ${p.stackId} только ${stack.qty} шт.`);
      return;
    }
    case 'ITEM_MOVED': {
      const p = event.payload as PayloadByType['ITEM_MOVED'];
      const stack = movableStack(state, p.stackId, p.qty, p.splitStackId);
      checkInventoryStorage(state, p.to);
      if (JSON.stringify(stack.storage) === JSON.stringify(p.to)) throw new EngineError('вещь уже в этом хранилище');
      return;
    }
    case 'ITEM_TRANSFERRED': {
      const p = event.payload as PayloadByType['ITEM_TRANSFERRED'];
      const stack = movableStack(state, p.stackId, p.qty, p.splitStackId);
      checkInventoryOwner(state, p.owner);
      checkInventoryStorage(state, p.to);
      if (JSON.stringify(stack.owner) === JSON.stringify(p.owner) && JSON.stringify(stack.storage) === JSON.stringify(p.to)) throw new EngineError('владелец и хранилище вещи не изменились');
      return;
    }
    case 'ITEM_GIFTED': {
      const p = event.payload as PayloadByType['ITEM_GIFTED'];
      const stack = movableStack(state, p.stackId, p.qty, p.splitStackId);
      const giver = actorOf(state, p.giverId);
      const recipient = actorOf(state, p.recipientId);
      if (giver.kind !== 'pc' || giver.removed || !state.party.includes(giver.id)) throw new EngineError('подарок NPC может передать только действующий персонаж партии');
      if (stack.owner.kind !== 'actor' || stack.owner.id !== giver.id) throw new EngineError('персонаж не владеет предметом подарка');
      if (recipient.kind !== 'npc' || recipient.removed || recipient.id === giver.id) throw new EngineError('получателем подарка должен быть активный NPC');
      if (p.note !== undefined && (!p.note.trim() || p.note.trim().length > 160)) throw new EngineError('примечание к подарку должно содержать от 1 до 160 знаков');
      const giftAtSec = recipient.social?.giftAtSec;
      if (giftAtSec !== undefined && (!Number.isSafeInteger(giftAtSec) || state.time.sec < giftAtSec + TEMPO_SECONDS.tenday)) {
        throw new EngineError('этому NPC можно передать следующий подарок после десятидневки');
      }
      return;
    }
    case 'PERSON_ITEM_GIFTED': {
      const p = event.payload as PayloadByType['PERSON_ITEM_GIFTED'];
      const stack = movableStack(state, p.stackId, p.qty, p.splitStackId);
      const giver = actorOf(state, p.giverId);
      if (giver.kind !== 'pc' || giver.removed || !giver.sheet || !state.party.includes(giver.id)) throw new EngineError('подарок справочному NPC может передать только действующий персонаж партии');
      if (stack.owner.kind !== 'actor' || stack.owner.id !== giver.id) throw new EngineError('персонаж не владеет предметом подарка');
      if (stack.wornAs || stack.attunedTo) throw new EngineError('сначала снимите или отключите настройку предмета перед подарком');
      if (!p.personId.trim() || p.personId.length > 128 || !p.personName.trim() || p.personName.length > 160) throw new EngineError('подарок справочному NPC: некорректная ссылка или имя');
      if (p.note !== undefined && (!p.note.trim() || p.note.trim().length > 160)) throw new EngineError('примечание к подарку должно содержать от 1 до 160 знаков');
      const giftAtSec = state.personGifts?.[p.personId]?.giftAtSec;
      if (giftAtSec !== undefined && (!Number.isSafeInteger(giftAtSec) || state.time.sec < giftAtSec + TEMPO_SECONDS.tenday)) throw new EngineError('этому справочному NPC можно передать следующий подарок после десятидневки');
      return;
    }
    case 'TRADE_OFFER_CREATED': {
      const p = event.payload as PayloadByType['TRADE_OFFER_CREATED'];
      if (!p.offerId?.trim() || p.offerId.length > 128) throw new EngineError('предложению сделки нужен id длиной до 128 знаков');
      if (state.tradeOffers?.[p.offerId]) throw new EngineError(`предложение сделки ${p.offerId} уже есть`);
      if (p.trade.offerId !== undefined) throw new EngineError('новое предложение не может ссылаться на другое предложение');
      validate(state, { type: 'TRADE_COMPLETED', payload: p.trade });
      return;
    }
    case 'TRADE_OFFER_WITHDRAWN': {
      const p = event.payload as PayloadByType['TRADE_OFFER_WITHDRAWN'];
      const offer = state.tradeOffers?.[p.offerId];
      if (!offer || offer.status !== 'open') throw new EngineError(`нет открытого предложения сделки ${p.offerId}`);
      return;
    }
    case 'TRADE_COMPLETED': {
      const p = event.payload as PayloadByType['TRADE_COMPLETED'];
      if (p.offerId !== undefined) {
        const offer = state.tradeOffers?.[p.offerId];
        if (!offer || offer.status !== 'open') throw new EngineError(`нет открытого предложения сделки ${p.offerId}`);
        const { offerId: _offerId, ...accepted } = p;
        if (JSON.stringify(offer.trade) !== JSON.stringify(accepted)) throw new EngineError('условия подтверждаемой сделки отличаются от сохранённого предложения');
      }
      checkActiveTradeOwner(state, p.seller);
      checkActiveTradeOwner(state, p.buyer);
      if (sameInventoryOwner(p.seller, p.buyer)) throw new EngineError('стороны сделки должны быть разными');
      const item = state.inventory?.[p.itemStackId];
      if (!item) throw new EngineError(`нет стека вещи ${p.itemStackId}`);
      const movable = movableStack(state, p.itemStackId, p.itemQty, p.itemSplitStackId);
      if (!sameInventoryOwner(movable.owner, p.seller)) throw new EngineError('продавец не владеет передаваемой вещью');
      if (movable.wornAs) throw new EngineError('сначала снимите вещь перед продажей');
      if (movable.attunedTo) throw new EngineError('сначала снимите настройку перед продажей');
      checkInventoryStorage(state, movable.storage);
      if (!Number.isSafeInteger(p.itemQty)) throw new EngineError('количество предмета должно быть безопасным целым числом');
      if (!Number.isSafeInteger(p.priceCopper) || p.priceCopper <= 0) throw new EngineError('цена сделки должна быть положительной суммой в медных монетах');
      if (p.playerVisible !== undefined && typeof p.playerVisible !== 'boolean') throw new EngineError('признак раскрытия сделки игрокам должен быть логическим');
      if (!p.priceSource?.citation?.trim()) throw new EngineError('укажите ссылку или основание цены сделки');
      if (p.priceSource.kind === 'rule' && !p.priceSource.edition?.trim()) throw new EngineError('для цены по правилу укажите редакцию');
      if (p.priceSource.kind === 'market') {
        const sellerActor = p.seller.kind === 'actor' ? state.actors[p.seller.id] : undefined;
        const partyBuyer = p.buyer.kind === 'party' || p.buyer.kind === 'actor' && state.party.includes(p.buyer.id);
        const locationId = partyPlaceId(state);
        const location = locationId ? state.world.locations[locationId] : undefined;
        const base = srdBaseItemPriceOf(item.itemId);
        const goods = marketGoodsOf(item.itemId);
        const patches = Object.values(state.deltas).flatMap(delta => delta.status === 'pending' && delta.patch ? [delta.patch] : []) as WorldPatch[];
        const currentIndex = location?.scale === 'settlement' && goods ? priceRowOf(location, patches).goods[goods].index : undefined;
        const quote = base && goods && location?.scale === 'settlement' && currentIndex !== undefined
          ? marketItemQuoteOf({ itemId: item.itemId, qty: p.itemQty, locationId: location.id, locationName: location.name, goods, index: currentIndex })
          : undefined;
        if (sellerActor?.kind !== 'npc' || !partyBuyer || !location || location.id !== p.priceSource.locationId || location.name !== p.priceSource.locationName || !base || !goods || goods !== p.priceSource.goods || p.priceSource.itemQty !== p.itemQty || p.priceSource.edition !== 'SRD 5.1' || p.priceSource.baseCopper !== base.copper || currentIndex !== p.priceSource.index || quote?.priceCopper !== p.priceCopper) {
          throw new EngineError('цена места устарела или не соответствует базе SRD — обновите предложение');
        }
      } else if (p.priceSource.kind !== 'rule' && p.priceSource.kind !== 'house-rule') {
        throw new EngineError('укажите источник цены сделки');
      }
      if (p.playerVisible) {
        const sellerActor = p.seller.kind === 'actor' ? state.actors[p.seller.id] : undefined;
        const partyBuyer = p.buyer.kind === 'party' || p.buyer.kind === 'actor' && state.party.includes(p.buyer.id);
        if (sellerActor?.kind !== 'npc' || !partyBuyer || item.visibility !== 'players') {
          throw new EngineError('игрокам можно показать только покупку партии у NPC с уже видимым предметом');
        }
      }
      if (!Array.isArray(p.payments) || p.payments.length === 0) throw new EngineError('для покупки или продажи нужна оплата монетами');
      const paymentIds = new Set<string>();
      const usedIds = new Set<string>([p.itemStackId, ...p.payments.map(payment => payment.stackId)]);
      const pricePaid = p.payments.reduce((total, payment) => {
        if (paymentIds.has(payment.stackId)) throw new EngineError('один стек монет указан в оплате дважды');
        paymentIds.add(payment.stackId);
        if (!Number.isSafeInteger(payment.qty)) throw new EngineError('количество монет должно быть безопасным целым числом');
        const stack = movableStack(state, payment.stackId, payment.qty, payment.splitStackId);
        if (payment.stackId === p.itemStackId) throw new EngineError('стек предмета нельзя использовать как оплату');
        if (!sameInventoryOwner(stack.owner, p.buyer)) throw new EngineError('покупатель не владеет всеми стеками оплаты');
        if (!isCoinId(stack.itemId)) throw new EngineError(`стек ${payment.stackId} не содержит монеты SRD`);
        if (stack.attunedTo || stack.wornAs) throw new EngineError('настроенная или надетая вещь не может быть оплатой');
        checkInventoryStorage(state, stack.storage);
        for (const id of [payment.splitStackId]) {
          if (!id) continue;
          if (usedIds.has(id) || state.inventory?.[id]) throw new EngineError(`стек ${id} уже есть в сделке`);
          usedIds.add(id);
        }
        return total + BigInt(payment.qty) * BigInt(COIN_BY_ID[stack.itemId].copperValue);
      }, 0n);
      if (pricePaid !== BigInt(p.priceCopper)) throw new EngineError('фактическая оплата не совпадает с указанной ценой');
      if (p.itemSplitStackId && (usedIds.has(p.itemSplitStackId) || state.inventory?.[p.itemSplitStackId])) throw new EngineError(`стек ${p.itemSplitStackId} уже есть в сделке`);
      return;
    }
    case 'ATTUNEMENT_CHANGED': {
      const p = event.payload as PayloadByType['ATTUNEMENT_CHANGED'];
      const stack = state.inventory?.[p.stackId];
      if (!stack) throw new EngineError(`нет стека вещи ${p.stackId}`);
      if (p.actorId === undefined) {
        if (!stack.attunedTo) throw new EngineError('вещь не настроена');
        return;
      }
      const actor = state.actors[p.actorId];
      if (!actor || actor.removed) throw new EngineError(`нет действующего актёра ${p.actorId}`);
      if (stack.owner.kind !== 'actor' || stack.owner.id !== p.actorId || stack.storage.kind !== 'actor' || stack.storage.id !== p.actorId) throw new EngineError('для настройки вещь должна принадлежать актёру и находиться у него');
      if (stack.qty !== 1) throw new EngineError('настроить можно только отдельный экземпляр вещи');
      const item = MAGIC_ITEMS[stack.itemId];
      if (!item?.attunement.required) throw new EngineError('у этого предмета нет требования настройки по записи SRD');
      const requirement = attunementRequirement(actor, item.attunement.by, item.attunement.when);
      if (requirement === 'unsupported') throw new EngineError(`ограничение настройки «${item.attunement.by ?? item.attunement.when}» пока требует проверки мастером`);
      if (requirement === 'ineligible') throw new EngineError(`${actor.name} не подходит под ограничение настройки «${item.attunement.by}»`);
      if (stack.attunedTo === p.actorId) throw new EngineError(`${actor.name} уже настроен на эту вещь`);
      const attuned = Object.values(state.inventory ?? {}).filter(item => item.attunedTo === p.actorId).length;
      if (attuned >= 3) throw new EngineError(`${actor.name}: предел настройки — три предмета`);
      return;
    }
    case 'ITEM_EQUIPPED': {
      const p = event.payload as PayloadByType['ITEM_EQUIPPED'];
      const stack = state.inventory?.[p.stackId];
      if (!stack) throw new EngineError(`нет стека вещи ${p.stackId}`);
      const actor = state.actors[p.actorId];
      if (!actor || actor.removed) throw new EngineError(`нет действующего актёра ${p.actorId}`);
      if (!actor.sheet) throw new EngineError(`${actor.name}: нет листа для экипировки`);
      if (stack.owner.kind !== 'actor' || stack.owner.id !== p.actorId || stack.storage.kind !== 'actor' || stack.storage.id !== p.actorId) throw new EngineError('надеть можно только собственную вещь, находящуюся у актёра');
      if (stack.qty !== 1) throw new EngineError('экипировать можно только отдельный экземпляр вещи');
      if (p.wornAs !== 'armor' && p.wornAs !== 'shield') throw new EngineError('неизвестный слот экипировки');
      if (p.wornAs === 'armor' && !armorIdOfItem(stack.itemId)) throw new EngineError('эта запись не является доспехом SRD с поддержанным расчётом КД');
      if (p.wornAs === 'shield' && stack.itemId !== 'shield') throw new EngineError('эта запись не является щитом SRD с поддержанным расчётом КД');
      if (p.wornAs === 'armor' && actor.sheet.mageArmor) throw new EngineError('сначала завершите Mage Armor: заклинание кончается, когда цель надевает доспех');
      if (stack.wornAs) throw new EngineError('сначала снимите вещь');
      if (Object.values(state.inventory ?? {}).some(item => item.owner.kind === 'actor' && item.owner.id === p.actorId && item.wornAs === p.wornAs)) throw new EngineError(`сначала снимите уже надетый ${p.wornAs === 'armor' ? 'доспех' : 'щит'}`);
      return;
    }
    case 'ITEM_UNEQUIPPED': {
      const p = event.payload as PayloadByType['ITEM_UNEQUIPPED'];
      const stack = state.inventory?.[p.stackId];
      if (!stack || !stack.wornAs) throw new EngineError(`вещь ${p.stackId} не надета`);
      const actor = state.actors[p.actorId];
      if (!actor || actor.removed || !actor.sheet) throw new EngineError(`нет действующего персонажа ${p.actorId}`);
      if (stack.owner.kind !== 'actor' || stack.owner.id !== p.actorId || stack.storage.kind !== 'actor' || stack.storage.id !== p.actorId) throw new EngineError('снять можно только вещь актёра, находящуюся у него');
      return;
    }
    case 'ACTOR_REMOVED': {
      const p = event.payload as PayloadByType['ACTOR_REMOVED'];
      const a = actorOf(state, p.actorId);
      if (a.removed) throw new EngineError(`${a.name} уже выбыл`);
      return;
    }
    case 'WORLD_DELTA_PROPOSED': {
      const p = event.payload as PayloadByType['WORLD_DELTA_PROPOSED'];
      const d = p.delta;
      if (!d?.id) throw new EngineError('предложение без id');
      if (state.deltas[d.id]) throw new EngineError(`предложение ${d.id} уже есть`);
      if (d.status !== 'pending') throw new EngineError('предложение рождается только pending: решает мастер');
      if (!d.causeId) throw new EngineError(`у предложения ${d.id} нет causeId`);
      if (d.patch) checkPatch(state, d.patch);
      return;
    }
    case 'REST_TAKEN': {
      const p = event.payload as PayloadByType['REST_TAKEN'];
      if (state.encounter.active) throw new EngineError('в бою не отдыхают: сначала закончить бой');
      if (p.kind !== 'short' && p.kind !== 'long') throw new EngineError(`отдых бывает короткий или долгий, не ${String(p.kind)}`);
      if (p.actorIds.length === 0) throw new EngineError('отдых: некому отдыхать');
      if (p.context && (p.context.layer !== 'srd' && p.context.layer !== 'a5e')) throw new EngineError('слой отдыха должен быть SRD или A5E');
      if (p.context?.a5eCadence !== undefined && p.context.a5eCadence !== '24h-v1') throw new EngineError('неизвестная версия правила частоты A5E-отдыха');
      if (p.context?.a5eStartHp !== undefined && p.context.a5eStartHp !== 'min-1-v1') throw new EngineError('неизвестная версия правила HP для отдыха A5E');
      if (p.context?.a5eTiming !== undefined && p.context.a5eTiming !== 'period-v1' && p.context.a5eTiming !== 'period-v2') throw new EngineError('неизвестная версия периода отдыха A5E');
      if (p.context?.a5eTiming === 'period-v1' || p.context?.a5eTiming === 'period-v2') {
        if (p.kind !== 'long' || p.context.layer !== 'a5e') throw new EngineError('период отдыха доступен только для долгого отдыха A5E');
        if (!Number.isSafeInteger(p.context.a5eDurationHours) || (p.context.a5eDurationHours ?? 0) < 8 || !Number.isSafeInteger((p.context.a5eDurationHours ?? 0) * 3600)) throw new EngineError('долгий отдых A5E длится не менее 8 часов и должен укладываться в диапазон времени кампании');
        if (!Number.isSafeInteger(p.context.a5eStrenuousMinutes) || (p.context.a5eStrenuousMinutes ?? -1) < 0 || (p.context.a5eStrenuousMinutes ?? 0) > (p.context.a5eDurationHours ?? 0) * 60) {
          throw new EngineError('время напряжённой активности должно быть целым числом минут в пределах периода отдыха');
        }
        if (p.context.a5eTiming === 'period-v2' && (!Number.isSafeInteger(p.context.a5eSleepHours) || (p.context.a5eSleepHours ?? -1) < 0 || (p.context.a5eSleepHours ?? 0) > (p.context.a5eDurationHours ?? 0))) {
          throw new EngineError('время сна должно быть целым числом часов в пределах периода отдыха');
        }
      }
      if (p.context?.a5eCadence && (p.kind !== 'long' || p.context.layer !== 'a5e')) throw new EngineError('правило 24 часов применимо только к долгому отдыху A5E');
      if (p.context?.a5eStartHp && (p.kind !== 'long' || p.context.layer !== 'a5e')) throw new EngineError('минимум HP применим только к долгому отдыху A5E');
      if (p.context && typeof p.context.haven !== 'boolean') throw new EngineError('укрытие отдыха должно быть отмечено да или нет');
      if (p.context?.supplyConsumed !== undefined && typeof p.context.supplyConsumed !== 'boolean') throw new EngineError('расход Supply в отдыхе должен быть да или нет');
      if (p.context?.roughingIt !== undefined && typeof p.context.roughingIt !== 'boolean') throw new EngineError('суровые условия отдыха должны быть отмечены да или нет');
      const a5eAttemptFailed = p.kind === 'long' && p.context?.layer === 'a5e' && !a5eRestCompletes(p.context);
      const sleeplessFailed = new Set(p.context?.a5eSleeplessFailedActorIds ?? []);
      if (sleeplessFailed.size !== (p.context?.a5eSleeplessFailedActorIds?.length ?? 0)) throw new EngineError('персонаж дважды указан с провалом Sleepless');
      if (sleeplessFailed.size && (p.kind !== 'long' || p.context?.layer !== 'a5e')) throw new EngineError('провал Sleepless применим только к долгому отдыху A5E');
      if (sleeplessFailed.size && p.context?.a5eTiming !== 'period-v1' && p.context?.a5eTiming !== 'period-v2') throw new EngineError('провал Sleepless требует записанного периода долгого отдыха A5E');
      const seen = new Set<string>();
      for (const id of p.actorIds) {
        const a = actorOf(state, id);
        if (a.removed) throw new EngineError(`${a.name} выбыл и не отдыхает`);
        if (seen.has(id)) throw new EngineError(`${a.name} дважды в отдыхе`);
        seen.add(id);
        if (sleeplessFailed.has(id)) {
          const effect = a.a5eConditions?.mentalStress;
          const restStartedAt = state.time.sec - (p.context?.a5eDurationHours ?? 0) * 3600;
          if (effect?.id !== 'sleepless' || (effect.kind === 'short' && effect.untilSec <= restStartedAt)) throw new EngineError(`${a.name}: провал Sleepless записан без активного эффекта Бессонницы в начале отдыха`);
        }
        if (!a5eAttemptFailed && !sleeplessFailed.has(id) && p.kind === 'long' && p.context?.layer === 'a5e' && p.context.a5eCadence === '24h-v1' && a.a5eLastLongRestAt !== undefined && state.time.sec < a.a5eLastLongRestAt + 86_400) {
          throw new EngineError(`${a.name}: A5E long rest даёт пользу не чаще одного раза за 24 часа`);
        }
        if (!a5eAttemptFailed && !sleeplessFailed.has(id) && p.kind === 'long' && p.context?.layer === 'a5e' && p.context.a5eStartHp === 'min-1-v1' && a.hp.current < 1) {
          throw new EngineError(`${a.name}: для долгого отдыха A5E нужно иметь хотя бы 1 HP в его начале`);
        }
      }
      for (const id of sleeplessFailed) if (!seen.has(id)) throw new EngineError(`${id} не отдыхает, но отмечен с провалом Sleepless`);
      if (p.context?.suppliedActorIds) {
        const supplied = new Set<string>();
        const stock = state.supply ?? 0;
        for (const id of p.context.suppliedActorIds) {
          if (!seen.has(id)) throw new EngineError(`${id} не отдыхает, но отмечен как получивший Supply`);
          if (supplied.has(id)) throw new EngineError(`${id} дважды отмечен как получивший Supply`);
          supplied.add(id);
        }
        if (supplied.size > stock) throw new EngineError(`Supply: выбрано ${supplied.size}, в запасе ${stock}`);
        if (p.kind !== 'long' || p.context.layer !== 'a5e') throw new EngineError('распределение Supply доступно только для долгого отдыха A5E');
      }
      if (p.kind === 'long') {
        const fallbackDice = new Set<string>();
        for (const h of p.hitDice ?? []) {
          const a = actorOf(state, h.actorId);
          if (!sleeplessFailed.has(h.actorId)) throw new EngineError(`${a.name}: кости хитов при долгом отдыхе разрешены только после провала Sleepless`);
          if (fallbackDice.has(h.actorId)) throw new EngineError(`${a.name} дважды тратит кости хитов`);
          fallbackDice.add(h.actorId);
          if (!a.sheet) throw new EngineError(`у ${a.name} нет костей хитов: нет листа`);
          positive(h.dice, `кости хитов ${a.name}`);
          if (!Number.isInteger(h.healed) || h.healed < 0) throw new EngineError(`хиты за кости у ${a.name}: целое не меньше нуля`);
          const available = a.sheet.level - (a.hitDiceSpent ?? 0);
          if (h.dice > available) throw new EngineError(`у ${a.name} осталось ${available} костей хитов, а тратится ${h.dice}`);
        }
        const fallbackResources = new Set<string>();
        for (const r of p.resources ?? []) {
          const a = actorOf(state, r.actorId);
          if (!sleeplessFailed.has(r.actorId)) throw new EngineError(`${a.name}: короткие ресурсы при долгом отдыхе разрешены только после провала Sleepless`);
          if (!isResourceId(r.resourceId)) throw new EngineError(`нет такого ресурса в SRD: ${r.resourceId}`);
          const key = `${r.actorId}:${r.resourceId}`;
          if (fallbackResources.has(key)) throw new EngineError(`${a.name}: ${RESOURCES[r.resourceId].label} дважды в списке отдыха`);
          fallbackResources.add(key);
          if (spentOf(a, r.resourceId) === 0) throw new EngineError(`${a.name}: ${RESOURCES[r.resourceId].label} не тратились — возвращать нечего`);
        }
        return;
      }
      const restored = new Set<string>();
      for (const r of p.resources ?? []) {
        const a = actorOf(state, r.actorId);
        if (!seen.has(r.actorId)) throw new EngineError(`${a.name} не отдыхает, а ресурс возвращает`);
        if (!isResourceId(r.resourceId)) throw new EngineError(`нет такого ресурса в SRD: ${r.resourceId}`);
        const key = `${r.actorId}:${r.resourceId}`;
        if (restored.has(key)) throw new EngineError(`${a.name}: ${RESOURCES[r.resourceId].label} дважды в списке отдыха`);
        restored.add(key);
        if (spentOf(a, r.resourceId) === 0) throw new EngineError(`${a.name}: ${RESOURCES[r.resourceId].label} не тратились — возвращать нечего`);
      }
      const spent = new Set<string>();
      for (const h of p.hitDice ?? []) {
        const a = actorOf(state, h.actorId);
        if (!seen.has(h.actorId)) throw new EngineError(`${a.name} не отдыхает, а кости хитов тратит`);
        if (spent.has(h.actorId)) throw new EngineError(`${a.name} дважды тратит кости хитов`);
        spent.add(h.actorId);
        if (!a.sheet) throw new EngineError(`у ${a.name} нет костей хитов: нет листа`);
        positive(h.dice, `кости хитов ${a.name}`);
        if (!Number.isInteger(h.healed) || h.healed < 0) throw new EngineError(`хиты за кости у ${a.name}: целое не меньше нуля`);
        const available = a.sheet.level - (a.hitDiceSpent ?? 0);
        if (h.dice > available) throw new EngineError(`у ${a.name} осталось ${available} костей хитов, а тратится ${h.dice}`);
      }
      return;
    }
    case 'RESOURCE_SPENT':
    case 'RESOURCE_RESTORED': {
      const p = event.payload as PayloadByType['RESOURCE_SPENT'];
      const a = actorOf(state, p.actorId);
      if (a.removed) throw new EngineError(`${a.name} выбыл`);
      if (!isResourceId(p.resourceId)) throw new EngineError(`нет такого ресурса в SRD: ${p.resourceId}`);
      const label = RESOURCES[p.resourceId].label;
      positive(p.amount, `${label} у ${a.name}`);
      if (!Number.isInteger(p.max) || p.max < 0) throw new EngineError(`${label} у ${a.name}: максимум — целое не меньше нуля, получено ${p.max}`);
      const spent = spentOf(a, p.resourceId);
      if (event.type === 'RESOURCE_SPENT' && spent + p.amount > p.max) throw new EngineError(`${label} у ${a.name}: осталось ${Math.max(0, p.max - spent)} из ${p.max}, а тратится ${p.amount}`);
      if (event.type === 'RESOURCE_RESTORED' && p.amount > spent) throw new EngineError(`${label} у ${a.name}: потрачено ${spent}, а возвращается ${p.amount}`);
      return;
    }
    case 'TIME_ADVANCED': {
      const p = event.payload as PayloadByType['TIME_ADVANCED'];
      positive(p.steps, 'шагов времени');
      if (p.fromSec !== state.time.sec) throw new EngineError(`время ушло: событие от ${p.fromSec}, сейчас ${state.time.sec}`);
      if (p.toSec <= p.fromSec) throw new EngineError('время идёт только вперёд; назад — через отмену');
      return;
    }
    case 'WORLD_DELTA_ACCEPTED':
    case 'WORLD_DELTA_REJECTED':
    case 'WORLD_DELTA_REROLLED': {
      const p = event.payload as { deltaId: string; variantId?: string };
      const d = state.deltas[p.deltaId];
      if (!d) throw new EngineError(`нет предложения ${p.deltaId}`);
      if (d.status !== 'pending') throw new EngineError(`предложение ${p.deltaId} уже решено: ${d.status}`);
      if (event.type === 'WORLD_DELTA_REROLLED' && !d.variants?.some(v => v.id === p.variantId)) throw new EngineError(`у предложения ${p.deltaId} нет варианта ${p.variantId}`);
      if (event.type === 'WORLD_DELTA_ACCEPTED' && d.patch) {
        const freshness = worldDeltaFreshness(state, d);
        if (!freshness.current) throw new EngineError(freshness.message);
        checkPatch(state, d.patch);
      }
      return;
    }
    case 'FACT_REVEALED': {
      const p = event.payload as PayloadByType['FACT_REVEALED'];
      if (!state.facts[p.factId]) throw new EngineError(`нет факта ${p.factId}`);
      return;
    }
    case 'PARTY_TRAVELED': {
      const p = event.payload as PayloadByType['PARTY_TRAVELED'];
      if (state.encounter.active) throw new EngineError('в бою не уходят в поход: сначала закончить бой');
      if (!state.world.locations[p.toId]) throw new EngineError(`нет места ${p.toId}`);
      if (p.fromId !== undefined && !state.world.locations[p.fromId]) throw new EngineError(`нет места ${p.fromId}`);
      if (!state.party.some(id => !state.actors[id]?.removed)) throw new EngineError('поход: в партии никого');
      if (!TRAVEL_PACES[p.pace]) throw new EngineError(`темп похода бывает быстрый, обычный или медленный, не ${String(p.pace)}`);
      if (p.points.length < 2) throw new EngineError('поход: путь — хотя бы две точки');
      if (!Number.isFinite(p.miles) || p.miles < 0) throw new EngineError(`поход: мили — не меньше нуля, получено ${p.miles}`);
      if (!Number.isFinite(p.days) || p.days <= 0) throw new EngineError(`поход: дней пути больше нуля, получено ${p.days}`);
      return;
    }
    case 'SUPPLY_CHANGED': {
      const p = event.payload as PayloadByType['SUPPLY_CHANGED'];
      if (!SUPPLY_REASONS.includes(p.reason)) throw new EngineError(`припасы: нет такой причины ${String(p.reason)}`);
      const short = p.shortfall ?? 0;
      if (!Number.isInteger(short) || short < 0) throw new EngineError(`припасы: «не хватило» — целое не меньше нуля, получено ${p.shortfall}`);
      if (short > 0 && p.reason !== 'eaten') throw new EngineError('припасы: «не хватило» бывает только у съеденного');
      if (!Number.isInteger(p.amount) || p.amount < 0 || (p.amount === 0 && short === 0)) throw new EngineError(`припасы: сколько — целое больше нуля, получено ${p.amount}`);
      const have = state.supply ?? 0;
      if (SUPPLY_SPENDS.has(p.reason) && p.amount > have) throw new EngineError(`припасов ${have}, а списывается ${p.amount}`);
      return;
    }
    case 'PLACE_REVEALED': {
      const p = event.payload as PayloadByType['PLACE_REVEALED'];
      const l = state.world.locations[p.locationId];
      if (!l) throw new EngineError(`нет места ${p.locationId}`);
      if (l.revealed) throw new EngineError(`${l.name} уже открыто игрокам`);
      return;
    }
    case 'CHARACTER_LEVELED': {
      const p = event.payload as PayloadByType['CHARACTER_LEVELED'];
      const a = state.actors[p.actorId];
      if (!a) throw new EngineError(`нет актёра ${p.actorId}`);
      if (!a.sheet) throw new EngineError(`${a.name}: без листа уровень не поднять`);
      if (p.sheet.level !== a.sheet.level + 1 || p.sheet.level > 20) throw new EngineError(`${a.name}: уровень ${a.sheet.level} → ${p.sheet.level} — повышение на один, не выше 20-го`);
      if (p.sheet.classId !== a.sheet.classId || p.sheet.raceId !== a.sheet.raceId) throw new EngineError(`${a.name}: повышение не меняет класс и расу`);
      if (!Number.isInteger(p.hpMax) || p.hpMax <= a.hp.max) throw new EngineError(`${a.name}: максимум хитов после повышения ${p.hpMax} — не больше прежнего ${a.hp.max}`);
      if (!Number.isInteger(p.ac) || !Number.isInteger(p.passivePerception)) throw new EngineError(`${a.name}: AC и пассивное внимание — целые`);
      return;
    }
    case 'SHEET_EDITED': {
      const p = event.payload as PayloadByType['SHEET_EDITED'];
      const a = state.actors[p.actorId];
      if (!a) throw new EngineError(`нет актёра ${p.actorId}`);
      if (!a.sheet) throw new EngineError(`${a.name}: листа нет — править нечего`);
      if (!p.reason?.trim()) throw new EngineError('правка листа: нужна причина — она в журнале');
      const keys = Object.keys(p.patch ?? {});
      if (keys.length === 0 || keys.some(k => !SHEET_PATCH_KEYS.includes(k as keyof SheetPatch))) throw new EngineError(`правка листа: поля ${keys.join(', ') || 'нет'} — правятся только ${SHEET_PATCH_KEYS.join(', ')}`);
      if (p.patch.homeland !== undefined && (!isEntityRef(p.patch.homeland) || !p.patch.homeland.startsWith('kingdom:'))) {
        throw new EngineError('родная держава: ожидается ссылка kingdom:<id>');
      }
      return;
    }
    case 'TOKEN_MOVED': {
      const p = event.payload as PayloadByType['TOKEN_MOVED'];
      const a = state.actors[p.actorId];
      if (!a) throw new EngineError(`нет актёра ${p.actorId}`);
      if (p.source !== 'maptool' && p.source !== 'dm') throw new EngineError(`ход токена: источник ${String(p.source)} — только maptool или dm`);
      // Клетки MapTool бывают и отрицательными: карта зоны растёт во все стороны от начала.
      const isCell = (c: unknown) => !!c && Number.isInteger((c as GridCell).x) && Number.isInteger((c as GridCell).y);
      if (!isCell(p.to) || (p.from !== undefined && !isCell(p.from))) throw new EngineError(`${a.name}: клетка — пара целых x, y`);
      if (a.cell && a.cell.x === p.to.x && a.cell.y === p.to.y) throw new EngineError(`${a.name}: уже на клетке (${p.to.x}, ${p.to.y})`);
      return;
    }
    case 'KNOWLEDGE_REVEALED': {
      const p = event.payload as PayloadByType['KNOWLEDGE_REVEALED'];
      if (!isEntityRef(p.ref)) throw new EngineError(`знание: не ссылка ${String(p.ref)}`);
      if (!p.name?.trim() || !p.fact?.label?.trim() || !p.fact.value?.trim()) throw new EngineError('знание: нужны имя сущности, строка и её значение');
      if (state.knowledge?.[p.ref]?.facts.some(f => f.label === p.fact.label)) throw new EngineError(`${p.name}: «${p.fact.label}» партия уже знает`);
      if (p.by !== undefined && !state.actors[p.by]) throw new EngineError(`знание: нет актёра ${p.by}`);
      if (p.check) {
        const c = p.check;
        if (!isSkillId(c.skill)) throw new EngineError(`знание: нет навыка ${String(c.skill)}`);
        if (!Number.isInteger(c.dc) || c.dc < 1 || !Number.isInteger(c.total)) throw new EngineError('знание: Сл и итог — целые числа');
        if (c.total < c.dc) throw new EngineError(`проверка не прошла: ${c.total} против Сл ${c.dc} — факт не открыт`);
      }
      return;
    }
    case 'DICE_ROLLED': {
      const p = event.payload as PayloadByType['DICE_ROLLED'];
      if (!p.group) return;
      const g = p.group;
      if (!isSkillId(g.skill)) throw new EngineError(`групповая проверка: нет навыка ${String(g.skill)}`);
      if (!Number.isInteger(g.dc) || g.dc < 1 || g.dc > 30) throw new EngineError(`групповая проверка: Сл должна быть от 1 до 30, получено ${g.dc}`);
      if (!Array.isArray(g.rolls) || g.rolls.length < 2) throw new EngineError('групповая проверка: нужны минимум два персонажа');
      const ids = new Set<string>();
      for (const r of g.rolls) {
        if (!r.actorId?.trim() || ids.has(r.actorId)) throw new EngineError('групповая проверка: актёры должны быть указаны один раз');
        ids.add(r.actorId);
        if (!r.name?.trim() || !Number.isInteger(r.die) || r.die < 1 || r.die > 20 || !Number.isInteger(r.modifier) || r.total !== r.die + r.modifier || r.success !== (r.total >= g.dc)) {
          throw new EngineError(`групповая проверка: неверный результат для ${r.name || r.actorId}`);
        }
      }
      const successes = g.rolls.filter(r => r.success).length;
      if (g.successes !== successes || p.total !== successes) throw new EngineError('групповая проверка: число успехов не совпало с бросками');
      if (g.passed !== (successes >= Math.ceil(g.rolls.length / 2))) throw new EngineError('групповая проверка: итог группы не совпал с большинством');
      return;
    }
    case 'NPC_SOCIAL_UPDATED': {
      const p = event.payload as PayloadByType['NPC_SOCIAL_UPDATED'];
      const npc = actorOf(state, p.actorId);
      if (npc.kind === 'pc') throw new EngineError('Influence: отношение можно хранить только у NPC/монстра');
      if (!['friendly', 'indifferent', 'hostile'].includes(p.state?.attitude)) throw new EngineError('Influence: неизвестное отношение');
      const old = npc.social ?? { attitude: 'indifferent' as const };
      if (p.kind === 'attitude') {
        if (JSON.stringify(p.state.failedRequests ?? {}) !== JSON.stringify(old.failedRequests ?? {})) throw new EngineError('смена отношения не должна менять блокировки Influence');
        if (p.state.relationshipScore !== old.relationshipScore) throw new EngineError('смена отношения не должна менять счёт PF1');
        if (JSON.stringify(p.state.relationships ?? {}) !== JSON.stringify(old.relationships ?? {})) throw new EngineError('смена отношения не должна менять связи PF1');
        if (p.state.giftAtSec !== old.giftAtSec) throw new EngineError('смена отношения не должна менять историю подарков');
        return;
      }
      if (p.kind === 'relationship') {
        if (!p.targetId || !state.party.includes(p.targetId) || actorOf(state, p.targetId).kind !== 'pc') throw new EngineError('PF1 Relationships: выберите персонажа партии');
        if (p.state.relationshipScore !== old.relationshipScore) throw new EngineError('новая связь PF1 не должна менять старую общую запись');
        const relationships = p.state.relationships ?? {};
        for (const [pcId, relationship] of Object.entries(relationships)) {
          if (!state.party.includes(pcId) || actorOf(state, pcId).kind !== 'pc') throw new EngineError('PF1 Relationships: связь должна вести к персонажу партии');
          if (!Number.isFinite(relationship.score)) throw new EngineError('PF1 Relationship Score должен быть числом');
          if (relationship.type !== undefined && relationship.type !== 'friendship' && relationship.type !== 'competition') throw new EngineError('PF1 Relationships: неизвестный тип связи');
          if (relationship.score > 5 && !relationship.type) throw new EngineError('PF1 Relationships: для уровня выше Association выберите дружбу или соперничество');
          if (relationship.growthAtLevel !== undefined && (!Number.isSafeInteger(relationship.growthAtLevel) || relationship.growthAtLevel < 1)) throw new EngineError('PF1 Relationships: некорректный уровень последней проверки');
        }
        const previous = old.relationships ?? {};
        for (const pcId of new Set([...Object.keys(previous), ...Object.keys(relationships)])) {
          if (pcId !== p.targetId && JSON.stringify(previous[pcId]) !== JSON.stringify(relationships[pcId])) throw new EngineError('PF1 Relationships: можно менять только выбранную связь');
        }
        if (p.state.attitude !== old.attitude || JSON.stringify(p.state.failedRequests ?? {}) !== JSON.stringify(old.failedRequests ?? {})) throw new EngineError('задание счёта PF1 не должно менять Influence');
        if (p.state.giftAtSec !== old.giftAtSec) throw new EngineError('задание счёта PF1 не должно менять историю подарков');
        if ((relationships[p.targetId]?.growthAtLevel ?? undefined) !== (previous[p.targetId]?.growthAtLevel ?? undefined)) throw new EngineError('ручная запись счёта PF1 не меняет историю проверок роста');
        if (p.relationshipGrowth !== undefined) throw new EngineError('ручная запись счёта PF1 не содержит бросок роста');
        return;
      }
      if (p.kind === 'relationship-growth') {
        const growth = p.relationshipGrowth;
        if (!p.targetId || !state.party.includes(p.targetId) || actorOf(state, p.targetId).kind !== 'pc') throw new EngineError('PF1 Relationships: выберите персонажа партии');
        const checkTotal = p.total;
        if (!growth || !p.skill || p.dc === undefined || !Number.isFinite(p.dc) || checkTotal === undefined || !Number.isInteger(checkTotal)) throw new EngineError('PF1 Relationships: нет данных проверки роста');
        const pc = actorOf(state, p.targetId);
        const oldRelationship = old.relationships?.[p.targetId];
        const nextRelationship = p.state.relationships?.[p.targetId];
        if (!pc.sheet || !oldRelationship || !oldRelationship.type || !nextRelationship) throw new EngineError('PF1 Relationships: сначала задайте счёт и тип связи');
        if (growth.action !== 'gift' && growth.action !== 'insult') throw new EngineError('PF1 Relationships: неизвестный особый ход');
        if (!Number.isSafeInteger(growth.level) || growth.level !== pc.sheet.level || (oldRelationship.growthAtLevel ?? 0) === growth.level) throw new EngineError('PF1 Relationships: особый подарок или оскорбление доступны один раз на уровень персонажа');
        if ((growth.action === 'gift' && (oldRelationship.type !== 'friendship' || p.skill !== 'persuasion'))
          || (growth.action === 'insult' && (oldRelationship.type !== 'competition' || p.skill !== 'intimidation'))) throw new EngineError('PF1 Relationships: действие или навык не соответствует типу связи');
        if (!Number.isInteger(growth.die) || growth.die < 1 || growth.die > 20 || !Number.isInteger(growth.modifier)
          || growth.modifier !== checkTotal - growth.die || p.dc !== oldRelationship.score) throw new EngineError('PF1 Relationships: бросок не совпадает со счётом связи');
        const expectedDelta = checkTotal < p.dc ? 0 : checkTotal >= p.dc + 10 ? 2 : 1;
        if (growth.delta !== expectedDelta || nextRelationship.score !== oldRelationship.score + expectedDelta || nextRelationship.type !== oldRelationship.type || nextRelationship.growthAtLevel !== growth.level) throw new EngineError('PF1 Relationships: итог роста не совпадает с проверкой');
        for (const [pcId, relationship] of Object.entries(p.state.relationships ?? {})) {
          if (pcId !== p.targetId && JSON.stringify(relationship) !== JSON.stringify(old.relationships?.[pcId])) throw new EngineError('PF1 Relationships: можно менять только выбранную связь');
        }
        if (p.state.relationshipScore !== old.relationshipScore || p.state.attitude !== old.attitude || JSON.stringify(p.state.failedRequests ?? {}) !== JSON.stringify(old.failedRequests ?? {}) || p.state.giftAtSec !== old.giftAtSec) throw new EngineError('PF1 Relationships: проверка роста не меняет отношение, Influence или историю подарков');
        return;
      }
      if (p.kind === 'relationship-transition') {
        const transition = p.relationshipTransition;
        if (!p.targetId || !state.party.includes(p.targetId) || actorOf(state, p.targetId).kind !== 'pc') throw new EngineError('PF1 Relationships: выберите персонажа партии');
        const previous = old.relationships ?? {};
        const oldRelationship = previous[p.targetId];
        const nextRelationship = p.state.relationships?.[p.targetId];
        if (!transition || !oldRelationship?.type || !nextRelationship || !transition.reason.trim() || transition.reason.length > 160) throw new EngineError('PF1 Relationships: не хватает данных разворота связи');
        if (transition.fromScore !== oldRelationship.score || !Number.isFinite(transition.fromScore) || !Number.isFinite(transition.toScore)) throw new EngineError('PF1 Relationships: счёт до действия не совпадает');
        if (transition.transition === 'to-competition') {
          if (oldRelationship.type !== 'friendship' || nextRelationship.type !== 'competition' || transition.toScore !== transition.fromScore / 2) throw new EngineError('PF1 Relationships: оскорбление или отказ переводит дружбу в соперничество и делит счёт пополам');
          if (p.skill !== undefined || p.dc !== undefined || p.total !== undefined || transition.die !== undefined || transition.modifier !== undefined) throw new EngineError('PF1 Relationships: прямой разворот не содержит проверку');
        } else if (transition.transition === 'to-friendship') {
          const total = p.total;
          const die = transition.die;
          const modifier = transition.modifier;
          if (oldRelationship.type !== 'competition' || p.skill !== 'persuasion' || p.dc !== transition.fromScore + 10 || total === undefined || die === undefined || modifier === undefined
            || !Number.isInteger(total) || !Number.isInteger(die) || die < 1 || die > 20 || !Number.isInteger(modifier) || total !== die + modifier) throw new EngineError('PF1 Relationships: примирение требует проверку Diplomacy (Persuasion) против текущего счёта +10');
          const success = total >= p.dc;
          const missBy = p.dc - total;
          const nearMiss = missBy > 0 && missBy < 10;
          const expectedType = success ? 'friendship' : 'competition';
          const expectedScore = success ? transition.fromScore / 2 : nearMiss && transition.applyNearMissReduction ? transition.fromScore - 1 : transition.fromScore;
          if (nextRelationship.type !== expectedType || transition.toScore !== expectedScore || nextRelationship.score !== expectedScore) throw new EngineError('PF1 Relationships: исход примирения не совпадает с проверкой');
          if (transition.applyNearMissReduction !== undefined && typeof transition.applyNearMissReduction !== 'boolean') throw new EngineError('PF1 Relationships: некорректный выбор уменьшения счёта');
        } else throw new EngineError('PF1 Relationships: неизвестный разворот связи');
        if (nextRelationship.score !== transition.toScore || nextRelationship.growthAtLevel !== oldRelationship.growthAtLevel) throw new EngineError('PF1 Relationships: разворот не должен менять историю проверок роста');
        for (const pcId of new Set([...Object.keys(previous), ...Object.keys(p.state.relationships ?? {})])) {
          if (pcId !== p.targetId && JSON.stringify(previous[pcId]) !== JSON.stringify(p.state.relationships?.[pcId])) throw new EngineError('PF1 Relationships: можно менять только выбранную связь');
        }
        if (p.state.relationshipScore !== old.relationshipScore || p.state.attitude !== old.attitude || JSON.stringify(p.state.failedRequests ?? {}) !== JSON.stringify(old.failedRequests ?? {}) || p.state.giftAtSec !== old.giftAtSec) throw new EngineError('PF1 Relationships: разворот не меняет Influence, отношение SRD или историю подарков');
        return;
      }
      if (p.kind === 'gift') {
        if (!p.targetId || !state.party.includes(p.targetId) || !p.gift?.trim() || p.gift.trim().length > 160) throw new EngineError('подарок: укажите персонажа партии и короткое описание');
        if (!Number.isSafeInteger(old.giftAtSec) && old.giftAtSec !== undefined) throw new EngineError('подарок: в истории указано некорректное время');
        if (old.giftAtSec !== undefined && state.time.sec < old.giftAtSec + TEMPO_SECONDS.tenday) throw new EngineError('этому NPC можно записать следующий подарок после десятидневки');
        if (p.state.giftAtSec !== state.time.sec || p.state.attitude !== old.attitude
          || p.state.relationshipScore !== old.relationshipScore
          || JSON.stringify(p.state.relationships ?? {}) !== JSON.stringify(old.relationships ?? {})
          || JSON.stringify(p.state.failedRequests ?? {}) !== JSON.stringify(old.failedRequests ?? {})) {
          throw new EngineError('подарок может записать только время и не меняет отношение или Influence');
        }
        return;
      }
      if (p.kind !== 'influence' || !p.targetId || !p.skill || !p.request?.trim() || !p.requestKey || !Number.isInteger(p.dc) || !Number.isInteger(p.total)) throw new EngineError('Influence: не хватает данных проверки');
      if (p.state.relationshipScore !== old.relationshipScore) throw new EngineError('Influence не меняет PF1 Relationship Score');
      if (JSON.stringify(p.state.relationships ?? {}) !== JSON.stringify(old.relationships ?? {})) throw new EngineError('Influence не меняет PF1 Relationships');
      if (p.state.giftAtSec !== old.giftAtSec) throw new EngineError('Influence не меняет историю подарков');
      if (!state.party.includes(p.targetId)) throw new EngineError('Influence: проверку делает персонаж из партии');
      if (!['deception', 'intimidation', 'performance', 'persuasion', 'animal-handling'].includes(p.skill)) throw new EngineError('Influence: этот навык не указан в таблице SRD');
      const pc = actorOf(state, p.targetId);
      if (!pc.sheet) throw new EngineError(`Influence: у ${pc.name} нет листа навыков`);
      const request = normalizeInfluenceRequest(p.request);
      const key = `${p.targetId}:${p.skill}:${request}`;
      if (p.requestKey !== key) throw new EngineError('Influence: ключ просьбы не совпал');
      if (p.state.attitude !== old.attitude) throw new EngineError('Influence не меняет отношение NPC автоматически');
      if (p.skill === 'animal-handling' && (!npc.monsterId || !/beast|monstrosity/i.test(MONSTERS[npc.monsterId]?.type ?? ''))) throw new EngineError('Animal Handling применим только к Beast или Monstrosity');
      const failedAt = old.failedRequests?.[key];
      if (failedAt !== undefined && state.time.sec < failedAt + 86_400) throw new EngineError('Influence: ту же просьбу можно повторить через 24 часа');
      const intScore = npc.sheet?.abilities.int ?? (npc.monsterId ? MONSTERS[npc.monsterId]?.abilities.int : undefined) ?? 10;
      if (p.dc !== Math.max(15, intScore)) throw new EngineError(`Influence: Сл должна быть ${Math.max(15, intScore)}`);
      const total = p.total as number;
      const dc = p.dc as number;
      const failed = total < dc;
      if (failed !== (p.failedAtSec !== undefined)) throw new EngineError('Influence: время блокировки ставится только при провале');
      if (failed && (p.failedAtSec !== state.time.sec || p.state.failedRequests?.[key] !== state.time.sec)) throw new EngineError('Influence: время провала должно совпадать с часами кампании');
      if (!failed && p.state.failedRequests?.[key] !== undefined) throw new EngineError('Influence: успешная просьба не оставляет блокировку');
      const oldRequests = old.failedRequests ?? {};
      const newRequests = p.state.failedRequests ?? {};
      for (const otherKey of new Set([...Object.keys(oldRequests), ...Object.keys(newRequests)])) {
        if (otherKey !== key && oldRequests[otherKey] !== newRequests[otherKey]) throw new EngineError('Influence меняет только блокировку этой просьбы');
      }
      return;
    }
    case 'PERSON_RELATIONSHIP_UPDATED': {
      const p = event.payload as PayloadByType['PERSON_RELATIONSHIP_UPDATED'];
      const pc = actorOf(state, p.targetId);
      if (!state.party.includes(p.targetId) || pc.kind !== 'pc' || !pc.sheet) throw new EngineError('отношение к справочному NPC задаётся для персонажа с листом из партии');
      if (!p.personId.trim() || p.personId.length > 128 || !p.personName.trim() || p.personName.length > 160 || !p.note.trim()) throw new EngineError('отношение к справочному NPC: некорректная ссылка или подпись');
      const previous = state.personRelationships?.[p.personId]?.[p.targetId];
      if (p.relationship) {
        if (!Number.isFinite(p.relationship.score)) throw new EngineError('PF1 Relationship Score должен быть числом');
        if (p.relationship.type !== undefined && p.relationship.type !== 'friendship' && p.relationship.type !== 'competition') throw new EngineError('PF1 Relationships: неизвестный тип связи');
        if (p.relationship.score > 5 && !p.relationship.type) throw new EngineError('PF1 Relationships: для уровня выше Association выберите дружбу или соперничество');
        if (p.relationship.growthAtLevel !== undefined && (!Number.isSafeInteger(p.relationship.growthAtLevel) || p.relationship.growthAtLevel < 1)) throw new EngineError('PF1 Relationships: некорректный уровень последней проверки');
      }
      if (p.relationshipGrowth) {
        const growth = p.relationshipGrowth;
        const total = p.total;
        if (p.relationshipTransition || !previous?.type || !p.relationship || !p.skill || p.dc === undefined || total === undefined || !Number.isInteger(total)) throw new EngineError('PF1 Relationships: нет исходной связи или данных проверки роста');
        if (growth.action !== 'gift' && growth.action !== 'insult') throw new EngineError('PF1 Relationships: неизвестный особый ход');
        if (!Number.isSafeInteger(growth.level) || growth.level !== pc.sheet.level || (previous.growthAtLevel ?? 0) === growth.level) throw new EngineError('PF1 Relationships: особый подарок или оскорбление доступны один раз на уровень персонажа');
        if ((growth.action === 'gift' && (previous.type !== 'friendship' || p.skill !== 'persuasion'))
          || (growth.action === 'insult' && (previous.type !== 'competition' || p.skill !== 'intimidation'))) throw new EngineError('PF1 Relationships: действие или навык не соответствует типу связи');
        if (!Number.isInteger(growth.die) || growth.die < 1 || growth.die > 20 || !Number.isInteger(growth.modifier)
          || growth.modifier !== total - growth.die || p.dc !== previous.score) throw new EngineError('PF1 Relationships: бросок не совпадает со счётом связи');
        const expectedDelta = total < p.dc ? 0 : total >= p.dc + 10 ? 2 : 1;
        if (growth.delta !== expectedDelta || p.relationship.score !== previous.score + expectedDelta || p.relationship.type !== previous.type || p.relationship.growthAtLevel !== growth.level) throw new EngineError('PF1 Relationships: итог роста не совпадает с проверкой');
      } else if (p.relationshipTransition) {
        const transition = p.relationshipTransition;
        const total = p.total;
        if (!previous?.type || !p.relationship || !transition.reason.trim() || transition.reason.length > 160
          || transition.fromScore !== previous.score || !Number.isFinite(transition.toScore)) throw new EngineError('PF1 Relationships: не хватает данных разворота связи');
        if (transition.transition === 'to-competition') {
          if (previous.type !== 'friendship' || p.relationship.type !== 'competition' || transition.toScore !== previous.score / 2 || p.relationship.score !== transition.toScore) throw new EngineError('PF1 Relationships: оскорбление или отказ переводит дружбу в соперничество и делит счёт пополам');
          if (p.skill !== undefined || p.dc !== undefined || total !== undefined || transition.die !== undefined || transition.modifier !== undefined) throw new EngineError('PF1 Relationships: прямой разворот не содержит проверку');
        } else if (transition.transition === 'to-friendship') {
          const die = transition.die;
          const modifier = transition.modifier;
          if (previous.type !== 'competition' || p.skill !== 'persuasion' || p.dc !== previous.score + 10 || total === undefined || die === undefined || modifier === undefined
            || !Number.isInteger(total) || !Number.isInteger(die) || die < 1 || die > 20 || !Number.isInteger(modifier) || total !== die + modifier) throw new EngineError('PF1 Relationships: примирение требует проверку Diplomacy (Persuasion) против текущего счёта +10');
          const success = total >= p.dc;
          const missBy = p.dc - total;
          const nearMiss = missBy > 0 && missBy < 10;
          const expectedType = success ? 'friendship' : 'competition';
          const expectedScore = success ? previous.score / 2 : nearMiss && transition.applyNearMissReduction ? previous.score - 1 : previous.score;
          if (p.relationship.type !== expectedType || transition.toScore !== expectedScore || p.relationship.score !== expectedScore) throw new EngineError('PF1 Relationships: исход примирения не совпадает с проверкой');
          if (transition.applyNearMissReduction !== undefined && typeof transition.applyNearMissReduction !== 'boolean') throw new EngineError('PF1 Relationships: некорректный выбор уменьшения счёта');
        } else throw new EngineError('PF1 Relationships: неизвестный разворот связи');
        if (p.relationship.growthAtLevel !== previous.growthAtLevel) throw new EngineError('PF1 Relationships: разворот не должен менять историю проверок роста');
      } else if (p.skill !== undefined || p.dc !== undefined || p.total !== undefined) {
        throw new EngineError('PF1 Relationships: ручная запись не содержит проверку');
      } else if (p.relationship && (p.relationship.growthAtLevel ?? undefined) !== (previous?.growthAtLevel ?? undefined)) {
        throw new EngineError('PF1 Relationships: ручная запись не меняет историю проверок роста');
      }
      return;
    }
    case 'A5E_DOWNTIME_PROJECT_UPDATED': {
      const project = (event.payload as PayloadByType['A5E_DOWNTIME_PROJECT_UPDATED']).project;
      const actor = state.actors[project.actorId];
      if (!project.id.trim() || !actor || actor.removed || actor.kind !== 'pc' || !state.party.includes(project.actorId)
        || project.actorName !== actor.name || project.source !== 'a5e-srd:adventuring-8'
        || !Number.isSafeInteger(project.createdSec) || !Number.isSafeInteger(project.updatedSec)
        || project.createdSec > state.time.sec || project.updatedSec !== state.time.sec) {
        throw new EngineError('некорректный проект A5E downtime');
      }
      const before = state.a5eDowntimeProjects?.[project.id];
      if (project.activity === 'train') {
        const training = project.training;
        const step = project.lastStep;
        let expectedMonths = 0;
        let sheetIntelligenceModifier: number | undefined;
        try {
          if (training) expectedMonths = a5eTrainLanguageOrTool(training.intelligenceModifier, 'tutor').duration;
          if (actor.sheet) sheetIntelligenceModifier = abilityMod(actor.sheet.abilities.int);
        } catch { /* rejected below */ }
        let intervalMonths = 0;
        try { if (step) intervalMonths = a5eTrainingPeriodMonths(step.period); } catch { /* rejected below */ }
        const expectedAfter = training && step ? Math.min(training.requiredMonths, step.beforeMonths + intervalMonths) : -1;
        const expectedIntelligenceModifier = before?.activity === 'train' ? before.training.intelligenceModifier : sheetIntelligenceModifier;
        const validTrain = !!actor.sheet && !!training && !!step && !!training.languageName.trim() && !!training.tutorName.trim()
          && training.tutorConfirmed === true && training.languageId === a5eLanguageId(training.languageName)
          && Number.isSafeInteger(training.intelligenceModifier) && training.intelligenceModifier === expectedIntelligenceModifier
          && expectedMonths === training.requiredMonths && training.requiredMonths >= 1
          && step.requiredMonths === training.requiredMonths && step.beforeMonths === (before?.activity === 'train' ? before.training.completedMonths : 0)
          && step.creditedMonths === expectedAfter - step.beforeMonths && step.creditedMonths > 0
          && step.afterMonths === expectedAfter && training.completedMonths === step.afterMonths
          && step.costChargedGp === step.creditedMonths * 50 && project.costPaidGp === training.completedMonths * 50
          && step.completes === (step.afterMonths >= step.requiredMonths)
          && project.status === (step.completes ? 'succeeded' : 'active')
          && (before === undefined || (before.activity === 'train' && before.status === 'active'
            && before.actorId === project.actorId && before.training.languageId === training.languageId
            && before.training.languageName === training.languageName && before.training.tutorName === training.tutorName
            && before.training.tutorConfirmed && before.training.intelligenceModifier === training.intelligenceModifier
            && before.training.requiredMonths === training.requiredMonths && before.createdSec === project.createdSec
            && project.costPaidGp === before.costPaidGp + step.costChargedGp))
          && (before !== undefined || (step.beforeMonths === 0 && project.costPaidGp === step.costChargedGp))
          && (before !== undefined || !Object.values(state.a5eDowntimeProjects ?? {}).some(existing => existing.activity === 'train'
            && existing.status === 'active' && existing.actorId === project.actorId && existing.training.languageId === training.languageId))
          && (project.status !== 'succeeded' || !(actor.sheet.trainedLanguages ?? []).some(language => language.id === training.languageId));
        if (!validTrain) throw new EngineError('некорректный проект A5E Train: язык, наставник, период, срок или оплата');
      } else {
        const expectedWeeks = a5eInformationActivitySpec(project.activity, project.obscurity).weeks;
        const expectedCost = project.activity === 'research' && project.suitableLibrary ? 0 : a5eInformationActivitySpec(project.activity, project.obscurity).minimumCostGp;
        const validSkill = project.activity === 'gather-information' ? project.skill === 'investigation'
          : project.skill === 'arcana' || project.skill === 'history';
        if (!project.subject.trim() || !validSkill || !expectedWeeks || project.requiredWeeks !== expectedWeeks
          || !Number.isSafeInteger(project.completedWeeks) || project.completedWeeks < 0 || project.completedWeeks > project.requiredWeeks
          || project.costPaidGp !== expectedCost || (project.suitableLibrary && project.activity !== 'research')
          || !['active', 'succeeded', 'failed'].includes(project.status)
          || (project.status === 'active' && project.completedWeeks >= project.requiredWeeks)
          || (project.status !== 'active' && (project.completedWeeks !== project.requiredWeeks || !project.result))
          || (project.status === 'succeeded' && project.result !== 'success' && project.result !== 'success-by-5')
          || (project.status === 'failed' && project.result !== 'failure' && project.result !== 'failure-by-5')) {
          throw new EngineError('некорректный проект A5E downtime');
        }
        if ((project.lastCheckTotal === undefined) !== (project.result === undefined)
          || (project.lastCheckTotal !== undefined && (!Number.isSafeInteger(project.lastCheckTotal)
            || project.result !== a5eInformationCheckOutcome(project.lastCheckTotal, a5eInformationActivitySpec(project.activity, project.obscurity).dc)))) {
          throw new EngineError('проверка проекта A5E не совпадает с результатом');
        }
        if (before) {
          if (before.activity === 'train' || before.status !== 'active' || before.actorId !== project.actorId || before.activity !== project.activity
            || before.subject !== project.subject || before.obscurity !== project.obscurity || before.skill !== project.skill
            || before.requiredWeeks !== project.requiredWeeks || before.createdSec !== project.createdSec
            || before.costPaidGp !== project.costPaidGp || before.suitableLibrary !== project.suitableLibrary
            || project.completedWeeks < before.completedWeeks) {
            throw new EngineError('проект A5E нельзя заменить, завершить повторно или откатить обычным обновлением');
          }
        } else if (project.completedWeeks <= 0 && project.lastCheckTotal === undefined) {
          throw new EngineError('проект A5E должен засчитать хотя бы одну неделю работы');
        }
      }
      return;
    }
    case 'A5E_KEY_KNOWLEDGE_EARNED': {
      const p = event.payload as PayloadByType['A5E_KEY_KNOWLEDGE_EARNED'];
      const actor = state.actors[p.actorId];
      const current = actor?.a5eKeyKnowledge?.[p.subjectRef] ?? 0;
      if (!actor || actor.kind !== 'pc' || actor.removed || !state.party.includes(actor.id)
        || !isEntityRef(p.subjectRef) || !p.subjectName.trim() || p.source !== 'a5e-srd:adventuring-8'
        || (p.amount !== 1 && p.amount !== 2) || !Number.isSafeInteger(current) || current < 0
        || !Number.isSafeInteger(current + p.amount)) {
        throw new EngineError('некорректное начисление Key Knowledge A5E');
      }
      return;
    }
    case 'A5E_KEY_KNOWLEDGE_SPENT': {
      const p = event.payload as PayloadByType['A5E_KEY_KNOWLEDGE_SPENT'];
      const actor = state.actors[p.actorId];
      const current = actor?.a5eKeyKnowledge?.[p.subjectRef] ?? 0;
      const legacyDetails = p.skill !== undefined || p.dc !== undefined;
      const validLegacyDetails = typeof p.skill === 'string' && isSkillId(p.skill) && Number.isSafeInteger(p.dc) && (p.dc ?? 0) >= 1;
      const action = p.action;
      const validAction = !!action && (action.kind === 'check' || action.kind === 'attack')
        && typeof action.label === 'string' && !!action.label.trim()
        && (action.ability === undefined || ['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(action.ability))
        && (action.skill === undefined || (typeof action.skill === 'string' && isSkillId(action.skill)));
      if (!actor || actor.kind !== 'pc' || actor.removed || !state.party.includes(actor.id)
        || !isEntityRef(p.subjectRef) || !p.subjectName.trim() || p.source !== 'a5e-srd:adventuring-8'
        || !Number.isSafeInteger(p.total) || (legacyDetails && !validLegacyDetails) || (!validLegacyDetails && !validAction)
        || !Number.isSafeInteger(current) || current < 1) {
        throw new EngineError('некорректная трата Key Knowledge A5E');
      }
      return;
    }
    case 'A5E_FAVOR_EARNED': {
      const p = event.payload as PayloadByType['A5E_FAVOR_EARNED'];
      const actor = state.actors[p.actorId];
      const deity = parseRef(p.deityRef);
      const current = actor?.a5eFavor?.[p.deityRef] ?? 0;
      if (!actor || actor.kind !== 'pc' || actor.removed || !state.party.includes(actor.id)
        || deity?.kind !== 'deity' || actor.sheet?.deity?.id !== deity.id || !p.deityName.trim()
        || !A5E_DEVOTION_SIMILARITIES.includes(p.similarity) || (p.skill !== 'nature' && p.skill !== 'religion')
        || !Number.isSafeInteger(p.checkTotal) || p.amount !== a5eDevotionFavorAward(p.checkTotal, a5eDevotionActivitySpec(p.similarity).dc)
        || p.source !== 'a5e-srd:adventuring-8' || !Number.isSafeInteger(p.amount) || p.amount < 1
        || !Number.isSafeInteger(current) || current < 0 || !Number.isSafeInteger(current + p.amount)) {
        throw new EngineError('некорректное начисление A5E favor');
      }
      return;
    }
    case 'A5E_FAVOR_SPENT': {
      const p = event.payload as PayloadByType['A5E_FAVOR_SPENT'];
      const actor = state.actors[p.actorId];
      const deity = parseRef(p.deityRef);
      const current = actor?.a5eFavor?.[p.deityRef] ?? 0;
      if (!actor || actor.kind !== 'pc' || actor.removed || !state.party.includes(actor.id)
        || deity?.kind !== 'deity' || !p.deityName.trim() || !p.boon.trim() || p.boon.length > 500
        || (p.amount !== 1 && p.amount !== 2) || p.source !== 'a5e-srd:adventuring-8'
        || !Number.isSafeInteger(current) || current < p.amount) {
        throw new EngineError('некорректная трата A5E favor');
      }
      return;
    }
    case 'A5E_WORK_RESOLVED': {
      const p = event.payload as PayloadByType['A5E_WORK_RESOLVED'];
      const actor = state.actors[p.actorId];
      const spec = isA5eWorkDifficulty(p.difficulty) ? a5eWorkActivitySpec(p.difficulty) : undefined;
      const dice = p.earningsDice;
      const earned = Array.isArray(dice) ? dice.reduce((sum, die) => sum + die, 0) : undefined;
      const succeeded = !!spec && p.total >= spec.dc;
      const penaltySkills = actor?.a5eWorkDisadvantageSkills ?? [];
      if (!actor || actor.kind === 'monster' || actor.removed || !state.party.includes(actor.id)
        || !isSkillId(p.skill) || !spec || !Number.isSafeInteger(p.total)
        || typeof p.disadvantageApplied !== 'boolean' || p.disadvantageApplied !== penaltySkills.includes(p.skill)
        || !Number.isSafeInteger(p.earningsGp) || (succeeded
          ? p.earningsGp < spec.earningsDice || p.earningsGp > spec.earningsDice * 6
            || (dice !== undefined && (!Array.isArray(dice) || dice.length !== spec.earningsDice
              || dice.some(die => !Number.isInteger(die) || die < 1 || die > 6) || p.earningsGp !== earned))
          : p.earningsGp !== 0 || (dice !== undefined && (!Array.isArray(dice) || dice.length !== 0)))
        || p.source !== 'a5e-srd:adventuring-8') {
        throw new EngineError('некорректное разрешение A5E legal Work');
      }
      return;
    }
    case 'NOTE_ADDED':
      return;
    case 'TIMELINE_PLAN_CREATED': {
      const plan = (event.payload as PayloadByType['TIMELINE_PLAN_CREATED']).plan;
      if (!plan || typeof plan.id !== 'string' || !plan.id.trim() || plan.id.length > 100
        || typeof plan.title !== 'string' || !plan.title.trim() || plan.title.length > 120
        || typeof plan.details !== 'string' || plan.details.length > 2000
        || typeof plan.source !== 'string' || !plan.source.trim() || plan.source.length > 500
        || plan.visibility !== 'dm'
        || !Number.isSafeInteger(plan.startSec) || !Number.isSafeInteger(plan.endSec) || plan.endSec < plan.startSec) {
        throw new EngineError('некорректный план хронологии: нужны название, источник и допустимый диапазон дат');
      }
      if (state.world.timelinePlans?.[plan.id]) throw new EngineError(`план ${plan.id} уже существует`);
      return;
    }
    case 'TIMELINE_PLAN_CANCELLED': {
      const plan = state.world.timelinePlans?.[(event.payload as PayloadByType['TIMELINE_PLAN_CANCELLED']).planId];
      if (!plan || plan.status !== 'active') throw new EngineError('активный план хронологии не найден');
      return;
    }
  }
}

/**
 * Патч предложения указывает на существующую запись мира и несёт допустимое число — иначе принятие не применится и в
 * лог не попадёт.
 */
function checkPatch(state: State, patch: WorldPatch): void {
  const { factions, locations, threads } = state.world;
  const missing = (what: string, id: string) => new EngineError(`патч предложения указывает на несуществующее: ${what} ${id}`);
  switch (patch.kind) {
    case 'faction':
      if (!factions[patch.id]) throw missing('faction', patch.id);
      if (patch.field === 'standing' && (!Number.isInteger(patch.value) || patch.value < -3 || patch.value > 3)) {
        throw new EngineError(`отношение фракции к партии — целое от −3 до +3, получено ${patch.value}`);
      }
      return;
    case 'thread': if (!threads[patch.id]) throw missing('thread', patch.id); return;
    case 'threadClock': {
      if (!threads[patch.id]) throw missing('thread', patch.id);
      const clock = patch.clock;
      if (clock && (!isProgressValue(clock) || (clock.startedSec !== undefined && (!Number.isSafeInteger(clock.startedSec) || clock.startedSec < 0)) || (clock.playerVisible !== undefined && typeof clock.playerVisible !== 'boolean'))) {
        throw new EngineError('часы нити: нужно положительное целое число сегментов, заполнение в их пределах и корректное время начала');
      }
      return;
    }
    case 'threadFront': {
      if (!threads[patch.id]) throw missing('thread', patch.id);
      const front = patch.front;
      if (!front) return;
      if (front.source !== 'dungeon-world-srd:fronts') throw new EngineError('фронт: неизвестен источник структуры');
      if (front.type !== 'adventure' && front.type !== 'campaign') throw new EngineError('фронт: неизвестный масштаб');
      if (!Array.isArray(front.dangers) || front.dangers.length < 2 || front.dangers.length > 3) throw new EngineError('фронт: нужно 2–3 опасности');
      if (!Array.isArray(front.stakes) || front.stakes.length < 1 || front.stakes.length > 3 || front.stakes.some(x => typeof x !== 'string' || !x.trim())) throw new EngineError('фронт: нужно 1–3 непустых вопроса о ставках');
      const dangerIds = new Set<string>();
      const portentIds = new Set<string>();
      let portentCount = 0;
      for (const danger of front.dangers) {
        if (!danger || typeof danger.id !== 'string' || !danger.id || dangerIds.has(danger.id)) throw new EngineError('фронт: опасности должны иметь уникальные id');
        dangerIds.add(danger.id);
        if (typeof danger.name !== 'string' || !danger.name.trim() || typeof danger.impulse !== 'string' || !danger.impulse.trim() || typeof danger.impendingDoom !== 'string' || !danger.impendingDoom.trim()) throw new EngineError(`фронт: опасность ${danger.id} требует имя, стремление и неотвратимую беду`);
        if (!Array.isArray(danger.portents)) throw new EngineError(`фронт: у опасности ${danger.id} нет списка мрачных знаков`);
        for (const portent of danger.portents) {
          if (!portent || typeof portent.id !== 'string' || !portent.id || portentIds.has(portent.id) || typeof portent.text !== 'string' || !portent.text.trim() || typeof portent.fulfilled !== 'boolean') throw new EngineError(`фронт: мрачные знаки ${danger.id} должны иметь уникальные id, текст и состояние`);
          portentIds.add(portent.id);
          portentCount++;
        }
        if (danger.resolution !== undefined && (typeof danger.resolution.text !== 'string' || !danger.resolution.text.trim() || !Number.isSafeInteger(danger.resolution.atSec) || danger.resolution.atSec < 0 || danger.portents.some((portent: { fulfilled: boolean }) => !portent.fulfilled))) {
          throw new EngineError(`фронт: исход опасности ${danger.id} можно записать только после всех мрачных знаков`);
        }
      }
      const min = front.type === 'adventure' ? 1 : 3;
      const max = front.type === 'adventure' ? 3 : 5;
      if (portentCount < min || portentCount > max) throw new EngineError(`фронт: для этого масштаба нужно ${min}–${max} мрачных знака`);
      if (front.cast !== undefined && (!Array.isArray(front.cast) || front.cast.some(x => typeof x !== 'string' || !x.trim()))) throw new EngineError('фронт: состав должен содержать непустые имена');
      return;
    }
    case 'location':
      if (!locations[patch.id]) throw missing('location', patch.id);
      if (patch.field === 'haven' && typeof patch.value !== 'boolean') throw new EngineError(`Haven места должен быть да или нет`);
      return;
    case 'locationGeo': {
      if (!locations[patch.id]) throw missing('location', patch.id);
      const geo = patch.geo;
      if (geo && (typeof geo.map !== 'string' || !geo.map.trim() || !Number.isFinite(geo.x) || !Number.isFinite(geo.y) || geo.x < 0 || geo.y < 0
        || (geo.r !== undefined && (!Number.isFinite(geo.r) || geo.r <= 0))
        || (geo.ry !== undefined && (!Number.isFinite(geo.ry) || geo.ry <= 0)))) {
        throw new EngineError('геопривязка места требует карту и неотрицательные координаты');
      }
      return;
    }
    case 'population':
      if (!locations[patch.id]) throw missing('location', patch.id);
      if (patch.value !== null && (!Number.isSafeInteger(patch.value) || patch.value < 0)) throw new EngineError('население поселения — неотрицательное целое число или null');
      return;
    case 'order':
      if (!locations[patch.id]) throw missing('location', patch.id);
      if (patch.value !== null && (!Number.isInteger(patch.value) || patch.value < 0 || patch.value > 10)) throw new EngineError('порядок поселения — целое от 0 до 10 или null');
      return;
    case 'kingdomOrder':
      if (!patch.kingdomId.trim()) throw new EngineError('порядок державы: пустой id');
      if (patch.value !== null && (!Number.isInteger(patch.value) || patch.value < 0 || patch.value > 10)) throw new EngineError('порядок державы — целое от 0 до 10 или null');
      if (patch.value !== null && !patch.source.trim()) throw new EngineError('порядок державы требует источник значения');
      return;
    case 'relation':
      if (!factions[patch.id]) throw missing('faction', patch.id);
      if (!factions[patch.other]) throw missing('faction', patch.other);
      if (patch.id === patch.other) throw new EngineError('отношение фракции к самой себе не ведётся');
      if (!Number.isInteger(patch.value) || Math.abs(patch.value) > 3) throw new EngineError(`отношение фракций — целое от −3 до +3, получено ${patch.value}`);
      return;
    case 'price':
      if (!locations[patch.id]) throw missing('location', patch.id);
      if (!GOODS.includes(patch.goods)) throw new EngineError(`нет такого товара: ${String(patch.goods)}`);
      if (!Number.isFinite(patch.value) || patch.value <= -100) throw new EngineError(`надбавка к цене больше −100%, получено ${patch.value}`);
      return;
    case 'stock':
      if (!locations[patch.id]) throw missing('location', patch.id);
      if (!GOODS.includes(patch.goods)) throw new EngineError(`нет такого товара: ${String(patch.goods)}`);
      if (patch.value !== null && !(Number.isFinite(patch.value) && patch.value >= 0 && (patch.goods === 'food' || patch.value <= 10))) {
        throw new EngineError(`запас — от 0 (еда — дней, остальное — до 10), получено ${patch.value}`);
      }
      return;
    case 'encounter':
      if (!locations[patch.id]) throw missing('location', patch.id);
      if (!patch.key.trim()) throw new EngineError('вес встречи без того, кто встречается');
      if (!Number.isFinite(patch.value) || patch.value < 0) throw new EngineError(`вес встречи — не меньше нуля, получено ${patch.value}`);
      return;
    case 'newLocation': {
      const l = patch.location;
      if (!l?.id || !l.name?.trim()) throw new EngineError('новое место без id или имени');
      if (locations[l.id]) throw new EngineError(`место ${l.id} уже есть`);
      if (l.parentId !== undefined && !locations[l.parentId]) throw missing('location', l.parentId);
      return;
    }
    case 'territoryControl': {
      if (!patch.placeId.trim()) throw new EngineError('контроль территории: пустой id места');
      if (!Object.values(locations).some(location => location.scale === 'settlement' && location.ref === `place:${patch.placeId}`)) {
        throw missing('campaign settlement for place', patch.placeId);
      }
      const war = state.world.processes?.[patch.warProcessId];
      const data = war?.data as { kind?: string; sideA?: { id?: string; name?: string }; sideB?: { id?: string; name?: string }; front?: { nodes?: readonly { id?: string }[] } } | undefined;
      if (!war || war.kind !== 'war' || war.ended || !['campaign', 'protracted'].includes(war.stage) || data?.kind !== 'war'
        || !data.front?.nodes?.some(node => node.id === patch.placeId)) {
        throw new EngineError('контроль территории можно менять только на поселении активного принятого фронта');
      }
      if (patch.controller && (!patch.controller.kingdomId.trim() || !patch.controller.kingdomName.trim())) {
        throw new EngineError('контроль территории: нужны id и имя державы');
      }
      if (patch.controller && ![data.sideA, data.sideB].some(side => side?.id === patch.controller!.kingdomId && side.name === patch.controller!.kingdomName)) {
        throw new EngineError('контроль территории: держава не участвует в выбранной войне');
      }
      return;
    }
    case 'settlementPolity': {
      const location = locations[patch.locationId];
      if (!location || location.scale !== 'settlement') throw missing('campaign settlement', patch.locationId);
      if (patch.value && (patch.value.status !== 'independent' || !patch.value.separatedFrom.kingdomId.trim()
        || !patch.value.separatedFrom.kingdomName.trim() || !Number.isSafeInteger(patch.value.atSec)
        || !patch.value.source.trim())) throw new EngineError('статус города требует державу, секунду и источник');
      return;
    }
    case 'removeLocation':
      if (!locations[patch.id]) throw missing('location', patch.id);
      if (Object.values(locations).some(l => l.parentId === patch.id)) throw new EngineError(`в месте ${patch.id} есть другие места — не убирается`);
      return;
    case 'newFaction': {
      const f = patch.faction;
      if (!f?.id || !f.name?.trim()) throw new EngineError('новая фракция без id или имени');
      if (factions[f.id]) throw new EngineError(`фракция ${f.id} уже есть`);
      if (!Number.isInteger(f.renown)) throw new EngineError(`известность — целое число, получено ${f.renown}`);
      return;
    }
    case 'removeFaction':
      if (!factions[patch.id]) throw missing('faction', patch.id);
      return;
    case 'newThread': {
      const t = patch.thread;
      if (!t?.id || !t.name?.trim()) throw new EngineError('новая нить без id или имени');
      if (threads[t.id]) throw new EngineError(`нить ${t.id} уже есть`);
      return;
    }
    case 'removeThread':
      if (!threads[patch.id]) throw missing('thread', patch.id);
      return;
    case 'settlementPlan': {
      const plan=patch.plan;
      if (!plan || typeof plan.locationId!=='string' || !Object.hasOwn(locations,plan.locationId)) throw new EngineError('место плана не найдено');
      const location=locations[plan.locationId];
      if (location.scale!=='settlement') throw new EngineError('план можно закрепить только у поселения');
      if (plan.settingPackageId!==(state.settingPackageId??DEFAULT_SETTING_PACKAGE)) throw new EngineError('план другого сеттинга');
      if (typeof plan.mapId!=='string' || !plan.mapId || plan.mapId.length>256 || (location.geo && location.geo.map!==plan.mapId)) throw new EngineError('карта источника плана не совпадает');
      try { validateSettlementDraft(plan.draft); } catch (e) { throw new EngineError(`неверный план: ${e instanceof Error?e.message:String(e)}`); }
      if (plan.draft.placeId!==(location.ref??location.id)) throw new EngineError('геометрия другого места');
      return;
    }
    case 'removeSettlementPlan':
      if (!state.world.settlementPlans?.[patch.id]) throw missing('settlement plan',patch.id);
      return;
    case 'importedContent': {
      const content = patch.content;
      if (!content?.id || !content.name?.trim() || !content.sourceFile || !content.sourceFormat) throw new EngineError('импортированная запись без id, имени или источника');
      if (!['character', 'monster', 'mechanic', 'dungeon', 'location', 'scene', 'token', 'adventure'].includes(content.kind)) throw new EngineError(`неизвестный вид импортированной записи: ${String(content.kind)}`);
      if (!['foundry', '5etools', 'uvtt', 'maptool', 'json'].includes(content.sourceFormat)) throw new EngineError(`неизвестный формат импорта: ${String(content.sourceFormat)}`);
      if (!content.data || typeof content.data !== 'object' || Array.isArray(content.data)) throw new EngineError('данные импорта должны быть JSON-объектом');
      if (JSON.stringify(content.data).length > 1_000_000) throw new EngineError('импортированная запись больше 1 МБ');
      if (content.kind === 'adventure') parseAdventureBundle(content.data);
      if (state.world.importedContent?.[content.id]) throw new EngineError(`импортированная запись ${content.id} уже есть`);
      return;
    }
    case 'removeImportedContent':
      if (!state.world.importedContent?.[patch.id]) throw missing('imported content', patch.id);
      return;
    case 'homebrewMechanicRuntime': {
      const { binding } = patch;
      const error = homebrewMechanicRuntimeBindingError(state, binding);
      if (error) throw new EngineError(error);
      if (state.world.activeHomebrewMechanics?.[binding.contentId]) throw new EngineError(`runtime-связка для ${binding.contentId} уже существует`);
      return;
    }
    case 'removeHomebrewMechanicRuntime':
      if (!state.world.activeHomebrewMechanics?.[patch.id]) throw missing('HB runtime-механику', patch.id);
      return;
    case 'adventureSession': {
      const session = patch.session;
      if (!session?.id?.trim() || !session.title?.trim()) throw new EngineError('запуск приключения без id или названия');
      const previous = state.world.adventureSessions?.[session.id];
      let bundle: ReturnType<typeof parseAdventureBundle>;
      if (!previous) {
        const content = state.world.importedContent?.[session.contentId];
        if (!content || content.kind !== 'adventure') throw new EngineError('для запуска сначала примите приключение в каталог');
        bundle = parseAdventureBundle(content.data);
        if (!session.graph || JSON.stringify(session.graph) !== JSON.stringify(bundle)) throw new EngineError('граф активной сессии должен точно сохранять принятый пакет со связями и источниками');
      } else {
        if (previous.contentId !== session.contentId) throw new EngineError('id запуска уже занят другим пакетом');
        bundle = parseAdventureBundle(session.graph);
        if (JSON.stringify(previous.graph) !== JSON.stringify(bundle)) throw new EngineError('граф активной сессии нельзя заменить после запуска');
      }
      if (session.id !== bundle.id || session.title !== bundle.title || session.distribution !== bundle.distribution) throw new EngineError('паспорт запуска не совпадает с пакетом приключения');
      if (!PACKAGE_INDEX.some(entry => entry.id === bundle.setting && entry.kind === 'setting') || bundle.rules.some(id => !PACKAGE_INDEX.some(entry => entry.id === id && entry.kind === 'rules'))) throw new EngineError('для запуска не подключены указанные сеттинг и правила');
      if (session.settingPackageId !== bundle.setting || session.settingPackageId !== (state.settingPackageId ?? DEFAULT_SETTING_PACKAGE)) throw new EngineError('сеттинг приключения не совпадает с кампанией');
      if (!Array.isArray(session.rulesPackageIds) || JSON.stringify(session.rulesPackageIds) !== JSON.stringify(bundle.rules)) throw new EngineError('пакеты правил запуска не совпадают с приключением');
      if (!Array.isArray(session.partyIds) || bundle.rules.length > 0 && !session.partyIds.length || new Set(session.partyIds).size !== session.partyIds.length || session.partyIds.some(id => !state.party.includes(id) || !state.actors[id] || state.actors[id].removed)) throw new EngineError('для запуска с выбранными правилами нужна действующая партия');
      if (bundle.nodes.find(node => node.id === session.entrySceneId)?.kind !== 'scene') throw new EngineError('точка запуска должна быть сценой пакета');
      if (session.resolvedProposalIds !== undefined && (!Array.isArray(session.resolvedProposalIds) || new Set(session.resolvedProposalIds).size !== session.resolvedProposalIds.length || session.resolvedProposalIds.some(id => typeof id !== 'string' || !bundle.nodes.some(node => node.id === id && node.kind === 'proposal')))) throw new EngineError('отмеченные исходы должны ссылаться на уникальные предложения пакета');
      if (session.routeStates !== undefined) {
        if (!session.routeStates || typeof session.routeStates !== 'object' || Array.isArray(session.routeStates)) throw new EngineError('состояния маршрутов должны быть словарём');
        for (const [routeId, routeState] of Object.entries(session.routeStates)) {
          if (!bundle.nodes.some(node => node.id === routeId && node.kind === 'route')) throw new EngineError(`состояние ссылается на неизвестный маршрут ${routeId}`);
          if (!routeState || (routeState.status !== 'open' && routeState.status !== 'closed') || typeof routeState.causeId !== 'string' || !routeState.causeId.trim() || typeof routeState.reason !== 'string' || routeState.reason.length > 240 || !Number.isSafeInteger(routeState.proposedSec) || routeState.proposedSec < 0 || routeState.proposedSec > state.time.sec) throw new EngineError(`некорректное состояние маршрута ${routeId}`);
        }
      }
      if (!state.facts[session.secretFactId]) throw missing('fact', session.secretFactId);
      if (!Number.isFinite(session.startedSec) || session.startedSec > state.time.sec) throw new EngineError('время запуска не может быть в будущем');
      if (session.status !== 'active' && session.status !== 'resolved') throw new EngineError('неизвестное состояние запуска');
      if (previous?.status === 'resolved' && session.status === 'active') throw new EngineError('завершённый запуск нельзя открыть патчем');
      return;
    }
    case 'removeAdventureSession':
      if (!state.world.adventureSessions?.[patch.id]) throw missing('adventure session', patch.id);
      return;
    case 'process': {
      const pr = patch.process;
      if (!pr?.id || !pr.kind || !pr.name?.trim() || !pr.stage) throw new EngineError('процесс без id, вида, имени или стадии');
      if (!Number.isFinite(pr.nextSec) || !Number.isFinite(pr.startedSec)) throw new EngineError(`процесс ${pr.id}: такт и начало — секунды`);
      if (Object.values(pr.vars ?? {}).some(v => !Number.isFinite(v))) throw new EngineError(`процесс ${pr.id}: счётчики — числа`);
      if (pr.clock && (!isProgressValue(pr.clock) || (pr.clock.playerVisible !== undefined && typeof pr.clock.playerVisible !== 'boolean') || (pr.clock.playerLabel !== undefined && (!pr.clock.playerLabel.trim() || pr.clock.playerLabel.length > 120)) || (pr.clock.playerVisible && !pr.clock.playerLabel?.trim()))) throw new EngineError(`процесс ${pr.id}: часы требуют делений в пределах и подпись до 120 знаков, если они открыты игрокам`);
      return;
    }
    case 'epidemicExposure': {
      const location = locations[patch.locationId];
      const exposure = patch.exposure;
      const template = patch.template;
      const templateData = template?.data as { kind?: string; disease?: string; ruleVersion?: string; treatmentPerDay?: number; treatmentTemples?: number } | undefined;
      if (!location || location.scale !== 'settlement') throw missing('campaign settlement', patch.locationId);
      if (!exposure.id.trim() || !Number.isSafeInteger(exposure.incubationDays) || exposure.incubationDays < 0 || exposure.incubationDays > 4
        || !Number.isSafeInteger(exposure.treatmentPerDay) || exposure.treatmentPerDay < 0
        || !Number.isSafeInteger(exposure.treatmentTemples) || exposure.treatmentTemples < 0
        || !exposure.treatmentSource.trim()) throw new EngineError('заражение каравана: повреждены данные инкубации или лечения');
      if (!template || template.kind !== 'epidemic' || template.at !== patch.locationId || !template.id
        || templateData?.kind !== 'epidemic' || !templateData.disease || templateData.treatmentPerDay !== exposure.treatmentPerDay
        || templateData?.treatmentTemples !== exposure.treatmentTemples
        || templateData?.ruleVersion !== 'dm-cockpit-urban/3'
        || Object.values(template.vars).some(value => !Number.isFinite(value))) throw new EngineError('заражение каравана: нет шаблона вспышки версии 3');
      const duplicate = Object.values(state.world.processes ?? {}).some(process => {
        const data = process.data as { disease?: string; exposureIds?: readonly string[] } | undefined;
        if (process.kind !== 'epidemic' || process.at !== patch.locationId || data?.disease !== templateData.disease) return false;
        const ids = data?.exposureIds ?? [];
        return ids.includes(exposure.id);
      });
      if (duplicate) throw new EngineError(`заражение ${exposure.id} уже учтено`);
      return;
    }
    case 'epidemicExposureRestore': {
      const location = locations[patch.locationId];
      if (!location || location.scale !== 'settlement') throw missing('campaign settlement', patch.locationId);
      if (!patch.disease.trim() || patch.processes.some(process => process.kind !== 'epidemic' || process.at !== patch.locationId
        || (process.data as { disease?: string } | undefined)?.disease !== patch.disease)) throw new EngineError('откат заражения содержит чужой процесс');
      return;
    }
    case 'epidemicState': {
      const current = state.world.processes?.[patch.base.id];
      if (!current || current.kind !== 'epidemic' || patch.process.id !== patch.base.id || patch.process.kind !== 'epidemic'
        || patch.base.kind !== 'epidemic' || Object.values(patch.process.vars).some(value => !Number.isFinite(value))) {
        throw new EngineError('такт эпидемии относится к отсутствующему или повреждённому процессу');
      }
      return;
    }
    case 'removeProcess':
      if (!state.world.processes?.[patch.id]) throw missing('process', patch.id);
      return;
    case 'newFact': {
      if (!patch.fact.id.trim() || !patch.fact.text.trim()) throw new EngineError('факт: нужны id и текст');
      if (state.facts[patch.fact.id]) throw new EngineError(`факт ${patch.fact.id} уже есть`);
      if (patch.fact.visibility !== 'dm' && patch.fact.visibility !== 'players') throw new EngineError('факт: неизвестная видимость');
      if (patch.fact.subjectId && !locations[patch.fact.subjectId]) throw missing('location', patch.fact.subjectId);
      return;
    }
    case 'removeFact':
      if (!state.facts[patch.id]) throw missing('fact', patch.id);
      return;
    case 'batch': {
      // Части проверяются по порядку — каждая против мира после предыдущих: «завести процесс и сразу сдвинуть цены».
      if (patch.patches.some(x => x.kind === 'batch')) throw new EngineError('составной патч внутри составного не ведётся');
      let s = state;
      for (const x of patch.patches) { checkPatch(s, x); s = produce(s, d => writePatch(d, x)); }
      return;
    }
  }
}

/** Текущее значение поля, которое патч перепишет, — в форме того же патча: это снимок «было». */
function readPatch(state: State, patch: WorldPatch): WorldPatch {
  const { factions, locations, threads } = state.world;
  switch (patch.kind) {
    case 'faction': return { ...patch, value: factions[patch.id][patch.field] ?? 0 };
    case 'location':
      return patch.field === 'danger'
        ? { ...patch, value: locations[patch.id].danger ?? 'low' }
        : patch.field === 'haven'
          ? { ...patch, value: locations[patch.id].haven ?? false }
          : { ...patch, value: locations[patch.id].pricePercent ?? 0 };
    case 'locationGeo': return { ...patch, geo: locations[patch.id].geo ? structuredClone(locations[patch.id].geo!) : null };
    case 'population': return { ...patch, value: locations[patch.id].population ?? null };
    case 'order': return { ...patch, value: locations[patch.id].order ?? null };
    case 'kingdomOrder': {
      const current = state.world.kingdomOrder?.[patch.kingdomId];
      return { ...patch, value: current?.value ?? null, source: current?.source ?? patch.source };
    }
    case 'thread': return { ...patch, status: threads[patch.id].status };
    case 'threadClock': return { ...patch, clock: threads[patch.id].clock ? structuredClone(threads[patch.id].clock!) : null };
    case 'threadFront': return { ...patch, front: threads[patch.id].front ? structuredClone(threads[patch.id].front!) : null };
    case 'relation': return { ...patch, value: factions[patch.id].relations?.[patch.other] ?? 0 };
    case 'price': return { ...patch, value: locations[patch.id].prices?.[patch.goods] ?? 0 };
    case 'stock': return { ...patch, value: locations[patch.id].stock?.[patch.goods] ?? null };
    case 'encounter': return { ...patch, value: locations[patch.id].encounters?.[patch.key] ?? 1 };
    // До нового места его не было — откат убирает его; убранное место возвращается целиком.
    case 'newLocation': return { kind: 'removeLocation', id: patch.location.id };
    case 'removeLocation': return { kind: 'newLocation', location: structuredClone(locations[patch.id]) };
    case 'territoryControl': return {
      ...patch,
      controller: state.world.territoryControl?.[patch.placeId]
        ? structuredClone(state.world.territoryControl[patch.placeId])
        : null,
    };
    case 'settlementPolity': return {
      ...patch,
      value: state.world.settlementPolity?.[patch.locationId]
        ? structuredClone(state.world.settlementPolity[patch.locationId])
        : null,
    };
    case 'newFaction': return { kind: 'removeFaction', id: patch.faction.id };
    case 'removeFaction': return { kind: 'newFaction', faction: structuredClone(factions[patch.id]) };
    case 'newThread': return { kind: 'removeThread', id: patch.thread.id };
    case 'removeThread': return { kind: 'newThread', thread: structuredClone(threads[patch.id]) };
    case 'settlementPlan': return state.world.settlementPlans?.[patch.plan.locationId]
      ? {kind:'settlementPlan',plan:structuredClone(state.world.settlementPlans[patch.plan.locationId])}
      : {kind:'removeSettlementPlan',id:patch.plan.locationId};
    case 'removeSettlementPlan': return {kind:'settlementPlan',plan:structuredClone(state.world.settlementPlans![patch.id])};
    case 'importedContent': return { kind: 'removeImportedContent', id: patch.content.id };
    case 'removeImportedContent': return { kind: 'importedContent', content: structuredClone(state.world.importedContent![patch.id]) };
    case 'homebrewMechanicRuntime': return { kind: 'removeHomebrewMechanicRuntime', id: patch.binding.contentId };
    case 'removeHomebrewMechanicRuntime': return { kind: 'homebrewMechanicRuntime', binding: structuredClone(state.world.activeHomebrewMechanics![patch.id]) };
    case 'adventureSession': {
      const previous = state.world.adventureSessions?.[patch.session.id];
      return previous ? { kind: 'adventureSession', session: structuredClone(previous) } : { kind: 'removeAdventureSession', id: patch.session.id };
    }
    case 'removeAdventureSession': return { kind: 'adventureSession', session: structuredClone(state.world.adventureSessions![patch.id]) };
    case 'process': {
      const was = state.world.processes?.[patch.process.id];
      return was ? { kind: 'process', process: structuredClone(was) } : { kind: 'removeProcess', id: patch.process.id };
    }
    case 'epidemicExposure': return {
      kind: 'epidemicExposureRestore', locationId: patch.locationId,
      disease: String((patch.template.data as { disease?: string } | undefined)?.disease ?? ''),
      processes: Object.values(state.world.processes ?? {}).filter(process => process.kind === 'epidemic' && process.at === patch.locationId
        && (process.data as { disease?: string } | undefined)?.disease === (patch.template.data as { disease?: string } | undefined)?.disease).map(process => structuredClone(process)),
    };
    case 'epidemicExposureRestore': return {
      kind: 'epidemicExposureRestore', locationId: patch.locationId, disease: patch.disease,
      processes: Object.values(state.world.processes ?? {}).filter(process => process.kind === 'epidemic' && process.at === patch.locationId
        && (process.data as { disease?: string } | undefined)?.disease === patch.disease).map(process => structuredClone(process)),
    };
    case 'epidemicState': {
      const current = state.world.processes![patch.base.id]!;
      return { kind: 'epidemicState', base: structuredClone(patch.process), process: structuredClone(current) };
    }
    case 'removeProcess': return { kind: 'process', process: structuredClone(state.world.processes![patch.id]) };
    case 'newFact': return { kind: 'removeFact', id: patch.fact.id };
    case 'removeFact': return { kind: 'newFact', fact: structuredClone(state.facts[patch.id]) };
    case 'batch': {
      // Снимок «было» — по ходу применения частей, откат — в обратном порядке: так возвращаются и поле, которое
      // две части пишут подряд, и процесс, заведённый и сдвинутый одним принятием.
      const back: WorldPatch[] = [];
      let s = state;
      for (const x of patch.patches) { back.unshift(readPatch(s, x)); s = produce(s, d => writePatch(d, x)); }
      return { kind: 'batch', patches: back };
    }
  }
}

/** Route clearance is a read dependency for caravan proposals, even though the result writes other fields. */
function caravanRouteDependencies(patch: WorldPatch): WorldReadDependency[] {
  const dependencies = new Map<string, WorldReadDependency>();
  const visit = (part: WorldPatch) => {
    if (part.kind === 'batch') { part.patches.forEach(visit); return; }
    if (part.kind !== 'process' || part.process.kind !== 'caravan') return;
    const route = part.process.data?.route as { nodes?: unknown } | undefined;
    if (!Array.isArray(route?.nodes)) return;
    for (const placeId of route.nodes) {
      if (typeof placeId !== 'string' || !placeId) continue;
      dependencies.set(placeId, { kind: 'caravan-route-clearance', placeId });
    }
  };
  visit(patch);
  return [...dependencies.values()].sort((a, b) => a.placeId.localeCompare(b.placeId));
}

function snapshotReadDependencies(state: State, dependencies: readonly WorldReadDependency[]) {
  return dependencies.map(dependency => ({
    dependency,
    value: JSON.stringify(caravanRouteClearanceSnapshot(state, dependency.placeId)),
  }));
}

export type WorldDeltaFreshness = { current: true } | { current: false; message: string };

/** Compare reducer-captured write fields and semantic read dependencies against the current world. */
export function worldDeltaFreshness(state: State, delta: WorldDelta): WorldDeltaFreshness {
  if (!delta.patch) return { current: true };
  if (!delta.patchBase) return {
    current: false,
    message: 'У предложения нет снимка исходных полей; результат нельзя принять — пересчитайте предложение на текущих данных.',
  };
  let writeCurrent = false;
  try {
    writeCurrent = JSON.stringify(readPatch(state, delta.patch)) === JSON.stringify(delta.patchBase);
  } catch {
    // A removed target is stale too; the user must recalculate against the current world.
  }
  const expectedDependencies = caravanRouteDependencies(delta.patch);
  const capturedDependencies = delta.readDependencies ?? [];
  const capturedReadBase = delta.readBase ?? [];
  const sameDependencies = capturedDependencies.length === expectedDependencies.length
    && expectedDependencies.every((dependency, index) => capturedDependencies[index]?.kind === dependency.kind
      && capturedDependencies[index]?.placeId === dependency.placeId);
  let readMessage: string | undefined;
  if (expectedDependencies.length && (!sameDependencies || capturedReadBase.length !== expectedDependencies.length)) {
    readMessage = 'У предложения нет полного снимка условий маршрута каравана; отклоните и пересчитайте результат на текущих данных.';
  } else if (expectedDependencies.length) {
    const currentReadBase = snapshotReadDependencies(state, expectedDependencies);
    const sameReadBase = currentReadBase.length === capturedReadBase.length
      && currentReadBase.every((snapshot, index) => capturedReadBase[index]?.dependency.kind === snapshot.dependency.kind
        && capturedReadBase[index]?.dependency.placeId === snapshot.dependency.placeId
        && capturedReadBase[index]?.value === snapshot.value);
    if (!sameReadBase) {
      readMessage = 'Условия маршрута каравана устарели: изменилась блокада или фронт. Старый результат нельзя принять — отклоните и пересчитайте его.';
    }
  } else if (capturedDependencies.length || capturedReadBase.length) {
    readMessage = 'Снимок условий маршрута не соответствует предложению; отклоните и пересчитайте результат.';
  }
  if (writeCurrent && !readMessage) return { current: true };
  const fields = new Set<string>();
  const collect = (patch: WorldPatch) => {
    if (patch.kind === 'batch') { patch.patches.forEach(collect); return; }
    if (patch.kind === 'price') fields.add('цены товаров');
    else if (patch.kind === 'stock') fields.add('запаса товаров');
    else fields.add('мировых данных');
  };
  collect(delta.patch);
  const messages = [
    ...(!writeCurrent ? [`Устарели ${[...fields].join(' и ')} после расчёта. Пересчитайте результат и подтвердите новое предложение.`] : []),
    ...(readMessage ? [readMessage] : []),
  ];
  return { current: false, message: messages.join(' ') };
}

function writePatch(draft: State, patch: WorldPatch): void {
  const { factions, locations, threads } = draft.world;
  switch (patch.kind) {
    case 'faction': factions[patch.id][patch.field] = patch.value; return;
    case 'location':
      if (patch.field === 'danger') locations[patch.id].danger = patch.value;
      else if (patch.field === 'haven') locations[patch.id].haven = patch.value;
      else locations[patch.id].pricePercent = patch.value;
      return;
    case 'locationGeo':
      if (patch.geo) locations[patch.id].geo = structuredClone(patch.geo);
      else delete locations[patch.id].geo;
      return;
    case 'population': if (patch.value === null) delete locations[patch.id].population; else locations[patch.id].population = patch.value; return;
    case 'order': if (patch.value === null) delete locations[patch.id].order; else locations[patch.id].order = patch.value; return;
    case 'kingdomOrder': {
      const kingdomOrder = { ...draft.world.kingdomOrder };
      if (patch.value === null) delete kingdomOrder[patch.kingdomId];
      else kingdomOrder[patch.kingdomId] = { value: patch.value, source: patch.source };
      if (Object.keys(kingdomOrder).length) draft.world.kingdomOrder = kingdomOrder;
      else delete draft.world.kingdomOrder;
      return;
    }
    case 'thread': threads[patch.id].status = patch.status; return;
    case 'threadClock':
      if (patch.clock) threads[patch.id].clock = structuredClone(patch.clock);
      else delete threads[patch.id].clock;
      return;
    case 'threadFront':
      if (patch.front) threads[patch.id].front = structuredClone(patch.front);
      else delete threads[patch.id].front;
      return;
    case 'relation':
      // Отношение симметрично: 0 — запись не хранится, как и у фракций без отношений.
      for (const [a, b] of [[patch.id, patch.other], [patch.other, patch.id]] as const) {
        const rel = { ...factions[a].relations };
        if (patch.value === 0) delete rel[b]; else rel[b] = patch.value;
        if (Object.keys(rel).length) factions[a].relations = rel;
        else delete factions[a].relations;
      }
      return;
    case 'price': {
      const prices = { ...locations[patch.id].prices };
      if (patch.value === 0) delete prices[patch.goods]; else prices[patch.goods] = patch.value;
      // Пусто — поля нет, как до первой надбавки: откат возвращает запись точно.
      if (Object.keys(prices).length) locations[patch.id].prices = prices; else delete locations[patch.id].prices;
      return;
    }
    case 'stock': {
      const stock = { ...locations[patch.id].stock };
      if (patch.value === null) delete stock[patch.goods]; else stock[patch.goods] = patch.value;
      if (Object.keys(stock).length) locations[patch.id].stock = stock; else delete locations[patch.id].stock;
      return;
    }
    case 'encounter': {
      const enc = { ...locations[patch.id].encounters };
      if (patch.value === 1) delete enc[patch.key]; else enc[patch.key] = patch.value;
      if (Object.keys(enc).length) locations[patch.id].encounters = enc; else delete locations[patch.id].encounters;
      return;
    }
    case 'newLocation': locations[patch.location.id] = castDraft(structuredClone(patch.location)); return;
    case 'removeLocation': delete locations[patch.id]; return;
    case 'territoryControl': {
      const territoryControl = { ...draft.world.territoryControl };
      if (patch.controller) territoryControl[patch.placeId] = castDraft(structuredClone(patch.controller));
      else delete territoryControl[patch.placeId];
      if (Object.keys(territoryControl).length) draft.world.territoryControl = territoryControl;
      else delete draft.world.territoryControl;
      return;
    }
    case 'settlementPolity': {
      const records = { ...draft.world.settlementPolity };
      if (patch.value) records[patch.locationId] = castDraft(structuredClone(patch.value));
      else delete records[patch.locationId];
      if (Object.keys(records).length) draft.world.settlementPolity = records;
      else delete draft.world.settlementPolity;
      return;
    }
    case 'newFaction': factions[patch.faction.id] = castDraft(structuredClone(patch.faction)); return;
    case 'removeFaction': delete factions[patch.id]; return;
    case 'newThread': threads[patch.thread.id] = castDraft(structuredClone(patch.thread)); return;
    case 'removeThread': delete threads[patch.id]; return;
    case 'settlementPlan': (draft.world.settlementPlans ??= {})[patch.plan.locationId] = castDraft(structuredClone(patch.plan)); return;
    case 'removeSettlementPlan': if(draft.world.settlementPlans) delete draft.world.settlementPlans[patch.id]; return;
    case 'importedContent': (draft.world.importedContent ??= {})[patch.content.id] = castDraft(structuredClone(patch.content)); return;
    case 'removeImportedContent': if (draft.world.importedContent) delete draft.world.importedContent[patch.id]; return;
    case 'homebrewMechanicRuntime': (draft.world.activeHomebrewMechanics ??= {})[patch.binding.contentId] = castDraft(structuredClone(patch.binding)); return;
    case 'removeHomebrewMechanicRuntime': if (draft.world.activeHomebrewMechanics) delete draft.world.activeHomebrewMechanics[patch.id]; return;
    case 'adventureSession': (draft.world.adventureSessions ??= {})[patch.session.id] = castDraft(structuredClone(patch.session)); return;
    case 'removeAdventureSession': if (draft.world.adventureSessions) delete draft.world.adventureSessions[patch.id]; return;
    case 'process': (draft.world.processes ??= {})[patch.process.id] = castDraft(structuredClone(patch.process)); return;
    case 'removeProcess': if (draft.world.processes) delete draft.world.processes[patch.id]; return;
    case 'epidemicExposure': {
      const processes = draft.world.processes ??= {};
      const disease = (patch.template.data as { disease?: string } | undefined)?.disease;
      const current = Object.values(processes).filter(process => process.kind === 'epidemic' && process.at === patch.locationId && !process.ended
        && (process.data as { disease?: string } | undefined)?.disease === disease)
        .sort((a, b) => a.id.localeCompare(b.id))[0];
      if (!current) {
        processes[patch.template.id] = castDraft(structuredClone(patch.template));
        return;
      }
      const data = { ...(current.data ?? {}) } as Record<string, unknown>;
      const ids = [...((data.exposureIds as readonly string[] | undefined) ?? []), patch.exposure.id];
      const previousRule = data.ruleVersion;
      if (previousRule !== 'dm-cockpit-urban/3') {
        const templateData = patch.template.data ?? {};
        data.ruleVersion = 'dm-cockpit-urban/3';
        data.ruleSource = `${String(data.ruleSource ?? 'legacy urban epidemic')} → ${String((templateData as Record<string, unknown>).ruleSource ?? 'caravan exposure')}`;
        data.treatmentPerDay = patch.exposure.treatmentPerDay;
        data.treatmentTemples = patch.exposure.treatmentTemples;
        data.treatmentSource = patch.exposure.treatmentSource;
      }
      data.exposureIds = ids;
      const vars = { ...current.vars };
      vars.susceptible = Math.max(0, (vars.susceptible ?? 0) - 1);
      if (patch.exposure.incubationDays === 0) vars.infected = (vars.infected ?? 0) + 1;
      else {
        const bucket = `incubating${patch.exposure.incubationDays}`;
        vars[bucket] = (vars[bucket] ?? 0) + 1;
      }
      processes[current.id] = castDraft({
        ...current,
        stage: (vars.infected ?? 0) > 0 ? 'outbreak' : 'incubation',
        nextSec: Math.min(current.nextSec, patch.template.nextSec),
        vars,
        data,
      });
      return;
    }
    case 'epidemicExposureRestore': {
      const processes = draft.world.processes ??= {};
      for (const process of Object.values(processes)) {
        if (process.kind === 'epidemic' && process.at === patch.locationId
          && (process.data as { disease?: string } | undefined)?.disease === patch.disease) delete processes[process.id];
      }
      for (const process of patch.processes) processes[process.id] = castDraft(structuredClone(process));
      if (!Object.keys(processes).length) delete draft.world.processes;
      return;
    }
    case 'epidemicState': {
      const processes = draft.world.processes!;
      const current = processes[patch.base.id]!;
      const vars = { ...patch.process.vars };
      const dynamicKeys = ['population', 'susceptible', 'infected', 'recovered', 'dead', 'days', 'incubating1', 'incubating2', 'incubating3', 'incubating4'];
      for (const key of dynamicKeys) {
        const value = (current.vars[key] ?? 0) + (patch.process.vars[key] ?? 0) - (patch.base.vars[key] ?? 0);
        if (value > 0.0005 || key === 'days') vars[key] = Math.max(0, value);
        else delete vars[key];
      }
      const exposed = [1, 2, 3, 4].reduce((sum, days) => sum + (vars[`incubating${days}`] ?? 0), 0);
      const outbreakStillActive = (vars.infected ?? 0) >= 0.5 || exposed >= 0.5;
      const ended = patch.process.ended === true && !outbreakStillActive ? true : outbreakStillActive ? false : patch.process.ended;
      processes[patch.base.id] = castDraft({
        ...current,
        stage: ended ? 'ended' : (vars.infected ?? 0) >= 0.5 ? 'outbreak' : exposed >= 0.5 ? 'incubation' : patch.process.stage,
        ended,
        nextSec: patch.process.nextSec,
        vars,
      });
      return;
    }
    case 'newFact': draft.facts[patch.fact.id] = castDraft(structuredClone(patch.fact)); return;
    case 'removeFact': delete draft.facts[patch.id]; return;
    case 'batch': for (const x of patch.patches) writePatch(draft, x); return;
  }
}

/** Патч мира вне лога: симуляция прогоняет такты процесса на рабочей копии (процессы видят свои же последствия). */
export function applyWorldPatch(state: State, patch: WorldPatch): State {
  checkPatch(state, patch);
  return produce(state, d => writePatch(d, patch));
}

/** Применяет событие; для компенсаций — восстанавливает записанный след. */
function applyInventoryCommand(
  state: State,
  event: Extract<import('./events').Command, { type: 'ITEM_GAINED' | 'COINS_EXCHANGED' | 'ITEM_LOST' | 'ITEM_MOVED' | 'ITEM_TRANSFERRED' | 'ITEM_GIFTED' | 'PERSON_ITEM_GIFTED' | 'TRADE_COMPLETED' | 'ATTUNEMENT_CHANGED' | 'ITEM_EQUIPPED' | 'ITEM_UNEQUIPPED' }>,
  eventId?: string,
): { state: State; effect: Effect } {
  const stackId = event.type === 'ITEM_GAINED' ? event.payload.stack.id : event.type === 'TRADE_COMPLETED' ? event.payload.itemStackId : event.payload.stackId;
  const ids = new Set<string>([stackId]);
  if (event.type === 'COINS_EXCHANGED') ids.add(event.payload.receiveStackId);
  if ((event.type === 'ITEM_MOVED' || event.type === 'ITEM_TRANSFERRED' || event.type === 'ITEM_GIFTED' || event.type === 'PERSON_ITEM_GIFTED') && event.payload.splitStackId) ids.add(event.payload.splitStackId);
  if (event.type === 'TRADE_COMPLETED') {
    if (event.payload.itemSplitStackId) ids.add(event.payload.itemSplitStackId);
    for (const payment of event.payload.payments) {
      ids.add(payment.stackId);
      if (payment.splitStackId) ids.add(payment.splitStackId);
    }
  }
  const actorIds = new Set<string>();
  const beforeForId = (id: string) => state.inventory?.[id] ? structuredClone(state.inventory[id]) : undefined;
  for (const id of ids) {
    const stack = beforeForId(id);
    if (stack?.owner.kind === 'actor') actorIds.add(stack.owner.id);
  }
  if (event.type === 'ITEM_GAINED' && event.payload.stack.owner.kind === 'actor') actorIds.add(event.payload.stack.owner.id);
  if (event.type === 'ITEM_TRANSFERRED' && event.payload.owner.kind === 'actor') actorIds.add(event.payload.owner.id);
  if (event.type === 'ITEM_GIFTED') actorIds.add(event.payload.recipientId);
  if (event.type === 'PERSON_ITEM_GIFTED') actorIds.add(event.payload.giverId);
  if (event.type === 'TRADE_COMPLETED') {
    if (event.payload.seller.kind === 'actor') actorIds.add(event.payload.seller.id);
    if (event.payload.buyer.kind === 'actor') actorIds.add(event.payload.buyer.id);
  }
  if (event.type === 'ATTUNEMENT_CHANGED' && event.payload.actorId) actorIds.add(event.payload.actorId);
  if (event.type === 'ITEM_EQUIPPED' || event.type === 'ITEM_UNEQUIPPED') actorIds.add(event.payload.actorId);
  const actorsBefore = [...actorIds].flatMap(actorId => state.actors[actorId] && (state.actors[actorId].sheet || (event.type === 'ITEM_GIFTED' && actorId === event.payload.recipientId))
    ? [{ actorId, actor: structuredClone(state.actors[actorId]) }] : []);
  const inventoryPresentBefore = state.inventory !== undefined;
  const personGiftBefore = event.type === 'PERSON_ITEM_GIFTED' && state.personGifts?.[event.payload.personId]
    ? structuredClone(state.personGifts[event.payload.personId]) : undefined;
  const offerBefore = event.type === 'TRADE_COMPLETED' && event.payload.offerId
    ? state.tradeOffers?.[event.payload.offerId] ? structuredClone(state.tradeOffers[event.payload.offerId]) : undefined
    : undefined;
  const stacksBefore = [...ids].map(id => ({ id, ...(beforeForId(id) ? { stack: beforeForId(id) } : {}) }));

  const next = produce(state, draft => {
    const inventory = (draft.inventory ??= {});
    switch (event.type) {
      case 'ITEM_GAINED':
        inventory[event.payload.stack.id] = castDraft(structuredClone(event.payload.stack));
        break;
      case 'COINS_EXCHANGED': {
        const p = event.payload;
        const stack = inventory[p.stackId]!;
        const source = structuredClone(current(stack));
        if (p.qty === stack.qty) delete inventory[p.stackId];
        else stack.qty -= p.qty;
        inventory[p.receiveStackId] = castDraft({
          id: p.receiveStackId, itemId: p.toCoinId, qty: p.toQty,
          owner: source.owner, storage: source.storage,
          ...(source.visibility ? { visibility: source.visibility } : {}),
        });
        break;
      }
      case 'ITEM_LOST': {
        const p = event.payload;
        const stack = inventory[p.stackId]!;
        if (p.qty === stack.qty) delete inventory[p.stackId];
        else stack.qty -= p.qty;
        break;
      }
      case 'ITEM_MOVED': {
        const p = event.payload;
        const stack = inventory[p.stackId]!;
        if (p.qty === stack.qty) {
          stack.storage = castDraft(structuredClone(p.to));
          delete stack.wornAs;
        }
        else {
          stack.qty -= p.qty;
          const split = { ...structuredClone(current(stack)), id: p.splitStackId!, qty: p.qty, storage: castDraft(structuredClone(p.to)) };
          delete split.wornAs;
          inventory[p.splitStackId!] = split;
        }
        break;
      }
      case 'ITEM_TRANSFERRED': {
        const p = event.payload;
        const stack = inventory[p.stackId]!;
        if (p.qty === stack.qty) {
          stack.owner = castDraft(structuredClone(p.owner));
          stack.storage = castDraft(structuredClone(p.to));
          delete stack.wornAs;
        } else {
          stack.qty -= p.qty;
          const split = { ...structuredClone(current(stack)), id: p.splitStackId!, qty: p.qty, owner: castDraft(structuredClone(p.owner)), storage: castDraft(structuredClone(p.to)) };
          delete split.wornAs;
          inventory[p.splitStackId!] = split;
        }
        break;
      }
      case 'ITEM_GIFTED': {
        const p = event.payload;
        const stack = inventory[p.stackId]!;
        const owner = { kind: 'actor' as const, id: p.recipientId };
        if (p.qty === stack.qty) {
          stack.owner = owner;
          stack.storage = { kind: 'actor', id: p.recipientId };
          delete stack.wornAs;
        } else {
          stack.qty -= p.qty;
          const split = { ...structuredClone(current(stack)), id: p.splitStackId!, qty: p.qty, owner, storage: { kind: 'actor' as const, id: p.recipientId } };
          delete split.wornAs;
          inventory[p.splitStackId!] = split;
        }
        const recipient = draft.actors[p.recipientId]!;
        recipient.social = { ...(recipient.social ?? { attitude: 'indifferent' as const }), giftAtSec: state.time.sec };
        break;
      }
      case 'PERSON_ITEM_GIFTED': {
        const p = event.payload;
        const stack = inventory[p.stackId]!;
        const original = structuredClone(current(stack));
        if (p.qty === stack.qty) delete inventory[p.stackId];
        else stack.qty -= p.qty;
        const previous = draft.personGifts?.[p.personId];
        const history = [...(previous?.history ?? []), {
          eventId: eventId ?? '', giverId: p.giverId, giverName: state.actors[p.giverId].name,
          itemId: original.itemId, qty: p.qty, sec: state.time.sec, ...(p.note ? { note: p.note.trim() } : {}),
        }];
        (draft.personGifts ??= {})[p.personId] = { giftAtSec: state.time.sec, history };
        break;
      }
      case 'TRADE_COMPLETED': {
        const p = event.payload;
        const transfer = (id: string, qty: number, owner: InventoryOwner, splitStackId?: string) => {
          const stack = inventory[id]!;
          const original = structuredClone(current(stack));
          const storage = storageForOwner(owner);
          if (qty === stack.qty) {
            stack.owner = castDraft(structuredClone(owner));
            stack.storage = castDraft(storage);
            delete stack.wornAs;
            delete stack.attunedTo;
          } else {
            stack.qty -= qty;
            const split: InventoryStack = { ...original, id: splitStackId!, qty, owner: structuredClone(owner), storage };
            delete split.wornAs;
            delete split.attunedTo;
            inventory[splitStackId!] = castDraft(split);
          }
        };
        transfer(p.itemStackId, p.itemQty, p.buyer, p.itemSplitStackId);
        for (const payment of p.payments) transfer(payment.stackId, payment.qty, p.seller, payment.splitStackId);
        if (p.offerId) draft.tradeOffers![p.offerId].status = 'completed';
        break;
      }
      case 'ATTUNEMENT_CHANGED': {
        const p = event.payload;
        const stack = inventory[p.stackId]!;
        if (p.actorId === undefined) delete stack.attunedTo;
        else stack.attunedTo = p.actorId;
        break;
      }
      case 'ITEM_EQUIPPED':
        inventory[event.payload.stackId]!.wornAs = event.payload.wornAs;
        break;
      case 'ITEM_UNEQUIPPED':
        delete inventory[event.payload.stackId]!.wornAs;
        break;
    }
    for (const actorId of actorIds) {
      const actor = draft.actors[actorId];
      if (actor?.sheet) draft.actors[actorId] = castDraft(withActorInventory(current(actor), current(inventory)));
    }
  });

  const inventoryPresentAfter = next.inventory !== undefined;
  const stacksAfter = [...ids].map(id => ({ id, ...(next.inventory?.[id] ? { stack: structuredClone(next.inventory[id]) } : {}) }));
  const stacks = ids.size ? [...ids].map(id => ({ id, ...(stacksBefore.find(x => x.id === id)?.stack ? { before: stacksBefore.find(x => x.id === id)!.stack } : {}), ...(stacksAfter.find(x => x.id === id)?.stack ? { after: stacksAfter.find(x => x.id === id)!.stack } : {}) })) : [];
  const actors = actorsBefore.map(({ actorId, actor }) => ({ actorId, before: actor, after: structuredClone(next.actors[actorId]) }));
  if (event.type === 'PERSON_ITEM_GIFTED') {
    return {
      state: next,
      effect: {
        kind: 'person-gift', inventoryPresent: { before: inventoryPresentBefore, after: inventoryPresentAfter }, stacks, actors,
        personId: event.payload.personId, ...(personGiftBefore ? { before: personGiftBefore } : {}),
        after: structuredClone(next.personGifts?.[event.payload.personId]),
      },
    };
  }
  return {
    state: next,
    effect: { kind: 'inventory', inventoryPresent: { before: inventoryPresentBefore, after: inventoryPresentAfter }, stacks, actors,
      ...(offerBefore ? { offer: { id: offerBefore.id, before: offerBefore, after: structuredClone(next.tradeOffers![offerBefore.id]) } } : {}) },
  };
}

export function apply(state: State, event: DomainEvent): { state: State; effect: Effect } {
  if (event.undoes || event.redoes) {
    if (!event.effect) throw new EngineError(`компенсация ${event.id} без следа`);
    return { state: applyEffect(state, event.effect), effect: event.effect };
  }
  validate(state, event);
  if (event.type === 'INVENTORY_CONTAINER_CREATED' || event.type === 'INVENTORY_CONTAINER_REMOVED') {
    const containersPresentBefore = state.inventoryContainers !== undefined;
    const container = event.type === 'INVENTORY_CONTAINER_CREATED'
      ? (event.payload as PayloadByType['INVENTORY_CONTAINER_CREATED']).container
      : state.inventoryContainers![(event.payload as PayloadByType['INVENTORY_CONTAINER_REMOVED']).containerId]!;
    const removing = event.type === 'INVENTORY_CONTAINER_REMOVED';
    const before = removing ? structuredClone(container) : undefined;
    const after = event.type === 'INVENTORY_CONTAINER_CREATED' ? structuredClone(container) : undefined;
    const next = produce(state, draft => {
      if (!removing) (draft.inventoryContainers ??= {})[container.id] = castDraft(structuredClone(container));
      else if (draft.inventoryContainers) delete draft.inventoryContainers[container.id];
      if (removing && draft.inventoryContainers && Object.keys(draft.inventoryContainers).length === 0) delete draft.inventoryContainers;
    });
    return { state: next, effect: { kind: 'inventory-container', containersPresent: { before: containersPresentBefore, after: next.inventoryContainers !== undefined }, id: container.id, ...(before ? { before } : {}), ...(after ? { after } : {}) } };
  }
  if (event.type === 'TRADE_OFFER_CREATED' || event.type === 'TRADE_OFFER_WITHDRAWN') {
    const offerId = event.type === 'TRADE_OFFER_CREATED'
      ? (event.payload as PayloadByType['TRADE_OFFER_CREATED']).offerId
      : (event.payload as PayloadByType['TRADE_OFFER_WITHDRAWN']).offerId;
    const beforePresent = state.tradeOffers !== undefined;
    const before = state.tradeOffers?.[offerId] ? structuredClone(state.tradeOffers[offerId]) : undefined;
    const next = produce(state, draft => {
      const offers = (draft.tradeOffers ??= {});
      if (event.type === 'TRADE_OFFER_CREATED') {
        const p = event.payload as PayloadByType['TRADE_OFFER_CREATED'];
        offers[offerId] = { id: offerId, trade: castDraft(structuredClone(p.trade)), status: 'open', createdSec: event.worldSec };
      } else {
        offers[offerId].status = 'withdrawn';
      }
    });
    const after = next.tradeOffers?.[offerId] ? structuredClone(next.tradeOffers[offerId]) : undefined;
    return { state: next, effect: { kind: 'trade-offer', id: offerId, offersPresent: { before: beforePresent, after: next.tradeOffers !== undefined }, ...(before ? { before } : {}), ...(after ? { after } : {}) } };
  }
  if (event.type === 'TRANSPORT_CREATED' || event.type === 'TRANSPORT_REMOVED') {
    const transportsPresentBefore = state.transports !== undefined;
    const transport = event.type === 'TRANSPORT_CREATED'
      ? (event.payload as PayloadByType['TRANSPORT_CREATED']).transport
      : state.transports![(event.payload as PayloadByType['TRANSPORT_REMOVED']).transportId]!;
    const removing = event.type === 'TRANSPORT_REMOVED';
    const before = removing ? structuredClone(transport) : undefined;
    const after = removing ? undefined : structuredClone(transport);
    const next = produce(state, draft => {
      if (!removing) (draft.transports ??= {})[transport.id] = castDraft(structuredClone(transport));
      else if (draft.transports) delete draft.transports[transport.id];
      if (removing && draft.transports && Object.keys(draft.transports).length === 0) delete draft.transports;
    });
    return { state: next, effect: { kind: 'transport', transportsPresent: { before: transportsPresentBefore, after: next.transports !== undefined }, id: transport.id, ...(before ? { before } : {}), ...(after ? { after } : {}) } };
  }
  if (event.type === 'ITEM_GAINED' || event.type === 'COINS_EXCHANGED' || event.type === 'ITEM_LOST' || event.type === 'ITEM_MOVED' || event.type === 'ITEM_TRANSFERRED' || event.type === 'ITEM_GIFTED' || event.type === 'PERSON_ITEM_GIFTED' || event.type === 'TRADE_COMPLETED' || event.type === 'ATTUNEMENT_CHANGED' || event.type === 'ITEM_EQUIPPED' || event.type === 'ITEM_UNEQUIPPED') {
    return applyInventoryCommand(state, event as unknown as Extract<import('./events').Command, { type: 'ITEM_GAINED' | 'COINS_EXCHANGED' | 'ITEM_LOST' | 'ITEM_MOVED' | 'ITEM_TRANSFERRED' | 'ITEM_GIFTED' | 'PERSON_ITEM_GIFTED' | 'TRADE_COMPLETED' | 'ATTUNEMENT_CHANGED' | 'ITEM_EQUIPPED' | 'ITEM_UNEQUIPPED' }>, event.id);
  }
  let effect: Effect = { kind: 'none' };
  const next = produce(state, draft => {
    const touchThreads = (ids: readonly string[]): ThreadTouchSnapshot[] => [...new Set(ids)].flatMap(id => {
      const thread = draft.world.threads[id];
      if (!thread) return [];
      const before = thread.lastTouchedSec;
      const after = Math.max(before, event.worldSec);
      if (after > before) thread.lastTouchedSec = after;
      return [{ id, before, after }];
    });
    switch (event.type) {
      case 'DAMAGE_APPLIED': {
        const p = event.payload as PayloadByType['DAMAGE_APPLIED'];
        const a = draft.actors[p.targetId];
        const before = hpSnap(a.hp);
        // Временные хиты уходят первыми (SRD): остаток бьёт по настоящим, ниже нуля не бывает.
        const fromTemp = Math.min(a.hp.temp, p.amount);
        a.hp.temp -= fromTemp;
        a.hp.current = Math.max(0, a.hp.current - (p.amount - fromTemp));
        effect = { kind: 'hp', targetId: p.targetId, before, after: hpSnap(a.hp) };
        break;
      }
      case 'HEALING_APPLIED': {
        const p = event.payload as PayloadByType['HEALING_APPLIED'];
        const a = draft.actors[p.targetId];
        const before = hpSnap(a.hp);
        a.hp.current = Math.min(a.hp.max, a.hp.current + p.amount);
        effect = { kind: 'hp', targetId: p.targetId, before, after: hpSnap(a.hp) };
        break;
      }
      case 'TEMP_HP_GRANTED': {
        const p = event.payload as PayloadByType['TEMP_HP_GRANTED'];
        const a = draft.actors[p.targetId];
        const before = hpSnap(a.hp);
        // Не складываются: остаётся большее из имеющегося и нового (SRD).
        a.hp.temp = Math.max(a.hp.temp, p.amount);
        effect = { kind: 'hp', targetId: p.targetId, before, after: hpSnap(a.hp) };
        break;
      }
      case 'CONDITION_ADDED': {
        const p = event.payload as PayloadByType['CONDITION_ADDED'];
        const a = draft.actors[p.targetId];
        const before = a.conditions[p.conditionId] ? { ...a.conditions[p.conditionId] } : undefined;
        if (p.conditionId === 'exhaustion') {
          // Уровнями, не тумблером: явный уровень ставится, без уровня — плюс один, потолок 6.
          const level = p.level ?? Math.min(EXHAUSTION_MAX_LEVEL, (before?.level ?? 0) + 1);
          a.conditions.exhaustion = { level };
        } else {
          const snap: ConditionSnapshot = {};
          if (p.until !== undefined) snap.until = p.until;
          if (p.untilSec !== undefined) snap.untilSec = p.untilSec;
          a.conditions[p.conditionId] = snap;
        }
        effect = { kind: 'condition', targetId: p.targetId, conditionId: p.conditionId, before, after: { ...a.conditions[p.conditionId] } };
        break;
      }
      case 'CONDITION_REMOVED': {
        const p = event.payload as PayloadByType['CONDITION_REMOVED'];
        const a = draft.actors[p.targetId];
        const before = { ...a.conditions[p.conditionId] };
        let after: typeof before | undefined;
        if (p.conditionId === 'exhaustion' && (before.level ?? 1) > 1) {
          // Долгий отдых снимает один уровень (SRD), поэтому снятие — минус уровень.
          after = { level: (before.level ?? 1) - 1 };
          a.conditions.exhaustion = after;
        } else {
          delete a.conditions[p.conditionId];
        }
        effect = { kind: 'condition', targetId: p.targetId, conditionId: p.conditionId, before, after };
        break;
      }
      case 'A5E_TRACK_SET': {
        const p = event.payload as PayloadByType['A5E_TRACK_SET'];
        const a = draft.actors[p.actorId];
        const before = a.a5eConditions?.[p.track];
        const beforeDowntimeRelaxUntilSec = a.a5eDowntimeRelaxUntilSec;
        const beforeStress = a.a5eConditions?.mentalStress ? { ...a.a5eConditions.mentalStress } : undefined;
        const next = { ...(a.a5eConditions ?? {}) };
        if (p.level === 0) delete next[p.track];
        else next[p.track] = p.level;
        if (p.stressEffect) next.mentalStress = p.stressEffect;
        if (Object.keys(next).length > 0) a.a5eConditions = next;
        else delete a.a5eConditions;
        if (p.downtimeRelaxUntilSec !== undefined) a.a5eDowntimeRelaxUntilSec = p.downtimeRelaxUntilSec;
        effect = { kind: 'a5e-track', actorId: p.actorId, track: p.track, before, after: p.level,
          ...(p.stressEffect ? { beforeStress, afterStress: p.stressEffect } : {}),
          ...(p.downtimeRelaxUntilSec !== undefined ? { beforeDowntimeRelaxUntilSec, afterDowntimeRelaxUntilSec: p.downtimeRelaxUntilSec } : {}) };
        break;
      }
      case 'A5E_STRESS_EFFECT_USED': {
        const p = event.payload as PayloadByType['A5E_STRESS_EFFECT_USED'];
        const a = draft.actors[p.actorId];
        const before = a.a5eDistraughtAidUsed;
        a.a5eDistraughtAidUsed = true;
        effect = { kind: 'a5e-stress-use', actorId: p.actorId, before, after: true };
        break;
      }
      case 'A5E_PRESTIGE_UPDATED': {
        const p = event.payload as PayloadByType['A5E_PRESTIGE_UPDATED'];
        const a = draft.actors[p.actorId];
        const before = a.a5ePrestige ? structuredClone(a.a5ePrestige) : undefined;
        const after = structuredClone(p.profile);
        a.a5ePrestige = {
          ...(after.centerLocationId !== undefined ? { centerLocationId: after.centerLocationId } : {}),
          awards: after.awards.map(award => ({ ...award })),
        };
        effect = { kind: 'a5e-prestige', actorId: p.actorId, before, after };
        break;
      }
      case 'CAMPAIGN_REST_LAYER_SET': {
        const p = event.payload as PayloadByType['CAMPAIGN_REST_LAYER_SET'];
        const before = state.restLayer;
        draft.restLayer = p.layer;
        effect = { kind: 'rest-layer', before, after: p.layer };
        break;
      }
      case 'CAMPAIGN_STRESS_THEME_SET': {
        const p = event.payload as PayloadByType['CAMPAIGN_STRESS_THEME_SET'];
        const before = state.a5eStrifeEnabled;
        draft.a5eStrifeEnabled = p.enabled;
        effect = { kind: 'stress-theme', before, after: p.enabled };
        break;
      }
      case 'CAMPAIGN_SETTING_PACKAGE_SET': {
        const p = event.payload as PayloadByType['CAMPAIGN_SETTING_PACKAGE_SET'];
        const before = state.settingPackageId;
        const beforeRoot = state.settingRootId;
        const navigation = settingNavigationFor(p.packageId, state.world.locations);
        const locationTouches: { id: string; before?: Location; after?: Location }[] = [];
        for (const location of navigation.locations) {
          const existing = draft.world.locations[location.id];
          if (existing && (existing.name !== location.name || existing.scale !== location.scale || (existing.parentId && existing.parentId !== location.parentId))) {
            throw new EngineError(`конфликт корневого места сеттинга: ${location.id}`);
          }
          const after = existing ? {
            ...existing,
            ...(!existing.parentId && location.parentId ? { parentId: location.parentId } : {}),
            ...(!existing.ref && location.ref ? { ref: location.ref } : {}),
            ...(!existing.geo && location.geo ? { geo: location.geo } : {}),
          } : location;
          if (!existing || existing.parentId !== after.parentId || existing.ref !== after.ref || existing.geo !== after.geo) {
            draft.world.locations[location.id] = after;
            locationTouches.push({
              id: location.id,
              ...(existing ? { before: structuredClone(existing) } : {}),
              after: structuredClone(after),
            });
          }
        }
        draft.settingPackageId = p.packageId;
        if (navigation.rootId) draft.settingRootId = navigation.rootId;
        else delete draft.settingRootId;
        effect = { kind: 'setting-package', before, after: p.packageId, beforeRoot, afterRoot: navigation.rootId, ...(locationTouches.length ? { locations: locationTouches } : {}) };
        break;
      }
      case 'CAMPAIGN_CREATED':
        effect = { kind: 'none' };
        break;
      case 'TURN_ADVANCED': {
        const p = event.payload as PayloadByType['TURN_ADVANCED'];
        const e = draft.encounter;
        const before = {
          round: e.round, turnIndex: e.turnIndex, actorId: e.active ? e.order[e.turnIndex] ?? null : null,
          ...(e.lairPhaseVersion !== undefined ? { lairPhaseVersion: e.lairPhaseVersion } : {}),
          ...(e.lairActionWindow ? { lairActionWindow: { ...e.lairActionWindow } } : {}),
          ...(e.lairActionWindowPassedRound !== undefined ? { lairActionWindowPassedRound: e.lairActionWindowPassedRound } : {}),
        };
        e.active = true;
        e.round = p.round;
        e.turnIndex = p.turnIndex;
        if (p.lairPhaseVersion !== undefined) e.lairPhaseVersion = p.lairPhaseVersion;
        else delete e.lairPhaseVersion;
        if (p.lairActionWindow) e.lairActionWindow = { ...p.lairActionWindow };
        else delete e.lairActionWindow;
        if (p.lairActionWindowPassedRound !== undefined) e.lairActionWindowPassedRound = p.lairActionWindowPassedRound;
        else delete e.lairActionWindowPassedRound;
        effect = { kind: 'turn', before, after: {
          round: p.round, turnIndex: p.turnIndex, actorId: p.actorId,
          ...(p.lairPhaseVersion !== undefined ? { lairPhaseVersion: p.lairPhaseVersion } : {}),
          ...(p.lairActionWindow ? { lairActionWindow: { ...p.lairActionWindow } } : {}),
          ...(p.lairActionWindowPassedRound !== undefined ? { lairActionWindowPassedRound: p.lairActionWindowPassedRound } : {}),
        } };
        break;
      }
      case 'TIME_ADVANCED': {
        const p = event.payload as PayloadByType['TIME_ADVANCED'];
        const before = draft.time.sec;
        draft.time.sec = p.toSec;
        draft.time.tempo = p.tempo;
        effect = { kind: 'time', before, after: p.toSec };
        break;
      }
      case 'WORLD_DELTA_ACCEPTED':
      case 'WORLD_DELTA_REJECTED': {
        const p = event.payload as { deltaId: string };
        const d = draft.deltas[p.deltaId];
        // Патч — из исходного состояния, не из черновика: в след события уходит обычный объект, а не прокси Immer.
        const patch = event.type === 'WORLD_DELTA_ACCEPTED' ? state.deltas[p.deltaId].patch : undefined;
        const before = { status: d.status, now: d.now, cause: d.cause, variantId: d.variantId, ...(patch ? { world: readPatch(state, patch) } : {}) };
        d.status = event.type === 'WORLD_DELTA_ACCEPTED' ? 'accepted' : 'rejected';
        // Принятие меняет числа мира: пока мастер не решил, в мире стояло старое значение (CLAUDE.md «Правила экрана»).
        if (patch) writePatch(draft, patch);
        const threadIds = state.deltas[p.deltaId].threadIds ?? (state.world.threads[state.deltas[p.deltaId].causeId] ? [state.deltas[p.deltaId].causeId] : []);
        const threads = touchThreads(threadIds);
        effect = { kind: 'delta', deltaId: p.deltaId, before, after: { status: d.status, now: d.now, cause: d.cause, variantId: d.variantId, ...(patch ? { world: patch } : {}) }, ...(threads.length ? { threads } : {}) };
        break;
      }
      case 'WORLD_DELTA_REROLLED': {
        const p = event.payload as PayloadByType['WORLD_DELTA_REROLLED'];
        const d = draft.deltas[p.deltaId];
        // Причина — в снимке: у базового варианта (variantId пуст) её иначе не восстановить при откате переброса.
        const before = { status: d.status, now: d.now, cause: d.cause, variantId: d.variantId };
        const v = d.variants!.find(x => x.id === p.variantId)!;
        d.now = v.now;
        d.cause = v.cause;
        d.variantId = v.id;
        effect = { kind: 'delta', deltaId: p.deltaId, before, after: { status: d.status, now: d.now, cause: d.cause, variantId: d.variantId } };
        break;
      }
      case 'FACT_REVEALED': {
        const p = event.payload as PayloadByType['FACT_REVEALED'];
        const f = draft.facts[p.factId];
        const before = f.visibility;
        f.visibility = 'players';
        const threads = touchThreads(state.facts[p.factId].threadIds ?? []);
        effect = { kind: 'fact', factId: p.factId, before, after: 'players', ...(threads.length ? { threads } : {}) };
        break;
      }
      case 'NOTE_ADDED': {
        const p = event.payload as PayloadByType['NOTE_ADDED'];
        const threads = touchThreads(p.threadIds);
        effect = { kind: 'note', noteId: event.id, ...(threads.length ? { threads } : {}) };
        break;
      }
      case 'TIMELINE_PLAN_CREATED': {
        const plan = (event.payload as PayloadByType['TIMELINE_PLAN_CREATED']).plan;
        const beforePresent = draft.world.timelinePlans !== undefined;
        const after: TimelinePlanRecord = { ...structuredClone(plan), status: 'active' };
        (draft.world.timelinePlans ??= {})[plan.id] = castDraft(structuredClone(after));
        effect = { kind: 'timeline-plan', id: plan.id, plansPresent: { before: beforePresent, after: true }, after };
        break;
      }
      case 'TIMELINE_PLAN_CANCELLED': {
        const id = (event.payload as PayloadByType['TIMELINE_PLAN_CANCELLED']).planId;
        const before = structuredClone(state.world.timelinePlans![id]);
        const after: TimelinePlanRecord = { ...before, status: 'cancelled' };
        draft.world.timelinePlans![id] = castDraft(structuredClone(after));
        effect = { kind: 'timeline-plan', id, plansPresent: { before: true, after: true }, before, after };
        break;
      }
      case 'A5E_DOWNTIME_PROJECT_UPDATED': {
        const p = event.payload as PayloadByType['A5E_DOWNTIME_PROJECT_UPDATED'];
        const before = state.a5eDowntimeProjects?.[p.project.id];
        (draft.a5eDowntimeProjects ??= {})[p.project.id] = castDraft(structuredClone(p.project));
        let sheet: Extract<Effect, { kind: 'a5e-downtime-project' }>['sheet'];
        if (p.project.activity === 'train' && p.project.status === 'succeeded') {
          const actor = draft.actors[p.project.actorId];
          const actorBefore = state.actors[p.project.actorId];
          const beforeSnapshot = sheetSnap(actorBefore);
          const afterSnapshot: SheetSnapshot = {
            ...beforeSnapshot,
            sheet: {
              ...structuredClone(beforeSnapshot.sheet),
              trainedLanguages: [...(beforeSnapshot.sheet.trainedLanguages ?? []), {
                id: p.project.training.languageId,
                name: p.project.training.languageName,
                source: 'a5e-srd:adventuring-8',
              }],
            },
          };
          putSheet(actor, afterSnapshot);
          sheet = { actorId: actor.id, before: beforeSnapshot, after: afterSnapshot };
        }
        effect = { kind: 'a5e-downtime-project', projectId: p.project.id, ...(before ? { before: structuredClone(before) } : {}), after: structuredClone(p.project), ...(sheet ? { sheet } : {}) };
        break;
      }
      case 'A5E_KEY_KNOWLEDGE_EARNED': {
        const p = event.payload as PayloadByType['A5E_KEY_KNOWLEDGE_EARNED'];
        const actor = draft.actors[p.actorId];
        const before = actor.a5eKeyKnowledge?.[p.subjectRef];
        const after = (before ?? 0) + p.amount;
        const next = { ...(actor.a5eKeyKnowledge ?? {}) };
        next[p.subjectRef] = after;
        actor.a5eKeyKnowledge = next;
        effect = { kind: 'a5e-key-knowledge', actorId: p.actorId, subjectRef: p.subjectRef, ...(before !== undefined ? { before } : {}), after };
        break;
      }
      case 'A5E_KEY_KNOWLEDGE_SPENT': {
        const p = event.payload as PayloadByType['A5E_KEY_KNOWLEDGE_SPENT'];
        const actor = draft.actors[p.actorId];
        const before = actor.a5eKeyKnowledge?.[p.subjectRef] ?? 0;
        const after = before - 1;
        const next = { ...(actor.a5eKeyKnowledge ?? {}) };
        if (after > 0) next[p.subjectRef] = after;
        else delete next[p.subjectRef];
        if (Object.keys(next).length) actor.a5eKeyKnowledge = next;
        else delete actor.a5eKeyKnowledge;
        effect = { kind: 'a5e-key-knowledge', actorId: p.actorId, subjectRef: p.subjectRef, before, ...(after > 0 ? { after } : {}) };
        break;
      }
      case 'A5E_FAVOR_EARNED': {
        const p = event.payload as PayloadByType['A5E_FAVOR_EARNED'];
        const actor = draft.actors[p.actorId];
        const before = actor.a5eFavor?.[p.deityRef];
        const after = (before ?? 0) + p.amount;
        const next = { ...(actor.a5eFavor ?? {}) };
        next[p.deityRef] = after;
        actor.a5eFavor = next;
        effect = { kind: 'a5e-favor', actorId: p.actorId, deityRef: p.deityRef, ...(before !== undefined ? { before } : {}), after };
        break;
      }
      case 'A5E_FAVOR_SPENT': {
        const p = event.payload as PayloadByType['A5E_FAVOR_SPENT'];
        const actor = draft.actors[p.actorId];
        const before = actor.a5eFavor?.[p.deityRef] ?? 0;
        const after = before - p.amount;
        const next = { ...(actor.a5eFavor ?? {}) };
        if (after > 0) next[p.deityRef] = after;
        else delete next[p.deityRef];
        if (Object.keys(next).length) actor.a5eFavor = next;
        else delete actor.a5eFavor;
        effect = { kind: 'a5e-favor', actorId: p.actorId, deityRef: p.deityRef, before, ...(after > 0 ? { after } : {}) };
        break;
      }
      case 'A5E_WORK_RESOLVED': {
        const p = event.payload as PayloadByType['A5E_WORK_RESOLVED'];
        const actor = draft.actors[p.actorId];
        const before = [...(actor.a5eWorkDisadvantageSkills ?? [])];
        const next = new Set(before);
        next.delete(p.skill);
        if (p.total <= 5) next.add(p.skill);
        const after = [...next];
        if (after.length) actor.a5eWorkDisadvantageSkills = after;
        else delete actor.a5eWorkDisadvantageSkills;
        effect = { kind: 'a5e-work-disadvantage', actorId: p.actorId, ...(before.length ? { before } : {}), ...(after.length ? { after } : {}) };
        break;
      }
      case 'PARTY_TRAVELED': {
        const p = event.payload as PayloadByType['PARTY_TRAVELED'];
        // Переезжает вся партия, кроме выбывших: место у каждого своё, след — по каждому.
        const actors = state.party.filter(id => !state.actors[id]?.removed).map(actorId => {
          const before = state.actors[actorId].locationId;
          draft.actors[actorId].locationId = p.toId;
          return before === undefined ? { actorId, after: p.toId } : { actorId, before, after: p.toId };
        });
        effect = { kind: 'travel', actors };
        break;
      }
      case 'SUPPLY_CHANGED': {
        const p = event.payload as PayloadByType['SUPPLY_CHANGED'];
        const before = state.supply ?? 0;
        const after = SUPPLY_SPENDS.has(p.reason) ? before - p.amount : before + p.amount;
        draft.supply = after;
        effect = { kind: 'supply', before, after };
        break;
      }
      case 'PLACE_REVEALED': {
        const p = event.payload as PayloadByType['PLACE_REVEALED'];
        draft.world.locations[p.locationId].revealed = true;
        effect = { kind: 'place', locationId: p.locationId, before: false, after: true };
        break;
      }
      case 'CHARACTER_LEVELED': {
        const p = event.payload as PayloadByType['CHARACTER_LEVELED'];
        const a = state.actors[p.actorId];
        const before = sheetSnap(a);
        // Прибавка к максимуму прибавляется и к нынешним хитам: персонаж не теряет хиты оттого, что вырос (правило стола).
        const after = leveledSnapshot(a, p);
        putSheet(draft.actors[p.actorId], after);
        effect = { kind: 'sheet', actorId: p.actorId, before, after };
        break;
      }
      case 'SHEET_EDITED': {
        const p = event.payload as PayloadByType['SHEET_EDITED'];
        const a = state.actors[p.actorId];
        const before = sheetSnap(a);
        const after: SheetSnapshot = { ...before, sheet: { ...structuredClone(before.sheet), ...structuredClone(p.patch) } };
        putSheet(draft.actors[p.actorId], after);
        effect = { kind: 'sheet', actorId: p.actorId, before, after };
        break;
      }
      case 'TOKEN_MOVED': {
        const p = event.payload as PayloadByType['TOKEN_MOVED'];
        // Откуда — со стола, если он знает клетку; иначе со слов MapTool (первый ход после расстановки сида).
        const known = state.actors[p.actorId].cell ?? p.from;
        const before = known ? { x: known.x, y: known.y } : undefined;
        draft.actors[p.actorId].cell = { x: p.to.x, y: p.to.y };
        effect = { kind: 'cell', actorId: p.actorId, before, after: { x: p.to.x, y: p.to.y } };
        break;
      }
      case 'KNOWLEDGE_REVEALED': {
        const p = event.payload as PayloadByType['KNOWLEDGE_REVEALED'];
        const known: KnownFact = { label: p.fact.label, value: p.fact.value, sec: state.time.sec, ...(p.by ? { by: p.by } : {}), ...(p.check ? { check: { ...p.check } } : {}) };
        putKnown(draft, p.ref, p.name, p.fact.label, known);
        effect = { kind: 'knowledge', ref: p.ref, name: p.name, label: p.fact.label, before: null, after: known };
        break;
      }
      case 'DICE_ROLLED':
        effect = { kind: 'none' };
        break;
      case 'NPC_SOCIAL_UPDATED': {
        const p = event.payload as PayloadByType['NPC_SOCIAL_UPDATED'];
        const before = state.actors[p.actorId].social ? structuredClone(state.actors[p.actorId].social) : undefined;
        draft.actors[p.actorId].social = castDraft(structuredClone(p.state));
        effect = { kind: 'npc-social', actorId: p.actorId, before, after: structuredClone(p.state) };
        break;
      }
      case 'PERSON_RELATIONSHIP_UPDATED': {
        const p = event.payload as PayloadByType['PERSON_RELATIONSHIP_UPDATED'];
        const before = state.personRelationships?.[p.personId] ? structuredClone(state.personRelationships[p.personId]) : undefined;
        const next = { ...(state.personRelationships?.[p.personId] ?? {}) };
        if (p.relationship) next[p.targetId] = structuredClone(p.relationship);
        else delete next[p.targetId];
        if (Object.keys(next).length) draft.personRelationships ??= {};
        if (Object.keys(next).length) draft.personRelationships![p.personId] = castDraft(next);
        else if (draft.personRelationships) {
          delete draft.personRelationships[p.personId];
          if (!Object.keys(draft.personRelationships).length) delete draft.personRelationships;
        }
        effect = { kind: 'person-relationships', personId: p.personId, before, after: Object.keys(next).length ? structuredClone(next) : undefined };
        break;
      }
      case 'ENCOUNTER_STARTED': {
        const p = event.payload as PayloadByType['ENCOUNTER_STARTED'];
        const before = encounterSnap(state, p.order.map(o => o.actorId));
        for (const o of p.order) draft.actors[o.actorId].initiative = o.initiative;
        draft.encounter.active = true;
        draft.encounter.round = 1;
        draft.encounter.turnIndex = 0;
        draft.encounter.order = p.order.map(o => o.actorId);
        delete draft.encounter.lairActionsUsed;
        delete draft.encounter.lairActionWindow;
        delete draft.encounter.lairActionWindowPassedRound;
        if (p.lairPhaseVersion === 1) draft.encounter.lairPhaseVersion = 1;
        else delete draft.encounter.lairPhaseVersion;
        if (p.lairContextVersion === 1) {
          draft.encounter.lairContextVersion = 1;
          draft.encounter.lairContextConfirmed = p.lairContextConfirmed === true;
        } else {
          delete draft.encounter.lairContextVersion;
          delete draft.encounter.lairContextConfirmed;
        }
        if (p.lairPhaseVersion === 1 && hasLairActionActor(state, draft.encounter.order) && p.order.every(entry => entry.initiative < 20)) {
          draft.encounter.lairActionWindow = { round: 1, position: 'before-round' };
        }
        if (p.lostFirstRoundActions?.length) draft.encounter.lostFirstRoundActions = [...p.lostFirstRoundActions];
        else delete draft.encounter.lostFirstRoundActions;
        effect = { kind: 'encounter', before, after: encounterSnap(draft, p.order.map(o => o.actorId)) };
        break;
      }
      case 'ENCOUNTER_ENDED': {
        const before = encounterSnap(state);
        for (const id of state.encounter.order) delete draft.actors[id]?.initiative;
        draft.encounter.active = false;
        draft.encounter.round = 0;
        draft.encounter.turnIndex = 0;
        draft.encounter.order = [];
        delete draft.encounter.lostFirstRoundActions;
        delete draft.encounter.lairActionsUsed;
        delete draft.encounter.lairPhaseVersion;
        delete draft.encounter.lairContextVersion;
        delete draft.encounter.lairContextConfirmed;
        delete draft.encounter.lairActionWindow;
        delete draft.encounter.lairActionWindowPassedRound;
        effect = { kind: 'encounter', before, after: encounterSnap(draft, before.order) };
        break;
      }
      case 'LAIR_ACTION_USED': {
        const p = event.payload as PayloadByType['LAIR_ACTION_USED'];
        const before = encounterSnap(state);
        draft.encounter.lairActionsUsed = {
          ...(draft.encounter.lairActionsUsed ?? {}),
          [p.actorId]: { round: p.round, optionId: p.optionId },
        };
        effect = { kind: 'encounter', before, after: encounterSnap(draft) };
        break;
      }
      case 'INITIATIVE_SET': {
        const p = event.payload as PayloadByType['INITIATIVE_SET'];
        const ids = [...new Set([...state.encounter.order, ...p.order.map(o => o.actorId)])];
        const before = encounterSnap(state, ids);
        for (const id of state.encounter.order) if (!p.order.some(o => o.actorId === id)) delete draft.actors[id]?.initiative;
        for (const o of p.order) draft.actors[o.actorId].initiative = o.initiative;
        // Чей ход — сохраняется, если он остался в порядке; иначе ход уходит ближайшему следующему по старому кругу.
        const newOrder = p.order.map(o => o.actorId);
        draft.encounter.order = newOrder;
        if (draft.encounter.lostFirstRoundActions) {
          const stillPresent = draft.encounter.lostFirstRoundActions.filter(id => newOrder.includes(id));
          if (stillPresent.length) draft.encounter.lostFirstRoundActions = stillPresent;
          else delete draft.encounter.lostFirstRoundActions;
        }
        if (state.encounter.active) {
          draft.encounter.turnIndex = nextTurnIndex(state.encounter.order, state.encounter.turnIndex, newOrder);
        }
        effect = { kind: 'encounter', before, after: encounterSnap(draft, ids) };
        break;
      }
      case 'CONCENTRATION_STARTED': {
        const p = event.payload as PayloadByType['CONCENTRATION_STARTED'];
        const a = draft.actors[p.actorId];
        const before = a.concentration ? { ...a.concentration } : undefined;
        // Второе заклинание с концентрацией кончает первое (SRD): слот один.
        a.concentration = p.untilSec === undefined ? { spell: p.spell } : { spell: p.spell, untilSec: p.untilSec };
        effect = { kind: 'concentration', actorId: p.actorId, before, after: { ...a.concentration } };
        break;
      }
      case 'CONCENTRATION_ENDED': {
        const p = event.payload as PayloadByType['CONCENTRATION_ENDED'];
        const a = draft.actors[p.actorId];
        const before = { ...a.concentration! };
        delete a.concentration;
        effect = { kind: 'concentration', actorId: p.actorId, before, after: undefined };
        break;
      }
      case 'ACTOR_SPAWNED': {
        const p = event.payload as PayloadByType['ACTOR_SPAWNED'];
        const enc = encounterSnap(state);
        const partyBefore = [...state.party];
        const inventoryBeforePresent = state.inventory !== undefined;
        const addedStacks = legacyStacksForActor(p.actor).filter(stack => !state.inventory?.[stack.id]);
        const actorInventory = { ...(state.inventory ?? {}), ...Object.fromEntries(addedStacks.map(stack => [stack.id, stack])) };
        const spawnedActor = addedStacks.length ? withActorInventory(structuredClone(p.actor), actorInventory) : structuredClone(p.actor);
        draft.actors[p.actor.id] = castDraft(spawnedActor);
        for (const stack of addedStacks) (draft.inventory ??= {})[stack.id] = castDraft(structuredClone(stack));
        if (p.party && !draft.party.includes(p.actor.id)) draft.party = [...draft.party, p.actor.id];
        effect = {
          kind: 'actor', actorId: p.actor.id, before: undefined, after: structuredClone(spawnedActor) as Actor,
          party: { before: partyBefore, after: [...draft.party] }, encounter: { before: enc, after: enc },
          ...(addedStacks.length ? { inventory: { present: { before: inventoryBeforePresent, after: true }, stacks: addedStacks.map(stack => ({ id: stack.id, before: undefined, after: structuredClone(stack) })) } } : {}),
        };
        break;
      }
      case 'ACTOR_REMOVED': {
        const p = event.payload as PayloadByType['ACTOR_REMOVED'];
        const a = draft.actors[p.actorId];
        const before = structuredClone(state.actors[p.actorId]) as Actor;
        const encBefore = encounterSnap(state);
        const oldTurnIndex = state.encounter.turnIndex;
        const oldAnchorId = state.encounter.order[oldTurnIndex];
        const removedIndex = state.encounter.order.indexOf(p.actorId);
        a.removed = true;
        // Из порядка инициативы выбывает; если ход был его — ход уходит следующему.
        if (state.encounter.order.includes(p.actorId)) {
          const order = state.encounter.order.filter(id => id !== p.actorId);
          draft.encounter.order = order;
          if (state.encounter.active) draft.encounter.turnIndex = nextTurnIndex(state.encounter.order, state.encounter.turnIndex, order);

          if (state.encounter.lairActionWindow) {
            const window = state.encounter.lairActionWindow;
            if (!hasLairActionActor(state, order)) {
              delete draft.encounter.lairActionWindow;
              draft.encounter.lairActionWindowPassedRound = window.round;
              draft.encounter.turnIndex = order.length ? Math.min(draft.encounter.turnIndex, order.length - 1) : 0;
            } else if (p.actorId === oldAnchorId) {
              if (window.position === 'before-round') {
                if (order.every(id => (state.actors[id]?.initiative ?? 0) < 20)) draft.encounter.turnIndex = 0;
                else {
                  // Removing the first low-initiative actor moves the still-pending slot after the high group.
                  delete draft.encounter.lairActionWindow;
                  draft.encounter.turnIndex = 0;
                }
              } else if (window.position === 'after-current') {
                const nextId = state.encounter.order.slice(oldTurnIndex + 1).find(id => order.includes(id));
                if (nextId) {
                  draft.encounter.turnIndex = order.indexOf(nextId);
                  draft.encounter.lairActionWindow = { round: window.round, position: 'before-current' };
                } else {
                  draft.encounter.turnIndex = Math.max(0, order.length - 1);
                  draft.encounter.lairActionWindow = { round: window.round, position: 'after-current' };
                }
              } else {
                const nextLowId = state.encounter.order.slice(oldTurnIndex + 1).find(id => order.includes(id) && (state.actors[id]?.initiative ?? 0) < 20);
                if (nextLowId) {
                  draft.encounter.turnIndex = order.indexOf(nextLowId);
                  draft.encounter.lairActionWindow = { round: window.round, position: 'before-current' };
                } else {
                  draft.encounter.turnIndex = Math.max(0, order.length - 1);
                  draft.encounter.lairActionWindow = { round: window.round, position: 'after-current' };
                }
              }
            }
          } else if (state.encounter.lairPhaseVersion === 1 && state.encounter.lairActionWindowPassedRound !== state.encounter.round
            && removedIndex === oldTurnIndex && (before.initiative ?? 0) >= 20
            && hasLairActionActor(state, order)) {
            const currentId = order[draft.encounter.turnIndex];
            if (currentId && (state.actors[currentId]?.initiative ?? 0) < 20) {
              draft.encounter.lairActionWindow = { round: state.encounter.round, position: 'before-current' };
            }
          }
        }
        effect = { kind: 'actor', actorId: p.actorId, before, after: structuredClone(current(a)) as Actor, party: { before: [...state.party], after: [...draft.party] }, encounter: { before: encBefore, after: encounterSnap(draft, [p.actorId]) } };
        break;
      }
      case 'WORLD_DELTA_PROPOSED': {
        const p = event.payload as PayloadByType['WORLD_DELTA_PROPOSED'];
        const before = state.deltas[p.delta.id] ? structuredClone(state.deltas[p.delta.id]) : undefined;
        const delta = structuredClone(p.delta);
        if (delta.patch) {
          delta.patchBase = readPatch(state, delta.patch);
          const readDependencies = caravanRouteDependencies(delta.patch);
          if (readDependencies.length) {
            delta.readDependencies = readDependencies;
            delta.readBase = snapshotReadDependencies(state, readDependencies);
          } else {
            delete delta.readDependencies;
            delete delta.readBase;
          }
        } else {
          delete delta.patchBase;
          delete delta.readDependencies;
          delete delta.readBase;
        }
        draft.deltas[p.delta.id] = castDraft(delta);
        effect = event.transactionId
          ? { kind: 'delta-proposal', deltaId: p.delta.id, ...(before ? { before } : {}), after: structuredClone(delta) }
          : { kind: 'none' };
        break;
      }
      case 'REST_TAKEN': {
        const p = event.payload as PayloadByType['REST_TAKEN'];
        const a5eAttemptFailed = p.kind === 'long' && p.context?.layer === 'a5e' && !a5eRestCompletes(p.context);
        const sleeplessFailed = new Set(p.context?.a5eSleeplessFailedActorIds ?? []);
        const actors = p.actorIds.map(actorId => {
          const a = draft.actors[actorId];
          const before = restSnap(state.actors[actorId]);
          if (a5eAttemptFailed) return { actorId, before, after: { ...before } };
          if (p.kind === 'long' && !sleeplessFailed.has(actorId)) {
            // Общие эффекты долгого отдыха: хиты, временные, половина костей и ресурсы.
            a.hp.current = a.hp.max;
            a.hp.temp = 0;
            delete a.a5eDistraughtAidUsed;
            const ex = a.conditions.exhaustion?.level;
            // A5E fatigue/strife — отдельные треки; SRD exhaustion остаётся нетронутым.
            const layer = p.context?.layer ?? 'srd';
            if (ex !== undefined && layer === 'srd') {
              if (ex <= 1) delete a.conditions.exhaustion;
              else a.conditions.exhaustion = { ...a.conditions.exhaustion, level: ex - 1 };
            }
            if (layer === 'a5e') {
              // Only new versioned events participate in the cadence rule. Legacy logs replay with their original semantics.
              if (p.context?.a5eCadence === '24h-v1') a.a5eLastLongRestAt = state.time.sec;
              const supplied = p.context?.suppliedActorIds
                ? p.context.suppliedActorIds.includes(actorId)
                : p.context?.supplyConsumed === true;
              const fatigue = a.a5eConditions?.fatigue ?? 0;
              const strife = a.a5eConditions?.strife ?? 0;
              const nextFatigue = !supplied
                ? fatigue + 1
                : p.context?.roughingIt
                  ? fatigue
                  : p.context?.haven
                    ? Math.max(0, fatigue - 1)
                    : fatigue === 1 ? 0 : fatigue;
              const nextStrife = supplied && !p.context?.roughingIt
                ? p.context?.haven ? Math.max(0, strife - 1) : strife === 1 ? 0 : strife
                : strife;
              const a5e = { ...(a.a5eConditions ?? {}) };
              if (nextFatigue > 0) a5e.fatigue = nextFatigue;
              else delete a5e.fatigue;
              if (nextStrife > 0) a5e.strife = nextStrife;
              else delete a5e.strife;
              if (Object.keys(a5e).length) a.a5eConditions = a5e;
              else delete a.a5eConditions;
            }
            if (a.sheet) {
              const regained = layer === 'a5e' && p.context?.roughingIt
                ? hitDiceRegainedRoughingIt(a.sheet.level)
                : hitDiceRegained(a.sheet.level);
              const left = Math.max(0, (a.hitDiceSpent ?? 0) - regained);
              if (left === 0) delete a.hitDiceSpent;
              else a.hitDiceSpent = left;
            }
            // SRD: долгий отдых возвращает все ресурсы класса.
            delete a.resourcesSpent;
          } else {
            const h = p.hitDice?.find(x => x.actorId === actorId);
            if (h) {
              a.hp.current = Math.min(a.hp.max, a.hp.current + h.healed);
              a.hitDiceSpent = (a.hitDiceSpent ?? 0) + h.dice;
            }
            for (const r of p.resources ?? []) if (r.actorId === actorId) putSpent(a, r.resourceId, 0);
          }
          return { actorId, before, after: restSnap(current(a)) };
        });
        effect = { kind: 'rest', actors };
        break;
      }
      case 'RESOURCE_SPENT':
      case 'RESOURCE_RESTORED': {
        const p = event.payload as PayloadByType['RESOURCE_SPENT'];
        const a = draft.actors[p.actorId];
        const before = spentOf(a, p.resourceId);
        const after = event.type === 'RESOURCE_SPENT' ? before + p.amount : before - p.amount;
        putSpent(a, p.resourceId, after);
        effect = { kind: 'resource', actorId: p.actorId, resourceId: p.resourceId, before, after };
        break;
      }
    }
  });
  return { state: next, effect };
}

/** Ставит состояние в `after` следа — так откатываются и повторяются события. */
export function applyEffect(state: State, effect: Effect): State {
  return produce(state, draft => {
    const restoreThreadTouches = (touches: readonly ThreadTouchSnapshot[] | undefined) => {
      for (const touch of touches ?? []) {
        const thread = draft.world.threads[touch.id];
        if (thread) thread.lastTouchedSec = touch.after;
      }
    };
    switch (effect.kind) {
      case 'hp': {
        const a = draft.actors[effect.targetId];
        if (!a) throw new EngineError(`нет актёра ${effect.targetId}`);
        a.hp.current = effect.after.current;
        a.hp.temp = effect.after.temp;
        return;
      }
      case 'condition': {
        const a = draft.actors[effect.targetId];
        if (!a) throw new EngineError(`нет актёра ${effect.targetId}`);
        if (effect.after) a.conditions[effect.conditionId] = { ...effect.after };
        else delete a.conditions[effect.conditionId];
        return;
      }
      case 'a5e-track': {
        const a = draft.actors[effect.actorId];
        if (!a) throw new EngineError(`нет актёра ${effect.actorId}`);
        const tracks = { ...(a.a5eConditions ?? {}) };
        if (effect.after === undefined || effect.after === 0) delete tracks[effect.track];
        else tracks[effect.track] = effect.after;
        if ('afterStress' in effect) {
          if (effect.afterStress) tracks.mentalStress = effect.afterStress;
          else delete tracks.mentalStress;
        }
        if (Object.keys(tracks).length > 0) a.a5eConditions = tracks;
        else delete a.a5eConditions;
        if ('afterDowntimeRelaxUntilSec' in effect) {
          if (effect.afterDowntimeRelaxUntilSec === undefined) delete a.a5eDowntimeRelaxUntilSec;
          else a.a5eDowntimeRelaxUntilSec = effect.afterDowntimeRelaxUntilSec;
        }
        return;
      }
      case 'a5e-stress-use': {
        const a = draft.actors[effect.actorId];
        if (!a) throw new EngineError(`нет актёра ${effect.actorId}`);
        if (effect.after === undefined) delete a.a5eDistraughtAidUsed;
        else a.a5eDistraughtAidUsed = effect.after;
        return;
      }
      case 'a5e-prestige': {
        const a = draft.actors[effect.actorId];
        if (!a) throw new EngineError(`нет актёра ${effect.actorId}`);
        if (effect.after === undefined) delete a.a5ePrestige;
        else a.a5ePrestige = {
          ...(effect.after.centerLocationId !== undefined ? { centerLocationId: effect.after.centerLocationId } : {}),
          awards: effect.after.awards.map(award => ({ ...award })),
        };
        return;
      }
      case 'rest-layer': {
        if (effect.after === undefined) delete draft.restLayer;
        else draft.restLayer = effect.after;
        return;
      }
      case 'stress-theme': {
        if (effect.after === undefined) delete draft.a5eStrifeEnabled;
        else draft.a5eStrifeEnabled = effect.after;
        return;
      }
      case 'setting-package': {
        if (effect.after === undefined) delete draft.settingPackageId;
        else draft.settingPackageId = effect.after;
        if (effect.afterRoot === undefined) delete draft.settingRootId;
        else draft.settingRootId = effect.afterRoot;
        for (const touch of effect.locations ?? []) {
          if (touch.after === undefined) delete draft.world.locations[touch.id];
          else draft.world.locations[touch.id] = structuredClone(touch.after);
        }
        return;
      }
      case 'turn': {
        const e = draft.encounter;
        e.round = effect.after.round;
        e.turnIndex = effect.after.turnIndex;
        e.active = effect.after.actorId !== null;
        if (effect.after.lairPhaseVersion !== undefined) e.lairPhaseVersion = effect.after.lairPhaseVersion;
        else delete e.lairPhaseVersion;
        if (effect.after.lairActionWindow) e.lairActionWindow = { ...effect.after.lairActionWindow };
        else delete e.lairActionWindow;
        if (effect.after.lairActionWindowPassedRound !== undefined) e.lairActionWindowPassedRound = effect.after.lairActionWindowPassedRound;
        else delete e.lairActionWindowPassedRound;
        return;
      }
      case 'time':
        draft.time.sec = effect.after;
        return;
      case 'delta-proposal': {
        if (effect.after) draft.deltas[effect.deltaId] = castDraft(structuredClone(effect.after));
        else delete draft.deltas[effect.deltaId];
        return;
      }
      case 'delta': {
        const d = draft.deltas[effect.deltaId];
        if (!d) throw new EngineError(`нет предложения ${effect.deltaId}`);
        d.status = effect.after.status;
        d.now = effect.after.now;
        d.variantId = effect.after.variantId;
        if (effect.after.cause !== undefined) d.cause = effect.after.cause;
        else if (effect.after.variantId && d.variants) d.cause = d.variants.find(v => v.id === effect.after.variantId)?.cause ?? d.cause; // след без причины — логи до шага 8
        if (effect.after.world) writePatch(draft, effect.after.world);
        restoreThreadTouches(effect.threads);
        return;
      }
      case 'fact': {
        const f = draft.facts[effect.factId];
        if (!f) throw new EngineError(`нет факта ${effect.factId}`);
        f.visibility = effect.after;
        restoreThreadTouches(effect.threads);
        return;
      }
      case 'encounter':
        putEncounter(draft, effect.after);
        return;
      case 'concentration': {
        const a = draft.actors[effect.actorId];
        if (!a) throw new EngineError(`нет актёра ${effect.actorId}`);
        if (effect.after) a.concentration = { ...effect.after };
        else delete a.concentration;
        return;
      }
      case 'actor': {
        if (effect.after) draft.actors[effect.actorId] = castDraft(structuredClone(effect.after));
        else delete draft.actors[effect.actorId];
        draft.party = [...effect.party.after];
        putEncounter(draft, effect.encounter.after);
        if (effect.inventory) {
          for (const row of effect.inventory.stacks) {
            if (row.after) (draft.inventory ??= {})[row.id] = castDraft(structuredClone(row.after));
            else if (draft.inventory) delete draft.inventory[row.id];
          }
          if (!effect.inventory.present.after && (!draft.inventory || Object.keys(draft.inventory).length === 0)) delete draft.inventory;
        } else if (effect.after) {
          // Old ACTOR_SPAWNED redo effects do not carry inventory snapshots. Restore their deterministic legacy rows.
          const missing = legacyStacksForActor(effect.after).filter(stack => !draft.inventory?.[stack.id]);
          for (const stack of missing) (draft.inventory ??= {})[stack.id] = castDraft(structuredClone(stack));
          if (missing.length && draft.actors[effect.actorId]?.sheet) {
            const migrated = legacyStacksForActor(effect.after);
            const inventory = { ...(state.inventory ?? {}), ...Object.fromEntries(migrated.map(stack => [stack.id, stack])) };
            draft.actors[effect.actorId] = castDraft(withActorInventory(effect.after, inventory));
          }
        } else if (!effect.after && draft.inventory) {
          // Old ACTOR_SPAWNED compensation records predate inventory snapshots. Remove only deterministic
          // legacy stacks created when that historical spawn is replayed.
          const prefix = `legacy:${encodeURIComponent(effect.actorId)}:`;
          for (const id of Object.keys(draft.inventory)) if (id.startsWith(prefix)) delete draft.inventory[id];
          if (Object.keys(draft.inventory).length === 0) delete draft.inventory;
        }
        return;
      }
      case 'inventory': {
        for (const row of effect.stacks) {
          if (row.after) (draft.inventory ??= {})[row.id] = castDraft(structuredClone(row.after));
          else if (draft.inventory) delete draft.inventory[row.id];
        }
        for (const actor of effect.actors) draft.actors[actor.actorId] = castDraft(structuredClone(actor.after));
        if (!effect.inventoryPresent.after && (!draft.inventory || Object.keys(draft.inventory).length === 0)) delete draft.inventory;
        if (effect.offer) (draft.tradeOffers ??= {})[effect.offer.id] = castDraft(structuredClone(effect.offer.after));
        return;
      }
      case 'trade-offer': {
        if (effect.after) (draft.tradeOffers ??= {})[effect.id] = castDraft(structuredClone(effect.after));
        else if (draft.tradeOffers) delete draft.tradeOffers[effect.id];
        if (!effect.offersPresent.after && (!draft.tradeOffers || Object.keys(draft.tradeOffers).length === 0)) delete draft.tradeOffers;
        return;
      }
      case 'person-gift': {
        for (const row of effect.stacks) {
          if (row.after) (draft.inventory ??= {})[row.id] = castDraft(structuredClone(row.after));
          else if (draft.inventory) delete draft.inventory[row.id];
        }
        for (const actor of effect.actors) draft.actors[actor.actorId] = castDraft(structuredClone(actor.after));
        if (!effect.inventoryPresent.after && (!draft.inventory || Object.keys(draft.inventory).length === 0)) delete draft.inventory;
        if (effect.after) (draft.personGifts ??= {})[effect.personId] = castDraft(structuredClone(effect.after));
        else if (draft.personGifts) {
          delete draft.personGifts[effect.personId];
          if (!Object.keys(draft.personGifts).length) delete draft.personGifts;
        }
        return;
      }
      case 'inventory-container': {
        if (effect.after) (draft.inventoryContainers ??= {})[effect.id] = castDraft(structuredClone(effect.after));
        else if (draft.inventoryContainers) delete draft.inventoryContainers[effect.id];
        if (!effect.containersPresent.after && (!draft.inventoryContainers || Object.keys(draft.inventoryContainers).length === 0)) delete draft.inventoryContainers;
        return;
      }
      case 'transport': {
        if (effect.after) (draft.transports ??= {})[effect.id] = castDraft(structuredClone(effect.after));
        else if (draft.transports) delete draft.transports[effect.id];
        if (!effect.transportsPresent.after && (!draft.transports || Object.keys(draft.transports).length === 0)) delete draft.transports;
        return;
      }
      case 'rest': {
        for (const r of effect.actors) {
          const a = draft.actors[r.actorId];
          if (!a) throw new EngineError(`нет актёра ${r.actorId}`);
          putRest(a, r.after);
        }
        return;
      }
      case 'resource': {
        const a = draft.actors[effect.actorId];
        if (!a) throw new EngineError(`нет актёра ${effect.actorId}`);
        putSpent(a, effect.resourceId, effect.after);
        return;
      }
      case 'travel': {
        for (const t of effect.actors) {
          const a = draft.actors[t.actorId];
          if (!a) throw new EngineError(`нет актёра ${t.actorId}`);
          if (t.after === undefined) delete a.locationId;
          else a.locationId = t.after;
        }
        return;
      }
      case 'supply':
        draft.supply = effect.after;
        return;
      case 'place': {
        const l = draft.world.locations[effect.locationId];
        if (!l) throw new EngineError(`нет места ${effect.locationId}`);
        if (effect.after) l.revealed = true;
        else delete l.revealed;
        return;
      }
      case 'knowledge':
        putKnown(draft, effect.ref, effect.name, effect.label, effect.after);
        return;
      case 'npc-social': {
        const actor = draft.actors[effect.actorId];
        if (!actor) throw new EngineError(`нет актёра ${effect.actorId}`);
        if (effect.after) actor.social = castDraft(structuredClone(effect.after));
        else delete actor.social;
        return;
      }
      case 'person-relationships': {
        if (effect.after) {
          draft.personRelationships ??= {};
          draft.personRelationships[effect.personId] = castDraft(structuredClone(effect.after));
        } else if (draft.personRelationships) {
          delete draft.personRelationships[effect.personId];
          if (!Object.keys(draft.personRelationships).length) delete draft.personRelationships;
        }
        return;
      }
      case 'a5e-downtime-project': {
        const projects = (draft.a5eDowntimeProjects ??= {});
        if (effect.after) projects[effect.projectId] = castDraft(structuredClone(effect.after));
        else delete projects[effect.projectId];
        if (Object.keys(projects).length === 0) delete draft.a5eDowntimeProjects;
        if (effect.sheet && draft.actors[effect.sheet.actorId]) putSheet(draft.actors[effect.sheet.actorId], effect.sheet.after);
        return;
      }
      case 'timeline-plan': {
        if (effect.after) (draft.world.timelinePlans ??= {})[effect.id] = castDraft(structuredClone(effect.after));
        else if (draft.world.timelinePlans) delete draft.world.timelinePlans[effect.id];
        if (!effect.plansPresent.after && (!draft.world.timelinePlans || Object.keys(draft.world.timelinePlans).length === 0)) delete draft.world.timelinePlans;
        return;
      }
      case 'a5e-key-knowledge': {
        const actor = draft.actors[effect.actorId];
        if (!actor) return;
        const next = { ...(actor.a5eKeyKnowledge ?? {}) };
        if (effect.after !== undefined) next[effect.subjectRef] = effect.after;
        else delete next[effect.subjectRef];
        if (Object.keys(next).length) actor.a5eKeyKnowledge = next;
        else delete actor.a5eKeyKnowledge;
        return;
      }
      case 'a5e-favor': {
        const actor = draft.actors[effect.actorId];
        if (!actor) return;
        const next = { ...(actor.a5eFavor ?? {}) };
        if (effect.after !== undefined) next[effect.deityRef] = effect.after;
        else delete next[effect.deityRef];
        if (Object.keys(next).length) actor.a5eFavor = next;
        else delete actor.a5eFavor;
        return;
      }
      case 'a5e-work-disadvantage': {
        const actor = draft.actors[effect.actorId];
        if (!actor) return;
        if (effect.after?.length) actor.a5eWorkDisadvantageSkills = [...effect.after];
        else delete actor.a5eWorkDisadvantageSkills;
        return;
      }
      case 'sheet': {
        const a = draft.actors[effect.actorId];
        if (!a) throw new EngineError(`нет актёра ${effect.actorId}`);
        putSheet(a, effect.after);
        return;
      }
      case 'cell': {
        const a = draft.actors[effect.actorId];
        if (!a) throw new EngineError(`нет актёра ${effect.actorId}`);
        if (effect.after) a.cell = { x: effect.after.x, y: effect.after.y };
        else delete a.cell;
        return;
      }
      case 'note':
        restoreThreadTouches(effect.threads);
        return;
      case 'none':
        return;
    }
  });
}

const SHEET_PATCH_KEYS: readonly (keyof SheetPatch)[] = ['alignment', 'deity', 'homeland', 'bio'];

const sheetSnap = (a: Actor): SheetSnapshot => ({ sheet: structuredClone(a.sheet!), hp: { current: a.hp.current, max: a.hp.max }, ac: a.ac, passivePerception: a.passivePerception });

function putSheet(a: Actor, s: SheetSnapshot): void {
  a.sheet = castDraft(structuredClone(s.sheet));
  a.hp.current = s.hp.current;
  a.hp.max = s.hp.max;
  a.ac = s.ac;
  a.passivePerception = s.passivePerception;
}

/** Строка тетради: положить, заменить или убрать (null); сущность без строк из тетради уходит. */
function putKnown(draft: State, ref: EntityRef, name: string, label: string, fact: KnownFact | null): void {
  const book = (draft.knowledge ??= {});
  const entity = (book[ref] ??= { ref, name, facts: [] });
  entity.facts = entity.facts.filter(f => f.label !== label);
  if (fact) entity.facts.push(fact);
  if (entity.facts.length === 0) delete book[ref];
  if (Object.keys(book).length === 0) delete draft.knowledge;
}

/** След наоборот: after ↔ before. Для заметки и броска откатывать нечего — след тот же. */
export function invert(effect: Effect): Effect {
  switch (effect.kind) {
    case 'hp': return { ...effect, before: effect.after, after: effect.before };
    case 'condition': return { ...effect, before: effect.after, after: effect.before };
    case 'a5e-track': return { ...effect, before: effect.after, after: effect.before,
      ...( ('beforeStress' in effect || 'afterStress' in effect) ? { beforeStress: effect.afterStress, afterStress: effect.beforeStress } : {}),
      ...( ('beforeDowntimeRelaxUntilSec' in effect || 'afterDowntimeRelaxUntilSec' in effect) ? { beforeDowntimeRelaxUntilSec: effect.afterDowntimeRelaxUntilSec, afterDowntimeRelaxUntilSec: effect.beforeDowntimeRelaxUntilSec } : {}) };
    case 'a5e-stress-use': return { ...effect, before: effect.after, after: effect.before };
    case 'a5e-prestige': return { ...effect, before: effect.after, after: effect.before };
    case 'rest-layer': return { ...effect, before: effect.after, after: effect.before };
    case 'stress-theme': return { ...effect, before: effect.after, after: effect.before };
    case 'setting-package': return {
      ...effect,
      before: effect.after,
      after: effect.before,
      beforeRoot: effect.afterRoot,
      afterRoot: effect.beforeRoot,
      ...(effect.locations ? { locations: effect.locations.map(touch => ({ id: touch.id, before: touch.after, after: touch.before })) } : {}),
    };
    case 'turn': return { ...effect, before: effect.after, after: effect.before };
    case 'time': return { ...effect, before: effect.after, after: effect.before };
    case 'delta-proposal': return { ...effect, before: effect.after, after: effect.before };
    case 'delta': return {
      ...effect, before: effect.after, after: effect.before,
      ...(effect.threads ? { threads: effect.threads.map(touch => ({ id: touch.id, before: touch.after, after: touch.before })) } : {}),
    };
    case 'fact': return {
      ...effect, before: effect.after, after: effect.before,
      ...(effect.threads ? { threads: effect.threads.map(touch => ({ id: touch.id, before: touch.after, after: touch.before })) } : {}),
    };
    case 'encounter': return { ...effect, before: effect.after, after: effect.before };
    case 'concentration': return { ...effect, before: effect.after, after: effect.before };
    case 'actor': return {
      ...effect,
      before: effect.after,
      after: effect.before,
      party: { before: effect.party.after, after: effect.party.before },
      encounter: { before: effect.encounter.after, after: effect.encounter.before },
      ...(effect.inventory ? { inventory: { present: { before: effect.inventory.present.after, after: effect.inventory.present.before }, stacks: effect.inventory.stacks.map(row => ({ id: row.id, before: row.after, after: row.before })) } } : {}),
    };
    case 'inventory': return {
      ...effect,
      inventoryPresent: { before: effect.inventoryPresent.after, after: effect.inventoryPresent.before },
      stacks: effect.stacks.map(row => ({ id: row.id, before: row.after, after: row.before })),
      actors: effect.actors.map(row => ({ actorId: row.actorId, before: row.after, after: row.before })),
      ...(effect.offer ? { offer: { id: effect.offer.id, before: effect.offer.after, after: effect.offer.before } } : {}),
    };
    case 'trade-offer': return { ...effect, offersPresent: { before: effect.offersPresent.after, after: effect.offersPresent.before }, before: effect.after, after: effect.before };
    case 'person-gift': return {
      ...effect,
      inventoryPresent: { before: effect.inventoryPresent.after, after: effect.inventoryPresent.before },
      stacks: effect.stacks.map(row => ({ id: row.id, before: row.after, after: row.before })),
      actors: effect.actors.map(row => ({ actorId: row.actorId, before: row.after, after: row.before })),
      before: effect.after,
      after: effect.before,
    };
    case 'inventory-container': return { ...effect, containersPresent: { before: effect.containersPresent.after, after: effect.containersPresent.before }, before: effect.after, after: effect.before };
    case 'transport': return { ...effect, transportsPresent: { before: effect.transportsPresent.after, after: effect.transportsPresent.before }, before: effect.after, after: effect.before };
    case 'rest': return { ...effect, actors: effect.actors.map(r => ({ actorId: r.actorId, before: r.after, after: r.before })) };
    case 'resource': return { ...effect, before: effect.after, after: effect.before };
    case 'travel': return { ...effect, actors: effect.actors.map(t => ({ actorId: t.actorId, before: t.after, after: t.before })) };
    case 'place': return { ...effect, before: effect.after, after: effect.before };
    case 'supply': return { ...effect, before: effect.after, after: effect.before };
    case 'knowledge': return { ...effect, before: effect.after, after: effect.before };
    case 'npc-social': return { ...effect, before: effect.after, after: effect.before };
    case 'person-relationships': return { ...effect, before: effect.after, after: effect.before };
    case 'a5e-downtime-project': return { ...effect, before: effect.after, after: effect.before, ...(effect.sheet ? { sheet: { ...effect.sheet, before: effect.sheet.after, after: effect.sheet.before } } : {}) };
    case 'a5e-key-knowledge': return { ...effect, before: effect.after, after: effect.before };
    case 'a5e-favor': return { ...effect, before: effect.after, after: effect.before };
    case 'a5e-work-disadvantage': return { ...effect, before: effect.after, after: effect.before };
    case 'timeline-plan': return { ...effect, plansPresent: { before: effect.plansPresent.after, after: effect.plansPresent.before }, before: effect.after, after: effect.before };
    case 'sheet': return { ...effect, before: effect.after, after: effect.before };
    case 'cell': return { ...effect, before: effect.after, after: effect.before };
    case 'note': return {
      ...effect,
      ...(effect.threads ? { threads: effect.threads.map(touch => ({ id: touch.id, before: touch.after, after: touch.before })) } : {}),
    };
    case 'none':
      return effect;
  }
}
