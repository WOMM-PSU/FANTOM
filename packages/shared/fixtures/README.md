# Contract fixtures

Every example in this directory is consumed by `test/contract.test.ts`. Valid fixtures must parse
with the corresponding schema; invalid fixtures must fail.

## Layout

| Directory | Schema | Contents |
|---|---|---|
| `http/` | `CreateMatchRequest`, `JoinRequest`, `JoinResponse`, `MatchSummary`, `ApiError` | One example per HTTP request/response type |
| `client/` | `ClientMessage` | One example per P4.4 client message; `REQUEST_SHOT` has `camera` and `dev_simulated` variants |
| `server/` | `ServerMessage` | One example per P4.4 server message; `MATCH_STATE` has lobby, countdown, active FFA, out-of-zone, finished, assassin-hidden, and team-deathmatch variants |
| `invalid/client/`, `invalid/server/`, `invalid/http/` | same schemas | Examples that must be rejected |

Fixtures contain no session tokens, no other players' marker codes, and no exact enemy health.
They are **not** authorization credentials.

## Generate and test

```bash
pnpm --filter @fantom/shared build
node packages/shared/fixtures/generate.mjs
pnpm --filter @fantom/shared test
```

The generator constructs each example from one source, validates it with the built zod schemas,
then writes the JSON. Edit `generate.mjs`, not the generated files. If a schema changes, regenerate
and run the contract test in the same contract PR (PLAN P4.1).
