# `pnpm dev:tunnel`

C-owned platform helper: exposes the local web app and game server through two **Cloudflare quick
tunnels** (HTTPS + WSS), then starts `pnpm dev` with the tunnel URLs in the environment.

**DEV ONLY.** Quick-tunnel URLs are public for the lifetime of the process. They have no access
control beyond the random hostname. Do not use this for production, real user data, or a session you
are not willing to expose. Set `ALLOW_DEV_MODE=false` unless you are deliberately testing a DEV_ONLY
shortcut.

## Requirements

- Node.js ≥ 20.11 (same as the repo).
- [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
  on `PATH`, or `CLOUDFLARED_BIN=/path/to/cloudflared`.

No Cloudflare account is required for a quick tunnel.

## Usage

```bash
pnpm dev:tunnel
```

The helper waits for both tunnel URLs, prints them with a scannable QR code, then runs `pnpm dev` with:

| Variable | Value |
|---|---|
| `WEB_BASE_URL` | web tunnel origin (join URLs / QR codes) |
| `ALLOWED_ORIGINS` | web tunnel origin plus `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL` | API tunnel origin |
| `NEXT_PUBLIC_WS_URL` | `wss://<api-tunnel-host>/ws` |

Open the printed **Web** URL (or scan the QR code) on each phone. Camera, orientation and geolocation
require that HTTPS origin (PLAN P6). The API/WS URL is used by the web app; do not use the server URL
as the page URL. `WEB_PATH` sets the page that the printed Web URL and QR code point at; it does not
change `WEB_BASE_URL`, which stays the tunnel origin.

`pnpm dev` currently starts only the game server because the web app (Dev B) does not exist yet.
To test the standalone aim lab on a phone meanwhile, run the lab server and tunnel its port:

```bash
node apps/web/features/aiming/dev/serve.mjs &
WEB_PORT=4173 WEB_PATH=/aim-lab.html START_APP=false \
  CLOUDFLARED_BIN=./.tools/cloudflared/cloudflared pnpm dev:tunnel
```

Then scan the printed QR code (or open the printed **Web** URL) on the phone. The unused API tunnel
is harmless.

### Options

| Variable | Default | Meaning |
|---|---:|---|
| `WEB_PORT` | `3000` | Local web dev port the web tunnel targets |
| `WEB_PATH` | `/` | Path appended to the Web URL and encoded in the QR code |
| `SERVER_PORT` | `8080` | Local server port the API tunnel targets |
| `START_APP` | `true` | `false` runs tunnels only (test/debug mode) |
| `CLOUDFLARED_BIN` | `cloudflared` | Binary to run |
| `CLOUDFLARED_PROTOCOL` | default | Optional `--protocol` value, e.g. `http2` if QUIC is blocked |
| `TUNNEL_TIMEOUT_MS` | `30000` | URL wait timeout |
| `NO_QR` | unset | Set to `1` to skip QR rendering (useful in logs/CI) |
| `DEBUG_TUNNEL` | unset | Set to any value to echo cloudflared output |

`WEB_PORT`/`SERVER_PORT` only tell the tunnels where to connect. The app still uses its normal
configuration; if you change the server port, set `PORT` in `.env` to match, and if you change the
web port, configure the web dev server accordingly. The helper deliberately does not set `PORT`
because Next and the server would both read it.

## Testing without the app

```bash
# terminal 1: dummy web
node -e "require('http').createServer((q,s)=>s.end('web ok')).listen(3100)"

# terminal 2: dummy api
node -e "require('http').createServer((q,s)=>s.end('api ok')).listen(3101)"

# terminal 3
START_APP=false WEB_PORT=3100 SERVER_PORT=3101 pnpm dev:tunnel
```

Then `curl` the printed HTTPS URLs. This verifies the tunnel transport; it does **not** verify the
game, camera, orientation, or WSS application behavior.

To verify the real server protocol over the tunnel, start the game server on `:8080`, run
`START_APP=false pnpm dev:tunnel`, and point the sim client at the printed API URL:

```bash
pnpm sim --server https://<printed-api-host> --bots 2
```

This exercises HTTPS plus the `wss://` lobby handshake. Camera and sensors still require a real
phone run.

## Limitations

- Two separate quick tunnels, not a single-origin reverse proxy. The web app must use the printed
  `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL`, not relative `/api` paths.
- Quick tunnels can be rate-limited or blocked by the local network. `CLOUDFLARED_PROTOCOL=http2`
  is a first fallback.
- The tunnel is not a deployment; it disappears when this process stops.
- The helper does not bypass the server's `ALLOWED_ORIGINS` or `ALLOW_DEV_MODE` policies.
