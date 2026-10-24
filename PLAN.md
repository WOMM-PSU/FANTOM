# FANTOM — Product Spec, Team Plan & API Contract

> **Single source of truth for the project.** Add this file to the initial git repo; there is no separate spec file.
>
> - **Part A — Product Specification** (sections **S1–S20**): *what* FANTOM is and how the game must behave.
> - **Part B — Team Plan & API Contract** (sections **P1–P9**, Appendices 1–3): *who* builds *which part*, *in what order*, and *what the interfaces between us are*.
>
> **Precedence:** if Part A and Part B conflict on game rules, Part A wins. If they conflict on protocol, ownership, or build order, Part B wins. Cross-references use `S` for Part A (e.g. S9.5) and `P` for Part B (e.g. P4.6).

## Contents

- **Part A:** S1 Overview · S2 Scope · S3 Stack · S4 Lifecycle · S5 Lobby · S6 Game modes · S7 Weapons · S8 Health/shields/pickups · S9 Hybrid camera aiming · S10 Arena & GPS · S11 Minimap & HUD · S12 Data model · S13 Networking · S14 Security · S15 Testing · S16 Workflow & standards · S17 Phases · S18 Demo · S19 Definition of done · S20 Principle
- **Part B:** P1 Team split · P2 Architecture decisions · P3 Repo layout · P4 The contract · P5 Seams · P6 Environment · P7 Milestones · P8 Working agreements · P9 Risks · Appendix 1 `protocol.ts` · Appendix 2 `constants.ts` · Appendix 3 fixtures

---

# PART A — Product Specification

> This part is the source of truth for **what** FANTOM is and how the game behaves. It is the former standalone spec, now merged into this file. Section numbers are prefixed **S** (e.g. S9.5) to distinguish them from Part B's **P** sections.
> Where an implementation detail is unspecified, choose the simplest reliable solution that fits the hackathon timeline and document significant decisions rather than adding complexity.

## S1. Project Overview

### S1.1 Vision
FANTOM turns ordinary smartphones into equipment for a real-world multiplayer laser-tag game. Players create or join a match, physically move around a defined play area, aim with their phone cameras, and shoot other eligible players. GPS gives approximate positioning; camera-based player identification and device orientation jointly decide whether a shot is valid. The game must feel immediately understandable to nontechnical players while delivering a compelling technical demo.

### S1.2 Team
Project **FANTOM** · Team **Works On My Machine** · Organization **WOMM-PSU** · GitHub https://github.com/WOMM-PSU

### S1.3 Core principles
1. **Phone-only** — no external sensors, wearables, or dedicated hardware.
2. **Multiplayer first** — joining and playing together must work reliably.
3. **Camera-assisted combat** — never rely exclusively on GPS or compass direction to determine hits.
4. **Server-authoritative state** — clients never directly decide damage, eliminations, ammo, or scores.
5. **Mobile-first** — usable on modern iOS and Android phones.
6. **Safety before immersion** — never encourage running while looking at the screen, or playing near roads, traffic, stairs, or other hazards.
7. **Hackathon scope** — a polished, demonstrable core beats many incomplete features.
8. **Graceful degradation** — if camera, GPS, or orientation data is unavailable or unreliable, fail safely and tell the player.

## S2. Product Scope

### S2.1 MVP features
- Create a match; join via QR code or short join code.
- Lobby: player list, host controls, settings, ready states.
- Configurable arena boundaries.
- Three modes: **Free For All**, **Assassin**, **Team Deathmatch**.
- Live player positions and a configurable minimap.
- Camera-based player marker detection; device-orientation and camera-aim agreement.
- Weapon firing, ammunition, automatic reloads, damage.
- Health, shields, elimination, match results.
- Out-of-bounds enforcement; basic reconnect handling.
- A usable mobile HUD and a clear match-end screen.

### S2.2 Deferred (do not prioritize until the core game is playable)
Accounts/permanent profiles; progression/XP/unlocks; cosmetics; global or public matchmaking; large-scale distributed servers; microservices; Redis/distributed cache; complex 3D environments; full AR world reconstruction; mandatory LiDAR/depth sensors; advanced AI scene understanding; sophisticated anti-cheat; kill streaks/seasonal rankings; payments. Optional features come only after the complete core loop works on real devices.

## S3. Technology Stack

TypeScript throughout the main application.

### S3.1 Frontend
Next.js, React, TypeScript, CSS Modules (or similar lightweight styling), browser camera / device-orientation / geolocation APIs, and a lightweight computer-vision library or custom marker detector. It is a **mobile-first web app** — no app-store install for the demo. Camera access generally requires HTTPS or localhost. Use feature detection; don't assume every browser exposes identical sensor APIs.

### S3.2 Backend
Node.js + TypeScript; a persistent WebSocket connection for gameplay; Supabase Postgres for durable data; Supabase Realtime only for lobby/noncritical shared updates. The game server is authoritative for all consequential changes. Prefer a dedicated WebSocket game-server process over database broadcasts as combat authority.

### S3.3 Deployment
Simplest setup that supports: HTTPS frontend, secure WebSockets, a reachable backend, environment-based config, and a persistent server process during matches. Active match state may live in memory provided each match is managed by one server process and reconnect behavior is documented. **Do not assume an in-memory match survives a server restart.**

### S3.4 Repository structure
See **P3**. Use a monorepo because it simplifies shared types.

## S4. Game Lifecycle

1. **Create** — host creates a match. 2. **Join** — others scan a QR code or enter a short code. 3. **Configure** — host picks mode, arena, duration, rules. 4. **Ready** — players confirm device permissions and setup. 5. **Countdown** — time to put phones in a safe playing position. 6. **Start** — server initializes roles, weapons, health, timers, spawn protection. 7. **Play** — server processes validated actions and broadcasts state. 8. **End** — server determines winner/winning team. 9. **Results** — winners, eliminations, assists (if implemented), stats.

The server controls the phase; clients never independently start or end a match. Phases: `lobby → countdown → active → finished`. Use explicit transitions and reject actions invalid for the current phase.

## S5. Lobby and Match Configuration

### S5.1 Joining
- Short, human-readable join code; QR code containing the join URL; player-set display name; no accounts required.
- Unique session identity per player; prevent duplicate active identities from corrupting match state.
- Validate all join requests on the server.
- Use unguessable session credentials where needed. **A match code is for discovery, not authorization.**

### S5.2 Host controls
Host selects game mode, match duration, arena, minimap configuration, available pickups, and weapon drops (where supported), and starts the match when the lobby is valid. The server validates the final configuration; never trust arbitrary client-supplied settings.

### S5.3 Ready checks
Before starting, check: the player has joined; accepted required permissions; the device can access features the chosen mode needs; the player has the latest configuration. If camera or sensor access fails, explain the issue and provide a retry path. **Never silently pretend aiming is functioning.**

## S6. Game Modes

### S6.1 Free For All
Every player competes independently.
- Players begin **without** a weapon; weapon pickups are the primary way to acquire one.
- Configurable spawn lockout, **default 5 s**; picking up a weapon does not bypass it.
- Individual health and elimination state; winner by configured scoring/end rules.

