/**
 * FANTOM wire contract — PROTOCOL_VERSION 1 (DRAFT until the Contract Freeze, see PLAN.md §4).
 *
 * Rules:
 *  - This file is the ONLY definition of what crosses the network. Server and web both import it.
 *  - Every incoming message is validated with these schemas at runtime (CLAUDE.md §12.2).
 *  - Clients REQUEST; the server DECIDES (CLAUDE.md §13). No message lets a client declare a hit,
 *    damage, ammo, score, role, or winner.
 *  - Changing this file requires a "contract change" PR approved by the owners of both sides.
 */
import { z } from "zod";
import { LIMITS, WEAPON_IDS } from "./constants";

export const PROTOCOL_VERSION = 1 as const;

/* ───────────────────────── primitives ───────────────────────── */

export const Id = z.string().min(1).max(64);
export const RequestId = z.string().min(1).max(64);
/** Epoch milliseconds on the SERVER clock unless the field name says client. */
export const EpochMs = z.number().int().nonnegative();
export const LatLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLng>;
/** 6 chars, no I/O/0/1 to stay human-readable. A join code is discovery, NOT authorization. */
export const JoinCode = z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/);
/** Server additionally sanitizes; clients must render as text, never as HTML. */
export const DisplayName = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.displayNameMaxLength)
  .regex(/^[^\u0000-\u001f\u007f<>&"`]+$/);
export const MarkerId = z.number().int().min(0).max(LIMITS.markerIdMax);
/** Schema for the WeaponId type exported from constants.ts. */
export const WeaponIdSchema = z.enum(WEAPON_IDS);

/* ───────────────────────── enums ───────────────────────── */

export const GameMode = z.enum(["ffa", "assassin", "tdm"]);
export type GameMode = z.infer<typeof GameMode>;
export const MatchPhase = z.enum(["lobby", "countdown", "active", "finished"]);
export type MatchPhase = z.infer<typeof MatchPhase>;
export const PlayerRole = z.enum(["killer", "healer", "assassin", "survivor"]);
export type PlayerRole = z.infer<typeof PlayerRole>;
export const PlayerStatus = z.enum(["alive", "out_of_zone", "eliminated"]);
export type PlayerStatus = z.infer<typeof PlayerStatus>;
export const PickupKind = z.enum(["weapon", "health", "shield"]);
export type PickupKind = z.infer<typeof PickupKind>;
export const PermissionState = z.enum(["granted", "denied", "unavailable", "unknown"]);
export type PermissionState = z.infer<typeof PermissionState>;
/** How trustworthy THIS player's last location is, as judged by the server. */
export const LocationQuality = z.enum(["ok", "poor", "stale", "unknown"]);
export type LocationQuality = z.infer<typeof LocationQuality>;

export const ErrorCode = z.enum([
  "BAD_MESSAGE",
  "UNSUPPORTED_VERSION",
  "UNAUTHORIZED",
  "SESSION_REPLACED",
  "NOT_HOST",
  "WRONG_PHASE",
  "MATCH_NOT_FOUND",
  "MATCH_FULL",
  "INVALID_SETTINGS",
  "START_BLOCKED",
  "RATE_LIMITED",
  "INTERNAL",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** Why the player cannot fire right now (also used as the first part of shot rejection). */
export const FireBlockReason = z.enum([
  "wrong_phase",
  "eliminated",
  "out_of_zone",
  "location_unusable",
  "spawn_locked",
  "no_weapon",
  "role_cannot_fire",
  "cooldown",
  "reloading",
  "empty",
]);
export type FireBlockReason = z.infer<typeof FireBlockReason>;

export const ShotRejectReason = z.enum([
  ...FireBlockReason.options,
  "rate_limited",
  "duplicate_request",
  "evidence_stale",
  "evidence_low_confidence",
  "no_target",
  "target_unknown",
  "target_ineligible", // eliminated / out of zone / protected / same team / wrong mode rules
  "ambiguous_target",
  "aim_disagreement",
  "out_of_range",
  "range_contradictory",
  "location_stale",
  "simulation_not_allowed",
]);
export type ShotRejectReason = z.infer<typeof ShotRejectReason>;

export const ActionRejectReason = z.enum([
  "wrong_phase",
  "eliminated",
  "out_of_zone",
  "role_cannot_act",
  "target_unknown",
  "target_ineligible",
  "out_of_range",
  "cooldown",
  "already_collected",
  "rate_limited",
  "location_unusable",
]);
export type ActionRejectReason = z.infer<typeof ActionRejectReason>;

/* ───────────────────────── match settings ───────────────────────── */

export const MatchSettings = z.object({
  mode: GameMode,
  durationSec: z.number().int().min(60).max(3600),
  /** null until the host defines it; the server blocks START while null (unless dev simulation). */
  arena: z
    .object({
      polygon: z.array(LatLng).min(3).max(32),
      boundaryMarginM: z.number().min(0).max(30),
    })
    .nullable(),
  maxRangeM: z.number().min(5).max(100),
  spawnLockoutSec: z.number().int().min(0).max(60),
  minimap: z.object({
    enabled: z.boolean(),
    showBoundary: z.boolean(),
    /** Server enforces mode rules on top of this (e.g. never leaks Survivors to the Assassin). */
    players: z.enum(["none", "teammates", "all"]),
    weaponDrops: z.boolean(),
    healthDrops: z.boolean(),
    shieldDrops: z.boolean(),
  }),
  pickups: z.object({
    weapons: z.boolean(),
    health: z.boolean(),
    shield: z.boolean(),
    respawnSec: z.number().int().min(10).max(600),
    weaponDropIntervalSec: z.number().int().min(10).max(600),
  }),
  ffa: z.object({ winCondition: z.enum(["score", "last_standing"]) }),
  tdm: z.object({
    teamCount: z.number().int().min(2).max(4),
    killersPerHealer: z.number().int().min(1).max(6),
  }),
});
export type MatchSettings = z.infer<typeof MatchSettings>;

/** Spec defaults (CLAUDE.md §6, §8.3). The server still validates every submitted settings object. */
export function defaultMatchSettings(mode: GameMode): MatchSettings {
  return {
    mode,
    durationSec: 600,
    arena: null,
    maxRangeM: 30,
    spawnLockoutSec: mode === "assassin" ? 15 : 5,
    minimap: {
      enabled: true,
      showBoundary: true,
      players: mode === "tdm" ? "teammates" : "none",
      weaponDrops: true,
      healthDrops: true,
      shieldDrops: true,
    },
    pickups: {
      weapons: mode === "ffa",
      health: mode === "ffa",
      shield: mode === "ffa",
      respawnSec: 60,
      weaponDropIntervalSec: 90,
    },
    ffa: { winCondition: "score" },
    tdm: { teamCount: 2, killersPerHealer: 2 },
  };
}

/* ───────────────────────── aiming evidence ───────────────────────── */

/**
 * Produced on the client by the camera + orientation pipeline. NOT proof of a real hit
 * (a client can lie). The server cross-checks it against GPS geometry and game rules.
 * Angles: degrees. bearingOffsetDeg > 0 = marker right of the optical axis;
 * elevationOffsetDeg > 0 = above it. headingDeg: 0..360 clockwise from true north.
 */
export const AimEvidence = z.object({
  /** "simulated" is only honoured when the server runs with FANTOM_DEV_SIM=1. */
  source: z.enum(["camera", "simulated"]),
  /** Age of the marker detection and orientation sample when the request was sent (client monotonic). */
  detectionAgeMs: z.number().min(0).max(10_000),
  orientationAgeMs: z.number().min(0).max(10_000),
  marker: z.object({
    id: MarkerId,
    confidence: z.number().min(0).max(1),
    bearingOffsetDeg: z.number().min(-90).max(90),
    elevationOffsetDeg: z.number().min(-90).max(90),
    pixelWidth: z.number().positive().max(10_000),
    frameWidthPx: z.number().int().positive().max(10_000),
    frameHeightPx: z.number().int().positive().max(10_000),
    /** Pinhole estimate; null if the camera is not calibrated. */
    estimatedDistanceM: z.number().min(0).max(500).nullable(),
    /** Client saw part of the marker hidden / low corner confidence. Server treats true as reject. */
    occlusionSuspected: z.boolean(),
  }),
  /** Other decoded markers visible in the frame (ambiguity check). */
  otherMarkerIds: z.array(MarkerId).max(LIMITS.maxOtherMarkersInEvidence),
  orientation: z.object({
    headingDeg: z.number().min(0).lt(360),
    pitchDeg: z.number().min(-90).max(90),
    rollDeg: z.number().min(-180).max(180),
    headingAccuracyDeg: z.number().min(0).max(360).nullable(),
    headingSource: z.enum(["absolute", "relative", "unknown"]),
  }),
  camera: z.object({
    hFovDeg: z.number().min(20).max(140),
    calibrationId: z.string().max(32),
  }),
  /** Client-side reticle gate result, for diagnostics only. */
  reticleLocked: z.boolean(),
});
export type AimEvidence = z.infer<typeof AimEvidence>;

/* ───────────────────────── server-visible state ───────────────────────── */

export const Capabilities = z.object({
  camera: PermissionState,
  orientation: PermissionState,
  geolocation: PermissionState,
});
export type Capabilities = z.infer<typeof Capabilities>;

/** What every player may know about another player. The server filters per recipient. */
export const PlayerPublic = z.object({
  id: Id,
  displayName: DisplayName,
  isHost: z.boolean(),
  connected: z.boolean(),
  ready: z.boolean(),
  teamId: Id.nullable(),
  /** Assassin role is public to everyone; null in FFA and in lobby. */
  role: PlayerRole.nullable(),
  status: PlayerStatus,
  score: z.number().int(),
  eliminations: z.number().int().nonnegative(),
  deaths: z.number().int().nonnegative(),
  capabilities: Capabilities.nullable(),
  /** Present only for self and teammates. */
  health: z.number().int().min(0).optional(),
  /** Present ONLY when the mode + minimap settings allow this recipient to see it. */
  position: LatLng.optional(),
  positionAgeMs: z.number().int().nonnegative().optional(),
});
export type PlayerPublic = z.infer<typeof PlayerPublic>;

/** Private to the owning player. */
export const SelfState = z.object({
  health: z.number().int().min(0),
  maxHealth: z.number().int().positive(),
  shield: z.number().int().min(0),
  maxShield: z.number().int().positive(),
  weaponId: WeaponIdSchema.nullable(),
  ammo: z.number().int().min(0),
  magazineSize: z.number().int().min(0),
  nextShotAt: EpochMs,
  reloadCompleteAt: EpochMs.nullable(),
  spawnLockedUntil: EpochMs,
  /** Value the player's phone must display as its marker. Null until the match is active. */
  markerId: MarkerId.nullable(),
  locationQuality: LocationQuality,
  outOfZoneSince: EpochMs.nullable(),
  returnGraceUntil: EpochMs.nullable(),
  /** Server-computed; the HUD displays it and never re-derives game rules. */
  fireBlockedReason: FireBlockReason.nullable(),
  healCooldownsUntil: z.record(z.string(), EpochMs),
});
export type SelfState = z.infer<typeof SelfState>;

export const TeamPublic = z.object({
  id: Id,
  name: z.string().max(20),
  score: z.number().int(),
  memberIds: z.array(Id).max(LIMITS.maxPlayers),
});
export type TeamPublic = z.infer<typeof TeamPublic>;

export const PickupPublic = z.object({
  id: Id,
  kind: PickupKind,
  weaponId: WeaponIdSchema.nullable(),
  position: LatLng,
  available: z.boolean(),
  respawnsAt: EpochMs.nullable(),
});
export type PickupPublic = z.infer<typeof PickupPublic>;

export const MatchResult = z.object({
  winner: z.object({
    kind: z.enum(["player", "team", "assassin", "survivors", "draw", "none"]),
    id: Id.nullable(),
  }),
  reason: z.enum(["timer", "all_eliminated", "last_standing", "host_abort", "all_disconnected", "invalid"]),
  standings: z.array(
    z.object({
      playerId: Id,
      displayName: DisplayName,
      teamId: Id.nullable(),
      role: PlayerRole.nullable(),
      score: z.number().int(),
      eliminations: z.number().int().nonnegative(),
      deaths: z.number().int().nonnegative(),
      survived: z.boolean(),
    }),
  ),
  teams: z.array(TeamPublic),
});
export type MatchResult = z.infer<typeof MatchResult>;

/** Complete per-recipient view of the match. Sent on connect, on change, and at <= 4 Hz while active. */
export const MatchSnapshot = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  serverTime: EpochMs,
  matchId: Id,
  joinCode: JoinCode,
  selfId: Id,
  hostId: Id,
  phase: MatchPhase,
  settings: MatchSettings,
  /** True only when the server runs FANTOM_DEV_SIM=1. The UI MUST show a persistent banner. */
  devSimulation: z.boolean(),
  /** Human-readable reasons START is currently blocked (empty = valid). */
  startBlockers: z.array(z.string().max(120)).max(16),
  countdownEndsAt: EpochMs.nullable(),
  startedAt: EpochMs.nullable(),
  endsAt: EpochMs.nullable(),
  players: z.array(PlayerPublic).max(LIMITS.maxPlayers),
  self: SelfState.nullable(),
  teams: z.array(TeamPublic),
  pickups: z.array(PickupPublic),
  result: MatchResult.nullable(),
});
export type MatchSnapshot = z.infer<typeof MatchSnapshot>;

/* ───────────────────────── HTTP (pre-connection) ───────────────────────── */
/*
 * POST /matches              body CreateMatchRequest -> 201 SessionGrant   (caller becomes host)
 * POST /matches/join         body JoinMatchRequest   -> 200 SessionGrant
 * GET  /matches/by-code/:joinCode                    -> 200 MatchLookup
 * GET  /health                                       -> 200 { ok: true, protocolVersion }
 * Errors: 4xx/5xx with HttpErrorBody.
 */
export const CreateMatchRequest = z.object({ displayName: DisplayName });
export const JoinMatchRequest = z.object({ joinCode: JoinCode, displayName: DisplayName });
export const SessionGrant = z.object({
  matchId: Id,
  joinCode: JoinCode,
  playerId: Id,
  /** Unguessable credential. Never put it in a QR code, marker, URL query, or log. */
  sessionToken: z.string().min(16).max(128),
  /** e.g. wss://api.example.com/ws */
  wsUrl: z.string().max(256),
});
export const MatchLookup = z.object({
  matchId: Id,
  joinCode: JoinCode,
  phase: MatchPhase,
  mode: GameMode,
  playerCount: z.number().int().nonnegative(),
  maxPlayers: z.number().int().positive(),
  joinable: z.boolean(),
});
export const HttpErrorBody = z.object({
  error: z.object({ code: ErrorCode, message: z.string().max(200) }),
});
export type CreateMatchRequest = z.infer<typeof CreateMatchRequest>;
export type JoinMatchRequest = z.infer<typeof JoinMatchRequest>;
export type SessionGrant = z.infer<typeof SessionGrant>;
export type MatchLookup = z.infer<typeof MatchLookup>;
export type HttpErrorBody = z.infer<typeof HttpErrorBody>;

/* ───────────────────────── WebSocket: client -> server ───────────────────────── */

const cmsg = <T extends string, P extends z.ZodType>(type: T, payload: P) =>
  z.strictObject({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal(type),
    /** Client-generated unique id. The server dedupes on it (idempotency) and echoes it in replies. */
    requestId: RequestId,
    payload,
  });

export const ClientMessage = z.discriminatedUnion("type", [
  /** MUST be the first message on a socket. Doubles as reconnect. Replaces any older socket for the player. */
  cmsg("CONNECT", z.object({ matchId: Id, sessionToken: z.string().min(16).max(128) })),
  cmsg("PING", z.object({ clientTime: z.number() })),
  cmsg("SET_SETTINGS", z.object({ settings: MatchSettings })), // host only, lobby only
  cmsg("SET_READY", z.object({ ready: z.boolean(), capabilities: Capabilities })),
  cmsg("START_MATCH", z.object({})), // host only; server validates
  cmsg("ABORT_MATCH", z.object({})), // host safety stop
  cmsg("LEAVE_MATCH", z.object({})),
  cmsg(
    "UPDATE_LOCATION",
    z.object({
      /** "simulated" only honoured when FANTOM_DEV_SIM=1. */
      source: z.enum(["gps", "simulated"]),
      position: LatLng,
      accuracyM: z.number().min(0).max(5000),
      headingDeg: z.number().min(0).lt(360).nullable(),
      speedMps: z.number().min(0).max(100).nullable(),
      /** Diagnostics only; the server stamps its own receive time. */
      clientTime: z.number(),
    }),
  ),
  /** Identity of the target is the marker the camera decoded; the server resolves it to a player. */
  cmsg("REQUEST_SHOT", z.object({ targetMarkerId: MarkerId.nullable(), evidence: AimEvidence.nullable() })),
  cmsg("REQUEST_HEAL", z.object({ targetPlayerId: Id })),
  cmsg("REQUEST_PICKUP", z.object({ pickupId: Id })),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;
export type ClientMessageType = ClientMessage["type"];

/* ───────────────────────── WebSocket: server -> client ───────────────────────── */

const smsg = <T extends string, P extends z.ZodType>(type: T, payload: P) =>
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal(type),
    /** Echo of the request this answers, or null for unsolicited broadcasts. */
    requestId: RequestId.nullable(),
    payload,
  });

export const ServerMessage = z.discriminatedUnion("type", [
  /** Authoritative per-recipient state. Clients replace local state with it. */
  smsg("STATE", z.object({ snapshot: MatchSnapshot })),
  smsg("PONG", z.object({ clientTime: z.number(), serverTime: EpochMs })),
  /** Only after this does the UI show a confirmed hit (CLAUDE.md §11.3). Sent to the shooter. */
  smsg(
    "SHOT_ACCEPTED",
    z.object({
      shotId: Id,
      targetPlayerId: Id,
      damage: z.number().int().nonnegative(),
      shieldAbsorbed: z.number().int().nonnegative(),
      targetEliminated: z.boolean(),
      ammoAfter: z.number().int().nonnegative(),
      nextShotAt: EpochMs,
    }),
  ),
  smsg("SHOT_REJECTED", z.object({ reason: ShotRejectReason })),
  /** Sent to the victim only. byPlayerId is null for out-of-zone drain. */
  smsg(
    "PLAYER_DAMAGED",
    z.object({
      byPlayerId: Id.nullable(),
      cause: z.enum(["shot", "out_of_zone"]),
      amount: z.number().int().nonnegative(),
      shieldAbsorbed: z.number().int().nonnegative(),
      healthAfter: z.number().int().nonnegative(),
      shieldAfter: z.number().int().nonnegative(),
    }),
  ),
  smsg(
    "PLAYER_ELIMINATED",
    z.object({ playerId: Id, byPlayerId: Id.nullable(), cause: z.enum(["shot", "out_of_zone"]) }),
  ),
  smsg(
    "HEAL_APPLIED",
    z.object({ healerId: Id, targetId: Id, amount: z.number().int().nonnegative(), targetHealthAfter: z.number().int() }),
  ),
  smsg("HEAL_INTERRUPTED", z.object({ healerId: Id, targetId: Id })),
  smsg(
    "PICKUP_COLLECTED",
    z.object({ pickupId: Id, byPlayerId: Id, kind: PickupKind, weaponId: WeaponIdSchema.nullable() }),
  ),
  smsg("ACTION_REJECTED", z.object({ action: z.enum(["heal", "pickup"]), reason: ActionRejectReason })),
  smsg("MATCH_FINISHED", z.object({ result: MatchResult })),
  smsg("ERROR", z.object({ code: ErrorCode, message: z.string().max(200) })),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;
export type ServerMessageType = ServerMessage["type"];

/* ───────────────────────── parsing helpers ───────────────────────── */

export type ParseResult<T> =
  | { ok: true; message: T }
  | { ok: false; code: "BAD_MESSAGE" | "UNSUPPORTED_VERSION"; detail: string };

function parseWith<S extends z.ZodType>(schema: S, raw: string): ParseResult<z.infer<S>> {
  if (new TextEncoder().encode(raw).length > LIMITS.maxMessageBytes) {
    return { ok: false, code: "BAD_MESSAGE", detail: "message too large" };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, code: "BAD_MESSAGE", detail: "invalid JSON" };
  }
  if (typeof json === "object" && json !== null && "v" in json && (json as { v: unknown }).v !== PROTOCOL_VERSION) {
    return { ok: false, code: "UNSUPPORTED_VERSION", detail: `expected v=${PROTOCOL_VERSION}` };
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    return { ok: false, code: "BAD_MESSAGE", detail: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 300) };
  }
  return { ok: true, message: result.data };
}

/** Server: validate every inbound frame with this before touching game state. */
export const parseClientMessage = (raw: string) => parseWith(ClientMessage, raw);
/** Client: validate inbound frames; drop (and log) anything that fails. */
export const parseServerMessage = (raw: string) => parseWith(ServerMessage, raw);

/** Build a typed server message. */
export function serverMessage<T extends ServerMessageType>(
  type: T,
  payload: Extract<ServerMessage, { type: T }>["payload"],
  requestId: string | null = null,
): Extract<ServerMessage, { type: T }> {
  return { v: PROTOCOL_VERSION, type, requestId, payload } as Extract<ServerMessage, { type: T }>;
}

/** Build a typed client message. */
export function clientMessage<T extends ClientMessageType>(
  type: T,
  requestId: string,
  payload: Extract<ClientMessage, { type: T }>["payload"],
): Extract<ClientMessage, { type: T }> {
  return { v: PROTOCOL_VERSION, type, requestId, payload } as Extract<ClientMessage, { type: T }>;
}
