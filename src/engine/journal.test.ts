// Журнал шага 7 — проекция, а не таблица: нити, масштаб по окну боя, секреты, упоминания по именам из
// состояния, фильтр «пусто = всё», каскады по causeId (не по времени), сводка нитей. Всё считается из лога
// и состояния при каждом чтении; проверяется на маленьком синтетическом мире, а не на сиде.
import { describe, expect, it } from 'vitest';
import { cascadeOf, filterJournal, journalEntries, journalParts, journalScales, threadSummaries } from './journal';
import { emptyState, type Actor, type State } from './state';
import { createEngineStore, nextVariantId } from './store';

const DAY = 86_400;

function actor(id: string, name: string, kind: Actor['kind'] = 'pc'): Actor {
  return { id, name, kind, hp: { current: 10, max: 10, temp: 0 }, ac: 10, passivePerception: 10, conditions: {}, initiative: 10 };
}

function world(): State {
  const s = emptyState();
  s.time = { sec: 30 * DAY, tempo: 'hour' };
  s.actors = { bo: actor('bo', 'Bo'), bolt: actor('bolt', 'Bolt Thrower', 'npc'), captain: actor('captain', 'Bandit Captain', 'monster'), bandit: actor('bandit', 'Bandit', 'monster') };
  s.party = ['bo'];
  s.world.locations = { nw: { id: 'nw', name: 'Neverwinter', scale: 'settlement' } };
  s.world.factions = { zh: { id: 'zh', name: 'Zhentarim', renown: 0 } };
  s.world.threads = {
    caravan: { id: 'caravan', name: 'The Missing Caravan', status: 'open', openedSec: 18 * DAY, lastTouchedSec: 30 * DAY },
    well: { id: 'well', name: 'Old Owl Well', status: 'open', openedSec: 10 * DAY, lastTouchedSec: 21 * DAY },
    closed: { id: 'closed', name: 'Закрытая', status: 'closed', openedSec: 0, lastTouchedSec: 0 },
  };
  s.facts = {
    undead: { id: 'undead', text: 'У Old Owl Well видели мертвецов', visibility: 'dm', scale: 'region', threadIds: ['well'] },
    agent: { id: 'agent', text: 'Агент Zhentarim у ворот', visibility: 'dm', threadIds: ['caravan'] },
  };
  return s;
}

const fixed = () => {
  let t = 1000;
  let n = 0;
  return { clock: { now: () => t++ }, ids: { next: () => `e${++n}` } };
};

describe('journalParts — упоминания и нити', () => {
  it('имена актёров, мест и фракций становятся упоминаниями; длинное имя не режется на короткое; нити — чипами в конце', () => {
    const s = world();
    const parts = journalParts({ text: 'Урон 5 по Bandit Captain от Bo у Neverwinter; Zhentarim рядом', threadIds: ['caravan'] }, s);
    expect(parts).toEqual([
      { kind: 'text', text: 'Урон 5 по ' },
      { kind: 'mention', entity: 'actor', id: 'captain', name: 'Bandit Captain' },
      { kind: 'text', text: ' от ' },
      { kind: 'mention', entity: 'actor', id: 'bo', name: 'Bo' },
      { kind: 'text', text: ' у ' },
      { kind: 'mention', entity: 'location', id: 'nw', name: 'Neverwinter' },
      { kind: 'text', text: '; ' },
      { kind: 'mention', entity: 'faction', id: 'zh', name: 'Zhentarim' },
      { kind: 'text', text: ' рядом' },
      { kind: 'text', text: ' ' },
      { kind: 'thread', id: 'caravan', name: 'The Missing Caravan' },
    ]);
  });
  it('граница слова: «Bo» не зажигается внутри «Bolt Thrower», а «Bolt Thrower» — своё упоминание', () => {
    const parts = journalParts({ text: 'Bolt Thrower и Bo', threadIds: [] }, world());
    expect(parts.filter(p => p.kind === 'mention').map(p => (p as { id: string }).id)).toEqual(['bolt', 'bo']);
  });
  it('без совпадений — один текстовый кусок; неизвестная нить печатается своим id', () => {
    expect(journalParts({ text: 'Тишина', threadIds: ['nope'] }, world())).toEqual([
      { kind: 'text', text: 'Тишина' }, { kind: 'text', text: ' ' }, { kind: 'thread', id: 'nope', name: 'nope' },
    ]);
  });
});

