# Testing — devices, sensors, and platform

> Owner: Dev C. This file records **actual** results only. "Not run" means exactly that.
> A result copied from a desktop browser does not count as a phone result.

Last updated: 2026-10-24

## Current environment

- Local machine: macOS 26.6 (arm64). No physical phone is available to the coding agent.
- Local toolchain: Node 24.22.1 + pnpm 12.15.0 under `.tools/` (not committed).
- Camera, orientation, and geolocation require a **secure context**: HTTPS or localhost (PLAN P6).
- HTTPS/WSS quick tunnels now work: `pnpm dev:tunnel` exposes the web port and game server
  (Cloudflare quick tunnels; see [tools/dev-tunnel/README.md](../tools/dev-tunnel/README.md)).
  The tunnel transport has been smoke-tested from this machine, but no phone has been run through it.
- The standalone lab runs with `node apps/web/features/aiming/dev/serve.mjs` (localhost is a secure
  context). To open it on a phone before B's app exists:
  `WEB_PORT=4173 WEB_PATH=/aim-lab.html SERVER_PORT=8080 START_APP=false CLOUDFLARED_BIN=./.tools/cloudflared/cloudflared pnpm dev:tunnel`,
  then scan the printed QR code (or open the printed **Web** URL). Quick tunnels are public while
  the process runs.

## Automated checks

| Check | Command | Status | Notes |
|---|---|---|---|
| Root typecheck | `pnpm typecheck` | **Pass** (2026-10-24) | TypeScript 5.9.3, workspace build + typecheck |
| Root tests | `pnpm test` | **Pass 82/82** (2026-10-24) | shared 14, server 26, aiming 42 |
| Aiming package tests | `pnpm --filter @fantom/aiming test` | **Pass 42/42** | Vitest 3.2.7; angles 10, geo 15, evaluateAim 17 |
| Contract tests | `pnpm --filter @fantom/shared test` | **Pass 14/14** | 45 fixtures, coverage + invalid + visibility invariants |
| Root lint | `pnpm lint` | **Not available** | No root `lint` script yet; CI warns, does not pretend to lint |
| CI | `.github/workflows/ci.yml` | **Not run on GitHub** | Syntax-checked locally; no GitHub run from this environment |

## HTTPS/WSS tunnel smoke test

Run on 2026-10-24 with Cloudflare quick tunnels (`tools/dev-tunnel`) from the macOS host. These
checks prove the transport and the real server protocol over it. They are **not** phone camera,
sensor or posture results.

| Check | Observed |
|---|---|
| Dummy HTTP target over a quick tunnel | Web and API URLs returned **200**, TLS verification result `0` |
| Real server `GET /health` over a tunnel | **200** `{"ok":true,"protocolVersion":1}`, TLS result `0` |
| Real two-client lobby over `wss://` | `pnpm sim --server https://<tunnel>` completed: 3 players, ready, non-host rejection, host config update, disconnect surfaced, `[sim] OK` |
| Allowed WebSocket origin | Upgrade opened for the configured web-tunnel origin |
| Disallowed WebSocket origin | Upgrade rejected (HTTP **401**) for `https://evil.example` |
| CORS preflight | Allowed origin **204** with `access-control-allow-origin`; disallowed origin **204** without that header (browser blocks) |

Reproduce the transport check without the app:

```bash
# terminal 1
node -e "require('http').createServer((q,s)=>s.end('web ok')).listen(3100)"
# terminal 2
node -e "require('http').createServer((q,s)=>s.end('api ok')).listen(3101)
# terminal 3
START_APP=false WEB_PORT=3100 SERVER_PORT=3101 CLOUDFLARED_BIN=./.tools/cloudflared/cloudflared pnpm dev:tunnel
curl https://<printed-web-host>/
```

Reproduce the protocol check by starting the game server on `:8080`, tunneling it, and running
`pnpm sim --server https://<printed-api-host> --bots 2`.

## Synthetic desktop lab checks

These were run in the desktop preview browser with a canvas capture stream, not a phone camera and
not a real two-person posture. They verify the code path, not the product claim.

| Check | Observed |
|---|---|
| QR generation + native `BarcodeDetector` decode | Decoded `FANTOM:1:7:0e`; ~29.7 ms detection latency, ~6.5 fps in that synthetic run |
| QR generation + jsQR decode | Decoded `FANTOM:1:7:0e`; ~14.7 ms latency, ~8.3 fps in that synthetic run |
| Two markers in frame | Two detections rendered; ambiguity warning shown |
| Camera start/stop | Desktop browser accepted a 1280×720 stream; tracks and `srcObject` cleared on stop |
| Orientation listeners | Events arrived with `source: relative`; no calibrated/absolute heading claimed |

The synthetic results do not substitute for the device matrix or S15.3.

## Device matrix

