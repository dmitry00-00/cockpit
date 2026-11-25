import { describe, expect, it } from 'vitest';
import indexFile from '../../content/chronology/index.json';
import {
  CHRONO_KIND_LABEL, SNAPSHOT_SCHEMA, binSize, canonEraOf, densityBins, drLabel, eventsAbout, loadEvents, orgStatus, personStatus,
  rangeOfYear, snapshotAt, snapshotExport, widerRange, type ChronoIndex,
} from './chronology';

const index = indexFile as unknown as ChronoIndex;

describe('хронология канона (Д5)', () => {
  it('индекс: эпохи Grand History по порядку, без дыр; имя года из Roll of Years; авторство вики', () => {
    expect(index.eras.map(e => e.name)).toEqual([
      'Days of Thunder', 'Dawn Age', 'First Flowering', 'Crown Wars', 'The Founding Time', 'Age of Humanity', 'Era of Upheaval', 'Present Age',
    ]);
    for (let i = 1; i < index.eras.length; i++) expect(index.eras[i].from).toBe(index.eras[i - 1].to + 1);
    expect(canonEraOf(index.eras, 1372)?.name).toBe('Era of Upheaval');
    expect(canonEraOf(index.eras, 1492)?.name).toBe('Present Age');
    expect(index.years.find(y => y.year === 1479)?.name).toBe('Year of the Ageless One');
    expect(index.license).toBe('CC BY-SA 3.0');
  });

  it('события 1479 DR: английские строки без разметки, дата Харптоса, ссылки на справочник, источники', async () => {
    const events = await loadEvents(1479, 1479);
    expect(events.length).toBeGreaterThan(30);
    for (const e of events) {
      expect(e.text).not.toMatch(/\[\[|\]\]|\{\{|\}\}|''|<|>|\|/);
      expect(Object.keys(CHRONO_KIND_LABEL)).toContain(e.kind);
    }
    const invasion = events.find(e => e.text.startsWith('The green dragon Skuthosiin sends his forces'))!;
    expect(invasion).toMatchObject({ kind: 'conflicts', month: 4, when: 'Tarsakh' });
    expect(invasion.links).toContainEqual({ t: 'Skuthosiin', ref: 'person:skuthosiin' });
    expect(invasion.cites?.[0]).toMatch(/^The Captive Flame/);
    // По дате внутри года: Tarsakh раньше Mirtul, без даты — в конце года.
    const dated = events.filter(e => e.month);
    expect(dated.map(e => e.month)).toEqual([...dated.map(e => e.month)].sort((a, b) => a! - b!));
  });

  it('куски грузятся по диапазону: −339…−339 DR и 1370…1372 DR — свои годы и только они', async () => {
    const old = await loadEvents(-339, -339);
    expect(old.length).toBeGreaterThan(0);
    expect(new Set(old.map(e => e.year))).toEqual(new Set([-339]));
    const span = await loadEvents(1370, 1372);
    expect(new Set(span.map(e => e.year))).toEqual(new Set([1370, 1371, 1372]));
  });

  it('статусы на год: без дат — undated, а не «жив»; не родился, умер, распущена, ещё нет', () => {
    expect(personStatus({}, 1492)).toBe('undated');
    expect(personStatus({ born: 1400 }, 1492)).toBe('alive');
    expect(personStatus({ born: 1500 }, 1492)).toBe('unborn');
    expect(personStatus({ died: 1479 }, 1479)).toBe('dead');
    expect(personStatus({ died: 1479 }, 1478)).toBe('alive');
    expect(orgStatus({}, 1492)).toBe('undated');
    expect(orgStatus({ formed: 1490 }, 1372)).toBe('notYet');
    expect(orgStatus({ formed: 1300, disbanded: 1385 }, 1372)).toBe('exists');
    expect(orgStatus({ formed: 1300, disbanded: 1385 }, 1479)).toBe('disbanded');
  });

  it('слепок 1479 DR: имя, эпоха, редакция 4e, события года, счётчики; места по ссылкам событий', async () => {
    const events = await loadEvents(1470, 1479);
    const snap = snapshotAt(1479, { index, events, people: [{ born: 1400 }, { died: 1450 }, {}], organizations: [{ formed: 1480 }] });
    expect(snap).toMatchObject({ year: 1479, name: 'Year of the Ageless One', edition: '4e', era: { name: 'Era of Upheaval' } });
    expect(snap.events.every(e => e.year === 1479)).toBe(true);
    expect(snap.people).toEqual({ alive: 1, dead: 1, unborn: 0, undated: 1 });
    expect(snap.organizations).toEqual({ exists: 0, disbanded: 0, notYet: 1, undated: 0 });
    // Neverwinter Wood — место справочника карты: Hillborn отбивают Fireguard у Mount Hotenow (1479 DR).
    const wood = eventsAbout(events, 'place:f5347333-dff6-4184-a3e0-250f5af9677b');
    expect(wood.map(e => e.year)).toContain(1479);
    expect(wood.find(e => e.year === 1479)!.text).toMatch(/Hillborn Dwarves recapture the Fireguard Fortress/);
    expect(snap.placeMentions).toContainEqual(expect.objectContaining({
      ref: 'place:f5347333-dff6-4184-a3e0-250f5af9677b',
      names: expect.arrayContaining(['Neverwinter Wood']),
      events: expect.arrayContaining([expect.objectContaining({ year: 1479 })]),
    }));
    expect(snap.placeMentions.flatMap(place => place.events).every(event => event.year === 1479)).toBe(true);
  });

  it('выгрузка для машинной обработки: схема, авторство, история за N лет, статусы записей', async () => {
    const events = await loadEvents(1475, 1479);
    const out = snapshotExport(1479, {
      index, events, history: 4,
      articleEvents: [{ id: 'article-1', year: 1478, text: 'A source mentions Neverwinter Wood', src: { title: 'The North', how: 'history' }, links: [{ t: 'Neverwinter Wood', ref: 'place:wood' }] }],
      people: [{ id: 'elminster', name: 'Elminster', title: 'Elminster', died: 1479 }],
      organizations: [{ id: 'harpers', name: 'Harpers', title: 'Harpers' }],
    });
    expect(out).toMatchObject({ schema: SNAPSHOT_SCHEMA, label: '1479 DR', edition: '4e', source: { license: 'CC BY-SA 3.0' } });
    expect(Math.min(...out.events.map(e => e.year))).toBe(1475);
    expect(out.people).toEqual([{ id: 'elminster', name: 'Elminster', status: 'dead', died: 1479 }]);
    expect(out.organizations).toEqual([{ id: 'harpers', name: 'Harpers', status: 'undated' }]);
    expect(out.placeMentions).toContainEqual({
      ref: 'place:wood', names: ['Neverwinter Wood'], events: [{ id: 'article-1', year: 1478 }],
    });
    expect(out.placeMentions.flatMap(place => place.events).every(event => event.year <= 1479 && event.year >= 1475)).toBe(true);
    expect(drLabel(-339)).toBe('−339 DR');
  });

  it('шкала (Х3): шаг столбика по окну, круглые границы, изданное не считается; шире — век, эпоха, всё', () => {
    expect([binSize(1470, 1479), binSize(1358, 1489), binSize(-3000, 1357), binSize(-35000, 1599)]).toEqual([1, 10, 100, 1000]);
    const years = [{ year: 1471, counts: { conflicts: 2, publications: 5 } }, { year: 1479, counts: { deaths: 3 } }, { year: 1482, counts: { magic: 1 } }];
    const bins = densityBins(years, 1358, 1489);
    expect(bins[0]).toEqual({ from: 1358, to: 1359, count: 0 });
    expect(bins.find(b => b.from === 1470)).toEqual({ from: 1470, to: 1479, count: 5 });
    expect(bins.at(-1)).toEqual({ from: 1480, to: 1489, count: 1 });
    expect(densityBins(years, 1470, 1479, new Set(['publications'])).find(b => b.from === 1471)!.count).toBe(5);
    expect(widerRange(index.eras, 1470, 1479)).toEqual({ from: 1400, to: 1499 });
    expect(widerRange(index.eras, 1400, 1499)).toEqual({ from: 1358, to: 1489 });
    expect(widerRange(index.eras, 1358, 1489)).toEqual({ from: -35000, to: 1599 });
    expect(rangeOfYear(index.eras, 1492)).toEqual({ from: 1490, to: 1599 });
  });
});
