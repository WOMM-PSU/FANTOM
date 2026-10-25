import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ZodType } from "zod";
import { describe, expect, it } from "vitest";
import {
  ApiError,
  ClientMessage,
  CreateMatchRequest,
  JoinRequest,
  JoinResponse,
  MatchState,
  MatchSummary,
  ServerMessage,
} from "../src/index.js";

const FIXTURES = fileURLToPath(new URL("../fixtures", import.meta.url));

const HTTP_SCHEMAS: Record<string, ZodType> = {
  "create-request.json": CreateMatchRequest,
  "create-response.json": JoinResponse,
  "join-request.json": JoinRequest,
  "join-response.json": JoinResponse,
  "match-summary.json": MatchSummary,
  "api-error.json": ApiError,
};

const INVALID_HTTP_SCHEMAS: Record<string, ZodType> = {
  "create-request-empty-name.json": CreateMatchRequest,
  "api-error-unknown-code.json": ApiError,
  "match-summary-non-boolean.json": MatchSummary,
};

const EXPECTED_CLIENT_TYPES = [
  "HELLO",
  "PING",
  "LEAVE_MATCH",
  "UPDATE_CONFIG",
  "PLAYER_READY",
  "REQUEST_MATCH_START",
  "UPDATE_LOCATION",
  "REQUEST_SHOT",
  "REQUEST_HEAL",
  "REQUEST_PICKUP",
] as const;

const EXPECTED_SERVER_TYPES = [
  "WELCOME",
  "MATCH_STATE",
  "PONG",
  "SHOT_ACCEPTED",
  "SHOT_REJECTED",
  "PLAYER_DAMAGED",
  "PLAYER_ELIMINATED",
  "HEAL_APPLIED",
  "HEAL_REJECTED",
  "PICKUP_COLLECTED",
  "PICKUP_REJECTED",
  "MATCH_FINISHED",
  "ERROR",
] as const;

function filesIn(directory: string): string[] {
  return readdirSync(join(FIXTURES, directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
}

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, relativePath), "utf8")) as unknown;
}

function readAll(directory: string): Array<{ file: string; value: any }> {
  return filesIn(directory).map((file) => ({
    file,
    value: readJson(`${directory}/${file}`),
  }));
}

function parseOrThrow(schema: ZodType, value: unknown, label: string): any {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`${label} did not parse: ${JSON.stringify(result.error.issues, null, 2)}`);
  }
  return result.data;
}

describe("valid fixtures", () => {
  it("parses every client -> server message", () => {
    const fixtures = readAll("client");
    expect(fixtures.length).toBeGreaterThan(0);
    for (const fixture of fixtures) {
      parseOrThrow(ClientMessage, fixture.value, `client/${fixture.file}`);
    }
  });

  it("parses every server -> client message and embedded state", () => {
    const fixtures = readAll("server");
    expect(fixtures.length).toBeGreaterThan(0);
    for (const fixture of fixtures) {
      parseOrThrow(ServerMessage, fixture.value, `server/${fixture.file}`);
      if (fixture.value.type === "MATCH_STATE") {
        parseOrThrow(MatchState, fixture.value.payload, `server/${fixture.file} state`);
      }
      if (fixture.value.type === "WELCOME") {
        parseOrThrow(MatchState, fixture.value.payload.state, `server/${fixture.file} state`);
      }
    }
  });

  it("parses every HTTP fixture with its matching schema", () => {
    const files = filesIn("http");
    expect(files).toEqual(Object.keys(HTTP_SCHEMAS).sort());
    for (const file of files) {
      const schema = HTTP_SCHEMAS[file];
      if (!schema) throw new Error(`No HTTP schema for ${file}`);
      parseOrThrow(schema, readJson(`http/${file}`), `http/${file}`);
    }
  });

  it("covers every client message type and both shot evidence sources", () => {
    const fixtures = readAll("client");
    const types = new Set(fixtures.map((fixture) => fixture.value.type));
    expect([...types].sort()).toEqual([...EXPECTED_CLIENT_TYPES].sort());

    const shotSources = fixtures
      .filter((fixture) => fixture.value.type === "REQUEST_SHOT")
      .map((fixture) => fixture.value.payload.evidence.source)
      .sort();
    expect(shotSources).toEqual(["camera", "dev_simulated"]);
  });

  it("covers every server message type and every required state variant", () => {
    const fixtures = readAll("server");
    const types = new Set(fixtures.map((fixture) => fixture.value.type));
    expect([...types].sort()).toEqual([...EXPECTED_SERVER_TYPES].sort());

    const states = fixtures
      .filter((fixture) => fixture.value.type === "MATCH_STATE")
      .map((fixture) => fixture.value.payload);
    const phases = new Set(states.map((state) => state.phase));
    expect(phases).toEqual(new Set(["lobby", "countdown", "active", "finished"]));

    expect(states.some((state) => state.self.inZone === false)).toBe(true);
    expect(states.some((state) => state.config.mode === "assassin")).toBe(true);
    expect(states.some((state) => state.config.mode === "team_deathmatch")).toBe(true);
    expect(states.some((state) => state.phase === "finished" && state.result !== null)).toBe(true);
  });
});

