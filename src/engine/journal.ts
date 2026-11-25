// Журнал — проекция лога, не таблица. Запись получают только события с journal: true (HANDOFF §7);
// компенсация наследует правило исходного события и читается как «Отменено: …». Нити, масштаб, секреты,
// упоминания и каскады (шаг 7) — тоже проекция: считаются из лога и состояния при каждом чтении, в записи
// ничего не хранится. Фильтр журнала — состояние вида, поэтому filterJournal — чистая функция над записями.
import { SKILLS, type SkillId } from '../rules/srd/abilities';
import { isProgressValue } from './progress';
import { CONDITIONS } from '../rules/srd/conditions';
import { RESOURCES } from '../rules/srd/resources';
import { TRAVEL_PACES } from '../rules/srd/travel';
import { ITEMS } from '../rules/srd/equipment';
import { MAGIC_ITEMS } from '../rules/srd/magicItems';
import { COIN_BY_ID } from '../rules/srd/coins';
import { a5eRestCompletes, a5eRestFailureReasons } from '../rules/a5e/rest';
import { a5eWorkActivitySpec } from '../rules/a5e/downtime';
import type { InventoryStorage } from './state';
import { EVENT_META, SCALE_LEVELS, SUPPLY_SPENDS, TEMPO_SECONDS, type DomainEvent, type PayloadByType, type ScaleLevel, type SupplyReason, type Tempo } from './events';
import type { Fact, ProgressClock, State, Thread, WorldDelta } from './state';

/** Кусок текста записи: обычный, @упоминание сущности (открывает карточку), #нить (фильтр). */
export type JournalPart =
  | { kind: 'text'; text: string }
  /** entity 'ref' — справочная сущность, id — ссылка «вид:id» (заклинание в записи концентрации). */
  | { kind: 'mention'; entity: 'actor' | 'location' | 'faction' | 'ref'; id: string; name: string }
  | { kind: 'thread'; id: string; name: string };

/** Откуда запись: рука мастера, симуляция (предложения), открыто игрокам. Метка происхождения — иконка src-*. */
export type JournalOrigin = 'dm' | 'sim' | 'players';

export interface JournalEntry {
  id: string;
  eventId: string;
  /** События одного игрового взаимодействия; всегда фильтруется вместе с самой записью. */
  interactionId?: string;
  at: number;
  worldSec: number;
  type: DomainEvent['type'];
  text: string;
  /** Компенсация: отмена или повтор. */
  compensation?: 'undo' | 'redo';
  /** Исходное событие отменено и не повторено — запись гаснет, но остаётся. */
  undone: boolean;
  /** Скрытый бросок. */
  hidden: boolean;
  /** Только для мастера: скрытый бросок, любая дельта симуляции. В режиме «глазами игроков» записи нет. */
  secret: boolean;
  origin: JournalOrigin;
  threadIds: readonly string[];
  scale?: ScaleLevel;
  /** Ссылка на причину — для каскадов «причина → следствие». */
  causeId?: string;
  /** Предложение, о котором запись (WORLD_DELTA_*). */
  deltaId?: string;
}

/** Шаг каскада «причина → следствие»: что это (факт, нить, предложение, запись) и как назвать. */
export interface CascadeStep {
  kind: 'fact' | 'thread' | 'delta' | 'entry';
  id: string;
  label: string;
}

const TEMPO_LABEL: Readonly<Record<Tempo, [string, string, string]>> = {
  round: ['раунд', 'раунда', 'раундов'],
  '10min': ['10 минут', '10 минут', '10 минут'],
  hour: ['час', 'часа', 'часов'],
  day: ['день', 'дня', 'дней'],
  tenday: ['десятидневка', 'десятидневки', 'десятидневок'],
  season: ['сезон', 'сезона', 'сезонов'],
  year: ['год', 'года', 'лет'],
};

/** Русское склонение по числу: 1 день, 2 дня, 5 дней. */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

/** Срок словами для журнала: «10 мин», «8 ч», «3 дн» — минуты вверх, часы и дни к ближайшему. */
export function durationLabel(seconds: number): string {
  if (seconds < 3600) return `${Math.max(1, Math.ceil(seconds / 60))} мин`;
  if (seconds < 86_400) return `${Math.max(1, Math.round(seconds / 3600))} ч`;
  return `${Math.max(1, Math.round(seconds / 86_400))} дн`;
}

/** Сколько потрачено после события ресурса — из его следа, чтобы «осталось N из M» не зависело от текущего состояния. */
function spentAfter(event: DomainEvent, state: State): number | undefined {
  if (event.effect?.kind === 'resource') return event.effect.after;
  const p = event.payload as PayloadByType['RESOURCE_SPENT'];
  return (state.actors[p.actorId]?.resourcesSpent as Record<string, number> | undefined)?.[p.resourceId] ?? 0;
}

