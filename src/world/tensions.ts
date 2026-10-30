// Справочник для напряжений (Д3, ROADMAP 7.1): организации, их члены, вера мест, жители и имена мест справочника карты —
// куском мира по требованию, только мастеру. Поиск (campaign/tensions.ts) чистый: получает это готовым.
import type { TensionCanon } from '../campaign/tensions';
import { loadGazetteer } from '../map/gazetteer';
import { loadOrgMembers, loadOrganizations, loadPlaceFaiths } from './organizations';
import { loadResidents } from './people';

let canon: Promise<TensionCanon> | null = null;

/** Справочник напряжений; повторный вызов — тот же промис. */
export function loadTensionCanon(): Promise<TensionCanon> {
  canon ??= Promise.all([loadOrganizations(), loadOrgMembers(), loadPlaceFaiths(), loadResidents(), loadGazetteer('toril')])
    .then(([orgs, members, faiths, residents, gazetteer]) => {
      const names = new Map(gazetteer.map(p => [p.id, p.name]));
      // Дом NPC — первое место, где он в жителях (у большинства одно).
      const home = new Map<string, string>();
      for (const [place, list] of Object.entries(residents)) for (const [id] of list) if (!home.has(id)) home.set(id, place);
      return { orgs, members, faiths, placeName: id => names.get(id), homeOf: id => home.get(id) };
    });
  return canon;
}
