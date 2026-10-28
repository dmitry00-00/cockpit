// Пакет мест: справочник карты Toril (GIS + карточки L3 ночной разметки) — тот же кусок, что грузит карта; жители
// места — индекс NPC вики (E9), живые в год кампании.
// Русское имя GIS — только для поиска, на карточку не выводится: имена мира — латиницей.
import { KIND_LABEL, loadGazetteer, wikiUrl, type GazetteerPlace } from '../../map/gazetteer';
import { loadResidents, residentsAlive, type Resident } from '../../world/people';
import { tablePack, type Pack } from '../pack';
import { ref } from '../ref';
import { facts, type EntitySource, type EntityView } from '../view';

function source(p: GazetteerPlace): EntitySource {
  const url = wikiUrl(p);
  if (p.card) return { kind: 'wiki', cite: 'Forgotten Realms Wiki, карточка по-русски — ночная разметка L3', license: 'CC BY-SA 3.0', ...(url ? { url } : {}) };
  return { kind: 'gis', cite: 'Toril GIS (Geospatial Grimoire), фан-контент — авторы указаны в SOURCES.md', ...(url ? { url } : {}) };
}

function view(p: GazetteerPlace, year: number, residents: readonly Resident[] | undefined): EntityView {
  const alive = residentsAlive(residents, year);
  return {
    ref: ref('place', p.id), kind: 'place', name: p.name,
    subtitle: `${KIND_LABEL[p.kind] ?? p.kind}${p.approx ? ' · место на карте приблизительно' : ''}`,
    source: source(p),
    facts: facts([['Что это', p.card?.what], ['Правитель', p.card?.ruler], ['Опасность', p.card?.danger]]),
    sections: p.card?.summary ? [{ text: p.card.summary }] : [],
    links: [],
    // Жители по дому из {{Person}} (E9), живые в год кампании; в Baldur's Gate их сотни — свёрнутой группой.
    ...(alive.length ? { groups: [{ title: `Жители в ${year} DR`, links: alive.map(([id, name]) => ({ label: name, ref: ref('person', id) })) }] } : {}),
  };
}

export async function loadPack(): Promise<Pack> {
  const [places, residents] = await Promise.all([loadGazetteer('toril'), loadResidents()]);
  return tablePack({ place: Object.fromEntries(places.map(p => [p.id, (_era, year: number) => view(p, year, residents[p.id])])) });
}
