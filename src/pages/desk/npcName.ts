// Имя появившемуся гуманоиду из округи партии (world/names): жители мест вики рядом с местом партии, раса — по типу
// блока. Справочник людей (несколько мегабайт) и мест грузятся по первому нажатию, дальше — из кэша загрузчиков.
import type { State } from '../../engine/state';
import { partyPlaceId } from '../../engine/ladder';
import { loadGazetteer } from '../../map/gazetteer';
import { mapById } from '../../map/maps';
import { loadPeople } from '../../world/people';
import { makeName, namePool, raceKey } from '../../world/names';

/** Новое имя или null: у места партии нет точки на карте мира, или у карты нет справочника жителей. */
export async function suggestNpcName(state: State, monsterType: string): Promise<string | null> {
  const at = partyPlaceId(state);
  const geo = at ? state.world.locations[at]?.geo : undefined;
  const passport = mapById(geo?.map, state.settingPackageId);
  if (!geo || !passport) return null;
  const [people, places] = await Promise.all([loadPeople(), loadGazetteer(geo.map)]);
  const xy = new Map(places.map(p => [p.id, p]));
  const pool = namePool(people.values(), xy, geo, { milesPerPixel: passport.milesPerPixel, race: raceKey(monsterType) });
  // Не повторять ни канон, ни тех, кто уже за столом.
  const taken = new Set([...people.values()].map(p => p.name.toLowerCase()));
  for (const a of Object.values(state.actors)) taken.add(a.name.toLowerCase());
  return makeName(pool, taken);
}
