import type { AimEvidence } from "@fantom/shared";
import { describe, expect, it } from "vitest";
import {
  evaluateAim,
  type AimConfig,
  type GeoFix,
} from "../src/core/evaluateAim.js";

const CFG: AimConfig = {
  maxRangeM: 30,
  reticleToleranceDeg: 6,
  agreementToleranceDeg: 12,
  maxEvidenceAgeMs: 1500,
  minMarkerConfidence: 0.6,
  minMarkerVisibleFraction: 0.8,
  maxHeadingAccuracyDeg: 25,
  allowDevSimulated: false,
};

const SHOOTER: GeoFix = {
  position: { lat: 0, lng: 0 },
  accuracyM: 0,
  ageMs: 100,
};

const TARGET: GeoFix = {
  position: { lat: 0, lng: 0.0001 }, // ~11.12 m east of the shooter
  accuracyM: 0,
  ageMs: 100,
};

type EvidenceOverrides = {
  source?: AimEvidence["source"];
  ageMs?: number;
  targetMarkerCode?: number;
  visibleMarkerCodes?: number[];
  markerConfidence?: number;
  markerVisibleFraction?: number;
  offsetX?: number;
  offsetY?: number;
  headingDeg?: number;
  headingAccuracyDeg?: number | null;
  headingSource?: AimEvidence["camera"]["headingSource"];
  estimatedDistanceM?: number | null;
};

function makeEvidence(overrides: EvidenceOverrides = {}): AimEvidence {
  return {
    source: overrides.source ?? "camera",
    ageMs: overrides.ageMs ?? 100,
    targetMarkerCode: overrides.targetMarkerCode ?? 7,
    visibleMarkerCodes: overrides.visibleMarkerCodes ?? [7],
    markerConfidence: overrides.markerConfidence ?? 0.9,
    markerVisibleFraction: overrides.markerVisibleFraction ?? 0.95,
    markerOffsetDeg: {
      x: overrides.offsetX ?? 0,
      y: overrides.offsetY ?? 0,
    },
    markerWidthPx: 120,
    frameWidthPx: 1280,
    hfovDeg: 60,
    estimatedDistanceM: overrides.estimatedDistanceM ?? null,
    camera: {
      headingDeg: overrides.headingDeg ?? 90,
      pitchDeg: 0,
      rollDeg: 0,
      headingAccuracyDeg:
        overrides.headingAccuracyDeg === undefined ? 5 : overrides.headingAccuracyDeg,
      headingSource: overrides.headingSource ?? "absolute",
    },
  };
}

function targetA(accuracyM = 0): GeoFix {
  return {
    position: { lat: 0.0001, lng: 0 },
    accuracyM,
    ageMs: 100,
  };
}

function targetAtDistance(distanceM: number, accuracyM = 0): GeoFix {
  // At the equator, 1 degree is ~111.195 km. Put the target due east so the
  // default 90-degree heading isolates the range checks from aim agreement.
  return {
    position: { lat: 0, lng: distanceM / 111_194.926 },
    accuracyM,
    ageMs: 100,
  };
}

