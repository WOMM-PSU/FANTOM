import type { AimEvidence, LatLng, RejectReason } from "@fantom/shared";
import { angleDiffDeg, normalizeDeg, radToDeg } from "./angles.js";
import { bearingDeg, haversineM } from "./geo.js";

export type GeoFix = {
  position: LatLng;
  /** Reported horizontal accuracy in metres (1-sigma or platform equivalent). */
  accuracyM: number;
  /** Age of the fix when evaluated, for caller diagnostics. */
  ageMs: number;
};

export type AimConfig = {
  maxRangeM: number;
  /** Marker centre must be this close to the reticle. */
  reticleToleranceDeg: number;
  /** Base camera/orientation agreement tolerance, widened by GPS slack. */
  agreementToleranceDeg: number;
  maxEvidenceAgeMs: number;
  minMarkerConfidence: number;
  minMarkerVisibleFraction: number;
  maxHeadingAccuracyDeg: number;
  /** True only when the server has separately enabled devMode (PLAN P2.9). */
  allowDevSimulated: boolean;
};

export type AimVerdict =
  | {
      ok: true;
      details: {
        /** Absolute shortest camera/aim difference, in degrees. */
        bearingErrorDeg: number;
        gpsDistanceM: number;
        cameraDistanceM: number | null;
      };
    }
  | { ok: false; reason: RejectReason };

/**
 * Safety cap for how far GPS uncertainty may widen the aim-agreement check.
 *
 * PLAN P5.2 requires a cap but does not name a value. This provisional value
 * belongs with the AIM_DEFAULTS tuning work; it is deliberately conservative
 * and must not be copied into other modules. When GPS uncertainty would exceed
 * this, the shot is evaluated against at most this much extra tolerance.
 */
const MAX_GPS_SLACK_DEG = 45;

/** Absolute allowance when comparing camera-estimated and GPS distance. */
const RANGE_ABSOLUTE_SLACK_M = 3;

/** Relative allowance when comparing camera-estimated and GPS distance. */
const RANGE_RELATIVE_SLACK = 0.5;

function reject(reason: RejectReason): AimVerdict {
  return { ok: false, reason };
}

function finitePosition(position: LatLng): boolean {
  return Number.isFinite(position.lat) && Number.isFinite(position.lng);
}

/**
 * Validate one proposed shot's aiming evidence.
 *
 * The caller is responsible for state/eligibility checks (P4.6 steps 1–6):
 * phase, shooter status, weapon/ammo/cooldown, target resolution, and current
 * location freshness/quality. This function validates the aim evidence and the
 * geometric relationship between the two fixes.
 *
 * P5.2 ambiguity rule: the contract carries only the target's offset and a
 * list of visible marker codes, so it cannot prove which other marker is
 * closest to the reticle. For the MVP we conservatively reject any evidence
 * with more than one visible marker. This is intentionally stricter than the
 * spec's wording; revisit only with a contract change carrying per-marker
 * offsets.
 *
 * A relative heading source cannot be compared with an absolute GPS bearing;
 * it is rejected as unusable evidence. A null `headingAccuracyDeg` is allowed
 * because the contract treats accuracy as optional; the source must still be
 * absolute.
 */
