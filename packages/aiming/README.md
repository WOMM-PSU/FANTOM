# @fantom/aiming

Pure TypeScript aiming core shared by the server and the client. **No DOM or browser imports** are
allowed in this package (PLAN P5.2).

## Exports

```ts
import {
  evaluateAim,
  haversineM,
  bearingDeg,
  toLocalMeters,
  angleDiffDeg,
  normalizeDeg,
  type AimConfig,
  type AimVerdict,
  type GeoFix,
} from "@fantom/aiming";
```

`evaluateAim(evidence, shooter, target, config)` follows the P5.2 check order and returns either
`{ ok: true, details }` or `{ ok: false, reason }` with a shared `RejectReason`. It does **not**
check match phase, shooter eligibility, weapon/ammo, cooldowns, target resolution, or location
freshness; the server applies those first (P4.6 steps 1–6).

Behavior worth knowing:

- `dev_simulated` evidence is rejected unless `config.allowDevSimulated` is true. The server must
  derive that from its own `ALLOW_DEV_MODE` policy, not just from the host's config.
- Evidence with more than one visible marker is rejected as `EVIDENCE_AMBIGUOUS`. The contract has
  no per-marker offsets, so this is a conservative MVP rule.
- Relative headings are rejected as unusable; a null `headingAccuracyDeg` is allowed.
- Reticle tolerance uses the magnitude of both offset axes; agreement uses the horizontal offset.
- GPS uncertainty widens agreement by `atan((accuracyShooter + accuracyTarget) / distance)`, capped
  at a provisional 45°. The cap is local pending real-device tuning.
- A camera distance estimate must be inside the range envelope and must agree with GPS within
  `max(3 m, 50%) + accuracies`, otherwise `RANGE_CONTRADICTORY`.
- Caller must validate geo-fix age/quality before calling; `GeoFix.ageMs` is diagnostic.

## Development

```bash
pnpm --filter @fantom/aiming build
pnpm --filter @fantom/aiming typecheck
pnpm --filter @fantom/aiming test
```

Tests cover every reject path, 0°/360° wraparound, the antimeridian, GPS slack and range
contradictions. Thresholds are provisional and must be tuned on real devices before M4.
