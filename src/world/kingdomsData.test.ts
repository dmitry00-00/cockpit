// Данные держав и слоя хронологии из статей (30.10.2026): структура content/world/kingdoms.json
// (scripts/import-kingdoms.py) и content/chronology/articles/ (scripts/import-chronology-articles.py), ссылки — на
// существующие id справочников, строки без вики-разметки, пустых полей нет, ссылки kingdom: в событиях статей-годов.
import { describe, expect, it } from 'vitest';
import kingdomsFile from '../../content/world/kingdoms.json';
import organizationsFile from '../../content/world/organizations.json';
import deitiesFile from '../../content/cosmos/deities.json';
import placesFile from '../../content/maps/toril-places.json';
import cardsFile from '../../content/maps/toril-cards.json';
import labelsFile from '../../content/maps/toril-labels.json';
import articlesIndex from '../../content/chronology/articles/index.json';
import { eventsAbout, loadEvents, type ChronoEvent } from './chronology';
import { peopleTrade, type Kingdom, type KingdomRuler } from './kingdoms';

type Rec = Kingdom & { rulers?: readonly (KingdomRuler & { at?: number; org?: string; role?: string })[]; events?: readonly string[]; gis?: { uuid: string; name: string } };
type ArticleEvent = ChronoEvent & { kind?: string; to?: number; same?: string; src: { title: string; section?: string; how: string } };

const file = kingdomsFile as unknown as { attribution: string; license: string; kingdoms: Rec[] };
const kingdoms = file.kingdoms;
const byId = new Map(kingdoms.map(k => [k.id, k]));
const orgIds = new Set((organizationsFile as unknown as { organizations: { id: string }[] }).organizations.map(o => o.id));
const deityIds = new Set((deitiesFile as unknown as { deities: { id: string }[] }).deities.map(d => d.id));
const placeIds = new Set([
  ...(placesFile as unknown as { places: { id: string }[] }).places.map(p => p.id),
  ...(cardsFile as unknown as { places: { id: string }[] }).places.map(p => p.id),
]);
const labelNames = new Set((labelsFile as unknown as { labels: [string, ...unknown[]][] }).labels.map(l => l[0]));
const peopleChunks = import.meta.glob<{ default: { people: { id: string }[] } }>('../../content/world/people/*.json', { eager: true });
const personIds = new Set(Object.values(peopleChunks).flatMap(m => m.default.people.map(p => p.id)));
const articleChunks = import.meta.glob<{ default: { events: ArticleEvent[] } }>('../../content/chronology/articles/[0-9]*.json', { eager: true });
const articleEvents = Object.values(articleChunks).flatMap(m => m.default.events);
const MARKUP = /\[\[|\]\]|\{\{|\}\}|''|<\/?[a-z]|\|/i; // «halflings >1%» — текст вики, не тег

