import { describe, expect, it } from 'vitest';
import places from '../../content/maps/toril-places.json';
import cards from '../../content/maps/toril-cards.json';
import corrections from '../../content/maps/toril-raster-corrections.json';
import classifications from '../../content/maps/toril-ocr-classification.json';
import { mergeGazetteer, searchPlaces } from './gazetteer';

describe('M13 reviewed raster positions', () => {
  it('Selgaunt, Teziir, Ordulin имеют отдельные записи; правки не теряют текст карточки и источники', () => {
    const base = mergeGazetteer(places, cards);
    const result = mergeGazetteer(places, cards, corrections.places);
    for (const name of ['Selgaunt', 'Teziir', 'Ordulin']) {
      expect(searchPlaces(result, name)[0]?.name).toBe(name);
    }
    const selgaunt = searchPlaces(result, 'Selgaunt')[0];
    expect(selgaunt).toMatchObject({ x: 11500, y: 3887, approx: false, kind: 'City' });
    expect(selgaunt.card).toEqual(searchPlaces(base, 'Selgaunt')[0].card);
    expect(selgaunt.sources).toContain('https://forgottenrealms.fandom.com/wiki/Selgaunt');
    expect(searchPlaces(result, 'Tezilr')[0]).toMatchObject({ name: 'Teziir', x: 10733, y: 4108, kind: 'Town' });
    expect(searchPlaces(result, 'Al Azra')[0]).toMatchObject({
      id: '6374e17d-493c-463d-b050-4ee9d084fe7b', name: "Al Azra'Wadi", aliases: ['al-Azra Wadi®'],
      x: 14026, y: 7706, approx: false, label: false, kind: 'Town',
    });
    expect(result.find(place => place.id === '6374e17d-493c-463d-b050-4ee9d084fe7b')?.sources)
      .toContain('HandsomeRob raster: точное OCR-имя и привязанный к подписи значок village; визуальная сверка 2026-11-05');
    expect(searchPlaces(result, 'Lo Shan')[0]).toMatchObject({
      id: 'd78c5e77-2d27-4f60-b877-4ba909125485', name: "Lo'Shan", aliases: ['Lo Shan'],
      x: 18314, y: 4958, approx: false, label: false, kind: 'City',
    });
    expect(searchPlaces(result, 'Mezro')[0]).toMatchObject({
      id: '40fbe5f7-1312-403c-8335-76736a310921', name: 'Mezro', aliases: ['Mezro®'],
      x: 8531, y: 5936, approx: false, label: false, kind: 'Town',
    });
    expect(searchPlaces(result, 'Fokobi Forest')).toHaveLength(1);
    expect(searchPlaces(result, 'Fokobi Forest')[0]).toMatchObject({
      id: 'b66649ab-26c9-469f-861b-3653eeb19c1d', x: 20645, y: 4599, approx: false, label: true,
    });
    expect(new Set(result.map(p => p.id)).size).toBe(result.length);
    expect(result.length).toBe(base.length + 3);
  });
  it('все OCR-записи имеют тип, фрагменты явно отделены; классификация не создаёт места сама', () => {
    expect(classifications.labels).toHaveLength(3579);
    expect(new Set(classifications.labels.map(r => r.id)).size).toBe(3579);
    expect(classifications.labels.every(r => r.kind && ['feature', 'fragment', 'gis-reference'].includes(r.role))).toBe(true);
    expect(classifications.labels.filter(r => r.role === 'fragment')).toHaveLength(186);
    const base = mergeGazetteer(places, cards, corrections.places);
    const result = mergeGazetteer(places, cards, corrections.places, classifications.labels);
    expect(result.map(r => r.id)).toEqual(base.map(r => r.id));
    expect(result.map(r => r.card)).toEqual(base.map(r => r.card));
  });
});
