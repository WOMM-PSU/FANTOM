# Track status

Updated: 2026-10-24 (Dev A M0/M1 and Dev C M0/core session)

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

> **Cross-track note (Dev C, 2026-10-24):** the geo/angle helpers, `evaluateAim`, fixtures and
> `contract.test.ts` requested in Dev A's report are now present; see the Dev C section below.

## Dev B — Client app & UX

Not started in this workspace (no `apps/web`). No status reported yet.

## Dev C — Aiming, sensors & platform

### Done

- Integrated with Dev A's workspace and `packages/shared` contract (PR #1) without changing the
  contract schema.
- **`packages/aiming`** now builds as a workspace package (NodeNext, `dist/`, shared dependency):
  - `geo.ts` + `angles.ts`: haversine, bearing, local east/north metres, wrap-safe angle math,
    degree/radian conversion. 25 tests including 0°/360°, antimeridian, poles/antipodes and
    negative offsets.
  - `evaluateAim` v0 following P5.2's check order, with a specific `RejectReason` for every path.
    Conservative MVP rule: any second visible marker is `EVIDENCE_AMBIGUOUS` because the evidence
    has no per-marker offsets. Relative headings are rejected; a null heading accuracy is allowed.
    Range uses GPS accuracy slack and rejects contradictory camera/GPS distance. 17 tests.
- **`packages/shared/fixtures`**: 45 validated JSON fixtures covering every client/server message,
  both shot evidence sources, all six required `MATCH_STATE` variants (plus team deathmatch), all
  HTTP types, and 9 invalid examples. Generator at `fixtures/generate.mjs`; `test/contract.test.ts`
  has 14 tests including coverage, invalid rejection and visibility invariants. Added only test
  tooling to the shared package (`vitest`, `@types/node`, test/typecheck scripts); no schema change.
- **CI workflow** (`.github/workflows/ci.yml`): install, typecheck, test, conditional lint. Lint is
  not configured in the root yet; the workflow emits a warning instead of silently pretending it
  ran. This is a known M0 gap for the team to close.
- **Standalone aim-lab spike** (`apps/web/features/aiming/dev`): camera start/stop with track
  cleanup, raw orientation readout (including iOS permission request), QR marker with a checksum,
  native `BarcodeDetector` + jsQR detection, distance/latency/FPS/offset metrics, ambiguity warning,
  hFOV calibration helper, and a two-phone posture-test procedure. Vendored spike-only libraries
  with licenses; not production dependencies.
- Added `docs/testing.md` (device matrix, S15.3/S15.4/S15.5 checklists, all device rows **Not
  run**) and `docs/aiming-decisions.md` (open decision, candidates, posture/range analysis).
- **`pnpm dev:tunnel`** (`tools/dev-tunnel`): starts two Cloudflare quick tunnels for the web port
  and game server, waits for both HTTPS URLs, prints Web/API/WSS URLs plus a scannable QR code for
  the Web URL, then starts `pnpm dev` with `WEB_BASE_URL`, `ALLOWED_ORIGINS`, `NEXT_PUBLIC_API_URL`
  and `NEXT_PUBLIC_WS_URL` set. Supports `START_APP=false`, `WEB_PATH`, `NO_QR`, port overrides,
  `CLOUDFLARED_BIN`, `CLOUDFLARED_PROTOCOL` and `TUNNEL_TIMEOUT_MS`; stops tunnels on exit and fails
  loudly if one drops. Root script added. DEV ONLY: quick-tunnel URLs are public while the process
  runs.