Add a row for every device used. Record the real browser/OS version, not just "iPhone".

| Device | OS version | Browser/version | HTTPS origin | Camera | Orientation | GPS | Tester/date |
|---|---|---|---|---|---|---|---|
| _None yet_ | — | — | — | Not run | Not run | Not run | — |

## S15.3 camera-aiming scenarios

Run each on a real phone. Ambiguous cases must be rejected. Record the observed result, not the expected one.

| # | Scenario | Expected | Status / observed |
|---|---|---|---|
| 1 | A aims directly at B; B's marker is visible | Hit accepted | **Not run** |
| 2 | A aims away from B while B stays in view | Rejected | **Not run** |
| 3 | Camera aim and orientation disagree | Rejected | **Not run** |
| 4 | Marker too small / too far | Rejected | **Not run** |
| 5 | Two markers are visible | Ambiguous ⇒ rejected (implemented in `evaluateAim`; device not tested) | **Not run** |
| 6 | Eliminated player's marker | Rejected | **Not run** |
| 7 | A non-player crosses in front of the target | Rejected / no false hit | **Not run** |
| 8 | Target marker partially occluded | Rejected | **Not run** |
| 9 | Camera permission denied | Specific error + retry, no silent fallback | **Not run** |
| 10 | Orientation permission denied/unavailable | Specific error + retry, no silent fallback | **Not run** |
| 11 | Device orientation changes abruptly | No stale/ghost target | **Not run** |
| 12 | Sensor readings stale or noisy | Rejected; no stale evidence accepted | **Not run** |

### Additional M1 posture test (not in S15.3, but required by this track)

The spec assumes the target's screen marker is visible to the shooter's rear camera. In the normal
aiming grip the screen faces the player, so the marker faces **away** from the opponent. Rotating the
screen toward the opponent hides the HUD and points the rear camera away. Test the real two-person
pose before choosing a detector. The standalone lab is at
`apps/web/features/aiming/dev/aim-lab.html` (see its README for the run command):

| Test | Status / observed |
|---|---|
| B displays `PlayerMarker`; A aims at B in a normal grip and can see B's screen | **Not run** |
| Both players aim at each other simultaneously | **Not run** |
| Marker is readable at 2 m / 5 m / 8 m / 10 m / 15 m / 30 m (record real threshold) | **Not run** |
| Marker is readable outdoors in daylight/glare | **Not run** |

## S15.4 GPS checks

Server-side location rules (accuracy, staleness, speed, hysteresis, drain) are Dev A's automated tests;
this table is for real-device observation. Do not duplicate server unit tests here.

| Check | Expected | Status / observed |
|---|---|---|
| Normal GPS updates | Position updates at 1–2 Hz, no UI jitter | **Not run** |
| Stale data | Not treated as current | **Not run** |
| Poor accuracy | Location-quality warning; boundary decisions paused | **Not run** |
| Boundary jitter | No rapid in/out flapping | **Not run** |
| Confirmed exit | Gray UI, drain starts only after confirmation | **Not run** |
| Return inside | 1 s grace, then combat eligible | **Not run** |
| Permission denied | Clear error, no fake position | **Not run** |
| Impossible jump | Rejected by server | **Not run** |
| Temporary loss | Clear state; no silent assumption | **Not run** |

## Physical-safety checklist (S15.5)

Run before any live demo. Unchecked until actually performed.

- [ ] Open, designated play area away from roads, traffic, stairs, and other hazards
- [ ] Boundaries visible to every player before the match starts
- [ ] Players told not to run while looking at their phones
- [ ] Immediate stop/leave action verified on every phone
- [ ] Players can move while looking away from the device
- [ ] Demo briefing covers camera aiming limits and out-of-bounds behavior

## Platform notes / open risks

- iOS requires `DeviceOrientationEvent.requestPermission()` from a user gesture. Starting aiming from a
  button tap is mandatory (PLAN P9).
- `deviceorientationabsolute` vs. `deviceorientation` and `webkitCompassHeading` differ by browser.
  The normalizer must expose `headingSource` honestly.
- `BarcodeDetector` availability and speed vary by browser; do not assume it exists. Verify on the
  actual target phones before choosing it.
- Marker detection range is limited by the physical size of a phone screen. A 7 cm marker at 60° hFOV
  and 1280 px is roughly 16 px wide at 5 m, 8 px at 10 m, and 3 px at 30 m; multi-bit decoding at
  3–8 px is not credible. The `maxRangeM: 30` default is provisional and must be play-tested.
- Screen brightness, glare, auto-exposure, moiré, and refresh flicker all affect detection.
- Client aim evidence is self-reported and is not proof of a real-world hit (S9.9, S14).
- Quick-tunnel hostnames are random and public while the helper runs. They are suitable for short
  dev sessions only, not deployments or real user data.