describe('державы: content/world/kingdoms.json', () => {
  it('авторство вики, id уникальны и слагом, у каждой — имя и заголовок; пустых полей нет', () => {
    expect(file.license).toBe('CC BY-SA 3.0');
    expect(kingdoms.length).toBeGreaterThan(400);
    expect(byId.size).toBe(kingdoms.length);
    for (const k of kingdoms) {
      expect(k.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(k.name && k.title).toBeTruthy();
      for (const [key, v] of Object.entries(k)) {
        expect(v === '' || (Array.isArray(v) && v.length === 0), `${k.id}.${key}`).toBe(false);
      }
    }
  });

  it('строки — как в вики, без разметки', () => {
    for (const k of kingdoms) {
      for (const key of ['name', 'capital', 'government', 'population', 'races', 'currency', 'exports', 'imports', 'region', 'summary', 'deityText'] as const) {
        const v = k[key];
        if (v !== undefined) expect(v, `${k.id}.${key}`).not.toMatch(MARKUP);
      }
      for (const r of k.rulers ?? []) expect(r.t, k.id).not.toMatch(MARKUP);
    }
  });

  it('ссылки — на существующие id: места карты, боги, NPC, организации, державы, подписи схемы, события хронологии', () => {
    const baseOrArticle = new Set(articleEvents.map(e => e.id));
    for (const k of kingdoms) {
      if (k.capitalPlace) expect(placeIds.has(k.capitalPlace), k.id).toBe(true);
      for (const p of k.places ?? []) expect(placeIds.has(p), `${k.id} → ${p}`).toBe(true);
      for (const d of k.deities ?? []) expect(deityIds.has(d), `${k.id} → ${d}`).toBe(true);
      for (const r of k.rulers ?? []) {
        if (r.person) expect(personIds.has(r.person), `${k.id} → ${r.person}`).toBe(true);
        if (r.org) expect(orgIds.has(r.org), `${k.id} → ${r.org}`).toBe(true);
        if (r.from !== undefined && r.to !== undefined) expect(r.to).toBeGreaterThanOrEqual(r.from);
      }
      for (const a of k.allies ?? []) expect(byId.has(a), `${k.id} → ${a}`).toBe(true);
      for (const o of k.allyOrgs ?? []) expect(orgIds.has(o), `${k.id} → ${o}`).toBe(true);
      if (k.label) expect(labelNames.has(k.label), k.id).toBe(true);
      if (k.years) expect([...k.years]).toEqual([...new Set(k.years)].sort((a, b) => a - b));
      for (const e of k.events ?? []) if (e.startsWith('a')) expect(baseOrArticle.has(e), `${k.id} → ${e}`).toBe(true);
    }
  });

  it('Cormyr, Thay, Shadowdale, Netheril — поля карточек вики', () => {
    const cormyr = byId.get('cormyr')!;
    expect(cormyr).toMatchObject({ name: 'Cormyr', capital: 'Suzail', founded: 26, label: 'Cormyr', region: 'Interior Faerûn' });
    expect(cormyr.capitalPlace).toBeTruthy();
    expect(cormyr.deities).toContain('tymora');
    expect(cormyr.currency).toMatch(/^1pp = 1 "tricrown" = 10 gold "lions"/);
    expect(cormyr.summary).toMatch(/^Cormyr, also known as the Forest Country/);
    expect(cormyr.gis?.name).toBe('Cormyr');
    // Ruler type Monarch: глава государства — Queen Raedra Obarskyr (5e).
    expect(cormyr.rulers).toContainEqual(expect.objectContaining({ t: 'Raedra Obarskyr', person: 'raedra-obarskyr' }));
    // Szass Tam — High Regent «in 1372 DR»: год «на», а не начало правления — from/to нет.
    const szass = byId.get('thay')!.rulers!.find(r => r.person === 'szass-tam')!;
    expect(szass).toBeDefined();
    expect(szass.from).toBeUndefined();
    // Rulertable Shadowdale: «Mourngrym Amcathra — 1353 DR–1375 DR».
    expect(byId.get('shadowdale')!.rulers).toContainEqual(expect.objectContaining({ t: 'Mourngrym Amcathra', from: 1353, to: 1375 }));
    const netheril = byId.get('netheril')!;
    expect(netheril.type).toBe('Empire');
    expect(netheril.years).toContain(-339);
  });

  it('люди в торговле: рабы у 20 держав (Thay — вывоз и ввоз), наёмники — у Calimshan, Amn и ещё восьми', () => {
    const who = (kind: string) => kingdoms.filter(k => peopleTrade(k).some(l => l.kind === kind)).map(k => k.id);
    expect(who('slaves')).toHaveLength(20);
    expect(peopleTrade(byId.get('thay')!).filter(l => l.kind === 'slaves').map(l => l.side)).toEqual(['export', 'import']);
    expect(who('mercenaries')).toEqual(expect.arrayContaining(['calimshan', 'amn', 'neverwinter']));
    expect(who('mercenaries')).toHaveLength(10);
  });
});

describe('хронология: ссылки kingdom: и слой статей', () => {
  it('события статей-годов ссылаются на державы, которых нет в справочнике карты; id державы существует', async () => {
    const events = await loadEvents(-339, -339);
    expect(eventsAbout(events, 'kingdom:netheril').length).toBeGreaterThan(0);
    const all = await loadEvents(-40000, 3000);
    for (const e of all) for (const l of e.links ?? []) if (l.ref?.startsWith('kingdom:')) expect(byId.has(l.ref.slice(8)), l.ref).toBe(true);
  });

  it('слой статей: куски по годам, уникальные id, строки без разметки, источник у каждого; same — событие статей-годов', async () => {
    const index = articlesIndex as unknown as { license: string; chunks: { n: number; from: number; to: number; events: number }[]; sources: Record<string, number> };
    expect(index.license).toBe('CC BY-SA 3.0');
    expect(Object.keys(index.sources).sort()).toEqual(['conflict', 'event', 'history', 'timeline']);
    expect(index.chunks.reduce((s, c) => s + c.events, 0)).toBe(articleEvents.length);
    expect(new Set(articleEvents.map(e => e.id)).size).toBe(articleEvents.length);
    const base = new Set((await loadEvents(-40000, 3000)).map(e => e.id));
    for (const e of articleEvents) {
      expect(e.text, e.id).not.toMatch(MARKUP);
      expect(e.src.title).toBeTruthy();
      expect(['conflict', 'event', 'history', 'timeline']).toContain(e.src.how);
      if (e.same) expect(base.has(e.same), e.id).toBe(true);
      if (e.to !== undefined) expect(e.to).toBeGreaterThan(e.year);
    }
    const regency = articleEvents.find(e => e.src.title === 'War of the Regency')!;
    expect(regency).toMatchObject({ year: 1260, to: 1261, kind: 'conflicts' });
    expect(articleEvents.some(e => e.src.title === 'History of Cormyr (timeline)' && e.year === 26)).toBe(true);
  });
});
