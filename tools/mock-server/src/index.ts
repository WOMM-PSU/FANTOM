/**
 * DEV_ONLY: Mock HTTP + WebSocket server for Track B (apps/web) UI development.
 * Speaks the exact wire contract from @fantom/shared (PLAN.md P4 & Appendix 1).
 */
import http from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import {
  PROTOCOL_VERSION,
  CreateMatchRequest,
  JoinRequest,
  ClientMessage,
  ServerMessage,
  DEFAULT_MATCH_CONFIG,
  MAX_PLAYERS,
  MAX_HEALTH,
  MAX_SHIELD,
  MAX_MESSAGE_BYTES,
  SPAWN_LOCKOUT_SEC,
  WEAPONS,
  type MatchConfig,
  type MatchPhase,
  type MatchState,
  type PlayerPublic,
  type PlayerRole,
  type PlayerStatus,
  type SelfView,
  type LatLng,
  type ErrorCode,
  type ServerMessage as ServerMessageType,
} from "@fantom/shared";

const PORT = Number(process.env.MOCK_PORT ?? process.env.PORT ?? 8080);
const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://localhost:3000";

const JOIN_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O/1/I/L

function generateJoinCode(): string {
  let code = "";
  const bytes = randomBytes(5);
  for (let i = 0; i < 5; i++) {
    code += JOIN_CODE_ALPHABET[bytes[i]! % JOIN_CODE_ALPHABET.length];
  }
  return code;
}

type InternalPlayer = {
  id: string;
  displayName: string;
  sessionToken: string;
  markerCode: number;
  teamId: string | null;
  role: PlayerRole | null;
  status: PlayerStatus;
  connected: boolean;
  ready: boolean;
  health: number;
  maxHealth: number;
  shield: number;
  weaponId: "pulse" | "ravager" | "viper" | null;
  ammo: number;
  nextShotAt: number;
  reloadCompleteAt: number | null;
  spawnLockedUntil: number;
  score: number;
  eliminations: number;
  deaths: number;
  position: LatLng | null;
  locationQuality: "good" | "poor" | "stale" | "none";
  inZone: boolean | null;
  returnGraceUntil: number | null;
  isBot?: boolean;
};

type InternalMatch = {
  matchId: string;
  joinCode: string;
  phase: MatchPhase;
  hostPlayerId: string;
  config: MatchConfig;
  players: Map<string, InternalPlayer>;
  countdownEndsAt: number | null;
  startedAt: number | null;
  endsAt: number | null;
  result: MatchState["result"];
};

const matchesByCode = new Map<string, InternalMatch>();
const tokenToSession = new Map<string, { matchId: string; joinCode: string; playerId: string }>();

type ClientConn = {
  ws: WebSocket;
  seq: number;
  authenticated: boolean;
  matchCode: string | null;
  playerId: string | null;
  helloTimer: NodeJS.Timeout;
};

const playerSockets = new Map<string, ClientConn>();

function buildConfig(patch?: Partial<MatchConfig>): MatchConfig {
  const mode = patch?.mode ?? DEFAULT_MATCH_CONFIG.mode;
  return {
    mode,
    durationSec: patch?.durationSec ?? DEFAULT_MATCH_CONFIG.durationSec,
    arena: patch?.arena !== undefined ? patch.arena : DEFAULT_MATCH_CONFIG.arena,
    minimap: {
      ...DEFAULT_MATCH_CONFIG.minimap,
      ...(patch?.minimap ?? {}),
    },
    pickups: {
      ...DEFAULT_MATCH_CONFIG.pickups,
      ...(patch?.pickups ?? {}),
    },
    team: {
      ...DEFAULT_MATCH_CONFIG.team,
      ...(patch?.team ?? {}),
    },
    spawnLockoutSec: patch?.spawnLockoutSec ?? SPAWN_LOCKOUT_SEC[mode],
    maxRangeM: patch?.maxRangeM ?? DEFAULT_MATCH_CONFIG.maxRangeM,
    devMode: patch?.devMode ?? true, // mock-server defaults devMode true for UI testing
  };
}

