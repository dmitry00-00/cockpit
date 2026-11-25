// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { EventLog } from './log';
import { emptyState, type State } from './state';
import { EVENT_TYPES, EVENT_META, TEMPO_SECONDS, type DomainEvent, type PayloadByType } from './events';
import { EngineError, apply } from './reduce';
import { filterJournal, journalEntries, describe as describeEvent } from './journal';
import { parseFormula, roll, d20Outcome } from './dice';
import { LOG_FORMAT, localStorageStore, memoryStore, parseLog, serializeLog } from './persist';
import { createEngineStore } from './store';
import { CONDITION_IDS } from '../rules/srd/conditions';

/** Детерминированные часы и id — лог сравнивается байт в байт. */
const fixed = () => {
  let t = 1_000, n = 0;
  return { clock: { now: () => (t += 1) }, ids: { next: () => `e${++n}` } };
};

function seed(): State {
  const s = emptyState();
  s.actors = {
    bo: { id: 'bo', name: 'Bo Tambernack', kind: 'pc', hp: { current: 41, max: 49, temp: 0 }, ac: 16, passivePerception: 12, conditions: {} },
    korrin: { id: 'korrin', name: 'Korrin Battlehammer', kind: 'pc', hp: { current: 49, max: 49, temp: 0 }, ac: 18, passivePerception: 14, conditions: {} },
    captain: { id: 'captain', name: 'Bandit Captain', kind: 'monster', hp: { current: 45, max: 65, temp: 0 }, ac: 15, passivePerception: 10, conditions: {} },
  };
  s.party = ['bo', 'korrin'];
  s.actors.korrin.initiative = 18;
  s.actors.bo.initiative = 15;
  s.actors.captain.initiative = 14;
  s.deltas = {
    d1: { id: 'd1', scale: 'region', subject: 'Zhentarim · Triboar Trail', was: 'влияние 2', now: 'влияние 3', cause: 'караван всё ещё не найден', causeId: 'f-caravan', status: 'pending',
      variants: [{ id: 'v1', now: 'влияние 3', cause: 'караван всё ещё не найден' }, { id: 'v2', now: 'влияние 2', cause: 'Harpers перехватили курьера' }] },
  };
  s.facts = { 'f-caravan': { id: 'f-caravan', text: 'Караван пропал на Triboar Trail', visibility: 'dm', scale: 'region' } };
  return s;
}

describe('список событий', () => {
  it('64 типа: прежние события и новые слои, имущество, отношения и планы; у каждого — обратимость и журнал', () => {
    expect(EVENT_TYPES).toHaveLength(64);
    expect(EVENT_TYPES.filter(t => !['A5E_TRACK_SET', 'A5E_STRESS_EFFECT_USED', 'CAMPAIGN_REST_LAYER_SET', 'CAMPAIGN_STRESS_THEME_SET', 'CAMPAIGN_SETTING_PACKAGE_SET', 'NPC_SOCIAL_UPDATED'].includes(t)).slice(13)).toEqual(['NOTE_ADDED', 'A5E_DOWNTIME_PROJECT_UPDATED', 'A5E_KEY_KNOWLEDGE_EARNED', 'A5E_KEY_KNOWLEDGE_SPENT', 'A5E_FAVOR_EARNED', 'A5E_FAVOR_SPENT', 'A5E_WORK_RESOLVED', 'ENCOUNTER_STARTED', 'ENCOUNTER_ENDED', 'LAIR_ACTION_USED', 'INITIATIVE_SET', 'CONCENTRATION_STARTED', 'CONCENTRATION_ENDED', 'ACTOR_SPAWNED', 'ACTOR_REMOVED', 'WORLD_DELTA_PROPOSED', 'ITEM_GAINED', 'INVENTORY_CONTAINER_CREATED', 'INVENTORY_CONTAINER_REMOVED', 'TRANSPORT_CREATED', 'TRANSPORT_REMOVED', 'COINS_EXCHANGED', 'ITEM_LOST', 'ITEM_MOVED', 'ITEM_TRANSFERRED', 'ITEM_GIFTED', 'PERSON_ITEM_GIFTED', 'TRADE_OFFER_CREATED', 'TRADE_OFFER_WITHDRAWN', 'TRADE_COMPLETED', 'ATTUNEMENT_CHANGED', 'ITEM_EQUIPPED', 'ITEM_UNEQUIPPED', 'REST_TAKEN', 'RESOURCE_SPENT', 'RESOURCE_RESTORED', 'PARTY_TRAVELED', 'PLACE_REVEALED', 'SUPPLY_CHANGED', 'KNOWLEDGE_REVEALED', 'CHARACTER_LEVELED', 'SHEET_EDITED', 'TOKEN_MOVED', 'TIMELINE_PLAN_CREATED', 'TIMELINE_PLAN_CANCELLED']);
    expect(EVENT_META.CHARACTER_LEVELED).toEqual({ reversible: true, journal: true });
    expect(EVENT_META.SHEET_EDITED).toEqual({ reversible: true, journal: true });
    expect(EVENT_META.TOKEN_MOVED).toEqual({ reversible: true, journal: true });
    for (const type of ['ITEM_GAINED', 'INVENTORY_CONTAINER_CREATED', 'INVENTORY_CONTAINER_REMOVED', 'TRANSPORT_CREATED', 'TRANSPORT_REMOVED', 'COINS_EXCHANGED', 'ITEM_LOST', 'ITEM_MOVED', 'ITEM_TRANSFERRED', 'ITEM_GIFTED', 'PERSON_ITEM_GIFTED', 'TRADE_OFFER_CREATED', 'TRADE_OFFER_WITHDRAWN', 'TRADE_COMPLETED', 'ATTUNEMENT_CHANGED', 'ITEM_EQUIPPED', 'ITEM_UNEQUIPPED'] as const) expect(EVENT_META[type]).toEqual({ reversible: true, journal: true });
    expect(EVENT_META.A5E_FAVOR_SPENT).toEqual({ reversible: true, journal: true });
    expect(EVENT_META.SUPPLY_CHANGED).toEqual({ reversible: true, journal: true });
    expect(EVENT_META.KNOWLEDGE_REVEALED).toEqual({ reversible: true, journal: true });
    expect(EVENT_META.A5E_DOWNTIME_PROJECT_UPDATED).toEqual({ reversible: true, journal: true });
    expect(EVENT_META.PARTY_TRAVELED).toEqual({ reversible: true, journal: true });
    expect(EVENT_META.PLACE_REVEALED).toEqual({ reversible: true, journal: true });
    expect(EVENT_META.REST_TAKEN).toEqual({ reversible: true, journal: true });
    expect(EVENT_META.RESOURCE_SPENT).toEqual({ reversible: true, journal: true });
    expect(EVENT_META.RESOURCE_RESTORED).toEqual({ reversible: true, journal: true });
    expect(EVENT_META.TIMELINE_PLAN_CREATED).toEqual({ reversible: true, journal: true });
    expect(EVENT_META.TIMELINE_PLAN_CANCELLED).toEqual({ reversible: true, journal: true });
    for (const t of EVENT_TYPES) expect(EVENT_META[t]).toBeDefined();
    expect(EVENT_META.DICE_ROLLED.reversible).toBe(false);
    expect(EVENT_META.WORLD_DELTA_REROLLED.journal).toBe(false);
    // Предложение — не действие мастера: как бросок, необратимо; как переброс, без строки в журнале.
    expect(EVENT_META.WORLD_DELTA_PROPOSED).toEqual({ reversible: false, journal: false });
  });
});

describe('планы хронологии', () => {
  const plan = { id: 'plan-1', title: 'Совет в Suzail', details: 'Встреча возможна; результат не задан.', startSec: 86_400, endSec: 259_199, source: 'Заметки мастера, 19.11.2026', visibility: 'dm' as const };

  it('сохраняет диапазон, помечает записи секретными и воспроизводится с отменой и повтором', () => {
    const log = new EventLog(seed(), [], fixed());
    log.dispatch({ type: 'TIMELINE_PLAN_CREATED', payload: { plan } });
    expect(log.state.world.timelinePlans?.[plan.id]).toEqual({ ...plan, status: 'active' });
    expect(journalEntries(log.entries, log.state).at(-1)?.secret).toBe(true);
    expect(filterJournal(journalEntries(log.entries, log.state), { dmView: false })).toHaveLength(0);

    log.dispatch({ type: 'TIMELINE_PLAN_CANCELLED', payload: { planId: plan.id } });
    expect(log.state.world.timelinePlans?.[plan.id]?.status).toBe('cancelled');
    log.undo();
    expect(log.state.world.timelinePlans?.[plan.id]?.status).toBe('active');
    log.redo();
    expect(log.state.world.timelinePlans?.[plan.id]?.status).toBe('cancelled');
    const replay = new EventLog(seed(), log.entries, fixed());
    expect(replay.state.world.timelinePlans?.[plan.id]).toEqual({ ...plan, status: 'cancelled' });
  });

  it('отменяет создание, проверяет порядок дат и не позволяет отменить отсутствующий план', () => {
    const log = new EventLog(seed(), [], fixed());
    expect(() => log.dispatch({ type: 'TIMELINE_PLAN_CREATED', payload: { plan: { ...plan, endSec: plan.startSec - 1 } } })).toThrow(/некорректный план/);
    expect(() => log.dispatch({ type: 'TIMELINE_PLAN_CANCELLED', payload: { planId: 'missing' } })).toThrow(/не найден/);
    log.dispatch({ type: 'TIMELINE_PLAN_CREATED', payload: { plan } });
    log.undo();
    expect(log.state.world.timelinePlans).toBeUndefined();
    log.redo();
    expect(log.state.world.timelinePlans?.[plan.id]?.status).toBe('active');
  });
});

describe('A5E downtime projects', () => {
  it('persist privately through replay, undo, and redo', () => {
    const st = createEngineStore(seed(), { ...fixed() });
    const project = {
      id: 'd10:project-1', actorId: 'bo', actorName: 'Bo Tambernack', activity: 'gather-information' as const,
      subject: 'гильдия', obscurity: 'uncommon' as const, skill: 'investigation' as const,
      requiredWeeks: 1, completedWeeks: 1, costPaidGp: 10, createdSec: 0, updatedSec: 0,
      source: 'a5e-srd:adventuring-8' as const, status: 'succeeded' as const, result: 'success' as const, lastCheckTotal: 10,
    };
    st.getState().dispatch({ type: 'A5E_DOWNTIME_PROJECT_UPDATED', payload: { project } });
    expect(st.getState().state.a5eDowntimeProjects?.[project.id]).toEqual(project);
    const journal = journalEntries(st.getState().events, st.getState().state);
    expect(journal.at(-1)?.secret).toBe(true);
    expect(filterJournal(journal, { dmView: false }).some(entry => entry.eventId === st.getState().events.at(-1)?.id)).toBe(false);
    st.getState().undo();
    expect(st.getState().state.a5eDowntimeProjects).toBeUndefined();
    st.getState().redo();
    expect(st.getState().state.a5eDowntimeProjects?.[project.id]).toEqual(project);
    const replay = new EventLog(seed(), st.getState().events, fixed());
    expect(replay.state.a5eDowntimeProjects?.[project.id]).toEqual(project);
  });
});

