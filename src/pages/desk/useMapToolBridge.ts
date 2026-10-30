// Мост к MapTool (Q17) на странице стола: раз в секунду берёт у ретранслятора (src/vtt/relay.ts) токены MapTool и
// пишет их ходы событием TOKEN_MOVED; на каждую перемену стола кладёт ретранслятору, что нарисовать на токенах.
// Ретранслятор есть только у сервера разработки: на статике опрос получает 404, в тестах (jsdom) его нет вовсе —
// и в обоих случаях стол о мосте молчит.
// store null — стол только для просмотра (прошлый день, Д5): мост выключен, ходы туда не пишутся.
import { useEffect, useRef, useState } from 'react';
import type { EngineStoreApi, State } from '../../engine';
import type { GridCell } from '../../engine/events';
import { MANAGED_STATES, actorForToken, movesFromSnapshot, vttView, type VttToken } from '../../vtt/bridge';
import { MAPTOOL_STALE_MS, type DeskPoll } from '../../vtt/relay';

const POLL_MS = 1000;
const LIVE = typeof navigator !== 'undefined' && !/jsdom/i.test(navigator.userAgent);

export interface MapToolLink {
  /** live — аддон шлёт снимки; lost — слал, но замолчал. Аддон не появлялся с запуска сервера — моста нет (null). */
  status: 'live' | 'lost';
  map: string | null;
  tokens: number;
  /** Токены, которым не нашлось актёра: их ходы стол не пишет. */
  unmatched: readonly string[];
}

export function useMapToolBridge(store: EngineStoreApi | null, state: State, seeded: Readonly<Record<string, GridCell>>): MapToolLink | null {
  const [poll, setPoll] = useState<DeskPoll | null>(null);
  const prev = useRef<{ store: EngineStoreApi; seq: number; tokens: readonly VttToken[] } | null>(null);
  const sentView = useRef('');

  const on = LIVE && store !== null;
  useEffect(() => {
    if (!on) return;
    let live = true;
    const tick = async () => {
      try {
        const res = await fetch('/vtt/desk/poll', { cache: 'no-store' });
        if (live && res.ok) setPoll((await res.json()) as DeskPoll);
      } catch {
        // Сервер стола перезапускается — следующий опрос.
      }
    };
    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => { live = false; clearInterval(id); };
  }, [on]);

  // Ходы: новый снимок MapTool против прошлого. Другая сессия стола — заново, первый снимок выравнивает клетки.
  useEffect(() => {
    if (!store || !poll?.tokens) return;
    const was = prev.current?.store === store ? prev.current : null;
    if (was && was.seq === poll.seq) return;
    const now = store.getState();
    for (const m of movesFromSnapshot(now.state, was?.tokens, poll.tokens, seeded)) {
      try {
        now.moveToken(m.actorId, m.to, 'maptool', m.from);
      } catch {
        // Стол отказал (актёр выбыл между опросами) — ход пропущен, следующий снимок даст новый.
      }
    }
    prev.current = { store, seq: poll.seq, tokens: poll.tokens };
  }, [poll, store, seeded]);

  // Вид для MapTool — по каждой перемене стола и снимка; одинаковый не шлётся.
  const tokens = poll?.tokens;
  useEffect(() => {
    if (!on || !tokens) return;
    const body = JSON.stringify({ tokens: vttView(state, tokens), managed: MANAGED_STATES });
    if (body === sentView.current) return;
    sentView.current = body;
    void fetch('/vtt/desk/view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => { sentView.current = ''; });
  }, [on, state, tokens]);

  if (!on || !poll || poll.seenMsAgo === null) return null;
  const list = poll.tokens ?? [];
  return {
    status: poll.seenMsAgo > MAPTOOL_STALE_MS ? 'lost' : 'live',
    map: poll.map,
    tokens: list.length,
    unmatched: list.filter(t => !actorForToken(state.actors, t.name)).map(t => t.name),
  };
}
