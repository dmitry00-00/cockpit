// Справочник места для сцены Д2 (ROADMAP 6.1): боги, организации, жители с их организациями, канон места из
// хронологии, класс места GIS и правила похода A5E — всё куском по требованию, только мастеру. Сцена (campaign/scene.ts)
// чистая: получает это готовым.
import type { SceneCanon } from '../campaign/scene';
import { loadGazetteer } from '../map/gazetteer';
import { loadJourney } from '../rules/a5e/journey';
import { eventsAbout, loadEvents } from './chronology';
import { loadOrgMembers, loadOrganizations, loadPlaceFaiths, type Organization } from './organizations';
import { loadResidents } from './people';

/** Канон места в сцене — события за столько лет до года сцены. */
export const SCENE_CANON_YEARS = 30;

let index: Promise<{ based: ReadonlyMap<string, Organization[]>; churches: ReadonlyMap<string, Organization[]>; orgsOf: ReadonlyMap<string, string[]> }> | null = null;

/** Обратные индексы: место → организации с базой, бог → его церкви, NPC → организации. */
function indexes() {
  index ??= Promise.all([loadOrganizations(), loadOrgMembers()]).then(([orgs, members]) => {
    const based = new Map<string, Organization[]>();
    const churches = new Map<string, Organization[]>();
    for (const o of orgs.values()) {
      for (const id of o.places ?? []) based.set(id, [...(based.get(id) ?? []), o]);
      if (o.church && o.deities?.length === 1) churches.set(o.deities[0], [...(churches.get(o.deities[0]) ?? []), o]);
    }
    const orgsOf = new Map<string, string[]>();
    for (const [org, list] of Object.entries(members)) for (const [person] of list) orgsOf.set(person, [...(orgsOf.get(person) ?? []), org]);
    return { based, churches, orgsOf };
  });
  return index;
}

/** Справочник места карты `placeId` для сцены года `year`. */
export async function loadSceneCanon(placeId: string, year: number): Promise<SceneCanon> {
  const [places, orgs, faiths, residents, idx, deities, events] = await Promise.all([
    loadGazetteer('toril'), loadOrganizations(), loadPlaceFaiths(), loadResidents(), indexes(), import('../cosmos/deities'),
    loadEvents(year - SCENE_CANON_YEARS, year), loadJourney(),
  ]);
  const place = places.find(p => p.id === placeId);
  return {
    ...(place ? { place: { id: place.id, kind: place.kind } } : {}),
    ...(faiths[placeId] ? { faith: faiths[placeId] } : {}),
    based: idx.based.get(placeId) ?? [],
    churchesOf: id => idx.churches.get(id) ?? [],
    org: id => orgs.get(id),
    deityName: id => deities.deityById(id)?.name,
    ...(residents[placeId] ? { residents: residents[placeId] } : {}),
    orgsOf: id => idx.orgsOf.get(id) ?? [],
    events: eventsAbout(events, `place:${placeId}`),
  };
}
