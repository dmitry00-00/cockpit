import type { Location } from '../engine/state';
import { ref, type EntityKind } from '../entities/ref';
import { settingDataFor } from '../packages/registry';
import { parseScaleLadderProfile } from '../packages/settingData';

const settingNodeId = (packageId: string, id: string) => `setting-${packageId}-${id}`;

/**
 * Resolve the active setting's navigation scaffold. Add newly introduced package nodes to existing campaigns,
 * and fill package-owned refs/geography only when an existing scaffold node does not already have them.
 */
export function settingNavigationFor(
  packageId: string,
  existing: Readonly<Record<string, Location>>,
): { locations: Location[]; rootId?: string } {
  const ladder = parseScaleLadderProfile(settingDataFor(packageId, 'ladder'), packageId);
  const roots = ladder.roots;
  const mapRoot = roots.find(root => root.scale === 'planet' && root.geo)
    ?? roots.find(root => root.geo)
    ?? roots.find(root => !root.parentId);
  if (!mapRoot) return { locations: [] };

  const existingMapRoot = mapRoot.geo
    ? Object.values(existing).find(location => location.scale === mapRoot.scale && location.geo?.map === mapRoot.geo!.map)
    : existing[mapRoot.id];

  // Reuse the campaign's existing map root, while retaining stable ids for package-owned descendants.
  const nodeIds = new Map(roots.map(root => [
    root.id,
    root.id === mapRoot.id && existingMapRoot ? existingMapRoot.id : settingNodeId(packageId, root.id),
  ]));
  const scaffold = roots.flatMap(root => {
    const id = nodeIds.get(root.id)!;
    const current = existing[id];
    const location: Location = {
      id,
      name: root.name,
      scale: root.scale,
      ...(root.parentId ? { parentId: nodeIds.get(root.parentId)! } : {}),
      ...(root.ref ? { ref: ref(root.ref.kind as EntityKind, root.ref.id) } : {}),
      ...(root.geo ? { geo: root.geo } : {}),
    };
    if (current && current.name !== location.name) throw new Error(`имя узла ${id} конфликтует с пакетом`);
    if (current && current.scale !== location.scale) throw new Error(`масштаб узла ${id} конфликтует с пакетом`);
    if (current && current.parentId && current.parentId !== location.parentId) throw new Error(`родитель узла ${id} конфликтует с пакетом`);
    if (!current || (!current.parentId && location.parentId) || (!current.ref && location.ref) || (!current.geo && location.geo)) return [location];
    return [];
  });
  const rootById = new Map(roots.map(root => [root.id, root]));
  let topId = mapRoot.id;
  let cursor = mapRoot;
  while (cursor.parentId) {
    const parent = rootById.get(cursor.parentId);
    if (!parent) break;
    topId = parent.id;
    cursor = parent;
  }
  return { locations: scaffold, rootId: nodeIds.get(topId)! };
}