Configurable: duration; arena size/boundary; minimap on/off and visibility options; player marker visibility; weapon/health/shield pickup availability; weapon-drop frequency; pickup respawn behavior. Possible minimap layers (subject to the mode's rules): teammates/players where permitted, weapon/health/shield drops, arena boundary. **Do not expose live enemy positions by default** in modes where locating enemies is part of the challenge.

Win conditions (configurable, clear): highest score at timer expiry, or last player standing (survival). For the MVP prefer **one well-tested scoring rule**.

### S6.2 Assassin
One player is the Assassin; all others are Survivors.
- The server selects the Assassin, who is **identified to all players**.
- **Only the Assassin can use a weapon**; Survivors cannot fire. Weapon drops are disabled.
- Survivors try to survive until the timer expires; the Assassin tries to eliminate every Survivor.
- Spawn protection: Assassin has a **default 15 s lockout**; Survivors get the same head start. The server enforces it regardless of client state.
- Minimap may be on/off; if on, it must **not reveal live Survivor positions to the Assassin** by default. Any special tracking rule must be explicit in match settings. Do not leak hidden positions through network messages or UI components.
- Win: Assassin wins if all Survivors are eliminated; Survivors win if the timer expires with at least one alive. If all players disconnect or the match becomes invalid, handle it explicitly rather than awarding an arbitrary winner.
- The server owns role assignment and win evaluation.

### S6.3 Team Deathmatch
Players are assigned to teams; each team has Killers and Healers.

**Killers:** can use weapons and damage opposing players; cannot heal or use healing actions; start with **Pulse**; optional weapon drops if the host enables them.

**Healers:** cannot carry or fire guns; can heal Killers and other Healers on their own team; **cannot heal themselves**; healing is range-limited and subject to cooldowns and interruption.

**Team composition:** host configures the Killer-to-Healer ratio; each team must contain at least one Killer; invalid compositions are rejected before start; the server assigns and validates roles.

**Initial healing balance (provisional, must be play-tested):** range **5 m**; **25 health** per heal; **5 s cooldown per target**; healing is **interrupted if the healer takes damage**; cannot exceed target's max health; cannot heal targets outside permitted team/role rules.

**Win:** team score (MVP: eliminations). When the timer expires the higher-scoring team wins; define ties explicitly (e.g. a draw). The server evaluates scores and all role restrictions.

## S7. Weapons and Combat Balance

| Property | Pulse | Ravager | Viper |
|---|---:|---:|---:|
| Damage per hit | 25 | 50 | 10 |
| Magazine size | 12 | 4 | 30 |
| Time between shots | 500 ms | 1,200 ms | 150 ms |
| Automatic reload duration | 1,200 ms | 2,000 ms | 2,500 ms |
| Intended role | Balanced | Heavy damage | Rapid fire |

Initial balance values, not final. Keep them in shared configuration, not scattered magic numbers.

- **S7.1 Pulse** — balanced damage, moderate fire rate, medium magazine, reliable default.
- **S7.2 Ravager** — high damage, small magazine, slow fire, long reload.
- **S7.3 Viper** — low damage, high fire rate, large magazine, long reload.

### S7.4 Firing rules
- Client sends a fire request. Server checks: player alive and eligible; spawn protection; role; weapon ownership; ammunition; reload status; shot cooldown; the proposed target and any aiming evidence.
- Only a valid shot consumes ammo and applies damage; invalid shots never cause damage; the server broadcasts the result.
- **A client-side button press is not proof of a valid hit.**

### S7.5 Automatic reload
No manual reload button. When a magazine empties: the server starts that weapon's reload timer; the weapon can't fire while reloading; the server restores the magazine on completion; the client displays progress; **the client never refills ammo itself**. If weapon switching during reload is supported, each weapon keeps its own reload state and switching must not cancel or accelerate it. **MVP: one carried weapon per player in FFA.**

### S7.6 Timing
Use server-side timestamps and monotonic timing. Never trust client clocks for cooldowns, reload completion, or damage timing. The firing interval is the minimum time between valid shots, not network latency.

## S8. Health, Shields, Pickups, Elimination

### S8.1 Health
Default max **100**. Cannot exceed max or fall below zero. Damage is applied by the server. Zero health ⇒ elimination per explicit rules.

### S8.2 Shield
A shield pickup grants up to **50** shield points; shield absorbs damage before health; cannot exceed its max; absorption is server-calculated and identical for all players. Enforce the **50-total-damage** cap per pickup rather than an indefinitely reusable effect.

### S8.3 Health pack
Restores 25 health; cannot exceed max; cannot revive eliminated players. May be enabled in FFA; **disabled in Assassin and Team Deathmatch** initially unless explicitly configured.

### S8.4 Weapon cache
Grants an available weapon; eligibility validated by the server; cannot be collected more than once; spawn/respawn is server-controlled; pickup state is broadcast to all relevant clients.

### S8.5 Elimination
On elimination: health = 0; status = eliminated; remove ability to shoot, heal, collect pickups, or deal damage; update score and team state; notify relevant players; check win condition. **Prevent duplicate elimination processing** when events arrive close together.

## S9. Hybrid Camera Aiming System

This is one of FANTOM's defining technical features.

> **GPS determines approximate position. Device orientation estimates aiming direction. The camera identifies the visible player marker. A shot is accepted only when the aiming evidence agrees and the target is valid.**

Do not claim this guarantees perfect physical line-of-sight; it is an approximation that must be tested on real devices.

### S9.1 The problem
GPS alone is too imprecise to say who is aimed at; compass/orientation drifts and GPS can be several meters off. Camera-only targeting is insufficient too: a visible object may not be a player; a player may be occluded; a marker may be misdetected; apparent size varies with distance; camera and orientation can disagree; phones differ. FANTOM combines signals to reduce false hits.

### S9.2 Player markers
- Each active player displays a distinctive, high-contrast marker encoding a short-lived or match-specific identifier, in a form the camera can detect reliably (custom fiducial, QR-like visual code designed for fast detection, or compact high-contrast marker with robust ID).
- **Do not use generic object detection to establish player identity.**
- A marker must map to an active player in the current match; markers of eliminated players or other matches are never valid targets.
- **No session credentials or authorization tokens in a visible marker.**

### S9.3 Sensor A: device orientation
Estimate pointing direction. Request permission where required; calibrate and explain how to hold the device; account for device-specific conventions; normalize angles and handle wraparound; smooth noise without excessive lag; detect unavailable/unreliable data. **Compass heading and camera optical direction are not interchangeable** — calibrate their frames.

### S9.4 Sensor B: camera marker detection
Pipeline: acquire frames → detect candidate markers → decode identity → find bounding box/center → compute angular position relative to the optical axis → estimate confidence and tracking stability → reject stale, ambiguous, or invalid detections. The marker must be close enough to the reticle for the camera-aiming condition to pass. **Never transmit continuous camera video to the server**: process locally and send only minimal validated aiming evidence.

### S9.5 Aim agreement
A shot is eligible only when camera and orientation signals agree within a calibrated, **configurable** tolerance (never hardcode an arbitrary angle and assume it works on every phone).

```text
orientation direction ─────┐
                           ├── aim agreement ──┐
camera marker direction ───┘                   │
                                               ├── shot eligibility
marker identity and confidence ────────────────┤
range and target validity ─────────────────────┤
occlusion checks, when available ──────────────┘
```

Reject a shot if: orientation data is missing/too noisy; the camera has no valid target marker; target identity is ambiguous; camera and orientation disagree beyond tolerance; the target is too far; the target isn't eligible for damage; the target is eliminated or protected; the evidence is too old.

### S9.6 Target distance
GPS distance error can be significant at short range. If the marker's physical width is known, apparent size gives an approximate camera-based estimate under suitable calibration:

```text
distance ≈ focal_length_in_pixels × physical_marker_width ÷ observed_marker_width_in_pixels
```

Valid only when camera parameters and marker size are known well enough. Do not infer a detected object is a player from size alone. Combine: approximate GPS distance, calibrated camera distance (if any), marker confidence, configured max range, target identity, orientation agreement. **If range evidence is contradictory or too uncertain, reject the shot.** Max range is configurable and play-tested, not assumed from GPS alone.

### S9.7 Occlusion
Example: A aims at C; non-player B stands between and hides C's marker. A must not damage C merely because the compass points at C's approximate direction. For the MVP: require a valid visible target marker; reject if it is occluded or not confidently detected; don't try to recognize every person; marker visibility is the basic line-of-sight condition. Optional depth/foreground checks may help where supported but **must not require LiDAR or platform-specific hardware**. If foreground obstruction can't be distinguished reliably, prefer rejecting the shot over guessing.

### S9.8 Camera permissions and lifecycle
Request camera only when needed and explain why; stop camera tracks when leaving the aiming view or ending a match; handle denial and init errors; don't keep the camera active in the background unnecessarily; clearly indicate when aiming is unavailable; never collect or store camera footage.

### S9.9 Client and server responsibilities
**Client:** camera access; local marker detection; sensor calibration; local aiming feedback; producing a target candidate plus evidence; reticle and target feedback.
**Server:** player/target eligibility; weapon and ammo rules; spawn protection; shot cooldown; match phase; max-range checks from available position data; health/shield math; final accept/reject; damage and elimination.

A client can lie about camera detections, so client-reported evidence is **not cryptographic proof of a real-world hit**. Implement basic validation and rate limits, **document this limitation**, and do not claim robust anti-cheat from client-side computer vision. For a hackathon MVP, a well-designed client aiming pipeline plus authoritative server rules is acceptable.

## S10. Arena and GPS Boundaries

### S10.1 Arena definition
The server maintains an arena boundary as a geographic polygon (or other explicit representation), converting to a local coordinate system when convenient. Never use screen pixels as authoritative physical coordinates.

### S10.2 GPS updates
Clients periodically submit location + accuracy. The server validates coordinate ranges; rejects malformed data; rejects implausible movement or update rates; tracks age and accuracy; doesn't treat stale coordinates as current; applies boundary hysteresis. Client location is not tamper-proof.

### S10.3 Boundary states
`alive | out_of_zone | eliminated` — a player may be alive but temporarily outside the arena.

### S10.4 Outside-arena rules
When a player is **confirmed** outside: interface turns gray/warning; cannot shoot; **cannot be damaged by other players**; cannot heal; cannot collect pickups; health drains **10 HP/s**; at zero they are eliminated normally.
On return inside: **1 s grace period**, then normal combat eligibility. All applied by the server.

### S10.5 GPS uncertainty
No rapid inside/outside flapping: configurable boundary margin; consistent evidence before confirming an exit; track reported accuracy; short confirmation window; if accuracy is too poor, **pause boundary-based combat decisions** for that player rather than applying arbitrary damage, and tell the player location quality prevents reliable play. The drain starts only after a confirmed exit, never on one noisy coordinate.

### S10.6 Safe arena setup
Encourage play in an open, designated area away from roads and traffic; avoid dangerous locations; make boundaries visible before the match; give a clear warning before starting; never encourage running while staring at the phone; provide a safe way to stop or leave a match. For indoor demos where GPS is unreliable, use a **clearly labeled** development simulation or manually controlled test positions — never silently substitute fake location data in production.

## S11. Minimap and HUD

### S11.1 Minimap
Compact and phone-usable. May show: arena boundary, local player, teammates where permitted, enemies only when the mode allows, pickups when enabled. Visibility and layers are configurable where the mode supports it. It is informational — it must not override camera aiming or server validation.

### S11.2 Main aiming view
Prioritize: camera preview; central reticle; target-detection state; weapon name; ammo; reload progress; health and shield; spawn-protection timer; arena status; shoot control. Don't cover the whole camera view with UI.

### S11.3 Visual feedback
Normal: restrained blue accents · Taking damage: brief red flash or directional indicator · Out of bounds: gray interface + clear warning · Reloading: visible progress, firing disabled · Invalid aim: subtle explanation · Valid target: distinct target feedback · Eliminated: clear end-of-life state. **Do not show a confirmed hit until the server confirms it.**

### S11.4 Accessibility and usability
Large touch-friendly controls; status text readable outdoors; color never the only indicator; controls away from accidental touches; minimal unnecessary animation; a safe, obvious **leave-match** action; no complicated controls while moving.

## S12. Server-Side Data Model

Shared wire types live in the contract (**P4**, Appendices 1–2). The server's internal player record starts from this (adjust as needed; keep location fields named `lat`/`lng`, never disguised as `x`/`y`):

```ts
type Player = {
  id: string; displayName: string; teamId: string | null;
  role: "killer" | "healer" | "assassin" | "survivor" | null;
  status: "alive" | "out_of_zone" | "eliminated";
  health: number; maxHealth: number; shield: number;
  weaponId: string | null; ammo: number;
  nextShotAt: number; reloadCompleteAt: number | null; spawnLockedUntil: number;
  lat: number | null; lng: number | null; lastLocationAt: number | null;
};
```

Minimum entities: Match, Player, Team, Weapon definition, Pickup, Shot request, Shot result, Match result. Weapon definitions are configuration (`id, name, damage, magazineSize, fireIntervalMs, reloadDurationMs`) in shared constants — never duplicated in frontend components.

**Validation:** validate network payloads at runtime (TypeScript types don't validate JSON). Reject: missing required fields, invalid player/target IDs, unknown weapons, invalid coordinates, impossible state transitions, excessive payload sizes, malformed or stale requests.

## S13. Networking and Server Authority

### S13.1 General rules
The server is the source of truth. Clients may *request* actions but cannot directly set: health, shield, ammunition, weapon ownership, reload completion, cooldowns, elimination status, match score, match winner, team role, pickup availability.

### S13.2 Messages
Client→server (conceptual): `JOIN_MATCH, LEAVE_MATCH, PLAYER_READY, UPDATE_LOCATION, REQUEST_SHOT, REQUEST_HEAL, REQUEST_PICKUP, REQUEST_MATCH_START`.
Server→client (conceptual): `LOBBY_STATE, MATCH_STARTED, PLAYER_UPDATED, PICKUP_UPDATED, SHOT_ACCEPTED, SHOT_REJECTED, PLAYER_DAMAGED, PLAYER_ELIMINATED, HEAL_APPLIED, MATCH_STATE, MATCH_FINISHED, ERROR`.
The concrete schemas are in **P4 / Appendix 1**. **Never accept a client message that directly declares another player has been hit.**

### S13.3 Shot requests
Include only what's needed: shooter identity (derived from the authenticated connection where possible — don't trust a client-supplied shooter ID), proposed target identity, request identifier, aiming evidence, and a client timestamp **for diagnostics only**. The server determines the actual firing time.

### S13.4 Rate limits and idempotency
Rate-limit high-frequency messages; apply the weapon's server-side interval; prevent repeated processing of the same request; avoid duplicate damage from retries; reject actions from disconnected or eliminated players; bound message sizes.

### S13.5 Reconnection
A brief connectivity loss must not create a second identity. Reconnect with a session credential; restore current server state; don't trust a stale client snapshot; apply a documented timeout policy; disconnected players can't fire or heal. No elaborate persistence for active matches unless required.

## S14. Security and Privacy

Required safeguards: HTTPS and secure WebSockets in deployed environments; secrets stay on the server; never expose service-role keys in frontend code; validate every game-changing action; validate match membership and roles; rate-limit requests; don't expose hidden enemy positions; **don't store camera footage**; request location/camera permissions only when needed and explain why; collect no unnecessary personal information; expire temporary match credentials; sanitize display names before rendering; **no private session credentials in public QR codes or visible markers**. FANTOM is a casual game, not a safety-critical positioning system: never claim GPS or camera validation prevents cheating or guarantees real-world distances.

## S15. Testing Strategy

Test game rules independently from the UI.

### S15.1 Unit tests
Firing intervals; magazine depletion; automatic reload; weapon switching during reload (if supported); damage; shield absorption; healing limits, cooldowns, interruption; spawn protection; role restrictions; pickup availability; out-of-bounds transitions; elimination; match-end conditions; score calculation; duplicate event prevention.

### S15.2 Multiplayer integration tests
At least two clients in one match. Verify: same lobby; host starts the match; state updates reach all clients; a valid shot changes target health; an invalid shot doesn't; two simultaneous shots don't corrupt health or score; eliminated players can't act; reload state is consistent after reconnect; hidden positions aren't sent to unauthorized players; match results agree across clients.

### S15.3 Camera-aiming tests (on actual devices, not just desktop)
1. A aims directly at B and B's marker is visible. 2. A aims away from B while B stays in camera view. 3. Camera aim and orientation disagree. 4. Marker too small or too far. 5. Two markers visible. 6. Marker of an eliminated player. 7. A non-player crosses in front of the target. 8. Target marker partially occluded. 9. Camera permission denied. 10. Orientation permission denied/unavailable. 11. Device orientation changes abruptly. 12. Sensor readings stale or noisy.
**Desired behavior for ambiguous cases: reject the shot.**

### S15.4 GPS tests
Normal updates; stale data; poor accuracy; boundary jitter; confirmed exit; return inside; permission denial; impossible jumps; temporary loss. Use deterministic simulated positions in automated tests, kept clearly separate from production behavior.

### S15.5 Physical safety tests
Before a live demo: choose a safe open area; make boundaries clear; tell players not to run while looking at phones; keep away from traffic and hazards; provide an immediate way to stop the match; verify players can safely look away from devices while moving.

## S16. Engineering Workflow and Standards

Applies to every developer **and every coding agent**.

Before implementing a feature: inspect the current repository; read this document; identify what already works; reuse existing components and abstractions; make the smallest complete change; run relevant tests and type checks; fix regressions before moving on; update docs when behavior or architecture changes. **Don't rewrite working code merely to match a preferred architecture.**

Coding standards: TypeScript for app and server; explicit types at system boundaries; shared game rules in reusable modules; validate untrusted data at runtime; small focused components (no large monoliths); minimal dependencies; no duplicated constants; no abstraction without a concrete use; clear names for states and events; handle errors explicitly; never silently ignore failed permission requests or network operations; **no fake functionality to make a demo appear complete**.

Agent rules: treat this document as the specification; inspect existing code before proposing structural changes; implement real functionality, not UI-only placeholders; **don't claim a feature works without verifying it; don't invent test results**; don't replace server validation with client checks; don't add dependencies without a clear reason; don't build optional features while core gameplay is broken; when a requirement is ambiguous choose the smallest safe interpretation and document it; when changing a game rule update server logic, shared types, client feedback, and tests together; report limitations honestly (camera aiming, GPS precision, browser compatibility, anti-cheat); keep the README aligned with the implementation.

## S17. Implementation Phases (exit conditions)

Build in this order; don't try to implement everything at once. Part B milestones (P7) schedule these across three developers.

| Phase | Scope | Exit condition | Milestone |
|---|---|---|---|
| 1 Foundation | repo/app structure, shared types + protocol, WebSocket, create/join, lobby state | Two devices join the same lobby and see consistent player lists | M0–M1 |
| 2 Match lifecycle | host settings, ready, countdown, server-controlled start/end, results | Full lobby-to-results lifecycle without manual server intervention | M2 |
| 3 Positioning & arena | geolocation, location updates, minimap, arena config, freshness/accuracy validation, safe out-of-bounds | Players see approximate positions; server correctly handles a confirmed boundary exit | M2 |
| 4 Combat | health, elimination, Pulse, ammo + auto-reload, server fire intervals, spawn protection, shot validation, combat feedback | A controlled test yields valid damage, rejected shots, reloads, eliminations consistently | M3 |
| 5 Camera aiming | visible marker, detect/decode, marker→participant mapping, camera/orientation calibration, aim agreement, reject ambiguous/occluded, ≥2 real devices | A valid target is identified and aimed at while clearly invalid targeting is rejected | M4 |
| 6 Game modes | FFA, Assassin, Team Deathmatch, Killer/Healer rules, team scoring | All three modes have distinct, correctly enforced rules | M5 |
| 7 Pickups & weapons | Ravager, Viper, weapon/health/shield pickups, respawn | Pickup ownership and weapon behavior consistent across clients | M6 |
| 8 Polish & demo | HUD, permission/sensor errors, reconnect, all-modes test, bug fixing, known limitations, repeatable demo | A new player can join and play without a developer explaining each screen | M7 |

If full sensor fusion proves unreliable within the hackathon, retain the working game loop and clearly label any development-only fallback. **Never present simulated aiming as real camera-based aiming.**

## S18. Hackathon Demo Plan

The demo must prove FANTOM is a playable game, not a mockup. 1) Open on multiple phones. 2) Create a match and join by QR. 3) Configure the mode and start the countdown. 4) Show the live minimap and arena. 5) Demonstrate camera marker detection. 6) Aim at a valid player and show the hit. 7) Demonstrate a rejected shot (misaligned or occluded marker). 8) Show damage, ammo depletion, automatic reload. 9) Demonstrate a mode-specific mechanic (e.g. a Healer restoring a teammate). 10) Finish the match and show results. Prefer a repeatable demo with 2–3 phones over a larger unreliable match. If GPS is unreliable, use a documented demo setup and never misrepresent simulated data as live GPS.

