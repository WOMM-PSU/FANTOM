import { describe, expect, it } from "vitest";
import { bearingDeg, haversineM, toLocalMeters } from "../src/core/geo.js";

const ONE_DEGREE_M = 111_194.926_487_5;

describe("haversineM", () => {
  it("returns zero for identical points", () => {
    expect(haversineM({ lat: 12.34, lng: 56.78 }, { lat: 12.34, lng: 56.78 })).toBe(0);
  });

  it("matches the length of one degree of latitude", () => {
    expect(haversineM({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(ONE_DEGREE_M, 0);
    expect(haversineM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(ONE_DEGREE_M, 0);
  });

  it("shrinks longitude distances away from the equator", () => {
    const at60 = haversineM({ lat: 60, lng: 0 }, { lat: 60, lng: 1 });
    expect(at60).toBeCloseTo(ONE_DEGREE_M * Math.cos((60 * Math.PI) / 180), 0);
  });

  it("is symmetric", () => {
    const a = { lat: -33.8688, lng: 151.2093 };
    const b = { lat: -33.8701, lng: 151.2119 };
    expect(haversineM(a, b)).toBeCloseTo(haversineM(b, a), 6);
  });

  it("handles the antimeridian without a full-earth detour", () => {
    const west = { lat: 0, lng: 179.999 };
    const east = { lat: 0, lng: -179.999 };
    expect(haversineM(west, east)).toBeCloseTo(ONE_DEGREE_M * 0.002, 1);
  });

  it("handles antipodal points", () => {
    expect(haversineM({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(
      Math.PI * 6_371_008.8,
      0,
    );
  });
});

describe("bearingDeg", () => {
  const origin = { lat: 0, lng: 0 };

  it("uses 0 = north and turns clockwise", () => {
    expect(bearingDeg(origin, { lat: 1, lng: 0 })).toBeCloseTo(0, 6);
    expect(bearingDeg(origin, { lat: 0, lng: 1 })).toBeCloseTo(90, 6);
    expect(bearingDeg(origin, { lat: -1, lng: 0 })).toBeCloseTo(180, 6);
    expect(bearingDeg(origin, { lat: 0, lng: -1 })).toBeCloseTo(270, 6);
  });

  it("returns a normalized 0..360 range", () => {
    for (let lat = -80; lat <= 80; lat += 20) {
      for (let lng = -179; lng <= 179; lng += 23) {
        const bearing = bearingDeg({ lat: 10, lng: 20 }, { lat, lng });
        expect(bearing).toBeGreaterThanOrEqual(0);
        expect(bearing).toBeLessThan(360);
      }
    }
  });

  it("takes the short path across the antimeridian", () => {
    expect(bearingDeg({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 })).toBeCloseTo(90, 4);
    expect(bearingDeg({ lat: 0, lng: -179.9 }, { lat: 0, lng: 179.9 })).toBeCloseTo(270, 4);
  });

  it("returns zero for identical points", () => {
    expect(bearingDeg({ lat: 10, lng: 20 }, { lat: 10, lng: 20 })).toBe(0);
  });
});

describe("toLocalMeters", () => {
  const origin = { lat: 0, lng: 0 };

  it("returns east/north in metres, not degrees", () => {
    expect(toLocalMeters(origin, { lat: 0, lng: 0.001 })).toEqual({
      east: expect.closeTo(ONE_DEGREE_M * 0.001, 1),
      north: expect.closeTo(0, 6),
    });
    expect(toLocalMeters(origin, { lat: 0.001, lng: 0 })).toEqual({
      east: expect.closeTo(0, 6),
      north: expect.closeTo(ONE_DEGREE_M * 0.001, 1),
    });
  });

  it("scales east by latitude", () => {
    const local = toLocalMeters({ lat: 60, lng: 0 }, { lat: 60, lng: 0.001 });
    expect(local.east).toBeCloseTo(ONE_DEGREE_M * 0.001 * Math.cos((60 * Math.PI) / 180), 1);
    expect(local.north).toBeCloseTo(0, 6);
  });

  it("handles negative offsets", () => {
    const local = toLocalMeters({ lat: 10, lng: 20 }, { lat: 9.999, lng: 19.999 });
    expect(local.north).toBeLessThan(0);
    expect(local.east).toBeLessThan(0);
  });

  it("wraps longitude across the antimeridian", () => {
    const local = toLocalMeters({ lat: 0, lng: 179.999 }, { lat: 0, lng: -179.999 });
    expect(local.east).toBeCloseTo(ONE_DEGREE_M * 0.002, 1);
    expect(local.north).toBeCloseTo(0, 6);
  });

  it("returns zero for the origin itself", () => {
    expect(toLocalMeters({ lat: -12, lng: 34 }, { lat: -12, lng: 34 })).toEqual({
      east: 0,
      north: 0,
    });
  });
});
