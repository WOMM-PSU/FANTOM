import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;

/* ───────────── primitives ───────────── */
export const Id = z.string().min(1).max(64);
export const EpochMs = z.number().int().nonnegative();
export const LatLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLng>;

export const MatchMode = z.enum(["ffa", "assassin", "team_deathmatch"]);
export const MatchPhase = z.enum(["lobby", "countdown", "active", "finished"]);
export const PlayerStatus = z.enum(["alive", "out_of_zone", "eliminated"]);
export const PlayerRole = z.enum(["killer", "healer", "assassin", "survivor"]);
export const WeaponId = z.enum(["pulse", "ravager", "viper"]);
export const PickupKind = z.enum(["weapon", "health", "shield"]);
export const LocationQuality = z.enum(["good", "poor", "stale", "none"]);
export type MatchMode = z.infer<typeof MatchMode>;
export type MatchPhase = z.infer<typeof MatchPhase>;
export type PlayerStatus = z.infer<typeof PlayerStatus>;
export type PlayerRole = z.infer<typeof PlayerRole>;
export type WeaponId = z.infer<typeof WeaponId>;

export const ErrorCode = z.enum([
  "BAD_MESSAGE",
  "UNAUTHENTICATED",
  "SESSION_EXPIRED",
  "PROTOCOL_VERSION_MISMATCH",
  "WRONG_PHASE",
  "NOT_HOST",
  "INVALID_CONFIG",
  "LOBBY_FULL",
  "MATCH_NOT_FOUND",
  "RATE_LIMITED",
  "INTERNAL",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** One enum for rejected shots, heals, and pickups. */
export const RejectReason = z.enum([
  // state / eligibility
  "WRONG_PHASE",
  "NOT_CONNECTED",
  "SHOOTER_ELIMINATED",
  "SHOOTER_OUT_OF_ZONE",
  "SPAWN_LOCKED",
  "ROLE_CANNOT_ACT",
  "NO_WEAPON",
  "RELOADING",
  "COOLDOWN",
  "NO_AMMO",
  // target
  "INVALID_TARGET",
  "TARGET_ELIMINATED",
  "TARGET_OUT_OF_ZONE",
  "TARGET_PROTECTED",
  "FRIENDLY_TARGET",
  // location
  "LOCATION_UNAVAILABLE",
  "LOCATION_TOO_POOR",
  // aim evidence
  "EVIDENCE_STALE",
  "EVIDENCE_LOW_CONFIDENCE",
  "EVIDENCE_AMBIGUOUS",
  "TARGET_OCCLUDED",
  "AIM_DISAGREEMENT",
  "OUT_OF_RANGE",
  "RANGE_CONTRADICTORY",
  "DEV_EVIDENCE_NOT_ALLOWED",
  // pickups / heals
  "PICKUP_UNAVAILABLE",
  "PICKUP_TOO_FAR",
  "HEAL_COOLDOWN",
  "HEAL_FULL_HEALTH",
  "HEAL_SELF",
  // generic
  "RATE_LIMITED",
  "DUPLICATE_REQUEST",
  "MALFORMED",
]);
export type RejectReason = z.infer<typeof RejectReason>;

/* ───────────── match config ───────────── */
export const MatchConfig = z.object({
  mode: MatchMode,
  durationSec: z.number().int().min(60).max(3600),
  arena: z
    .object({
      polygon: z.array(LatLng).min(3).max(64),
      boundaryMarginM: z.number().min(0).max(50),
    })
    .nullable(), // null until the host sets it
  minimap: z.object({
    enabled: z.boolean(),
    showAllies: z.boolean(),
    showEnemies: z.boolean(), // server may clamp by mode
    showPickups: z.boolean(),
  }),
  pickups: z.object({
    weapons: z.boolean(),
    health: z.boolean(),
    shields: z.boolean(),
    respawnSec: z.number().int().min(5).max(300),
  }),
  team: z.object({
    teamCount: z.number().int().min(2).max(4),
    killersPerHealer: z.number().int().min(1).max(8),
  }),
  spawnLockoutSec: z.number().int().min(0).max(60),
  maxRangeM: z.number().min(5).max(100),
  devMode: z.boolean(), // DEV_ONLY shortcuts; never in production play
});
export type MatchConfig = z.infer<typeof MatchConfig>;
export const MatchConfigPatch = MatchConfig.partial(); // section-level replacement
export type MatchConfigPatch = z.infer<typeof MatchConfigPatch>;

/* ───────────── aim evidence ───────────── */
export const MarkerCode = z.number().int().min(0).max(255);

export const AimEvidence = z.object({
  source: z.enum(["camera", "dev_simulated"]),
  ageMs: z.number().int().min(0).max(5000), // client-measured age when sent
  targetMarkerCode: MarkerCode,
  visibleMarkerCodes: z.array(MarkerCode).max(8),
  markerConfidence: z.number().min(0).max(1),
  markerVisibleFraction: z.number().min(0).max(1), // occlusion proxy
  markerOffsetDeg: z.object({
    // marker center vs. optical axis
    x: z.number().min(-90).max(90), // + = right
    y: z.number().min(-90).max(90), // + = up
  }),
  markerWidthPx: z.number().positive().max(10000),
  frameWidthPx: z.number().int().positive().max(10000),
  hfovDeg: z.number().min(20).max(120),
  estimatedDistanceM: z.number().positive().max(500).nullable(),
  camera: z.object({
    // calibrated optical-axis direction
    headingDeg: z.number().min(0).lt(360), // 0 = north, clockwise
    pitchDeg: z.number().min(-90).max(90),
    rollDeg: z.number().min(-180).max(180),
    headingAccuracyDeg: z.number().min(0).max(180).nullable(),
    headingSource: z.enum(["absolute", "relative"]),
  }),
});
export type AimEvidence = z.infer<typeof AimEvidence>;

/* ───────────── views (server → client) ───────────── */
export const PlayerPublic = z.object({
  id: Id,
  displayName: z.string().min(1).max(20),
  teamId: Id.nullable(),
  role: PlayerRole.nullable(), // null where hidden / not applicable
  status: PlayerStatus,
  connected: z.boolean(),
  ready: z.boolean(),
  healthFraction: z.number().min(0).max(1).nullable(),
  score: z.number().int(),
  position: LatLng.nullable(), // null unless viewer is allowed to see it
});
export type PlayerPublic = z.infer<typeof PlayerPublic>;

export const SelfView = z.object({
  playerId: Id,
  markerCode: MarkerCode, // only ever sent to its owner
  health: z.number(),
  maxHealth: z.number(),
  shield: z.number(),
  weaponId: WeaponId.nullable(),
  ammo: z.number().int().nonnegative(),
  nextShotAt: EpochMs,
  reloadCompleteAt: EpochMs.nullable(),
  spawnLockedUntil: EpochMs,
  locationQuality: LocationQuality,
  inZone: z.boolean().nullable(), // null while quality is too poor to decide
  returnGraceUntil: EpochMs.nullable(),
});
export type SelfView = z.infer<typeof SelfView>;

export const PickupView = z.object({
  id: Id,
  kind: PickupKind,
  weaponId: WeaponId.nullable(),
  position: LatLng,
  available: z.boolean(),
  respawnAt: EpochMs.nullable(),
});
export type PickupView = z.infer<typeof PickupView>;

export const MatchResult = z.object({
  winner: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("player"), playerId: Id }),
    z.object({ kind: z.literal("team"), teamId: Id }),
    z.object({ kind: z.literal("assassin") }),
    z.object({ kind: z.literal("survivors") }),
    z.object({ kind: z.literal("draw") }),
    z.object({ kind: z.literal("invalid"), reason: z.string().max(200) }),
  ]),
  endedReason: z.enum([
    "timer",
    "last_standing",
    "all_survivors_eliminated",
    "abandoned",
    "host_ended",
  ]),
  standings: z.array(
    z.object({
      playerId: Id,
      displayName: z.string(),
      teamId: Id.nullable(),
      role: PlayerRole.nullable(),
      eliminations: z.number().int(),
      deaths: z.number().int(),
      score: z.number().int(),
      survived: z.boolean(),
    }),
  ),
});
export type MatchResult = z.infer<typeof MatchResult>;