/** Текст записи. Имена — латиницей как в мире, механика — как говорят за столом. */
export function describe(event: DomainEvent, state: State): string {
  const name = (id: string) => state.actors[id]?.name ?? id;
  const itemName = (id: string) => ITEMS[id]?.name ?? MAGIC_ITEMS[id]?.name ?? (COIN_BY_ID[id as keyof typeof COIN_BY_ID] ? `${COIN_BY_ID[id as keyof typeof COIN_BY_ID].name} (${COIN_BY_ID[id as keyof typeof COIN_BY_ID].short})` : id);
  const storageName = (storage: InventoryStorage) => storage.kind === 'party' ? 'общий запас партии'
    : storage.kind === 'container' ? state.inventoryContainers?.[storage.id]?.name ?? 'контейнер партии'
    : `у ${name(storage.id)}`;
  switch (event.type) {
    case 'DAMAGE_APPLIED': {
      const p = event.payload as PayloadByType['DAMAGE_APPLIED'];
      return `Урон ${p.amount}${p.type ? ` (${p.type})` : ''} по ${name(p.targetId)}${p.sourceId ? ` от ${name(p.sourceId)}` : ''}${p.mechanicId ? ' · эффект HB' : ''}`;
    }
    case 'HEALING_APPLIED': {
      const p = event.payload as PayloadByType['HEALING_APPLIED'];
      return `Лечение ${p.amount}: ${name(p.targetId)}${p.mechanicId ? ' · эффект HB' : ''}`;
    }
    case 'TEMP_HP_GRANTED': {
      const p = event.payload as PayloadByType['TEMP_HP_GRANTED'];
      return `Временные хиты ${p.amount}: ${name(p.targetId)}${p.mechanicId ? ' · эффект HB' : ''}`;
    }
    case 'CONDITION_ADDED': {
      const p = event.payload as PayloadByType['CONDITION_ADDED'];
      const label = CONDITIONS[p.conditionId]?.label ?? p.conditionId;
      const span = p.untilSec !== undefined ? ` на ${durationLabel(p.untilSec - event.worldSec)}` : p.until ? ` до ${p.until}` : '';
      return `${label}${p.level ? ` ${p.level}` : ''}: ${name(p.targetId)}${span}`;
    }
    case 'RESOURCE_SPENT': {
      const p = event.payload as PayloadByType['RESOURCE_SPENT'];
      const spent = spentAfter(event, state);
      return `${RESOURCES[p.resourceId]?.label ?? p.resourceId} −${p.amount}: ${name(p.actorId)}${spent === undefined ? '' : ` (${Math.max(0, p.max - spent)} из ${p.max})`}`;
    }
    case 'RESOURCE_RESTORED': {
      const p = event.payload as PayloadByType['RESOURCE_RESTORED'];
      const spent = spentAfter(event, state);
      return `${RESOURCES[p.resourceId]?.label ?? p.resourceId} +${p.amount}: ${name(p.actorId)}${spent === undefined ? '' : ` (${Math.max(0, p.max - spent)} из ${p.max})`}`;
    }
    case 'CONDITION_REMOVED': {
      const p = event.payload as PayloadByType['CONDITION_REMOVED'];
      return `Снято ${CONDITIONS[p.conditionId]?.label ?? p.conditionId}: ${name(p.targetId)}`;
    }
    case 'A5E_TRACK_SET': {
      const p = event.payload as PayloadByType['A5E_TRACK_SET'];
      const before = event.effect?.kind === 'a5e-track' ? event.effect.before ?? 0 : 0;
      const label = p.track === 'fatigue' ? 'Fatigue · усталость' : 'Strife · разлад';
      const stress = p.stressEffect ? ` · эффект ${p.stressEffect.kind === 'short' ? 'краткий' : 'долгий'}: ${p.stressEffect.id}` : '';
      return `${label}: ${name(p.actorId)} ${before} → ${p.level}${stress}`;
    }
    case 'A5E_STRESS_EFFECT_USED': {
      const p = event.payload as PayloadByType['A5E_STRESS_EFFECT_USED'];
      return `A5E Distraught: преимущество просьбы о помощи использовано персонажем ${name(p.actorId)}`;
    }
    case 'CAMPAIGN_REST_LAYER_SET': {
      const p = event.payload as PayloadByType['CAMPAIGN_REST_LAYER_SET'];
      const before = event.effect?.kind === 'rest-layer' ? event.effect.before ?? 'srd' : 'srd';
      return `Слой отдыха кампании: ${before.toUpperCase()} → ${p.layer.toUpperCase()}`;
    }
    case 'CAMPAIGN_STRESS_THEME_SET': {
      const p = event.payload as PayloadByType['CAMPAIGN_STRESS_THEME_SET'];
      return `Тема стресса и морали кампании: ${p.enabled ? 'включена' : 'выключена'}`;
    }
    case 'CAMPAIGN_SETTING_PACKAGE_SET': {
      const p = event.payload as PayloadByType['CAMPAIGN_SETTING_PACKAGE_SET'];
      const before = event.effect?.kind === 'setting-package' ? event.effect.before ?? 'fr' : 'fr';
      return `Пакет сеттинга кампании: ${before} → ${p.packageId}`;
    }
    case 'CAMPAIGN_CREATED': {
      const p = event.payload as PayloadByType['CAMPAIGN_CREATED'];
      return `Начальная кампания: ${p.profile.settingPackageId}`;
    }
    case 'DICE_ROLLED': {
      const p = event.payload as PayloadByType['DICE_ROLLED'];
      if (p.group) {
        const details = p.group.rolls.map(r => `${r.name} ${r.total} (${r.die}${r.modifier ? (r.modifier > 0 ? `+${r.modifier}` : `${r.modifier}`) : ''}) ${r.success ? '✓' : '✗'}`).join('; ');
        return `${p.label}: Сл ${p.group.dc} — ${details}; ${p.group.passed ? 'успех группы' : 'группа не прошла'} (${p.group.successes}/${p.group.rolls.length})${p.hidden ? ' · скрытый' : ''}`;
      }
      const dice = p.dice.join('+');
      const mod = p.mod ? (p.mod > 0 ? `+${p.mod}` : `${p.mod}`) : '';
      return `${p.label ? `${p.label}: ` : ''}${p.formula} = ${p.total} [${dice}${mod}]${p.hidden ? ' · скрытый' : ''}`;
    }
    case 'NPC_SOCIAL_UPDATED': {
      const p = event.payload as PayloadByType['NPC_SOCIAL_UPDATED'];
      return `NPC · ${name(p.actorId)}: ${p.note}`;
    }
    case 'PERSON_RELATIONSHIP_UPDATED': {
      const p = event.payload as PayloadByType['PERSON_RELATIONSHIP_UPDATED'];
      return `NPC · ${p.personName}: ${p.note}`;
    }
    case 'TURN_ADVANCED': {
      const p = event.payload as PayloadByType['TURN_ADVANCED'];
      return `Раунд ${p.round}, ход ${name(p.actorId)}`;
    }
    case 'LAIR_ACTION_USED': {
      const p = event.payload as PayloadByType['LAIR_ACTION_USED'];
      return `Логово: ${name(p.actorId)} — ${p.optionName} · раунд ${p.round} · ${p.source}`;
    }
    case 'TIME_ADVANCED': {
      const p = event.payload as PayloadByType['TIME_ADVANCED'];
      const n = p.steps;
      const unit = TEMPO_LABEL[p.tempo];
      const days = Math.round((p.toSec - p.fromSec) / 86_400);
      return `Время: +${n} ${plural(n, unit)}${TEMPO_SECONDS[p.tempo] >= 86_400 ? ` (${days} ${plural(days, ['день', 'дня', 'дней'])})` : ''}`;
    }
    case 'WORLD_DELTA_ACCEPTED': {
      const p = event.payload as PayloadByType['WORLD_DELTA_ACCEPTED'];
      return `Принято: ${p.subject} — ${p.was} → ${p.now}`;
    }
    case 'WORLD_DELTA_REJECTED': {
      const p = event.payload as PayloadByType['WORLD_DELTA_REJECTED'];
      const d = state.deltas[p.deltaId];
      return `Отклонено: ${d?.subject ?? p.deltaId}${p.reason ? ` — ${p.reason}` : ''}`;
    }
    case 'WORLD_DELTA_REROLLED': {
      const p = event.payload as PayloadByType['WORLD_DELTA_REROLLED'];
      return `Переброс: ${state.deltas[p.deltaId]?.subject ?? p.deltaId}`;
    }
    case 'FACT_REVEALED': {
      const p = event.payload as PayloadByType['FACT_REVEALED'];
      return `Открыто игрокам: ${state.facts[p.factId]?.text ?? p.factId}`;
    }
    case 'NOTE_ADDED':
      return (event.payload as PayloadByType['NOTE_ADDED']).text;
    case 'TIMELINE_PLAN_CREATED':
      return `План мастера: ${(event.payload as PayloadByType['TIMELINE_PLAN_CREATED']).plan.title}`;
    case 'TIMELINE_PLAN_CANCELLED': {
      const { planId } = event.payload as PayloadByType['TIMELINE_PLAN_CANCELLED'];
      return `Снят план мастера: ${state.world.timelinePlans?.[planId]?.title ?? planId}`;
    }
    case 'A5E_DOWNTIME_PROJECT_UPDATED':
      return 'A5E downtime · обновлён личный проект';
    case 'A5E_PRESTIGE_UPDATED': {
      const p = event.payload as PayloadByType['A5E_PRESTIGE_UPDATED'];
      return `A5E Prestige · обновлён личный профиль ${name(p.actorId)}`;
    }
    case 'A5E_KEY_KNOWLEDGE_EARNED': {
      const p = event.payload as PayloadByType['A5E_KEY_KNOWLEDGE_EARNED'];
      return `A5E Key Knowledge: ${name(p.actorId)} +${p.amount} по субъекту «${p.subjectName}»`;
    }
    case 'A5E_KEY_KNOWLEDGE_SPENT': {
      const p = event.payload as PayloadByType['A5E_KEY_KNOWLEDGE_SPENT'];
      const action = p.action?.label ?? (p.skill ? `${p.skill} ${p.total} против DC ${p.dc}` : `итог ${p.total}`);
      return `A5E Key Knowledge: ${name(p.actorId)} −1 по субъекту «${p.subjectName}» · ${action}`;
    }
    case 'A5E_FAVOR_EARNED': {
      const p = event.payload as PayloadByType['A5E_FAVOR_EARNED'];
      return `A5E favor: ${name(p.actorId)} +${p.amount} за служение ${p.deityName} · ${p.skill} ${p.checkTotal}`;
    }
    case 'A5E_FAVOR_SPENT': {
      const p = event.payload as PayloadByType['A5E_FAVOR_SPENT'];
      return `A5E favor: ${name(p.actorId)} −${p.amount} от ${p.deityName} · ${p.boon}`;
    }
    case 'A5E_WORK_RESOLVED': {
      const p = event.payload as PayloadByType['A5E_WORK_RESOLVED'];
      const spec = a5eWorkActivitySpec(p.difficulty);
      return `A5E Work: ${name(p.actorId)} · ${p.skill} ${p.total} против DC ${spec.dc} · ${p.earningsGp} gp`;
    }
    case 'ENCOUNTER_STARTED': {
      const p = event.payload as PayloadByType['ENCOUNTER_STARTED'];
      return `Бой начался: ${p.order.map(o => `${name(o.actorId)} ${o.initiative}`).join(', ')}`;
    }
    case 'ENCOUNTER_ENDED': {
      const p = event.payload as PayloadByType['ENCOUNTER_ENDED'];
      return `Бой окончен${p.reason ? ` — ${p.reason}` : ''}`;
    }
    case 'INITIATIVE_SET': {
      const p = event.payload as PayloadByType['INITIATIVE_SET'];
      return `Порядок инициативы: ${p.order.map(o => `${name(o.actorId)} ${o.initiative}`).join(', ')}`;
    }
    case 'CONCENTRATION_STARTED': {
      const p = event.payload as PayloadByType['CONCENTRATION_STARTED'];
      return `Концентрация: ${p.spell} — ${name(p.actorId)}`;
    }
    case 'CONCENTRATION_ENDED': {
      const p = event.payload as PayloadByType['CONCENTRATION_ENDED'];
      // История не должна смотреть на текущее состояние: концентрации уже нет (или позже наложено другое заклинание).
      // Для отменённого CONCENTRATION_ENDED снимок до/после меняется местами, поэтому читаем обе стороны следа.
      const effect = event.effect;
      const spell = effect?.kind === 'concentration' && effect.actorId === p.actorId
        ? (effect.before ?? effect.after)?.spell
        : undefined;
      return `Концентрация ${CONCENTRATION_END_LABEL[p.reason]}${spell ? `: ${spell}` : ''} — ${name(p.actorId)}`;
    }
    case 'ACTOR_SPAWNED': {
      const p = event.payload as PayloadByType['ACTOR_SPAWNED'];
      return `Появился: ${p.actor.name}${p.party ? ' (в партии)' : ''}`;
    }
    case 'ITEM_GAINED': {
      const p = event.payload as PayloadByType['ITEM_GAINED'];
      return `Получено: ${p.stack.qty} × ${itemName(p.stack.itemId)} · ${storageName(p.stack.storage)}`;
    }
    case 'INVENTORY_CONTAINER_CREATED': {
      const p = event.payload as PayloadByType['INVENTORY_CONTAINER_CREATED'];
      return `Создан контейнер ${p.container.kind === 'camp' ? 'лагеря' : 'транспорта'}: ${p.container.name}`;
    }
    case 'INVENTORY_CONTAINER_REMOVED': {
      const p = event.payload as PayloadByType['INVENTORY_CONTAINER_REMOVED'];
      const container = event.effect?.kind === 'inventory-container' ? event.effect.before : state.inventoryContainers?.[p.containerId];
      return `Удалено пустое хранилище: ${container?.name ?? p.containerId}`;
    }
    case 'TRANSPORT_CREATED': {
      const p = event.payload as PayloadByType['TRANSPORT_CREATED'];
      return `Добавлен транспорт партии: ${p.transport.name}`;
    }
    case 'TRANSPORT_REMOVED': {
      const p = event.payload as PayloadByType['TRANSPORT_REMOVED'];
      const transport = event.effect?.kind === 'transport' ? event.effect.before : state.transports?.[p.transportId];
      return `Удалён транспорт партии: ${transport?.name ?? p.transportId}`;
    }
    case 'COINS_EXCHANGED': {
      const p = event.payload as PayloadByType['COINS_EXCHANGED'];
      const source = event.effect?.kind === 'inventory' ? event.effect.stacks.find(row => row.id === p.stackId)?.before : undefined;
      return `Обмен монет: ${p.qty} × ${itemName(source?.itemId ?? p.stackId)} → ${p.toQty} × ${itemName(p.toCoinId)}`;
    }
    case 'ITEM_LOST': {
      const p = event.payload as PayloadByType['ITEM_LOST'];
      const item = event.effect?.kind === 'inventory' ? event.effect.stacks.find(row => row.id === p.stackId)?.before : undefined;
      return `Потеряно: ${p.qty} × ${itemName(item?.itemId ?? p.stackId)}${p.reason ? ` · ${p.reason}` : ''}`;
    }
    case 'ITEM_MOVED': {
      const p = event.payload as PayloadByType['ITEM_MOVED'];
      const item = event.effect?.kind === 'inventory' ? event.effect.stacks.find(row => row.id === p.stackId)?.before : undefined;
      return `Перемещено: ${p.qty} × ${itemName(item?.itemId ?? p.stackId)} → ${storageName(p.to)}`;
    }
    case 'ITEM_TRANSFERRED': {
      const p = event.payload as PayloadByType['ITEM_TRANSFERRED'];
      const item = event.effect?.kind === 'inventory' ? event.effect.stacks.find(row => row.id === p.stackId)?.before : undefined;
      const owner = p.owner.kind === 'party' ? 'партии' : name(p.owner.id);
      return `Передано: ${p.qty} × ${itemName(item?.itemId ?? p.stackId)} владельцу ${owner}`;
    }
    case 'ITEM_GIFTED': {
      const p = event.payload as PayloadByType['ITEM_GIFTED'];
      const item = event.effect?.kind === 'inventory' ? event.effect.stacks.find(row => row.id === p.stackId)?.before : undefined;
      return `Подарено: ${p.qty} × ${itemName(item?.itemId ?? p.stackId)} · ${name(p.giverId)} → ${name(p.recipientId)}${p.note ? ` · ${p.note}` : ''}`;
    }
    case 'PERSON_ITEM_GIFTED': {
      const p = event.payload as PayloadByType['PERSON_ITEM_GIFTED'];
      const item = event.effect?.kind === 'person-gift' ? event.effect.stacks.find(row => row.id === p.stackId)?.before : undefined;
      return `Подарено: ${p.qty} × ${itemName(item?.itemId ?? p.stackId)} · ${name(p.giverId)} → ${p.personName}${p.note ? ` · ${p.note}` : ''}`;
    }
    case 'TRADE_OFFER_CREATED': {
      const p = event.payload as PayloadByType['TRADE_OFFER_CREATED'];
      const item = state.inventory?.[p.trade.itemStackId];
      const ownerName = (owner: PayloadByType['TRADE_COMPLETED']['seller']) => owner.kind === 'party' ? 'партия' : name(owner.id);
      return `Предложение сделки ${p.offerId}: ${ownerName(p.trade.seller)} → ${ownerName(p.trade.buyer)} · ${p.trade.itemQty} × ${itemName(item?.itemId ?? p.trade.itemStackId)} · ${p.trade.priceCopper} мм`;
    }
    case 'TRADE_OFFER_WITHDRAWN': {
      const p = event.payload as PayloadByType['TRADE_OFFER_WITHDRAWN'];
      return `Предложение сделки ${p.offerId} отозвано`;
    }
    case 'TRADE_COMPLETED': {
      const p = event.payload as PayloadByType['TRADE_COMPLETED'];
      const rows = event.effect?.kind === 'inventory' ? event.effect.stacks : [];
      const item = rows.find(row => row.id === p.itemStackId)?.before;
      if (p.playerVisible && item?.visibility === 'players') {
        return `Партия купила ${p.itemQty} × ${itemName(item.itemId)} у торговца за ${p.priceCopper.toLocaleString('ru-RU')} мм`;
      }
      const ownerName = (owner: PayloadByType['TRADE_COMPLETED']['seller']) => owner.kind === 'party' ? 'партия' : name(owner.id);
      const paid = p.payments.map(payment => {
        const coin = rows.find(row => row.id === payment.stackId)?.before;
        return `${payment.qty} × ${itemName(coin?.itemId ?? payment.stackId)}`;
      }).join(' + ');
      const source = p.priceSource.kind === 'market'
        ? `SRD 5.1 · ${p.priceSource.locationName} · индекс ${p.priceSource.index}%`
        : p.priceSource.kind === 'rule' ? `${p.priceSource.edition}: ${p.priceSource.citation}` : `правило стола: ${p.priceSource.citation}`;
      return `Сделка${p.offerId ? ` ${p.offerId}` : ''}: ${ownerName(p.seller)} передал ${p.itemQty} × ${itemName(item?.itemId ?? p.itemStackId)} ${ownerName(p.buyer)} за ${paid} · ${source}`;
    }
    case 'ATTUNEMENT_CHANGED': {
      const p = event.payload as PayloadByType['ATTUNEMENT_CHANGED'];
      const stack = state.inventory?.[p.stackId] ?? (event.effect?.kind === 'inventory' ? event.effect.stacks.find(row => row.id === p.stackId)?.before : undefined);
      return `${p.actorId ? `Настроено: ${name(p.actorId)}` : 'Настройка снята'} · ${itemName(stack?.itemId ?? p.stackId)}`;
    }
    case 'ITEM_EQUIPPED': {
      const p = event.payload as PayloadByType['ITEM_EQUIPPED'];
      const stack = state.inventory?.[p.stackId] ?? (event.effect?.kind === 'inventory' ? event.effect.stacks.find(row => row.id === p.stackId)?.before : undefined);
      return `Надето: ${itemName(stack?.itemId ?? p.stackId)} · ${name(p.actorId)}`;
    }
    case 'ITEM_UNEQUIPPED': {
      const p = event.payload as PayloadByType['ITEM_UNEQUIPPED'];
      const stack = state.inventory?.[p.stackId] ?? (event.effect?.kind === 'inventory' ? event.effect.stacks.find(row => row.id === p.stackId)?.before : undefined);
      return `Снято: ${itemName(stack?.itemId ?? p.stackId)} · ${name(p.actorId)}`;
    }
    case 'ACTOR_REMOVED': {
      const p = event.payload as PayloadByType['ACTOR_REMOVED'];
      return `Выбыл${p.reason ? ` (${ACTOR_REMOVE_LABEL[p.reason]})` : ''}: ${name(p.actorId)}`;
    }
    case 'WORLD_DELTA_PROPOSED': {
      const p = event.payload as PayloadByType['WORLD_DELTA_PROPOSED'];
      return `Предложено: ${p.delta.subject} — ${p.delta.was} → ${p.delta.now}`;
    }
    case 'REST_TAKEN': {
      const p = event.payload as PayloadByType['REST_TAKEN'];
      if (p.kind === 'long') {
        if (p.context?.layer === 'a5e' && p.context.a5eTiming && !a5eRestCompletes(p.context)) {
          const reasons = a5eRestFailureReasons(p.context).join('; ');
          const reset = (p.context.a5eStrenuousMinutes ?? 0) > 60 ? 'период сброшен' : 'период не засчитан';
          const sleep = p.context.a5eTiming === 'period-v2' ? ` · сон ${p.context.a5eSleepHours} ч` : '';
          return `Долгий отдых A5E не завершён: ${reasons}; ${reset}, восстановления и расхода Supply нет · прошло ${p.context.a5eDurationHours} ч${sleep} · ${p.actorIds.map(name).join(', ')}`;
        }
        const context = p.context?.layer === 'a5e'
          ? ` (A5E${p.context.a5eTiming === 'period-v1' || p.context.a5eTiming === 'period-v2' ? ` · ${p.context.a5eDurationHours} ч${p.context.a5eTiming === 'period-v2' ? ` · сон ${p.context.a5eSleepHours} ч` : ''}` : ''} · ${p.context.haven ? 'укрытие' : 'без укрытия'}${p.context.roughingIt ? ' · суровые условия' : ''} · Supply: ${(p.context.suppliedActorIds ?? (p.context.supplyConsumed ? p.actorIds : [])).map(name).join(', ') || 'не распределён'})`
          : '';
        const changes = event.effect?.kind === 'rest' ? event.effect.actors.map(({ actorId, before, after }) => {
          const bits: string[] = [];
          if ((before.a5eFatigue ?? 0) !== (after.a5eFatigue ?? 0)) bits.push(`Fatigue ${before.a5eFatigue ?? 0} → ${after.a5eFatigue ?? 0}`);
          if ((before.a5eStrife ?? 0) !== (after.a5eStrife ?? 0)) bits.push(`Strife ${before.a5eStrife ?? 0} → ${after.a5eStrife ?? 0}`);
          return bits.length ? `${name(actorId)}: ${bits.join(', ')}` : '';
        }).filter(Boolean) : [];
        return `Долгий отдых${context}: ${p.actorIds.map(name).join(', ')}${changes.length ? ` · ${changes.join('; ')}` : ''}`;
      }
      const who = p.actorIds.map(id => {
        const h = p.hitDice?.find(x => x.actorId === id);
        const res = (p.resources ?? []).filter(r => r.actorId === id).map(r => RESOURCES[r.resourceId]?.label ?? r.resourceId);
        const parts = [h ? `+${h.healed} (${h.dice} ${plural(h.dice, HIT_DICE)} хитов)` : '', res.length > 0 ? res.join(', ') : ''].filter(Boolean);
        return parts.length > 0 ? `${name(id)} ${parts.join(' · ')}` : name(id);
      });
      return `Короткий отдых: ${who.join(', ')}`;
    }
    case 'PARTY_TRAVELED': {
      const p = event.payload as PayloadByType['PARTY_TRAVELED'];
      const place = (id: string | undefined) => (id ? state.world.locations[id]?.name ?? id : undefined);
      const from = place(p.fromId);
      const miles = Math.round(p.miles);
      const days = String(p.days).replace('.', ',');
      return `Поход: ${from ? `${from} → ` : ''}${place(p.toId)}, ${miles} ${plural(miles, MILES)}, ${days} ${Number.isInteger(p.days) ? plural(p.days, DAYS) : 'дня'} (${TRAVEL_PACES[p.pace]?.label ?? p.pace} темп${p.difficult ? ', трудная местность' : p.difficultMiles ? `, по трудной местности ${Math.round(p.difficultMiles)} ${plural(Math.round(p.difficultMiles), MILES)}` : ''})`;
    }
    case 'PLACE_REVEALED': {
      const p = event.payload as PayloadByType['PLACE_REVEALED'];
      return `Открыто игрокам: ${state.world.locations[p.locationId]?.name ?? p.locationId}`;
    }
    case 'SUPPLY_CHANGED': {
      const p = event.payload as PayloadByType['SUPPLY_CHANGED'];
      // Остаток — из следа события, чтобы запись не зависела от текущего запаса.
      const after = event.effect?.kind === 'supply' ? event.effect.after : undefined;
      const sign = SUPPLY_SPENDS.has(p.reason) ? '−' : '+';
      const short = p.shortfall ? ` · не хватило ${p.shortfall}: без Supply на длинном отдыхе — уровень усталости (A5E)` : '';
      return `Припасы ${sign}${p.amount}, ${SUPPLY_REASON_LABEL[p.reason]}${after === undefined ? '' : ` (осталось ${after})`}${short}`;
    }
    case 'KNOWLEDGE_REVEALED': {
      const p = event.payload as PayloadByType['KNOWLEDGE_REVEALED'];
      return `Партия узнала: ${p.name} — ${p.fact.label}: ${p.fact.value} · ${knowledgeHow(p, name)}`;
    }
    case 'CHARACTER_LEVELED': {
      const p = event.payload as PayloadByType['CHARACTER_LEVELED'];
      const how = p.hp.method === 'roll' ? `бросок ${p.hp.value}` : `среднее ${p.hp.value}`;
      return `${name(p.actorId)} — ${p.sheet.level}-й уровень: максимум хитов ${p.hpMax} (${how})${p.gained.length ? ` · ${p.gained.join(', ')}` : ''}`;
    }
    case 'SHEET_EDITED': {
      const p = event.payload as PayloadByType['SHEET_EDITED'];
      const fields = Object.entries(p.patch).map(([k, v]) => `${SHEET_FIELD_LABEL[k as keyof typeof SHEET_FIELD_LABEL] ?? k}: ${sheetValue(v)}`);
      return `Лист ${name(p.actorId)}: ${fields.join(', ')} · причина: ${p.reason}`;
    }
    case 'TOKEN_MOVED': {
      const p = event.payload as PayloadByType['TOKEN_MOVED'];
      // Откуда — из следа: первый ход после расстановки сида знает только то, что сказал MapTool.
      const before = event.effect?.kind === 'cell' ? event.effect.before : p.from;
      const cell = (c: { x: number; y: number }) => `(${c.x}, ${c.y})`;
      return `${name(p.actorId)}: клетка ${before ? `${cell(before)} → ` : ''}${cell(p.to)}${p.source === 'maptool' ? ' · MapTool' : ''}`;
    }
  }
}

