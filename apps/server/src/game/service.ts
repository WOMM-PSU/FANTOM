import {
  DISCONNECT_TIMEOUT_MS,
  PROTOCOL_VERSION,
  type ClientMessage,
  type CreateMatchRequest,
  type ErrorCode,
  type JoinRequest,
  type JoinResponse,
  type MatchSummary,
} from "@fantom/shared";
import type { Match, Player } from "../lobby/match.js";
import { MatchRegistry } from "../lobby/registry.js";
import { CLOSE_HANDSHAKE_FAILED, type ClientConnection } from "../networking/connection.js";
import { ConnectionHub } from "../networking/hub.js";
import { applyConfigPatch, defaultConfig } from "../validation/config.js";

export type ServiceFailure = { ok: false; status: number; code: ErrorCode; message: string };
export type ServiceResult<T> = { ok: true; value: T } | ServiceFailure;

export type GameServiceOptions = {
  registry: MatchRegistry;
  hub: ConnectionHub;
  webBaseUrl: string;
  allowDevMode: boolean;
  disconnectTimeoutMs?: number;
  /** Snapshots are coalesced to at most one per this interval (PLAN P2.3: ≤10 Hz). */
  broadcastIntervalMs?: number;
};

function ok<T>(value: T): ServiceResult<T> {
  return { ok: true, value };
}

function fail(status: number, code: ErrorCode, message: string): ServiceFailure {
  return { ok: false, status, code, message };
}

export class GameService {
  private readonly registry: MatchRegistry;
  private readonly hub: ConnectionHub;
  private readonly webBaseUrl: string;
  private readonly allowDevMode: boolean;
  private readonly disconnectTimeoutMs: number;
  private readonly broadcastIntervalMs: number;

  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly broadcastTimers = new Map<string, NodeJS.Timeout>();

  constructor(options: GameServiceOptions) {
    this.registry = options.registry;
    this.hub = options.hub;
    this.webBaseUrl = options.webBaseUrl.replace(/\/$/, "");
    this.allowDevMode = options.allowDevMode;
    this.disconnectTimeoutMs = options.disconnectTimeoutMs ?? DISCONNECT_TIMEOUT_MS;
    this.broadcastIntervalMs = options.broadcastIntervalMs ?? 100;
  }

  /* ───────────── HTTP ───────────── */

  createMatch(input: CreateMatchRequest): ServiceResult<JoinResponse> {
    const config = applyConfigPatch(defaultConfig(), input.config ?? {}, {
      allowDevMode: this.allowDevMode,
    });
    if (!config.ok) return fail(400, "INVALID_CONFIG", config.message);

    const { match, player } = this.registry.createMatch(config.config, input.displayName);
    return ok(this.joinResponse(match, player));
  }

  joinMatch(joinCode: string, input: JoinRequest): ServiceResult<JoinResponse> {
    const match = this.registry.getByCode(joinCode);
    if (!match) return fail(404, "MATCH_NOT_FOUND", "No match with that join code");
    if (match.phase !== "lobby") {
      return fail(409, "WRONG_PHASE", `Match is ${match.phase}, not accepting players`);
    }
    if (match.isFull) return fail(409, "LOBBY_FULL", "This match is full");

    const player = this.registry.joinMatch(match, input.displayName);
    this.scheduleBroadcast(match);
    return ok(this.joinResponse(match, player));
  }

  getMatchSummary(joinCode: string): ServiceResult<MatchSummary> {
    const match = this.registry.getByCode(joinCode);
    if (!match) return fail(404, "MATCH_NOT_FOUND", "No match with that join code");
    return ok(match.summary());
  }

  /* ───────────── WebSocket ───────────── */

  handleHello(connection: ClientConnection, sessionToken: string): void {
    const resolved = this.registry.resolveSession(sessionToken);
    if (!resolved) {
      connection.sendError("UNAUTHENTICATED", "Unknown or expired session token");
      connection.close(CLOSE_HANDSHAKE_FAILED, "unauthenticated");
      return;
    }

    const { match, player } = resolved;
    player.connected = true;
    this.clearDisconnectTimer(player.id);

    // Rebinding closes any replaced socket with 4001 (PLAN P4.3).
    this.hub.bindPlayer(player.id, connection);
    connection.playerId = player.id;
    connection.matchId = match.id;

    connection.send({
      type: "WELCOME",
      payload: {
        playerId: player.id,
        protocolVersion: PROTOCOL_VERSION,
        state: match.stateFor(player.id),
      },
    });
    this.scheduleBroadcast(match);
  }