describe('тема A5E Strife кампании', () => {
  it('сохраняется отдельным событием, отменяется и возвращает прежнее значение', () => {
    const log = new EventLog(seed(), [], fixed());
    expect(log.state.a5eStrifeEnabled).toBeUndefined();
    log.dispatch({ type: 'CAMPAIGN_STRESS_THEME_SET', payload: { enabled: true } });
    expect(log.state.a5eStrifeEnabled).toBe(true);
    log.undo();
    expect(log.state.a5eStrifeEnabled).toBeUndefined();
    log.redo();
    expect(log.state.a5eStrifeEnabled).toBe(true);
  });

  it('уровень Strife и достигнутый эффект стресса хранятся и отменяются одним событием', () => {
    const initial = seed();
    initial.actors.bo.a5eConditions = { strife: 4 };
    initial.a5eStrifeEnabled = true;
    const log = new EventLog(initial, [], fixed());
    const shortEffect = { kind: 'short' as const, id: 'bewildered' as const, untilSec: 86_400 };
    log.dispatch({ type: 'A5E_TRACK_SET', payload: { actorId: 'bo', track: 'strife', level: 5, stressEffect: shortEffect } });
    expect(log.state.actors.bo.a5eConditions).toEqual({ strife: 5, mentalStress: shortEffect });
    log.undo();
    expect(log.state.actors.bo.a5eConditions).toEqual({ strife: 4 });
    log.redo();
    expect(log.state.actors.bo.a5eConditions).toEqual({ strife: 5, mentalStress: shortEffect });
    const longEffect = { kind: 'long' as const, id: 'covetous' as const };
    log.dispatch({ type: 'A5E_TRACK_SET', payload: { actorId: 'bo', track: 'strife', level: 7, stressEffect: longEffect } });
    expect(log.state.actors.bo.a5eConditions).toEqual({ strife: 7, mentalStress: longEffect });
    log.undo();
    expect(log.state.actors.bo.a5eConditions).toEqual({ strife: 5, mentalStress: shortEffect });
  });
});

describe('корреляция событий взаимодействия', () => {
  it('сохраняет interactionId при записи, компенсации и повторном чтении, сохраняя старые журналы', () => {
    const log = new EventLog(seed(), [], fixed());
    const original = log.dispatch({ type: 'DAMAGE_APPLIED', payload: { targetId: 'bo', amount: 1 } }, { interactionId: 'meeting-1' });
    expect(original.interactionId).toBe('meeting-1');

    const undone = log.undo();
    expect(undone?.compensation.interactionId).toBe('meeting-1');
    const redone = log.redo();
    expect(redone?.compensation.interactionId).toBe('meeting-1');

    const replayed = new EventLog(seed(), log.entries, fixed());
    expect(replayed.entries.map(event => event.interactionId)).toEqual(['meeting-1', 'meeting-1', 'meeting-1']);
    EventLog.check(replayed.entries);

    const { interactionId: _interactionId, ...legacyEvent } = original;
    const legacy = new EventLog(seed(), [{ ...legacyEvent, seq: 0 }], fixed());
    expect(legacy.entries[0].interactionId).toBeUndefined();
    expect(() => EventLog.check([{ ...original, interactionId: '   ' }])).toThrow(/пустой interactionId/);
  });

  it('предоставляет dispatchInInteraction на EngineStore', () => {
    const store = createEngineStore(seed(), fixed());
    const event = store.getState().dispatchInInteraction('meeting-2', { type: 'DAMAGE_APPLIED', payload: { targetId: 'bo', amount: 1 } });
    expect(event.interactionId).toBe('meeting-2');
    expect(store.getState().events.at(-1)?.interactionId).toBe('meeting-2');
  });

  it('связывает принятую мировую дельту с причиной-встречей и сохраняет связь в undo/replay', () => {
    const state = emptyState();
    state.world.factions.zh = { id: 'zh', name: 'Zhentarim', renown: 0 };
    const store = createEngineStore(state, fixed());
    const cause = store.getState().dispatchInInteraction('meeting-3', {
      type: 'DICE_ROLLED', payload: roll('1d20', { rng: () => 0.5, label: 'Influence · капитан', hidden: true }),
    });
    store.getState().propose({
      id: 'standing-after-request', scale: 'region', subject: 'Zhentarim · отношение',
      was: 'нейтральное', now: 'благосклонное', cause: 'Мастер принял последствие просьбы', causeId: cause.id,
      status: 'pending', patch: { kind: 'faction', id: 'zh', field: 'standing', value: 1 },
    });

    store.getState().accept('standing-after-request');
    expect(store.getState().events.at(-1)).toMatchObject({ type: 'WORLD_DELTA_ACCEPTED', interactionId: 'meeting-3' });
    expect(store.getState().state.world.factions.zh.standing).toBe(1);
    store.getState().undo();
    expect(store.getState().events.at(-1)?.interactionId).toBe('meeting-3');
    expect(store.getState().state.world.factions.zh.standing).toBe(0);

    const replayed = new EventLog(state, store.getState().events, fixed());
    expect(replayed.state.world.factions.zh.standing).toBe(0);
    expect(replayed.entries.at(-1)?.interactionId).toBe('meeting-3');
    store.getState().redo();
    expect(store.getState().state.world.factions.zh.standing).toBe(1);
    expect(store.getState().events.at(-1)?.interactionId).toBe('meeting-3');

    store.getState().propose({
      id: 'unapproved-standing-after-request', scale: 'region', subject: 'Zhentarim · отношение',
      was: 'нейтральное', now: 'благосклонное', cause: 'Мастер рассматривает последствие просьбы', causeId: cause.id,
      status: 'pending', patch: { kind: 'faction', id: 'zh', field: 'standing', value: 1 },
    });
    store.getState().reject('unapproved-standing-after-request', 'не принято мастером');
    expect(store.getState().events.at(-1)).toMatchObject({ type: 'WORLD_DELTA_REJECTED', interactionId: 'meeting-3' });
  });
});

describe('внимание к нитям', () => {
  it('заметка с нитью обновляет lastTouchedSec и отменяется/повторяется по снимку', () => {
    const initial = seed();
    initial.time.sec = 200;
    initial.world.threads.caravan = { id: 'caravan', name: 'Караван', status: 'open', openedSec: 0, lastTouchedSec: 100 };
    const store = createEngineStore(initial, fixed());
    const event = store.getState().dispatch({
      type: 'NOTE_ADDED', payload: { text: 'Обсудили следы каравана', threadIds: ['caravan', 'missing'], scale: 'region' },
    });
    expect(event.effect).toMatchObject({ kind: 'note', threads: [{ id: 'caravan', before: 100, after: 200 }] });
    expect(store.getState().state.world.threads.caravan.lastTouchedSec).toBe(200);
    store.getState().undo();
    expect(store.getState().state.world.threads.caravan.lastTouchedSec).toBe(100);
    store.getState().redo();
    expect(store.getState().state.world.threads.caravan.lastTouchedSec).toBe(200);
    const replayed = new EventLog(initial, store.getState().events, fixed());
    expect(replayed.state.world.threads.caravan.lastTouchedSec).toBe(200);
  });

  it('дополняет старый эффект заметки thread snapshot и сохраняет старый undo при реплее', () => {
    const initial = seed();
    initial.time.sec = 200;
    initial.world.threads.caravan = { id: 'caravan', name: 'Караван', status: 'open', openedSec: 0, lastTouchedSec: 100 };
    const payload = { text: 'Старая заметка', threadIds: ['caravan'], scale: 'region' as const };
    const note: DomainEvent<'NOTE_ADDED'> = {
      id: 'legacy-note', seq: 0, at: 1, worldSec: 200, type: 'NOTE_ADDED', payload,
      effect: { kind: 'note', noteId: 'legacy-note' },
    };
    const undo: DomainEvent<'NOTE_ADDED'> = {
      id: 'legacy-undo', seq: 1, at: 2, worldSec: 200, type: 'NOTE_ADDED', payload,
      undoes: 'legacy-note', effect: { kind: 'note', noteId: 'legacy-note' },
    };
    const replayed = new EventLog(initial, [note, undo], fixed());
    expect(replayed.state.world.threads.caravan.lastTouchedSec).toBe(100);
    expect(replayed.entries[0].effect).toMatchObject({ threads: [{ id: 'caravan', before: 100, after: 200 }] });
    expect(replayed.entries[1].effect).toMatchObject({ threads: [{ id: 'caravan', before: 200, after: 100 }] });
  });

  it('принятое решение и раскрытие связанного факта также касаются нити обратимо', () => {
    const initial = seed();
    initial.time.sec = 200;
    initial.world.threads.caravan = { id: 'caravan', name: 'Караван', status: 'open', openedSec: 0, lastTouchedSec: 100 };
    initial.deltas['thread-update'] = {
      id: 'thread-update', scale: 'region', subject: 'Нить · Караван', was: 'открыта', now: 'закрыта',
      cause: 'Мастер подтвердил исход', causeId: 'caravan', threadIds: ['caravan'], status: 'pending',
      patch: { kind: 'thread', id: 'caravan', status: 'closed' },
    };
    const store = createEngineStore(initial, fixed());
    store.getState().accept('thread-update');
    expect(store.getState().state.world.threads.caravan.lastTouchedSec).toBe(200);
    store.getState().undo();
    expect(store.getState().state.world.threads.caravan).toMatchObject({ status: 'open', lastTouchedSec: 100 });
    store.getState().redo();
    expect(store.getState().state.world.threads.caravan).toMatchObject({ status: 'closed', lastTouchedSec: 200 });

    const factState = seed();
    factState.time.sec = 200;
    factState.world.threads.caravan = { id: 'caravan', name: 'Караван', status: 'open', openedSec: 0, lastTouchedSec: 100 };
    factState.facts['caravan-lead'] = { id: 'caravan-lead', text: 'Письмо у архивариуса', visibility: 'dm', scale: 'region', threadIds: ['caravan'] };
    const factStore = createEngineStore(factState, fixed());
    factStore.getState().reveal('caravan-lead');
    expect(factStore.getState().state.world.threads.caravan.lastTouchedSec).toBe(200);
    factStore.getState().undo();
    expect(factStore.getState().state.world.threads.caravan.lastTouchedSec).toBe(100);
  });

  it('настройка часов меняет нить только после принятия и откатывается вместе с вниманием', () => {
    const initial = seed();
    initial.time.sec = 200;
    initial.world.threads.caravan = { id: 'caravan', name: 'Караван', status: 'open', openedSec: 0, lastTouchedSec: 100 };
    initial.deltas['clock-config'] = {
      id: 'clock-config', scale: 'region', subject: 'Часы нити · Караван', was: 'часы не настроены', now: '0/6',
      cause: 'Настройка мастера', causeId: 'caravan', threadIds: ['caravan'], status: 'pending',
      patch: { kind: 'threadClock', id: 'caravan', clock: { segments: 6, filled: 0, startedSec: 200 } },
    };
    const store = createEngineStore(initial, fixed());
    expect(store.getState().state.world.threads.caravan.clock).toBeUndefined();
    store.getState().accept('clock-config');
    expect(store.getState().state.world.threads.caravan.clock).toEqual({ segments: 6, filled: 0, startedSec: 200 });
    expect(store.getState().state.world.threads.caravan.lastTouchedSec).toBe(200);
    store.getState().undo();
    expect(store.getState().state.world.threads.caravan.clock).toBeUndefined();
    expect(store.getState().state.world.threads.caravan.lastTouchedSec).toBe(100);
    store.getState().redo();
    const replayed = new EventLog(initial, store.getState().events, fixed());
    expect(replayed.state.world.threads.caravan.clock).toEqual({ segments: 6, filled: 0, startedSec: 200 });
    expect(replayed.state.world.threads.caravan.lastTouchedSec).toBe(200);
  });
});

