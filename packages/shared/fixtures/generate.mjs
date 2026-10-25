#!/usr/bin/env node
/**
 * Generate the contract fixtures (PLAN Appendix 3) and validate every example
 * against the built schemas before writing it.
 *
 *   pnpm --filter @fantom/shared build
 *   node packages/shared/fixtures/generate.mjs
 *
 * Fixtures are intentionally generated from one source so a schema change
 * cannot leave the examples silently stale. The contract test parses the
 * written JSON independently.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ApiError,
  ClientMessage,
  CreateMatchRequest,
  JoinRequest,
  JoinResponse,
  MatchState,
  MatchSummary,
  ServerMessage,
} from "../dist/index.js";

const FIXTURES = fileURLToPath(new URL(".", import.meta.url));
const T0 = 1_760_000_000_000;

const ARENA = {
  polygon: [
    { lat: 47.6205, lng: -122.3493 },
    { lat: 47.6205, lng: -122.3483 },
    { lat: 47.6195, lng: -122.3483 },
    { lat: 47.6195, lng: -122.3493 },
  ],
  boundaryMarginM: 5,
};

function config(overrides = {}) {
  return {
    mode: "ffa",
    durationSec: 300,
    arena: ARENA,
    minimap: { enabled: true, showAllies: true, showEnemies: false, showPickups: true },
    pickups: { weapons: true, health: true, shields: true, respawnSec: 30 },
    team: { teamCount: 2, killersPerHealer: 2 },
    spawnLockoutSec: 5,
    maxRangeM: 30,
    devMode: false,
    ...overrides,
  };
}

function player(overrides = {}) {
  return {
    id: "p1",
    displayName: "Ada",
    teamId: null,
    role: null,
    status: "alive",
    connected: true,
    ready: true,
    healthFraction: 1,
    score: 0,
    position: null,
    ...overrides,
  };
}

function self(overrides = {}) {
  return {
    playerId: "p1",
    markerCode: 7,
    health: 100,
    maxHealth: 100,
    shield: 0,
    weaponId: null,
    ammo: 0,
    nextShotAt: 0,
    reloadCompleteAt: null,
    spawnLockedUntil: 0,
    locationQuality: "none",
    inZone: null,
    returnGraceUntil: null,
    ...overrides,
  };
}

function state(overrides = {}) {
  return {
    matchId: "match-1",
    joinCode: "ABCDE",
    phase: "lobby",
    hostPlayerId: "p1",
    config: config({ arena: null }),
    players: [
      player(),
      player({ id: "p2", displayName: "Babbage", ready: false }),
    ],
    self: self(),
    pickups: [],
    teamScores: {},
    countdownEndsAt: null,
    startedAt: null,
    endsAt: null,
    result: null,
    ...overrides,
  };
}

const FFA_RESULT = {
  winner: { kind: "player", playerId: "p1" },
  endedReason: "last_standing",
  standings: [
    {
      playerId: "p1",
      displayName: "Ada",
      teamId: null,
      role: null,
      eliminations: 2,
      deaths: 0,
      score: 2,
      survived: true,
    },
    {
      playerId: "p2",
      displayName: "Babbage",
      teamId: null,
      role: null,
      eliminations: 1,
      deaths: 1,
      score: 1,
      survived: false,
    },
  ],
};

const PICKUP = {
  id: "pickup-1",
  kind: "weapon",
  weaponId: "pulse",
  position: { lat: 47.6201, lng: -122.3491 },
  available: true,
  respawnAt: null,
};

const lobbyState = state();

const countdownState = state({
  phase: "countdown",
  config: config(),
  countdownEndsAt: T0 + 5_000,
  players: [player(), player({ id: "p2", displayName: "Babbage" })],
  self: self({
    health: 100,
    locationQuality: "good",
    inZone: true,
    spawnLockedUntil: T0 + 5_000,
  }),
});

const activeFfaState = state({
  phase: "active",
  config: config(),
  players: [
    player({
      position: { lat: 47.6201, lng: -122.3491 },
      healthFraction: 0.75,
      score: 1,
    }),
    player({
      id: "p2",
      displayName: "Babbage",
      healthFraction: 0.5,
      position: null,
    }),
  ],
  self: self({
    health: 75,
    shield: 25,
    weaponId: "pulse",
    ammo: 9,
    nextShotAt: T0 + 1_000,
    spawnLockedUntil: 0,
    locationQuality: "good",
    inZone: true,
  }),
  pickups: [PICKUP],
  startedAt: T0,
  endsAt: T0 + 300_000,
});

const outOfZoneState = state({
  phase: "active",
  config: config(),
  players: [
    player({
      status: "out_of_zone",
      healthFraction: 0.6,
      position: { lat: 47.6201, lng: -122.3491 },
      score: 0,
    }),
    player({
      id: "p2",
      displayName: "Babbage",
      healthFraction: 0.5,
      position: null,
    }),
  ],
  self: self({
    health: 60,
    weaponId: "pulse",
    ammo: 4,
    nextShotAt: T0 + 1_000,
    locationQuality: "poor",
    inZone: false,
    returnGraceUntil: null,
  }),
  startedAt: T0,
  endsAt: T0 + 300_000,
});

const finishedState = state({
  phase: "finished",
  config: config(),
  players: [
    player({ score: 2, healthFraction: 0.75 }),
    player({
      id: "p2",
      displayName: "Babbage",
      status: "eliminated",
      healthFraction: 0,
      score: 1,
    }),
  ],
  self: self({
    health: 75,
    weaponId: "pulse",
    ammo: 3,
    nextShotAt: T0 + 1_000,
    locationQuality: "good",
    inZone: true,
  }),
  startedAt: T0,
  endsAt: T0 + 300_000,
  result: FFA_RESULT,
});

const assassinState = state({
  phase: "active",
  config: config({
    mode: "assassin",
    spawnLockoutSec: 15,
    pickups: { weapons: false, health: false, shields: false, respawnSec: 30 },
  }),
  players: [
    player({
      role: "assassin",
      position: { lat: 47.6201, lng: -122.3491 },
      healthFraction: 1,
      score: 0,
    }),
    player({
      id: "p2",
      displayName: "Babbage",
      role: "survivor",
      position: null,
      healthFraction: 1,
      score: 0,
    }),
  ],
  self: self({
    playerId: "p1",
    markerCode: 21,
    health: 100,
    weaponId: "pulse",
    ammo: 12,
    nextShotAt: T0,
    spawnLockedUntil: T0 + 15_000,
    locationQuality: "good",
    inZone: true,
  }),
  startedAt: T0,
  endsAt: T0 + 300_000,
});

const teamDeathmatchState = state({
  phase: "active",
  config: config({ mode: "team_deathmatch" }),
  players: [
    player({
      role: "killer",
      teamId: "team-a",
      position: { lat: 47.6201, lng: -122.3491 },
      healthFraction: 1,
      score: 1,
    }),
    player({
      id: "p2",
      displayName: "Babbage",
      role: "healer",
      teamId: "team-a",
      position: { lat: 47.6200, lng: -122.3490 },
      healthFraction: 1,
      score: 0,
    }),
    player({
      id: "p3",
      displayName: "Curie",
      role: "killer",
      teamId: "team-b",
      position: null,
      healthFraction: 0.5,
      score: 0,
    }),
  ],
  self: self({
    weaponId: "pulse",
    ammo: 12,
    nextShotAt: T0,
    spawnLockedUntil: 0,
    locationQuality: "good",
    inZone: true,
  }),
  teamScores: { "team-a": 1, "team-b": 0 },
  startedAt: T0,
  endsAt: T0 + 300_000,
});

const cameraEvidence = {
  source: "camera",
  ageMs: 120,
  targetMarkerCode: 8,
  visibleMarkerCodes: [8],
  markerConfidence: 0.92,
  markerVisibleFraction: 0.96,
  markerOffsetDeg: { x: 1.25, y: -0.4 },
  markerWidthPx: 118,
  frameWidthPx: 1280,
  hfovDeg: 62,
  estimatedDistanceM: 5.2,
  camera: {
    headingDeg: 88.5,
    pitchDeg: 2.1,
    rollDeg: -1.2,
    headingAccuracyDeg: 6,
    headingSource: "absolute",
  },
};

const devEvidence = {
  ...cameraEvidence,
  source: "dev_simulated",
  targetMarkerCode: 7,
  visibleMarkerCodes: [7],
  markerConfidence: 1,
  markerVisibleFraction: 1,
  markerOffsetDeg: { x: 0, y: 0 },
  estimatedDistanceM: 12.4,
  camera: {
    headingDeg: 45,
    pitchDeg: 0,
    rollDeg: 0,
    headingAccuracyDeg: null,
    headingSource: "absolute",
  },
};

const client = {
  "hello.json": {
    v: 1,
    id: "c-hello-1",
    type: "HELLO",
    payload: { sessionToken: "fixture-session-token-0000000001" },
  },
  "ping.json": { v: 1, id: "c-ping-1", type: "PING", payload: { clientSentAt: T0 - 1_000 } },
  "leave-match.json": { v: 1, id: "c-leave-1", type: "LEAVE_MATCH", payload: {} },
  "update-config.json": {
    v: 1,
    id: "c-config-1",
    type: "UPDATE_CONFIG",
    payload: { config: { mode: "team_deathmatch", durationSec: 600 } },
  },
  "player-ready.json": {
    v: 1,
    id: "c-ready-1",
    type: "PLAYER_READY",
    payload: { ready: true, permissions: { camera: true, orientation: true, location: true } },
  },
  "request-match-start.json": {
    v: 1,
    id: "c-start-1",
    type: "REQUEST_MATCH_START",
    payload: {},
  },
  "update-location.json": {
    v: 1,
    id: "c-location-1",
    type: "UPDATE_LOCATION",
    payload: {
      position: { lat: 47.6201, lng: -122.3491 },
      accuracyM: 8,
      clientTimestamp: T0,
    },
  },
  "request-shot-camera.json": {
    v: 1,
    id: "c-shot-camera-1",
    type: "REQUEST_SHOT",
    payload: { evidence: cameraEvidence },
  },
  "request-shot-dev-simulated.json": {
    v: 1,
    id: "c-shot-dev-1",
    type: "REQUEST_SHOT",
    payload: { evidence: devEvidence },
  },
  "request-heal.json": {
    v: 1,
    id: "c-heal-1",
    type: "REQUEST_HEAL",
    payload: { targetMarkerCode: 7 },
  },
  "request-pickup.json": {
    v: 1,
    id: "c-pickup-1",
    type: "REQUEST_PICKUP",
    payload: { pickupId: "pickup-1" },
  },
};

function server(type, payload, seq, extra = {}) {
  return { v: 1, seq, serverTime: T0, type, payload, ...extra };
}

const serverFixtures = {
  "welcome.json": server(
    "WELCOME",
    { playerId: "p1", protocolVersion: 1, state: lobbyState },
    1,
    { replyTo: "c-hello-1" },
  ),
  "match-state-lobby.json": server("MATCH_STATE", lobbyState, 2),
  "match-state-countdown.json": server("MATCH_STATE", countdownState, 3),
  "match-state-active-ffa.json": server("MATCH_STATE", activeFfaState, 4),
  "match-state-out-of-zone.json": server("MATCH_STATE", outOfZoneState, 5),
  "match-state-finished.json": server("MATCH_STATE", finishedState, 6),
  "match-state-assassin-hidden.json": server("MATCH_STATE", assassinState, 7),
  "match-state-team-deathmatch.json": server("MATCH_STATE", teamDeathmatchState, 8),
  "pong.json": server("PONG", { clientSentAt: T0 - 1_000 }, 9, { replyTo: "c-ping-1" }),
  "shot-accepted.json": server(
    "SHOT_ACCEPTED",
    { targetPlayerId: "p2", damageDealt: 25, eliminated: false },
    10,
    { replyTo: "c-shot-camera-1" },
  ),
  "shot-rejected.json": server("SHOT_REJECTED", { reason: "AIM_DISAGREEMENT" }, 11, {
    replyTo: "c-shot-camera-1",
  }),
  "player-damaged.json": server(
    "PLAYER_DAMAGED",
    { attackerId: "p1", damage: 25, source: "shot" },
    12,
  ),
  "player-eliminated.json": server(
    "PLAYER_ELIMINATED",
    { playerId: "p2", byPlayerId: "p1", cause: "shot" },
    13,
  ),
  "heal-applied.json": server(
    "HEAL_APPLIED",
    { healerId: "p3", targetId: "p1", amount: 25 },
    14,
  ),
  "heal-rejected.json": server("HEAL_REJECTED", { reason: "HEAL_COOLDOWN" }, 15),
  "pickup-collected.json": server(
    "PICKUP_COLLECTED",
    { pickupId: "pickup-1", byPlayerId: "p1", kind: "weapon" },
    16,
  ),
  "pickup-rejected.json": server("PICKUP_REJECTED", { reason: "PICKUP_TOO_FAR" }, 17),
  "match-finished.json": server("MATCH_FINISHED", { result: FFA_RESULT }, 18),
  "error.json": server(
    "ERROR",
    { code: "RATE_LIMITED", message: "Too many messages." },
    19,
    { replyTo: "c-shot-camera-1" },
  ),
};

const http = {
  "create-request.json": {
    displayName: "Ada",
    config: { mode: "ffa", durationSec: 300 },
  },
  "create-response.json": {
    matchId: "match-1",
    joinCode: "ABCDE",
    joinUrl: "https://fantom.example/join/ABCDE",
    playerId: "p1",
    sessionToken: "fixture-session-token-0000000001",
  },
  "join-request.json": { displayName: "Babbage" },
  "join-response.json": {
    matchId: "match-1",
    joinCode: "ABCDE",
    joinUrl: "https://fantom.example/join/ABCDE",
    playerId: "p2",
    sessionToken: "fixture-session-token-0000000002",
  },
  "match-summary.json": {
    joinCode: "ABCDE",
    phase: "lobby",
    mode: "ffa",
    playerCount: 2,
    maxPlayers: 16,
    joinable: true,
  },
  "api-error.json": {
    error: { code: "MATCH_NOT_FOUND", message: "Match not found." },
  },
};

const invalid = {
  client: {
    "hello-missing-token.json": (() => {
      const value = structuredClone(client["hello.json"]);
      delete value.payload.sessionToken;
      return value;
    })(),
    "shot-marker-out-of-range.json": (() => {
      const value = structuredClone(client["request-shot-camera.json"]);
      value.payload.evidence.targetMarkerCode = 999;
      return value;
    })(),
    "update-config-duration-too-short.json": (() => {
      const value = structuredClone(client["update-config.json"]);
      value.payload.config.durationSec = 10;
      return value;
    })(),
  },
  server: {
    "match-state-missing-self.json": (() => {
      const value = structuredClone(serverFixtures["match-state-lobby.json"]);
      delete value.payload.self;
      return value;
    })(),
    "shot-rejected-unknown-reason.json": (() => {
      const value = structuredClone(serverFixtures["shot-rejected.json"]);
      value.payload.reason = "NOT_A_REASON";
      return value;
    })(),
    "match-state-negative-time.json": (() => {
      const value = structuredClone(serverFixtures["match-state-countdown.json"]);
      value.payload.countdownEndsAt = -1;
      return value;
    })(),
  },
  http: {
    "create-request-empty-name.json": { displayName: "   " },
    "api-error-unknown-code.json": {
      error: { code: "NOPE", message: "Unknown error." },
    },
    "match-summary-non-boolean.json": {
      joinCode: "ABCDE",
      phase: "lobby",
      mode: "ffa",
      playerCount: 2,
      maxPlayers: 16,
      joinable: "yes",
    },
  },
};

const HTTP_SCHEMAS = {
  "create-request.json": CreateMatchRequest,
  "create-response.json": JoinResponse,
  "join-request.json": JoinRequest,
  "join-response.json": JoinResponse,
  "match-summary.json": MatchSummary,
  "api-error.json": ApiError,
};

function fail(message) {
  throw new Error(message);
}

function validateValid(where, schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    fail(`${where} does not parse:\n${JSON.stringify(result.error.issues, null, 2)}`);
  }
}

async function writeJson(relativePath, value) {
  const target = join(FIXTURES, relativePath);
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  // Validate everything before touching the filesystem.
  for (const [file, value] of Object.entries(client)) {
    validateValid(`client/${file}`, ClientMessage, value);
  }
  for (const [file, value] of Object.entries(serverFixtures)) {
    validateValid(`server/${file}`, ServerMessage, value);
    if (value.type === "MATCH_STATE") {
      validateValid(`server/${file} (state)`, MatchState, value.payload);
    }
  }
  for (const [file, value] of Object.entries(http)) {
    const schema = HTTP_SCHEMAS[file];
    if (!schema) fail(`No HTTP schema mapping for ${file}`);
    validateValid(`http/${file}`, schema, value);
  }

  const INVALID_HTTP_SCHEMAS = {
    "create-request-empty-name.json": CreateMatchRequest,
    "api-error-unknown-code.json": ApiError,
    "match-summary-non-boolean.json": MatchSummary,
  };

  for (const [group, entries] of Object.entries(invalid)) {
    for (const [file, value] of Object.entries(entries)) {
      const schema =
        group === "client"
          ? ClientMessage
          : group === "server"
            ? ServerMessage
            : INVALID_HTTP_SCHEMAS[file];
      if (!schema) fail(`No schema for invalid/${group}/${file}`);
      const result = schema.safeParse(value);
      if (result.success) fail(`invalid/${group}/${file} unexpectedly parses`);
    }
  }

  for (const directory of ["client", "server", "http", "invalid/client", "invalid/server", "invalid/http"]) {
    await rm(join(FIXTURES, directory), { recursive: true, force: true });
  }

  for (const [file, value] of Object.entries(client)) {
    await writeJson(`client/${file}`, value);
  }
  for (const [file, value] of Object.entries(serverFixtures)) {
    await writeJson(`server/${file}`, value);
  }
  for (const [file, value] of Object.entries(http)) {
    await writeJson(`http/${file}`, value);
  }
  for (const [group, entries] of Object.entries(invalid)) {
    for (const [file, value] of Object.entries(entries)) {
      await writeJson(`invalid/${group}/${file}`, value);
    }
  }

  const count =
    Object.keys(client).length +
    Object.keys(serverFixtures).length +
    Object.keys(http).length +
    Object.values(invalid).reduce((sum, entries) => sum + Object.keys(entries).length, 0);
  console.log(`Wrote ${count} validated fixtures to ${FIXTURES}`);
}

await main();