- **Verified locally:** root `pnpm typecheck` green; root `pnpm test` green (82 tests: shared 14,
  server 26, aiming 42). Lab checked in the desktop preview browser with a synthetic canvas stream:
  both detectors decoded `FANTOM:1:7:0e`, and two markers produced the ambiguity warning. Tunnel
  smoke test: dummy targets and the real `/health` returned HTTPS 200; `pnpm sim --server
  https://<tunnel>` completed a 3-player lobby over WSS; allowed origin opened, disallowed origin
  rejected (401); CORS allowed 204 with header, denied without. The helper rendered a terminal QR
  code for `WEB_PATH=/aim-lab.html`, and that HTTPS URL returned 200. **No phone camera has scanned
  the QR code**, and no real phone or real camera result is claimed.

### In progress

- M1 real-device spike (needs physical phones). The HTTPS/WSS origin is now available via
  `pnpm dev:tunnel`; the standalone lab can be exposed with
  `WEB_PORT=4173 WEB_PATH=/aim-lab.html START_APP=false` and opened by scanning its QR code.

### Blocked on

- **Human:** two real phones and device access. The coding environment cannot run S15.3/S15.4 or
  produce honest device results.
- **Dev B:** `apps/web` app shell and the integrated `/dev/aim-lab` route. The standalone lab works
  in the meantime, but the production `AimView`/`PlayerMarker` surface belongs in B's app.
- **Team:** choose a lint tool/root `lint` script; review the ambiguity, relative-heading and
  GPS-slack-cap decisions below.
- **Dev A:** none for geo/angles now; fixtures and `evaluateAim` are ready for M2/M3 consumption.
  The root `dev:tunnel` script is added; A only needs to keep `pnpm dev` starting both apps when the
  web app exists.

### Contract change requests

No schema changes made. For team review:

1. **Ambiguity cannot be fully checked from `AimEvidence`.** It has `visibleMarkerCodes` and one
   `markerOffsetDeg`; it cannot prove which other marker is closest to the reticle. The MVP rejects
   any second visible marker (`EVIDENCE_AMBIGUOUS`). A contract PR adding per-marker offsets and
   confidence would allow P5.2's intended rule.
2. **Relative headings** cannot be compared with an absolute GPS bearing; `evaluateAim` rejects
   them as `EVIDENCE_LOW_CONFIDENCE`. If this needs its own reason, add `HEADING_UNUSABLE` in a
   coordinated contract change.
3. **GPS slack cap.** P5.2 requires a cap but names no value. `evaluateAim` uses a local provisional
   cap of 45°, not a shared constant. Decide whether it belongs in `AIM_DEFAULTS` after M4 tuning.

### Known issues / limitations

- No real-device camera, orientation, GPS or safety tests have been run. `docs/testing.md` says
  **Not run** for every device row.
- The marker pose is unresolved: in a normal aiming grip the target's screen faces the target, not
  the shooter's rear camera. This is the highest product risk; test it before choosing a detector.
- The lab currently tests a **QR candidate** only. ArUco-style and custom codes still need a fair
  comparison on the same phones; no marker approach is chosen.
- `evaluateAim` treats `estimatedDistanceM` as a client hint (the contract has no physical marker
  width). Client evidence is not proof of a real-world hit; anti-cheat is explicitly limited.
- **P5.3 dev-evidence seam:** `makeDevEvidence(targetMarkerCode)` has no shooter/target positions,
  so it cannot produce a camera heading that agrees with the real GPS bearing. Either the server's
  dev path must deliberately skip agreement/range checks (and say so), or the factory needs the two
  positions. Decide with Dev A and Dev B before M3; do not make simulated evidence look real.
- `GeoFix.ageMs` is not re-checked inside `evaluateAim`; the caller must apply P4.6 step 6 location
  freshness/quality first.
- `devMode` gating is handled by Dev A's `ALLOW_DEV_MODE` server policy; no C action needed.
- CI has not run on GitHub from this environment. The workflow is syntax-checked only.
- `pnpm dev:tunnel` uses two separate quick tunnels, not one origin; the web app must call the
  printed API/WS URLs rather than relative `/api` paths. The tunnel is not a deployment and
  disappears when the process stops. No phone has been tested through it yet.
