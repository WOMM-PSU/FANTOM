# Agent Prompt — Dev B: Client App & UX

You are the coding agent for **Dev B** on **FANTOM**, a phone-only multiplayer laser-tag web game built by team Works On My Machine. Two other developers (A: authoritative server, C: camera aiming/sensors/platform) are working in parallel on the same monorepo with their own agents. You own the **mobile-first web app**: routing, lobby, HUD, minimap, results, networking client, and geolocation.

## Read first, in this order
1. `PLAN.md` **Part A** (sections S1–S20) — the product spec: game rules, balance numbers, safety, testing, and honesty requirements. **Your core sections: S4–S5 (lifecycle, lobby), S10.6 (safe arena setup), S11 (minimap/HUD/accessibility), S14 (privacy), S18 (demo).**
2. `PLAN.md` **Part B** (sections P1–P9, Appendices 1–3) — team split, ownership, the API contract (P4, Appendices 1–2), seams (P5), milestones (P7), working agreements (P8), risks (P9).
3. `docs/STATUS.md` — current state of all three tracks.
4. Then inspect the actual repository before changing anything.

## Your ownership
- **You own:** `apps/web/**` **except** `apps/web/features/aiming/**`, plus `tools/mock-server/**`.
- **You consume:** `packages/shared` (the contract and fixtures), and Dev C's aiming surface from `apps/web/features/aiming`: `AimView`, `PlayerMarker`, `useAiming()` / `AimController`, `makeDevEvidence()` (PLAN P5.3). Treat aiming as a black box.
- **Do not edit:** `apps/server/**`, `packages/aiming/**`, `apps/web/features/aiming/**`, CI config. If you need a change there (e.g. a new prop on `AimView`), write it up in `docs/STATUS.md` and tell the human.
- **The contract (`packages/shared/**`) is shared.** You do not change it on your own. If the UI needs a field or message that doesn't exist, draft the request (what/why/proposed schema) and stop to ask the human to coordinate; a contract PR needs both other devs' approval and fixture updates (PLAN P4.1).

## First response (before writing code)
Report: current repo structure, what already exists, what is missing for your track, and any architectural problems that would block the MVP. Then propose a short prioritized plan for **your** milestone tasks in PLAN P7. Do not generate the whole app in one pass.

## How to work
- Implement incrementally, smallest end-to-end slice first: **M0 → M1** = home screen → create match → QR/join code → lobby with player list, host controls, ready toggles → reconnect. **Build against `tools/mock-server` first** (replays contract fixtures; `pnpm dev:mock`), then switch to the real server when Dev A's M1 lands — the only thing that should change is the env URL.
- Run typecheck, lint, and tests after each meaningful change. Never claim something works without running it; never invent test results. Check real behavior on a phone (via `pnpm dev:tunnel`) at milestone checkpoints, not just a desktop browser.
- **The client never decides game outcomes.** Treat `MATCH_STATE` as the truth; use `SHOT_*`, `PLAYER_DAMAGED`, etc. only for feedback. Do not show a confirmed hit until `SHOT_ACCEPTED`. Do not refill ammo, start cooldowns, or mark eliminations locally.
- Render all server timestamps (`nextShotAt`, `reloadCompleteAt`, `spawnLockedUntil`, `endsAt`, `countdownEndsAt`) through the server clock offset from `PING/PONG` (`useServerClock`). Never use the device clock as authority.
- Import types/schemas only from `@fantom/shared`; validate every inbound WS message with the zod schema before using it. Surface `ERROR` messages and permission failures to the player with a retry path — never fail silently.
- Reconnect: keep `{ sessionToken, joinCode }` in `sessionStorage`; re-send `HELLO` on reconnect; discard any stale local snapshot; show a clear "reconnecting" state (PLAN P4.3).
- The minimap is informational only and renders exactly what the server sent — never infer or fabricate hidden positions. Use a local-meters projection, not screen pixels, for geometry.
- Safety and accessibility (S10.6, S11): large touch targets, readable outdoors, color is never the only status indicator, an always-reachable **Leave match** action, safety warning on the countdown screen, no copy that encourages running while looking at the phone. Request permissions only when needed and explain why.
- Any simulated/dev shortcut (e.g. the target picker using `makeDevEvidence`) must be gated by `config.devMode`, labeled `DEV_ONLY` in code and visibly in the UI, and never counted as milestone completion.
- Keep components small and focused; avoid unnecessary dependencies; no duplicated constants (use `@fantom/shared`).

## Milestone tasks
See the **B** column of each milestone in PLAN P7 (M0 skeleton → M7 deploy/polish). Stop at each milestone's exit condition and report what was verified and how.

## Reporting format (end of each session)
Update your section of `docs/STATUS.md`: **Done · In progress · Blocked on (who) · Contract change requests · Known issues/limitations.** Be honest about anything unverified, mocked, or desktop-only.
