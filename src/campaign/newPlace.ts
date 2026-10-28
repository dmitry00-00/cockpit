// Новое место щелчком по карте (M8, ROADMAP 3.5): черновик карты → предложение с патчем «новое место». Мир меняется
// только принятием (CLAUDE.md «Состояние»): до «Принять» места нет, после — оно с geo на карте, Ctrl+Z убирает.
// id — из имени, с номером при совпадении (и с ждущими предложениями тоже): реплей лога даёт те же id.
import { SCALE_LEVELS, type Location, type ScaleLevel, type State, type WorldDelta } from '../engine';
import { ref } from '../entities/ref';

export interface NewPlaceInput {
  name: string;
  scale: ScaleLevel;
  map: string;
  x: number;
  y: number;
  /** Место справочника карты под щелчком — ссылка на его карточку по вики. */
  gazetteerId?: string;
}

const SCALE_WORD: Partial<Record<ScaleLevel, string>> = { continent: 'континент', region: 'регион', settlement: 'поселение', building: 'здание' };

const slug = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9а-яё]+/g, '-').replace(/^-|-$/g, '') || 'mesto';

export function newPlaceDelta(state: State, input: NewPlaceInput, parent: Location): WorldDelta {
  if (!SCALE_LEVELS.includes(input.scale)) throw new Error(`нет такого уровня: ${input.scale}`);
  const proposed = new Set(Object.values(state.deltas).flatMap(d => (d.patch?.kind === 'newLocation' ? [d.patch.location.id] : [])));
  const base = `loc-${slug(input.name)}`;
  let id = base;
  for (let n = 2; state.world.locations[id] || proposed.has(id); n++) id = `${base}-${n}`;
  let deltaId = `d-new-${id}`;
  for (let n = 2; state.deltas[deltaId]; n++) deltaId = `d-new-${id}-${n}`;
  const location: Location = {
    id, name: input.name, scale: input.scale, parentId: parent.id,
    geo: { map: input.map, x: input.x, y: input.y },
    ...(input.gazetteerId ? { ref: ref('place', input.gazetteerId) } : {}),
  };
  return {
    id: deltaId, scale: input.scale, subject: `Новое место · ${input.name}`,
    was: 'нет на карте', now: `${SCALE_WORD[input.scale] ?? input.scale} в ${parent.name}`,
    // Причина — само место, куда новое встаёт: каскад журнала ведёт от него.
    cause: input.gazetteerId ? 'отмечено мастером по справочнику карты' : 'отмечено мастером на карте', causeId: parent.id,
    status: 'pending', patch: { kind: 'newLocation', location },
  };
}
