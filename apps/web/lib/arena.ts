import type { LatLng } from "@fantom/shared";

const EARTH_RADIUS_M = 6_371_000;

/**
 * Generates a regular N-sided polygon (default 24 sides per PLAN.md P2 #8)
 * centered at `center` with radius `radiusM` in meters.
 */
export function buildCircularArenaPolygon(
  center: LatLng,
  radiusM: number,
  sides = 24
): LatLng[] {
  const clampedSides = Math.max(3, Math.min(64, Math.floor(sides)));
  const latRad = (center.lat * Math.PI) / 180;
  const metersPerDegLat = (Math.PI / 180) * EARTH_RADIUS_M;
  const metersPerDegLng = Math.max(1e-6, metersPerDegLat * Math.cos(latRad));

  const polygon: LatLng[] = [];
  for (let i = 0; i < clampedSides; i++) {
    const angle = (2 * Math.PI * i) / clampedSides;
    const northM = radiusM * Math.cos(angle);
    const eastM = radiusM * Math.sin(angle);

    const lat = Math.max(-90, Math.min(90, center.lat + northM / metersPerDegLat));
    let lng = center.lng + eastM / metersPerDegLng;
    if (lng > 180) lng -= 360;
    if (lng < -180) lng += 360;

    polygon.push({
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
    });
  }
  return polygon;
}
