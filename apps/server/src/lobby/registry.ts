import type { MatchConfig } from "@fantom/shared";
import { generateJoinCode, normalizeJoinCode } from "./joinCode.js";
import { Match, type Player } from "./match.js";

export type SessionRef = { matchId: string; playerId: string };

/**
 * Active matches live in memory (PLAN P2.6): one process owns each match and a
 * restart loses them. Supabase persistence is an M7 option for results only.
 */
export class MatchRegistry {
  private readonly byId = new Map<string, Match>();
  private readonly byCode = new Map<string, Match>();
  private readonly sessions = new Map<string, SessionRef>();

  createMatch(config: MatchConfig, hostDisplayName: string): { match: Match; player: Player } {
    const joinCode = generateJoinCode((candidate) => this.byCode.has(candidate));
    const match = new Match(joinCode, config);
    const player = match.addPlayer(hostDisplayName);
    this.byId.set(match.id, match);
    this.byCode.set(joinCode, match);
    this.sessions.set(player.sessionToken, { matchId: match.id, playerId: player.id });
    return { match, player };
  }

  joinMatch(match: Match, displayName: string): Player {
    const player = match.addPlayer(displayName);
    this.sessions.set(player.sessionToken, { matchId: match.id, playerId: player.id });
    return player;
  }

  getById(matchId: string): Match | undefined {
    return this.byId.get(matchId);
  }

  getByCode(joinCode: string): Match | undefined {
    return this.byCode.get(normalizeJoinCode(joinCode));
  }

  /** Resolves a session credential — never a join code — to its player. */
  resolveSession(sessionToken: string): { match: Match; player: Player } | null {
    const ref = this.sessions.get(sessionToken);
    if (!ref) return null;
    const match = this.byId.get(ref.matchId);
    const player = match?.players.get(ref.playerId);
    if (!match || !player) {
      this.sessions.delete(sessionToken);
      return null;
    }
    return { match, player };
  }

  /** Removes a player; when the match is empty it is dropped entirely. */
  removePlayer(match: Match, player: Player): void {
    match.removePlayer(player.id);
    this.sessions.delete(player.sessionToken);
    if (match.players.size === 0) this.destroy(match);
  }

  destroy(match: Match): void {
    this.byId.delete(match.id);
    this.byCode.delete(match.joinCode);
    for (const player of match.players.values()) {
      this.sessions.delete(player.sessionToken);
    }
  }

  get matchCount(): number {
    return this.byId.size;
  }
}