function createInternalPlayer(displayName: string, markerCode: number, isBot = false): InternalPlayer {
  return {
    id: randomUUID(),
    displayName,
    sessionToken: randomBytes(24).toString("hex"),
    markerCode,
    teamId: null,
    role: null,
    status: "alive",
    connected: isBot,
    ready: isBot,
    health: MAX_HEALTH,
    maxHealth: MAX_HEALTH,
    shield: 0,
    weaponId: "pulse",
    ammo: WEAPONS.pulse.magazineSize,
    nextShotAt: 0,
    reloadCompleteAt: null,
    spawnLockedUntil: 0,
    score: 0,
    eliminations: 0,
    deaths: 0,
    position: isBot ? { lat: 40.7982, lng: -77.8599 } : null,
    locationQuality: isBot ? "good" : "none",
    inZone: isBot ? true : null,
    returnGraceUntil: null,
    isBot,
  };
}

function buildMatchStateForRecipient(match: InternalMatch, viewerId: string): MatchState {
  const viewer = match.players.get(viewerId);
  if (!viewer) {
    throw new Error(`Viewer ${viewerId} not in match ${match.matchId}`);
  }

  const players: PlayerPublic[] = Array.from(match.players.values()).map((p) => {
    const isSelf = p.id === viewerId;
    const isAlly = viewer.teamId !== null && viewer.teamId === p.teamId;
    const canSeePosition =
      isSelf ||
      (isAlly && match.config.minimap.showAllies) ||
      (match.config.minimap.showEnemies && match.config.mode !== "assassin");

    return {
      id: p.id,
      displayName: p.displayName,
      teamId: p.teamId,
      role: p.role,
      status: p.status,
      connected: p.connected,
      ready: p.ready,
      healthFraction: p.health / p.maxHealth,
      score: p.score,
      position: canSeePosition ? p.position : null,
    };
  });

  const self: SelfView = {
    playerId: viewer.id,
    markerCode: viewer.markerCode,
    health: viewer.health,
    maxHealth: viewer.maxHealth,
    shield: viewer.shield,
    weaponId: viewer.weaponId,
    ammo: viewer.ammo,
    nextShotAt: viewer.nextShotAt,
    reloadCompleteAt: viewer.reloadCompleteAt,
    spawnLockedUntil: viewer.spawnLockedUntil,
    locationQuality: viewer.locationQuality,
    inZone: viewer.inZone,
    returnGraceUntil: viewer.returnGraceUntil,
  };

  return {
    matchId: match.matchId,
    joinCode: match.joinCode,
    phase: match.phase,
    hostPlayerId: match.hostPlayerId,
    config: match.config,
    players,
    self,
    pickups: [],
    teamScores: {},
    countdownEndsAt: match.countdownEndsAt,
    startedAt: match.startedAt,
    endsAt: match.endsAt,
    result: match.result,
  };
}

function sendServerMsg<T extends ServerMessageType["type"]>(
  conn: ClientConn,
  type: T,
  payload: Extract<ServerMessageType, { type: T }>["payload"],
  replyTo?: string
): void {
  if (conn.ws.readyState !== WebSocket.OPEN) return;
  const msg = {
    v: PROTOCOL_VERSION,
    seq: conn.seq++,
    serverTime: Date.now(),
    ...(replyTo ? { replyTo } : {}),
    type,
    payload,
  };
  const validated = ServerMessage.parse(msg);
  conn.ws.send(JSON.stringify(validated));
}

function sendError(conn: ClientConn, code: ErrorCode, message: string, replyTo?: string): void {
  sendServerMsg(conn, "ERROR", { code, message }, replyTo);
}

function broadcastMatchState(match: InternalMatch): void {
  for (const player of match.players.values()) {
    const conn = playerSockets.get(player.id);
    if (conn && conn.authenticated && conn.ws.readyState === WebSocket.OPEN) {
      const state = buildMatchStateForRecipient(match, player.id);
      sendServerMsg(conn, "MATCH_STATE", state);
    }
  }
}

