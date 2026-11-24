import type { Command, ScaleLevel } from '../engine/events';
import type { A5ePrestigeProfile, Actor, Location, State } from '../engine/state';
import { prestigeFromLevel } from '../rules/a5e/prestige';

export type PrestigeCoverage = 'inside' | 'outside' | 'unknown';

/** The base rating follows A5E level milestones; only explicit Narrator awards add to it. */
export function prestigeRatingOf(actor: Actor): number | null {
  if (actor.kind !== 'pc' || !actor.sheet) return null;
  return prestigeFromLevel(actor.sheet.level) + (actor.a5ePrestige?.awards ?? []).reduce((sum, award) => sum + award.points, 0);
}

export function prestigeProfileOf(actor: Actor): A5ePrestigeProfile {
  return actor.a5ePrestige ?? { awards: [] };
}

export function prestigeProfileCommand(actorId: string, profile: A5ePrestigeProfile): Command {
  return { type: 'A5E_PRESTIGE_UPDATED', payload: { actorId, profile, source: 'a5e-srd:adventuring-8' } };
}

function atScale(locations: State['world']['locations'], locationId: string, scale: ScaleLevel): string | undefined {
  const seen = new Set<string>();
  let current: Location | undefined = locations[locationId];
  while (current && !seen.has(current.id)) {
    if (current.scale === scale) return current.id;
    seen.add(current.id);
    current = current.parentId ? locations[current.parentId] : undefined;
  }
  return undefined;
}

/**
 * Compare campaign locations only where the saved hierarchy represents the A5E Prestige scope.
 * Local districts, countries, and multiverse-wide distances have no exact scale in this map and
 * deliberately return unknown so the Narrator can choose the check mode.
 */
export function prestigeCoverage(state: State, centerId: string | undefined, currentId: string | undefined, rating: number): PrestigeCoverage {
  const locations = state.world.locations;
  if (!centerId || !currentId || !locations[centerId] || !locations[currentId]) return 'unknown';
  if (centerId === currentId) return 'inside';

  let scope: ScaleLevel | undefined;
  if (rating >= 2 && rating <= 4) scope = 'settlement';
  else if (rating === 5) scope = 'region';
  else if (rating === 7) scope = 'continent';
  else if (rating === 8) scope = 'planet';
  else if (rating === 9) scope = 'plane';
  if (!scope) return 'unknown';

  const centerScope = atScale(locations, centerId, scope);
  const currentScope = atScale(locations, currentId, scope);
  if (!centerScope || !currentScope) return 'unknown';
  return centerScope === currentScope ? 'inside' : 'outside';
}