describe('публикация часов процесса', () => {
  it('меняет видимость и подпись только по принятому патчу; undo и replay возвращают точный снимок', () => {
    const initial = seed();
    initial.world.processes = {
      caravan: { id: 'caravan', kind: 'caravan', name: 'Secret route', scale: 'region', stage: 'transit', parties: [], startedSec: 0, nextSec: 300, vars: { routeIndex: 2 }, clock: { segments: 5, filled: 2 } },
    };
    initial.deltas['open-process-clock'] = {
      id: 'open-process-clock', scale: 'region', subject: 'Часы процесса · Secret route', was: 'скрыты', now: 'открыты игрокам: Караван идёт',
      cause: 'Мастер открыл счётчик', causeId: 'caravan', status: 'pending',
      patch: { kind: 'process', process: { ...initial.world.processes.caravan, clock: { segments: 5, filled: 2, playerVisible: true, playerLabel: 'Караван идёт' } } },
    };
    const store = createEngineStore(initial, fixed());
    store.getState().accept('open-process-clock');
    expect(store.getState().state.world.processes?.caravan.clock).toMatchObject({ playerVisible: true, playerLabel: 'Караван идёт' });
    store.getState().undo();
    expect(store.getState().state.world.processes?.caravan.clock).toEqual({ segments: 5, filled: 2 });
    store.getState().redo();
    const replayed = new EventLog(initial, store.getState().events, fixed());
    expect(replayed.state.world.processes?.caravan.clock).toMatchObject({ playerVisible: true, playerLabel: 'Караван идёт' });
  });
});

describe('хиты', () => {
  let log: EventLog;
  beforeEach(() => { log = new EventLog(seed(), [], fixed()); });

  it('урон снимает хиты и не уходит ниже нуля; отмена возвращает точно', () => {
    log.dispatch({ type: 'DAMAGE_APPLIED', payload: { targetId: 'bo', amount: 12 } });
    expect(log.state.actors.bo.hp.current).toBe(29);
    log.dispatch({ type: 'DAMAGE_APPLIED', payload: { targetId: 'bo', amount: 100 } });
    expect(log.state.actors.bo.hp.current).toBe(0);
    expect(log.undo()?.event.payload).toMatchObject({ amount: 100 });
    expect(log.state.actors.bo.hp.current).toBe(29);
    log.undo();
    expect(log.state.actors.bo.hp.current).toBe(41);
  });

  it('лечение не выше максимума', () => {
    log.dispatch({ type: 'HEALING_APPLIED', payload: { targetId: 'bo', amount: 30 } });
    expect(log.state.actors.bo.hp.current).toBe(49);
    log.undo();
    expect(log.state.actors.bo.hp.current).toBe(41);
  });

  it('временные хиты: уходят первыми, не лечат, не складываются', () => {
    log.dispatch({ type: 'TEMP_HP_GRANTED', payload: { targetId: 'bo', amount: 5 } });
    log.dispatch({ type: 'TEMP_HP_GRANTED', payload: { targetId: 'bo', amount: 3 } });
    expect(log.state.actors.bo.hp).toEqual({ current: 41, max: 49, temp: 5 });
    log.dispatch({ type: 'DAMAGE_APPLIED', payload: { targetId: 'bo', amount: 8 } });
    expect(log.state.actors.bo.hp).toEqual({ current: 38, max: 49, temp: 0 });
    // Отмена урона возвращает и временные хиты — лечение бы их не вернуло.
    log.undo();
    expect(log.state.actors.bo.hp).toEqual({ current: 41, max: 49, temp: 5 });
  });

  it('ноль и отрицательный урон, неизвестный актёр — в лог не попадают', () => {
    expect(() => log.dispatch({ type: 'DAMAGE_APPLIED', payload: { targetId: 'bo', amount: 0 } })).toThrow(EngineError);
    expect(() => log.dispatch({ type: 'HEALING_APPLIED', payload: { targetId: 'nobody', amount: 5 } })).toThrow(/нет актёра/);
    expect(log.length).toBe(0);
  });
});

describe('состояния', () => {
  let log: EventLog;
  beforeEach(() => { log = new EventLog(seed(), [], fixed()); });

  it('добавить, снять, отменить каждое', () => {
    log.dispatch({ type: 'CONDITION_ADDED', payload: { targetId: 'bo', conditionId: 'poisoned', until: 'конец следующего хода' } });
    expect(log.state.actors.bo.conditions.poisoned).toEqual({ until: 'конец следующего хода' });
    log.dispatch({ type: 'CONDITION_REMOVED', payload: { targetId: 'bo', conditionId: 'poisoned' } });
    expect(log.state.actors.bo.conditions.poisoned).toBeUndefined();
    log.undo();
    expect(log.state.actors.bo.conditions.poisoned).toEqual({ until: 'конец следующего хода' });
    log.undo();
    expect(log.state.actors.bo.conditions.poisoned).toBeUndefined();
  });

  it('истощение — уровнями 1–6, а не тумблером', () => {
    log.dispatch({ type: 'CONDITION_ADDED', payload: { targetId: 'bo', conditionId: 'exhaustion' } });
    log.dispatch({ type: 'CONDITION_ADDED', payload: { targetId: 'bo', conditionId: 'exhaustion' } });
    expect(log.state.actors.bo.conditions.exhaustion).toEqual({ level: 2 });
    log.dispatch({ type: 'CONDITION_ADDED', payload: { targetId: 'bo', conditionId: 'exhaustion', level: 6 } });
    log.dispatch({ type: 'CONDITION_ADDED', payload: { targetId: 'bo', conditionId: 'exhaustion' } });
    expect(log.state.actors.bo.conditions.exhaustion).toEqual({ level: 6 });
    log.dispatch({ type: 'CONDITION_REMOVED', payload: { targetId: 'bo', conditionId: 'exhaustion' } });
    expect(log.state.actors.bo.conditions.exhaustion).toEqual({ level: 5 });
    log.undo();
    expect(log.state.actors.bo.conditions.exhaustion).toEqual({ level: 6 });
    expect(() => log.dispatch({ type: 'CONDITION_ADDED', payload: { targetId: 'bo', conditionId: 'exhaustion', level: 7 } })).toThrow(/1–6/);
    expect(() => log.dispatch({ type: 'CONDITION_ADDED', payload: { targetId: 'bo', conditionId: 'prone', level: 2 } })).toThrow(/только у истощения/);
  });

  it('только состояния SRD', () => {
    expect(CONDITION_IDS).toHaveLength(15);
    expect(() => log.dispatch({ type: 'CONDITION_ADDED', payload: { targetId: 'bo', conditionId: 'dazed' as never } })).toThrow(/нет такого состояния/);
    expect(() => log.dispatch({ type: 'CONDITION_REMOVED', payload: { targetId: 'bo', conditionId: 'prone' } })).toThrow(/нет состояния/);
  });
});