## S19. Definition of Done (MVP)

A host can create a match · players join by QR or short code · lobby state is synchronized · a match starts and ends correctly · the three modes have distinct rules · the server controls damage, health, ammo, cooldowns, elimination · automatic reload works · camera marker detection identifies a player · camera direction and device orientation must agree within the configured tolerance · ambiguous targeting is rejected · GPS boundaries use accuracy checks and hysteresis · poor sensor data fails safely · the HUD is usable on real phones · critical multiplayer and game-rule tests pass · permissions, privacy, and physical safety are handled explicitly · known limitations are documented · the demo repeats without depending on luck.

## S20. Final Engineering Principle

FANTOM's differentiator is not the number of features. It is the combination of a working multiplayer game, real-world positioning, and camera-assisted targeting on ordinary phones. Build the smallest version that demonstrates that combination convincingly.

**Reliable core gameplay first. Camera aiming second. Three complete game modes third. Visual polish and optional features last.**

---

# PART B — Team Plan & API Contract

## P1. How we split the work

We split along the **network boundary**, and we carve the hardest client problem (camera aiming) into its own track so it never blocks lobby/HUD work.

| Track | Dev | Owns | Never edits |
|---|---|---|---|
| **A — Server & Rules** | Dev A | `apps/server/**`, `tools/sim-client/**` | `apps/web/**`, `packages/aiming/**` (except by PR) |
| **B — Client App & UX** | Dev B | `apps/web/**` (everything except `features/aiming`), `tools/mock-server/**` | `apps/server/**`, `packages/aiming/**`, `apps/web/features/aiming/**` |
| **C — Aiming, Sensors & Platform** | Dev C | `packages/aiming/**`, `apps/web/features/aiming/**`, CI, dev tunnel, `docs/testing.md`, `docs/aiming-decisions.md`, `fixtures/**` | `apps/server/**`, rest of `apps/web/**` |
| **Shared contract** | all | `packages/shared/**` | nobody edits alone — see P4.1 |

