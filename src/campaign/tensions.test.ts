// Напряжения: четыре вида по правилам ROADMAP 7.1 на маленьком справочнике; год кампании отсекает распущенных и
// умерших; вес — число фактов; «Сделать нитью» — предложение newThread, «Принять» открывает нить, Ctrl+Z убирает.
// В конце — тот же поиск на настоящем справочнике (сценарий этапа 7 на сиде).
import { describe, expect, it } from 'vitest';
import { EventLog, emptyState, type State } from '../engine';
import type { Organization } from '../world/organizations';
import { loadTensionCanon } from '../world/tensions';
import { seedState } from './seed';
import { influenceOf, tensionThreadDelta, tensionThreadId, tensionThreadState, tensionsAt, tensionsOf, type TensionCanon } from './tensions';

const org = (id: string, extra: Partial<Organization> = {}): Organization => ({ id, name: id.toUpperCase(), title: id, ...extra });
const P = 'p-town';
const CANON: TensionCanon = {
  orgs: new Map([
    org('guild', { places: [P], enemies: ['thieves'] }),
    org('thieves', { places: [P] }),
    org('old', { places: [P], enemies: ['guild'], disbanded: 1400 }),
    org('sun', { church: true, deities: ['lathander'], enemies: ['night'] }),
    org('night', { church: true, deities: ['shar'], places: [P] }),
    org('watch', { enemies: ['cult'] }),
    org('cult', {}),
  ].map(o => [o.id, o])),
  members: {
    watch: [['spy', 'Spy; (alias)', 1450, null], ['dead', 'Dead', 1400, 1480]],
    cult: [['spy', 'Spy; (alias)', 1450, null], ['dead', 'Dead', 1400, 1480]],
  },
  faiths: { [P]: { deities: ['lathander'], text: 'Lathander' } },
  placeName: id => (id === P ? 'Town' : undefined),
  homeOf: id => (id === 'spy' ? P : undefined),
};

function campaign(): State {
  const s = emptyState();
  s.world.locations = { town: { id: 'town', name: 'Town', scale: 'settlement', ref: `place:${P}` } };
  s.world.factions = {
    'fac-guild': { id: 'fac-guild', name: 'Guild', renown: 0, trend: 1, ref: 'organization:guild', relations: { 'fac-thieves': -2 } },
    'fac-thieves': { id: 'fac-thieves', name: 'Thieves', renown: 6, ref: 'organization:thieves', relations: { 'fac-guild': -2 } },
  };
  s.facts = { f1: { id: 'f1', text: 'Thieves ограбили склад в Town', visibility: 'dm', subjectId: 'town' } };
  return s;
}

describe('tensionsOf', () => {
  it('четыре вида; распущенная организация и умерший NPC — нет; вес — число фактов, по убыванию', () => {
    const list = tensionsOf(campaign(), 1492, CANON);
    expect(list.map(t => t.kind).sort()).toEqual(['double', 'faith', 'rising', 'rivals']);
    expect(list.map(t => t.weight)).toEqual([...list.map(t => t.weight)].sort((a, b) => b - a));
    expect(list.some(t => t.sides.some(s => s.label === 'OLD'))).toBe(false);
    expect(list.some(t => t.sides.some(s => s.label === 'Dead'))).toBe(false);
  });

  it('враги в одном месте: базы, вражда по вики, отношение кампании и факт мастера о месте; стороны — фракции кампании', () => {
    const t = tensionsOf(campaign(), 1492, CANON).find(x => x.kind === 'rivals')!;
    expect(t).toMatchObject({ title: 'Guild и Thieves · Town', placeId: P, locationId: 'town' });
    expect(t.sides.map(s => s.ref)).toEqual(['faction:fac-guild', 'faction:fac-thieves']);
    expect(t.facts.map(f => f.text)).toEqual([
      'GUILD: база — Town', 'THIEVES: база — Town', 'GUILD: враги — THIEVES', 'Guild и Thieves: отношение -2', 'Thieves ограбили склад в Town',
    ]);
    expect(t.weight).toBe(5);
    expect(t.facts.at(-1)).toMatchObject({ origin: 'campaign', factId: 'f1' });
  });

  it('соперничество вер: церковь бога места и церковь с базой здесь, боги разные', () => {
    const t = tensionsOf(campaign(), 1492, CANON).find(x => x.kind === 'faith')!;
    expect(t.facts.map(f => f.text)).toEqual(['NIGHT: база — Town', 'Town: почитают бога церкви SUN', 'SUN: враги — NIGHT']);
  });

  it('двойная верность: живой NPC в двух враждующих, дом — место; имя без хвоста вики', () => {
    const t = tensionsOf(campaign(), 1492, CANON).find(x => x.kind === 'double')!;
    expect(t).toMatchObject({ title: 'Spy: WATCH и CULT', placeId: P, sides: [{ label: 'Spy', ref: 'person:spy' }, { label: 'WATCH' }, { label: 'CULT' }] });
    // В 1440 DR Spy ещё не родился, а Dead жив — двойная верность его.
    expect(tensionsOf(campaign(), 1440, CANON).filter(x => x.kind === 'double').map(x => x.sides[0].label)).toEqual(['Dead']);
    expect(tensionsOf(campaign(), 1399, CANON).some(x => x.kind === 'double')).toBe(false);
  });

  it('сила растёт: тренд, отношение ≤ −2, известность от 5; место — из факта мастера; ниже порога — нет', () => {
    const t = tensionsOf(campaign(), 1492, CANON).find(x => x.kind === 'rising')!;
    expect(t).toMatchObject({ title: 'Guild растёт, партию знают в Thieves', locationId: 'town', placeId: P });
    const s = campaign();
    s.world.factions['fac-thieves'].renown = 4;
    expect(tensionsOf(s, 1492, CANON).some(x => x.kind === 'rising')).toBe(false);
  });

  it('напряжения места — по месту справочника или месту кампании', () => {
    const list = tensionsOf(campaign(), 1492, CANON);
    expect(tensionsAt(list, { locationId: 'town' }).length).toBe(list.length);
    expect(tensionsAt(list, { placeId: 'elsewhere' })).toEqual([]);
  });
});