function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  setCorsHeaders(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendApiError(res: http.ServerResponse, status: number, code: ErrorCode, message: string): void {
  sendJson(res, status, { error: { code, message } });
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_MESSAGE_BYTES) {
        reject(new Error("Payload too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (req.method === "GET" && pathname === "/health") {
    sendJson(res, 200, { ok: true, protocolVersion: PROTOCOL_VERSION });
    return;
  }

  if (req.method === "POST" && pathname === "/api/matches") {
    let body: unknown;
    try {
      body = await readBody(req);
    } catch {
      sendApiError(res, 400, "BAD_MESSAGE", "Malformed JSON body");
      return;
    }

    const parsed = CreateMatchRequest.safeParse(body);
    if (!parsed.success) {
      sendApiError(res, 400, "BAD_MESSAGE", parsed.error.issues[0]?.message ?? "Invalid request");
      return;
    }

    let joinCode = generateJoinCode();
    while (matchesByCode.has(joinCode)) {
      joinCode = generateJoinCode();
    }

    const matchId = randomUUID();
    const host = createInternalPlayer(parsed.data.displayName, 1, false);
    const bot = createInternalPlayer("Bot-Alpha (Mock)", 2, true);

    const players = new Map<string, InternalPlayer>();
    players.set(host.id, host);
    players.set(bot.id, bot);

    const match: InternalMatch = {
      matchId,
      joinCode,
      phase: "lobby",
      hostPlayerId: host.id,
      config: buildConfig(parsed.data.config as Partial<MatchConfig> | undefined),
      players,
      countdownEndsAt: null,
      startedAt: null,
      endsAt: null,
      result: null,
    };

    matchesByCode.set(joinCode, match);
    tokenToSession.set(host.sessionToken, { matchId, joinCode, playerId: host.id });

    sendJson(res, 201, {
      matchId,
      joinCode,
      joinUrl: `${WEB_BASE_URL}/join/${joinCode}`,
      playerId: host.id,
      sessionToken: host.sessionToken,
    });
    return;
  }

  const matchRoute = pathname.match(/^\/api\/matches\/([A-Za-z0-9]+)(\/join)?$/);
  if (matchRoute) {
    const rawCode = matchRoute[1]!.toUpperCase();
    const isJoin = Boolean(matchRoute[2]);
    const match = matchesByCode.get(rawCode);

    if (!match) {
      sendApiError(res, 404, "MATCH_NOT_FOUND", `No match found with code ${rawCode}`);
      return;
    }

    if (req.method === "GET" && !isJoin) {
      sendJson(res, 200, {
        joinCode: match.joinCode,
        phase: match.phase,
        mode: match.config.mode,
        playerCount: match.players.size,
        maxPlayers: MAX_PLAYERS,
        joinable: match.phase === "lobby" && match.players.size < MAX_PLAYERS,
      });
      return;
    }

    if (req.method === "POST" && isJoin) {
      if (match.phase !== "lobby") {
        sendApiError(res, 409, "WRONG_PHASE", "Match has already started");
        return;
      }
      if (match.players.size >= MAX_PLAYERS) {
        sendApiError(res, 409, "LOBBY_FULL", "Lobby is full");
        return;
      }

      let body: unknown;
      try {
        body = await readBody(req);
      } catch {
        sendApiError(res, 400, "BAD_MESSAGE", "Malformed JSON body");
        return;
      }

      const parsed = JoinRequest.safeParse(body);
      if (!parsed.success) {
        sendApiError(res, 400, "BAD_MESSAGE", parsed.error.issues[0]?.message ?? "Invalid display name");
        return;
      }

      const markerCode = (match.players.size + 1) % 256;
      const player = createInternalPlayer(parsed.data.displayName, markerCode, false);
      match.players.set(player.id, player);
      tokenToSession.set(player.sessionToken, {
        matchId: match.matchId,
        joinCode: match.joinCode,
        playerId: player.id,
      });

      broadcastMatchState(match);

      sendJson(res, 200, {
        matchId: match.matchId,
        joinCode: match.joinCode,
        joinUrl: `${WEB_BASE_URL}/join/${match.joinCode}`,
        playerId: player.id,
        sessionToken: player.sessionToken,
      });
      return;
    }
  }

  sendApiError(res, 404, "BAD_MESSAGE", "Route not found");
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  const conn: ClientConn = {
    ws,
    seq: 1,
    authenticated: false,
    matchCode: null,
    playerId: null,
    helloTimer: setTimeout(() => {
      if (!conn.authenticated) {
        sendError(conn, "UNAUTHENTICATED", "HELLO required within 5 seconds");
        ws.close(4000, "HELLO timeout");
      }
    }, 5000),
  };

  ws.on("message", (data) => {
    const raw = data.toString("utf8");
    if (Buffer.byteLength(raw, "utf8") > MAX_MESSAGE_BYTES) {
      sendError(conn, "BAD_MESSAGE", "Message exceeds 8 KB limit");
      return;
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      sendError(conn, "BAD_MESSAGE", "Invalid JSON");
      return;
    }

    const parsed = ClientMessage.safeParse(json);
    if (!parsed.success) {
      sendError(conn, "BAD_MESSAGE", parsed.error.issues[0]?.message ?? "Schema validation failed");
      return;
    }

    const msg = parsed.data;

    if (!conn.authenticated) {
      if (msg.type !== "HELLO") {
        sendError(conn, "UNAUTHENTICATED", "First message must be HELLO", msg.id);
        ws.close(4002, "Expected HELLO");
        return;
      }

      const session = tokenToSession.get(msg.payload.sessionToken);
      if (!session) {
        sendError(conn, "UNAUTHENTICATED", "Invalid or expired sessionToken", msg.id);
        ws.close(4003, "Invalid sessionToken");
        return;
      }

      const match = matchesByCode.get(session.joinCode);
      const player = match?.players.get(session.playerId);
      if (!match || !player) {
        sendError(conn, "MATCH_NOT_FOUND", "Match no longer exists", msg.id);
        ws.close(4004, "Match not found");
        return;
      }

      clearTimeout(conn.helloTimer);

      const existingConn = playerSockets.get(player.id);
      if (existingConn && existingConn !== conn) {
        existingConn.ws.close(4001, "Session rebound to newer connection");
      }

      conn.authenticated = true;
      conn.matchCode = match.joinCode;
      conn.playerId = player.id;
      player.connected = true;
      playerSockets.set(player.id, conn);

      const state = buildMatchStateForRecipient(match, player.id);
      sendServerMsg(
        conn,
        "WELCOME",
        {
          playerId: player.id,
          protocolVersion: PROTOCOL_VERSION,
          state,
        },
        msg.id
      );
      broadcastMatchState(match);
      return;
    }

    const match = conn.matchCode ? matchesByCode.get(conn.matchCode) : undefined;
    const player = conn.playerId && match ? match.players.get(conn.playerId) : undefined;
    if (!match || !player) {
      sendError(conn, "MATCH_NOT_FOUND", "Session no longer valid", msg.id);
      return;
    }

    switch (msg.type) {
      case "PING": {
        sendServerMsg(conn, "PONG", { clientSentAt: msg.payload.clientSentAt }, msg.id);
        break;
      }

      case "PLAYER_READY": {
        if (match.phase !== "lobby") {
          sendError(conn, "WRONG_PHASE", "Can only change ready state in lobby", msg.id);
          return;
        }
        player.ready = msg.payload.ready;
        broadcastMatchState(match);
        break;
      }

      case "UPDATE_CONFIG": {
        if (match.hostPlayerId !== player.id) {
          sendError(conn, "NOT_HOST", "Only the host can update match settings", msg.id);
          return;
        }
        if (match.phase !== "lobby") {
          sendError(conn, "WRONG_PHASE", "Settings can only be updated in lobby", msg.id);
          return;
        }
        const patch = msg.payload.config;
        const nextMode = patch.mode ?? match.config.mode;
        match.config = {
          ...match.config,
          ...patch,
          minimap: { ...match.config.minimap, ...(patch.minimap ?? {}) },
          pickups: { ...match.config.pickups, ...(patch.pickups ?? {}) },
          team: { ...match.config.team, ...(patch.team ?? {}) },
          spawnLockoutSec:
            patch.spawnLockoutSec ??
            (patch.mode ? SPAWN_LOCKOUT_SEC[nextMode] : match.config.spawnLockoutSec),
        };
        broadcastMatchState(match);
        break;
      }

      case "REQUEST_MATCH_START": {
        if (match.hostPlayerId !== player.id) {
          sendError(conn, "NOT_HOST", "Only the host can start the match", msg.id);
          return;
        }
        if (match.phase !== "lobby") {
          sendError(conn, "WRONG_PHASE", "Match is not in lobby", msg.id);
          return;
        }
        if (match.players.size < 2) {
          sendError(conn, "INVALID_CONFIG", "At least 2 players are required to start", msg.id);
          return;
        }
        const allReady = Array.from(match.players.values()).every((p) => p.ready);
        if (!allReady) {
          sendError(conn, "INVALID_CONFIG", "All players must be ready before starting", msg.id);
          return;
        }

        const now = Date.now();
        match.phase = "countdown";
        match.countdownEndsAt = now + 5000; // 5s countdown in mock server
        broadcastMatchState(match);

        setTimeout(() => {
          if (match.phase !== "countdown") return;
          const startNow = Date.now();
          match.phase = "active";
          match.startedAt = startNow;
          match.endsAt = startNow + match.config.durationSec * 1000;
          const lockoutMs = match.config.spawnLockoutSec * 1000;

          let idx = 0;
          for (const p of match.players.values()) {
            p.spawnLockedUntil = startNow + lockoutMs;
            if (match.config.mode === "assassin") {
              p.role = idx === 0 ? "assassin" : "survivor";
              p.weaponId = idx === 0 ? "pulse" : null;
            } else if (match.config.mode === "team_deathmatch") {
              p.teamId = idx % 2 === 0 ? "team-1" : "team-2";
              p.role = "killer";
              p.weaponId = "pulse";
            } else {
              p.role = null;
              p.weaponId = "pulse";
            }
            idx++;
          }
          broadcastMatchState(match);
        }, 5000);
        break;
      }

      case "UPDATE_LOCATION": {
        player.position = msg.payload.position;
        player.locationQuality = msg.payload.accuracyM <= 25 ? "good" : "poor";
        player.inZone = true;
        broadcastMatchState(match);
        break;
      }

      case "REQUEST_SHOT": {
        if (match.phase !== "active") {
          sendServerMsg(conn, "SHOT_REJECTED", { reason: "WRONG_PHASE" }, msg.id);
          return;
        }
        const now = Date.now();
        if (now < player.spawnLockedUntil) {
          sendServerMsg(conn, "SHOT_REJECTED", { reason: "SPAWN_LOCKED" }, msg.id);
          return;
        }
        if (!player.weaponId) {
          sendServerMsg(conn, "SHOT_REJECTED", { reason: "NO_WEAPON" }, msg.id);
          return;
        }
        if (player.reloadCompleteAt && now < player.reloadCompleteAt) {
          sendServerMsg(conn, "SHOT_REJECTED", { reason: "RELOADING" }, msg.id);
          return;
        }
        if (now < player.nextShotAt) {
          sendServerMsg(conn, "SHOT_REJECTED", { reason: "COOLDOWN" }, msg.id);
          return;
        }

        const target = Array.from(match.players.values()).find(
          (p) => p.markerCode === msg.payload.evidence.targetMarkerCode && p.id !== player.id
        );
        if (!target) {
          sendServerMsg(conn, "SHOT_REJECTED", { reason: "INVALID_TARGET" }, msg.id);
          return;
        }
        if (target.status === "eliminated") {
          sendServerMsg(conn, "SHOT_REJECTED", { reason: "TARGET_ELIMINATED" }, msg.id);
          return;
        }

        const weapon = WEAPONS[player.weaponId];
        player.ammo = Math.max(0, player.ammo - 1);
        player.nextShotAt = now + weapon.fireIntervalMs;

        if (player.ammo === 0) {
          player.reloadCompleteAt = now + weapon.reloadDurationMs;
          setTimeout(() => {
            player.ammo = weapon.magazineSize;
            player.reloadCompleteAt = null;
            broadcastMatchState(match);
          }, weapon.reloadDurationMs);
        }

        target.health = Math.max(0, target.health - weapon.damage);
        const eliminated = target.health === 0;
        if (eliminated) {
          target.status = "eliminated";
          target.deaths += 1;
          player.eliminations += 1;
          player.score += 100;
        }

        sendServerMsg(
          conn,
          "SHOT_ACCEPTED",
          {
            targetPlayerId: target.id,
            damageDealt: weapon.damage,
            eliminated,
          },
          msg.id
        );
        broadcastMatchState(match);
        break;
      }

      case "LEAVE_MATCH": {
        match.players.delete(player.id);
        playerSockets.delete(player.id);
        tokenToSession.delete(player.sessionToken);
        ws.close(1000, "Left match");

        const remainingHumans = Array.from(match.players.values()).filter((p) => !p.isBot);
        if (remainingHumans.length === 0) {
          matchesByCode.delete(match.joinCode);
        } else {
          if (match.hostPlayerId === player.id) {
            match.hostPlayerId = remainingHumans[0]!.id;
          }
          broadcastMatchState(match);
        }
        break;
      }

      default:
        break;
    }
  });

  ws.on("close", () => {
    clearTimeout(conn.helloTimer);
    if (conn.authenticated && conn.playerId && conn.matchCode) {
      const current = playerSockets.get(conn.playerId);
      if (current === conn) {
        playerSockets.delete(conn.playerId);
        const match = matchesByCode.get(conn.matchCode);
        const player = match?.players.get(conn.playerId);
        if (match && player) {
          player.connected = false;
          broadcastMatchState(match);
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`[DEV_ONLY mock-server] HTTP & WS listening on http://localhost:${PORT} (ws://localhost:${PORT}/ws)`);
});
