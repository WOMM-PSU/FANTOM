# Track status

Updated: 2026-10-24 (after the first Dev A session)

One section per developer. Keep it current at the end of every session:
**Done · In progress · Blocked on · Contract change requests · Known issues**.

## Dev A — Server & rules

### Done

- **M0 (A column):** pnpm workspace, `tsconfig.base.json`, root scripts (`build`, `dev`,
  `typecheck`, `test`, `sim`), `.env.example`, `apps/server` skeleton.
- `packages/shared` contract v0.1 committed from PLAN Appendices 1–2; it compiles against zod
  4.6 and is exported from one entry point (`@fantom/shared`). `CHANGELOG.md` started.
- **M1 (A column):**
  - In-memory `MatchRegistry`, 5-character join codes from the unambiguous alphabet,
    case-insensitive lookup, per-match unique marker codes 0–255.
  - HTTP: `GET /health`, `POST /api/matches`, `GET /api/matches/:code`,
    `POST /api/matches/:code/join`; `joinUrl` built from `WEB_BASE_URL`; CORS allowlist;
    body size cap; zod validation; display-name sanitizing.
  - WebSocket `/ws`: 8 KB payload cap, 5 s `HELLO` deadline, origin allowlist, per-connection
    sequence numbers and `serverTime`, `HELLO`/`WELCOME`, `PING`/`PONG`, `MATCH_STATE`.
  - Per-recipient snapshots: only the viewer's own `markerCode`; no session tokens, permissions
    or other players' marker codes; all positions `null` until M2 visibility rules.
  - Lobby actions: `PLAYER_READY`, host-only `UPDATE_CONFIG` with range validation and
    mode-based clamping, `LEAVE_MATCH` with host transfer, duplicate request-id suppression.
  - Reconnect: re-`HELLO` rebinds the player, closes the replaced socket with 4001, cancels the
    removal timer. Lobby disconnect is surfaced immediately and drops the seat after 30 s.
  - `tools/sim-client` (library + CLI) used by the integration tests and for manual verification.
- Verified locally: `pnpm typecheck` green, `pnpm test` green (26 tests, 4 files), real server
  process + `pnpm sim --bots 2` end-to-end, `curl` health/create/join.

### In progress

- Next up: **M2** phase machine, `REQUEST_MATCH_START`, timer/result, `UPDATE_LOCATION`,
  polygon containment with hysteresis, out-of-zone drain, visibility filtering.

### Blocked on

- **Dev C:** `geo.ts`/`angles.ts` from `packages/aiming` (needed for M2 boundary work), plus the
  M0 exit items C owns: CI workflow, `fixtures/**`, `contract.test.ts`.
- **Dev B:** web skeleton and real-phone lobby check; M0 exit ("fresh clone → CI green") and M1
  exit ("two phones join by QR") cannot be confirmed from this track alone.
- **M0/M1 exit not claimed:** the repo has no `apps/web` yet, so the cross-track exit conditions
  are still open.

### Contract change requests

- None. The contract is unmodified from Appendix 1.
- Note for M2 (no schema change needed): a player's own position will be carried in their own
  `PlayerPublic.position` entry; `SelfView` intentionally has no position field.

### Known issues / limitations

- Matches are in memory only; a restart loses them (documented, PLAN P2.6).
- No HTTP rate limiting yet (`POST /api/matches` and joins are open); WebSocket limits per
  P4.3 are enforced. Needs hardening before any public deployment.
- `REQUEST_MATCH_START`, `UPDATE_LOCATION`, `REQUEST_SHOT`, `REQUEST_HEAL`, `REQUEST_PICKUP`
  return `ERROR INTERNAL "<type> is not implemented yet"` — deliberate, not silent.
- `devMode` can only be turned on when the server runs with `ALLOW_DEV_MODE=true`.
- Session tokens are stored in plaintext in process memory; acceptable for the hackathon,
  should be hashed/expired if the server is ever exposed for long periods.
- Display names are unique per player but not deduplicated across players.
- `active`-phase reconnect/leave policies are stubbed (lobby only) until M2.

## Dev B — Client app & UX

### Done