export const MatchState = z.object({
  matchId: Id,
  joinCode: z.string().min(4).max(8),
  phase: MatchPhase,
  hostPlayerId: Id,
  config: MatchConfig,
  players: z.array(PlayerPublic).max(32),
  self: SelfView,
  pickups: z.array(PickupView),
  teamScores: z.record(z.string(), z.number().int()),
  countdownEndsAt: EpochMs.nullable(),
  startedAt: EpochMs.nullable(),
  endsAt: EpochMs.nullable(),
  result: MatchResult.nullable(),
});
export type MatchState = z.infer<typeof MatchState>;

/* ───────────── HTTP ───────────── */
export const DisplayName = z.string().trim().min(1).max(20);
export const CreateMatchRequest = z.object({
  displayName: DisplayName,
  config: MatchConfigPatch.optional(),
});
export type CreateMatchRequest = z.infer<typeof CreateMatchRequest>;
export const JoinRequest = z.object({ displayName: DisplayName });
export type JoinRequest = z.infer<typeof JoinRequest>;
export const JoinResponse = z.object({
  matchId: Id,
  joinCode: z.string(),
  joinUrl: z.string().url(),
  playerId: Id,
  sessionToken: z.string().min(16).max(128),
});
export type JoinResponse = z.infer<typeof JoinResponse>;
export const MatchSummary = z.object({
  joinCode: z.string(),
  phase: MatchPhase,
  mode: MatchMode,
  playerCount: z.number().int(),
  maxPlayers: z.number().int(),
  joinable: z.boolean(),
});
export type MatchSummary = z.infer<typeof MatchSummary>;
export const ApiError = z.object({
  error: z.object({ code: ErrorCode, message: z.string() }),
});
export type ApiError = z.infer<typeof ApiError>;