  handleMessage(connection: ClientConnection, message: ClientMessage): void {
    const playerId = connection.playerId;
    const matchId = connection.matchId;
    if (playerId === null || matchId === null) return;

    const match = this.registry.getById(matchId);
    const player = match?.players.get(playerId);
    if (!match || !player) {
      connection.sendError("SESSION_EXPIRED", "This match no longer exists");
      connection.close(CLOSE_HANDSHAKE_FAILED, "session expired");
      return;
    }

    if (connection.isDuplicateRequest(message.id)) return;

    switch (message.type) {
      case "PING":
        connection.send({
          type: "PONG",
          payload: { clientSentAt: message.payload.clientSentAt },
          replyTo: message.id,
        });
        return;

      case "HELLO":
        connection.sendError("BAD_MESSAGE", "HELLO is only valid as the first message", message.id);
        return;

      case "LEAVE_MATCH":
        this.leaveMatch(match, player, connection);
        return;

      case "PLAYER_READY":
        if (match.phase !== "lobby") {
          connection.sendError("WRONG_PHASE", "Ready state only changes in the lobby", message.id);
          return;
        }
        player.ready = message.payload.ready;
        player.permissions = { ...message.payload.permissions };
        this.scheduleBroadcast(match);
        return;

      case "UPDATE_CONFIG":
        this.updateConfig(match, player, connection, message);
        return;

      // M2/M3/M5/M6 implement these. Refuse explicitly rather than half-apply.
      case "REQUEST_MATCH_START":
      case "UPDATE_LOCATION":
      case "REQUEST_SHOT":
      case "REQUEST_HEAL":
      case "REQUEST_PICKUP":
        connection.sendError(
          "INTERNAL",
          `${message.type} is not implemented yet; see docs/STATUS.md`,
          message.id,
        );
        return;
    }
  }

  handleDisconnect(connection: ClientConnection): void {
    this.hub.detach(connection.socket);
    const playerId = connection.playerId;
    const matchId = connection.matchId;
    connection.playerId = null;
    connection.matchId = null;
    if (playerId === null || matchId === null) return;

    // A replaced socket is already unbound; the newer socket owns this seat.
    if (this.hub.connectionForPlayer(playerId)) return;

    const match = this.registry.getById(matchId);
    const player = match?.players.get(playerId);
    if (!match || !player) return;

    player.connected = false;
    this.scheduleBroadcast(match);

    this.clearDisconnectTimer(playerId);
    const timer = setTimeout(() => {
      this.handleDisconnectTimeout(matchId, playerId);
    }, this.disconnectTimeoutMs);
    timer.unref?.();
    this.disconnectTimers.set(playerId, timer);
  }

  dispose(): void {
    for (const timer of this.disconnectTimers.values()) clearTimeout(timer);
    for (const timer of this.broadcastTimers.values()) clearTimeout(timer);
    this.disconnectTimers.clear();
    this.broadcastTimers.clear();
  }

  /* ───────────── lobby ───────────── */

  private updateConfig(
    match: Match,
    player: Player,
    connection: ClientConnection,
    message: Extract<ClientMessage, { type: "UPDATE_CONFIG" }>,
  ): void {
    if (match.hostPlayerId !== player.id) {
      connection.sendError("NOT_HOST", "Only the host can change match settings", message.id);
      return;
    }
    if (match.phase !== "lobby") {
      connection.sendError("WRONG_PHASE", "Settings are locked once the match starts", message.id);
      return;
    }

    const result = applyConfigPatch(match.config, message.payload.config, {
      allowDevMode: this.allowDevMode,
    });
    if (!result.ok) {
      connection.sendError("INVALID_CONFIG", result.message, message.id);
      return;
    }

    match.config = result.config;
    this.scheduleBroadcast(match);
  }

  private leaveMatch(match: Match, player: Player, connection: ClientConnection): void {
    if (match.phase !== "lobby") {
      connection.sendError("WRONG_PHASE", "Leaving an active match is not implemented yet (M2)");
      return;
    }

    this.hub.unbindPlayer(player.id, connection);
    connection.playerId = null;
    connection.matchId = null;
    this.clearDisconnectTimer(player.id);
    this.registry.removePlayer(match, player);

    if (this.registry.getById(match.id)) {
      this.scheduleBroadcast(match);
    } else {
      this.cancelBroadcast(match.id);
    }
    connection.close(1000, "left match");
  }

  private handleDisconnectTimeout(matchId: string, playerId: string): void {
    this.disconnectTimers.delete(playerId);
    const match = this.registry.getById(matchId);
    const player = match?.players.get(playerId);
    if (!match || !player || player.connected) return;
    if (match.phase !== "lobby") return; // active seats are kept until the match ends

    this.registry.removePlayer(match, player);
    if (this.registry.getById(match.id)) {
      this.scheduleBroadcast(match);
    } else {
      this.cancelBroadcast(match.id);
    }
  }

  /* ───────────── snapshots ───────────── */

  private scheduleBroadcast(match: Match): void {
    if (this.broadcastTimers.has(match.id)) return;
    const timer = setTimeout(() => {
      this.broadcastTimers.delete(match.id);
      this.broadcastNow(match);
    }, this.broadcastIntervalMs);
    timer.unref?.();
    this.broadcastTimers.set(match.id, timer);
  }

  private cancelBroadcast(matchId: string): void {
    const timer = this.broadcastTimers.get(matchId);
    if (timer) {
      clearTimeout(timer);
      this.broadcastTimers.delete(matchId);
    }
  }

  private broadcastNow(match: Match): void {
    for (const player of match.players.values()) {
      if (!player.connected) continue;
      const connection = this.hub.connectionForPlayer(player.id);
      if (!connection) continue;
      connection.send({ type: "MATCH_STATE", payload: match.stateFor(player.id) });
    }
  }

  private joinResponse(match: Match, player: Player): JoinResponse {
    return {
      matchId: match.id,
      joinCode: match.joinCode,
      joinUrl: new URL(`join/${match.joinCode}`, `${this.webBaseUrl}/`).toString(),
      playerId: player.id,
      sessionToken: player.sessionToken,
    };
  }

  private clearDisconnectTimer(playerId: string): void {
    const timer = this.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
    }
  }
}

