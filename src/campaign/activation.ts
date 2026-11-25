import type { Actor, Faction, Location, State, WorldPatch } from '../engine/state';
import { parseRef, ref, type EntityRef } from '../entities/ref';
import { MONSTER_IDS, type MonsterId } from '../rules/srd/monsters';
import { spawnMonsters } from './encounter';
import { placeLocation, type PlaceStub } from './worldGraph';

/** Only reference kinds with an explicit campaign activation path belong in this union. */
export type ReferenceActivationRequest =
  | { kind: 'monster'; monsterId: MonsterId; name: string; count: number }
  | { kind: 'place'; place: PlaceStub; map: string }
  | { kind: 'faction'; reference: EntityRef; name: string };

/** A plan is inert: actor commands or world patches still need their existing event/acceptance path. */
export type ReferenceActivationPlan =
  | { kind: 'actors'; reference: EntityRef; actors: readonly Actor[] }
  | { kind: 'location'; reference: EntityRef; location: Location; patch?: WorldPatch }
  | { kind: 'faction'; reference: EntityRef; faction: Faction; patch?: WorldPatch };

export function isMonsterReference(id: string): id is MonsterId {
  return (MONSTER_IDS as readonly string[]).includes(id);
}

function pendingFactionPatch(state: State, reference: EntityRef): boolean {
  const patches = (patch: WorldPatch | undefined): WorldPatch[] =>
    patch?.kind === 'batch' ? patch.patches.flatMap(child => patches(child)) : patch ? [patch] : [];
  return Object.values(state.deltas).some(delta => delta.status === 'pending'
    && patches(delta.patch).some(patch => patch.kind === 'newFaction' && patch.faction.ref === reference));
}

function planFactionActivation(state: State, reference: EntityRef, name: string): ReferenceActivationPlan {
  const parsed = parseRef(reference);
  if (!parsed || !['organization', 'kingdom', 'place'].includes(parsed.kind)) {
    throw new Error('Фракцией кампании можно активировать организацию, державу или место справочника.');
  }
  if (!name.trim() || name.trim().length > 160) throw new Error('Фракции кампании нужно имя длиной до 160 символов.');

  const active = Object.values(state.world.factions).find(faction => faction.ref === reference);
  if (active) return { kind: 'faction', reference, faction: active };
  if (pendingFactionPatch(state, reference)) throw new Error('Активация этой фракции уже ожидает решения во «Входящих».');

  const prefix = parsed.kind === 'place' ? `fac-place-${parsed.id}` : `fac-${parsed.id}`;
  let id = prefix;
  for (let index = 2; state.world.factions[id]; index++) id = `${prefix}-${index}`;
  const faction: Faction = { id, name: name.trim(), renown: 0, ref: reference };
  return { kind: 'faction', reference, faction, patch: { kind: 'newFaction', faction } };
}

/** Build a typed activation plan from a known reference without mutating campaign State. */
export function planReferenceActivation(state: State, request: ReferenceActivationRequest): ReferenceActivationPlan {
  if (request.kind === 'monster') {
    return {
      kind: 'actors',
      reference: ref('monster', request.monsterId),
      actors: spawnMonsters(state, request.monsterId, request.name, request.count),
    };
  }
  if (request.kind === 'faction') return planFactionActivation(state, request.reference, request.name);
  const placed = placeLocation(state, request.place, request.map);
  return {
    kind: 'location',
    reference: ref('place', request.place.id),
    location: placed.location,
    ...(placed.patch ? { patch: placed.patch } : {}),
  };
}
