# Aiming decisions

> Owner: Dev C. Records **why** the marker/detector approach was chosen and what was observed on real
> devices. M1 is a spike: do not commit to a library or codec before it.

Last updated: 2026-10-24

## Status

**No marker approach has been chosen.** A standalone QR-candidate lab now exists at
`apps/web/features/aiming/dev/aim-lab.html` and passed synthetic desktop checks with both
`BarcodeDetector` and jsQR. That validates the code path only; no physical phone, real camera view,
or two-person posture has been tested, and no device results are claimed.

## Decision criteria

1. Decodes reliably at the real play distance, indoors and in daylight.
2. Works on iOS Safari and Android Chrome with the phones the team actually has.
3. Enough FPS/battery headroom on mid-range phones; detection stays local.
4. Carries the `markerCode` (0–255) with error detection; a misread must be rejected, not mapped to a
   different player.
5. Marker is large/high-contrast enough on a phone screen without covering the whole HUD.
6. Bundle size and initialization time acceptable for a mobile web app.
7. No session tokens or credentials in the visible marker.
8. Can be calibrated/validated from the evidence fields in the contract.

## Candidates to test

| Candidate | Strengths | Unknowns / risks |
|---|---|---|
| QR-like code + native `BarcodeDetector` | Built-in error correction, easy to render, no bundle | Browser availability/speed; finder-pattern size; angle/glare; may be too slow per frame |
| ArUco-style fiducial + WASM detector (OpenCV.js / js-aruco or similar) | Designed for fiducials/pose; robust IDs | Large WASM/bundle; init and FPS; iOS memory; integration complexity |
| Custom high-contrast code + custom detector | Small, fast, tuned to our marker; full control of ECC | We own detection/error-correction quality; more test time |

Do not add a dependency until the spike compares these on the same two phones and distances.

## Physical constraint: marker pose

The spec assumes each player displays a marker that opponents' **rear** cameras detect. In the normal
aiming grip, the screen faces the player and the rear camera faces the opponent, so the marker faces
away from the opponent. Rotating the screen toward the opponent hides the HUD from the player and
points the rear camera at the player. A single phone cannot simultaneously (a) show a marker to the
opponent, (b) show the HUD to its owner, and (c) point its rear camera at the opponent.

This is a product-level constraint, not a detector bug. M1 must test the actual two-person posture.
Possible directions to evaluate (none chosen yet):

- A deliberate "expose/marker" stance with audio/haptic feedback while the screen faces out.
- A large marker that shares the screen with a reduced HUD, held at an angle visible to both players.
- A different aiming/display arrangement agreed with Dev B (P5.3 surface change).
- If none is acceptable, say so plainly and keep the labeled `devMode` fallback; do not pretend it is
  camera aiming.

## Range estimate (to verify, not a result)

Assumptions: 7 cm marker width, 60° horizontal FOV, 1280 px frame width (≈21 px/degree).

| Distance | Approx. marker width |
|---|---:|
| 5 m | 16 px |
| 10 m | 8 px |
| 15 m | 5 px |
| 30 m | 3 px |

A multi-bit code with error detection at 3–8 px is not realistic. Expect a practical range of a few
metres, not the provisional `maxRangeM: 30`. Measure the real threshold in M1 and retune the shared
constants with Dev A (constants are shared; do not change them unilaterally).

If the marker physical width is unknown, the server cannot independently compute camera distance from
`markerWidthPx`/`frameWidthPx`/`hfovDeg`. Treat `estimatedDistanceM` as a client hint, not proof.

## Evidence/contract gaps to resolve with the team

1. **Ambiguity.** `AimEvidence` has `visibleMarkerCodes` (codes only) and one `markerOffsetDeg`, so the
   server cannot implement P5.2 step 3 ("no other visible marker is as close or closer"). Implemented
   MVP: reject more than one visible marker as `EVIDENCE_AMBIGUOUS`. Alternative: add per-marker
   offsets and confidence to the contract (PR + fixtures + both approvals).
2. **Relative heading.** `headingSource: "relative"` cannot be compared to a GPS bearing. Implemented:
   reject relative headings as `EVIDENCE_LOW_CONFIDENCE`; a dedicated reason may be worth adding.
3. **`devMode` gating.** Resolved by Dev A: the server only accepts `config.devMode = true` when
   `ALLOW_DEV_MODE=true`; `dev_simulated` evidence is still rejected by `evaluateAim` unless the
   caller passes `allowDevSimulated`.
4. **Reticle tolerance semantics.** Implemented: reticle tolerance is the magnitude
   `hypot(offset.x, offset.y)`; agreement uses the horizontal component. Documented and tested.

## M1 spike plan

Route: `/dev/aim-lab` (not in navigation; needs Dev B's app shell/route agreement). A standalone page
is already available in `apps/web/features/aiming/dev` for testing before B's shell lands; it is not
shipped in navigation.

1. Camera preview + permission flow; clear denied/unavailable/error states; tracks stopped on exit.
2. iOS `DeviceOrientationEvent.requestPermission()` from a user gesture; Android absolute/relative
   source; live heading, pitch, roll, source, accuracy readout.
3. Render candidate markers at controlled sizes; measure decode distance, angle tolerance, latency, FPS,
   false positives, and screen brightness/glare behavior.
4. Two-person posture test (above); record what actually works.
5. Compare candidates in the same conditions; choose one or explicitly defer. The current standalone
   lab only exercises the QR candidate; ArUco/custom still need an equivalent trial.
6. Record device/browser versions and results in `docs/testing.md`; write the decision here.

### Synthetic desktop observations (not device results)

- QR generation and decoding worked with native `BarcodeDetector` and with jsQR from a canvas capture
  stream; both decoded `FANTOM:1:7:0e`.
- Two markers in one synthetic frame produced two detections and the ambiguity warning.
- Detection APIs expose no confidence or visible-fraction value; the lab reports those as unavailable.
- These observations do not establish range, reliability, battery cost, or the two-person posture.

## Open threshold for team review

`evaluateAim` uses a local provisional **45° GPS-slack cap**; P5.2 requires a cap but does not name
one. It is not in `AIM_DEFAULTS` and must be revisited with real-device data (M4) rather than treated
as calibrated.

## DEV_ONLY evidence seam

P5.3's `makeDevEvidence(targetMarkerCode)` has no shooter/target positions, so it cannot generate a
heading that matches the actual GPS bearing. `evaluateAim` deliberately still applies the agreement
and range checks to `dev_simulated` evidence. Either the server's dev path must skip those checks
(and expose that clearly), or the factory needs the two positions. Resolve with Dev A/B before M3;
never present simulated aiming as camera aiming.

## Decision log

| Date | Decision | Evidence | Follow-ups |
|---|---|---|---|
| 2026-10-24 | QR candidate exercised in a standalone lab; **no marker approach chosen** | Synthetic desktop decode with `BarcodeDetector` and jsQR; ambiguity warning | Real two-phone posture + range/angle/battery measurements; compare ArUco/custom |
