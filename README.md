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
| B — Client app & UX | `apps/web`, `tools/mock-server` | M0–M6 client app, HUD, mock-server + `/dev/aim-lab` |
| C — Aiming & platform | `packages/aiming`, `apps/web/features/aiming`, CI, fixtures | M0 platform + aiming core; standalone lab (no real-device results) |

Implemented today: pnpm workspace, the zod contract (`@fantom/shared`), HTTP create/join/summary,
the WebSocket `HELLO`/`WELCOME`/`PING`/`PONG` handshake, per-recipient `MATCH_STATE` snapshots,
ready state, host settings with server-side clamping, leave, reconnect rebinding, and the headless
`sim-client`. The C track adds the pure geo/angle helpers, `evaluateAim`, every contract fixture
plus its test, a standalone camera/marker lab, and `pnpm dev:tunnel` for HTTPS/WSS phone testing.
Match start, location updates, shots, heals and pickups are **not implemented on the server yet**;
the server refuses them explicitly instead of pretending they work. See
[docs/STATUS.md](docs/STATUS.md).

## Requirements

- Node.js ≥ 20.11 (verified on Node 24)
- pnpm 12 (CI pins 12.15.0)
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
  for real-phone testing over HTTPS/WSS (not needed for localhost)


## Quickstart

```bash
pnpm install
pnpm typecheck        # builds shared packages, then typechecks every package
pnpm test             # 96 contract, aiming-core, server, and web unit/integration tests
cp .env.example .env  # optional; defaults work for localhost
pnpm dev              # shared types (watch) + server (:8080) + Next.js web app (:3000)
```

`pnpm dev` starts both the authoritative game server (`:8080`) and the Next.js web app (`:3000`). The default
`WEB_BASE_URL` is `http://localhost:3000`, so join URLs/QR codes point at the web app. To develop the web UI standalone against the full-lifecycle mock server (`M1–M6` + golden fixtures), run `pnpm --filter @fantom/mock-server dev:mock`.

### Test on real phones (HTTPS/WSS)

Camera, orientation and geolocation need a secure context. With `cloudflared` on `PATH` (or
`CLOUDFLARED_BIN=./.tools/cloudflared/cloudflared`):

```bash
pnpm dev:tunnel
```

It prints a **Web** URL, a scannable QR code, and the API/WS URLs used by the app. `WEB_PATH`
chooses the page the QR code opens (default `/`). The tunnels are public while the process runs and
are **not** a deployment. See [tools/dev-tunnel/README.md](tools/dev-tunnel/README.md).

Until the web app exists, expose the standalone aim lab instead:

```bash
WEB_PORT=4173 WEB_PATH=/aim-lab.html START_APP=false \
  CLOUDFLARED_BIN=./.tools/cloudflared/cloudflared pnpm dev:tunnel
```

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
apps/web/                    # Dev B: Next.js 15 App Router mobile web client
  app/                       # /, /join/[code], /match/[id], and unlinked /dev/aim-lab
  features/                  # lobby, minimap, combat HUD, results, and aiming seam bridge
  hooks/                     # useGameSocket, useServerClock, useGeolocation
  lib/                       # HTTP client, sessionStorage, QR SVG generator, arena builder
apps/web/features/aiming/dev/ # Dev C: standalone aim-lab spike (not shipped in navigation)
packages/aiming/             # Dev C: geo/angle helpers and evaluateAim
packages/shared/             # CONTRACT: zod schemas, types, constants (contract v0.1)
  fixtures/                  # Dev C: generated valid/invalid contract examples
tools/mock-server/           # Dev B: full-lifecycle contract mock server + fixture loader
tools/sim-client/            # Dev A: headless bots and integration-test client
tools/dev-tunnel/            # Dev C: HTTPS/WSS quick tunnels for phone testing
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
- Camera aiming, GPS boundaries and combat are not implemented in this slice; `evaluateAim` and
the standalone lab exist, but no real-device aiming result has been recorded. See
  [docs/STATUS.md](docs/STATUS.md) and [docs/testing.md](docs/testing.md) for the milestone plan
  and the honest device matrix.
- Quick tunnels are public while `pnpm dev:tunnel` runs, use random hostnames that change on every
  start, and stop working when the process exits. Do not treat them as a deployment.
