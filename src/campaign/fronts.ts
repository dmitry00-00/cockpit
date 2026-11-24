import type { ProgressValue } from '../engine/progress';
import type { DungeonWorldFront, FrontDanger, State, WorldDelta } from '../engine/state';

/** Project manually fulfilled portents into the same count shape used by process and thread clocks. */
export function frontDangerProgress(danger: FrontDanger): ProgressValue | undefined {
  const segments = danger.portents.length;
  if (segments < 1) return undefined;
  return {
    segments,
    filled: danger.portents.filter(portent => portent.fulfilled).length,
  };
}

/** Create or replace a GM-authored Dungeon World front through the normal proposal inbox. */
export function frontDelta(state: State, threadId: string, front: DungeonWorldFront | null, id: string): WorldDelta {
  const thread = state.world.threads[threadId];
  if (!thread) throw new Error(`нет нити ${threadId}`);
  return {
    id, scale: 'region', subject: `Фронт · ${thread.name}`,
    was: thread.front ? `Фронт настроен · ${thread.front.dangers.length} опасности` : 'фронт не настроен',
    now: front ? `Фронт ${front.type === 'adventure' ? 'приключения' : 'кампании'} · ${front.dangers.length} опасности` : 'фронт снят',
    cause: 'Мастер подготовил или изменил фронт; мрачные знаки и последствия отмечаются вручную',
    causeId: threadId, status: 'pending', threadIds: [threadId],
    patch: { kind: 'threadFront', id: threadId, front },
  };
}

/** A portent becomes fulfilled only after the GM explicitly records the in-play event or hard move. */
export function fulfillPortentDelta(state: State, threadId: string, dangerId: string, portentId: string, id: string): WorldDelta {
  const thread = state.world.threads[threadId];
  const front = thread?.front;
  const danger = front?.dangers.find(item => item.id === dangerId);
  const portent = danger?.portents.find(item => item.id === portentId);
  if (!thread || !front || !danger || !portent) throw new Error('мрачный знак фронта не найден');
  if (portent.fulfilled) throw new Error('мрачный знак уже отмечен');
  const next: DungeonWorldFront = {
    ...front,
    dangers: front.dangers.map(item => item.id !== dangerId ? item : {
      ...item, portents: item.portents.map(sign => sign.id === portentId ? { ...sign, fulfilled: true } : sign),
    }),
  };
  return {
    id, scale: 'region', subject: `Знак фронта · ${thread.name}`,
    was: portent.text, now: `Наступил: ${portent.text}`,
    cause: 'Мастер подтвердил знак по событию игры или жёсткому ходу; автоматические последствия не применяются',
    causeId: threadId, status: 'pending', threadIds: [threadId],
    patch: { kind: 'threadFront', id: threadId, front: next },
  };
}

/** Record the GM-authored result of an impending doom after every portent for that danger has passed. */
export function resolveDangerDelta(state: State, threadId: string, dangerId: string, consequence: string, id: string): WorldDelta {
  const thread = state.world.threads[threadId];
  const front = thread?.front;
  const danger = front?.dangers.find(item => item.id === dangerId);
  const record = consequence.trim();
  if (!thread || !front || !danger) throw new Error('опасность фронта не найдена');
  if (danger.resolution) throw new Error('неотвратимая беда уже записана');
  if (!danger.portents.length || danger.portents.some(portent => !portent.fulfilled)) throw new Error('сперва мастер должен подтвердить все мрачные знаки');
  if (!record) throw new Error('запишите, что изменилось в мире');
  const next: DungeonWorldFront = {
    ...front,
    dangers: front.dangers.map(item => item.id !== dangerId ? item : { ...item, resolution: { text: record, atSec: state.time.sec } }),
  };
  return {
    id, scale: 'region', subject: `Беда фронта · ${thread.name}`,
    was: danger.impendingDoom, now: `${danger.impendingDoom}: ${record}`,
    cause: 'Мастер записал исход после всех мрачных знаков; реальные изменения мира требуют отдельных принятых событий',
    causeId: threadId, status: 'pending', threadIds: [threadId],
    patch: { kind: 'threadFront', id: threadId, front: next },
  };
}