describe('journalEntries — нити, масштаб, секреты, происхождение', () => {
  it('урон вне боя без масштаба, в бою — «бой»; отмена начала боя закрывает окно; заметка и предложение несут свои нити и уровень', () => {
    const s = world();
    s.deltas = { d1: { id: 'd1', scale: 'region', subject: 'Zhentarim · Triboar Trail', was: 'влияние 2', now: 'влияние 3', cause: 'караван не найден', causeId: 'caravan', status: 'pending', threadIds: ['caravan'] } };
    const store = createEngineStore(s, fixed());
    const api = store.getState();
    api.damage('bo', 1);
    api.note('Партия прибыла в Neverwinter', ['caravan'], 'settlement');
    api.startEncounter();
    api.damage('bo', 2);
    api.rollDice('1d20', { label: 'скрытно', hidden: true });
    api.undo(); // отмена начала боя? нет — отменяется последнее обратимое: урон 2 (бросок необратим)
    api.accept('d1');
    api.reveal('agent');
    const entries = journalEntries(store.getState().events, store.getState().state);
    const byType = Object.fromEntries(entries.filter(e => !e.compensation).map(e => [e.type + (e.text.includes('Урон 2') ? '#2' : ''), e]));
    expect(byType.DAMAGE_APPLIED.scale).toBeUndefined();
    expect(byType['DAMAGE_APPLIED#2']).toMatchObject({ scale: 'battle', undone: true });
    expect(byType.ENCOUNTER_STARTED.scale).toBe('battle');
    expect(byType.DICE_ROLLED).toMatchObject({ scale: 'battle', hidden: true, secret: true, origin: 'dm' });
    expect(byType.NOTE_ADDED).toMatchObject({ threadIds: ['caravan'], scale: 'settlement', secret: false, origin: 'dm' });
    expect(byType.WORLD_DELTA_ACCEPTED).toMatchObject({ threadIds: ['caravan'], scale: 'region', origin: 'sim', deltaId: 'd1', causeId: 'caravan', secret: true });
    expect(byType.FACT_REVEALED).toMatchObject({ threadIds: ['caravan'], origin: 'players', secret: false });
  });

  it('окно боя — по логу: после ENCOUNTER_ENDED урон снова без масштаба; отменённый конец боя окно возвращает', () => {
    const store = createEngineStore(world(), fixed());
    const api = store.getState();
    api.startEncounter();
    api.endEncounter();
    api.damage('bo', 1);
    api.undo(); // урон
    api.undo(); // конец боя — окно снова открыто
    api.damage('bo', 3);
    const entries = journalEntries(store.getState().events, store.getState().state).filter(e => e.type === 'DAMAGE_APPLIED' && !e.compensation);
    expect(entries.map(e => e.scale)).toEqual([undefined, 'battle']);
  });

  it('дельты симуляции — секрет мастера (F8); нить предложения без threadIds — causeId, если это нить', () => {
    const s = world();
    s.deltas = { d1: { id: 'd1', scale: 'region', subject: 'X', was: 'a', now: 'b', cause: 'c', causeId: 'well', status: 'pending' } };
    const store = createEngineStore(s, fixed());
    store.getState().reject('d1', 'не верю');
    const [e] = journalEntries(store.getState().events, store.getState().state);
    expect(e).toMatchObject({ type: 'WORLD_DELTA_REJECTED', secret: true, origin: 'sim', threadIds: ['well'], scale: 'region', deltaId: 'd1' });
  });
});

