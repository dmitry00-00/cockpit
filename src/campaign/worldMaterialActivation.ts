import { SCALE_LEVELS, type Location, type ScaleLevel, type State, type WorldDelta, type WorldPatch } from '../engine';
import { GENERATED_WORLD_MATERIAL_FORMAT, validateGeneratedWorldMaterial } from '../import/generatedWorldMaterial';
import type { ImportedContent } from '../engine';

function patchesOf(patch: WorldPatch | undefined): WorldPatch[] {
  return patch?.kind === 'batch' ? patch.patches.flatMap(child => patchesOf(child)) : patch ? [patch] : [];
}

/** Activation is a separate, reviewable world proposal. It places the campaign location, not map coordinates. */
export function importedPlaceActivationDelta(
  state: State,
  content: ImportedContent,
  scale: ScaleLevel,
  parentId?: string,
): WorldDelta {
  const accepted = state.world.importedContent?.[content.id];
  if (!accepted || accepted.kind !== content.kind || accepted.name !== content.name) throw new Error('Сначала примите этот черновик в каталог.');
  if (content.kind !== 'dungeon' && content.kind !== 'location') throw new Error('Активировать этим путём можно только подземелье или локацию.');
  const sourceData = accepted.data as { format?: unknown };
  if (sourceData.format === GENERATED_WORLD_MATERIAL_FORMAT) {
    const error = validateGeneratedWorldMaterial(accepted);
    if (error) throw new Error(`Черновик не прошёл проверку геометрии: ${error}`);
  }
  if (!SCALE_LEVELS.includes(scale) || scale === 'battle' || scale === 'cosmology' || scale === 'plane' || scale === 'system') throw new Error('Выберите уровень места от планеты до здания.');
  if (content.kind === 'dungeon' && scale !== 'building') throw new Error('Подземелье активируется как место масштаба «здание».');
  const parent = parentId ? state.world.locations[parentId] : undefined;
  if (parentId && !parent) throw new Error('Родительское место больше не существует.');
  if (parent && SCALE_LEVELS.indexOf(parent.scale) >= SCALE_LEVELS.indexOf(scale)) throw new Error('Родительское место должно быть крупнее активируемого.');

  const location: Location = {
    id: content.id,
    name: content.name,
    scale,
    revealed: false,
    ...(parent ? { parentId: parent.id } : {}),
  };
  if (state.world.locations[location.id]) throw new Error('Это место уже активировано в кампании.');
  if (Object.values(state.deltas).some(delta => delta.status === 'pending' && patchesOf(delta.patch).some(patch => patch.kind === 'newLocation' && patch.location.id === location.id))) {
    throw new Error('Активация этого места уже ожидает решения во «Входящих».');
  }

  const prefix = `d-activate-${content.id}`;
  let id = prefix;
  for (let index = 2; state.deltas[id]; index++) id = `${prefix}-${index}`;
  return {
    id,
    scale,
    subject: `Активация · ${content.name}`,
    was: 'черновик хранится только в каталоге',
    now: `${scale} · ${parent ? `в ${parent.name}` : 'корневое место кампании'} · карта остаётся схематической, без географических координат`,
    cause: `Мастер отдельно активирует принятую каталоговую запись ${content.id}. При принятии появится место кампании; раскрытие игрокам остаётся отдельным событием.`,
    causeId: content.id,
    status: 'pending',
    patch: { kind: 'newLocation', location },
  };
}
