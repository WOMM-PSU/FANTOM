import { randomBytes, randomUUID } from "node:crypto";
import {
  MAX_HEALTH,
  MAX_PLAYERS,
  type MatchConfig,
  type MatchPhase,
  type MatchResult,
  type MatchState,
  type MatchSummary,
  type PlayerPublic,
  type PlayerStatus,
  type SelfView,
} from "@fantom/shared";

export type PlayerPermissions = { camera: boolean; orientation: boolean; location: boolean };

/** Server-internal player record (PLAN S12). Never sent to other clients as-is. */
export type Player = {
  id: string;
  displayName: string;
  sessionToken: string;
  ready: boolean;
  permissions: PlayerPermissions;
  connected: boolean;
  markerCode: number;
  joinedAt: number;
  status: PlayerStatus;
  health: number;
  maxHealth: number;
  shield: number;
  score: number;
};

export class Match {
  readonly id: string = randomUUID();
  readonly joinCode: string;
  readonly createdAt: number = Date.now();
  readonly players = new Map<string, Player>();

  hostPlayerId: string;
  phase: MatchPhase = "lobby";
  config: MatchConfig;
  countdownEndsAt: number | null = null;
  startedAt: number | null = null;
  endsAt: number | null = null;
  result: MatchResult | null = null;

  constructor(joinCode: string, config: MatchConfig) {
    this.joinCode = joinCode;
    this.config = config;
    this.hostPlayerId = "";
  }

  get isFull(): boolean {
    return this.players.size >= MAX_PLAYERS;
  }

  /** Join order, which is also the host-transfer order. */
  get playerList(): Player[] {
    return [...this.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
  }

  addPlayer(displayName: string): Player {
    const player: Player = {
      id: randomUUID(),
      displayName,
      sessionToken: randomBytes(32).toString("base64url"),
      ready: false,
      permissions: { camera: false, orientation: false, location: false },
      connected: false,
      markerCode: this.allocateMarkerCode(),
      joinedAt: Date.now(),
      status: "alive",
      health: MAX_HEALTH,
      maxHealth: MAX_HEALTH,
      shield: 0,
      score: 0,
    };
    this.players.set(player.id, player);
    if (this.hostPlayerId === "") this.hostPlayerId = player.id;
    return player;
  }

  /** Removes a player and moves host to the next player; returns null if absent. */
  removePlayer(playerId: string): Player | null {
    const player = this.players.get(playerId) ?? null;
    if (!player) return null;
    this.players.delete(playerId);
    if (this.hostPlayerId === playerId && this.players.size > 0) {
      this.hostPlayerId = this.playerList[0]!.id;
    }
    return player;
  }

  /**
   * Snapshot for one recipient. Hidden data never leaves the server: other
   * players' marker codes and session tokens are absent, and positions stay
   * null until a mode's visibility rules allow this viewer to see them
   * (PLAN P4.5).
   */
  stateFor(playerId: string): MatchState {
    const viewer = this.players.get(playerId);
    if (!viewer) throw new Error(`player ${playerId} is not in match ${this.id}`);

    const players: PlayerPublic[] = this.playerList.map((player) => ({
      id: player.id,
      displayName: player.displayName,
      teamId: null,
      role: null,
      status: player.status,
      connected: player.connected,
      ready: player.ready,
      healthFraction: this.phase === "active" ? player.health / player.maxHealth : null,
      score: player.score,
      position: null,
    }));

    const self: SelfView = {
      playerId: viewer.id,
      markerCode: viewer.markerCode,
      health: viewer.health,
      maxHealth: viewer.maxHealth,
      shield: viewer.shield,
      weaponId: null,
      ammo: 0,
      nextShotAt: 0,
      reloadCompleteAt: null,
      spawnLockedUntil: 0,
      locationQuality: "none",
      inZone: null,
      returnGraceUntil: null,
    };

    return {
      matchId: this.id,
      joinCode: this.joinCode,
      phase: this.phase,
      hostPlayerId: this.hostPlayerId,
      config: this.config,
      players,
      self,
      pickups: [],
      teamScores: {},
      countdownEndsAt: this.countdownEndsAt,
      startedAt: this.startedAt,
      endsAt: this.endsAt,
      result: this.result,
    };
  }

  summary(): MatchSummary {
    return {
      joinCode: this.joinCode,
      phase: this.phase,
      mode: this.config.mode,
      playerCount: this.players.size,
      maxPlayers: MAX_PLAYERS,
      joinable: this.phase === "lobby" && !this.isFull,
    };
  }

  private allocateMarkerCode(): number {
    const used = new Set([...this.players.values()].map((player) => player.markerCode));
    for (let code = 0; code <= 255; code += 1) {
      if (!used.has(code)) return code;
    }
    throw new Error("marker codes exhausted");
  }
}