describe("invalid fixtures", () => {
  it("rejects every invalid client example", () => {
    for (const { file, value } of readAll("invalid/client")) {
      expect(ClientMessage.safeParse(value).success, file).toBe(false);
    }
  });

  it("rejects every invalid server example", () => {
    for (const { file, value } of readAll("invalid/server")) {
      expect(ServerMessage.safeParse(value).success, file).toBe(false);
    }
  });

  it("rejects every invalid HTTP example", () => {
    const files = filesIn("invalid/http");
    expect(files).toEqual(Object.keys(INVALID_HTTP_SCHEMAS).sort());
    for (const file of files) {
      const schema = INVALID_HTTP_SCHEMAS[file];
      if (!schema) throw new Error(`No invalid HTTP schema for ${file}`);
      expect(schema.safeParse(readJson(`invalid/http/${file}`)).success, file).toBe(false);
    }
  });
});

describe("state visibility invariants", () => {
  const states = readAll("server").flatMap((fixture) => {
    if (fixture.value.type === "MATCH_STATE") {
      return [{ file: fixture.file, state: fixture.value.payload }];
    }
    if (fixture.value.type === "WELCOME") {
      return [{ file: fixture.file, state: fixture.value.payload.state }];
    }
    return [];
  });

  it("keeps WELCOME identity consistent", () => {
    for (const { file, value } of readAll("server")) {
      if (value.type !== "WELCOME") continue;
      expect(value.payload.playerId, file).toBe(value.payload.state.self.playerId);
    }
  });

  it("always names a self that exists in the player list", () => {
    for (const { file, state } of states) {
      const ids = state.players.map((player: any) => player.id);
      expect(ids, file).toContain(state.self.playerId);
    }
  });

  it("never puts another player's marker code or session token in a payload", () => {
    for (const { file, value } of readAll("server")) {
      const text = JSON.stringify(value);
      expect(text, file).not.toContain("sessionToken");

      if (value.type !== "MATCH_STATE") continue;
      for (const player of value.payload.players) {
        expect(Object.hasOwn(player, "markerCode"), `${file}: ${player.id}`).toBe(false);
        expect(Object.hasOwn(player, "sessionToken"), `${file}: ${player.id}`).toBe(false);
        expect(Object.hasOwn(player, "health"), `${file}: ${player.id}`).toBe(false);
      }
    }
  });

  it("uses phase-consistent timestamps and results", () => {
    for (const { file, state } of states) {
      if (state.phase === "lobby") {
        expect(state.result, file).toBeNull();
        expect(state.startedAt, file).toBeNull();
        expect(state.endsAt, file).toBeNull();
      }
      if (state.phase === "countdown") {
        expect(state.countdownEndsAt, file).not.toBeNull();
        expect(state.result, file).toBeNull();
      }
      if (state.phase === "active") {
        expect(state.startedAt, file).not.toBeNull();
        expect(state.endsAt, file).not.toBeNull();
        expect(state.result, file).toBeNull();
      }
      if (state.phase === "finished") {
        expect(state.result, file).not.toBeNull();
        expect(state.endsAt, file).not.toBeNull();
      }
    }
  });

  it("hides survivor positions from the assassin fixture", () => {
    const assassin = states.find(({ state }) => state.config.mode === "assassin");
    expect(assassin).toBeDefined();
    for (const player of assassin!.state.players) {
      if (player.role === "survivor") {
        expect(player.position, player.id).toBeNull();
      }
    }
  });

  it("hides enemy positions in the active FFA fixture", () => {
    const active = states.find(
      ({ file }) => file === "match-state-active-ffa.json",
    );
    expect(active).toBeDefined();
    const others = active!.state.players.filter(
      (player: any) => player.id !== active!.state.self.playerId,
    );
    for (const player of others) {
      expect(player.position, player.id).toBeNull();
    }
  });
});
