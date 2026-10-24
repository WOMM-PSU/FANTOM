# Architecture

PLAN P3 splits this file by track. This section covers the **server (Dev A)**; the client section
belongs to Dev B.

## Server process model

- One Node.js process (`apps/server`) serves the HTTP API and the `/ws` WebSocket endpoint.
- Active matches, players and session tokens live in **process memory** (`MatchRegistry`). There
  is no database in M0–M6. A restart loses every match; clients receive `SESSION_EXPIRED` (or a
  failed `HELLO`) and must create/join a new match. This is deliberate for the hackathon and must
  be stated in the demo notes.
- Matches are independent: the server does not shard, and there is no cross-process coordination.
  Run one process per match set.
- `MatchRegistry` drops a match as soon as its last player leaves or times out.
- Shutdown (`SIGINT`/`SIGTERM`) terminates sockets, closes the HTTP server, and clears timers.

## HTTP boundary

Implemented endpoints (contract: PLAN P4.2, code: `src/http/server.ts`):

| Method & path | Behaviour |
|---|---|
| `GET /health` | `{ ok: true, protocolVersion }` |
| `POST /api/matches` | Validates the body, applies `MatchConfigPatch` over defaults, creates match + host, returns 201 `JoinResponse` |
| `GET /api/matches/:code` | Public summary; 404 `MATCH_NOT_FOUND` |
| `POST /api/matches/:code/join` | 404 `MATCH_NOT_FOUND`, 409 `WRONG_PHASE` outside lobby, 409 `LOBBY_FULL` |

- Bodies are capped at 16 KB; JSON failures and schema failures return
  `{ error: { code, message } }`.
- Display names are sanitized before schema validation: NFKC, control/bidi/zero-width removed,
  angle brackets removed, whitespace collapsed, 20 code units max.
- CORS: `Access-Control-Allow-Origin` is only echoed for origins in `ALLOWED_ORIGINS`
  (default `http://localhost:3000`). The same list gates WebSocket upgrades (`401` otherwise).
- Join codes are discovery only. Authorization uses the returned `sessionToken`.

## WebSocket boundary

Code: `src/networking/ws.ts`, `connection.ts`, `hub.ts`, handlers in `src/game/service.ts`.

1. Socket connects; a 5 s `HELLO` deadline starts.
2. `HELLO { sessionToken }` → `WELCOME { playerId, protocolVersion, state }`, or
   `ERROR UNAUTHENTICATED` + close 4002.
3. Any other first message, malformed envelope, or wrong `v` closes/fails with `ERROR`.
4. Envelopes are validated with the shared zod schemas; server messages carry an increasing
   per-connection `seq` and `serverTime`.
5. Limits: 8 KB max payload (`ws` closes with 1009), 30 messages/s per connection (fixed 1 s
   window), and the last 256 client request ids are ignored on replay.
6. `PING` returns `PONG` with the client timestamp echoed in the payload; the envelope's
   `serverTime` is what clients use for clock offset.
7. `MATCH_STATE` is broadcast per recipient after meaningful changes, coalesced to at most one
   snapshot per 100 ms (default; configurable for tests).

### Reconnect and disconnect

- A new `HELLO` with the same token binds the player to the new socket and closes the old socket
  with **4001**. The old socket's close handler does not mark the player offline because the seat
  is already owned by the new connection.
- A disconnect marks `connected: false` immediately and starts a 30 s timer. In the lobby the
  player is removed at expiry (host transfers to the next join order, or the match is dropped).
  During an active match the seat is kept for the rest of the match (M2+ policy, per P4.3).
- Clients keep `{ sessionToken, joinCode }` in `sessionStorage` and re-`HELLO`; they never reuse a
  stale snapshot after reconnecting — `WELCOME` carries a fresh state.
- A player whose match has disappeared gets `ERROR SESSION_EXPIRED` and is closed with 4002.

## Per-recipient views

`Match.stateFor(playerId)` is the only way state leaves the server. It currently sends:

- every player's public identity, ready/connected flags, status and score;
- `position: null` for everyone (M2 adds the viewer's own position and mode-permitted ones);
- only the viewer's own `markerCode`;
- no session tokens and no permission details.

`self` carries health/shield/ammo/timers placeholders until M3. The builder is the place to add
mode visibility rules — not the client.

## Implemented message handling

| Message | Current behaviour |
|---|---|
| `HELLO`, `PING`, `LEAVE_MATCH`, `PLAYER_READY`, `UPDATE_CONFIG` | handled (lobby scope) |
| `REQUEST_MATCH_START` | explicit `ERROR INTERNAL` — M2 |
| `UPDATE_LOCATION` | explicit `ERROR INTERNAL` — M2 |
| `REQUEST_SHOT` | explicit `ERROR INTERNAL` — M3 |
| `REQUEST_HEAL` | explicit `ERROR INTERNAL` — M5 |
| `REQUEST_PICKUP` | explicit `ERROR INTERNAL` — M6 |

Unimplemented actions are refused rather than half-applied; see `docs/STATUS.md`.

## Configuration and dev-only paths

- `PORT`, `WEB_BASE_URL`, `ALLOWED_ORIGINS`, `ALLOW_DEV_MODE` (loaded from the repo-root `.env`
  if present, plus the real environment).
- `ALLOW_DEV_MODE=true` is required before a host can set `config.devMode = true`; the patch is
  rejected otherwise. `DEV_ONLY` paths (simulated aim/location) do not exist yet.
- Config patches are deep-copied, validated with `MatchConfig`, and clamped:
  enemy positions off outside FFA, minimap layers off when the minimap is off, mode change
  applies that mode's default spawn lockout.

## Verification

- `pnpm typecheck`, `pnpm test` (unit + two-client HTTP/WS integration).
- `pnpm sim --server http://localhost:8080 --bots 2` drives a real lobby and prints snapshots.
- Tests parse every received server message with `ServerMessage` and assert hidden fields are
  absent from payloads.
