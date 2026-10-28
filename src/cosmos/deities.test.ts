// Божества и пантеоны (E1): все ссылки импорта ведут на записи, значение поля — по эпохе и никогда не из книг
// новее эпохи, образцы сверены с карточками вики (Lathander, Ao, Mystra, Lolth).
import { describe, expect, it } from 'vitest';
import { EDITION_ORDER } from '../campaign/era';
import { DEITIES, PANTHEONS, alignmentRu, domainSubclasses, deitiesOfPlane, deityById, editionNote, fieldAt, homePlanesAt, pantheonById, powerLabel } from './deities';
import { GREAT_WHEEL, WORLD_TREE } from './planes';

const PLANES = new Set([...GREAT_WHEEL.planes, ...WORLD_TREE.planes].map(p => p.id));
const get = (id: string) => deityById(id)!;

describe('данные импорта', () => {
  it('сотни божеств, у каждого статья и хоть одно поле или пантеон; id уникальны', () => {
    expect(DEITIES.length).toBeGreaterThan(400);
    expect(new Set(DEITIES.map(d => d.id)).size).toBe(DEITIES.length);
    // Имя — подпись кнопки в списке богов плана: одноимённые различаются уточнением статьи.
    expect(new Set(DEITIES.map(d => d.name)).size).toBe(DEITIES.length);
    expect(deityById('mystra-midnight')!.name).toBe('Mystra (Midnight)');
    for (const d of DEITIES) {
      expect(d.url, d.id).toMatch(/^https:\/\/forgottenrealms\.fandom\.com\/wiki\//);
      expect(d.name.trim(), d.id).not.toBe('');
      expect(Object.keys(d.fields).length + (d.pantheons?.length ?? 0), d.id).toBeGreaterThan(0);
    }
  });

  it('ссылки полей ведут на планы Колеса или Древа и на божества; пантеоны и их состав сходятся', () => {
    const broken: string[] = [];
    for (const d of DEITIES) {
      for (const [f, by] of Object.entries(d.fields)) for (const cell of Object.values(by ?? {})) {
        for (const p of cell?.p ?? []) if (!PLANES.has(p)) broken.push(`${d.id}.${f} → plane:${p}`);
        for (const x of cell?.d ?? []) if (!deityById(x)) broken.push(`${d.id}.${f} → deity:${x}`);
      }
      for (const p of d.pantheons ?? []) if (!pantheonById(p)?.members.includes(d.id)) broken.push(`${d.id} → pantheon:${p}`);
      for (const a of d.aspects ?? []) if (!deityById(a)) broken.push(`${d.id} → aspect:${a}`);
    }
    for (const p of PANTHEONS) for (const m of p.members) if (!deityById(m)?.pantheons?.includes(p.id)) broken.push(`${p.id} ∌ ${m}`);
    expect(broken).toEqual([]);
    expect(pantheonById('faerunian-pantheon')!.members.length).toBeGreaterThan(50);
    expect(pantheonById('seldarine')!.members).toContain('corellon');
  });
});

describe('значение по эпохе', () => {
  it('Lathander: в 1492 DR дом — Elysium (5e), в 1372 DR — House of Nature на Древе (3e)', () => {
    const l = get('lathander');
    expect(fieldAt(l, 'homeplane', '5e')).toEqual({ edition: '5eR', cell: { t: 'Elysium (Eronia)', p: ['elysium'] } });
    expect(homePlanesAt(l, '5e')).toEqual(['elysium']);
    expect(fieldAt(l, 'homeplane', '3e')!.cell.t).toBe('House of Nature');
    expect(homePlanesAt(l, '3e')).toContain('house-of-nature');
    expect(deitiesOfPlane('elysium', '5e').map(d => d.id)).toContain('lathander');
    expect(deitiesOfPlane('house-of-nature', '3e').map(d => d.id)).toContain('lathander');
    // Колесо в 1372 DR: дом по Колесу назван последний раз в 2e — Elysium; на Древе в 1492 DR — по 3e.
    expect(deitiesOfPlane('elysium', '3e').map(d => d.id)).toContain('lathander');
    expect(deitiesOfPlane('house-of-nature', '5e').map(d => d.id)).toContain('lathander');
    expect(deitiesOfPlane('house-of-the-triad', '5e').map(d => d.id)).toContain('tyr');
    expect(deitiesOfPlane('celestia', '5e').map(d => d.id)).toContain('tyr');
  });

  it('эпоха не берёт фактов новее себя; чужая редакция помечена', () => {
    for (const d of DEITIES) for (const f of Object.keys(d.fields) as (keyof typeof d.fields)[]) {
      const v = fieldAt(d, f, '3e');
      if (v) expect(EDITION_ORDER['3e'], `${d.id}.${f}`).toContain(v.edition);
    }
    const mystra = fieldAt(get('mystra'), 'homeplane', '5e')!;
    expect(mystra.cell.t).toBe('Nirvana');
    expect(editionNote(mystra.edition, '5e')).toBe('по 2e');
    expect(editionNote('5eR', '5e')).toBeUndefined();
    expect(editionNote('', '3e')).toBeUndefined();
  });

  it('Ao — сверхбог; Lolth в 1492 DR — в Abyss, в 1372 DR — в Demonweb Pits Древа; подписи по-русски', () => {
    expect(powerLabel(fieldAt(get('ao'), 'power', '5e')!.cell.t)).toBe('сверхбог');
    expect(get('ao').pantheons).toBeUndefined();
    expect(domainSubclasses('5e', 'Life, Light')).toEqual(['jrec-jizni', 'jrec-sveta']);
    expect(domainSubclasses('3e', 'Good, Protection, Sun')).toEqual([]);
    expect(homePlanesAt(get('lolth'), '5e')).toEqual(['abyss']);
    expect(homePlanesAt(get('lolth'), '3e')).toContain('demonweb-pits');
    expect(alignmentRu('Chaotic Evil')).toBe('хаотично-злой');
    expect(powerLabel('Something new')).toBe('Something new');
  });
});