describe('бой и время', () => {
  let log: EventLog;
  beforeEach(() => { log = new EventLog(seed(), [], fixed()); });

  const ORDER = [{ actorId: 'korrin', initiative: 18 }, { actorId: 'bo', initiative: 15 }, { actorId: 'captain', initiative: 14 }];

  it('без ENCOUNTER_STARTED хода нет; бой начался — порядок, раунд 1, ход первого; отмена возвращает всё', () => {
    expect(() => log.dispatch({ type: 'TURN_ADVANCED', payload: { round: 1, turnIndex: 0, actorId: 'korrin' } })).toThrow(/бой не начат/);
    log.dispatch({ type: 'ENCOUNTER_STARTED', payload: { order: ORDER } });
    expect(log.state.encounter).toEqual({ active: true, round: 1, turnIndex: 0, order: ['korrin', 'bo', 'captain'] });
    log.dispatch({ type: 'TURN_ADVANCED', payload: { round: 1, turnIndex: 1, actorId: 'bo' } });
    log.undo();
    expect(log.state.encounter).toMatchObject({ active: true, round: 1, turnIndex: 0 });
    log.undo();
    expect(log.state.encounter).toEqual({ active: false, round: 0, turnIndex: 0, order: [] });
    expect(() => log.dispatch({ type: 'ENCOUNTER_STARTED', payload: { order: [] } })).toThrow(/пуст/);
    expect(() => log.dispatch({ type: 'ENCOUNTER_STARTED', payload: { order: [ORDER[0], ORDER[0]] } })).toThrow(/дважды/);
    expect(() => log.dispatch({ type: 'ENCOUNTER_STARTED', payload: { order: [{ actorId: 'nobody', initiative: 1 }] } })).toThrow(/нет актёра/);
  });

  it('ход не на того, кто стоит на turnIndex, — ошибка; ENCOUNTER_ENDED чистит порядок и броски, отменяется целиком', () => {
    log.dispatch({ type: 'ENCOUNTER_STARTED', payload: { order: ORDER } });
    expect(() => log.dispatch({ type: 'TURN_ADVANCED', payload: { round: 1, turnIndex: 1, actorId: 'captain' } })).toThrow(/порядке инициативы/);
    expect(() => log.dispatch({ type: 'ENCOUNTER_STARTED', payload: { order: ORDER } })).toThrow(/уже идёт/);
    log.dispatch({ type: 'TURN_ADVANCED', payload: { round: 1, turnIndex: 1, actorId: 'bo' } });
    log.dispatch({ type: 'ENCOUNTER_ENDED', payload: { reason: 'бандиты сдались' } });
    expect(log.state.encounter).toEqual({ active: false, round: 0, turnIndex: 0, order: [] });
    expect(log.state.actors.bo.initiative).toBeUndefined();
    log.undo();
    expect(log.state.encounter).toEqual({ active: true, round: 1, turnIndex: 1, order: ['korrin', 'bo', 'captain'] });
    expect(log.state.actors.bo.initiative).toBe(15);
    expect(() => { log.redo(); log.dispatch({ type: 'ENCOUNTER_ENDED', payload: {} }); }).toThrow(/не идёт/);
  });

  it('INITIATIVE_SET переставляет порядок снимком: чей ход — тот и остаётся; выбывшего из порядка — ход следующему', () => {
    log.dispatch({ type: 'ENCOUNTER_STARTED', payload: { order: ORDER } });
    log.dispatch({ type: 'TURN_ADVANCED', payload: { round: 1, turnIndex: 1, actorId: 'bo' } });
    log.dispatch({ type: 'INITIATIVE_SET', payload: { order: [{ actorId: 'captain', initiative: 20 }, { actorId: 'bo', initiative: 15 }, { actorId: 'korrin', initiative: 3 }] } });
    expect(log.state.encounter).toMatchObject({ order: ['captain', 'bo', 'korrin'], turnIndex: 1, round: 1 });
    expect(log.state.actors.captain.initiative).toBe(20);
    log.dispatch({ type: 'INITIATIVE_SET', payload: { order: [{ actorId: 'captain', initiative: 20 }, { actorId: 'korrin', initiative: 3 }] } });
    expect(log.state.encounter).toMatchObject({ order: ['captain', 'korrin'], turnIndex: 1 }); // Bo ушёл из порядка, ход у следующего — Korrin
    expect(log.state.actors.bo.initiative).toBeUndefined();
    log.undo();
    log.undo();
    expect(log.state.encounter).toMatchObject({ order: ['korrin', 'bo', 'captain'], turnIndex: 1 });
    expect(log.state.actors.captain.initiative).toBe(14);
  });

  it('время идёт только вперёд шагами темпа; назад — отменой', () => {
    log.dispatch({ type: 'TIME_ADVANCED', payload: { tempo: 'tenday', steps: 1, fromDay: 0, toDay: 10, fromSec: 0, toSec: TEMPO_SECONDS.tenday } });
    expect(log.state.time).toEqual({ sec: 864_000, tempo: 'tenday' });
    expect(() => log.dispatch({ type: 'TIME_ADVANCED', payload: { tempo: 'hour', steps: 1, fromDay: 0, toDay: 0, fromSec: 0, toSec: 3600 } })).toThrow(/время ушло/);
    log.undo();
    expect(log.state.time.sec).toBe(0);
  });
});

describe('отдых (решение владельца 21.09.2026)', () => {
  let log: EventLog;
  const withSheets = (): State => {
    const s = seed();
    const sheet = { level: 5, raceId: 'r', classId: 'c', abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 12, cha: 8 }, proficiencyBonus: 3, skills: [], features: [], traits: [] } as const;
    s.actors.bo.sheet = { ...sheet };
    s.actors.korrin.sheet = { ...sheet };
    s.actors.bo.hp = { current: 20, max: 49, temp: 5 };
    s.actors.bo.conditions.exhaustion = { level: 2 };
    s.actors.korrin.conditions.exhaustion = { level: 1 };
    return s;
  };
  beforeEach(() => { log = new EventLog(withSheets(), [], fixed()); });

  it('короткий: кости хитов тратятся, хиты растут до максимума, кто не тратил — просто отдыхал; отмена возвращает и хиты, и кости', () => {
    log.dispatch({ type: 'REST_TAKEN', payload: { kind: 'short', actorIds: ['bo', 'korrin'], hitDice: [{ actorId: 'bo', dice: 2, healed: 13 }] } });
    expect(log.state.actors.bo).toMatchObject({ hp: { current: 33, max: 49, temp: 5 }, hitDiceSpent: 2 });
    expect(log.state.actors.korrin.hitDiceSpent).toBeUndefined();
    expect(log.state.actors.bo.conditions.exhaustion).toEqual({ level: 2 });
    log.dispatch({ type: 'REST_TAKEN', payload: { kind: 'short', actorIds: ['bo'], hitDice: [{ actorId: 'bo', dice: 3, healed: 40 }] } });
    expect(log.state.actors.bo).toMatchObject({ hp: { current: 49 }, hitDiceSpent: 5 });
    log.undo();
    expect(log.state.actors.bo).toMatchObject({ hp: { current: 33 }, hitDiceSpent: 2 });
    log.undo();
    expect(log.state.actors.bo).toMatchObject({ hp: { current: 20, temp: 5 } });
    expect(log.state.actors.bo.hitDiceSpent).toBeUndefined();
    expect(log.entries.at(-1)?.type).toBe('REST_TAKEN');
    expect(journalEntries(log.entries, log.state).at(0)?.text).toBe('Короткий отдых: Bo Tambernack +13 (2 кости хитов), Korrin Battlehammer');
  });

  it('долгий: хиты полны, временные сгорают, истощение на уровень меньше (с 1 — снимается), половина костей возвращается; отмена точна', () => {
    log.dispatch({ type: 'REST_TAKEN', payload: { kind: 'short', actorIds: ['bo'], hitDice: [{ actorId: 'bo', dice: 5, healed: 0 }] } });
    log.dispatch({ type: 'REST_TAKEN', payload: { kind: 'long', actorIds: ['bo', 'korrin', 'captain'] } });
    expect(log.state.actors.bo).toMatchObject({ hp: { current: 49, max: 49, temp: 0 }, hitDiceSpent: 3, conditions: { exhaustion: { level: 1 } } });
    expect(log.state.actors.korrin.conditions.exhaustion).toBeUndefined();
    expect(log.state.actors.captain.hp.current).toBe(65);
    expect(journalEntries(log.entries, log.state).at(-1)?.text).toBe('Долгий отдых: Bo Tambernack, Korrin Battlehammer, Bandit Captain');
    log.undo();
    expect(log.state.actors.bo).toMatchObject({ hp: { current: 20, temp: 5 }, hitDiceSpent: 5, conditions: { exhaustion: { level: 2 } } });
    expect(log.state.actors.korrin.conditions.exhaustion).toEqual({ level: 1 });
    expect(log.state.actors.captain.hp.current).toBe(45);
    log.redo();
    expect(log.state.actors.bo.hp.current).toBe(49);
  });

  it('что не проходит: в бою, без актёров, выбывший, дважды, кости у того, кто не отдыхает или без листа, больше оставшихся, кости на долгом', () => {
    const short = (hitDice: { actorId: string; dice: number; healed: number }[], actorIds = ['bo']) => () => log.dispatch({ type: 'REST_TAKEN', payload: { kind: 'short', actorIds, hitDice } });
    expect(() => log.dispatch({ type: 'REST_TAKEN', payload: { kind: 'long', actorIds: [] } })).toThrow(/некому/);
    expect(() => log.dispatch({ type: 'REST_TAKEN', payload: { kind: 'long', actorIds: ['bo', 'bo'] } })).toThrow(/дважды/);
    expect(short([{ actorId: 'korrin', dice: 1, healed: 5 }])).toThrow(/не отдыхает/);
    expect(short([{ actorId: 'captain', dice: 1, healed: 5 }], ['captain'])).toThrow(/нет листа/);
    expect(short([{ actorId: 'bo', dice: 6, healed: 5 }])).toThrow(/осталось 5/);
    expect(short([{ actorId: 'bo', dice: 0, healed: 5 }])).toThrow(/больше нуля/);
    expect(short([{ actorId: 'bo', dice: 1, healed: -1 }])).toThrow(/не меньше нуля/);
    expect(() => log.dispatch({ type: 'REST_TAKEN', payload: { kind: 'long', actorIds: ['bo'], hitDice: [{ actorId: 'bo', dice: 1, healed: 1 }] } })).toThrow(/только после провала Sleepless/);
    log.dispatch({ type: 'ACTOR_REMOVED', payload: { actorId: 'captain', reason: 'dead' } });
    expect(() => log.dispatch({ type: 'REST_TAKEN', payload: { kind: 'long', actorIds: ['captain'] } })).toThrow(/выбыл/);
    log.dispatch({ type: 'ENCOUNTER_STARTED', payload: { order: [{ actorId: 'bo', initiative: 1 }] } });
    expect(() => log.dispatch({ type: 'REST_TAKEN', payload: { kind: 'long', actorIds: ['bo'] } })).toThrow(/в бою/);
    // Ни одна ошибка не легла в лог.
    expect(log.entries.filter(e => e.type === 'REST_TAKEN')).toHaveLength(0);
  });
});

