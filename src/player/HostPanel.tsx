import { useEffect, useRef, useState } from 'react';
import type { State } from '../engine/state';
import type { DomainEvent } from '../engine/events';
import { playerCardProjectionOf, projectPlayer, publicPlayerUpdatesOf } from './projection';
import './player.css';

async function hostRequest(key: string, action: string, body: object) {
  const response = await fetch(`/api/player/host/${action}`, {
    method: 'POST', cache: 'no-store', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(response.status === 401 ? 'Неверный ключ ведущего.' : 'Сервер игроков не настроен или недоступен.');
  return response.json();
}
/** GM-only publication boundary. UI navigation and invitations are not campaign events. */
export function HostPanel({ state, revision, events = [] }: { state: State; revision: number; events?: readonly DomainEvent[] }) {
  const [key, setKey] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [actorId, setActorId] = useState('');
  const [link, setLink] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const current = useRef({ state, revision, events });
  current.current = { state, revision, events };
  const actors = state.party.flatMap(id => {
    const actor = state.actors[id]; return actor && !actor.removed && actor.sheet ? [actor] : [];
  });
  function publish() {
    const { state: snapshot, revision: rev, events: eventSnapshot } = current.current;
    const updates = publicPlayerUpdatesOf(snapshot, eventSnapshot);
    const projections = snapshot.party.flatMap(id => {
      const player = projectPlayer(snapshot, id, rev, Date.now(), eventSnapshot, updates);
      const card = player ? playerCardProjectionOf(snapshot, id) : null;
      return player ? [{ actorId: id, snapshot: { ...player, hero: { ...player.hero, ...(card ? { card } : {}) } } }] : [];
    });
    return hostRequest(key, 'publish', { projections });
  }
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    // Serialize publications: an older slow request cannot overwrite a newer snapshot.
    queue.current = queue.current.catch(() => {}).then(async () => {
      if (!live) return;
      try { await publish(); if (live) setMessage('Листы игроков синхронизированы.'); }
      catch (error) { if (live) setMessage((error as Error).message); }
    });
    return () => { live = false; };
    // publish reads latest state through a ref; key changes disable hosting in the input below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, state, revision, key]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const timer = setInterval(() => {
      queue.current = queue.current.catch(() => {}).then(async () => {
        if (!live) return;
        try { await publish(); } catch { if (live) setMessage('Нет связи с сервером игроков.'); }
      });
    }, 10_000);
    return () => { live = false; clearInterval(timer); };
  }, [enabled, key]);
  async function action(kind: 'invite' | 'revoke') {
    const selected = actorId || actors[0]?.id;
    if (!selected) return;
    setBusy(true); setLink('');
    try {
      await queue.current.catch(() => {});
      if (kind === 'invite') {
        await publish();
        const invite = await hostRequest(key, 'invite', { actorId: selected });
        setLink(`${location.origin}/player/#invite=${invite.code}`);
        setEnabled(true); setMessage('Одноразовое приглашение действует 5 минут.');
      } else {
        await hostRequest(key, 'revoke', { actorId: selected }); setMessage('Все приглашения и подключения этого героя отозваны.');
      }
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function stop() {
    setEnabled(false); setBusy(true); setLink('');
    try { await queue.current.catch(() => {}); await hostRequest(key, 'publish', { projections: [] }); setMessage('Доступ игроков отключён.'); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <details className="player-host player-host--desk type-body-sm text-t2"><summary aria-label={`Подключение игроков${enabled ? ', включено' : ''}`}>Подключение {enabled ? '· включено' : 'игроков'}</summary><div className="player-host-panel"><div className="flex flex-wrap gap-2 items-center py-2"><label>Ключ ведущего <input aria-label="Ключ ведущего" type="password" value={key} autoComplete="off" disabled={enabled || busy} onChange={event => setKey(event.target.value)} /></label><label>Персонаж <select aria-label="Персонаж для игрока" value={actorId || actors[0]?.id || ''} onChange={event => { setActorId(event.target.value); setLink(''); }}>{actors.map(actor => <option key={actor.id} value={actor.id}>{actor.name}</option>)}</select></label><button disabled={busy || key.length < 32 || !actors.length} onClick={() => void action('invite')}>Пригласить игрока</button><button disabled={busy || !key || !actors.length} onClick={() => void action('revoke')}>Отозвать доступ</button>{enabled && <button disabled={busy} onClick={() => void stop()}>Отключить игроков</button>}</div>{link && <label className="block">Ссылка для игрока <input aria-label="Ссылка для игрока" readOnly value={link} className="w-full" onFocus={event => event.target.select()} /></label>}<p aria-live="polite">{message}</p><small>Запустите сервер с DM_PLAYER_HOST_KEY. Ключ вводится только у мастера и не сохраняется. Игроку передайте только приглашение. Для телефона нужен адрес сервера, доступный с телефона, и HTTPS.</small></div></details>;
}
