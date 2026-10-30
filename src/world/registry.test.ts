// Реестр поселений (пользователь 30.10.2026): поля заполненности, замечания (позиция по GIS, тёзки, вне графа, нет на
// карте с причиной), CSV; на диске — все поселения справочника и пропущенные GIS, Neverwinter с картой города.
import { describe, expect, it } from 'vitest';
import type { GazetteerPlace } from '../map/gazetteer';
import { planOf } from '../map/maps';
import { loadGazetteer } from '../map/gazetteer';
import missingFile from '../../content/maps/toril-missing.json';
import { loadEcon } from './econ';
import { parseGraph } from './graph';
import { loadKingdoms } from './kingdoms';
import { REGISTRY_FIELDS, placeRegistry, registryCsv, type MissingPlace, type RegistryData } from './registry';

const base = (over: Partial<RegistryData> = {}): RegistryData => ({
  places: [], kingdoms: [], econ: { kingdoms: new Map(), places: new Map() }, residents: {}, faiths: {}, orgs: new Map(),
  hasPlan: () => false, graph: null, year: 1492, ...over,
});

const P = (id: string, name: string, kind: string, extra: Partial<GazetteerPlace> = {}): GazetteerPlace => ({ id, name, kind, x: 0, y: 0, ...extra });

describe('реестр поселений', () => {
  it('только поселения; заполненность, тёзки, позиция по GIS, вне графа; пропущенное GIS — с причиной', () => {
    const graph = parseGraph({ map: 't', nodes: [['a', 0, 0, 0], ['b', 1, 0, 1], ['c', 2, 0, 0]], edges: [[0, 1, 'road', 5], [1, 2, 'water', 9]] });
    const rows = placeRegistry(base({
      places: [
        P('a', 'Amn', 'City', { card: { summary: 'x' }, sources: ['https://forgottenrealms.fandom.com/wiki/Amn'] }),
        P('b', 'Bay', 'Town', { approx: true }), P('c', 'Amn', 'Village'), P('d', 'Dun', 'Fortification'), P('r', 'Old', 'Ruins'),
      ],
      missing: [['m', 'Miss', 'Town', 'misread', 5, 6, 'Mis5']],
      kingdoms: [{ id: 'amn', name: 'Amn', title: 'Amn', places: ['a', 'b'] }],
      econ: { kingdoms: new Map([['amn', { x: ['wine', 'metal'] }]]), places: new Map() },
      residents: { a: [['p', 'P', null, null]] }, faiths: { a: { text: 'Waukeen' } }, orgs: new Map([['a', 2]]),
      hasPlan: id => id === 'a', graph,
    }));
    expect(rows.map(r => r.id)).toEqual(['a', 'c', 'b', 'd', 'm']);
    expect(rows[0]).toMatchObject({ kingdom: 'Amn', plan: true, card: true, wiki: true, goods: 2, residents: 1, faith: true, orgs: 2, graph: 'road', issues: ['тёзки: 1'] });
    expect(rows.find(r => r.id === 'b')).toMatchObject({ graph: 'road', issues: ['позиция по GIS'] });
    expect(rows.find(r => r.id === 'c')!.graph).toBe('harbour');
    expect(rows.find(r => r.id === 'd')!.issues).toEqual(['вне графа']);
    expect(rows.find(r => r.id === 'm')).toMatchObject({ missing: 'misread', graph: 'none', issues: ['нет на карте: подпись прочитана иначе («Mis5»)'] });
    const field = (k: string) => REGISTRY_FIELDS.find(f => f.key === k)!;
    expect(rows.filter(r => field('plan').filled(r)).map(r => r.id)).toEqual(['a']);
    expect(rows.filter(r => !field('map').filled(r)).map(r => r.id)).toEqual(['m']);
    expect(rows.filter(r => !field('position').filled(r)).map(r => r.id)).toEqual(['b', 'm']);
    // Без графа поле «граф» не считается — ни заполнено, ни пусто.
    expect(field('graph').filled(placeRegistry(base({ places: [P('a', 'A', 'City')] }))[0])).toBeUndefined();
    const csv = registryCsv(rows).split('\n');
    expect(csv[0]).toBe('id;имя;класс;нет на карте;держава;карта города;карточка;вики;товары;жители;вера;организации;граф;позиция по GIS;замечания');
    expect(csv[1]).toBe('a;Amn;City;;Amn;да;да;да;2;1;да;2;road;;тёзки: 1');
  });

  it('с диска: все поселения справочника и пропущенные GIS без повторов; у Neverwinter — карта города', async () => {
    const [places, kingdoms, econ] = await Promise.all([loadGazetteer('toril'), loadKingdoms(), loadEcon()]);
    const missing = (missingFile as unknown as { places: MissingPlace[] }).places;
    expect(missing).toHaveLength(354);
    const rows = placeRegistry(base({ places, missing, kingdoms: kingdoms.values(), econ, hasPlan: id => !!planOf(`place:${id}`) }));
    // Часть реестра карты уже поставлена карточками по GIS — пропущенным остаётся то, чего в справочнике нет.
    const left = rows.filter(r => r.missing).length;
    expect(left).toBeGreaterThan(150);
    expect(left).toBeLessThan(354);
    expect(rows.length).toBeGreaterThan(1100);
    const nw = rows.filter(r => r.plan);
    expect(nw.map(r => r.name)).toEqual(['Neverwinter']);
    expect(new Set(rows.map(r => r.id)).size).toBe(rows.length);
  });
});