describe('поход и открытие места (решение владельца 27.10.2026)', () => {
  const withPlaces = () => {
    const s = seed();
    s.world.locations = {
      nw: { id: 'nw', name: 'Neverwinter', scale: 'settlement', geo: { map: 'toril', x: 8522, y: 2610 } },
      tb: { id: 'tb', name: 'Triboar', scale: 'settlement', geo: { map: 'toril', x: 8906, y: 2752 } },
    };
    s.actors.bo.locationId = 'nw';
    s.actors.korrin.locationId = 'nw';
    return s;
  };
  const route = { fromId: 'nw', toId: 'tb', map: 'toril', points: [{ x: 8522, y: 2610 }, { x: 8906, y: 2752 }], miles: 204.7, pace: 'normal' as const, days: 8.5 };

  it('партия переезжает целиком, выбывший — нет; отмена возвращает каждому его место, у кого не было — снова нет', () => {
    const s = withPlaces();
    s.party = ['bo', 'korrin', 'captain'];
    s.actors.captain.removed = true;
    const log = new EventLog(s, [], fixed());
    log.dispatch({ type: 'PARTY_TRAVELED', payload: route });
    expect(log.state.actors.bo.locationId).toBe('tb');
    expect(log.state.actors.korrin.locationId).toBe('tb');
    expect(log.state.actors.captain.locationId).toBeUndefined();
    log.undo();
    expect(log.state.actors.bo.locationId).toBe('nw');
    expect(log.state.actors.korrin.locationId).toBe('nw');
    log.redo();
    expect(log.state.actors.korrin.locationId).toBe('tb');
    const [entry] = journalEntries(log.entries.slice(0, 1), log.state);
    expect(entry).toMatchObject({ scale: 'region', text: 'Поход: Neverwinter → Triboar, 205 миль, 8,5 дня (обычный темп)' });
    expect(describeEvent({ ...log.entries[0], payload: { ...route, difficult: true, days: 17 } } as never, log.state)).toBe('Поход: Neverwinter → Triboar, 205 миль, 17 дней (обычный темп, трудная местность)');
  });

  it('проверки: куда — существующее место, путь — две точки, темп SRD, в бою — нельзя; не прошедшее в лог не попадает', () => {
    const log = new EventLog(withPlaces(), [], fixed());
    const go = (patch: object) => () => log.dispatch({ type: 'PARTY_TRAVELED', payload: { ...route, ...patch } as never });
    expect(go({ toId: 'nowhere' })).toThrow(/нет места/);
    expect(go({ points: [{ x: 0, y: 0 }] })).toThrow(/две точки/);
    expect(go({ pace: 'gallop' })).toThrow(/темп похода/);
    expect(go({ days: 0 })).toThrow(EngineError);
    log.dispatch({ type: 'ENCOUNTER_STARTED', payload: { order: [{ actorId: 'bo', initiative: 15 }] } });
    expect(go({})).toThrow(/в бою/);
    expect(log.entries.filter(e => e.type === 'PARTY_TRAVELED')).toHaveLength(0);
  });

  it('место открыто игрокам: флаг на месте, дважды — нельзя, отмена снимает; запись журнала — игрокам', () => {
    const log = new EventLog(withPlaces(), [], fixed());
    log.dispatch({ type: 'PLACE_REVEALED', payload: { locationId: 'tb' } });
    expect(log.state.world.locations.tb.revealed).toBe(true);
    expect(() => log.dispatch({ type: 'PLACE_REVEALED', payload: { locationId: 'tb' } })).toThrow(/уже открыто/);
    expect(() => log.dispatch({ type: 'PLACE_REVEALED', payload: { locationId: 'x' } })).toThrow(/нет места/);
    const [entry] = journalEntries(log.entries, log.state);
    expect(entry).toMatchObject({ origin: 'players', scale: 'settlement', text: 'Открыто игрокам: Triboar' });
    log.undo();
    expect(log.state.world.locations.tb.revealed).toBeUndefined();
  });

  it('реплей лога с походом даёт то же состояние', () => {
    const log = new EventLog(withPlaces(), [], fixed());
    log.dispatch({ type: 'PARTY_TRAVELED', payload: route });
    log.dispatch({ type: 'PLACE_REVEALED', payload: { locationId: 'nw' } });
    log.undo();
    const again = new EventLog(withPlaces(), log.entries, fixed());
    expect(again.state).toEqual(log.state);
  });
});

describe('знание партии (KNOWLEDGE_REVEALED, решение владельца 29.10.2026)', () => {
  let log: EventLog;
  beforeEach(() => { log = new EventLog(seed(), [], fixed()); });
  const reveal = (extra: Partial<PayloadByType['KNOWLEDGE_REVEALED']> = {}) =>
    log.dispatch({ type: 'KNOWLEDGE_REVEALED', payload: { ref: 'deity:lathander', name: 'Lathander', fact: { label: 'Сфера', value: 'Dawn' }, ...extra } });

  it('строка в тетради снимком: когда, кто, проверка; отмена убирает, повтор возвращает; журнал — игрокам', () => {
    reveal({ by: 'bo', check: { skill: 'religion', dc: 15, total: 17 } });
    expect(log.state.knowledge?.['deity:lathander']).toEqual({
      ref: 'deity:lathander', name: 'Lathander', facts: [{ label: 'Сфера', value: 'Dawn', sec: log.state.time.sec, by: 'bo', check: { skill: 'religion', dc: 15, total: 17 } }],
    });
    reveal({ fact: { label: 'Символ', value: 'Sunrise' } });
    expect(log.state.knowledge?.['deity:lathander'].facts.map(f => f.label)).toEqual(['Сфера', 'Символ']);
    const entries = journalEntries(log.entries, log.state);
    expect(entries.map(e => e.text)).toEqual([
      'Партия узнала: Lathander — Сфера: Dawn · Bo Tambernack, Religion 17 против Сл 15',
      'Партия узнала: Lathander — Символ: Sunrise · волей мастера',
    ]);
    expect(entries.every(e => e.origin === 'players' && !e.secret)).toBe(true);
    log.undo();
    log.undo();
    expect(log.state.knowledge).toBeUndefined();
    log.redo();
    expect(log.state.knowledge?.['deity:lathander']).toMatchObject({ name: 'Lathander', facts: [{ label: 'Сфера' }] });
  });

  it('проверки: уже знают; неудача не открывает; нет актёра, навыка, ссылки; не прошедшее в лог не попадает', () => {
    reveal();
    expect(() => reveal()).toThrow(/уже знает/);
    expect(() => reveal({ fact: { label: 'Символ', value: 'S' }, check: { skill: 'religion', dc: 15, total: 12 } })).toThrow(/12 против Сл 15 — факт не открыт/);
    expect(() => reveal({ fact: { label: 'Символ', value: 'S' }, by: 'nobody' })).toThrow(/нет актёра/);
    expect(() => reveal({ fact: { label: 'Символ', value: 'S' }, check: { skill: 'cooking', dc: 10, total: 12 } as never })).toThrow(/нет навыка/);
    expect(() => reveal({ ref: 'nonsense' as never })).toThrow(/не ссылка/);
    expect(() => reveal({ fact: { label: 'Символ', value: ' ' } })).toThrow(EngineError);
    expect(log.entries.filter(e => e.type === 'KNOWLEDGE_REVEALED')).toHaveLength(1);
  });
});

describe('припасы партии (решение владельца 29.10.2026)', () => {
  let log: EventLog;
  beforeEach(() => { log = new EventLog(seed(), [], fixed()); });
  const supply = (reason: 'bought' | 'foraged' | 'found' | 'eaten' | 'lost', amount: number, shortfall?: number) =>
    log.dispatch({ type: 'SUPPLY_CHANGED', payload: shortfall ? { reason, amount, shortfall } : { reason, amount } });

  it('общий запас: прибавка и трата по причине, нет поля — ноль; отмена и повтор точны; журнал — остаток из следа', () => {
    expect(log.state.supply).toBeUndefined();
    supply('bought', 10);
    supply('eaten', 4);
    supply('lost', 1);
    expect(log.state.supply).toBe(5);
    log.undo();
    expect(log.state.supply).toBe(6);
    log.redo();
    expect(log.state.supply).toBe(5);
    const texts = journalEntries(log.entries, log.state).map(e => e.text);
    expect(texts).toContain('Припасы +10, куплено (осталось 10)');
    expect(texts).toContain('Припасы −4, съедено (осталось 6)');
    expect(journalEntries(log.entries, log.state)[0].scale).toBe('region');
  });

  it('нехватка: съедено сколько было, «не хватило» — в том же событии, и при пустом мешке тоже', () => {
    supply('bought', 2);
    supply('eaten', 2, 2);
    supply('eaten', 0, 4);
    expect(log.state.supply).toBe(0);
    const last = journalEntries(log.entries, log.state).find(e => e.text.startsWith('Припасы −0'));
    expect(last?.text).toBe('Припасы −0, съедено (осталось 0) · не хватило 4: без Supply на длинном отдыхе — уровень усталости (A5E)');
  });

  it('проверки: не больше, чем есть; целое больше нуля; «не хватило» — только у съеденного; не прошедшее в лог не попадает', () => {
    supply('bought', 3);
    expect(() => supply('lost', 4)).toThrow(/припасов 3, а списывается 4/);
    expect(() => supply('bought', 0)).toThrow(EngineError);
    expect(() => supply('bought', 1.5)).toThrow(EngineError);
    expect(() => supply('found', 1, 2)).toThrow(/только у съеденного/);
    expect(() => log.dispatch({ type: 'SUPPLY_CHANGED', payload: { reason: 'stolen', amount: 1 } as never })).toThrow(/нет такой причины/);
    expect(log.entries.filter(e => e.type === 'SUPPLY_CHANGED')).toHaveLength(1);
  });

  it('реплей лога с припасами даёт то же состояние', () => {
    supply('bought', 7);
    supply('eaten', 3, 1);
    log.undo();
    expect(new EventLog(seed(), log.entries, fixed()).state).toEqual(log.state);
  });
});

