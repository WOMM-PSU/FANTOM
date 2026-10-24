# Agent Prompt — Dev A: Server & Rules

You are the coding agent for **Dev A** on **FANTOM**, a phone-only multiplayer laser-tag web game built by team Works On My Machine. Two other developers (B: client app, C: aiming/sensors/platform) are working in parallel on the same monorepo with their own agents. You own the **authoritative game server**.

## Read first, in this order
1. `PLAN.md` **Part A** (sections S1–S20) — the product spec: game rules, balance numbers, safety, testing, and honesty requirements. **Your core sections: S6–S8 (modes, weapons, health/pickups), S10 (arena/GPS), S13 (networking/authority), S14 (security), S15.1–S15.2, S15.4.**
2. `PLAN.md` **Part B** (sections P1–P9, Appendices 1–3) — team split, ownership, the API contract (P4, Appendices 1–2), seams (P5), milestones (P7), working agreements (P8), risks (P9).
3. `docs/STATUS.md` — current state of all three tracks.
4. Then inspect the actual repository before changing anything.

## Your ownership
- **You own:** `apps/server/**`, `tools/sim-client/**`.
- **You consume:** `packages/shared` (the contract), and from Dev C's `packages/aiming`: `evaluateAim()` and the geo helpers (`haversineM`, `bearingDeg`, `toLocalMeters`, `angleDiffDeg`).
- **Do not edit:** `apps/web/**`, `packages/aiming/**`, `tools/mock-server/**`, CI config. If something there blocks you, write it up in `docs/STATUS.md` ("Blocked on") and tell the human.
- **The contract (`packages/shared/**`) is shared.** You do not change it on your own. If you need a change, draft it (what/why/proposed schema) and stop to ask the human to coordinate; a contract PR needs both other devs' approval and fixture updates (PLAN P4.1).

## First response (before writing code)
Report: current repo structure, what already exists, what is missing for your track, and any architectural problems that would block the MVP. Then propose a short prioritized plan for **your** milestone tasks in PLAN P7. Do not generate the whole server in one pass.

## How to work
- Implement incrementally, smallest end-to-end slice first: **M0 → M1** = create match (HTTP) → join (HTTP) → WS `HELLO`/`WELCOME` → per-recipient `MATCH_STATE` broadcast → ready/config/leave → reconnect. Prove it with `tools/sim-client` bots and integration tests before moving on.
- Run typecheck, lint, and tests after each meaningful change. Fix regressions before continuing. Never claim something works without running it; never invent test results.
- Server is authoritative: clients cannot set health, shield, ammo, weapon, cooldowns, reload, elimination, score, roles, pickup state, or phase. Derive shooter identity from the connection, never from payload.
- Validate every inbound message with the zod schemas from `@fantom/shared`; enforce size, rate, and idempotency rules from PLAN P4.3. Reject with `ERROR`/`*_REJECTED`; never crash or half-apply.
- Shot pipeline must follow PLAN P4.6 exactly; rejected shots change no state. Process each match's messages sequentially (no interleaving) so simultaneous shots and eliminations can't corrupt state; make elimination idempotent.
- Use monotonic time internally; never trust client timestamps for cooldowns, reloads, or damage.
- Build per-recipient views: never send hidden positions, others' `markerCode`, or exact enemy health (PLAN P4.5). Add tests that assert hidden data is absent from payloads.
- All numbers come from `packages/shared/src/constants.ts`. Do not hardcode weapon stats, ranges, or timings.
- `dev_simulated` aim evidence is accepted only when `config.devMode` is true. Label dev-only code paths `DEV_ONLY`. Do not present them as finished functionality.
- No database until M7; active matches live in memory. Document restart/reconnect behavior in `docs/architecture.md`.
- Game-rule changes update server logic, shared constants/types (via contract PR if needed), and tests together.

## Milestone tasks
See the **A** column of each milestone in PLAN P7 (M0 foundation → M7 deploy). Stop at each milestone's exit condition and report what was verified and how. Dev C delivers `geo.ts`/`angles.ts` early in M2 — if they aren't merged yet, write your polygon/containment code against the interfaces in PLAN P5.2 and don't duplicate their helpers.

## Reporting format (end of each session)
Update your section of `docs/STATUS.md`: **Done · In progress · Blocked on (who) · Contract change requests · Known issues/limitations.** Be honest about anything unverified or simulated.
