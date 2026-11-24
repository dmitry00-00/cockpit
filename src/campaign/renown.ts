// Известность партии (E10, ROADMAP 3.6): у фракции кампании — числом в состоянии, меняется только принятием
// предложения (патч фракции renown); организация справочника (церковь, гильдия) или держава становится фракцией кампании тоже
// предложением — патчем newFaction со ссылкой на неё. Мастер нажимает «+1» — во входящих предложение, «Принять» —
// число в мире, Ctrl+Z — обратно.
import type { State, WorldDelta } from '../engine';
import { ref, type EntityRef } from '../entities/ref';
import { planReferenceActivation } from './activation';

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

/** Предложение изменить standing фракции к партии; ограничено диапазоном −3…+3. */
export function standingDelta(state: State, factionId: string, step: -1 | 1): WorldDelta {
  const f = state.world.factions[factionId];
  if (!f) throw new Error(`нет фракции ${factionId}`);
  const was = f.standing ?? 0;
  const value = Math.max(-3, Math.min(3, was + step));
  return {
    id: freeId(state, `d-standing-${factionId}`), scale: 'continent', subject: `Отношение к партии · ${f.name}`,
    was: String(was), now: String(value), cause: step > 0 ? 'мастер: отношение фракции к партии улучшилось' : 'мастер: отношение фракции к партии ухудшилось',
    causeId: factionId, status: 'pending', patch: { kind: 'faction', id: factionId, field: 'standing', value },
  };
}

/** Фракция кампании, которая ссылается на организацию или державу справочника (`organization:…`, `kingdom:…`), — если есть. */
export const factionOf = (state: State, r: EntityRef) => Object.values(state.world.factions).find(f => f.ref === r);

/**
 * Предложение сделать организацию или державу справочника фракцией кампании: известность 0, ссылка на запись.
 * Держава (TASKS К) — тем же путём, что организация (E10): дальше её ведут процессы мира (война держав, С4).
 */
export function referenceFactionDelta(state: State, kind: 'organization' | 'kingdom', item: { id: string; name: string }): WorldDelta {
  const r = ref(kind, item.id);
  const plan = planReferenceActivation(state, { kind: 'faction', reference: r, name: item.name });
  if (plan.kind !== 'faction' || !plan.patch) throw new Error(`${item.name} уже активна как фракция кампании.`);
  return {
    id: freeId(state, `d-faction-${item.id}`), scale: 'continent', subject: `Новая фракция · ${item.name}`,
    was: 'нет в кампании', now: 'фракция, известность партии 0', cause: `мастер добавил из справочника ${kind === 'kingdom' ? 'держав' : 'организаций'}`,
    causeId: r, status: 'pending',
    patch: plan.patch,
  };
}