describe('filterJournal и journalScales', () => {
  const s = world();
  const store = createEngineStore(s, fixed());
  const api = store.getState();
  api.note('А', ['caravan'], 'settlement');
  api.note('Б', ['well'], 'region');
  api.note('В', ['caravan', 'well'], 'battle');
  api.damage('bo', 1); // без нити и масштаба
  api.rollDice('1d20', { hidden: true });
  const entries = journalEntries(store.getState().events, store.getState().state);

  it('пустой фильтр — все записи, включая без нити и масштаба', () => {
    expect(filterJournal(entries)).toHaveLength(5);
    expect(filterJournal(entries, { threads: [], scales: [] })).toHaveLength(5);
  });
  it('нити объединяются, уровни объединяются, группы пересекаются; запись без масштаба под фильтром уровня не проходит', () => {
    expect(filterJournal(entries, { threads: ['caravan'] }).map(e => e.text)).toEqual(['А', 'В']);
    expect(filterJournal(entries, { threads: ['caravan', 'well'] }).map(e => e.text)).toEqual(['А', 'Б', 'В']);
    expect(filterJournal(entries, { scales: ['settlement', 'region'] }).map(e => e.text)).toEqual(['А', 'Б']);
    expect(filterJournal(entries, { threads: ['caravan'], scales: ['battle'] }).map(e => e.text)).toEqual(['В']);
    expect(filterJournal(entries, { scales: ['battle'] }).some(e => e.type === 'DAMAGE_APPLIED')).toBe(false);
  });
  it('стол игроков: секретов нет вовсе', () => {
    expect(filterJournal(entries, { dmView: false }).some(e => e.secret)).toBe(false);
    expect(filterJournal(entries, { dmView: true }).some(e => e.secret)).toBe(true);
  });
  it('journalScales — встречающиеся уровни в порядке лестницы', () => {
    expect(journalScales(entries)).toEqual(['region', 'settlement', 'battle']);
  });
});

describe('cascadeOf — по ссылкам, не по времени', () => {
  it('принятая дельта → факт мастера: два шага, корень — факт, последний — сама дельта', () => {
    const s = world();
    s.deltas = { rumor: { id: 'rumor', scale: 'settlement', subject: 'Слух в таверне', was: 'тишина', now: 'у колодца мертвецы', cause: 'их и правда видели', causeId: 'undead', status: 'pending', threadIds: ['well'] } };
    const store = createEngineStore(s, fixed());
    store.getState().accept('rumor');
    const entries = journalEntries(store.getState().events, store.getState().state);
    expect(cascadeOf(entries[0], entries, store.getState().state)).toEqual([
      { kind: 'fact', id: 'undead', label: 'У Old Owl Well видели мертвецов' },
      { kind: 'delta', id: 'rumor', label: 'Слух в таверне: тишина → у колодца мертвецы' },
    ]);
  });
  it('дельта → дельта → нить: цепочка через предложения до корня; запись по id события — корень «запись»; цикл обрывается', () => {
    const s = world();
    s.deltas = {
      a: { id: 'a', scale: 'region', subject: 'A', was: '1', now: '2', cause: 'c', causeId: 'caravan', status: 'pending' },
      b: { id: 'b', scale: 'region', subject: 'B', was: '1', now: '2', cause: 'c', causeId: 'a', status: 'pending' },
      loop1: { id: 'loop1', scale: 'region', subject: 'L1', was: '1', now: '2', cause: 'c', causeId: 'loop2', status: 'pending' },
      loop2: { id: 'loop2', scale: 'region', subject: 'L2', was: '1', now: '2', cause: 'c', causeId: 'loop1', status: 'pending' },
    };
    const store = createEngineStore(s, fixed());
    const api = store.getState();
    const note = api.note('Полнолуние', [], 'region');
    api.propose({ id: 'moon', scale: 'region', subject: 'Ликантропы', was: '×1', now: '×2', cause: 'полнолуние', causeId: note.id, status: 'pending' });
    api.accept('b');
    api.accept('moon');
    api.accept('loop1');
    const state = store.getState().state;
    const entries = journalEntries(store.getState().events, state);
    const of = (deltaId: string) => cascadeOf(entries.find(e => e.deltaId === deltaId)!, entries, state);
    expect(of('b').map(st => `${st.kind}:${st.id}`)).toEqual(['thread:caravan', 'delta:a', 'delta:b']);
    expect(of('moon')).toEqual([{ kind: 'entry', id: note.id, label: 'Полнолуние' }, { kind: 'delta', id: 'moon', label: 'Ликантропы: ×1 → ×2' }]);
    expect(of('loop1').map(st => st.id)).toEqual(['loop2', 'loop1']);
    // Без причины каскада нет.
    expect(cascadeOf(entries.find(e => e.type === 'NOTE_ADDED')!, entries, state)).toEqual([]);
  });
});