/** Поля паспорта листа словами журнала. */
const SHEET_FIELD_LABEL = { alignment: 'мировоззрение', deity: 'божество', homeland: 'родная держава', bio: 'рост, вес, возраст' } as const;
function sheetValue(v: unknown): string {
  if (v === undefined || v === null) return '—';
  if (typeof v !== 'object') return String(v);
  if ('name' in v) return String((v as { name: string }).name);
  return Object.values(v as Record<string, unknown>).filter(x => x !== undefined && x !== '').join(', ') || '—';
}

/** Кто и как узнал: «Bo Tambernack, History 17 против Сл 15» или «волей мастера» — для журнала и тетради. */
export function knowledgeHow(p: { by?: string; check?: { skill: SkillId; dc: number; total: number } }, name: (id: string) => string): string {
  const who = p.by ? name(p.by) : 'партия';
  return p.check ? `${who}, ${SKILLS[p.check.skill]?.name ?? p.check.skill} ${p.check.total} против Сл ${p.check.dc}` : `${p.by ? `${who}, ` : ''}волей мастера`;
}

const MILES: readonly [string, string, string] = ['миля', 'мили', 'миль'];

/** Причины изменения припасов словами журнала и формы. */
export const SUPPLY_REASON_LABEL: Readonly<Record<SupplyReason, string>> = {
  bought: 'куплено', foraged: 'добыто в пути', found: 'найдено', eaten: 'съедено', lost: 'потеряно',
};
const DAYS: readonly [string, string, string] = ['день', 'дня', 'дней'];

