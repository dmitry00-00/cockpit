// Известность партии (E10, ROADMAP 3.6): у фракции кампании — числом в состоянии, меняется только принятием
// предложения (патч фракции renown); организация справочника (церковь, гильдия) становится фракцией кампании тоже
// предложением — патчем newFaction со ссылкой на неё. Мастер нажимает «+1» — во входящих предложение, «Принять» —
// число в мире, Ctrl+Z — обратно.
import type { State, WorldDelta } from '../engine';
import { ref } from '../entities/ref';

/** Свободный id предложения: основа и номер при совпадении. */
const freeId = (state: State, base: string) => {
  let id = base;
  for (let n = 2; state.deltas[id]; n++) id = `${base}-${n}`;
  return id;
};

/** Предложение сдвинуть известность партии у фракции на step. */
export function renownDelta(state: State, factionId: string, step: number): WorldDelta {
  const f = state.world.factions[factionId];
  if (!f) throw new Error(`нет фракции ${factionId}`);
  const value = f.renown + step;
  return {
    id: freeId(state, `d-renown-${factionId}`), scale: 'continent', subject: `Известность партии · ${f.name}`,
    was: String(f.renown), now: String(value), cause: step > 0 ? 'мастер: партия помогла фракции' : 'мастер: партия навредила фракции',
    causeId: factionId, status: 'pending', patch: { kind: 'faction', id: factionId, field: 'renown', value },
  };
}

/** Фракция кампании, которая ссылается на организацию справочника, — если есть. */
export const factionOfOrganization = (state: State, orgId: string) =>
  Object.values(state.world.factions).find(f => f.ref === ref('organization', orgId));

/** Предложение сделать организацию справочника фракцией кампании: известность 0, ссылка на организацию. */
export function organizationFactionDelta(state: State, org: { id: string; name: string }): WorldDelta {
  let id = `fac-${org.id}`;
  for (let n = 2; state.world.factions[id]; n++) id = `fac-${org.id}-${n}`;
  return {
    id: freeId(state, `d-faction-${org.id}`), scale: 'continent', subject: `Новая фракция · ${org.name}`,
    was: 'нет в кампании', now: 'фракция, известность партии 0', cause: 'мастер добавил из справочника организаций',
    causeId: ref('organization', org.id), status: 'pending',
    patch: { kind: 'newFaction', faction: { id, name: org.name, renown: 0, ref: ref('organization', org.id) } },
  };
}