describe("evaluateAim check order", () => {
  it("accepts a valid camera shot and returns diagnostics", () => {
    const verdict = evaluateAim(
      makeEvidence({ estimatedDistanceM: 11.12 }),
      SHOOTER,
      TARGET,
      CFG,
    );

    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.details.gpsDistanceM).toBeCloseTo(11.119, 2);
    expect(verdict.details.bearingErrorDeg).toBeCloseTo(0, 6);
    expect(verdict.details.cameraDistanceM).toBe(11.12);
  });

  it("rejects dev_simulated evidence unless explicitly allowed", () => {
    const verdict = evaluateAim(
      makeEvidence({ source: "dev_simulated" }),
      SHOOTER,
      TARGET,
      CFG,
    );
    expect(verdict).toEqual({ ok: false, reason: "DEV_EVIDENCE_NOT_ALLOWED" });

    expect(
      evaluateAim(
        makeEvidence({ source: "dev_simulated" }),
        SHOOTER,
        TARGET,
        { ...CFG, allowDevSimulated: true },
      ).ok,
    ).toBe(true);
  });

  it("rejects stale evidence and accepts the boundary", () => {
    expect(
      evaluateAim(makeEvidence({ ageMs: 1501 }), SHOOTER, TARGET, CFG),
    ).toEqual({ ok: false, reason: "EVIDENCE_STALE" });
    expect(
      evaluateAim(makeEvidence({ ageMs: 1500 }), SHOOTER, TARGET, CFG).ok,
    ).toBe(true);
  });

  it("requires the target to be among the visible markers", () => {
    expect(
      evaluateAim(
        makeEvidence({ targetMarkerCode: 8, visibleMarkerCodes: [7] }),
        SHOOTER,
        TARGET,
        CFG,
      ),
    ).toEqual({ ok: false, reason: "EVIDENCE_LOW_CONFIDENCE" });
  });

  it("rejects any second visible marker as ambiguous", () => {
    expect(
      evaluateAim(
        makeEvidence({ visibleMarkerCodes: [7, 8] }),
        SHOOTER,
        TARGET,
        CFG,
      ),
    ).toEqual({ ok: false, reason: "EVIDENCE_AMBIGUOUS" });
  });

  it("does not treat duplicate copies of the target code as ambiguity", () => {
    expect(
      evaluateAim(
        makeEvidence({ visibleMarkerCodes: [7, 7] }),
        SHOOTER,
        TARGET,
        CFG,
      ).ok,
    ).toBe(true);
  });

  it("rejects low confidence and occlusion", () => {
    expect(
      evaluateAim(
        makeEvidence({ markerConfidence: 0.59 }),
        SHOOTER,
        TARGET,
        CFG,
      ),
    ).toEqual({ ok: false, reason: "EVIDENCE_LOW_CONFIDENCE" });

    expect(
      evaluateAim(
        makeEvidence({ markerVisibleFraction: 0.79 }),
        SHOOTER,
        TARGET,
        CFG,
      ),
    ).toEqual({ ok: false, reason: "TARGET_OCCLUDED" });
  });

  it("uses both reticle axes for the reticle tolerance", () => {
    expect(
      evaluateAim(
        makeEvidence({ offsetX: 4, offsetY: 4 }), // 5.66 deg < 6
        SHOOTER,
        TARGET,
        CFG,
      ).ok,
    ).toBe(true);

    expect(
      evaluateAim(
        makeEvidence({ offsetX: 5, offsetY: 5 }), // 7.07 deg > 6
        SHOOTER,
        TARGET,
        CFG,
      ),
    ).toEqual({ ok: false, reason: "AIM_DISAGREEMENT" });
  });

  it("rejects relative headings and inaccurate headings", () => {
    expect(
      evaluateAim(
        makeEvidence({ headingSource: "relative" }),
        SHOOTER,
        TARGET,
        CFG,
      ),
    ).toEqual({ ok: false, reason: "EVIDENCE_LOW_CONFIDENCE" });

    expect(
      evaluateAim(
        makeEvidence({ headingAccuracyDeg: 26 }),
        SHOOTER,
        TARGET,
        CFG,
      ),
    ).toEqual({ ok: false, reason: "EVIDENCE_LOW_CONFIDENCE" });

    expect(
      evaluateAim(
        makeEvidence({ headingAccuracyDeg: null }),
        SHOOTER,
        TARGET,
        CFG,
      ).ok,
    ).toBe(true);
  });

  it("rejects camera/orientation disagreement beyond tolerance", () => {
    expect(
      evaluateAim(makeEvidence({ headingDeg: 180 }), SHOOTER, TARGET, CFG),
    ).toEqual({ ok: false, reason: "AIM_DISAGREEMENT" });
  });

  it("widens agreement by GPS slack, capped at the provisional 45 degrees", () => {
    const poorShooter = { ...SHOOTER, accuracyM: 10 };
    const poorTarget = { ...TARGET, accuracyM: 10 };

    // atan(20 / 11.12) ~= 60.9 deg, capped to 45; base tolerance 12 => 57.
    expect(
      evaluateAim(
        makeEvidence({ headingDeg: 140 }), // 50 deg error
        poorShooter,
        poorTarget,
        CFG,
      ).ok,
    ).toBe(true);

    expect(
      evaluateAim(
        makeEvidence({ headingDeg: 149 }), // 59 deg error
        poorShooter,
        poorTarget,
        CFG,
      ),
    ).toEqual({ ok: false, reason: "AIM_DISAGREEMENT" });
  });

  it("accepts marker-offset compensation and 0/360 wraparound", () => {
    const northTarget = targetA();
    expect(
      evaluateAim(
        makeEvidence({ headingDeg: 355, offsetX: 5 }), // aim = 0, target north
        SHOOTER,
        northTarget,
        CFG,
      ).ok,
    ).toBe(true);

    expect(
      evaluateAim(
        makeEvidence({ headingDeg: 359.5 }), // target north, tiny wrap error
        SHOOTER,
        northTarget,
        CFG,
      ).ok,
    ).toBe(true);
  });
});

describe("evaluateAim range checks", () => {
  it("rejects GPS distance beyond range plus reported accuracy", () => {
    expect(
      evaluateAim(
        makeEvidence(),
        SHOOTER,
        targetAtDistance(50),
        CFG,
      ),
    ).toEqual({ ok: false, reason: "OUT_OF_RANGE" });

    // 45 m with 10 m accuracy on each side is inside the 30 m + 20 m envelope.
    expect(
      evaluateAim(
        makeEvidence(),
        { ...SHOOTER, accuracyM: 10 },
        targetAtDistance(45, 10),
        CFG,
      ).ok,
    ).toBe(true);
  });

  it("rejects a camera estimate outside the range envelope", () => {
    expect(
      evaluateAim(
        makeEvidence({ estimatedDistanceM: 31 }),
        SHOOTER,
        TARGET,
        CFG,
      ),
    ).toEqual({ ok: false, reason: "OUT_OF_RANGE" });
  });

  it("rejects contradictory camera and GPS distances", () => {
    expect(
      evaluateAim(
        makeEvidence({ estimatedDistanceM: 20 }),
        SHOOTER,
        TARGET,
        CFG,
      ),
    ).toEqual({ ok: false, reason: "RANGE_CONTRADICTORY" });
  });

  it("accepts a camera distance within the allowed delta", () => {
    expect(
      evaluateAim(
        makeEvidence({ estimatedDistanceM: 14 }),
        SHOOTER,
        TARGET,
        CFG,
      ).ok,
    ).toBe(true);
  });

  it("rejects undefined or malformed location geometry", () => {
    expect(
      evaluateAim(makeEvidence(), SHOOTER, { ...TARGET, position: { lat: 0, lng: 0 } }, CFG),
    ).toEqual({ ok: false, reason: "LOCATION_TOO_POOR" });

    expect(
      evaluateAim(
        makeEvidence(),
        { ...SHOOTER, accuracyM: Number.NaN },
        TARGET,
        CFG,
      ),
    ).toEqual({ ok: false, reason: "LOCATION_TOO_POOR" });
  });
});
