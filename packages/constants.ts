/**
 * FANTOM shared constants — single source of truth for balance numbers.
 * Never duplicate these in apps/web or apps/server. Values marked PROVISIONAL
 * must be play-tested (see CLAUDE.md §7, §8, §9.5, §10).
 */

export const WEAPON_IDS = ["pulse", "ravager", "viper"] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];

export type WeaponDefinition = {
  id: WeaponId;
  name: string;
  damage: number;
  magazineSize: number;
  fireIntervalMs: number;
  reloadDurationMs: number;
};

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  pulse: { id: "pulse", name: "Pulse", damage: 25, magazineSize: 12, fireIntervalMs: 500, reloadDurationMs: 1200 },
  ravager: { id: "ravager", name: "Ravager", damage: 50, magazineSize: 4, fireIntervalMs: 1200, reloadDurationMs: 2000 },
  viper: { id: "viper", name: "Viper", damage: 10, magazineSize: 30, fireIntervalMs: 150, reloadDurationMs: 2500 },
};

export const LIMITS = {
  maxPlayers: 12,
  minPlayersToStart: 2,
  maxMessageBytes: 8192,
  displayNameMaxLength: 20,
  /** Marker ids are assigned per match by the server: 0..markerIdMax (12-bit). */
  markerIdMax: 4095,
  maxOtherMarkersInEvidence: 8,
} as const;

export const COMBAT = {
  maxHealth: 100,
  maxShield: 50, // total damage one shield pickup can absorb
  healthPackAmount: 25,
  heal: { rangeM: 5, amount: 25, cooldownPerTargetMs: 5000 }, // PROVISIONAL
  pickupRadiusM: 6, // PROVISIONAL (GPS error is several metres)
} as const;

export const ARENA_RULES = {
  outOfZoneDrainHpPerSec: 10,
  returnGraceMs: 1000,
  /** PROVISIONAL: require consistent evidence before confirming an exit. */
  exitConfirmationMs: 3000,
  /** Above this reported accuracy the server pauses boundary decisions for the player. */
  maxUsableAccuracyM: 25,
  /** Location older than this is "stale" and not trusted for combat or boundary. */
  maxLocationAgeMs: 5000,
  maxPlausibleSpeedMps: 12,
  minLocationIntervalMs: 500,
} as const;

export const TIMING = {
  stateBroadcastHz: 4,
  countdownSec: 10,
  /** Server removes a disconnected player from combat immediately; drops them after this. */
  reconnectTimeoutMs: 60_000,
  pingIntervalMs: 5000,
} as const;

/** PROVISIONAL — calibrate on real devices (CLAUDE.md §9.5). Server config, not client trust. */
export const AIM_DEFAULTS = {
  maxEvidenceAgeMs: 500,
  minMarkerConfidence: 0.6,
  /** Marker must be within this angle of the camera's optical axis (reticle gate). */
  reticleRadiusDeg: 6,
  /** Base angular tolerance between GPS-expected and camera/orientation-observed direction. */
  baseToleranceDeg: 8,
  /** Added tolerance = atan(gpsErrorM / distanceM), capped. */
  maxGpsToleranceDeg: 25,
  /** Max disagreement between GPS distance and camera-estimated distance (ratio). */
  maxDistanceDisagreementRatio: 0.6,
} as const;
