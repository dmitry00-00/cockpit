import type { State } from '../engine/state';
import type { MapPoint } from './projection';

export interface WarFrontMapLine {
  id: string;
  label: string;
  nodes: readonly (MapPoint & { id: string; name: string })[];
}

/** The front route is a GM lens over accepted war processes, never part of the player map projection. */
export function warFrontLinesFromState(state: State, mapId: string, dmView: boolean): readonly WarFrontMapLine[] {
  if (!dmView || !mapId) return [];
  return Object.values(state.world.processes ?? {}).flatMap(process => {
    if (process.kind !== 'war' || process.ended || !['mobilization', 'campaign', 'protracted'].includes(process.stage)) return [];
    const data = process.data;
    if (!data || data.kind !== 'war' || data.version !== 1 || typeof data.front !== 'object' || data.front === null) return [];
    const front = data.front as { map?: unknown; nodes?: unknown };
    if (front.map !== mapId || !Array.isArray(front.nodes) || front.nodes.length < 2) return [];
    const nodes = front.nodes.filter((node): node is { id: string; name: string; x: number; y: number } =>
      typeof node === 'object' && node !== null
      && typeof node.id === 'string' && typeof node.name === 'string'
      && Number.isFinite(node.x) && Number.isFinite(node.y));
    return nodes.length >= 2 ? [{ id: process.id, label: process.name, nodes }] : [];
  });
}
