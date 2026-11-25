import { useEffect, useRef, useState } from 'react';
import { PlayerApp } from './PlayerApp';
import type { PlayerConnectionStatus, PlayerProjection } from './types';

const SESSION_KEY = 'dm-cockpit:player-session:v1';
interface Session { token: string; snapshot: PlayerProjection | null; receivedAt?: number }
function stored(): Session | null {
  try {
    const data = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null;
    return data && typeof data.token === 'string' && (!data.snapshot || data.snapshot.schemaVersion === 1) ? data : null;
  } catch { return null; }
}
function save(session: Session | null) {
  try { if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session)); else localStorage.removeItem(SESSION_KEY); } catch { /* Private/storage-limited browsing still works online. */ }
}
interface Reply { token?: string; snapshot: PlayerProjection; revision: number; hostOnline?: boolean }
async function request(path: string, token?: string, body?: object, signal?: AbortSignal): Promise<Reply> {
  const response = await fetch(`/api/player/${path}`, {
    method: body ? 'POST' : 'GET', cache: 'no-store', signal,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw Object.assign(new Error(response.status === 401 ? 'Доступ истёк или отозван. Попросите новое приглашение у мастера.' : 'Сервер подключения недоступен.'), { status: response.status });
  return response.json();
}
export function PlayerConnection() {
  const [session, setSession] = useState<Session | null>(stored);
  const [status, setStatus] = useState<PlayerConnectionStatus>('connecting');
  const [code, setCode] = useState(() => new URLSearchParams(location.hash.slice(1)).get('invite') ?? '');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    // Invitation fragment never reaches the HTTP server, referrers, or cached shell URL.
    if (location.hash) history.replaceState(null, '', location.pathname);
  }, []);
  useEffect(() => {
    if (!session?.token) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const token = session.token;
    async function poll() {
      try {
        const reply = await request('snapshot', token, undefined, controller.signal);
        if (stopped) return;
        if (reply.snapshot?.schemaVersion !== 1) throw new Error('Требуется обновление приложения.');
        const next: Session = { token, snapshot: { ...reply.snapshot, revision: reply.revision }, receivedAt: Date.now() };
        save(next); setSession(next); setStatus(reply.hostOnline === false ? 'offline' : 'online'); setError('');
      } catch (failure) {
        if (stopped) return;
        if ((failure as { status?: number }).status === 401) {
          save(null); setSession(null); setStatus('revoked'); setError((failure as Error).message); return;
        }
        setStatus('offline');
      }
      if (!stopped) timer = setTimeout(() => void poll(), 2000);
    }
    void poll();
    return () => { stopped = true; controller.abort(); clearTimeout(timer); };
  }, [session?.token]);
  async function join() {
    if (!code.trim() || joining) return;
    const current = ++generation.current;
    setJoining(true); setError('');
    try {
      const reply = await request('join', undefined, { code: code.trim() });
      if (current !== generation.current) return;
      if (!reply.token || reply.snapshot?.schemaVersion !== 1) throw new Error('Некорректный ответ сервера.');
      const next = { token: reply.token, snapshot: { ...reply.snapshot, revision: reply.revision }, receivedAt: Date.now() };
      save(next); setSession(next); setStatus('online'); setCode('');
    } catch (failure) { if (current === generation.current) setError((failure as Error).message); }
    finally { if (current === generation.current) setJoining(false); }
  }
  function disconnect() {
    generation.current++;
    if (session?.token) void request('disconnect', session.token, {}).catch(() => {});
    save(null); setSession(null); setStatus('connecting'); setCode('');
  }
  if (session) return <PlayerApp projection={session.snapshot} status={status} lastUpdatedAt={session.receivedAt} onDisconnect={disconnect} />;
  return <main className="player-app"><header className="player-header"><h1>DM Cockpit · игрок</h1></header><section className="player-section"><h2>Ваш персонаж — рядом</h2><p>Получите приглашение у мастера. Оно открывает только назначенного вам героя.</p><form className="player-join" onSubmit={event => { event.preventDefault(); void join(); }}><label htmlFor="player-invite">Код приглашения</label><input id="player-invite" value={code} onChange={event => setCode(event.target.value)} autoComplete="off" spellCheck={false} style={{ display: 'block', width: '100%', margin: '12px 0', padding: 12 }} /><button disabled={joining || !code.trim()}>{joining ? 'Подключение…' : 'Подключиться'}</button></form>{error && <p role="alert">{error}</p>}</section><p>На телефоне откройте меню браузера → «На экран Домой». Для установки нужен HTTPS. Последний полученный лист доступен без связи; состояние связи показано явно.</p></main>;
}
