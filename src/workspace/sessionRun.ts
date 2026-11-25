import type { AdventureSession } from '../engine/state';
import type { SessionScoreDraft } from './sessionScore';

export const SESSION_RUN_FORMAT = 'dm-cockpit.session-run/1' as const;

export interface SessionRunProgress {
  format: typeof SESSION_RUN_FORMAT;
  sessionId: string;
  adventureVersion: string;
  scoreId: string;
  currentBeatId: string;
  viewedBeatIds: readonly string[];
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const nonEmpty = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

export function sessionRunStorageKey(scope: string, sessionId: string): string {
  return 'dm-cockpit:session-run:' + encodeURIComponent(scope) + ':' + encodeURIComponent(sessionId);
}

export function newSessionRunProgress(score: SessionScoreDraft, session: AdventureSession): SessionRunProgress {
  const firstBeat = score.beats[0];
  if (!firstBeat) throw new Error('В партитуре нет сцен для ведения.');
  return {
    format: SESSION_RUN_FORMAT,
    sessionId: session.id,
    adventureVersion: session.graph.version,
    scoreId: score.id,
    currentBeatId: firstBeat.id,
    viewedBeatIds: [],
  };
}

export function validateSessionRunProgress(value: unknown, score: SessionScoreDraft, session: AdventureSession): SessionRunProgress {
  if (!record(value) || value.format !== SESSION_RUN_FORMAT || value.sessionId !== session.id ||
      value.adventureVersion !== session.graph.version || value.scoreId !== score.id || !nonEmpty(value.currentBeatId) ||
      !Array.isArray(value.viewedBeatIds) || !value.viewedBeatIds.every(nonEmpty)) {
    throw new Error('Локальный указатель относится к другой версии сессии или партитуры.');
  }
  const currentBeatId = String(value.currentBeatId);
  const viewedBeatIds = value.viewedBeatIds as string[];
  const beatIds = new Set(score.beats.map(beat => beat.id));
  if (!beatIds.has(currentBeatId) || viewedBeatIds.some(id => !beatIds.has(id))) {
    throw new Error('В партитуре изменились сцены; локальные отметки требуют сброса.');
  }
  return structuredClone(value) as unknown as SessionRunProgress;
}

export function setRunCurrentBeat(progress: SessionRunProgress, score: SessionScoreDraft, beatId: string): SessionRunProgress {
  if (!score.beats.some(beat => beat.id === beatId)) throw new Error('Сцена отсутствует в актуальной партитуре.');
  return { ...progress, currentBeatId: beatId };
}

export function toggleRunBeatViewed(progress: SessionRunProgress, score: SessionScoreDraft, beatId: string): SessionRunProgress {
  if (!score.beats.some(beat => beat.id === beatId)) throw new Error('Сцена отсутствует в актуальной партитуре.');
  const viewed = new Set(progress.viewedBeatIds);
  if (viewed.has(beatId)) viewed.delete(beatId);
  else viewed.add(beatId);
  return { ...progress, viewedBeatIds: [...viewed] };
}