How the tracks connect (only these three seams exist):

```text
        ┌──────────────── packages/shared  (CONTRACT: zod schemas, types, constants, fixtures) ───────────────┐
        │                                                                                                    │
  Dev A: apps/server  ◄── WebSocket + HTTP, defined entirely by the contract ──►  Dev B: apps/web (app shell, lobby, HUD, minimap)
        │                                                                                │
        │  imports evaluateAim() + geo helpers                       imports <AimView>, <PlayerMarker>, useAiming()
        └────────────────────────►  Dev C: packages/aiming + apps/web/features/aiming  ◄─┘
```

**Seam 1 (A↔B):** the wire contract in P4 + JSON fixtures. B builds against `tools/mock-server` (replays fixtures) until A's real server is ready; A tests against `tools/sim-client` (headless bots) without waiting for any UI.
**Seam 2 (A↔C):** `evaluateAim()` and geo helpers from `packages/aiming` — pure TypeScript, no DOM, used by the server to validate shots and by the client for local feedback. Same code on both sides means no drift.
**Seam 3 (B↔C):** three exports from `apps/web/features/aiming` (P5.3). B treats aiming as a black box.

---

## P2. Architecture decisions (clarifications and deviations from Part A)

Record new decisions here via PR. Current ones:

1. **pnpm workspaces**, TypeScript everywhere, **zod** for runtime validation (contract source of truth), **vitest** for tests, `ws` for the WebSocket server.
2. **Create/join over HTTP, play over WebSocket.** HTTP returns a `sessionToken`; the WebSocket's first message authenticates with it. Session tokens never appear in URLs, QR codes, or markers.
3. **Single snapshot message (`MATCH_STATE`)** per recipient, sent on every meaningful change (throttled ≤10 Hz). It replaces the spec's conceptual `LOBBY_STATE` / `MATCH_STARTED` / `PLAYER_UPDATED` / `PICKUP_UPDATED`. Event messages (`SHOT_*`, `PLAYER_DAMAGED`, …) exist only to drive UI feedback; **clients treat `MATCH_STATE` as truth.**
4. **Per-recipient views.** The server builds each player's snapshot separately so hidden positions and other players' marker codes are never in the payload.
5. **Marker identity = server-issued `markerCode`** (integer 0–255, unique per match, not a credential). A shot names its target by the marker code the camera decoded; the server resolves it to a player.
6. **No database in M0–M6.** Active matches live in server memory (one process per match set, restart loses matches — documented). Supabase is optional in M7 (persist match results only).
7. **Location fields are named `lat`/`lng`** (never `x`/`y`). The server converts to local meters internally.
8. **MVP arena input:** host taps "use my location" and picks a radius; the client sends a 24-sided polygon. Free-form polygon drawing is post-MVP. The contract already carries a polygon, so nothing changes later.
9. **Dev-only shortcuts** (simulated aim evidence, simulated GPS) are allowed **only** behind `config.devMode === true`, must be labeled `DEV_ONLY` in code and UI, and are never counted toward a milestone exit. (S9.9, S10.6, S17.)
10. **Healing** takes aim evidence optionally; the MVP server enforces healing via GPS range (5 m) and role/team rules only. Flagged as a risk (GPS error ≈ the heal range).

---

## P3. Repository layout & ownership

```text
fantom/
├── PLAN.md                    # product spec (Part A) + team plan & contract (Part B)
├── README.md
├── package.json               # pnpm workspace root, scripts: dev, typecheck, test, lint, dev:tunnel
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .github/
│   ├── CODEOWNERS
│   └── workflows/ci.yml                         # C
├── apps/
│   ├── server/                                  # A
│   │   └── src/{index.ts,http/,networking/,lobby/,game/,validation/}
│   └── web/                                     # B (aiming feature: C)
│       ├── app/                                 # routes: /, /join/[code], /match/[id]
│       ├── components/
│       ├── features/{lobby,match,hud,minimap,results}/   # B
│       ├── features/aiming/                     # C   (AimView, PlayerMarker, useAiming)
│       ├── hooks/                               # B   (useGameSocket, useGeolocation, useServerClock)
│       └── lib/
├── packages/
│   ├── shared/                                  # CONTRACT (see P4)
│   │   ├── src/{protocol.ts,constants.ts,index.ts}
│   │   ├── fixtures/{client,server,http}/*.json # one example per message type
│   │   └── test/contract.test.ts                # every fixture must parse
│   └── aiming/                                  # C — pure TS, no DOM in src/core
│       └── src/{core/evaluateAim.ts,core/geo.ts,core/angles.ts,marker/,index.ts}
├── tools/
│   ├── mock-server/                             # B — replays fixtures over WS for UI dev
│   └── sim-client/                              # A — headless bot clients for server tests
└── docs/
    ├── architecture.md                          # A (server) + B (client) sections
    ├── testing.md                               # C — device matrix + results (honest)
    ├── aiming-decisions.md                      # C
    ├── STATUS.md                                # everyone — see P8
    └── prompts/{dev-a-server,dev-b-client,dev-c-aiming}.md
```

`CODEOWNERS` (replace handles):

```text
/apps/server/                      @dev-a
/tools/sim-client/                 @dev-a
/apps/web/                         @dev-b
/tools/mock-server/                @dev-b
/apps/web/features/aiming/         @dev-c
/packages/aiming/                  @dev-c
/fixtures/ /.github/ /docs/testing.md /docs/aiming-decisions.md   @dev-c
/packages/shared/                  @dev-a @dev-b @dev-c
```

---

## P4. The contract

**Source of truth:** `packages/shared/src/protocol.ts` (zod schemas → inferred TS types) and `constants.ts`. Appendices 1 and 2 below are the **v0.1 starting source**; Milestone M0 commits them, makes them compile, and tags `contract-v0.1`.

### P4.1 Contract rules (read before touching anything)

1. Both sides import types **only** from `@fantom/shared`. No hand-copied types, no duplicated constants (weapon numbers, ranges, timings live in `constants.ts`).
2. Every inbound network payload is parsed with the zod schema on the receiving side. TypeScript types alone are not validation.
3. **Changing the contract = a PR that touches `packages/shared/**`, labeled `contract`, which must:** update the schema, update/add fixtures, pass `contract.test.ts`, add a line to `packages/shared/CHANGELOG.md`, and get **approval from the other two devs**. The author does not self-merge.
4. **Additive/optional changes** (new optional field, new message type, new enum member the receiver can ignore) keep `PROTOCOL_VERSION`. **Breaking changes** bump it; avoid them after M2.
5. **Agents may not edit the contract on their own initiative.** If you need a change, write it up (what, why, proposed schema) in your PR description or `docs/STATUS.md` and ask the human to coordinate.
6. Unknown message types or malformed payloads are rejected with an `ERROR` (never crash, never partially apply).
7. Every server-to-client message and every client-to-server message type has a fixture; `tools/mock-server` and the server tests both consume them.

### P4.2 HTTP API (server, JSON)

Base URL from `NEXT_PUBLIC_API_URL`. All bodies validated; errors are `{ "error": { "code": ErrorCode, "message": string } }`.

| Method & path | Request | Response | Notes |
|---|---|---|---|
| `GET /health` | — | `{ ok: true, protocolVersion }` | |
| `POST /api/matches` | `CreateMatchRequest` | `JoinResponse` (201) | Creator becomes host. Config defaults from `DEFAULT_MATCH_CONFIG`. |
| `GET /api/matches/:code` | — | `MatchSummary` | Public, minimal info only. `404 MATCH_NOT_FOUND`. |
| `POST /api/matches/:code/join` | `JoinRequest` | `JoinResponse` | `409 LOBBY_FULL`, `409 WRONG_PHASE` if not in lobby. |

Join code: 5 characters from an unambiguous alphabet (no `0/O/1/I/L`), case-insensitive on input. `joinUrl = ${WEB_BASE_URL}/join/${code}` (this is what the QR encodes — **never** a token).

### P4.3 WebSocket protocol

- Endpoint: `${NEXT_PUBLIC_WS_URL}` (single path, e.g. `/ws`). `wss://` in any deployed/tunneled environment.
- **Handshake:** client connects, sends `HELLO { sessionToken }` as its first message within 5 s. Server replies `WELCOME` (with full `MatchState`) or `ERROR UNAUTHENTICATED` and closes. Any other first message → close.
- **Envelopes**
  - Client → server: `{ v: 1, id: <uuid>, type, payload }`
  - Server → client: `{ v: 1, seq: <int, per-connection, increasing>, serverTime: <epoch ms>, replyTo?: <client id>, type, payload }`