const HIT_DICE: readonly [string, string, string] = ['кость', 'кости', 'костей'];

const CONCENTRATION_END_LABEL: Readonly<Record<PayloadByType['CONCENTRATION_ENDED']['reason'], string>> = {
  save: 'потеряна на спасброске',
  cast: 'сменилась другим заклинанием',
  unconscious: 'потеряна: без сознания',
  expired: 'кончилась',
  dm: 'снята мастером',
};

const ACTOR_REMOVE_LABEL: Readonly<Record<NonNullable<PayloadByType['ACTOR_REMOVED']['reason']>, string>> = {
  dead: 'убит', fled: 'сбежал', left: 'ушёл', dm: 'решение мастера',
};

/** id событий, которые сейчас отменены и не повторены — по компенсациям в логе. */
export function undoneIds(events: readonly DomainEvent[]): Set<string> {
  const undoneNow = new Set<string>();
  for (const e of events) {
    if (e.undoes) undoneNow.add(e.undoes);
    else if (e.redoes) undoneNow.delete(e.redoes);
  }
  return undoneNow;
}

/** События боя: внутри начатого боя их масштаб — «бой»; вне боя (урон в дороге, бросок у костра) масштаба нет. */
const COMBAT_TYPES: ReadonlySet<DomainEvent['type']> = new Set([
  'DAMAGE_APPLIED', 'HEALING_APPLIED', 'TEMP_HP_GRANTED', 'CONDITION_ADDED', 'CONDITION_REMOVED', 'DICE_ROLLED',
  'CONCENTRATION_STARTED', 'CONCENTRATION_ENDED', 'ACTOR_SPAWNED', 'ACTOR_REMOVED', 'TOKEN_MOVED', 'LAIR_ACTION_USED',
]);
const ENCOUNTER_TYPES: ReadonlySet<DomainEvent['type']> = new Set(['ENCOUNTER_STARTED', 'ENCOUNTER_ENDED', 'INITIATIVE_SET', 'TURN_ADVANCED']);

