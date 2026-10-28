// Пакет мест: справочник карты Toril (GIS + карточки L3 ночной разметки) — тот же кусок, что грузит карта; жители
// места — индекс NPC вики (E9), живые в год кампании; боги места, церкви и организации (ROADMAP 3.4) — по полю
// religion статьи о месте и базе организаций вики, организации — существующие в год кампании.
// Русское имя GIS — только для поиска, на карточку не выводится: имена мира — латиницей.
import { KIND_LABEL, loadGazetteer, wikiUrl, type GazetteerPlace } from '../../map/gazetteer';
import { loadOrganizations, loadPlaceFaiths, orgExistsIn, type Organization, type PlaceFaith } from '../../world/organizations';
import { loadResidents, residentsAlive, type Resident } from '../../world/people';
import { tablePack, type Pack } from '../pack';
import { ref } from '../ref';
import { facts, type EntityGroup, type EntitySource, type EntityView } from '../view';

function source(p: GazetteerPlace): EntitySource {
  const url = wikiUrl(p);
  if (p.card) return { kind: 'wiki', cite: 'Forgotten Realms Wiki, карточка по-русски — ночная разметка L3', license: 'CC BY-SA 3.0', ...(url ? { url } : {}) };
  return { kind: 'gis', cite: 'Toril GIS (Geospatial Grimoire), фан-контент — авторы указаны в SOURCES.md', ...(url ? { url } : {}) };
}

interface World {
  residents?: readonly Resident[];
  faith?: PlaceFaith;
  /** Организации с базой здесь. */
  based: readonly Organization[];
  /** Церкви одного бога — для богов места. */
  churchesOf: (deity: string) => readonly Organization[];
  deityName: (id: string) => string | undefined;
}

const orgLink = (o: Organization) => ({ label: o.name, ref: ref('organization', o.id) });

function view(p: GazetteerPlace, year: number, w: World): EntityView {
  const alive = residentsAlive(w.residents, year);
  const gods = w.faith?.deities ?? [];
  const live = (list: readonly Organization[]) => list.filter(o => orgExistsIn(o, year));
  // Церкви: с базой здесь, затем церкви богов места — без повторов.
  const churches = [...new Map([...live(w.based.filter(o => o.church)), ...gods.flatMap(g => live(w.churchesOf(g)))].map(o => [o.id, o])).values()];
  const orgs = live(w.based.filter(o => !o.church)).sort((a, b) => a.name.localeCompare(b.name));
  const groups: EntityGroup[] = [
    ...(gods.length ? [{ title: 'Боги места', links: gods.map(id => ({ label: w.deityName(id) ?? id, ref: ref('deity', id) })) }] : []),
    ...(churches.length ? [{ title: 'Церкви', links: churches.map(orgLink) }] : []),
    ...(orgs.length ? [{ title: `Организации в ${year} DR`, links: orgs.map(orgLink) }] : []),
    // Жители по дому из {{Person}} (E9), живые в год кампании; в Baldur's Gate их сотни — свёрнутой группой.
    ...(alive.length ? [{ title: `Жители в ${year} DR`, links: alive.map(([id, name]) => ({ label: name, ref: ref('person', id) })) }] : []),
  ];
  return {
    ref: ref('place', p.id), kind: 'place', name: p.name,
    subtitle: `${KIND_LABEL[p.kind] ?? p.kind}${p.approx ? ' · место на карте приблизительно' : ''}`,
    source: source(p),
    facts: facts([['Что это', p.card?.what], ['Правитель', p.card?.ruler], ['Опасность', p.card?.danger], ['Почитают', w.faith?.text]]),
    sections: p.card?.summary ? [{ text: p.card.summary }] : [],
    links: [],
    ...(groups.length ? { groups } : {}),
  };
}

export async function loadPack(): Promise<Pack> {
  // Имена богов — из справочника богов (кусок космоса): связь без имени была бы id.
  const [places, residents, orgs, faiths, deities] = await Promise.all([
    loadGazetteer('toril'), loadResidents(), loadOrganizations(), loadPlaceFaiths(), import('../../cosmos/deities'),
  ]);
  const based = new Map<string, Organization[]>();
  const churches = new Map<string, Organization[]>();
  for (const o of orgs.values()) {
    for (const id of o.places ?? []) based.set(id, [...(based.get(id) ?? []), o]);
    // Церковь одного бога — его церковь; у Cult of the Dragon богов девять, это не церковь ни одного из них.
    if (o.church && o.deities?.length === 1) churches.set(o.deities[0], [...(churches.get(o.deities[0]) ?? []), o]);
  }
  const deityName = (id: string) => deities.deityById(id)?.name;
  const churchesOf = (id: string) => churches.get(id) ?? [];
  return tablePack({
    place: Object.fromEntries(places.map(p => [p.id, (_era, year: number) =>
      view(p, year, { residents: residents[p.id], faith: faiths[p.id], based: based.get(p.id) ?? [], churchesOf, deityName })])),
  });
}
