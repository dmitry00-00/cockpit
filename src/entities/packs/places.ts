// Пакет мест: справочник карты Toril (GIS + карточки L3 ночной разметки) — тот же кусок, что грузит карта.
// Русское имя GIS — только для поиска, на карточку не выводится: имена мира — латиницей.
import { KIND_LABEL, loadGazetteer, wikiUrl, type GazetteerPlace } from '../../map/gazetteer';
import { tablePack, type Pack } from '../pack';
import { ref } from '../ref';
import { facts, type EntitySource, type EntityView } from '../view';

function source(p: GazetteerPlace): EntitySource {
  const url = wikiUrl(p);
  if (p.card) return { kind: 'wiki', cite: 'Forgotten Realms Wiki, карточка по-русски — ночная разметка L3', license: 'CC BY-SA 3.0', ...(url ? { url } : {}) };
  return { kind: 'gis', cite: 'Toril GIS (Geospatial Grimoire), фан-контент — авторы указаны в SOURCES.md', ...(url ? { url } : {}) };
}

const view = (p: GazetteerPlace): EntityView => ({
  ref: ref('place', p.id), kind: 'place', name: p.name,
  subtitle: `${KIND_LABEL[p.kind] ?? p.kind}${p.approx ? ' · место на карте приблизительно' : ''}`,
  source: source(p),
  facts: facts([['Что это', p.card?.what], ['Правитель', p.card?.ruler], ['Опасность', p.card?.danger]]),
  sections: p.card?.summary ? [{ text: p.card.summary }] : [],
  links: [],
});

export async function loadPack(): Promise<Pack> {
  const places = await loadGazetteer('toril');
  return tablePack({ place: Object.fromEntries(places.map(p => [p.id, () => view(p)])) });
}