describe('ресурсы персонажа (решение владельца 21.09.2026)', () => {
  let log: EventLog;
  beforeEach(() => { log = new EventLog(seed(), [], fixed()); });
  const spend = (resourceId: 'slot-1' | 'ki' | 'lay-on-hands', amount: number, max: number, actorId = 'bo') => log.dispatch({ type: 'RESOURCE_SPENT', payload: { actorId, resourceId, amount, max } });
  const restore = (resourceId: 'slot-1' | 'ki', amount: number, max: number, actorId = 'bo') => log.dispatch({ type: 'RESOURCE_RESTORED', payload: { actorId, resourceId, amount, max } });

  it('трата копится по id, восстановление снимает; ноль убирает запись, пустая карта — поле; отмена точна', () => {
    spend('slot-1', 1, 4);
    spend('slot-1', 2, 4);
    spend('ki', 1, 5);
    expect(log.state.actors.bo.resourcesSpent).toEqual({ 'slot-1': 3, ki: 1 });
    restore('ki', 1, 5);
    expect(log.state.actors.bo.resourcesSpent).toEqual({ 'slot-1': 3 });
    restore('slot-1', 3, 4);
    expect(log.state.actors.bo.resourcesSpent).toBeUndefined();
    log.undo();
    expect(log.state.actors.bo.resourcesSpent).toEqual({ 'slot-1': 3 });
    log.undo(); log.undo();
    expect(log.state.actors.bo.resourcesSpent).toEqual({ 'slot-1': 3 });
    log.undo();
    expect(log.state.actors.bo.resourcesSpent).toEqual({ 'slot-1': 1 });
    log.redo();
    expect(log.state.actors.bo.resourcesSpent).toEqual({ 'slot-1': 3 });
  });

  it('журнал: подпись из реестра SRD и «осталось из максимума» по следу события, не по текущему состоянию', () => {
    spend('slot-1', 1, 4);
    spend('lay-on-hands', 7, 25);
    restore('slot-1', 1, 4);
    const texts = journalEntries(log.entries, log.state).map(e => e.text);
    expect(texts).toEqual(['Ячейки 1-го круга −1: Bo Tambernack (3 из 4)', 'Наложение рук −7: Bo Tambernack (18 из 25)', 'Ячейки 1-го круга +1: Bo Tambernack (4 из 4)']);
  });

  it('что не проходит: больше максимума, возврат сверх потраченного, ноль, неизвестный ресурс, выбывший', () => {
    spend('slot-1', 3, 4);
    expect(() => spend('slot-1', 2, 4)).toThrow(/осталось 1 из 4/);
    expect(() => restore('slot-1', 4, 4)).toThrow(/потрачено 3/);
    expect(() => spend('slot-1', 0, 4)).toThrow(/больше нуля/);
    expect(() => log.dispatch({ type: 'RESOURCE_SPENT', payload: { actorId: 'bo', resourceId: 'mana' as never, amount: 1, max: 4 } })).toThrow(/нет такого ресурса/);
    expect(() => log.dispatch({ type: 'RESOURCE_SPENT', payload: { actorId: 'bo', resourceId: 'ki', amount: 1, max: -1 } })).toThrow(/не меньше нуля/);
    log.dispatch({ type: 'ACTOR_REMOVED', payload: { actorId: 'captain', reason: 'dead' } });
    expect(() => spend('ki', 1, 2, 'captain')).toThrow(/выбыл/);
    expect(log.state.actors.bo.resourcesSpent).toEqual({ 'slot-1': 3 });
  });

  it('отдых: короткий возвращает только перечисленное (система предлагает, мастер видит список), долгий — всё; отмена возвращает потраченное', () => {
    const s = seed();
    s.actors.bo.sheet = { level: 5, raceId: 'r', classId: 'c', abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 12, cha: 8 }, proficiencyBonus: 3, skills: [], features: [], traits: [] };
    log = new EventLog(s, [], fixed());
    spend('slot-1', 2, 4);
    spend('ki', 3, 5);
    log.dispatch({ type: 'REST_TAKEN', payload: { kind: 'short', actorIds: ['bo'], resources: [{ actorId: 'bo', resourceId: 'ki' }] } });
    expect(log.state.actors.bo.resourcesSpent).toEqual({ 'slot-1': 2 });
    expect(journalEntries(log.entries, log.state).at(-1)?.text).toBe('Короткий отдых: Bo Tambernack Очки ци');
    log.dispatch({ type: 'REST_TAKEN', payload: { kind: 'long', actorIds: ['bo'] } });
    expect(log.state.actors.bo.resourcesSpent).toBeUndefined();
    log.undo();
    expect(log.state.actors.bo.resourcesSpent).toEqual({ 'slot-1': 2 });
    log.undo();
    expect(log.state.actors.bo.resourcesSpent).toEqual({ 'slot-1': 2, ki: 3 });
    expect(() => log.dispatch({ type: 'REST_TAKEN', payload: { kind: 'short', actorIds: ['bo'], resources: [{ actorId: 'bo', resourceId: 'rage' }] } })).toThrow(/не тратились/);
    expect(() => log.dispatch({ type: 'REST_TAKEN', payload: { kind: 'short', actorIds: ['bo'], resources: [{ actorId: 'korrin', resourceId: 'ki' }] } })).toThrow(/не отдыхает/);
    expect(() => log.dispatch({ type: 'REST_TAKEN', payload: { kind: 'long', actorIds: ['bo'], resources: [{ actorId: 'bo', resourceId: 'ki' }] } })).toThrow(/только после провала Sleepless/);
  });

  it('состояние со сроком в мировом времени: срок в прошлом не проходит, срок хранится в снимке и откатывается', () => {
    expect(() => log.dispatch({ type: 'CONDITION_ADDED', payload: { targetId: 'bo', conditionId: 'poisoned', untilSec: log.state.time.sec } })).toThrow(/срок уже прошёл/);
    log.dispatch({ type: 'CONDITION_ADDED', payload: { targetId: 'bo', conditionId: 'poisoned', untilSec: log.state.time.sec + 600 } });
    expect(log.state.actors.bo.conditions.poisoned).toEqual({ untilSec: log.state.time.sec + 600 });
    log.undo();
    expect(log.state.actors.bo.conditions.poisoned).toBeUndefined();
  });
});

describe('предложения мира и факты', () => {
  let log: EventLog;
  beforeEach(() => { log = new EventLog(seed(), [], fixed()); });

  it('принять, отменить — снова во входящих; принять дважды нельзя', () => {
    log.dispatch({ type: 'WORLD_DELTA_ACCEPTED', payload: { deltaId: 'd1', subject: 'Zhentarim · Triboar Trail', was: 'влияние 2', now: 'влияние 3', causeId: 'f-caravan' } });
    expect(log.state.deltas.d1.status).toBe('accepted');
    expect(() => log.dispatch({ type: 'WORLD_DELTA_REJECTED', payload: { deltaId: 'd1' } })).toThrow(/уже решено/);
    log.undo();
    expect(log.state.deltas.d1.status).toBe('pending');
  });

  it('переброс меняет предложение, не мир, и в журнал не пишется', () => {
    log.dispatch({ type: 'WORLD_DELTA_REROLLED', payload: { deltaId: 'd1', variantId: 'v2' } });
    expect(log.state.deltas.d1).toMatchObject({ status: 'pending', now: 'влияние 2', cause: 'Harpers перехватили курьера', variantId: 'v2' });
    expect(journalEntries(log.entries, log.state)).toHaveLength(0);
    log.undo();
    expect(log.state.deltas.d1).toMatchObject({ now: 'влияние 3', variantId: undefined });
    expect(() => log.dispatch({ type: 'WORLD_DELTA_REROLLED', payload: { deltaId: 'd1', variantId: 'v9' } })).toThrow(/нет варианта/);
  });

  it('факт открывается игрокам и закрывается отменой', () => {
    log.dispatch({ type: 'FACT_REVEALED', payload: { factId: 'f-caravan', audience: 'players' } });
    expect(log.state.facts['f-caravan'].visibility).toBe('players');
    log.undo();
    expect(log.state.facts['f-caravan'].visibility).toBe('dm');
  });
});

describe('связность лога, повтор, реплей', () => {
  it('лог остаётся связным после серии отмен и повторов, реплей даёт то же состояние', () => {
    const log = new EventLog(seed(), [], fixed());
    log.dispatch({ type: 'DAMAGE_APPLIED', payload: { targetId: 'bo', amount: 12 } });
    log.dispatch({ type: 'HEALING_APPLIED', payload: { targetId: 'bo', amount: 4 } });
    log.dispatch({ type: 'CONDITION_ADDED', payload: { targetId: 'bo', conditionId: 'prone' } });
    log.dispatch({ type: 'DICE_ROLLED', payload: roll('1d20+7', { rng: () => 0.5, label: 'атака' }) });
    log.undo(); // prone
    log.undo(); // лечение
    log.redo(); // лечение снова
    log.dispatch({ type: 'NOTE_ADDED', payload: { text: 'караван так и не нашли', threadIds: ['caravan'], scale: 'region' } });
    expect(log.peekRedo()).toBeNull(); // новое действие обрывает ветку повтора
    EventLog.check(log.entries);
    expect(log.entries.every((e, i) => e.seq === i)).toBe(true);
    expect(log.state.actors.bo.hp.current).toBe(33);
    expect(log.state.actors.bo.conditions.prone).toBeUndefined();

    const replayed = new EventLog(seed(), JSON.parse(JSON.stringify(log.entries)), fixed());
    expect(replayed.state).toEqual(log.state);
    expect(replayed.peekUndo()?.id).toBe(log.peekUndo()?.id);
    expect(replayed.peekRedo()).toBeNull();
  });

  it('бросок не отменяется — Ctrl+Z перепрыгивает через него', () => {
    const log = new EventLog(seed(), [], fixed());
    log.dispatch({ type: 'DAMAGE_APPLIED', payload: { targetId: 'bo', amount: 5 } });
    log.dispatch({ type: 'DICE_ROLLED', payload: roll('2d6', { rng: () => 0 }) });
    expect(log.peekUndo()?.type).toBe('DAMAGE_APPLIED');
    log.undo();
    expect(log.state.actors.bo.hp.current).toBe(41);
    expect(log.length).toBe(3);
    expect(log.peekUndo()).toBeNull();
  });

  it('порванный лог не реплеится', () => {
    const log = new EventLog(seed(), [], fixed());
    log.dispatch({ type: 'DAMAGE_APPLIED', payload: { targetId: 'bo', amount: 5 } });
    log.undo();
    const broken = JSON.parse(JSON.stringify(log.entries)).slice(1);
    expect(() => new EventLog(seed(), broken, fixed())).toThrow(/лог порван/);
    expect(() => EventLog.check(broken)).toThrow();
  });

  it('состояние не мутируется: старая ссылка остаётся прежней', () => {
    const initial = seed();
    const log = new EventLog(initial, [], fixed());
    const before = log.state;
    log.dispatch({ type: 'DAMAGE_APPLIED', payload: { targetId: 'bo', amount: 5 } });
    expect(before.actors.bo.hp.current).toBe(41);
    expect(initial.actors.bo.hp.current).toBe(41);
    expect(log.state).not.toBe(before);
  });

  it('apply чист: одно и то же событие на одном состоянии даёт один результат', () => {
    const s = seed();
    const e = { id: 'x', seq: 0, at: 0, worldSec: 0, type: 'DAMAGE_APPLIED' as const, payload: { targetId: 'bo', amount: 7 } };
    expect(apply(s, e)).toEqual(apply(s, e));
  });
});