/** Нити предложения: свои, а без них — causeId, если он указывает на нить (так у сида §13). */
export function deltaThreadIds(delta: WorldDelta | undefined, state: State): readonly string[] {
  if (!delta) return [];
  if (delta.threadIds) return delta.threadIds;
  return state.world.threads[delta.causeId] ? [delta.causeId] : [];
}

/** Все записи журнала по логу; порядок — порядок лога. */
export function journalEntries(events: readonly DomainEvent[], state: State): JournalEntry[] {
  const undoneNow = undoneIds(events);
  const out: JournalEntry[] = [];
  // Окно боя — по логу, а не по итоговому состоянию: урон в раунде 2 — «бой», урон в дороге — нет.
  // Отмена начала боя закрывает окно, повтор — открывает; для конца боя — наоборот.
  let inCombat = false;
  for (const e of events) {
    if (e.type === 'ENCOUNTER_STARTED') inCombat = !e.undoes;
    else if (e.type === 'ENCOUNTER_ENDED') inCombat = Boolean(e.undoes);
    if (!EVENT_META[e.type].journal) continue;
    const base = describe(e, state);
    const compensation = e.undoes ? 'undo' : e.redoes ? 'redo' : undefined;
    const entry: JournalEntry = {
      id: e.id,
      eventId: e.undoes ?? e.redoes ?? e.id,
      ...(e.interactionId ? { interactionId: e.interactionId } : {}),
      at: e.at,
      worldSec: e.worldSec,
      type: e.type,
      text: compensation === 'undo' ? `Отменено: ${base}` : compensation === 'redo' ? `Повторено: ${base}` : base,
      compensation,
      undone: !compensation && undoneNow.has(e.id),
      hidden: false,
      secret: false,
      origin: 'dm',
      threadIds: [],
      scale: ENCOUNTER_TYPES.has(e.type) || (inCombat && COMBAT_TYPES.has(e.type)) ? 'battle' : undefined,
    };
    switch (e.type) {
      case 'DICE_ROLLED': {
        const p = e.payload as PayloadByType['DICE_ROLLED'];
        entry.hidden = p.hidden;
        entry.secret = p.hidden;
        break;
      }
      case 'NPC_SOCIAL_UPDATED':
      case 'PERSON_RELATIONSHIP_UPDATED':
      case 'LAIR_ACTION_USED':
      case 'A5E_STRESS_EFFECT_USED':
      case 'A5E_DOWNTIME_PROJECT_UPDATED':
      case 'A5E_PRESTIGE_UPDATED':
      case 'A5E_KEY_KNOWLEDGE_EARNED':
      case 'A5E_KEY_KNOWLEDGE_SPENT':
      case 'A5E_FAVOR_SPENT':
      case 'A5E_WORK_RESOLVED':
        entry.secret = true;
        break;
      case 'ITEM_GAINED':
      case 'INVENTORY_CONTAINER_CREATED':
      case 'INVENTORY_CONTAINER_REMOVED':
      case 'TRANSPORT_CREATED':
      case 'TRANSPORT_REMOVED':
      case 'COINS_EXCHANGED':
      case 'ITEM_LOST':
      case 'ITEM_MOVED':
      case 'ITEM_TRANSFERRED':
      case 'ITEM_GIFTED':
      case 'PERSON_ITEM_GIFTED':
      case 'TRADE_OFFER_CREATED':
      case 'TRADE_OFFER_WITHDRAWN':
      case 'ATTUNEMENT_CHANGED':
      case 'ITEM_EQUIPPED':
      case 'ITEM_UNEQUIPPED':
        entry.secret = true;
        break;
      case 'TRADE_COMPLETED': {
        const p = e.payload as PayloadByType['TRADE_COMPLETED'];
        entry.secret = p.playerVisible !== true;
        if (!entry.secret) {
          entry.origin = 'players';
          delete entry.interactionId;
        }
        break;
      }
      case 'NOTE_ADDED': {
        const p = e.payload as PayloadByType['NOTE_ADDED'];
        entry.threadIds = p.threadIds;
        entry.scale = p.scale;
        // Q1: заметка секретна, пока мастер не отметил «Игрокам».
        entry.secret = p.visible !== true;
        break;
      }
      case 'TIMELINE_PLAN_CREATED':
      case 'TIMELINE_PLAN_CANCELLED':
        entry.secret = true;
        break;
      case 'WORLD_DELTA_ACCEPTED':
      case 'WORLD_DELTA_REJECTED': {
        const p = e.payload as { deltaId: string; causeId?: string };
        const d = state.deltas[p.deltaId];
        entry.origin = 'sim';
        entry.deltaId = p.deltaId;
        entry.threadIds = deltaThreadIds(d, state);
        entry.scale = d?.scale;
        entry.causeId = e.type === 'WORLD_DELTA_ACCEPTED' ? p.causeId : d?.causeId;
        // Дельты симуляции — кухня мастера (F8): отклонённое мир не меняло, принятое игроки видят в самом мире, не в журнале.
        entry.secret = true;
        break;
      }
      case 'FACT_REVEALED': {
        const p = e.payload as PayloadByType['FACT_REVEALED'];
        const f = state.facts[p.factId];
        entry.origin = 'players';
        entry.threadIds = f?.threadIds ?? [];
        entry.scale = f?.scale;
        // Открыто, а потом отменено — факт снова секрет: ни погасшая запись, ни компенсация игрокам не показываются.
        entry.secret = f?.visibility !== 'players';
        break;
      }
      case 'PARTY_TRAVELED':
      case 'SUPPLY_CHANGED':
        // Поход — дни пути по карте: уровень региона, как у темпа «день»; припасы — его часть.
        entry.scale = 'region';
        break;
      case 'KNOWLEDGE_REVEALED':
        entry.origin = 'players';
        break;
      case 'PLACE_REVEALED': {
        const p = e.payload as PayloadByType['PLACE_REVEALED'];
        entry.origin = 'players';
        entry.scale = state.world.locations[p.locationId]?.scale;
        break;
      }
      default:
        break;
    }
    out.push(entry);
  }
  return out;
}