- **M0 (B column):**
  - `apps/web` Next.js 15 App Router skeleton (`@fantom/web`), strict TypeScript config, `.env.example` pointing to `:8080`, and mobile-first dark theme (`app/globals.css`).
  - `tools/mock-server` (`@fantom/mock-server`) implementing the contract's HTTP endpoints (`GET /health`, `POST /api/matches`, `GET /api/matches/:code`, `POST /api/matches/:code/join`) and WebSocket `/ws` (`HELLO`/`WELCOME`, `PING`/`PONG`, `PLAYER_READY`, `UPDATE_CONFIG`, `REQUEST_MATCH_START`, `UPDATE_LOCATION`, `REQUEST_SHOT`, `LEAVE_MATCH`) with a seeded mock bot for standalone UI verification.
- **M1 (B column):**
  - Home route (`/`): Create Match and Join by 5-character code forms, plus active session resume prompt (`sessionStorage`).
  - Join route (`/join/[code]`): `GET /api/matches/:code` lookup preview, error/retry handling (`MATCH_NOT_FOUND`, `LOBBY_FULL`, `WRONG_PHASE`), and display-name join submission.
  - Match route (`/match/[id]`) & `features/lobby/LobbyView.tsx`: scannable dependency-free SVG QR code of `joinUrl` (never encodes `sessionToken`), live player list with host/self/offline/ready badges (text + icon, never color alone), ready toggle (`PLAYER_READY`), host mode/duration/minimap/pickup controls (`UPDATE_CONFIG`), and always-visible **Leave Match** button (`LEAVE_MATCH`).
  - Networking & timing hooks: `useGameSocket` (runtime `ServerMessage` zod validation, `HELLO` handshake, auto-reconnect discarding stale state, error banner with retry) and `useServerClock` (`PING`/`PONG` smoothed clock offset).
  - Unit tests in `apps/web/test/clock-and-session.test.ts` (6 tests covering clock offset math, countdown clamping, join-code validation, 24-gon arena builder, and QR matrix generation).
- **Early M2/M3 UI scaffolding:**
  - `useGeolocation` hook (`watchPosition`, 1–2 Hz throttling, active during `countdown`/`active` phases), 24-sided circular arena builder (`lib/arena.ts`), local-meters SVG minimap (`features/minimap/MinimapSvg.tsx`), countdown safety screen, active HUD shell (`features/hud/ActiveMatchHud.tsx` with `DEV_ONLY`-gated target picker), and results view (`features/results/ResultsView.tsx`).
- Verified locally: `pnpm typecheck` green across all workspace packages, `pnpm test` green (32 tests across server + web), and `pnpm --filter @fantom/web build:web` production Next.js build green.

### In progress

- End-to-end two-phone lobby verification over HTTPS tunnel once Dev C's `pnpm dev:tunnel` lands.
- Wiring M2 lifecycle & positioning against `apps/server` once Dev A's M2 handlers (`REQUEST_MATCH_START`, `UPDATE_LOCATION`) land.

### Blocked on

- **Dev C:** `pnpm dev:tunnel` (M0) for two-phone HTTPS QR join verification, and `apps/web/features/aiming` (`AimView`, `PlayerMarker`, `useAiming`, `makeDevEvidence`) for M3/M4 camera aiming integration.
- **Dev A:** M2 server handlers (`REQUEST_MATCH_START`, `UPDATE_LOCATION`) to test countdown, arena boundary, and active match transitions against the real server (currently tested against `tools/mock-server`).

### Contract change requests

- **Optional for M2+ (Safety Abort):** `PLAN.md` S10.6 / S15.5 require an immediate way to stop a match and `MatchResult.endedReason` includes `"host_ended"`, but `ClientMessage` has no explicit `END_MATCH`/`ABORT_MATCH` message (unless host `LEAVE_MATCH` during an active match ends it with `"host_ended"`).

### Known issues / limitations

- Verified via automated unit tests, `tsc`, and `next build` on desktop; real two-phone QR join verification over HTTPS is pending `pnpm dev:tunnel`.
- In `ActiveMatchHud.tsx`, the camera aiming viewport currently renders a placeholder slot and a `[DEV_ONLY]` simulated target picker (only shown when `config.devMode === true`) until Dev C delivers `apps/web/features/aiming`.

## Dev C — Aiming, sensors & platform

Not started in this workspace (no `packages/aiming`, no CI, no fixtures). No status reported yet.
