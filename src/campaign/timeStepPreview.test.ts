import { describe, it, expect } from 'vitest';
import { createEngineStore, EventLog, memoryStore, TEMPO_SECONDS, type DomainEvent } from '../engine';
import { seedState } from './seed';
import { previewTimeStep, timeStepEnd, needsTimePreview } from './timeStepPreview';
import { commitTimeStepPlan, stepTime } from './simulation';
import { harptos, secOf } from './calendar';
import { THREAD } from './world';

const semantic = (items: ReturnType<typeof previewTimeStep>['proposals']) => items.map(({subject,was,now,cause,patch})=>({subject,was,now,cause,patch}));
describe('БА3: период и прогноз шага', () => {
  it('прогноз не меняет вход, не пишет событий; при применении предложения совпадают', () => {
    const state=seedState(), before=structuredClone(state);
    const store=createEngineStore(state,{persist:memoryStore()});
    const events=store.getState().events;
    const p=previewTimeStep(state,'tenday',1);
    expect(state).toEqual(before);
    expect(store.getState().events).toBe(events);
    const actual=stepTime(store.getState(),'tenday',1);
    expect(actual.event.payload.toSec).toBe(p.toSec);
    expect(semantic(actual.proposals)).toEqual(semantic(p.proposals));
    expect(store.getState().state.world).toEqual(before.world);
    store.getState().undo();
    expect(store.getState().state.time.sec).toBe(before.time.sec);
  });
  it('подтверждает тот же зарезервированный план и отменяет/повторяет его вместе с предложениями после replay', () => {
    const initial = seedState();
    const store = createEngineStore(initial, { persist: memoryStore() });
    const api = store.getState();
    const planId = api.reserveEventId();
    const plan = previewTimeStep(api.state, 'tenday', 1, planId, api.events.length);
    const committed = commitTimeStepPlan(api, plan);

    expect(committed.event.id).toBe(plan.eventId);
    expect(committed.proposals).toEqual(plan.proposals);
    expect(store.getState().events.filter(event => event.transactionId === planId).map(event => event.id))
      .toEqual(plan.commands.map(command => command.eventId));
    expect(store.getState().events.filter((event): event is DomainEvent<'WORLD_DELTA_PROPOSED'> => event.type === 'WORLD_DELTA_PROPOSED').slice(-plan.proposals.length).map(event => event.payload.delta))
      .toEqual(plan.proposals);

    store.getState().undo();
    expect(store.getState().state.time.sec).toBe(initial.time.sec);
    for (const proposal of plan.proposals) expect(store.getState().state.deltas[proposal.id]).toBeUndefined();
    const undoneReplay = new EventLog(initial, store.getState().events);
    expect(undoneReplay.state).toEqual(store.getState().state);

    store.getState().redo();
    expect(store.getState().state.time.sec).toBe(plan.toSec);
    expect(store.getState().state.deltas).toMatchObject(Object.fromEntries(plan.proposals.map(delta => [delta.id, delta])));
    const redoneReplay = new EventLog(initial, store.getState().events);
    expect(redoneReplay.state).toEqual(store.getState().state);
  });
  it('отклоняет устаревший план даже если изменился только журнал', () => {
    const initial = seedState();
    const store = createEngineStore(initial, { persist: memoryStore() });
    const api = store.getState();
    const planId = api.reserveEventId();
    const plan = previewTimeStep(api.state, 'tenday', 1, planId, api.events.length);
    api.rollDice('1d20', { label: 'изменение только журнала' });
    // The captured store snapshot itself is unchanged; the log boundary catches the intervening event.
    expect(() => commitTimeStepPlan(api, plan)).toThrow(/Состояние изменилось/);
    expect(store.getState().state.time.sec).toBe(initial.time.sec);
    expect(store.getState().events.some(event => event.id === planId)).toBe(false);
    const nextPlanId = store.getState().reserveEventId();
    expect(nextPlanId).not.toBe(planId);
    store.getState().releaseReservedEventId(nextPlanId);
  });
  it('прогнозирует подготовительные команды и включает их в undo/replay группу шага', () => {
    const initial = seedState();
    const beforeTouched = initial.world.threads[THREAD.oldOwlWell].lastTouchedSec;
    const persistence = memoryStore();
    const store = createEngineStore(initial, { persist: persistence });
    const api = store.getState();
    const planId = api.reserveEventId();
    const plan = previewTimeStep(api.state, 'day', 1, planId, api.events.length, [
      { type: 'NOTE_ADDED', payload: { text: 'Подготовка к переходу', threadIds: [THREAD.oldOwlWell], scale: 'region' } },
    ]);
    commitTimeStepPlan(api, plan);
    expect(store.getState().state.world.threads[THREAD.oldOwlWell].lastTouchedSec).toBe(initial.time.sec);
    expect(store.getState().events.find(event => event.transactionId === planId)?.type).toBe('NOTE_ADDED');
    expect(EventLog.prefixUntil(initial, store.getState().events, initial.time.sec)).toHaveLength(0);
    expect(EventLog.prefixUntil(initial, store.getState().events, plan.toSec)).toHaveLength(store.getState().events.length);

    const resumed = createEngineStore(initial, { persist: persistence });
    expect(resumed.getState().state).toEqual(store.getState().state);
    resumed.getState().undo();
    expect(resumed.getState().state.world.threads[THREAD.oldOwlWell].lastTouchedSec).toBe(beforeTouched);
    expect(new EventLog(initial, resumed.getState().events).state).toEqual(resumed.getState().state);
    const undoneResume = createEngineStore(initial, { persist: persistence });
    expect(undoneResume.getState().canRedo).toBe(true);
    undoneResume.getState().redo();
    expect(undoneResume.getState().state.world.threads[THREAD.oldOwlWell].lastTouchedSec).toBe(initial.time.sec);
    expect(new EventLog(initial, createEngineStore(initial, { persist: persistence }).getState().events).state).toEqual(undoneResume.getState().state);
  });
  it('показывает неудачу сохранения после единой записи собранного шага', () => {
    const initial = seedState();
    let saves = 0;
    const persist = { load: () => null, save: () => { saves++; return false; }, clear: () => {} };
    const store = createEngineStore(initial, { persist });
    const api = store.getState();
    const id = api.reserveEventId();
    const plan = previewTimeStep(api.state, 'day', 1, id, api.events.length);
    commitTimeStepPlan(api, plan);

    expect(saves).toBe(1);
    expect(store.getState().saveFailed).toBe(true);
    expect(store.getState().state.time.sec).toBe(plan.toSec);
    expect(store.getState().events.filter(event => event.transactionId === id)).toHaveLength(plan.commands.length);
  });
  it('год сохраняет календарную дату, учитывает Shieldmeet; много коротких шагов тоже требует просмотра', () => {
    const from=secOf({year:1492,month:'Mirtul',day:15,hour:8});
    const to=timeStepEnd(from,'year',1);
    expect(harptos(to)).toMatchObject({year:1493,month:'Mirtul',day:15,hour:8});
    expect(to-from).toBe(366*TEMPO_SECONDS.day);
    expect(needsTimePreview(from,'hour',23)).toBe(false);
    expect(needsTimePreview(from,'hour',24)).toBe(true);
    expect(()=>timeStepEnd(from,'day',0)).toThrow();
  });
  it('показывает пересекаемые сроки, не снимает эффекты/состояния и не включает выбывших', () => {
    const s=seedState(), bo=s.actors.bo;
    bo.concentration={spell:'Test concentration',untilSec:s.time.sec+60};
    bo.effects=[{name:'Test effect',untilSec:s.time.sec+120}];
    bo.conditions={poisoned:{untilSec:s.time.sec+180}};
    s.actors.captain.removed=true;
    s.actors.captain.concentration={spell:'Removed effect',untilSec:s.time.sec+60};
    const before=structuredClone(s);
    const p=previewTimeStep(s,'day',1);
    expect(p.deadlines.map(d=>d.name)).toEqual(expect.arrayContaining(['Test concentration','Test effect','poisoned']));
    expect(p.deadlines.some(d=>d.name==='Removed effect')).toBe(false);
    expect(s).toEqual(before);
  });
});