/* ---------- Упоминания, фильтр, каскады, нити ---------- */

type MentionEntity = Extract<JournalPart, { kind: 'mention' }>['entity'];

/**
 * Текст записи по кускам: имена актёров, мест и фракций из состояния становятся @упоминаниями (длинные
 * имена раньше коротких, чтобы «Bandit Captain» не разрезался на «Bandit»), нити записи — #чипами в конце.
 * Имена ищутся по границам слова: «Bo» не зажигается внутри «Bolt». extra — имена справочника со ссылками (страница
 * даёт заклинания SRD): при равной длине имя из состояния важнее.
 */
export function journalParts(entry: Pick<JournalEntry, 'text' | 'threadIds'>, state: State, extra: readonly { ref: string; name: string }[] = []): JournalPart[] {
  const names: { entity: MentionEntity; id: string; name: string }[] = [
    ...Object.values(state.actors).map(a => ({ entity: 'actor' as const, id: a.id, name: a.name })),
    ...Object.values(state.world.locations).map(l => ({ entity: 'location' as const, id: l.id, name: l.name })),
    ...Object.values(state.world.factions).map(f => ({ entity: 'faction' as const, id: f.id, name: f.name })),
    ...extra.map(x => ({ entity: 'ref' as const, id: x.ref, name: x.name })),
  ].filter(n => n.name.length > 0).sort((a, b) => b.name.length - a.name.length);
  const text = entry.text;
  const taken: { start: number; end: number; part: JournalPart }[] = [];
  const free = (start: number, end: number) => taken.every(t => end <= t.start || start >= t.end);
  const boundary = (i: number) => i < 0 || i >= text.length || !/[\p{L}\p{N}]/u.test(text[i]);
  for (const n of names) {
    let from = 0;
    for (;;) {
      const start = text.indexOf(n.name, from);
      if (start < 0) break;
      const end = start + n.name.length;
      if (boundary(start - 1) && boundary(end) && free(start, end)) {
        taken.push({ start, end, part: { kind: 'mention', entity: n.entity, id: n.id, name: n.name } });
      }
      from = end;
    }
  }
  taken.sort((a, b) => a.start - b.start);
  const parts: JournalPart[] = [];
  let cursor = 0;
  for (const t of taken) {
    if (t.start > cursor) parts.push({ kind: 'text', text: text.slice(cursor, t.start) });
    parts.push(t.part);
    cursor = t.end;
  }
  if (cursor < text.length) parts.push({ kind: 'text', text: text.slice(cursor) });
  for (const id of entry.threadIds) {
    parts.push({ kind: 'text', text: ' ' });
    parts.push({ kind: 'thread', id, name: state.world.threads[id]?.name ?? id });
  }
  return parts;
}

