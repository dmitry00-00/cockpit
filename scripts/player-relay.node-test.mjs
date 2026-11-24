import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { PlayerRelay, playerMiddleware } from './lib/player-relay.mjs';
const key = 'test-host-key-'.repeat(4);

test('one-time identity binding, isolated snapshots, revisions, expiry and revocation', () => {
  let now = 100;
  const r = new PlayerRelay({ hostKey: key, now: () => now, inviteLifetime: 10, sessionLifetime: 100 });
  const publish = () => r.publish(key, [{ actorId: 'bo', snapshot: { hero: 'Bo', hp: now } }, { actorId: 'lyra', snapshot: { hero: 'Lyra', secretFromBo: true } }]);
  assert.throws(() => r.publish('bad', []), /Нет доступа/);
  publish();
  const invite = r.invite(key, 'bo');
  const session = r.join(invite.code);
  assert.equal(session.snapshot.hero, 'Bo');
  assert.equal(JSON.stringify(session).includes('Lyra'), false);
  assert.throws(() => r.join(invite.code), /Приглашение/);
  now++;
  publish();
  assert.equal(r.poll(session.token).snapshot.hp, now);
  assert.equal(r.poll(session.token).revision, 2);
  const copy = r.poll(session.token); copy.snapshot.hp = -999;
  assert.equal(r.poll(session.token).snapshot.hp, now);
  const expired = r.invite(key, 'lyra'); now += 11;
  assert.throws(() => r.join(expired.code), /Приглашение/);
  r.revoke(key, 'bo');
  assert.throws(() => r.poll(session.token), /отозвано/);
  const next = r.join(r.invite(key, 'lyra').code); now += 101;
  assert.throws(() => r.poll(next.token), /истекло/);
});

test('HTTP adapter denies unauthorized/cross-origin calls, sends no-store, joins and polls', async () => {
  const relay = new PlayerRelay({ hostKey: key });
  relay.publish(key, [{ actorId: 'bo', snapshot: { hero: 'Bo' } }]);
  const middleware = playerMiddleware(relay);
  const server = createServer((req, res) => void middleware(req, res, () => { res.statusCode = 404; res.end(); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (path, body, token, origin) => fetch(base + '/api/player/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
    assert.equal((await post('host/invite', { actorId: 'bo' })).status, 401);
    assert.equal((await post('host/invite', { actorId: 'bo' }, key, 'https://evil.example')).status, 403);
    const invite = await (await post('host/invite', { actorId: 'bo' }, key)).json();
    const joined = await post('join', { code: invite.code });
    assert.equal(joined.headers.get('cache-control'), 'no-store');
    const { token } = await joined.json();
    const poll = await fetch(base + '/api/player/snapshot', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal((await poll.json()).snapshot.hero, 'Bo');
    await post('host/revoke', { actorId: 'bo' }, key);
    assert.equal((await fetch(base + '/api/player/snapshot', { headers: { Authorization: `Bearer ${token}` } })).status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('reachable relay does not claim a disconnected GM is live, removed actors cannot regain old sessions', () => {
  let now = 0;
  const relay = new PlayerRelay({ hostKey: key, now: () => now });
  const publish = () => relay.publish(key, [{ actorId: 'bo', snapshot: { hero: 'Bo' } }]);
  publish();
  const { token } = relay.join(relay.invite(key, 'bo').code);
  assert.equal(relay.poll(token).hostOnline, true);
  now = 30_001;
  assert.equal(relay.poll(token).hostOnline, false);
  publish();
  assert.equal(relay.poll(token).hostOnline, true);
  relay.publish(key, []);
  publish();
  assert.throws(() => relay.poll(token), /отозвано/);
});
