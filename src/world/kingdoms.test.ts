// Державы (вид `kingdom:`, 30.10.2026): правитель на год по числам вики, иначе с пометкой «на N DR» или «по статье», статус на год кампании, карточка —
// поля как в вики, соседи и столица ссылками, пустое поле не показывается; файла данных нет — справочник пуст.
import { describe, expect, it } from 'vitest';
import { kingdomView } from '../entities/packs/kingdoms';
import { parseRef } from '../entities';
import { kingdomExistsIn, kingdomHistoryOf, kingdomsOfPlace, loadKingdomHistory, loadKingdoms, peopleTrade, rulersIn, rulersLine, type Kingdom } from './kingdoms';
import type { ArticleEvent, ChronoEvent } from './chronology';

const cormyr: Kingdom = {
  id: 'cormyr', name: 'Cormyr', title: 'Cormyr', type: 'Kingdom', region: 'Western Heartlands',
  capital: 'Suzail', capitalPlace: 'p-suzail', government: 'Monarchy', population: '1,000,000',
  rulers: [{ t: 'King Azoun IV', from: 1336, to: 1369 }, { t: 'King Foril Obarskyr', from: 1385, person: 'foril' }, { t: 'Queen Steel', when: 'some time' }],
  languages: ['Common'], deities: ['tymora'], allies: ['sembia', 'nowhere'], enemyOrgs: ['zhentarim'],
  founded: -26, summary: 'The Forest Kingdom.', places: ['p-suzail', 'p-arabel'],
};
const names = {
  kingdom: (id: string) => (id === 'sembia' ? { id, name: 'Sembia', title: 'Sembia' } : undefined),
  org: (id: string) => (id === 'zhentarim' ? { id, name: 'Zhentarim', title: 'Zhentarim' } : undefined),
  deity: (id: string) => (id === 'tymora' ? 'Tymora' : undefined),
  place: (id: string) => ({ 'p-suzail': 'Suzail', 'p-arabel': 'Arabel' })[id],
};

describe('держава', () => {
  it('ссылка kingdom: разбирается; правитель — по годам вики, без чисел не угадывается; статус на год', () => {
    expect(parseRef('kingdom:cormyr')).toEqual({ kind: 'kingdom', id: 'cormyr' });
    expect(rulersIn(cormyr, 1350).map(r => r.t)).toEqual(['King Azoun IV']);
    expect(rulersIn(cormyr, 1492).map(r => r.t)).toEqual(['King Foril Obarskyr']);
    expect(rulersIn(cormyr, 1375)).toEqual([]);
    expect(kingdomExistsIn(cormyr, 1492)).toBe(true);
    expect(kingdomExistsIn(cormyr, -100)).toBe(false);
    expect(kingdomExistsIn({ dissolved: 1385 }, 1492)).toBe(false);
  });

  it('правитель для показа: срок → «на N DR» (последний не позже года) → «по статье»; пометка всегда видна', () => {
    expect(rulersLine(cormyr, 1492)).toBe('King Foril Obarskyr');
    // Правитель без дат — только в срезе 1492 DR (решение пользователя 30.10.2026).
    expect(rulersLine(cormyr, 1375)).toBeUndefined();
    expect(rulersLine({ rulers: [{ t: 'Queen Steel' }] }, 1492)).toBe('Queen Steel (по статье)');
    const amn: Pick<Kingdom, 'rulers'> = { rulers: [{ t: 'Khrulis', at: 1357 }, { t: 'Khrulis', at: 1372 }, { role: 'Caliph', t: 'Halima', at: 1480 }] };
    expect(rulersLine(amn, 1492)).toBe('Caliph Halima (на 1480 DR)');
    expect(rulersLine(amn, 1400)).toBe('Khrulis (на 1372 DR)');
    expect(rulersLine(amn, 1300)).toBeUndefined();
    expect(rulersLine({ rulers: [{ role: 'Queen', t: 'Raedra Obarskyr' }] }, 1492)).toBe('Queen Raedra Obarskyr (по статье)');
  });

  it('карточка: поля вики с годом кампании, столица и бог ссылками, соседи группами, неизвестный id не ссылается', () => {
    const v = kingdomView(cormyr, 1492, names);
    expect(v.ref).toBe('kingdom:cormyr');
    expect(v.subtitle).toBe('Kingdom · Western Heartlands');
    const fact = (l: string) => v.facts.find(f => f.label === l)?.value;
    expect(fact('Правитель в 1492 DR')).toBe('King Foril Obarskyr');
    expect(fact('Столица')).toBe('Suzail');
    expect(fact('Боги')).toBe('Tymora');
    expect(fact('Годы')).toBe('основана -26 DR · в 1492 DR есть');
    expect(fact('Валюта')).toBeUndefined();
    expect(v.sections).toEqual([{ text: 'The Forest Kingdom.' }]);
    expect(v.links.map(l => l.ref)).toEqual(['place:p-suzail', 'person:foril', 'deity:tymora']);
    expect(v.groups?.find(g => g.title === 'Союзники')?.links).toEqual([{ label: 'Sembia', ref: 'kingdom:sembia' }]);
    expect(v.groups?.find(g => g.title === 'Враги')?.links).toEqual([{ label: 'Zhentarim', ref: 'organization:zhentarim' }]);
    // Столица — ссылкой сверху, в «Местах на карте» её нет.
    expect(v.groups?.find(g => g.title === 'Места на карте')?.links.map(l => l.label)).toEqual(['Arabel']);
    // Вехи — до года кампании; состав и наследники — ссылками на державы.
    const later = kingdomView({ ...cormyr, within: ['sembia'], successors: ['sembia', 'nowhere'], demonym: 'Cormyrean', milestones: [{ t: 'Founding', year: -26 }, { t: 'Future war', year: 1500 }, { t: 'Undated' }] }, 1492, names);
    expect(later.sections.find(s => s.title === 'Вехи по 1492 DR')?.text).toBe('-26 DR — Founding\nUndated');
    expect(later.groups?.find(g => g.title === 'В составе')?.links).toEqual([{ label: 'Sembia', ref: 'kingdom:sembia' }]);
    expect(later.groups?.find(g => g.title === 'Наследники')?.links).toHaveLength(1);
    expect(later.facts.find(f => f.label === 'Народ')?.value).toBe('Cormyrean');
    expect(v.source).toMatchObject({ kind: 'wiki', license: 'CC BY-SA 3.0', url: 'https://forgottenrealms.fandom.com/wiki/Cormyr' });
  });

  it('история: оба слоя по списку державы, по году; пара `same` не повторяется; позже года — счётчиком', () => {
    const base: ChronoEvent[] = [
      { id: 'y1260-1', year: 1260, kind: 'conflicts', text: 'War of the Regency begins.', cites: ['Grand History, с. 1'] },
      { id: 'y1260-2', year: 1260, kind: 'politics', text: 'A source event without a book citation.' },
      { id: 'y1400-1', year: 1400, kind: 'politics', text: 'Something later.' },
      { id: 'y1300-1', year: 1300, kind: 'misc', text: 'Not about Cormyr.' },
    ];
    const articles: ArticleEvent[] = [
      { id: 'a1260-1', year: 1260, text: 'The War of the Regency.', same: 'y1260-1', src: { title: 'War of the Regency', how: 'conflict' } },
      { id: 'a-26-1', year: -26, text: 'Cormyr is founded.', src: { title: 'History of Cormyr (timeline)', section: 'Early', how: 'timeline' } },
    ];
    const h = kingdomHistoryOf({ events: ['y1260-1', 'y1260-2', 'y1400-1', 'a1260-1', 'a-26-1'] }, 1372, base, articles);
    expect(h.lines.map(l => l.id)).toEqual(['a-26-1', 'y1260-1', 'y1260-2']);
    expect(h.lines[0]).toMatchObject({
      sourceTitle: 'History of Cormyr (timeline) · Early',
      sourceUrl: 'https://forgottenrealms.fandom.com/wiki/History_of_Cormyr_(timeline)',
    });
    expect(h.lines.find(line => line.id === 'y1260-1')).toMatchObject({
      sourceTitle: '1260 DR',
      sourceUrl: 'https://forgottenrealms.fandom.com/wiki/1260_DR',
      cites: ['Grand History, с. 1'],
    });
    expect(h.lines.find(line => line.id === 'y1260-2')).toMatchObject({
      sourceTitle: '1260 DR',
      sourceUrl: 'https://forgottenrealms.fandom.com/wiki/1260_DR',
    });
    expect(h.later).toBe(1);
  });

  it('история с диска: у Cormyr есть события, все не позже года и по порядку', async () => {
    const k = (await loadKingdoms()).get('cormyr');
    if (!k) return; // импорт держав не запускался
    const h = await loadKingdomHistory(k, 1372);
    expect(h.lines.length).toBeGreaterThan(50);
    expect(h.lines.every((l, i, a) => l.year <= 1372 && (i === 0 || a[i - 1].year <= l.year))).toBe(true);
    expect(h.later).toBeGreaterThan(0);
  });

  it('загрузчик отдаёт Map — пустой, пока импорт держав не запускался', async () => {
    const all = await loadKingdoms();
    expect(all).toBeInstanceOf(Map);
    for (const k of all.values()) expect(k.id && k.name && k.title).toBeTruthy();
  });
});