export interface JournalFilter {
  /** Пусто — все нити, не «ничего». Включённые объединяются между собой. */
  threads?: readonly string[];
  /** Пусто — все уровни. Запись без масштаба под фильтром по уровню не проходит. */
  scales?: readonly ScaleLevel[];
  /** false — стол игроков: секретов в выдаче нет вовсе (HANDOFF §5, F8). */
  dmView?: boolean;
}

/** Нити объединяются между собой, уровни — между собой, две группы пересекаются; пустая группа — «всё». */
export function filterJournal(entries: readonly JournalEntry[], filter: JournalFilter = {}): JournalEntry[] {
  const threads = filter.threads ?? [];
  const scales = filter.scales ?? [];
  const dmView = filter.dmView ?? true;
  return entries.filter(e =>
    (dmView || !e.secret)
    && (threads.length === 0 || e.threadIds.some(id => threads.includes(id)))
    && (scales.length === 0 || (e.scale !== undefined && scales.includes(e.scale))),
  );
}

export interface JournalInteractionGroup {
  interactionId?: string;
  entries: readonly JournalEntry[];
}

/** Группирует только соседние видимые записи одной встречи и одного мирового момента. */
export function journalInteractionGroups(entries: readonly JournalEntry[]): JournalInteractionGroup[] {
  const groups: { interactionId?: string; entries: JournalEntry[] }[] = [];
  for (const entry of entries) {
    const previous = groups.at(-1);
    const lastEntry = previous?.entries.at(-1);
    if (entry.interactionId && previous?.interactionId === entry.interactionId && lastEntry?.worldSec === entry.worldSec) {
      previous.entries.push(entry);
    } else {
      groups.push({ ...(entry.interactionId ? { interactionId: entry.interactionId } : {}), entries: [entry] });
    }
  }
  return groups;
}