- **Idempotency:** the server remembers recent client `id`s (last 256 per player) and ignores repeats (re-sending the prior result for shots instead of re-applying damage).
- **Clock:** client sends `PING` every 5 s; `PONG` carries server time. Client keeps `serverClockOffsetMs` (smoothed) and renders all server timestamps (`nextShotAt`, `reloadCompleteAt`, `spawnLockedUntil`, `endsAt`) through it.
- **Reconnect:** the client keeps `{ sessionToken, joinCode }` in `sessionStorage` and re-sends `HELLO` with the same token. The server rebinds the player to the new socket, closes the old one with code `4001`, and replies with a fresh `WELCOME`. A disconnected player is `connected: false`, cannot fire/heal/pickup, and is dropped after `DISCONNECT_TIMEOUT_MS` (30 s) in lobby, kept (non-acting) during an active match until it ends. Clients never reuse a stale local snapshot after reconnect.
- **Limits:** max message 8 KB; ≤30 msgs/s per connection; `UPDATE_LOCATION` accepted ≤2/s; `REQUEST_SHOT` ≤10/s (the weapon's interval is the real limiter). Excess → `ERROR RATE_LIMITED`.

### P4.4 Message catalogue

**Client → server**

| Type | Payload | Who | Valid phases |
|---|---|---|---|
| `HELLO` | `{ sessionToken }` | any | any |
| `PING` | `{ clientSentAt }` | any | any |
| `LEAVE_MATCH` | `{}` | any | any |
| `UPDATE_CONFIG` | `{ config: Partial<MatchConfig> }` (section-level patch) | host | lobby |
| `PLAYER_READY` | `{ ready, permissions: { camera, orientation, location } }` | any | lobby |
| `REQUEST_MATCH_START` | `{}` | host | lobby |
| `UPDATE_LOCATION` | `{ position: LatLng, accuracyM, clientTimestamp }` | any | lobby, countdown, active |
| `REQUEST_SHOT` | `{ evidence: AimEvidence }` (target = `evidence.targetMarkerCode`) | any | active |
| `REQUEST_HEAL` | `{ targetMarkerCode, evidence?: AimEvidence }` | healer | active |
| `REQUEST_PICKUP` | `{ pickupId }` | any | active |

**Server → client**

| Type | Payload | Recipients |
|---|---|---|
| `WELCOME` | `{ playerId, protocolVersion, state: MatchState }` | the connecting player |
| `MATCH_STATE` | `MatchState` (per-recipient view) | every player |
| `PONG` | `{ clientSentAt }` (+ envelope `serverTime`) | requester |
| `SHOT_ACCEPTED` | `{ targetPlayerId, damageDealt, eliminated }` | shooter |
| `SHOT_REJECTED` | `{ reason: RejectReason }` | shooter |
| `PLAYER_DAMAGED` | `{ attackerId \| null, damage, source: "shot" \| "out_of_zone" }` | victim only |
| `PLAYER_ELIMINATED` | `{ playerId, byPlayerId \| null, cause }` | all |
| `HEAL_APPLIED` | `{ healerId, targetId, amount }` | healer + target |
| `HEAL_REJECTED` | `{ reason: RejectReason }` | healer |
| `PICKUP_COLLECTED` | `{ pickupId, byPlayerId, kind }` | all |
| `PICKUP_REJECTED` | `{ reason: RejectReason }` | requester |
| `MATCH_FINISHED` | `{ result: MatchResult }` | all |
| `ERROR` | `{ code: ErrorCode, message }` | requester |

### P4.5 State views and visibility (server filters; client never guesses)

`MatchState` = `{ matchId, joinCode, phase, hostPlayerId, config, players: PlayerPublic[], self: SelfView, pickups: PickupView[], teamScores, countdownEndsAt, startedAt, endsAt, result }`.

| Rule | Behaviour |
|---|---|
| Enemy positions | `PlayerPublic.position` is `null` unless the mode + `config.minimap` explicitly allows this viewer to see that player. Default: never for enemies. |
| Assassin mode | Assassin's identity (`role: "assassin"`) is visible to all. **Survivor positions are never sent to the Assassin** by default. |
| Team Deathmatch | Teammates' positions visible when `minimap.showAllies`; enemies never by default. |
| Marker codes | `markerCode` appears **only** in the viewer's own `SelfView`. |
| Pickups | Positions sent if `minimap.showPickups`; otherwise only pickups within `PICKUP_REVEAL_RADIUS_M` of the viewer. |
| Health | Others get `healthFraction` only, never exact health/shield. |

### P4.6 Shot validation order (server — Dev A implements, `evaluateAim` is Dev C's)

1. Parse + size + rate limit + idempotency check.
2. Phase is `active`.
3. Shooter exists, is connected, `alive` (not `out_of_zone`, not `eliminated`), spawn lock expired, role may fire.
4. Weapon owned, not reloading, ammo > 0, `now ≥ nextShotAt` (server clock only).
5. Resolve `evidence.targetMarkerCode` → target player; target is in this match, `alive`, in zone, not protected, not a disallowed friendly target.
6. Both players' locations are fresh and good enough.
7. `evaluateAim(evidence, shooterGeo, targetGeo, aimConfig)` (see P5.2).
8. **Commit atomically** (single-threaded per match): consume ammo, set `nextShotAt`, start auto-reload if empty, apply damage (shield first, max 50 total per pickup), eliminate once, update scores, emit events, then broadcast state.

Rejected shots change **no** ammo, cooldown, or health. A client never shows a "hit" until `SHOT_ACCEPTED`.

`RejectReason` is one enum used by shots, heals, and pickups (see Appendix 1).

### P4.7 Timing

Server uses monotonic time (`performance.now()`) internally for intervals/reloads and `Date.now()` for timestamps it sends. Client clocks are for diagnostics only (`clientTimestamp`, `ageMs`).

### P4.8 Constants

All numbers from Part A (weapons, health 100, shield 50, drain 10 HP/s, 1 s return grace, heal 25 HP / 5 m / 5 s per target, spawn lockouts 5 s FFA / 15 s Assassin) live in `packages/shared/src/constants.ts` (Appendix 2). Aim tolerances and thresholds there are **provisional** and are tuned by Dev C on real devices.

---

## P5. Cross-track seams in detail

### P5.1 A ↔ B: fixtures, mock server, sim client

- **Dev C** writes the fixtures in M0 (forces a careful read of the contract); A and B only add fixtures for new messages they introduce via contract PRs.
- **`tools/mock-server` (B):** a WS server that accepts `HELLO` and plays back scripted `MATCH_STATE` sequences (lobby → countdown → active with damage → finished) from fixtures. `pnpm dev:mock` lets B build every screen with no backend.
- **`tools/sim-client` (A):** a Node library + CLI that creates a match, joins N bot players, sends location/shots (using `dev_simulated` evidence in `devMode`), and asserts on received messages. Used by server integration tests.

### P5.2 A ↔ C: `evaluateAim` and geo

```ts
// packages/aiming/src/index.ts  (Dev C owns; pure TS, no DOM)
export type GeoFix = { position: LatLng; accuracyM: number; ageMs: number };

export type AimConfig = {
  maxRangeM: number;
  reticleToleranceDeg: number;      // marker center must be this close to the reticle
  agreementToleranceDeg: number;    // base tolerance, widened by GPS slack
  maxEvidenceAgeMs: number;
  minMarkerConfidence: number;
  minMarkerVisibleFraction: number;
  maxHeadingAccuracyDeg: number;
  allowDevSimulated: boolean;       // == config.devMode
};

export type AimVerdict =
  | { ok: true; details: { bearingErrorDeg: number; gpsDistanceM: number; cameraDistanceM: number | null } }
  | { ok: false; reason: RejectReason };

export function evaluateAim(
  evidence: AimEvidence, shooter: GeoFix, target: GeoFix, cfg: AimConfig
): AimVerdict;

// geo helpers the server also uses
export function haversineM(a: LatLng, b: LatLng): number;
export function bearingDeg(from: LatLng, to: LatLng): number;     // 0–360, 0 = north
export function toLocalMeters(origin: LatLng, p: LatLng): { east: number; north: number };
export function angleDiffDeg(a: number, b: number): number;       // signed, wrap-safe, in (−180, 180]
```

`evaluateAim` check order (every failure returns a specific `RejectReason`; **ambiguity ⇒ reject**):

1. `source === "dev_simulated"` allowed only if `cfg.allowDevSimulated`.
2. `evidence.ageMs ≤ maxEvidenceAgeMs`.
3. Target marker is among `visibleMarkerCodes`; no other visible marker is as close to / closer to the reticle (ambiguity).
4. `markerConfidence ≥ minMarkerConfidence`; `markerVisibleFraction ≥ minMarkerVisibleFraction` (occlusion proxy).
5. Marker offset from reticle ≤ `reticleToleranceDeg`.
6. Heading usable: `headingAccuracyDeg` (if present) ≤ `maxHeadingAccuracyDeg`.
7. **Aim agreement:** GPS bearing shooter→target vs. `camera.headingDeg + markerOffsetDeg.x` within `agreementToleranceDeg + gpsSlackDeg`, where `gpsSlackDeg ≈ atan((σ_shooter + σ_target) / distance)` (capped).
8. **Range:** GPS distance ≤ `maxRangeM` + slack; if `estimatedDistanceM` exists it must agree with GPS distance within `max(3 m, 50 %) + accuracies`; contradictory ⇒ `RANGE_CONTRADICTORY`.

Unit tests must cover every reject path and the wraparound at 0°/360°. **Dev C delivers `geo.ts` + `angles.ts` first in M2** so Dev A is not blocked on the rest.

### P5.3 B ↔ C: aiming UI surface

```tsx
// apps/web/features/aiming/index.ts  (Dev C owns; Dev B consumes)

/** Camera preview + reticle. Fills its parent. B overlays the HUD on top. */
export function AimView(props: { controller: AimController }): JSX.Element;

/** The high-contrast marker every active player shows on their own screen. */
export function PlayerMarker(props: {
  markerCode: number;            // from MatchState.self.markerCode
  sizePx?: number;
  dimmed?: boolean;              // e.g. out_of_zone / eliminated
}): JSX.Element;

export type AimUnavailableReason =
  | "camera_denied" | "no_camera" | "orientation_denied"
  | "orientation_unsupported" | "insecure_context" | "sensors_stale" | "unsupported_browser";

export type AimController = {
  status: "idle" | "requesting_permissions" | "calibrating" | "ready" | "unavailable";
  unavailableReason?: AimUnavailableReason;
  target: { markerCode: number; confidence: number } | null;   // live "valid target" feedback
  start(): Promise<void>;        // MUST be called from a user gesture (iOS permission rules)
  stop(): void;                  // stops all camera tracks and sensor listeners
  recalibrate(): void;
  /** Called on SHOOT press. Returns fresh evidence or null (→ B shows "no target"). */
  captureEvidence(): AimEvidence | null;
};

export function useAiming(opts: { enabled: boolean }): AimController;

/** DEV_ONLY — builds simulated evidence; usable only when config.devMode. */
export function makeDevEvidence(targetMarkerCode: number): AimEvidence;
```

Rules: C never touches routing, WS, or HUD layout; B never touches camera/sensor code. If B needs a new prop or state, B asks C (or opens a PR into `features/aiming/index.ts` that C approves).

---

## P6. Environment & local dev

- Root scripts: `pnpm dev` (server + web), `pnpm dev:mock` (mock-server + web), `pnpm dev:tunnel` (C: exposes web and server over HTTPS/WSS so real phones can use camera/sensors), `pnpm typecheck`, `pnpm test`, `pnpm lint`.
- Env vars: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, server `PORT`, `WEB_BASE_URL`, `ALLOWED_ORIGINS`. No secrets in frontend. `.env.example` committed; `.env` ignored.
- Camera, orientation (on iOS), and geolocation need a **secure context** — real-phone testing always goes through the tunnel or a deployed HTTPS URL.

---

## P7. Milestones

Each milestone ends with an **integration checkpoint on real phones** (not just desktop). Do not start milestone *n+1* feature work on `main` until *n*'s exit condition holds. Phase numbers in parentheses refer to the S17 table. Time guidance is relative; adjust to the hackathon length.

### M0 — Foundation & contract freeze (all three, ~1–2 h)

| Dev | Tasks |
|---|---|
| **A** | pnpm workspace + `tsconfig.base.json`; `apps/server` skeleton (`/health`, WS accept); commit Appendices 1–2 as `packages/shared`, make it compile, export from `index.ts`. |
| **B** | `apps/web` Next.js skeleton with a stub home page; env config; `tools/mock-server` skeleton. |
| **C** | CI workflow (typecheck + lint + test); write `fixtures/**` for every message and HTTP type + `contract.test.ts`; `pnpm dev:tunnel`; `docs/testing.md` device matrix skeleton; `packages/aiming` skeleton. |

**Exit:** fresh clone → `pnpm i && pnpm typecheck && pnpm test` green; CI green on `main`; tag `contract-v0.1`; all three have read and ack'd Appendix 1 in a PR comment.

### M1 — Lobby slice (Phase 1)

| Dev | Tasks |
|---|---|
| **A** | In-memory `MatchRegistry`; `POST /api/matches`, `GET /api/matches/:code`, `POST …/join`; join-code generator; WS `HELLO`/`WELCOME`/`PING`/`PONG`; per-recipient `MATCH_STATE` broadcast; `PLAYER_READY`; `UPDATE_CONFIG` (host-only, validated, clamped); `LEAVE_MATCH`; disconnect/reconnect rebind; display-name sanitizing; `sim-client` with 2 bots; unit + integration tests. |
| **B** | Home (create / join by code), `/join/[code]`, name entry, QR rendering of `joinUrl`; lobby screen (player list, host badge, ready toggles, host mode/duration controls); `useGameSocket` (handshake, reconnect, error surfacing) and `useServerClock`; develop against mock-server first, switch to real server when A lands. |
| **C** | `/dev/aim-lab` spike page (not shipped in nav): camera permission, iOS/Android orientation permission and live heading/pitch readout, candidate marker rendering + detection on ≥2 phones. Record findings and **pick the marker approach** (e.g. ArUco-style vs QR-like) in `docs/aiming-decisions.md`. |

**Exit:** two physical phones join the same lobby via QR and see consistent player lists; host changes mode and both see it; refreshing a phone rejoins the same player.

### M2 — Match lifecycle + positioning (Phases 2–3)

| Dev | Tasks |
|---|---|
| **A** | Phase machine `lobby → countdown → active → finished` with server timers; `REQUEST_MATCH_START` validation (≥2 players, all ready, arena set, valid composition); end-by-timer + `MatchResult` (FFA: score by eliminations); `UPDATE_LOCATION` validation (ranges, rate, speed plausibility, staleness, accuracy); polygon containment with margin, hysteresis, confirmation window; `out_of_zone` state, 10 HP/s drain after *confirmed* exit, 1 s return grace; `locationQuality`; visibility filtering; deterministic simulated-position tests. |
| **B** | Host settings (mode, duration, minimap, pickups) + **arena-from-my-location circle tool**; countdown screen with safety warning; results screen; `useGeolocation` (watchPosition, errors, 1–2 Hz sends); SVG minimap (arena polygon, self, server-permitted others); gray out-of-zone UI; location-quality banner; always-visible **Leave match**. |
| **C** | `packages/aiming/core`: **`geo.ts` + `angles.ts` first** (A needs them), then marker codec (encode/decode with error detection; tests on synthetic frames), orientation normalizer/smoother, `evaluateAim` v0 with full unit tests. |

**Exit:** full lobby → countdown → active → results on phones with no manual server intervention; walking out of the arena grays the UI and drains HP only after a confirmed exit; walking back restores combat after the grace period.

### M3 — Combat core (Phase 4)

| Dev | Tasks |
|---|---|
| **A** | Health/shield/elimination (idempotent); Pulse; ammo, auto-reload, fire interval, spawn lockout; full `REQUEST_SHOT` pipeline per P4.6 (accepting `dev_simulated` evidence only if `devMode`; in `devMode`, everyone spawns with Pulse — documented); `SHOT_*`, `PLAYER_DAMAGED`, `PLAYER_ELIMINATED`; scoring; rate limits; simultaneous-shot tests. |
| **B** | Match HUD: weapon, ammo, reload progress (from `reloadCompleteAt` via clock offset), health/shield, spawn-lock timer, arena status, damage flash, elimination screen, large thumb-safe SHOOT button; DEV_ONLY target picker (labeled) calling `makeDevEvidence`; mounts `<PlayerMarker>`. |
| **C** | `AimView`, `PlayerMarker`, `useAiming`, `captureEvidence` v0 against the P5.3 surface: camera lifecycle (tracks stopped on exit), orientation calibration flow, hFOV handling, live target feedback. |

**Exit:** controlled test (devMode) produces valid damage, rejected shots, reload cycles, and eliminations consistently on phones; duplicate/retry messages never double-damage.

### M4 — Camera aiming integration (Phase 5)

| Dev | Tasks |
|---|---|
| **A** | `devMode: false` path uses `evaluateAim` end-to-end; log structured reject reasons; confirm no hidden-data leakage; tune thresholds in `constants.ts` with C. |
| **B** | Aim feedback states (no target / target locked / reject reason, subtle); permission/sensor error screens with retry; real permission values in `PLAYER_READY`; remove devMode shortcuts from the normal play path; hit confirmation strictly from server events. |
| **C** | Real-device tuning on ≥2 phones: reticle/agreement tolerances, hFOV calibration, ambiguity and occlusion behavior; run every scenario in S15.3; record **honest** results in `docs/testing.md`. |

**Exit (Phase 5):** a valid target is identified and hit via real camera aiming on two real phones; aiming away, wrong marker, two markers, eliminated marker, and occluded marker are all rejected. If this fails, keep the devMode loop, label it as such, and say so.

### M5 — Game modes (Phase 6)

| Dev | Tasks |
|---|---|
| **A** | Role/team assignment and composition validation; FFA, Assassin (15 s lockout, only Assassin fires, win conditions), Team Deathmatch (Killer/Healer rules, team score, tie = draw); `REQUEST_HEAL` (5 m, 25 HP, 5 s/target, no self-heal, interrupt on damage, cap at max); role-based visibility filtering; tests per rule. |
| **B** | Role badge, team labels + colors (never color-only), heal button + cooldown UI, mode-aware minimap, lobby team display, per-mode results. |
| **C** | Reuse aiming for heals; marker dimming states; multi-marker ambiguity + sensor-stale handling; second device round with 3 phones. |

**Exit:** all three modes have distinct, server-enforced rules, each played start to finish.

### M6 — Pickups & remaining weapons (Phase 7)

| Dev | Tasks |
|---|---|
| **A** | Ravager, Viper; weapon/health/shield pickups (shield absorbs ≤50 total), respawn timers, `REQUEST_PICKUP` proximity validation, reveal radius; FFA starts unarmed; tests. |
| **B** | Pickup icons on minimap, collect UI, pickup/weapon feedback. |
| **C** | Detector FPS/battery pass, Screen Wake Lock, backgrounding behavior, field test. |

**Exit:** pickup ownership and weapon behavior consistent across all clients.

### M7 — Polish & demo (Phase 8)

| Dev | Tasks |
|---|---|
| **A** | Reconnect/timeout policy documented; graceful shutdown; deploy server (persistent process, WSS); optional persisted match results. |
| **B** | Deploy web (HTTPS); HUD/onboarding polish; accessibility pass; error-message pass. |
| **C** | Demo script + repeatable setup; physical-safety checklist run; known-limitations section in `README.md`. |

**Exit:** a new player can join and play without a developer explaining each screen; demo repeats reliably with 2–3 phones.

---

## P8. Working agreements

**Git**
- Trunk-based: `main` is always green and deployable. Short-lived branches named `a/…`, `b/…`, `c/…`; merge at least daily.
- PRs need: typecheck, lint, tests passing; CODEOWNERS approval; `contract` label + two approvals for `packages/shared`.
- Never rewrite another track's files in your PR "to be helpful." Open an issue/comment instead.

**`docs/STATUS.md`** — one section per dev. Update at the end of each work session:
`Done · In progress · Blocked on (who) · Contract change requests · Known issues`. Agents read this at the start of each session.

**Definition of done (any task)**
- Behavior verified by a test or a documented manual device check — never claim success you did not observe, and never invent test results.
- Server rule changes update server logic, shared types/constants, client feedback, and tests **together**.
- Docs updated when behavior or architecture changes.

**Honesty rules (from Part A)**
- Nothing mocked is presented as complete. Mocks/simulation are `DEV_ONLY`, gated by `devMode`, and called out in `STATUS.md`.
- Report real limits of camera aiming, GPS, browser support, and anti-cheat (client evidence is not proof).

**Safety**
- No UI or copy that encourages running while looking at the phone; arena selection warns about roads/stairs/hazards; Leave-match is always reachable.

---

## P9. Risk register

| Risk | Owner | Mitigation |
|---|---|---|
| iOS requires a user gesture for `DeviceOrientationEvent.requestPermission()`; heading source differs between iOS (`webkitCompassHeading`) and Android (`deviceorientationabsolute`) | C | Start aiming from a button tap; normalize sources; expose `headingSource` in evidence; reject unreliable headings. |
| Camera/orientation need HTTPS; mixed `ws://` blocked from `https://` pages | C | `pnpm dev:tunnel`; always `wss://` outside localhost. |
| Camera field of view varies per phone | C | Calibration step (marker at known distance); send `hfovDeg` in evidence; fall back to GPS-only range check when uncalibrated. |
| Marker detection range/speed in browser | C | M1 spike compares approaches on real phones; decision recorded in `docs/aiming-decisions.md`. |
| GPS error (several meters) ≈ heal range and short-range aiming | A, C | Widen tolerances by reported accuracy; reject when uncertain; document. Healing is GPS-range only in MVP. |
| Phone screens sleep / tab backgrounded kills socket | B, C | Screen Wake Lock where available; reconnect flow; clear "reconnecting" UI. |
| Client can lie about camera evidence | A | Basic validation + rate limits; document as a limitation, don't oversell anti-cheat. |
| Contract churn breaks the other tracks | all | P4.1 rules; freeze after M2; fixtures + CI catch drift. |
| Real-device aiming never gets reliable in time | C | Keep working game loop via labeled devMode; never present simulated aim as camera aim. |

---

## Appendix 1 — `packages/shared/src/protocol.ts` (contract v0.1 starting source)

> Written as the starting point; it has **not been compiled yet**. M0 makes it compile (adjust to the installed zod version) and then it becomes the authoritative file.

```ts
import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;

/* ───────────── primitives ───────────── */
export const Id = z.string().min(1).max(64);
export const EpochMs = z.number().int().nonnegative();
export const LatLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLng>;

export const MatchMode = z.enum(["ffa", "assassin", "team_deathmatch"]);
export const MatchPhase = z.enum(["lobby", "countdown", "active", "finished"]);
export const PlayerStatus = z.enum(["alive", "out_of_zone", "eliminated"]);
export const PlayerRole = z.enum(["killer", "healer", "assassin", "survivor"]);
export const WeaponId = z.enum(["pulse", "ravager", "viper"]);
export const PickupKind = z.enum(["weapon", "health", "shield"]);
export const LocationQuality = z.enum(["good", "poor", "stale", "none"]);
export type MatchMode = z.infer<typeof MatchMode>;
export type MatchPhase = z.infer<typeof MatchPhase>;
export type PlayerStatus = z.infer<typeof PlayerStatus>;
export type PlayerRole = z.infer<typeof PlayerRole>;
export type WeaponId = z.infer<typeof WeaponId>;

export const ErrorCode = z.enum([
  "BAD_MESSAGE", "UNAUTHENTICATED", "SESSION_EXPIRED", "PROTOCOL_VERSION_MISMATCH",
  "WRONG_PHASE", "NOT_HOST", "INVALID_CONFIG", "LOBBY_FULL", "MATCH_NOT_FOUND",
  "RATE_LIMITED", "INTERNAL",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** One enum for rejected shots, heals, and pickups. */
export const RejectReason = z.enum([
  // state / eligibility
  "WRONG_PHASE", "NOT_CONNECTED", "SHOOTER_ELIMINATED", "SHOOTER_OUT_OF_ZONE", "SPAWN_LOCKED",
  "ROLE_CANNOT_ACT", "NO_WEAPON", "RELOADING", "COOLDOWN", "NO_AMMO",
  // target
  "INVALID_TARGET", "TARGET_ELIMINATED", "TARGET_OUT_OF_ZONE", "TARGET_PROTECTED", "FRIENDLY_TARGET",
  // location
  "LOCATION_UNAVAILABLE", "LOCATION_TOO_POOR",
  // aim evidence
  "EVIDENCE_STALE", "EVIDENCE_LOW_CONFIDENCE", "EVIDENCE_AMBIGUOUS", "TARGET_OCCLUDED",
  "AIM_DISAGREEMENT", "OUT_OF_RANGE", "RANGE_CONTRADICTORY", "DEV_EVIDENCE_NOT_ALLOWED",
  // pickups / heals
  "PICKUP_UNAVAILABLE", "PICKUP_TOO_FAR", "HEAL_COOLDOWN", "HEAL_FULL_HEALTH", "HEAL_SELF",
  // generic
  "RATE_LIMITED", "DUPLICATE_REQUEST", "MALFORMED",
]);
export type RejectReason = z.infer<typeof RejectReason>;

/* ───────────── match config ───────────── */
export const MatchConfig = z.object({
  mode: MatchMode,
  durationSec: z.number().int().min(60).max(3600),
  arena: z.object({
    polygon: z.array(LatLng).min(3).max(64),
    boundaryMarginM: z.number().min(0).max(50),
  }).nullable(),                                   // null until the host sets it
  minimap: z.object({
    enabled: z.boolean(),
    showAllies: z.boolean(),
    showEnemies: z.boolean(),                      // server may clamp by mode
    showPickups: z.boolean(),
  }),
  pickups: z.object({
    weapons: z.boolean(), health: z.boolean(), shields: z.boolean(),
    respawnSec: z.number().int().min(5).max(300),
  }),
  team: z.object({
    teamCount: z.number().int().min(2).max(4),
    killersPerHealer: z.number().int().min(1).max(8),
  }),
  spawnLockoutSec: z.number().int().min(0).max(60),
  maxRangeM: z.number().min(5).max(100),
  devMode: z.boolean(),                            // DEV_ONLY shortcuts; never in production play
});
export type MatchConfig = z.infer<typeof MatchConfig>;
export const MatchConfigPatch = MatchConfig.partial();   // section-level replacement
export type MatchConfigPatch = z.infer<typeof MatchConfigPatch>;

/* ───────────── aim evidence ───────────── */
export const MarkerCode = z.number().int().min(0).max(255);

export const AimEvidence = z.object({
  source: z.enum(["camera", "dev_simulated"]),
  ageMs: z.number().int().min(0).max(5000),               // client-measured age when sent
  targetMarkerCode: MarkerCode,
  visibleMarkerCodes: z.array(MarkerCode).max(8),
  markerConfidence: z.number().min(0).max(1),
  markerVisibleFraction: z.number().min(0).max(1),        // occlusion proxy
  markerOffsetDeg: z.object({                             // marker center vs. optical axis
    x: z.number().min(-90).max(90),                       // + = right
    y: z.number().min(-90).max(90),                       // + = up
  }),
  markerWidthPx: z.number().positive().max(10000),
  frameWidthPx: z.number().int().positive().max(10000),
  hfovDeg: z.number().min(20).max(120),
  estimatedDistanceM: z.number().positive().max(500).nullable(),
  camera: z.object({                                      // calibrated optical-axis direction
    headingDeg: z.number().min(0).lt(360),                // 0 = north, clockwise
    pitchDeg: z.number().min(-90).max(90),
    rollDeg: z.number().min(-180).max(180),
    headingAccuracyDeg: z.number().min(0).max(180).nullable(),
    headingSource: z.enum(["absolute", "relative"]),
  }),
});
export type AimEvidence = z.infer<typeof AimEvidence>;

/* ───────────── views (server → client) ───────────── */
export const PlayerPublic = z.object({
  id: Id,
  displayName: z.string().min(1).max(20),
  teamId: Id.nullable(),
  role: PlayerRole.nullable(),                    // null where hidden / not applicable
  status: PlayerStatus,
  connected: z.boolean(),
  ready: z.boolean(),
  healthFraction: z.number().min(0).max(1).nullable(),
  score: z.number().int(),
  position: LatLng.nullable(),                    // null unless viewer is allowed to see it
});
export type PlayerPublic = z.infer<typeof PlayerPublic>;

export const SelfView = z.object({
  playerId: Id,
  markerCode: MarkerCode,                         // only ever sent to its owner
  health: z.number(), maxHealth: z.number(), shield: z.number(),
  weaponId: WeaponId.nullable(),
  ammo: z.number().int().nonnegative(),
  nextShotAt: EpochMs,
  reloadCompleteAt: EpochMs.nullable(),
  spawnLockedUntil: EpochMs,
  locationQuality: LocationQuality,
  inZone: z.boolean().nullable(),                 // null while quality is too poor to decide
  returnGraceUntil: EpochMs.nullable(),
});
export type SelfView = z.infer<typeof SelfView>;

export const PickupView = z.object({
  id: Id, kind: PickupKind, weaponId: WeaponId.nullable(),
  position: LatLng, available: z.boolean(), respawnAt: EpochMs.nullable(),
});

export const MatchResult = z.object({
  winner: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("player"), playerId: Id }),
    z.object({ kind: z.literal("team"), teamId: Id }),
    z.object({ kind: z.literal("assassin") }),
    z.object({ kind: z.literal("survivors") }),
    z.object({ kind: z.literal("draw") }),
    z.object({ kind: z.literal("invalid"), reason: z.string().max(200) }),
  ]),
  endedReason: z.enum(["timer", "last_standing", "all_survivors_eliminated", "abandoned", "host_ended"]),
  standings: z.array(z.object({
    playerId: Id, displayName: z.string(), teamId: Id.nullable(), role: PlayerRole.nullable(),
    eliminations: z.number().int(), deaths: z.number().int(), score: z.number().int(), survived: z.boolean(),
  })),
});
export type MatchResult = z.infer<typeof MatchResult>;

export const MatchState = z.object({
  matchId: Id, joinCode: z.string().min(4).max(8),
  phase: MatchPhase, hostPlayerId: Id,
  config: MatchConfig,
  players: z.array(PlayerPublic).max(32),
  self: SelfView,
  pickups: z.array(PickupView),
  teamScores: z.record(z.string(), z.number().int()),
  countdownEndsAt: EpochMs.nullable(),
  startedAt: EpochMs.nullable(),
  endsAt: EpochMs.nullable(),
  result: MatchResult.nullable(),
});
export type MatchState = z.infer<typeof MatchState>;

/* ───────────── HTTP ───────────── */
export const DisplayName = z.string().trim().min(1).max(20);
export const CreateMatchRequest = z.object({ displayName: DisplayName, config: MatchConfigPatch.optional() });
export const JoinRequest = z.object({ displayName: DisplayName });
export const JoinResponse = z.object({
  matchId: Id, joinCode: z.string(), joinUrl: z.string().url(),
  playerId: Id, sessionToken: z.string().min(16).max(128),
});
export const MatchSummary = z.object({
  joinCode: z.string(), phase: MatchPhase, mode: MatchMode,
  playerCount: z.number().int(), maxPlayers: z.number().int(), joinable: z.boolean(),
});
export const ApiError = z.object({ error: z.object({ code: ErrorCode, message: z.string() }) });

/* ───────────── WebSocket: client → server ───────────── */
const clientMsg = <T extends string, P extends z.ZodTypeAny>(type: T, payload: P) =>
  z.object({ v: z.literal(PROTOCOL_VERSION), id: Id, type: z.literal(type), payload });

export const ClientMessage = z.discriminatedUnion("type", [
  clientMsg("HELLO", z.object({ sessionToken: z.string().min(16).max(128) })),
  clientMsg("PING", z.object({ clientSentAt: z.number() })),
  clientMsg("LEAVE_MATCH", z.object({})),
  clientMsg("UPDATE_CONFIG", z.object({ config: MatchConfigPatch })),
  clientMsg("PLAYER_READY", z.object({
    ready: z.boolean(),
    permissions: z.object({ camera: z.boolean(), orientation: z.boolean(), location: z.boolean() }),
  })),
  clientMsg("REQUEST_MATCH_START", z.object({})),
  clientMsg("UPDATE_LOCATION", z.object({
    position: LatLng, accuracyM: z.number().min(0).max(10000), clientTimestamp: z.number(),
  })),
  clientMsg("REQUEST_SHOT", z.object({ evidence: AimEvidence })),
  clientMsg("REQUEST_HEAL", z.object({ targetMarkerCode: MarkerCode, evidence: AimEvidence.optional() })),
  clientMsg("REQUEST_PICKUP", z.object({ pickupId: Id })),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

/* ───────────── WebSocket: server → client ───────────── */
const serverMsg = <T extends string, P extends z.ZodTypeAny>(type: T, payload: P) =>
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    seq: z.number().int().nonnegative(),
    serverTime: EpochMs,
    replyTo: Id.optional(),
    type: z.literal(type),
    payload,
  });

export const ServerMessage = z.discriminatedUnion("type", [
  serverMsg("WELCOME", z.object({ playerId: Id, protocolVersion: z.literal(PROTOCOL_VERSION), state: MatchState })),
  serverMsg("MATCH_STATE", MatchState),
  serverMsg("PONG", z.object({ clientSentAt: z.number() })),
  serverMsg("SHOT_ACCEPTED", z.object({ targetPlayerId: Id, damageDealt: z.number(), eliminated: z.boolean() })),
  serverMsg("SHOT_REJECTED", z.object({ reason: RejectReason })),
  serverMsg("PLAYER_DAMAGED", z.object({
    attackerId: Id.nullable(), damage: z.number(), source: z.enum(["shot", "out_of_zone"]),
  })),
  serverMsg("PLAYER_ELIMINATED", z.object({
    playerId: Id, byPlayerId: Id.nullable(), cause: z.enum(["shot", "out_of_zone"]),
  })),
  serverMsg("HEAL_APPLIED", z.object({ healerId: Id, targetId: Id, amount: z.number() })),
  serverMsg("HEAL_REJECTED", z.object({ reason: RejectReason })),
  serverMsg("PICKUP_COLLECTED", z.object({ pickupId: Id, byPlayerId: Id, kind: PickupKind })),
  serverMsg("PICKUP_REJECTED", z.object({ reason: RejectReason })),
  serverMsg("MATCH_FINISHED", z.object({ result: MatchResult })),
  serverMsg("ERROR", z.object({ code: ErrorCode, message: z.string().max(300) })),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;
```

## Appendix 2 — `packages/shared/src/constants.ts` (v0.1)

```ts
import type { WeaponId } from "./protocol";

export type WeaponDefinition = {
  id: WeaponId; name: string; damage: number;
  magazineSize: number; fireIntervalMs: number; reloadDurationMs: number;
};

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  pulse:   { id: "pulse",   name: "Pulse",   damage: 25, magazineSize: 12, fireIntervalMs: 500,  reloadDurationMs: 1200 },
  ravager: { id: "ravager", name: "Ravager", damage: 50, magazineSize: 4,  fireIntervalMs: 1200, reloadDurationMs: 2000 },
  viper:   { id: "viper",   name: "Viper",   damage: 10, magazineSize: 30, fireIntervalMs: 150,  reloadDurationMs: 2500 },
};

export const MAX_PLAYERS = 16;
export const MAX_MESSAGE_BYTES = 8 * 1024;
export const DISCONNECT_TIMEOUT_MS = 30_000;

export const MAX_HEALTH = 100;
export const MAX_SHIELD = 50;
export const HEALTH_PACK_AMOUNT = 25;
export const OUT_OF_ZONE_DRAIN_HP_PER_SEC = 10;
export const RETURN_GRACE_MS = 1000;
export const SPAWN_LOCKOUT_SEC = { ffa: 5, assassin: 15, team_deathmatch: 5 } as const;

export const HEAL = { rangeM: 5, amount: 25, cooldownPerTargetMs: 5000 } as const;

export const PICKUP_REVEAL_RADIUS_M = 15;
export const PICKUP_COLLECT_RADIUS_M = 5;

/** PROVISIONAL — tuned by Dev C on real devices. Do not scatter copies. */
export const AIM_DEFAULTS = {
  maxEvidenceAgeMs: 1500,
  reticleToleranceDeg: 6,
  agreementToleranceDeg: 12,
  minMarkerConfidence: 0.6,
  minMarkerVisibleFraction: 0.8,
  maxHeadingAccuracyDeg: 25,
} as const;

/** PROVISIONAL — location handling. */
export const LOCATION = {
  maxAgeMs: 5000,
  maxAccuracyM: 25,
  maxSpeedMps: 12,
  exitConfirmationMs: 3000,
  minUpdateIntervalMs: 500,
} as const;

export const DEFAULT_MATCH_CONFIG = {
  mode: "ffa",
  durationSec: 300,
  arena: null,
  minimap: { enabled: true, showAllies: true, showEnemies: false, showPickups: true },
  pickups: { weapons: true, health: true, shields: true, respawnSec: 30 },
  team: { teamCount: 2, killersPerHealer: 2 },
  spawnLockoutSec: 5,
  maxRangeM: 30,
  devMode: false,
} as const;
```

## Appendix 3 — fixtures checklist (Dev C, M0)

`packages/shared/fixtures/` — one valid JSON per item, plus at least one **invalid** example per schema group under `fixtures/invalid/` that must fail to parse:

- `http/`: create-request, create-response, join-request, join-response, match-summary, api-error
- `client/`: every type in the P4.4 client table (`REQUEST_SHOT` in both `camera` and `dev_simulated` forms)
- `server/`: every type in the P4.4 server table; `MATCH_STATE` in lobby, countdown, active, finished, out-of-zone, and assassin-hidden-positions variants
