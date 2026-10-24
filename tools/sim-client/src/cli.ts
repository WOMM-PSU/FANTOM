import type { MatchState } from "@fantom/shared";
import {
  connectSim,
  createMatch,
  endpointsFromBase,
  fetchMatchSummary,
  joinMatch,
  type SimConnection,
} from "./index.js";

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg?.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (!key) continue;
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) index += 1;
    if (value !== undefined && !value.startsWith("--")) args.set(key, value);
  }
  return args;
}

function summarize(state: MatchState) {
  return {
    matchId: state.matchId,
    joinCode: state.joinCode,
    phase: state.phase,
    hostPlayerId: state.hostPlayerId,
    you: state.self.playerId,
    mode: state.config.mode,
    durationSec: state.config.durationSec,
    players: state.players.map((player) => ({
      id: player.id,
      displayName: player.displayName,
      ready: player.ready,
      connected: player.connected,
      host: player.id === state.hostPlayerId,
    })),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const server = args.get("server") ?? "http://localhost:8080";
  const botCount = Math.max(1, Number(args.get("bots") ?? 2));

  console.log(`[sim] server ${server}, host + ${botCount} bots`);
  const host = await createMatch(server, "Sim Host");
  const endpoints = endpointsFromBase(server);

  const sessions = [host];
  for (let index = 0; index < botCount; index += 1) {
    sessions.push(await joinMatch(server, host.joinCode, `Sim Bot ${index + 1}`));
  }

  const summary = await fetchMatchSummary(server, host.joinCode);
  console.log("[sim] match summary:", summary);

  const clients: SimConnection[] = [];
  try {
    for (const session of sessions) {
      const { client, state } = await connectSim(endpoints, session);
      clients.push(client);
      console.log(
        `[sim] player ${session.playerId} joined: ${state.players.length} player(s)` +
          `, marker ${state.self.markerCode}`,
      );
    }

    const hostClient = clients[0]!;
    const expectedPlayers = sessions.length;
    await hostClient.waitForState((state) => state.players.length === expectedPlayers);
    console.log("[sim] all clients see", expectedPlayers, "players");

    for (const [index, client] of clients.entries()) {
      client.send("PLAYER_READY", {
        ready: true,
        permissions: { camera: false, orientation: false, location: false },
      });
      console.log(`[sim] client ${index} ready`);
    }
    const readyState = await hostClient.waitForState((state) =>
      state.players.every((player) => player.ready),
    );
    console.log("[sim] lobby:", JSON.stringify(summarize(readyState), null, 2));

    const firstBot = clients[1];
    if (firstBot) {
      firstBot.send("UPDATE_CONFIG", { config: { durationSec: 600 } });
      const rejection = await firstBot.waitFor("ERROR");
      console.log("[sim] non-host update correctly rejected:", rejection.payload.code);

      hostClient.send("UPDATE_CONFIG", { config: { durationSec: 600 } });
      const patched = await hostClient.waitForState((state) => state.config.durationSec === 600);
      console.log("[sim] host update visible to all:", patched.config.durationSec);
    }

    if (firstBot) {
      firstBot.close();
      await hostClient.waitForState(
        (state) => state.players.filter((player) => player.connected).length === expectedPlayers - 1,
      );
      console.log("[sim] disconnect surfaced to the lobby");
    }

    console.log("[sim] OK");
  } finally {
    for (const client of clients) client.close();
  }
}

void main().catch((error: unknown) => {
  console.error("[sim] FAILED", error);
  process.exitCode = 1;
});