describe('threadSummaries', () => {
  it('только открытые нити; записи без компенсаций и отменённых; сроки в днях; секреты и каскад последнего принятого', () => {
    const s = world();
    s.deltas = { rumor: { id: 'rumor', scale: 'settlement', subject: 'Слух', was: 'тишина', now: 'мертвецы', cause: 'видели', causeId: 'undead', status: 'pending', threadIds: ['well'] } };
    const store = createEngineStore(s, fixed());
    const api = store.getState();
    api.note('раз', ['caravan'], 'settlement');
    api.note('два', ['caravan'], 'settlement');
    api.undo();
    api.accept('rumor');
    const st = store.getState();
    const sums = threadSummaries(journalEntries(st.events, st.state), st.state, st.state.time.sec);
    expect(sums.map(t => t.id)).toEqual(['caravan', 'well']);
    const [caravan, well] = sums;
    expect(caravan).toMatchObject({ count: 1, openedDays: 12, idleDays: 0 });
    expect(caravan.last?.text).toBe('раз');
    expect(caravan.secrets.map(f => f.id)).toEqual(['agent']);
    expect(caravan.cascade).toEqual([]);
    expect(well).toMatchObject({ count: 1, openedDays: 20, idleDays: 0 });
    expect(well.secrets.map(f => f.id)).toEqual(['undead']);
    expect(well.cascade.map(c => c.kind)).toEqual(['fact', 'delta']);
    // Без записей — «без внимания» считается от lastTouchedSec.
    const fresh = createEngineStore(world(), fixed()).getState();
    expect(threadSummaries([], fresh.state, fresh.state.time.sec).find(t => t.id === 'well')).toMatchObject({ count: 0, idleDays: 9 });
  });
});

describe('стор: решения по предложениям, факты, заметки', () => {
  it('accept пишет снимок дельты в payload; reject; reroll — следующий отличный вариант по кругу; reveal; note', () => {
    const s = world();
    s.deltas = {
      d1: { id: 'd1', scale: 'region', subject: 'Zhentarim', was: 'влияние 2', now: 'влияние 3', cause: 'караван', causeId: 'caravan', status: 'pending',
        variants: [{ id: 'v1', now: 'влияние 3', cause: 'караван' }, { id: 'v2', now: 'влияние 2', cause: 'Harpers перехватили курьера' }] },
      d2: { id: 'd2', scale: 'region', subject: 'Без вариантов', was: 'a', now: 'b', cause: 'c', causeId: 'caravan', status: 'pending' },
    };
    const store = createEngineStore(s, fixed());
    const api = store.getState();
    expect(nextVariantId(s.deltas.d1)).toBe('v2'); // v1 совпадает с тем, что стоит, — пропускается
    api.reroll('d1');
    expect(store.getState().state.deltas.d1).toMatchObject({ now: 'влияние 2', variantId: 'v2' });
    api.reroll('d1');
    expect(store.getState().state.deltas.d1).toMatchObject({ now: 'влияние 3', variantId: 'v1' });
    api.reroll('d2');
    expect(store.getState().events.filter(e => e.type === 'WORLD_DELTA_REROLLED')).toHaveLength(2);
    api.accept('d1');
    expect(store.getState().events.at(-1)).toMatchObject({ type: 'WORLD_DELTA_ACCEPTED', payload: { deltaId: 'd1', subject: 'Zhentarim', was: 'влияние 2', now: 'влияние 3', causeId: 'caravan' } });
    expect(() => api.accept('nope')).toThrow(/нет предложения/);
    api.reject('d2', 'не верю');
    expect(store.getState().state.deltas.d2.status).toBe('rejected');
    api.reveal('agent');
    expect(store.getState().state.facts.agent.visibility).toBe('players');
    api.note('Заметка', ['caravan'], 'settlement');
    expect(store.getState().events.at(-1)).toMatchObject({ type: 'NOTE_ADDED', payload: { text: 'Заметка', threadIds: ['caravan'], scale: 'settlement' } });
  });
});
