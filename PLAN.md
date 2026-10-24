# FANTOM — PLAN.md

> How the three of us build FANTOM in parallel without stepping on each other.
> **`CLAUDE.md`** = what we are building (product spec, source of truth).
> **`PLAN.md`** (this file) = who builds what, in what order, against which contract.
> **`packages/shared/src/protocol.ts`** = the wire contract. It is code, not prose, and it beats any prose in this file if they ever disagree.

Status: v0.1 draft. The contract is *frozen* at the end of Milestone M0 (§7). After that, changes go through the contract-change process (§2.4).

---

## 1. The split at a glance

We split by **who owns authority** (server) vs **who owns presentation** (client), and carve the riskiest piece — real-world sensing — into its own owner so it gets attention from hour one.

| | **Dev A — Server & Game Authority** | **Dev B — Client App & HUD** | **Dev C — Aiming & Spatial** |
|---|---|---|---|
| Name | `[fill in]` | `[fill in]` | `[fill in]` |
| Side | Server | Client | Both sides (pure shared code + client camera pipeline) |
| One-line mission | Authoritative game state: lobby, lifecycle, combat, modes, pickups, arena enforcement | Everything the player sees and touches: join flow, lobby, HUD, minimap, geolocation, results, reconnect UX | Turn camera + orientation + GPS into trustworthy aiming evidence and validate it |
| Owns (paths) | `apps/server/**`, `supabase/**` | `apps/web/**` **except** `apps/web/features/aiming/**` | `apps/web/features/aiming/**`, `packages/shared/src/geo.ts`, `packages/shared/src/aim.ts`, `apps/web/app/dev/aim/**` |
| Consumes | `protocol.ts`, `constants.ts`, `geo.ts`, `aim.ts` | `protocol.ts`, `constants.ts`, `useAiming()` + `<PlayerMarker/>` from C | `protocol.ts`, `constants.ts` |
| Provides | A running server speaking the contract; bot client for tests | UI + `GameTransport` client; HUD that hosts C's aiming view | `geo.ts`, `aim.ts` (used by server *and* client), `useAiming()`, `<PlayerMarker/>`, calibration UX |
| Hardest risk | Race-free combat, hidden-info leaks, timers | Mobile browser permissions, HUD usability outdoors | Camera/orientation reliability across phones |

Why this split works:
- **A and B never wait on each other**: they talk only through `protocol.ts`. B develops against a mock transport fed by fixtures; A develops against a scripted bot client. They meet at Milestone M1.
- **C starts de-risking on day one** (standalone `/dev/aim` page), instead of finding out in the last hours that marker detection doesn't work on our phones. The spec's Phase 5 order governs *integration order*, not who is idle.
- **C's pure functions are the shared brain**: the server calls `evaluateAim()` to accept/reject a shot; the client calls the same geometry for its reticle gate. One implementation, one set of tests.

Sizing is deliberately uneven by *type* of work (A: lots of rules logic, B: lots of UI, C: hard unknowns). If someone is blocked or ahead, pull work across using the ownership table in §3 — just announce it in the team chat first.

---

## 2. Ground rules

### 2.1 Contract first
1. All traffic between web and server is defined by Zod schemas in `packages/shared/src/protocol.ts`. Both sides import from `@fantom/shared`. No hand-written duplicate types.
2. Every inbound frame is validated at runtime (`parseClientMessage` on the server, `parseServerMessage` on the client). Invalid → drop + log (client) / `ERROR` reply and count toward rate limit (server).
3. Balance numbers live in `packages/shared/src/constants.ts` only.
4. Clients **request**, the server **decides**. No message lets a client declare a hit, damage, ammo, score, role, or winner (CLAUDE.md §13).

### 2.2 Ownership and reviews
- Each path in §3 has one owner. You may *read* anything; you edit only what you own.
- Cross-boundary edits happen by **PR to the owner** (or by asking them). Exception: trivial typo fixes.
- `.github/CODEOWNERS` encodes §3. Every PR needs one review from another teammate; `packages/shared/**` needs review from **both** other teammates.
- Small PRs, merged to `main` at least every few hours. `main` must always pass `npm run typecheck && npm test`.
- Branch names: `a/<topic>`, `b/<topic>`, `c/<topic>`.

