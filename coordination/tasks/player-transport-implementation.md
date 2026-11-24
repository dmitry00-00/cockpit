# Player transport — Codex, 2026-11-03

Scope: П10 player PWA and trusted GM publication. Work in progress, not acceptance.

Implemented `scripts/lib/player-relay.mjs`: cryptographically random one-time five-minute invites, actor-bound 24-hour sessions, authenticated GM publication/invite/revocation, monotonic revisions, fresh snapshots after reconnect, no-store same-origin JSON HTTP adapter, request size cap. Relay stores preprojected player DTOs only. Credentials do not appear in URLs/API query strings. Removing an actor invalidates its invites/sessions. Restart intentionally clears access grants; campaign log remains with GM.

Verification: `node --test scripts/player-relay.node-test.mjs` passed 2 tests, including a real ephemeral localhost HTTP server. Sandbox initially rejected listen with EPERM; approved local execution passed. Tests cover identity separation, one-time consumption, expiry/revocation, revision changes, immutable return snapshots, auth and Origin rejection, no-store headers.

Remaining: DTO projection and mobile UI from Luna, master publication controls, separate player entry and cache boundary, deployable host integration, mobile installation/offline/reconnect browser acceptance. No claims of complete PWA or Internet-ready hosting.

## Integrated checkpoint

Codex integrated Luna DTO/UI commit 1912a19 and lifecycle tests 00bd2d9; rejected removed/non-party actors in projector. Added GM HostPanel with serialized publication, opt-in Vite/preview middleware, separate `/player/` entry, install manifest/icons, scoped service worker and build-time player-only precache graph. Heartbeat avoids mistaking a reachable relay for a live GM. Docs: `docs/PLAYER_PWA.md`.

Checks after integration:
- Initial full Vitest: 1594 passed / 7 failed. Six failures were caused by an extra `status` landmark in the new HostPanel; one was the new input's nonzero border radius. Both corrected.
- Affected integration suites + player + level-up: 9 files, 93 passed. Radius invariant: 263 passed.
- Node transport + offline graph: 4 passed, including actual HTTP on loopback and stale host heartbeat.
- Source/app and node TypeScript checks passed; final `npm run build` exit 0 including package/art validation and generated player offline shell (24 files, revision 3e7e72fec3ae06ef). Not claiming a second full Vitest run.
- CUA viewed project site desktop and player join screen at 390×844; invisible input found and corrected/visually rechecked. Subsequent screenshot timed out and connector recovery timed out. The temporary viewport override may remain 390×844 and must be reset when the connector recovers. Full joined sheet/install/offline on real phone still unverified.

БА27 remains open for generic source schemas and final art/UI. П10 remains open for complete browser/device acceptance and HTTPS address. П13 remains open for final brand/materials/docs/release links and responsive acceptance. No publication, push or merge.
