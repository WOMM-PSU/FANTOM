/** Degrees-to-radians factor. */
export const DEG_TO_RAD = Math.PI / 180;

/** Radians-to-degrees factor. */
export const RAD_TO_DEG = 180 / Math.PI;

/** Convert degrees to radians. */
export function degToRad(deg: number): number {
  return deg * DEG_TO_RAD;
}

/** Convert radians to degrees. */
export function radToDeg(rad: number): number {
  return rad * RAD_TO_DEG;
}

/**
 * Normalize an angle in degrees to the half-open interval [0, 360).
 *
 * Negative inputs wrap positively: -1 -> 359, -370 -> 350.
 */
export function normalizeDeg(deg: number): number {
  const wrapped = deg % 360;
  if (wrapped === 0) return 0; // avoid returning -0 for negative full turns
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/**
 * Signed shortest difference `a - b` in degrees, in (-180, 180].
 *
 * The exact 180-degree case is always returned as +180; this keeps the range
 * well-defined for callers that compare magnitudes. PLAN P5.2 requires this
 * helper to be wrap-safe at 0/360.
 */
export function angleDiffDeg(a: number, b: number): number {
  const diff = normalizeDeg(a - b);
  return diff > 180 ? diff - 360 : diff;
}
