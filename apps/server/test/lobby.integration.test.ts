import {
  JoinResponse,
  ServerMessage,
  type MatchState,
} from "@fantom/shared";
import {
  connectSim,
  createMatch,
  fetchMatchSummary,
  joinMatch,
  type SimConnection,
} from "@fantom/sim-client";
import { afterEach, describe, expect, it } from "vitest";
import { delay, eventually, RawClient, startTestServer, type TestServer } from "./helpers.js";

const servers: TestServer[] = [];
const clients: SimConnection[] = [];
const raws: RawClient[] = [];

async function testServer(options: Parameters<typeof startTestServer>[0] = {}): Promise<TestServer> {
  const started = await startTestServer(options);
  servers.push(started);
  return started;
}

async function connect(
  server: TestServer,
  session: JoinResponse,
): Promise<{ client: SimConnection; state: MatchState }> {
  const connected = await connectSim(server.endpoints, session);
  clients.push(connected.client);
  return connected;
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  for (const raw of raws.splice(0)) raw.close();
  await Promise.all(servers.splice(0).map((started) => started.server.close()));
});

describe("lobby slice", () => {
  it("creates and joins a match over HTTP", async () => {
    const server = await testServer();

    const host = await createMatch(server.baseUrl, "  Ada  ");
    expect(JoinResponse.safeParse(host).success).toBe(true);
    expect(host.joinCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
    expect(host.joinUrl).toBe(`https://fantom.test/join/${host.joinCode}`);

    const summary = await fetchMatchSummary(server.baseUrl, host.joinCode.toLowerCase());
    expect(summary).toEqual({
      joinCode: host.joinCode,
      phase: "lobby",
      mode: "ffa",
      playerCount: 1,
      maxPlayers: 16,
      joinable: true,
    });

    const guest = await joinMatch(server.baseUrl, host.joinCode, "Grace");
    expect(guest.matchId).toBe(host.matchId);
    expect(guest.playerId).not.toBe(host.playerId);
    expect(guest.sessionToken).not.toBe(host.sessionToken);

    const afterJoin = await fetchMatchSummary(server.baseUrl, host.joinCode);
    expect(afterJoin.playerCount).toBe(2);
  });

  it("rejects joins to a full lobby", async () => {
    const server = await testServer();
    const host = await createMatch(server.baseUrl, "Host");
    for (let index = 0; index < 15; index += 1) {
      await joinMatch(server.baseUrl, host.joinCode, `Player ${index + 1}`);
    }

    const summary = await fetchMatchSummary(server.baseUrl, host.joinCode);
    expect(summary.playerCount).toBe(16);
    expect(summary.joinable).toBe(false);

    const response = await fetch(
      `${server.baseUrl}/api/matches/${host.joinCode}/join`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Latecomer" }),
      },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "LOBBY_FULL" } });
  });

  it("rejects bad HTTP input without crashing", async () => {
    const server = await testServer();

    const health = await fetch(`${server.baseUrl}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true, protocolVersion: 1 });

    const nameless = await fetch(`${server.baseUrl}/api/matches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "<>" }),
    });
    expect(nameless.status).toBe(400);
    expect(await nameless.json()).toMatchObject({ error: { code: "BAD_MESSAGE" } });

    const malformed = await fetch(`${server.baseUrl}/api/matches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(malformed.status).toBe(400);

    const missing = await fetch(`${server.baseUrl}/api/matches/ZZZZZ`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: { code: "MATCH_NOT_FOUND" } });
  });

  it("keeps two clients in sync and never leaks hidden data", async () => {
    const server = await testServer();
    const hostSession = await createMatch(server.baseUrl, "Host");
    const guestSession = await joinMatch(server.baseUrl, hostSession.joinCode, "Guest");

    const host = await connect(server, hostSession);
    const guest = await connect(server, guestSession);

    const hostState = await host.client.waitForState((state) => state.players.length === 2);
    const guestState = guest.state;
    expect(guestState).not.toBeNull();

    expect(hostState.players.map((player) => player.displayName).sort()).toEqual(["Guest", "Host"]);
    expect(hostState.hostPlayerId).toBe(hostSession.playerId);
    expect(hostState.self.playerId).toBe(hostSession.playerId);
    expect(guestState!.self.playerId).toBe(guestSession.playerId);
    expect(hostState.self.markerCode).not.toBe(guestState!.self.markerCode);
    expect(new Set(guestState!.players.map((player) => player.id))).toEqual(
      new Set(hostState.players.map((player) => player.id)),
    );

    for (const state of [hostState, guestState!]) {
      const markerCodes = JSON.stringify(state).match(/"markerCode":\d+/g) ?? [];
      expect(markerCodes).toEqual([`"markerCode":${state.self.markerCode}`]);
      expect(JSON.stringify(state)).not.toContain("sessionToken");
      expect(state.players.every((player) => player.position === null)).toBe(true);
      expect(state.players.every((player) => player.healthFraction === null)).toBe(true);
      expect(state.players.every((player) => player.role === null)).toBe(true);
    }

    for (const message of [...host.client.received, ...guest.client.received]) {
      expect(ServerMessage.safeParse(message).success).toBe(true);
    }
  });

  it("applies host settings and ready state, and refuses non-host edits", async () => {
    const server = await testServer();
    const hostSession = await createMatch(server.baseUrl, "Host");
    const guestSession = await joinMatch(server.baseUrl, hostSession.joinCode, "Guest");
    const host = await connect(server, hostSession);
    const guest = await connect(server, guestSession);
    await host.client.waitForState((state) => state.players.length === 2);

    guest.client.send("UPDATE_CONFIG", { config: { durationSec: 900 } });
    const rejected = await guest.client.waitFor("ERROR");
    expect(rejected.payload).toMatchObject({ code: "NOT_HOST" });

    host.client.send("UPDATE_CONFIG", { config: { durationSec: 900 } });
    const patched = await guest.client.waitForState((state) => state.config.durationSec === 900);
    expect(patched.config.durationSec).toBe(900);

    guest.client.send("UPDATE_CONFIG", { config: { mode: "assassin" } });
    const secondRejection = await guest.client.waitFor("ERROR", {
      predicate: (message) => message.payload.code === "NOT_HOST",
    });
    expect(secondRejection).toBeTruthy();

    host.client.send("UPDATE_CONFIG", { config: { mode: "assassin" } });
    const assassin = await host.client.waitForState((state) => state.config.mode === "assassin");
    expect(assassin.config.spawnLockoutSec).toBe(15);
    expect(assassin.config.minimap.showEnemies).toBe(false);

    host.client.send("PLAYER_READY", {
      ready: true,
      permissions: { camera: true, orientation: false, location: true },
    });
    const ready = await guest.client.waitForState((state) =>
      state.players.some((player) => player.id === hostSession.playerId && player.ready),
    );
    expect(JSON.stringify(ready)).not.toContain("permissions");
  });

  it("rebinds a reconnecting session and closes the replaced socket with 4001", async () => {
    const server = await testServer();
    const hostSession = await createMatch(server.baseUrl, "Host");
    const guestSession = await joinMatch(server.baseUrl, hostSession.joinCode, "Guest");
    const first = await connect(server, hostSession);
    const guest = await connect(server, guestSession);
    await first.client.waitForState((state) => state.players.length === 2);

    const replacedCode = new Promise<number>((resolve) => {
      first.client.socket.once("close", (code) => resolve(code));
    });

    const second = await connect(server, hostSession);
    expect(await replacedCode).toBe(4001);

    const state = await second.client.waitForState(
      (snapshot) => snapshot.players.length === 2 && snapshot.self.playerId === hostSession.playerId,
    );
    expect(state.players.filter((player) => player.connected)).toHaveLength(2);

    const summary = await fetchMatchSummary(server.baseUrl, hostSession.joinCode);
    expect(summary.playerCount).toBe(2);
    expect(guest.state?.self.playerId).toBe(guestSession.playerId);
  });

  it("removes a leaving player and transfers the host role", async () => {
    const server = await testServer();
    const hostSession = await createMatch(server.baseUrl, "Host");
    const guestSession = await joinMatch(server.baseUrl, hostSession.joinCode, "Guest");
    const host = await connect(server, hostSession);
    const guest = await connect(server, guestSession);
    await guest.client.waitForState((state) => state.players.length === 2);

    const closeCode = new Promise<number>((resolve) => {
      host.client.socket.once("close", (code) => resolve(code));
    });
    host.client.send("LEAVE_MATCH", {});
    expect(await closeCode).toBe(1000);

    const state = await guest.client.waitForState(
      (snapshot) => snapshot.players.length === 1 && snapshot.hostPlayerId === guestSession.playerId,
    );
    expect(state.players[0]!.id).toBe(guestSession.playerId);

    const summary = await fetchMatchSummary(server.baseUrl, hostSession.joinCode);
    expect(summary.playerCount).toBe(1);
  });

  it("marks a dropped player disconnected, then removes them after the timeout", async () => {
    const server = await testServer({ disconnectTimeoutMs: 150 });
    const hostSession = await createMatch(server.baseUrl, "Host");
    const guestSession = await joinMatch(server.baseUrl, hostSession.joinCode, "Guest");
    const host = await connect(server, hostSession);
    const guest = await connect(server, guestSession);
    await host.client.waitForState((state) => state.players.length === 2);

    guest.client.close();

    const offline = await host.client.waitForState((state) =>
      state.players.some((player) => player.id === guestSession.playerId && !player.connected),
    );
    expect(offline.players.find((player) => player.id === guestSession.playerId)?.connected).toBe(false);

    const removed = await host.client.waitForState((state) => state.players.length === 1);
    expect(removed.players[0]!.id).toBe(hostSession.playerId);
  });

  it("enforces the HELLO handshake, protocol version and message shape", async () => {
    const server = await testServer();
    const session = await createMatch(server.baseUrl, "Raw");

    const notHello = new RawClient(server.endpoints.wsUrl);
    raws.push(notHello);
    await notHello.open();
    notHello.send({ type: "PING", payload: { clientSentAt: 1 } });
    const badFirst = await notHello.waitFor((message) => message.type === "ERROR");
    expect(badFirst.payload).toMatchObject({ code: "BAD_MESSAGE" });
    expect(await notHello.waitForClose()).toBe(4002);

    const badToken = new RawClient(server.endpoints.wsUrl);
    raws.push(badToken);
    await badToken.open();
    badToken.send({ type: "HELLO", payload: { sessionToken: "x".repeat(32) } });
    const unauthenticated = await badToken.waitFor((message) => message.type === "ERROR");
    expect(unauthenticated.payload).toMatchObject({ code: "UNAUTHENTICATED" });
    expect(await badToken.waitForClose()).toBe(4002);

    const wrongVersion = new RawClient(server.endpoints.wsUrl);
    raws.push(wrongVersion);
    await wrongVersion.open();
    wrongVersion.send({ v: 2, type: "HELLO", payload: { sessionToken: session.sessionToken } });
    const mismatch = await wrongVersion.waitFor((message) => message.type === "ERROR");
    expect(mismatch.payload).toMatchObject({ code: "PROTOCOL_VERSION_MISMATCH" });

    const malformed = new RawClient(server.endpoints.wsUrl);
    raws.push(malformed);
    await malformed.open();
    malformed.send({ type: "NOPE", payload: {} });
    const unknown = await malformed.waitFor((message) => message.type === "ERROR");
    expect(unknown.payload).toMatchObject({ code: "BAD_MESSAGE" });

    malformed.sendRaw("{not json");
    await eventually(
      () => malformed.messages.filter((message) => message.type === "ERROR").length >= 2,
    );
  });

  it("rejects WebSocket upgrades from origins outside the allowlist", async () => {
    const server = await testServer();
    const rejected = new RawClient(server.endpoints.wsUrl, { origin: "https://evil.test" });

    const status = await new Promise<number>((resolve, reject) => {
      rejected.socket.once("unexpected-response", (_request, response) => {
        resolve(response.statusCode ?? 0);
      });
      rejected.socket.once("open", () => reject(new Error("evil origin was accepted")));
      rejected.socket.once("error", () => reject(new Error("unexpected socket error")));
    });
    expect(status).toBe(401);
  });

  it("ignores duplicate request ids", async () => {
    const server = await testServer();
    const session = await createMatch(server.baseUrl, "Duplicate");

    const raw = new RawClient(server.endpoints.wsUrl);
    raws.push(raw);
    await raw.open();
    raw.send({ type: "HELLO", payload: { sessionToken: session.sessionToken } });
    await raw.waitFor((message) => message.type === "WELCOME");

    raw.send({
      id: "duplicate-id",
      type: "PLAYER_READY",
      payload: { ready: true, permissions: { camera: true, orientation: true, location: true } },
    });
    await raw.waitFor(
      (message) =>
        message.type === "MATCH_STATE" && message.payload.players[0]?.ready === true,
    );

    raw.send({
      id: "duplicate-id",
      type: "PLAYER_READY",
      payload: { ready: false, permissions: { camera: false, orientation: false, location: false } },
    });
    await delay(120);

    const states = raw.messages.filter((message) => message.type === "MATCH_STATE");
    expect(states.at(-1)?.payload.players[0]?.ready).toBe(true);
  });

  it("rate limits message floods", async () => {
    const server = await testServer();
    const session = await createMatch(server.baseUrl, "Flood");

    const raw = new RawClient(server.endpoints.wsUrl);
    raws.push(raw);
    await raw.open();
    raw.send({ type: "HELLO", payload: { sessionToken: session.sessionToken } });
    await raw.waitFor((message) => message.type === "WELCOME");

    for (let index = 0; index < 40; index += 1) {
      raw.send({ type: "PING", payload: { clientSentAt: index } });
    }

    const limited = await raw.waitFor(
      (message) => message.type === "ERROR" && message.payload.code === "RATE_LIMITED",
    );
    expect(limited).toBeTruthy();
  });
});