/** Уровни масштаба, встречающиеся в записях, — в порядке лестницы; из них строится фильтр. */
export function journalScales(entries: readonly JournalEntry[]): ScaleLevel[] {
  const seen = new Set(entries.flatMap(e => (e.scale ? [e.scale] : [])));
  return SCALE_LEVELS.filter(sc => seen.has(sc));
}

const deltaLabel = (d: WorldDelta) => `${d.subject}: ${d.was} → ${d.now}`;

/**
 * Каскад «причина → следствие» для записи с causeId: цепочка строится по ссылкам, не по времени
 * (HANDOFF §7). Причина — запись журнала (по id события), предложение (и дальше по его causeId), факт
 * или нить. Первый шаг — корень, последний — сама запись. Без разрешимой причины каскада нет.
 * Цикл ссылок обрывается, а не зацикливает.
 */
export function cascadeOf(entry: JournalEntry, entries: readonly JournalEntry[], state: State): CascadeStep[] {
  if (!entry.causeId) return [];
  const chain = causeChain(entry.causeId, entries, state, [entry.deltaId ?? entry.eventId]);
  if (chain.length === 0) return [];
  const self: CascadeStep = entry.deltaId && state.deltas[entry.deltaId]
    ? { kind: 'delta', id: entry.deltaId, label: deltaLabel(state.deltas[entry.deltaId]) }
    : { kind: 'entry', id: entry.id, label: entry.text };
  return [...chain, self];
}

/** Цепочка причин от корня до прямой причины `causeId` — то, что предложение показывает раскрытой цепочкой. */
export function causeChain(causeId: string | undefined, entries: readonly JournalEntry[], state: State, exclude: readonly string[] = []): CascadeStep[] {
  const chain: CascadeStep[] = [];
  const seen = new Set<string>(exclude);
  while (causeId && !seen.has(causeId)) {
    seen.add(causeId);
    const source = entries.find(e => e.eventId === causeId && !e.compensation);
    if (source) { chain.unshift({ kind: 'entry', id: source.id, label: source.text }); break; }
    const delta: WorldDelta | undefined = state.deltas[causeId];
    if (delta) {
      chain.unshift({ kind: 'delta', id: delta.id, label: deltaLabel(delta) });
      causeId = delta.causeId;
      continue;
    }
    const fact: Fact | undefined = state.facts[causeId];
    if (fact) { chain.unshift({ kind: 'fact', id: fact.id, label: fact.text }); break; }
    const thread = state.world.threads[causeId];
    if (thread) { chain.unshift({ kind: 'thread', id: thread.id, label: thread.name }); break; }
    break;
  }
  return chain;
}

export interface ThreadSummary {
  id: string;
  name: string;
  /** Записей журнала по нити (компенсации не считаются). */
  count: number;
  /** Сколько дней нить открыта — от времени мира. */
  openedDays: number;
  /** Сколько дней без внимания: от последнего касания в состоянии или последней записи, что позже. */
  idleDays: number;
  /** Последняя запись по нити. */
  last?: JournalEntry;
  /** Секреты мастера, привязанные к нити, — пока не открыты игрокам. */
  secrets: Fact[];
  /** Каскад последнего принятого предложения по нити. */
  cascade: CascadeStep[];
  /** View-safe clock projection: GM keeps metadata; players receive counts only when explicitly opened. */
  clock?: ProgressClock;
  /** Dungeon World preparation notes; withheld from the player thread summary. */
  front?: Thread['front'];
}

const DAY = 86_400;

/** Сводка нитей для правой колонки F7: по каждой открытой нити — записи, сроки, секреты, каскад. */
export function threadSummaries(entries: readonly JournalEntry[], state: State, nowSec: number, dmView = true): ThreadSummary[] {
  return Object.values(state.world.threads).filter(t => t.status === 'open').map(t => {
    const own = entries.filter(e => !e.compensation && !e.undone && e.threadIds.includes(t.id));
    const last = own.at(-1);
    const touchedSec = Math.max(t.lastTouchedSec, last?.worldSec ?? 0);
    const accepted = [...own].reverse().find(e => e.type === 'WORLD_DELTA_ACCEPTED');
    return {
      id: t.id,
      name: t.name,
      count: own.length,
      openedDays: Math.max(0, Math.floor((nowSec - t.openedSec) / DAY)),
      idleDays: Math.max(0, Math.floor((nowSec - touchedSec) / DAY)),
      last,
      secrets: dmView ? Object.values(state.facts).filter(f => f.visibility === 'dm' && (f.threadIds ?? []).includes(t.id)) : [],
      cascade: accepted ? cascadeOf(accepted, entries, state) : [],
      ...(t.clock && isProgressValue(t.clock) && (dmView || t.clock.playerVisible) ? {
        clock: dmView ? t.clock : { segments: t.clock.segments, filled: t.clock.filled },
      } : {}),
      ...(dmView && t.front ? { front: t.front } : {}),
    };
  });
}

export interface PublicProcessClockSummary {
  label: string;
  segments: number;
  filled: number;
}

/** Player projection of explicitly opened process clocks; omit the process ID/name, stage, cause, route and next tick. */
export function publicProcessClocks(state: State): PublicProcessClockSummary[] {
  return Object.values(state.world.processes ?? {}).flatMap(process => {
    const clock = process.clock;
    const label = clock?.playerLabel?.trim();
    if (process.ended || !clock?.playerVisible || !label || !isProgressValue(clock)) return [];
    return [{ label, segments: clock.segments, filled: clock.filled }];
  });
}

/** Текст для тоста «Отменено: …» — живёт до следующего действия, не по таймеру. */
export const undoToast = (event: DomainEvent, state: State): string => `Отменено: ${describe(event, state)}`;
export const redoToast = (event: DomainEvent, state: State): string => `Повторено: ${describe(event, state)}`;
