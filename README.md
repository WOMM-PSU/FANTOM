# FANTOM

Phone-only multiplayer laser tag. Two people create/join a match, move around a real arena, and
shoot each other with camera-assisted aiming — all in a mobile web app.

Read [PLAN.md](PLAN.md) first: Part A is the product spec, Part B the team split and the API
contract. This repository currently contains the **authoritative game server** track (Dev A) and
the shared contract; the web app (Dev B) and aiming/sensors (Dev C) are separate tracks.

## Status

| Track | Owns | State |
|---|---|---|
| A — Server & rules | `apps/server`, `tools/sim-client` | M0 + lobby slice of M1 |
| B — Client app & UX | `apps/web`, `tools/mock-server` | not started |
| C — Aiming & platform | `packages/aiming`, `apps/web/features/aiming`, CI, fixtures | not started |

Implemented today: pnpm workspace, the zod contract (`@fantom/shared`), HTTP create/join/summary,
the WebSocket `HELLO`/`WELCOME`/`PING`/`PONG` handshake, per-recipient `MATCH_STATE` snapshots,
ready state, host settings with server-side clamping, leave, reconnect rebinding, and the headless
`sim-client`. Match start, location updates, shots, heals and pickups are **not implemented yet**;
the server refuses them explicitly instead of pretending they work. See
[docs/STATUS.md](docs/STATUS.md).

## Requirements

- Node.js ≥ 20.11 (verified on Node 24)
- pnpm 11

## Quickstart

```bash
pnpm install
pnpm typecheck        # builds shared packages, then typechecks every package
pnpm test             # 26 unit + two-client integration tests
cp .env.example .env  # optional; defaults work for localhost
pnpm dev              # shared types (watch) + server (watch) on :8080
```

`pnpm dev` currently starts the server only — the Next.js app arrives with Dev B. The default
`WEB_BASE_URL` is `http://localhost:3000`, so join URLs/QR codes point at the future web app.

### Drive the lobby without a UI

```bash
# with the server running
pnpm sim --server http://localhost:8080 --bots 2
```

`tools/sim-client` creates a match, joins bots over HTTP, connects them over WebSocket, marks
everyone ready, demonstrates host-only settings, then drops a bot to show the reconnect window.

### Server only

```bash
pnpm --filter @fantom/server start   # or: dev (watch)
curl http://localhost:8080/health
curl -X POST http://localhost:8080/api/matches \
  -H 'content-type: application/json' -d '{"displayName":"Ada"}'
```

## Layout

```text
apps/server/                 # Dev A: HTTP + WebSocket authoritative server
  src/lobby/                 # match registry, players, join codes, snapshots
  src/networking/            # sockets, handshake gateway, reconnect rebinding
  src/game/                  # service: HTTP actions, lobby message handlers, broadcasts
  src/validation/            # config clamping, display-name sanitizing, zod issue messages
  test/                      # unit + two-client integration tests
packages/shared/             # CONTRACT: zod schemas, types, constants (contract v0.1)
tools/sim-client/            # Dev A: headless bots and integration-test client
docs/prompts/                # the three per-developer agent prompts
docs/architecture.md         # server architecture and policies
docs/STATUS.md               # per-track progress, blockers, limitations
```

## Environment

See [.env.example](.env.example). Server variables: `PORT`, `WEB_BASE_URL`, `ALLOWED_ORIGINS`,
`ALLOW_DEV_MODE`. `ALLOW_DEV_MODE=true` is required for `config.devMode`; it is a documented
development-only path and must never be enabled for a real playtest.

## Known limitations (honest list)

- Active matches live in memory: restarting the server loses them. No database until M7.
- No HTTP rate limiting yet; the WebSocket limits from PLAN P4.3 are enforced.
- Join codes are unique per running process only; a restart can recycle them.
- Session tokens are held in memory on the server and in the client's `sessionStorage`.
- Camera aiming, GPS boundaries and combat are not implemented in this slice; see
  [docs/STATUS.md](docs/STATUS.md) for the milestone plan.
