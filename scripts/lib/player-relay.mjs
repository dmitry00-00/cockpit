import { randomBytes, timingSafeEqual } from 'node:crypto';

const secret = () => randomBytes(32).toString('base64url');
const equal = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** In-memory transport. Receives only preprojected player DTOs from the trusted GM.
 * No campaign log, master state, or arbitrary actor selection is exposed to players. */
export class PlayerRelay {
  #hostKey;
  #snapshots = new Map();
  #invites = new Map();
  #sessions = new Map();
  #revision = 0;
  #publishedAt = null;
  constructor({ hostKey = secret(), now = Date.now, inviteLifetime = 300_000, sessionLifetime = 86_400_000 } = {}) {
    if (hostKey.length < 32) throw new Error('Host key must contain at least 32 characters');
    this.#hostKey = hostKey;
    this.now = now;
    this.inviteLifetime = inviteLifetime;
    this.sessionLifetime = sessionLifetime;
  }
  get hostKey() { return this.#hostKey; }
  #authorize(key) { if (!equal(key, this.#hostKey)) throw Object.assign(new Error('Нет доступа мастера'), { status: 401 }); }
  publish(key, projections) {
    this.#authorize(key);
    if (!Array.isArray(projections) || projections.length > 100) throw Object.assign(new Error('Некорректная публикация'), { status: 400 });
    const next = new Map();
    for (const p of projections) {
      if (!p || typeof p.actorId !== 'string' || !p.actorId || !p.snapshot || typeof p.snapshot !== 'object' || next.has(p.actorId)) {
        throw Object.assign(new Error('Некорректная проекция'), { status: 400 });
      }
      next.set(p.actorId, structuredClone(p.snapshot));
    }
    for (const [token, session] of this.#sessions) if (!next.has(session.actorId)) this.#sessions.delete(token);
    for (const [code, invite] of this.#invites) if (!next.has(invite.actorId)) this.#invites.delete(code);
    this.#snapshots = next;
    this.#revision++;
    this.#publishedAt = this.now();
    return { revision: this.#revision };
  }
  invite(key, actorId) {
    this.#authorize(key);
    if (!this.#snapshots.has(actorId)) throw Object.assign(new Error('Персонаж не опубликован'), { status: 404 });
    const code = secret();
    const expiresAt = this.now() + this.inviteLifetime;
    this.#prune();
    this.#invites.set(code, { actorId, expiresAt });
    return { code, expiresAt };
  }
  join(code) {
    this.#prune();
    const invite = this.#invites.get(code);
    // Consumed before returning a credential: replay can never bind a second device.
    if (!invite || !this.#snapshots.has(invite.actorId)) throw Object.assign(new Error('Приглашение недействительно или истекло'), { status: 401 });
    this.#invites.delete(code);
    const token = secret();
    this.#sessions.set(token, { actorId: invite.actorId, expiresAt: this.now() + this.sessionLifetime });
    return { token, ...this.poll(token) };
  }
  poll(token) {
    this.#prune();
    const session = this.#sessions.get(token);
    if (!session) throw Object.assign(new Error('Подключение отозвано или истекло'), { status: 401 });
    const snapshot = this.#snapshots.get(session.actorId);
    if (!snapshot) throw Object.assign(new Error('Персонаж больше не доступен'), { status: 401 });
    return { revision: this.#revision, serverTime: this.now(), hostOnline: this.#publishedAt !== null && this.now() - this.#publishedAt < 30_000, snapshot: structuredClone(snapshot) };
  }
  disconnect(token) { this.#sessions.delete(token); }
  revoke(key, actorId) {
    this.#authorize(key);
    for (const [id, s] of this.#sessions) if (s.actorId === actorId) this.#sessions.delete(id);
    for (const [id, s] of this.#invites) if (s.actorId === actorId) this.#invites.delete(id);
    return { revoked: true };
  }
  #prune() {
    for (const map of [this.#sessions, this.#invites]) {
      for (const [id, entry] of map) if (entry.expiresAt <= this.now()) map.delete(id);
    }
  }
}

/** Same-origin HTTP adapter, usable by Vite and a production HTTPS reverse proxy.
 * Credentials are headers/request bodies, never URLs. No permissive CORS. */
export function playerMiddleware(relay, { allowHost = true } = {}) {
  return async (req, res, next) => {
    const path = (req.url ?? '').split('?')[0];
    if (!path.startsWith('/api/player/')) return next();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    try {
      // Reject cross-origin requests including browser form attacks; do not trust forwarded headers.
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return reply(403, { error: 'Другой источник запроса' });
      const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
      if (req.method === 'GET' && path === '/api/player/snapshot') return reply(200, relay.poll(token));
      if (req.method !== 'POST') return reply(405, { error: 'Метод не поддерживается' });
      if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return reply(415, { error: 'Требуется JSON' });
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 2_000_000) return reply(413, { error: 'Слишком большой запрос' });
      }
      let body;
      try { body = JSON.parse(raw); } catch { return reply(400, { error: 'Некорректный JSON' }); }
      if (!body || typeof body !== 'object') return reply(400, { error: 'Некорректный запрос' });
      if (path === '/api/player/join') return reply(200, relay.join(body.code));
      if (path === '/api/player/disconnect') { relay.disconnect(token); return reply(200, { disconnected: true }); }
      if (allowHost && path === '/api/player/host/publish') return reply(200, relay.publish(token, body.projections));
      if (allowHost && path === '/api/player/host/invite') return reply(200, relay.invite(token, body.actorId));
      if (allowHost && path === '/api/player/host/revoke') return reply(200, relay.revoke(token, body.actorId));
      reply(404, { error: 'Адрес не найден' });
    } catch (error) { reply(error.status ?? 500, { error: error.status ? error.message : 'Ошибка сервера' }); }
  };
}