describe('журнал — проекция', () => {
  it('записи по-русски, компенсации — «Отменено: …», переброс не пишется', () => {
    const log = new EventLog(seed(), [], fixed());
    log.dispatch({ type: 'DAMAGE_APPLIED', payload: { targetId: 'bo', amount: 12, sourceId: 'captain' } });
    log.dispatch({ type: 'CONDITION_ADDED', payload: { targetId: 'bo', conditionId: 'poisoned' } });
    log.dispatch({ type: 'WORLD_DELTA_REROLLED', payload: { deltaId: 'd1', variantId: 'v2' } });
    log.dispatch({ type: 'TIME_ADVANCED', payload: { tempo: 'day', steps: 3, fromDay: 0, toDay: 3, fromSec: 0, toSec: 3 * 86_400 } });
    log.undo();
    const j = journalEntries(log.entries, log.state);
    expect(j.map(x => x.text)).toEqual([
      'Урон 12 по Bo Tambernack от Bandit Captain',
      'Отравлен: Bo Tambernack',
      'Время: +3 дня (3 дня)',
      'Отменено: Время: +3 дня (3 дня)',
    ]);
    expect(j[2].undone).toBe(true);
    expect(j[3].compensation).toBe('undo');
    expect(j[3].eventId).toBe(j[2].eventId);
  });

  it('скрытый бросок помечен, принятая дельта несёт causeId и масштаб', () => {
    const log = new EventLog(seed(), [], fixed());
    log.dispatch({ type: 'DICE_ROLLED', payload: roll('1d20+7', { rng: () => 0.999, hidden: true, label: 'Восприятие' }) });
    log.dispatch({ type: 'WORLD_DELTA_ACCEPTED', payload: { deltaId: 'd1', subject: 'Zhentarim · Triboar Trail', was: 'влияние 2', now: 'влияние 3', causeId: 'f-caravan' } });
    const [dice, delta] = journalEntries(log.entries, log.state);
    expect(dice.hidden).toBe(true);
    expect(dice.text).toBe('Восприятие: 1d20+7 = 27 [20+7] · скрытый');
    expect(delta).toMatchObject({ causeId: 'f-caravan', scale: 'region', text: 'Принято: Zhentarim · Triboar Trail — влияние 2 → влияние 3' });
  });

  it('у каждого типа есть текст', () => {
    const s = seed();
    const samples: Record<string, unknown> = {
      A5E_TRACK_SET: { actorId: 'bo', track: 'strife', level: 1 },
      A5E_STRESS_EFFECT_USED: { actorId: 'bo', effect: 'distraught-aid' },
      CAMPAIGN_REST_LAYER_SET: { layer: 'a5e' },
      CAMPAIGN_STRESS_THEME_SET: { enabled: true },
      CAMPAIGN_SETTING_PACKAGE_SET: { packageId: 'fr' },
      NPC_SOCIAL_UPDATED: { actorId: 'bo', note: 'отношение изменено' },
      PERSON_RELATIONSHIP_UPDATED: { personId: 'person:sample', personName: 'Справочный NPC', targetId: 'bo', note: 'отношение изменено' },
      DAMAGE_APPLIED: { targetId: 'bo', amount: 1 }, HEALING_APPLIED: { targetId: 'bo', amount: 1 }, TEMP_HP_GRANTED: { targetId: 'bo', amount: 1 },
      CONDITION_ADDED: { targetId: 'bo', conditionId: 'prone' }, CONDITION_REMOVED: { targetId: 'bo', conditionId: 'prone' },
      DICE_ROLLED: { formula: '1d20', dice: [5], mod: 0, total: 5, hidden: false, label: '' }, TURN_ADVANCED: { round: 1, turnIndex: 0, actorId: 'korrin' },
      TIME_ADVANCED: { tempo: 'hour', steps: 8, fromDay: 0, toDay: 0, fromSec: 0, toSec: 8 * 3600 },
      WORLD_DELTA_ACCEPTED: { deltaId: 'd1', subject: 's', was: 'a', now: 'b', causeId: 'c' }, WORLD_DELTA_REJECTED: { deltaId: 'd1', reason: 'не верю' },
      WORLD_DELTA_REROLLED: { deltaId: 'd1', variantId: 'v2' }, FACT_REVEALED: { factId: 'f-caravan', audience: 'players' },
      NOTE_ADDED: { text: 'заметка', threadIds: [], scale: 'settlement' },
      A5E_DOWNTIME_PROJECT_UPDATED: { project: { id: 'd10-1', actorId: 'bo', actorName: 'Bo Tambernack', activity: 'gather-information', subject: 'гильдия', obscurity: 'uncommon', skill: 'investigation', requiredWeeks: 1, completedWeeks: 1, costPaidGp: 10, createdSec: 0, updatedSec: 0, source: 'a5e-srd:adventuring-8', status: 'succeeded', result: 'success', lastCheckTotal: 10 } },
      A5E_WORK_RESOLVED: { actorId: 'bo', skill: 'performance', difficulty: 'easy', total: 15, disadvantageApplied: false, earningsDice: [4], earningsGp: 4, source: 'a5e-srd:adventuring-8' },
      ENCOUNTER_STARTED: { order: [{ actorId: 'korrin', initiative: 18 }] }, ENCOUNTER_ENDED: { reason: 'сдались' },
      INITIATIVE_SET: { order: [{ actorId: 'bo', initiative: 15 }] },
      CONCENTRATION_STARTED: { actorId: 'bo', spell: "Hunter's Mark", untilSec: 3600 }, CONCENTRATION_ENDED: { actorId: 'bo', reason: 'save' },
      ACTOR_SPAWNED: { actor: s.actors.captain, party: false }, ACTOR_REMOVED: { actorId: 'captain', reason: 'dead' },
      WORLD_DELTA_PROPOSED: { delta: s.deltas.d1 },
      ITEM_GAINED: { stack: { id: 'x', itemId: 'longsword', qty: 1, owner: { kind: 'actor', id: 'bo' }, storage: { kind: 'actor', id: 'bo' } } },
      INVENTORY_CONTAINER_CREATED: { container: { id: 'camp:one', name: 'Лагерь у тракта', kind: 'camp' } },
      INVENTORY_CONTAINER_REMOVED: { containerId: 'camp:one' },
      TRANSPORT_CREATED: { transport: { id: 'transport:one', name: 'Повозка' } },
      TRANSPORT_REMOVED: { transportId: 'transport:one' },
      COINS_EXCHANGED: { stackId: 'x', qty: 1, toCoinId: 'coin:sp', toQty: 10, receiveStackId: 'y' },
      ITEM_LOST: { stackId: 'x', qty: 1 },
      ITEM_MOVED: { stackId: 'x', qty: 1, to: { kind: 'party' } },
      ITEM_TRANSFERRED: { stackId: 'x', qty: 1, owner: { kind: 'party' }, to: { kind: 'party' } },
      ITEM_GIFTED: { stackId: 'x', qty: 1, giverId: 'bo', recipientId: 'captain' },
      PERSON_ITEM_GIFTED: { stackId: 'x', qty: 1, giverId: 'bo', personId: 'person:sample', personName: 'Справочный NPC' },
      TRADE_OFFER_CREATED: { offerId: 'sample-offer', trade: { seller: { kind: 'actor', id: 'captain' }, buyer: { kind: 'actor', id: 'bo' }, itemStackId: 'sale-item', itemQty: 1, payments: [{ stackId: 'payment', qty: 2 }], priceCopper: 200, priceSource: { kind: 'house-rule', citation: 'цена мастера' } } },
      TRADE_OFFER_WITHDRAWN: { offerId: 'sample-offer' },
      TRADE_COMPLETED: { seller: { kind: 'actor', id: 'captain' }, buyer: { kind: 'actor', id: 'bo' }, itemStackId: 'sale-item', itemQty: 1, payments: [{ stackId: 'payment', qty: 2 }], priceCopper: 200, priceSource: { kind: 'house-rule', citation: 'цена мастера' } },
      ATTUNEMENT_CHANGED: { stackId: 'x', actorId: 'bo' },
      ITEM_EQUIPPED: { stackId: 'x', actorId: 'bo', wornAs: 'armor' }, ITEM_UNEQUIPPED: { stackId: 'x', actorId: 'bo' },
      REST_TAKEN: { kind: 'short', actorIds: ['bo', 'korrin'], hitDice: [{ actorId: 'bo', dice: 2, healed: 13 }] },
      RESOURCE_SPENT: { actorId: 'bo', resourceId: 'slot-1', amount: 1, max: 4 }, RESOURCE_RESTORED: { actorId: 'bo', resourceId: 'ki', amount: 2, max: 5 },
      PARTY_TRAVELED: { toId: 'nw', map: 'toril', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], miles: 1, pace: 'normal', days: 0.1 },
      PLACE_REVEALED: { locationId: 'nw' },
      SUPPLY_CHANGED: { reason: 'eaten', amount: 2, shortfall: 2 },
      KNOWLEDGE_REVEALED: { ref: 'organization:zhentarim', name: 'Zhentarim', fact: { label: 'Девиз', value: 'x' } },
      CHARACTER_LEVELED: { actorId: 'bo', sheet: { level: 6 }, hpMax: 50, ac: 15, passivePerception: 12, hp: { method: 'average', value: 6 }, gained: [] },
      SHEET_EDITED: { actorId: 'bo', patch: { alignment: 'Н' }, reason: 'игрок' },
      TOKEN_MOVED: { actorId: 'bo', to: { x: 3, y: 4 }, source: 'maptool' },
    };
    for (const t of EVENT_TYPES) {
      expect(samples[t], t).toBeDefined();
      const text = describeEvent({ id: 'x', seq: 0, at: 0, worldSec: 0, type: t, payload: samples[t] as never }, s);
      expect(text.length, t).toBeGreaterThan(3);
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

describe('TOKEN_MOVED — ход токена (Q17)', () => {
  it('клетка ставится, первый ход берёт «откуда» у MapTool, отмена возвращает прежнюю', () => {
    const st = createEngineStore(seed(), { ...fixed() });
    st.getState().moveToken('korrin', { x: 4, y: 3 }, 'maptool', { x: 2, y: 2 });
    expect(st.getState().state.actors.korrin.cell).toEqual({ x: 4, y: 3 });
    st.getState().moveToken('korrin', { x: -1, y: 3 }, 'dm');
    expect(st.getState().state.actors.korrin.cell).toEqual({ x: -1, y: 3 });
    const j = journalEntries(st.getState().events, st.getState().state);
    expect(j.map(e => e.text)).toEqual(['Korrin Battlehammer: клетка (2, 2) → (4, 3) · MapTool', 'Korrin Battlehammer: клетка (4, 3) → (-1, 3)']);
    st.getState().undo();
    expect(st.getState().state.actors.korrin.cell).toEqual({ x: 4, y: 3 });
    // Первый ход знал «откуда» только со слов MapTool — отмена ставит токен туда, где он стоял в MapTool.
    st.getState().undo();
    expect(st.getState().state.actors.korrin.cell).toEqual({ x: 2, y: 2 });
  });
  it('нет актёра, дробная клетка, чужой источник и ход на ту же клетку — ошибка', () => {
    const log = new EventLog(seed(), [], fixed());
    expect(() => log.dispatch({ type: 'TOKEN_MOVED', payload: { actorId: 'nobody', to: { x: 1, y: 1 }, source: 'maptool' } })).toThrow(/нет актёра/);
    expect(() => log.dispatch({ type: 'TOKEN_MOVED', payload: { actorId: 'bo', to: { x: 1.5, y: 1 }, source: 'maptool' } })).toThrow(/пара целых/);
    expect(() => log.dispatch({ type: 'TOKEN_MOVED', payload: { actorId: 'bo', to: { x: 1, y: 1 }, source: 'roll20' as never } })).toThrow(/источник/);
    log.dispatch({ type: 'TOKEN_MOVED', payload: { actorId: 'bo', to: { x: 1, y: 1 }, source: 'maptool' } });
    expect(() => log.dispatch({ type: 'TOKEN_MOVED', payload: { actorId: 'bo', to: { x: 1, y: 1 }, source: 'maptool' } })).toThrow(/уже на клетке/);
  });
});

describe('кости', () => {
  it('разбирает формулы и нормализует запись', () => {
    expect(parseFormula('d20')).toMatchObject({ count: 1, sides: 20, mod: 0, text: '1d20' });
    expect(parseFormula(' 2d6 + 5 ')).toMatchObject({ count: 2, sides: 6, mod: 5, text: '2d6+5' });
    expect(parseFormula('4d8-1')).toMatchObject({ count: 4, sides: 8, mod: -1, text: '4d8-1' });
    expect(() => parseFormula('2d7')).toThrow(/нет такой кости/);
    expect(() => parseFormula('0d6')).toThrow();
    expect(() => parseFormula('lol')).toThrow(/не формула/);
  });
  it('бросок детерминирован при заданном rng и лежит в границах', () => {
    const r = roll('2d6+5', { rng: () => 0.999 });
    expect(r).toMatchObject({ formula: '2d6+5', dice: [6, 6], mod: 5, total: 17 });
    const lo = roll('3d4', { rng: () => 0 });
    expect(lo.dice).toEqual([1, 1, 1]);
    for (let i = 0; i < 200; i++) {
      const x = roll('1d20');
      expect(x.dice[0]).toBeGreaterThanOrEqual(1);
      expect(x.dice[0]).toBeLessThanOrEqual(20);
    }
  });
  it('крит и провал — только одиночный d20', () => {
    expect(d20Outcome(roll('1d20+3', { rng: () => 0.999 }))).toBe('crit');
    expect(d20Outcome(roll('1d20', { rng: () => 0 }))).toBe('fail');
    expect(d20Outcome(roll('2d20', { rng: () => 0.999 }))).toBeNull();
    expect(d20Outcome(roll('1d12', { rng: () => 0.999 }))).toBeNull();
  });
});

describe('файл сессии — serializeLog / parseLog', () => {
  it('туда и обратно без потерь; чужой текст, не JSON и другой формат — ошибка с причиной; localStorage читает тот же конверт', () => {
    const a = createEngineStore(seed(), { ...fixed() });
    a.getState().damage('bo', 3);
    a.getState().rollDice('1d20', { label: 'x' });
    const text = serializeLog(a.getState().events);
    expect(JSON.parse(text)).toMatchObject({ format: LOG_FORMAT });
    expect(parseLog(text)).toEqual(a.getState().events);
    expect(() => parseLog('не json')).toThrow(/не JSON/);
    expect(() => parseLog('{"format":1}')).toThrow(/нет журнала/);
    expect(() => parseLog('{"format":99,"events":[]}')).toThrow(/формат журнала 99/);
    const mem = new Map<string, string>();
    const ls = localStorageStore('k', { getItem: k => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, v); }, removeItem: k => { mem.delete(k); } });
    ls.save(a.getState().events);
    expect(mem.get('k')).toBe(text);
    expect(ls.load()).toEqual(a.getState().events);
  });
});

describe('стор и хранение', () => {
  it('стор пишет лог в хранилище, новый стор поднимается из него с тем же состоянием и отменой', () => {
    const store = memoryStore();
    const a = createEngineStore(seed(), { persist: store, ...fixed() });
    a.getState().damage('bo', 12, 'slashing', 'captain');
    a.getState().tempHp('bo', 5);
    a.getState().advanceTime('hour', 8);
    a.getState().nextTurn(); // бой не начат — тихо ничего
    a.getState().startEncounter();
    expect(a.getState().state.encounter.order).toEqual(['korrin', 'bo', 'captain']);
    a.getState().nextTurn();
    expect(a.getState().state.encounter).toMatchObject({ round: 1, turnIndex: 1 });
    a.getState().undo();
    expect(a.getState().toast).toBe('Отменено: Раунд 1, ход Bo Tambernack');
    expect(a.getState().canRedo).toBe(true);

    const b = createEngineStore(seed(), { persist: store, ...fixed() });
    expect(b.getState().state).toEqual(a.getState().state);
    expect(b.getState().events).toHaveLength(a.getState().events.length);
    expect(b.getState().canRedo).toBe(true);
    b.getState().redo();
    expect(b.getState().state.encounter.turnIndex).toBe(1);
    expect(b.getState().toast).toMatch(/^Повторено: /);
    b.getState().damage('bo', 1);
    expect(b.getState().toast).toBeNull();
    expect(b.getState().canRedo).toBe(false);
  });

  it('следующий ход заворачивает раунд', () => {
    const a = createEngineStore(seed(), fixed());
    a.getState().startEncounter();
    for (let i = 0; i < 3; i++) a.getState().nextTurn();
    expect(a.getState().state.encounter).toMatchObject({ round: 2, turnIndex: 0 });
    expect(a.getState().state.actors.bo.hp.current).toBe(41);
  });

  it('концентрация: старт, второе заклинание сменяет первое, конец — только у того, кто концентрируется; всё отменяется', () => {
    const a = createEngineStore(seed(), fixed());
    const api = a.getState();
    expect(() => api.endConcentration('bo', 'save')).toThrow(/не концентрируется/);
    api.startConcentration('bo', "Hunter's Mark", 3600);
    expect(a.getState().state.actors.bo.concentration).toEqual({ spell: "Hunter's Mark", untilSec: 3600 });
    api.startConcentration('bo', 'Bless');
    expect(a.getState().state.actors.bo.concentration).toEqual({ spell: 'Bless' });
    api.endConcentration('bo', 'save');
    expect(a.getState().state.actors.bo.concentration).toBeUndefined();
    expect(a.getState().toast).toBeNull();
    api.undo();
    expect(a.getState().toast).toBe('Отменено: Концентрация потеряна на спасброске: Bless — Bo Tambernack');
    expect(a.getState().state.actors.bo.concentration).toEqual({ spell: 'Bless' });
    api.undo();
    expect(a.getState().state.actors.bo.concentration).toEqual({ spell: "Hunter's Mark", untilSec: 3600 });
    expect(() => api.startConcentration('bo', 'Bless', 0)).toThrow(/срок уже прошёл/);
  });

  it('появление и уход актёров: снимок в логе, уход — флаг, из порядка выбывает, старый урон по нему реплеится', () => {
    const store = memoryStore();
    const a = createEngineStore(seed(), { persist: store, ...fixed() });
    const api = a.getState();
    const goblin = { id: 'goblin', name: 'Goblin', kind: 'monster' as const, hp: { current: 7, max: 7, temp: 0 }, ac: 15, passivePerception: 9, conditions: {}, initiative: 12 };
    api.spawn(goblin);
    expect(a.getState().state.actors.goblin).toEqual(goblin);
    expect(() => api.spawn(goblin)).toThrow(/уже есть/);
    api.startEncounter();
    expect(a.getState().state.encounter.order).toEqual(['korrin', 'bo', 'captain', 'goblin']);
    api.nextTurn(); api.nextTurn(); // ход у капитана
    api.damage('goblin', 7);
    api.remove('goblin', 'dead');
    expect(a.getState().state.actors.goblin).toMatchObject({ removed: true, hp: { current: 0 } });
    expect(a.getState().state.encounter).toMatchObject({ order: ['korrin', 'bo', 'captain'], turnIndex: 2 });
    expect(() => api.damage('goblin', 1)).not.toThrow(); // актёр остался: старые и новые события по нему валидны
    api.remove('captain', 'fled'); // чей ход — выбыл: ход следующему по кругу (индекс сжимается)
    expect(a.getState().state.encounter).toMatchObject({ order: ['korrin', 'bo'], turnIndex: 0 });
    expect(() => api.setInitiative([{ actorId: 'captain', initiative: 1 }])).toThrow(/выбыл/);
    api.undo();
    expect(a.getState().state.actors.captain.removed).toBeUndefined();
    expect(a.getState().state.encounter).toMatchObject({ order: ['korrin', 'bo', 'captain'], turnIndex: 2 });

    // Реплей из хранилища — то же состояние, включая появившегося и выбывшего.
    const b = createEngineStore(seed(), { persist: store, ...fixed() });
    expect(b.getState().state).toEqual(a.getState().state);
    // Отмена появления убирает актёра целиком.
    const c = createEngineStore(seed(), fixed());
    c.getState().spawn(goblin, true);
    expect(c.getState().state.party).toEqual(['bo', 'korrin', 'goblin']);
    c.getState().undo();
    expect(c.getState().state.actors.goblin).toBeUndefined();
    expect(c.getState().state.party).toEqual(['bo', 'korrin']);
  });

  it('предложение симуляции: в лог, в состояние как pending, без строки в журнале и без отмены; принять можно только после него', () => {
    const a = createEngineStore(seed(), fixed());
    const api = a.getState();
    const delta = { id: 'd2', scale: 'settlement' as const, subject: 'Цены на железо', was: 'базовые', now: '+10%', cause: 'караван не найден', causeId: 'f-caravan', status: 'pending' as const };
    expect(() => api.dispatch({ type: 'WORLD_DELTA_ACCEPTED', payload: { deltaId: 'd2', subject: 'x', was: 'a', now: 'b', causeId: 'c' } })).toThrow(/нет предложения/);
    api.propose(delta);
    expect(a.getState().state.deltas.d2).toEqual(delta);
    expect(a.getState().canUndo).toBe(false);
    expect(journalEntries(a.getState().events, a.getState().state).map(e => e.type)).not.toContain('WORLD_DELTA_PROPOSED');
    expect(() => api.propose(delta)).toThrow(/уже есть/);
    expect(() => api.propose({ ...delta, id: 'd3', status: 'accepted' })).toThrow(/только pending/);
    api.dispatch({ type: 'WORLD_DELTA_ACCEPTED', payload: { deltaId: 'd2', subject: delta.subject, was: delta.was, now: delta.now, causeId: delta.causeId } });
    expect(a.getState().state.deltas.d2.status).toBe('accepted');
    api.undo();
    expect(a.getState().state.deltas.d2.status).toBe('pending');
  });

  it('бросок через стор ложится в лог и не отменяется', () => {
    const a = createEngineStore(seed(), fixed());
    const e = a.getState().rollDice('1d20+7', { rng: () => 0.5, label: 'атака' });
    expect(e.payload.total).toBe(18);
    expect(a.getState().canUndo).toBe(false);
  });
});