describe('influenceOf (слой влияния)', () => {
  it('базы фракций кампании — места их организаций; распущенная к году — нет; напряжения — по месту', () => {
    const s = campaign();
    const list = tensionsOf(s, 1492, CANON);
    const m = influenceOf(s, 1492, CANON, list);
    expect(m.bases.get(P)).toEqual(['Guild', 'Thieves']);
    expect(m.tensions.get(P)?.length).toBe(list.filter(t => t.placeId === P).length);
    s.world.factions['fac-old'] = { id: 'fac-old', name: 'Old', renown: 0, ref: 'organization:old' };
    expect(influenceOf(s, 1492, CANON, []).bases.get(P)).toEqual(['Guild', 'Thieves']);
    expect(influenceOf(s, 1390, CANON, []).bases.get(P)).toEqual(['Guild', 'Thieves', 'Old']);
  });
});

describe('«Сделать нитью»', () => {
  it('предложение newThread: причина — факты, causeId — факт мастера; «Принять» — нить открыта; Ctrl+Z — нити нет', () => {
    const s = campaign();
    const t = tensionsOf(s, 1492, CANON).find(x => x.kind === 'rivals')!;
    const d = tensionThreadDelta(s, t);
    expect(d).toMatchObject({ subject: 'Нить · Guild и Thieves · Town', causeId: 'f1', scale: 'settlement', threadIds: [tensionThreadId(t)] });
    expect(d.cause).toMatch(/^враги в одном месте: GUILD: база — Town; /);
    const log = new EventLog(s, []);
    log.dispatch({ type: 'WORLD_DELTA_PROPOSED', payload: { delta: d } });
    expect(tensionThreadState(log.state, t)).toBe('pending');
    log.dispatch({ type: 'WORLD_DELTA_ACCEPTED', payload: { deltaId: d.id, subject: d.subject, was: d.was, now: d.now, causeId: d.causeId } });
    expect(log.state.world.threads[tensionThreadId(t)]).toMatchObject({ name: t.title, status: 'open' });
    expect(tensionThreadState(log.state, t)).toBe('thread');
    log.undo();
    expect(log.state.world.threads[tensionThreadId(t)]).toBeUndefined();
    log.redo();
    expect(log.state.world.threads[tensionThreadId(t)]).toBeDefined();
  });

  it('без факта мастера causeId — первая сторона ссылкой', () => {
    const t = tensionsOf(campaign(), 1492, CANON).find(x => x.kind === 'faith')!;
    expect(tensionThreadDelta(campaign(), t).causeId).toBe('organization:night');
  });
});

describe('на настоящем справочнике (сид, 1492 DR)', () => {
  it('сценарий этапа 7: в Neverwinter — враги по вики; Zhentarim растёт, партию знают Harpers, агент у ворот Neverwinter', async () => {
    const list = tensionsOf(seedState(), 1492, await loadTensionCanon());
    const nw = tensionsAt(list, { locationId: 'loc-neverwinter' });
    expect(nw.map(t => t.title)).toEqual(expect.arrayContaining(['Ashmadai и Neverwinter\'s Rangers · Neverwinter']));
    const rising = list.find(t => t.id === 'rising:fac-zhentarim:fac-harpers')!;
    expect(rising.facts.map(f => f.text)).toEqual(expect.arrayContaining(['Агент Zhentarim замечен у ворот Neverwinter', 'Zhentarim: враги — The Harpers']));
    expect(rising.locationId).toBe('loc-neverwinter');
    const kinds = new Set(list.map(t => t.kind));
    expect([...kinds].sort()).toEqual(['double', 'faith', 'rising', 'rivals']);
  }, 20_000);
});
