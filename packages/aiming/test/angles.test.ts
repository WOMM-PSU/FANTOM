import { describe, expect, it } from "vitest";
import {
  angleDiffDeg,
  DEG_TO_RAD,
  degToRad,
  normalizeDeg,
  radToDeg,
  RAD_TO_DEG,
} from "../src/core/angles.js";

describe("normalizeDeg", () => {
  it("leaves values already in [0, 360) unchanged", () => {
    expect(normalizeDeg(0)).toBe(0);
    expect(normalizeDeg(0.5)).toBe(0.5);
    expect(normalizeDeg(359.999)).toBeCloseTo(359.999, 10);
  });

  it("wraps full turns to zero", () => {
    expect(normalizeDeg(360)).toBe(0);
    expect(normalizeDeg(720)).toBe(0);
    expect(normalizeDeg(-360)).toBe(0);
    expect(normalizeDeg(720.5)).toBeCloseTo(0.5, 10);
  });

  it("wraps negative angles positively", () => {
    expect(normalizeDeg(-1)).toBe(359);
    expect(normalizeDeg(-370)).toBe(350);
    expect(normalizeDeg(-10)).toBe(350);
    expect(normalizeDeg(-720.25)).toBeCloseTo(359.75, 10);
  });
});

describe("angleDiffDeg", () => {
  it("computes signed differences", () => {
    expect(angleDiffDeg(10, 350)).toBe(20);
    expect(angleDiffDeg(350, 10)).toBe(-20);
    expect(angleDiffDeg(179, -179)).toBe(-2);
    expect(angleDiffDeg(-179, 179)).toBe(2);
  });

  it("is wrap-safe across 0/360", () => {
    expect(angleDiffDeg(0, 360)).toBe(0);
    expect(angleDiffDeg(360, 0)).toBe(0);
    expect(angleDiffDeg(370, 10)).toBe(0);
    expect(angleDiffDeg(-10, 350)).toBe(0);
    expect(angleDiffDeg(0.1, 359.9)).toBeCloseTo(0.2, 10);
  });

  it("uses +180 for the exact half-turn case", () => {
    expect(angleDiffDeg(0, 180)).toBe(180);
    expect(angleDiffDeg(180, 0)).toBe(180);
    expect(angleDiffDeg(-90, 90)).toBe(180);
    expect(angleDiffDeg(90, -90)).toBe(180);
  });

  it("stays within (-180, 180] for many inputs", () => {
    for (let a = -1080; a <= 1080; a += 7.5) {
      for (let b = -1080; b <= 1080; b += 11.25) {
        const diff = angleDiffDeg(a, b);
        expect(diff).toBeGreaterThan(-180);
        expect(diff).toBeLessThanOrEqual(180);
      }
    }
  });

  it("never normalizes a NaN into a number", () => {
    expect(Number.isNaN(angleDiffDeg(Number.NaN, 0))).toBe(true);
  });
});

describe("degree/radian conversion", () => {
  it("round-trips", () => {
    expect(radToDeg(degToRad(37))).toBeCloseTo(37, 10);
    expect(degToRad(180)).toBeCloseTo(Math.PI, 10);
    expect(radToDeg(Math.PI / 2)).toBeCloseTo(90, 10);
  });

  it("exposes the conversion factors", () => {
    expect(DEG_TO_RAD * RAD_TO_DEG).toBeCloseTo(1, 12);
  });
});
