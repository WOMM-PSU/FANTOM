import type { LatLng } from "@fantom/shared";
import { degToRad, normalizeDeg, radToDeg } from "./angles.js";

/** Mean Earth radius (IUGG), in metres. Used consistently by all helpers. */
const EARTH_RADIUS_M = 6_371_008.8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Shortest signed longitude difference in degrees, in [-180, 180). */
function shortestLngDeltaDeg(deltaDeg: number): number {
  return ((deltaDeg + 540) % 360) - 180;
}

/**
 * Great-circle distance between two points in metres.
 *
 * Uses the haversine formula; suitable for the short ranges this game cares
 * about and stable for antipodal points too.
 */
export function haversineM(a: LatLng, b: LatLng): number {
  const lat1 = degToRad(a.lat);
  const lat2 = degToRad(b.lat);
  const dLat = degToRad(b.lat - a.lat);
  const dLng = degToRad(b.lng - a.lng);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = clamp(
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng,
    0,
    1,
  );

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Initial bearing from `from` to `to` in degrees: 0 = north, clockwise,
 * normalized to [0, 360). Two identical points return 0.
 */
export function bearingDeg(from: LatLng, to: LatLng): number {
  const lat1 = degToRad(from.lat);
  const lat2 = degToRad(to.lat);
  const dLng = degToRad(to.lng - from.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return normalizeDeg(radToDeg(Math.atan2(y, x)));
}

/**
 * Project `p` into a local east/north metre frame centred on `origin`.
 *
 * This is the equirectangular approximation: accurate for the small arena
 * distances FANTOM uses, and never intended as a global projection. The mean
 * latitude of the two points is used to reduce scale error. Longitude changes
 * are wrapped so a point just across the antimeridian stays local.
 */
export function toLocalMeters(
  origin: LatLng,
  p: LatLng,
): { east: number; north: number } {
  const meanLatRad = degToRad((origin.lat + p.lat) / 2);
  const north = degToRad(p.lat - origin.lat) * EARTH_RADIUS_M;
  const east =
    degToRad(shortestLngDeltaDeg(p.lng - origin.lng)) *
    EARTH_RADIUS_M *
    Math.cos(meanLatRad);

  return { east, north };
}
