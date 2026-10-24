import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MAX_MESSAGE_BYTES } from "@fantom/shared";
import { WebSocketServer } from "ws";
import { GameService } from "./game/service.js";
import { createHttpHandler } from "./http/server.js";
import { MatchRegistry } from "./lobby/registry.js";
import { ConnectionHub } from "./networking/hub.js";
import { createGateway } from "./networking/ws.js";

export type FantomServerOptions = {
  port?: number;
  host?: string;
  webBaseUrl?: string;
  allowedOrigins?: string[];
  allowDevMode?: boolean;
  disconnectTimeoutMs?: number;
  broadcastIntervalMs?: number;
};

export type FantomServer = {
  readonly port: number;
  readonly httpServer: Server;
  readonly wss: WebSocketServer;
  readonly registry: MatchRegistry;
  readonly service: GameService;
  close(): Promise<void>;
};

export async function startFantomServer(options: FantomServerOptions = {}): Promise<FantomServer> {
  const webBaseUrl = options.webBaseUrl ?? "http://localhost:3000";
  new URL(webBaseUrl); // fail fast on a malformed base URL

  const allowedOrigins = options.allowedOrigins ?? ["http://localhost:3000"];
  const registry = new MatchRegistry();
  const hub = new ConnectionHub();
  const service = new GameService({
    registry,
    hub,
    webBaseUrl,
    allowDevMode: options.allowDevMode ?? false,
    disconnectTimeoutMs: options.disconnectTimeoutMs,
    broadcastIntervalMs: options.broadcastIntervalMs,
  });

  const httpServer = createServer(createHttpHandler({ service, allowedOrigins }));
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    maxPayload: MAX_MESSAGE_BYTES,
    verifyClient: ({ origin }: { origin?: string }) =>
      origin === undefined || allowedOrigins.length === 0 || allowedOrigins.includes(origin),
  });
  createGateway(wss, { service, hub });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    httpServer.once("error", onError);
    httpServer.listen(options.port ?? 8080, options.host ?? "0.0.0.0", () => {
      httpServer.off("error", onError);
      resolve();
    });
  });

  const address = httpServer.address();
  const port = typeof address === "object" && address !== null ? address.port : (options.port ?? 8080);

  let closing: Promise<void> | null = null;
  const close = (): Promise<void> => {
    closing ??= (async () => {
      service.dispose();
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
    })();
    return closing;
  };

  return { port, httpServer, wss, registry, service, close };
}

function loadEnvironment(): void {
  const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

async function main(): Promise<void> {
  loadEnvironment();

  const port = Number(process.env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`[fantom] invalid PORT: ${process.env.PORT ?? ""}`);
    process.exit(1);
  }

  const allowDevMode = process.env.ALLOW_DEV_MODE === "true";
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  const server = await startFantomServer({
    port,
    webBaseUrl: process.env.WEB_BASE_URL ?? "http://localhost:3000",
    allowedOrigins,
    allowDevMode,
  });

  console.log(`[fantom] server listening on http://localhost:${server.port} (ws path /ws)`);
  if (allowDevMode) {
    console.warn("[fantom] DEV_ONLY: ALLOW_DEV_MODE=true — simulated aim/location is permitted");
  }

  const shutdown = (signal: string): void => {
    console.log(`[fantom] ${signal} received, shutting down`);
    void server
      .close()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        console.error("[fantom] shutdown failed", error);
        process.exit(1);
      });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href) {
  void main().catch((error: unknown) => {
    console.error("[fantom] failed to start", error);
    process.exit(1);
  });
}
