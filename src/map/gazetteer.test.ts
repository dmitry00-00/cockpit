// Справочник мест карты: слияние GIS и карточек, поиск по имени, место под щелчком; и сами файлы данных.
import { describe, expect, it } from 'vitest';
import cardsFile from '../../content/maps/toril-cards.json';
import { KIND_LABEL, fold, kindRank, layerPlaces, loadGazetteer, mergeGazetteer, placeNear, searchPlaces, type GazetteerPlace } from './gazetteer';

const list: GazetteerPlace[] = [
  { id: '1', name: 'Neverwinter', nameRu: 'Невервинтер', kind: 'City', x: 100, y: 100, card: { what: 'Город.' } },
  { id: '2', name: 'Neverwinter Wood', kind: 'Temperate Forest', x: 140, y: 90 },
  { id: '3', name: 'Port Neverwinter', kind: 'Town', x: 500, y: 500 },
  { id: '4', name: 'Selûne’s Rest', kind: 'Inn', x: 900, y: 900 },
];

describe('справочник мест', () => {
  it('fold: регистр, диакритика, ё и апостроф', () => {
    expect(fold('Selûne’s Rest')).toBe("selune's rest");
    expect(fold('Ёлка')).toBe('елка');
  });

  it('поиск: имя целиком, начало, начало слова, вхождение; русское имя GIS тоже; меньше двух букв — пусто', () => {
    expect(searchPlaces(list, 'neverwinter').map(p => p.id)).toEqual(['1', '2', '3']);
    expect(searchPlaces(list, 'wood').map(p => p.id)).toEqual(['2']);
    expect(searchPlaces(list, 'невер').map(p => p.id)).toEqual(['1']);
    expect(searchPlaces(list, 'selunes').map(p => p.id)).toEqual([]);
    expect(searchPlaces(list, "selune's").map(p => p.id)).toEqual(['4']);
    expect(searchPlaces(list, 'n')).toEqual([]);
  });

  it('место под щелчком — ближайшее в радиусе; подпись ловится шире, значок рядом с ней побеждает', () => {
    expect(placeNear(list, { x: 130, y: 92 }, 20)?.id).toBe('2');
    expect(placeNear(list, { x: 300, y: 300 }, 20)).toBeUndefined();
    const lab: GazetteerPlace[] = [{ id: 'l', name: "Liam's Hold", kind: 'settlement', x: 0, y: 0, label: true }, { id: 'i', name: 'Icon', kind: 'Town', x: 50, y: 0 }];
    expect(placeNear(lab, { x: 35, y: 0 }, 10, 40)?.id).toBe('l');
    expect(placeNear(lab, { x: 44, y: 0 }, 10, 40)?.id).toBe('i');
    expect(placeNear(lab, { x: 0, y: 60 }, 10, 40)).toBeUndefined();
  });

  it('слой «Справочник»: только с карточкой и в рамке; сначала города, затем городки, крепости, местность; не больше limit', () => {
    const card = { what: 'x' };
    const list: GazetteerPlace[] = [
      { id: 'f', name: 'Wood', kind: 'Temperate Forest', x: 5, y: 5, card },
      { id: 'r', name: 'Ruin', kind: 'Ruins', x: 5, y: 5, card },
      { id: 'c', name: 'City', kind: 'City', x: 5, y: 5, card },
      { id: 't', name: 'Town', kind: 'settlement', x: 5, y: 5, card },
      { id: 'n', name: 'No card', kind: 'City', x: 5, y: 5 },
      { id: 'o', name: 'Outside', kind: 'City', x: 50, y: 5, card },
    ];
    expect(layerPlaces(list, { x0: 0, y0: 0, x1: 10, y1: 10 }).map(p => p.id)).toEqual(['c', 't', 'r', 'f']);
    expect(layerPlaces(list, { x0: 0, y0: 0, x1: 10, y1: 10 }, 2).map(p => p.id)).toEqual(['c', 't']);
    expect([kindRank('Capital'), kindRank('Town'), kindRank('Fortification'), kindRank('river')]).toEqual([0, 1, 2, 3]);
  });

  it('слияние: карточка ложится на место GIS, место только из карточек добавляется', () => {
    const merged = mergeGazetteer(
      { places: [{ id: 'a', name: 'Arabel', nameRu: 'Арабел', class: 'City', x: 1, y: 2 }] },
      { license: '', places: [{ id: 'a', name: 'Arabel', kind: 'City', x: 1, y: 2, card: { what: 'Город.' } }, { id: 'ocr:1', name: 'Adbar Road', kind: 'road', x: 5, y: 6 }] },
    );
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ id: 'a', nameRu: 'Арабел', card: { what: 'Город.' } });
    expect(merged[1]).toMatchObject({ id: 'ocr:1', name: 'Adbar Road' });
  });

  it('файл карточек: у каждой позиция, текст и источник; имена не капителью; лицензия вики названа', async () => {
    expect(cardsFile.license).toMatch(/CC BY-SA 3\.0/);
    for (const c of cardsFile.places) {
      expect(Number.isFinite(c.x) && Number.isFinite(c.y)).toBe(true);
      expect(c.card.summary ?? c.card.what).toBeTruthy();
      expect(c.sources.length).toBeGreaterThan(0);
      expect(c.name).not.toBe(c.name.toUpperCase());
    }
    const all = await loadGazetteer('toril');
    expect(all.length).toBeGreaterThan(cardsFile.places.length);
    expect(searchPlaces(all, 'Daggerford')[0]?.name).toBe('Daggerford');
    expect(await loadGazetteer('planetos')).toEqual([]);
  });

  it('классы мест в справочнике подписаны по-русски', async () => {
    const kinds = new Set((await loadGazetteer('toril')).map(p => p.kind));
    const missing = [...kinds].filter(k => k && k !== 'other' && k !== 'Other' && !KIND_LABEL[k]);
    expect(missing).toEqual([]);
  });
});
