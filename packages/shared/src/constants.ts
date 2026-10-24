import type { MatchConfig, WeaponId } from "./protocol.js";

export type WeaponDefinition = {
  id: WeaponId;
  name: string;
  damage: number;
  magazineSize: number;
  fireIntervalMs: number;
  reloadDurationMs: number;
};

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  pulse: {
    id: "pulse",
    name: "Pulse",
    damage: 25,
    magazineSize: 12,
    fireIntervalMs: 500,
    reloadDurationMs: 1200,
  },
  ravager: {
    id: "ravager",
    name: "Ravager",
    damage: 50,
    magazineSize: 4,
    fireIntervalMs: 1200,
    reloadDurationMs: 2000,
  },
  viper: {
    id: "viper",
    name: "Viper",
    damage: 10,
    magazineSize: 30,
    fireIntervalMs: 150,
    reloadDurationMs: 2500,
  },
};

export const MAX_PLAYERS = 16;
export const MAX_MESSAGE_BYTES = 8 * 1024;
export const DISCONNECT_TIMEOUT_MS = 30_000;

export const MAX_HEALTH = 100;
export const MAX_SHIELD = 50;
export const HEALTH_PACK_AMOUNT = 25;
export const OUT_OF_ZONE_DRAIN_HP_PER_SEC = 10;
export const RETURN_GRACE_MS = 1000;
export const SPAWN_LOCKOUT_SEC = { ffa: 5, assassin: 15, team_deathmatch: 5 } as const;

export const HEAL = { rangeM: 5, amount: 25, cooldownPerTargetMs: 5000 } as const;

export const PICKUP_REVEAL_RADIUS_M = 15;
export const PICKUP_COLLECT_RADIUS_M = 5;

/** PROVISIONAL — tuned by Dev C on real devices. Do not scatter copies. */
export const AIM_DEFAULTS = {
  maxEvidenceAgeMs: 1500,
  reticleToleranceDeg: 6,
  agreementToleranceDeg: 12,
  minMarkerConfidence: 0.6,
  minMarkerVisibleFraction: 0.8,
  maxHeadingAccuracyDeg: 25,
} as const;

/** PROVISIONAL — location handling. */
export const LOCATION = {
  maxAgeMs: 5000,
  maxAccuracyM: 25,
  maxSpeedMps: 12,
  exitConfirmationMs: 3000,
  minUpdateIntervalMs: 500,
} as const;

export const DEFAULT_MATCH_CONFIG = {
  mode: "ffa",
  durationSec: 300,
  arena: null,
  minimap: { enabled: true, showAllies: true, showEnemies: false, showPickups: true },
  pickups: { weapons: true, health: true, shields: true, respawnSec: 30 },
  team: { teamCount: 2, killersPerHealer: 2 },
  spawnLockoutSec: 5,
  maxRangeM: 30,
  devMode: false,
} as const satisfies MatchConfig;