### 2.3 Honesty rules (from CLAUDE.md, restated because agents love to cheat)
- Never present mocked or simulated functionality as real. Dev-only fallbacks must be labeled in code **and** visibly in the UI (the snapshot's `devSimulation` flag drives a persistent banner).
- Never claim a feature works without running it. Never invent test results.
- Ambiguous aiming → **reject the shot**.
- Report limitations (camera, GPS, browser support, anti-cheat) in `docs/limitations.md` as we discover them.

### 2.4 Contract-change process (after the freeze)
1. Open a PR touching `packages/shared/**` with the title prefix `[contract]`.
2. Describe: what changes, why, who is affected, whether it is breaking.
3. **Additive and optional** changes (new optional field, new enum value the receiver tolerates) → merge after both other devs approve.
4. **Breaking** changes (rename, remove, tighten) → bump `PROTOCOL_VERSION`, update fixtures, and merge only when both sides' branches are ready. Avoid; prefer additive.
5. Update the fixtures in `packages/shared/fixtures/` and the decisions log (§4.6) in the same PR.

### 2.5 Definition of done for any task
Code + runtime validation + tests for the rule + types + docs updated if behavior changed + `npm run typecheck && npm test` green. UI work additionally tested on a real phone.

---

## 3. Repository layout and ownership

```text
fantom/
├── CLAUDE.md                       # product spec            (all, change by agreement)
├── PLAN.md                         # this file               (all, change by agreement)
├── README.md                       # how to run              (A writes, all update)
├── package.json                    # npm workspaces + scripts (A)
├── tsconfig.base.json              #                         (A)
├── .github/CODEOWNERS              #                         (A)
├── prompts/                        # agent prompts           (all)
├── apps/
│   ├── web/                        # Next.js                 (B)
│   │   ├── app/
│   │   │   ├── dev/aim/            # standalone aiming lab   (C)
│   │   │   └── ...                 # join/lobby/match/results (B)
│   │   ├── features/
│   │   │   ├── aiming/             # camera+orientation      (C)
│   │   │   ├── lobby/ hud/ map/    #                         (B)
│   │   │   └── session/            # transport, state store  (B)
│   │   ├── components/ hooks/ lib/ styles/   #               (B)
│   │   └── lib/mock-transport/     # fixture-driven fake server (B)
│   └── server/
│       └── src/
│           ├── index.ts            # http + ws bootstrap     (A)
│           ├── networking/         # sockets, rate limits, dedupe (A)
│           ├── lobby/              # match registry, join, ready (A)
│           ├── game/               # phases, combat, modes, pickups, timers (A)
│           ├── validation/         # settings + payload checks, calls aim.ts (A)
│           └── scripts/bot-client.ts  # scripted client for tests (A)
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── constants.ts        # weapons, limits, defaults (A proposes; changes need both)
│       │   ├── protocol.ts         # THE CONTRACT            (joint; §2.4)
│       │   ├── geo.ts              # haversine, local ENU, point-in-polygon, bearing (C)
│       │   ├── aim.ts              # evaluateAim() and helpers (C)
│       │   └── index.ts
│       └── fixtures/               # golden messages + scenario scripts (joint)
├── supabase/migrations/            # optional result history  (A, low priority)
└── docs/
    ├── architecture.md             # (A)
    ├── testing.md                  # (all; camera section C, GPS section A)
    └── limitations.md              # (all)
```

Tooling decisions (change only by agreement):
- **npm workspaces**, TypeScript strict everywhere, **Zod** for schemas, **Vitest** for tests, **tsx** to run the server in dev.
- Server: plain Node `http` + the **`ws`** library. No framework needed.
- `@fantom/shared` is consumed **as TypeScript source** (workspace `exports` → `src/index.ts`, no build step). Next needs `transpilePackages: ["@fantom/shared"]`.
- Root scripts everyone must keep working: `npm run dev` (web + server), `npm run typecheck`, `npm test`, `npm run lint`.

---

## 4. The contract

The normative definition is `packages/shared/src/protocol.ts`. This section explains the semantics that the schemas can't express.

### 4.1 Transport overview
1. **HTTP** (pre-connection): create/join a match and receive a `SessionGrant` (`playerId`, secret `sessionToken`, `wsUrl`).
2. **WebSocket**: the first frame must be `CONNECT { matchId, sessionToken }`. This is also how reconnect works; connecting again with the same token **replaces** the old socket (old one receives `ERROR SESSION_REPLACED`) and gets a fresh `STATE`. This is what prevents duplicate identities.
3. Every frame is the envelope `{ v: 1, type, requestId, payload }`. Client `requestId`s are unique per request; the server **dedupes** repeats (idempotency) and echoes the id in replies.
4. Max frame size 8 KB; wrong version → `UNSUPPORTED_VERSION`.

### 4.2 HTTP endpoints

| Method + path | Body | Success | Notes |
|---|---|---|---|
| `POST /matches` | `CreateMatchRequest` | `201 SessionGrant` | Caller becomes host |
| `POST /matches/join` | `JoinMatchRequest` | `200 SessionGrant` | `MATCH_NOT_FOUND`, `MATCH_FULL`, `WRONG_PHASE` (match already started) |
| `GET /matches/by-code/:joinCode` | — | `200 MatchLookup` | For the join page preview |
| `GET /health` | — | `200 { ok, protocolVersion }` | |

Errors always use `HttpErrorBody`. CORS: server allows the configured web origin only.

### 4.3 WebSocket messages

**Client → server**

| Type | Who/when | Server behavior |
|---|---|---|
| `CONNECT` | first frame, also reconnect | authenticates, replaces older socket, replies `STATE` |
| `PING` | every ~5 s | replies `PONG` with `serverTime` (client computes clock offset) |
| `SET_SETTINGS` | host, lobby | validates *fully*, applies, broadcasts `STATE`; else `ERROR INVALID_SETTINGS` |
| `SET_READY` | any, lobby | stores readiness + reported `capabilities`; ready checks use it |
| `START_MATCH` | host, lobby | re-validates everything; `ERROR START_BLOCKED` if not startable; else countdown |
| `ABORT_MATCH` | host, countdown/active | safety stop → `finished` with `reason: host_abort` |
| `LEAVE_MATCH` | any | removes the player; handles host handoff / empty match |
| `UPDATE_LOCATION` | active (and lobby for map preview), ≥ 500 ms apart | validates range, rate, plausibility; updates quality/boundary state |
| `REQUEST_SHOT` | active | validates alive/phase/role/lockout/ammo/cooldown/reload **then** `evaluateAim()`; replies `SHOT_ACCEPTED` or `SHOT_REJECTED` |
| `REQUEST_HEAL` | active, Healers | range + cooldown + role + team checks → `HEAL_APPLIED` or `ACTION_REJECTED` |
| `REQUEST_PICKUP` | active | proximity + availability → `PICKUP_COLLECTED` or `ACTION_REJECTED` |

**Server → client**

| Type | Audience | Meaning |
|---|---|---|
| `STATE` | per recipient | Full authoritative snapshot. Sent on connect, on any change, and ≤ 4 Hz during `active`. Clients **replace** local state with it. |
| `PONG` | requester | Clock sync |
| `SHOT_ACCEPTED` / `SHOT_REJECTED` | shooter | The only way the UI may show a confirmed hit / a reason |
| `PLAYER_DAMAGED` | victim | Damage flash / directional cue |
| `PLAYER_ELIMINATED` | all | Kill feed |
| `HEAL_APPLIED` / `HEAL_INTERRUPTED` | involved + team | |
| `PICKUP_COLLECTED` | all who could see it | |
| `ACTION_REJECTED` | requester | Heal/pickup refusal with reason |
| `MATCH_FINISHED` | all | Result (also in `STATE.result`) |
| `ERROR` | requester | `code` + short message |

Design choice: **one full per-recipient `STATE` snapshot instead of many small deltas.** With ≤ 12 players it is small, it makes reconnect trivial (CONNECT → STATE), and it makes hidden-info filtering a single function on the server. Events are only for things the UI animates.

### 4.4 Semantics that matter

- **Time.** All timestamps in `STATE` and events are *server* epoch ms. The client estimates `offset = serverTime − (clientSendTime + rtt/2)` from `PING/PONG` and renders countdowns/cooldowns/reload bars as `serverTimestamp − (Date.now() + offset)`. Client clocks are never used for rules (CLAUDE.md §7.6).
- **Hidden information.** The server builds each recipient's `STATE` through one `projectFor(playerId)` function. `PlayerPublic.position` is present only if mode + minimap settings allow that recipient to see that player. The Assassin never receives Survivor positions by default. Test this (§9).
- **Marker IDs.** At match start the server assigns each player a random `markerId` (0–4095), delivered only in `self.markerId`. The phone displays it (`<PlayerMarker/>`); other phones decode it and send it as `targetMarkerId`. The server resolves marker → player. Marker IDs are per match and are not session secrets.
- **Shot evidence.** `REQUEST_SHOT` carries `AimEvidence` (see `protocol.ts`). It is **client-claimed**, not proof. The server cross-checks it against GPS geometry using `evaluateAim()` (§5) and rejects when unsure.
- **`fireBlockedReason`.** The server computes why you can't fire; the HUD shows it. The client does **not** re-derive combat rules (no duplicated logic to drift).
- **Location quality.** `self.locationQuality` tells the player when their GPS is too poor/stale for boundary or combat decisions — the HUD must show this clearly (CLAUDE.md §10.5).
- **Dev simulation.** If the server is started with `FANTOM_DEV_SIM=1`: `UPDATE_LOCATION.source = "simulated"` and `AimEvidence.source = "simulated"` are honoured, and `STATE.devSimulation = true`. Otherwise those frames are rejected (`simulation_not_allowed`). The client shows a persistent "SIMULATED" banner whenever `devSimulation` is true. This is how we test combat before camera aiming is real, without lying about it.
- **Idempotency.** Duplicate `requestId` from the same player → return the original reply (or `duplicate_request` for shots), never re-apply.
- **Rate limits (A decides numbers, PROVISIONAL):** location ≥ 500 ms apart; shots bounded by weapon interval plus a small burst allowance; overall ≤ ~20 frames/s per socket.
- **Disconnect policy.** A disconnected player cannot fire/heal/collect and is removed from combat immediately; they can reconnect within `TIMING.reconnectTimeoutMs`. After that they are dropped. The in-memory match does not survive a server restart (document in `docs/limitations.md`).

### 4.5 Error and rejection vocabulary
`ErrorCode`, `FireBlockReason`, `ShotRejectReason`, `ActionRejectReason` are enums in `protocol.ts`. Adding a value is an additive contract change. **B must render a human-readable message for every value** (a `Record<ShotRejectReason, string>` makes the compiler enforce it).

### 4.6 Decisions log
Append new decisions here (one line each, with date and who).

| ID | Decision | Why |
|---|---|---|
| D-01 | Join/create over HTTP, gameplay over WebSocket; `JOIN_MATCH` from the spec is the HTTP `POST /matches/join` | Gets credentials before opening a socket; simpler reconnect |
| D-02 | `CONNECT` as first WS frame carries the token (not a query string) | Tokens in URLs leak into logs/history |
| D-03 | Per-recipient full `STATE` snapshots, not deltas | Simplicity, reconnect, single hiding point |
| D-04 | Target identity = decoded `markerId`; server maps to player | Matches spec §9.2; no player ids in public markers |
| D-05 | TDM default spawn lockout 5 s (spec only specifies FFA 5 s, Assassin 15 s) | Smallest safe interpretation |
| D-06 | Supabase only persists finished match results; not on the critical path | Spec §3.3 allows in-memory active matches |
| D-07 | Reticle gate is client-side; GPS-vs-camera agreement is server-side (§5) | Client doesn't know enemy positions (hidden info), so only the server can compare |
| D-08 | Phone testing over an HTTPS tunnel (cloudflared/ngrok); prod = web on Vercel-style host, server on a persistent-process host (Fly/Railway/Render) | Camera needs HTTPS; WebSockets need a long-lived process |

---

## 5. Aim agreement — v1 definition (Dev C owns; tune on real phones)

Spec §9.5 requires camera and orientation to "agree". Because enemy positions are hidden from clients, the **server** performs the comparison using both players' GPS:

1. **Reticle gate (client, `useAiming`)**: marker center within `AIM_DEFAULTS.reticleRadiusDeg` of the optical axis, confidence ≥ `minMarkerConfidence`, no other markers competing, orientation fresh. Only then does the client send a shot with evidence.
2. **Server check, `evaluateAim()` in `packages/shared/src/aim.ts` (pure function, no I/O):**

```ts
evaluateAim(input: {
  shooter: { position: LatLng; accuracyM: number; positionAgeMs: number };
  target:  { position: LatLng; accuracyM: number; positionAgeMs: number; markerId: number };
  evidence: AimEvidence;
  config: typeof AIM_DEFAULTS & { maxRangeM: number };
}):
  | { ok: true;  details: { gpsDistanceM: number; deltaDeg: number; toleranceDeg: number } }
  | { ok: false; reason: ShotRejectReason }
```

   Rules (each has a unit test):
   - `evidence.marker.id !== target.markerId` → `target_unknown`; `otherMarkerIds` non-empty → `ambiguous_target`; `occlusionSuspected` → `no_target`.
   - `detectionAgeMs`/`orientationAgeMs` > `maxEvidenceAgeMs` → `evidence_stale`; confidence < min → `evidence_low_confidence`.
   - Either location older than `ARENA_RULES.maxLocationAgeMs` → `location_stale`.
   - `gpsDistanceM = haversine(shooter, target)`; > `maxRangeM` → `out_of_range`.
   - If `estimatedDistanceM` is present and disagrees with `gpsDistanceM` by more than `maxDistanceDisagreementRatio` (allowing for both GPS accuracies) → `range_contradictory`.
   - `expectedBearing = bearing(shooter → target)`; `observedBearing = wrap360(headingDeg + marker.bearingOffsetDeg)`; `deltaDeg = |wrap180(expected − observed)|`.
   - `toleranceDeg = baseToleranceDeg + min(maxGpsToleranceDeg, atan((shooter.accuracyM + target.accuracyM) / max(gpsDistanceM, 1)))`; `deltaDeg > toleranceDeg` → `aim_disagreement`. If heading is `unknown` source or accuracy is huge → `aim_disagreement` (fail safe).
   - Anything uncertain → reject. Never guess.
3. All thresholds are **provisional**. C calibrates on at least two real phone models and records the numbers + method in `docs/testing.md`.

Honest limitation to keep in `docs/limitations.md`: this is client-reported evidence plus GPS plausibility, not cryptographic proof of a physical hit.

---

## 6. Interfaces between us

### 6.1 A ↔ B (server ↔ client)
Only `protocol.ts` + fixtures. To work in parallel:
- **A ships `apps/server/src/scripts/bot-client.ts`**: a scripted client using `@fantom/shared` (`create → join → ready → start → move → shoot`). Used for integration tests and for B to test against a real server.
- **B ships `apps/web/lib/mock-transport/`**: implements the same `GameTransport` interface as the real WebSocket transport but replays `packages/shared/fixtures/` scenarios (lobby with 4 players, active match, damaged, eliminated, finished, poor GPS, out of zone…). B builds every screen against this first.
- **Fixtures** (`packages/shared/fixtures/*.json`): golden `STATE` snapshots + event messages. Both sides add a Vitest test asserting every fixture parses with `parseServerMessage`/`parseClientMessage`. This is our contract test: if either side drifts, CI fails.

`GameTransport` (B owns, defined in `apps/web/features/session/transport.ts`):
```ts
interface GameTransport {
  connect(grant: SessionGrant): void;
  send<T extends ClientMessageType>(type: T, payload: Extract<ClientMessage,{type:T}>["payload"]): string; // returns requestId
  subscribe(handler: (m: ServerMessage) => void): () => void;
  onStatus(handler: (s: "connecting"|"open"|"reconnecting"|"closed") => void): () => void;
  close(): void;
}
```

### 6.2 B ↔ C (client ↔ client)
C owns `apps/web/features/aiming/` and exposes exactly this (B treats it as a black box):
```ts
type AimingStatus = "idle"|"initializing"|"ready"|"permission_denied"|"unsupported"|"error";
type AimingState = {
  status: AimingStatus;
  message?: string;                 // human-readable, for the HUD
  orientation: "ok"|"unavailable"|"denied"|"noisy";
  candidateMarkerId: number | null; // what is under the reticle right now
  reticleLocked: boolean;
};
function useAiming(opts: { enabled: boolean; videoRef: RefObject<HTMLVideoElement> }): {
  state: AimingState;
  start(): Promise<void>;            // must be called from a user gesture (iOS)
  stop(): void;                      // stops all camera tracks
  calibrate(): Promise<void>;
  /** Snapshot of fresh evidence for REQUEST_SHOT, or null if nothing valid. */
  captureEvidence(): { targetMarkerId: number; evidence: AimEvidence } | null;
};
function PlayerMarker(props: { markerId: number; size?: number }): JSX.Element; // renders THIS phone's marker
```
B embeds the video element + reticle + shoot button, calls `captureEvidence()` on shoot, and sends `REQUEST_SHOT`. B never inspects pixels or sensors. C never talks to the network.

### 6.3 A ↔ C (server ↔ shared)
A calls `evaluateAim()` and `geo.ts` helpers from the shot/arena handlers. Until C delivers, A uses a stub that accepts only `source: "simulated"` evidence and only when `FANTOM_DEV_SIM=1`.

---

## 7. Milestones

Spec phases (CLAUDE.md §17) set the **integration order**. Each milestone ends with a joint check on real devices.

**Legend:** ✅ = exit check we run together.

### M0 — Contract freeze + foundation (target: first ~2 hours)
- **All**: 30-min session. Read CLAUDE.md + PLAN.md + `protocol.ts` together. Resolve the open questions in §11. Freeze v1. Commit CLAUDE.md, PLAN.md, `prompts/`, and `packages/shared/src/{constants,protocol,index}.ts` as the initial commit.
- **A**: Foundation PR (< 1 h): root workspaces, `tsconfig.base.json`, scripts, CODEOWNERS, `apps/server` skeleton (`/health`, `ws` accepting connections), CI workflow running typecheck + test. Create `packages/shared/fixtures/` with the first `STATE` lobby fixture.
- **B**: `create-next-app` into `apps/web` (after A's workspace PR), mobile-first layout, `GameTransport` interface + mock transport skeleton.
- **C**: Spike branch (no repo dependency): browser camera + `DeviceOrientationEvent` permission flow on iOS Safari and Android Chrome; prove we can read frames and heading on our own phones.
- ✅ Everyone can `npm install && npm run dev && npm test` from a clean clone.

### M1 — Lobby end-to-end (Phase 1)
- **A**: `POST /matches`, `/matches/join`, `/matches/by-code`, WS `CONNECT`, match registry, join-code generator, `STATE` broadcast, `LEAVE_MATCH`, host handoff, session replace on reconnect, runtime validation, rate limiter. Bot client: create + join.
- **B**: Home (create/join), join-by-code and QR (`/join/<code>` link, QR rendering), lobby screen with live player list, real WS transport, session store, connection-status UI, sanitized name rendering.
- **C**: `geo.ts` (haversine, bearing, local ENU, point-in-polygon, wrap helpers) + Vitest tests (A needs it in M3). Continue camera/marker spike → `/dev/aim` page: render a marker, detect it with a second phone.
- ✅ **Exit (spec P1):** two separate phones join the same lobby over HTTPS and see identical player lists.

### M2 — Match lifecycle (Phase 2)
- **A**: `SET_SETTINGS` validation (incl. mode rules, e.g. Assassin has weapon drops off), `SET_READY`, ready checks with capabilities, `START_MATCH`, countdown, `active → finished`, `ABORT_MATCH`, timers, results object.
- **B**: Host settings UI (mode, duration, minimap config, pickups), ready button + permission requests flow with explanations and retry, countdown screen with a safety message, results screen, leave/abort controls always visible.
- **C**: Marker design decision (format + codec), `<PlayerMarker/>` v0, detection v0 on `/dev/aim`; document decision in D-log.
- ✅ **Exit (spec P2):** lobby → countdown → active → results without touching the server by hand.

### M3 — Positioning and arena (Phase 3)
- **A**: `UPDATE_LOCATION` validation (range, rate, plausibility, staleness, accuracy), arena polygon, boundary hysteresis + confirmation window, `out_of_zone` state, 10 HP/s drain, 1 s return grace, `locationQuality`, per-recipient position projection (`projectFor`).
- **B**: Geolocation watch + upload, arena-drawing UI for host (tap points on a map or "use my position + radius" preset), minimap (polygon, self, allowed players, pickups), gray out-of-bounds UI + clear warning, poor-GPS banner. Dev-only simulated location panel (behind `devSimulation`).
- **C**: Finish `/dev/aim` calibration flow; orientation smoothing and wraparound; begin `aim.ts` with unit tests (pure geometry).
- ✅ **Exit (spec P3):** walking out of the arena on a real phone → confirmed exit, drain, return, grace. No flapping on jitter.

### M4 — Combat on simulated aim (Phase 4)
- **A**: Health/shield/elimination, Pulse, ammo + automatic reload, spawn lockout, shot pipeline (all non-aim checks), duplicate-event protection, `SHOT_*`/`PLAYER_DAMAGED`/`PLAYER_ELIMINATED`, win check. Unit tests per CLAUDE.md §15.1.
- **B**: Combat HUD: weapon, ammo, reload progress, health/shield, spawn timer, shoot button, `fireBlockedReason` text, damage flash, kill feed, eliminated screen. "SIMULATED" banner and a dev "simulated aim" button that sends `source:"simulated"` evidence — clearly labeled, only visible when `devSimulation`.
- **C**: `evaluateAim()` complete with tests for every rule in §5.
- ✅ **Exit (spec P4):** a controlled test with 2 phones (simulated aim) produces valid damage, rejected shots, reloads, eliminations — consistently.

### M5 — Real camera aiming (Phase 5)  ← riskiest
- **A**: Wire `evaluateAim()` into `REQUEST_SHOT`; reject `simulated` evidence unless `FANTOM_DEV_SIM=1`; log rejection reasons (counters) for tuning.
- **B**: Aiming view layout: video, reticle, target feedback states, "aim unavailable" states, permission recovery UX; call `useAiming()` + `captureEvidence()`.
- **C**: `useAiming()` complete: frame loop, decode, bearing/elevation offset, distance estimate, other-marker ambiguity, occlusion suspicion, evidence freshness, camera lifecycle (stop tracks on leave/end), `<PlayerMarker/>` final. Tune on ≥ 2 real phone models; fill the §15.3 camera test table in `docs/testing.md`.
- ✅ **Exit (spec P5):** on two real phones, A can hit B when aimed correctly, and clearly wrong aims (away, occluded, too far, two markers) are rejected.
- **Fallback:** if fusion is unreliable, keep the game loop on the labeled dev-sim path and say so everywhere. Never present simulated aiming as camera aiming.

### M6 — Game modes (Phase 6)
- **A**: FFA scoring + win condition; Assassin selection, public identification, only-Assassin-fires, lockouts (15 s), win conditions, no leak of Survivor positions; TDM teams, ratio validation, Killer/Healer rules, `REQUEST_HEAL` (5 m, 25 HP, 5 s/target, interrupt on damage, no self-heal), team score.
- **B**: Mode-specific HUD (role badge, Assassin banner, team colors **plus** non-color indicator, Heal button + cooldown ring, team scoreboard), role reveal on start.
- **C**: Healing needs no aim evidence; C helps A with range checks using `geo.ts`, then starts the "poor-conditions" aiming hardening (sun glare, motion blur, low light) and `docs/testing.md` camera scenarios 1–12.
- ✅ **Exit (spec P6):** all three modes have distinct, correctly enforced rules.

### M7 — Pickups and remaining weapons (Phase 7)
- **A**: Ravager, Viper, pickups (weapon/health/shield), respawn rules, `REQUEST_PICKUP`, shield absorption (50 total), health packs (never revive), single-collect guarantee.
- **B**: Pickup markers on the minimap, collect UX (proximity prompt), weapon HUD variants.
- **C**: Aiming hardening continues; calibration numbers recorded.
- ✅ **Exit (spec P7):** pickup ownership and weapon behavior agree on all clients.

### M8 — Polish and demo (Phase 8)
- **A**: Reconnect restore verification, disconnect timeout, bot-driven soak test, optional Supabase result history, deploy server (wss), `docs/architecture.md`.
- **B**: HUD polish, error/permission messages, onboarding for new players, safety copy, deploy web (HTTPS), `README` quick-start.
- **C**: Camera error messages, final tolerance tuning, `docs/limitations.md` (aiming section).
- **All**: full run of all modes; fix critical bugs; rehearse the 10-step demo (CLAUDE.md §18) until repeatable; physical safety check (§15.5).
- ✅ **Exit (spec P8):** a new player joins and understands how to play without a developer explaining each screen.

---

## 8. Risk register

| Risk | Likelihood | Owner | Mitigation |
|---|---|---|---|
| Camera/orientation APIs differ across browsers (iOS needs `DeviceOrientationEvent.requestPermission()` inside a user gesture; Android may expose `deviceorientationabsolute`; compass heading can be relative or drift) | High | C | Feature-detect; spike in M0; calibrate; expose `headingSource`; fail safe (reject) when unknown |
| Marker detection fails outdoors (glare, motion blur, distance) | High | C | High-contrast, large-quiet-zone marker; screen brightness hint; limit range to what we measure; honest max range |
| GPS error of several metres makes agreement flaky | High | C + A | Tolerance grows with reported accuracy; short-range play areas; reject when uncertain; document |
| Camera needs HTTPS; phones can't reach localhost | Certain | A | Standardize on an HTTPS tunnel in M0 (D-08); document in README |
| Client lies about evidence | Certain | A | Server cross-check + rate limits; documented as a limitation, not claimed as anti-cheat |
| Hidden-info leak (Assassin sees Survivor positions) | Medium | A | Single `projectFor()`; contract test asserting absence of `position` fields |
| Race conditions: simultaneous shots, double elimination | Medium | A | Single-threaded match loop; process messages sequentially per match; idempotent elimination; tests |
| In-memory match lost on server restart | Medium | A | Documented; deploy as a single persistent process; don't deploy mid-demo |
| Players run while looking at phones / unsafe arenas | Medium | B | Safety copy at countdown, "put phone in safe position", host abort, arena preview warns about roads (CLAUDE.md §10.6) |
| Contract drift between A and B | Medium | all | Fixtures + parse tests in CI; `[contract]` PR rule |
| Time sink on polish before core works | High | all | Milestone order; PR reviews check "is core broken?" |

---

## 9. Testing split

- **A**: Vitest unit tests for every rule in CLAUDE.md §15.1 (firing interval, magazine, reload, damage, shield, healing, spawn lock, roles, pickups, boundary, elimination, win, duplicates). Integration tests using the bot client with ≥ 2 clients (§15.2), including: invalid shot never damages, simultaneous shots don't corrupt state, eliminated can't act, reconnect keeps reload state, **no hidden positions leak**, results agree across clients.
- **B**: Component/state tests for the session store (replace-on-STATE), time-offset math, and `Record<Reason,string>` coverage; fixture-driven screenshot/manual checklist per screen; real-phone checklist for permissions and HUD readability outdoors.
- **C**: `geo.ts` + `aim.ts` unit tests (deterministic). Camera scenarios 1–12 from CLAUDE.md §15.3 on real devices, results table in `docs/testing.md`.
- **Joint**: fixtures parse on both sides; weekly (or per milestone) full-team playtest on real phones.
- **Before opening a PR**: `npm run typecheck && npm test && npm run lint`.

---

## 10. Dev environment

- Ports: web `3000`, server `8080`.
- Env (server): `PORT`, `WEB_ORIGIN`, `PUBLIC_WS_URL`, `FANTOM_DEV_SIM` (`1` enables simulated location/aim), `SUPABASE_URL` + service key (server only, never in the web app).
- Env (web): `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`. **No secrets in the web env.**
- Phone testing: run web and server, expose each over an HTTPS/WSS tunnel (cloudflared or ngrok), set the two public URLs in env. Camera/orientation will not work on plain `http://<lan-ip>`.
- Never commit `.env*` files. Commit `.env.example`.

---

## 11. Open questions to settle in the M0 session

1. Names → paths: who is A, B, C? Fill the table in §1.
2. Package manager: npm workspaces (default) OK? (pnpm is fine if all agree — pick one.)
3. Tunnel tool: cloudflared vs ngrok.
4. Hosting targets for web and server (D-08 is a proposal).
5. Max players (contract says 12) and default match length (600 s).
6. Marker format (C proposes in M2: custom fiducial vs QR-like). Contract only needs `MarkerId` 0–4095; confirm 12 bits is enough.
7. Arena creation UX: polygon tapping vs "center + radius" preset first (B proposes; the contract already supports polygon, B may convert a circle to a 32-gon).
8. Do we want the optional Supabase result history at all? (D-06 says optional.)
9. Is TDM min-players = 2 teams × ≥ 1 Killer acceptable for demos, or do we require ≥ 4?

---

## 12. Using the agent prompts

`prompts/PROMPT-A-server.md`, `prompts/PROMPT-B-client.md`, `prompts/PROMPT-C-aiming.md` — each person pastes their own into their coding agent (Claude Code etc.) at the repo root. Every prompt tells the agent to read `CLAUDE.md`, this file, and `protocol.ts` first, to stay inside its owned paths, to inspect before changing, and to work in small verified increments.

If an agent wants to change something outside its lane (especially `protocol.ts`), it must **stop and tell its human**, who raises it with the team (§2.4).