describe('державы места', () => {
  it('по `places`, столице и месту-державе, только существующие в год; своя — первой', () => {
    const all: Kingdom[] = [
      { id: 'sembia', name: 'Sembia', title: 'Sembia', places: ['p-x'] },
      { id: 'cormyr', name: 'Cormyr', title: 'Cormyr', places: ['p-x', 'p-suzail'], capitalPlace: 'p-suzail' },
      { id: 'old', name: 'Old', title: 'Old', places: ['p-x'], dissolved: 1300 },
      { id: 'x', name: 'X', title: 'X', place: 'p-x' },
    ];
    expect(kingdomsOfPlace(all, 'p-x', 1492).map(k => k.id)).toEqual(['x', 'cormyr', 'sembia']);
    expect(kingdomsOfPlace(all, 'p-x', 1200).map(k => k.id)).toEqual(['x', 'cormyr', 'old', 'sembia']);
    expect(kingdomsOfPlace(all, 'p-suzail', 1492).map(k => k.id)).toEqual(['cormyr']);
    expect(kingdomsOfPlace(all, 'p-none', 1492)).toEqual([]);
  });
});

describe('люди в торговле', () => {
  it('рабы и наёмники — признаком по сторонам с полем вики; слитное «FabricSlavesMedicine» тоже; нет полей — пусто', () => {
    expect(peopleTrade({ exports: 'Mercenaries, slaves, spices', imports: 'Slaves' })).toEqual([
      { kind: 'slaves', side: 'export', cite: 'Mercenaries, slaves, spices' },
      { kind: 'mercenaries', side: 'export', cite: 'Mercenaries, slaves, spices' },
      { kind: 'slaves', side: 'import', cite: 'Slaves' },
    ]);
    expect(peopleTrade({ exports: 'FabricSlavesMedicine' }).map(l => l.kind)).toEqual(['slaves']);
    expect(peopleTrade({ exports: 'Lumber, salt' })).toEqual([]);
    expect(peopleTrade({})).toEqual([]);
  });
});