export function evaluateAim(
  evidence: AimEvidence,
  shooter: GeoFix,
  target: GeoFix,
  cfg: AimConfig,
): AimVerdict {
  // 1. Simulated evidence is a DEV_ONLY path and must be enabled server-side.
  if (evidence.source === "dev_simulated" && !cfg.allowDevSimulated) {
    return reject("DEV_EVIDENCE_NOT_ALLOWED");
  }

  // 2. Evidence age (client-measured; the server separately rate-limits).
  if (evidence.ageMs > cfg.maxEvidenceAgeMs) {
    return reject("EVIDENCE_STALE");
  }

  // 3. The target must be the visible marker; multiple markers are ambiguous.
  const visibleMarkers = new Set(evidence.visibleMarkerCodes);
  if (!visibleMarkers.has(evidence.targetMarkerCode)) {
    return reject("EVIDENCE_LOW_CONFIDENCE");
  }
  if (visibleMarkers.size > 1) {
    return reject("EVIDENCE_AMBIGUOUS");
  }

  // 4. Detection quality and the occlusion proxy.
  if (evidence.markerConfidence < cfg.minMarkerConfidence) {
    return reject("EVIDENCE_LOW_CONFIDENCE");
  }
  if (evidence.markerVisibleFraction < cfg.minMarkerVisibleFraction) {
    return reject("TARGET_OCCLUDED");
  }

  // 5. Marker centre vs. the reticle (both axes count).
  const reticleErrorDeg = Math.hypot(
    evidence.markerOffsetDeg.x,
    evidence.markerOffsetDeg.y,
  );
  if (reticleErrorDeg > cfg.reticleToleranceDeg) {
    return reject("AIM_DISAGREEMENT");
  }

  // 6. Heading must be absolute; when accuracy is present it must be usable.
  if (evidence.camera.headingSource !== "absolute") {
    return reject("EVIDENCE_LOW_CONFIDENCE");
  }
  if (
    evidence.camera.headingAccuracyDeg !== null &&
    evidence.camera.headingAccuracyDeg > cfg.maxHeadingAccuracyDeg
  ) {
    return reject("EVIDENCE_LOW_CONFIDENCE");
  }

  // Geometric inputs. The server checks location freshness first; guard
  // non-finite values here so a malformed sum cannot silently pass.
  if (
    !finitePosition(shooter.position) ||
    !finitePosition(target.position) ||
    !Number.isFinite(shooter.accuracyM) ||
    !Number.isFinite(target.accuracyM) ||
    shooter.accuracyM < 0 ||
    target.accuracyM < 0
  ) {
    return reject("LOCATION_TOO_POOR");
  }

  const gpsDistanceM = haversineM(shooter.position, target.position);
  if (!Number.isFinite(gpsDistanceM) || gpsDistanceM <= 0.001) {
    // At effectively zero distance the bearing is undefined.
    return reject("LOCATION_TOO_POOR");
  }

  const accuracySumM = shooter.accuracyM + target.accuracyM;

  // 7. Aim agreement, widened by GPS uncertainty and capped.
  const gpsBearingDeg = bearingDeg(shooter.position, target.position);
  const aimHeadingDeg = normalizeDeg(
    evidence.camera.headingDeg + evidence.markerOffsetDeg.x,
  );
  const bearingErrorDeg = Math.abs(angleDiffDeg(gpsBearingDeg, aimHeadingDeg));
  const gpsSlackDeg = Math.min(
    MAX_GPS_SLACK_DEG,
    radToDeg(Math.atan(accuracySumM / gpsDistanceM)),
  );

  if (bearingErrorDeg > cfg.agreementToleranceDeg + gpsSlackDeg) {
    return reject("AIM_DISAGREEMENT");
  }

  // 8. Range. GPS is allowed its reported uncertainty; a camera estimate must
  // be inside the same range envelope and must not contradict GPS.
  if (gpsDistanceM > cfg.maxRangeM + accuracySumM) {
    return reject("OUT_OF_RANGE");
  }

  const cameraDistanceM = evidence.estimatedDistanceM;
  if (cameraDistanceM !== null) {
    if (cameraDistanceM > cfg.maxRangeM + accuracySumM) {
      return reject("OUT_OF_RANGE");
    }

    const allowedDeltaM =
      Math.max(RANGE_ABSOLUTE_SLACK_M, RANGE_RELATIVE_SLACK * gpsDistanceM) +
      accuracySumM;
    if (Math.abs(cameraDistanceM - gpsDistanceM) > allowedDeltaM) {
      return reject("RANGE_CONTRADICTORY");
    }
  }

  return {
    ok: true,
    details: {
      bearingErrorDeg,
      gpsDistanceM,
      cameraDistanceM,
    },
  };
}