/* ───────────── WebSocket: client → server ───────────── */
const clientMsg = <T extends string, P extends z.ZodTypeAny>(type: T, payload: P) =>
  z.object({ v: z.literal(PROTOCOL_VERSION), id: Id, type: z.literal(type), payload });

export const ClientMessage = z.discriminatedUnion("type", [
  clientMsg("HELLO", z.object({ sessionToken: z.string().min(16).max(128) })),
  clientMsg("PING", z.object({ clientSentAt: z.number() })),
  clientMsg("LEAVE_MATCH", z.object({})),
  clientMsg("UPDATE_CONFIG", z.object({ config: MatchConfigPatch })),
  clientMsg(
    "PLAYER_READY",
    z.object({
      ready: z.boolean(),
      permissions: z.object({
        camera: z.boolean(),
        orientation: z.boolean(),
        location: z.boolean(),
      }),
    }),
  ),
  clientMsg("REQUEST_MATCH_START", z.object({})),
  clientMsg(
    "UPDATE_LOCATION",
    z.object({
      position: LatLng,
      accuracyM: z.number().min(0).max(10000),
      clientTimestamp: z.number(),
    }),
  ),
  clientMsg("REQUEST_SHOT", z.object({ evidence: AimEvidence })),
  clientMsg(
    "REQUEST_HEAL",
    z.object({ targetMarkerCode: MarkerCode, evidence: AimEvidence.optional() }),
  ),
  clientMsg("REQUEST_PICKUP", z.object({ pickupId: Id })),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

/* ───────────── WebSocket: server → client ───────────── */
const serverMsg = <T extends string, P extends z.ZodTypeAny>(type: T, payload: P) =>
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    seq: z.number().int().nonnegative(),
    serverTime: EpochMs,
    replyTo: Id.optional(),
    type: z.literal(type),
    payload,
  });

export const ServerMessage = z.discriminatedUnion("type", [
  serverMsg(
    "WELCOME",
    z.object({
      playerId: Id,
      protocolVersion: z.literal(PROTOCOL_VERSION),
      state: MatchState,
    }),
  ),
  serverMsg("MATCH_STATE", MatchState),
  serverMsg("PONG", z.object({ clientSentAt: z.number() })),
  serverMsg(
    "SHOT_ACCEPTED",
    z.object({ targetPlayerId: Id, damageDealt: z.number(), eliminated: z.boolean() }),
  ),
  serverMsg("SHOT_REJECTED", z.object({ reason: RejectReason })),
  serverMsg(
    "PLAYER_DAMAGED",
    z.object({
      attackerId: Id.nullable(),
      damage: z.number(),
      source: z.enum(["shot", "out_of_zone"]),
    }),
  ),
  serverMsg(
    "PLAYER_ELIMINATED",
    z.object({
      playerId: Id,
      byPlayerId: Id.nullable(),
      cause: z.enum(["shot", "out_of_zone"]),
    }),
  ),
  serverMsg("HEAL_APPLIED", z.object({ healerId: Id, targetId: Id, amount: z.number() })),
  serverMsg("HEAL_REJECTED", z.object({ reason: RejectReason })),
  serverMsg("PICKUP_COLLECTED", z.object({ pickupId: Id, byPlayerId: Id, kind: PickupKind })),
  serverMsg("PICKUP_REJECTED", z.object({ reason: RejectReason })),
  serverMsg("MATCH_FINISHED", z.object({ result: MatchResult })),
  serverMsg("ERROR", z.object({ code: ErrorCode, message: z.string().max(300) })),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;
