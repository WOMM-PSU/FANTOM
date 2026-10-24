# @fantom/shared changelog

Contract v0.1 is the starting point from `PLAN.md` Appendix 1 (protocol) and Appendix 2 (constants).
Changes follow PLAN P4.1: update schemas, fixtures, `contract.test.ts`, this file, and bump
`PROTOCOL_VERSION` for breaking changes.

## v0.1 — M0

- Initial zod schemas for HTTP requests/responses, client→server and server→client WebSocket
  envelopes, and match state views.
- Weapon, health, location and provisional aiming constants exported from `constants.ts`.
