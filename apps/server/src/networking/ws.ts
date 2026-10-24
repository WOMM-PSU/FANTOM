import { ClientMessage, PROTOCOL_VERSION } from "@fantom/shared";
import type { WebSocketServer, RawData } from "ws";
import { GameService } from "../game/service.js";
import { summarizeIssues } from "../validation/issues.js";
import { CLOSE_HANDSHAKE_FAILED } from "./connection.js";
import { ConnectionHub } from "./hub.js";

const HANDSHAKE_TIMEOUT_MS = 5_000;

export type GatewayOptions = {
  service: GameService;
  hub: ConnectionHub;
};

function rawToString(raw: RawData): string {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString("utf8");
  if (Buffer.isBuffer(raw)) return raw.toString("utf8");
  return Buffer.from(raw).toString("utf8");
}

function protocolMismatch(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "v" in value &&
    (value as { v?: unknown }).v !== PROTOCOL_VERSION
  );
}

export function createGateway(wss: WebSocketServer, options: GatewayOptions): void {
  const { service, hub } = options;

  wss.on("connection", (socket) => {
    const connection = hub.attach(socket);

    const handshakeTimer = setTimeout(() => {
      if (connection.playerId === null) {
        connection.close(CLOSE_HANDSHAKE_FAILED, "hello timeout");
      }
    }, HANDSHAKE_TIMEOUT_MS);
    handshakeTimer.unref?.();

    socket.on("message", (raw) => {
      if (!connection.tryConsumeMessage(Date.now())) {
        connection.sendError("RATE_LIMITED", "Too many messages; slow down");
        return;
      }

      let json: unknown;
      try {
        json = JSON.parse(rawToString(raw));
      } catch {
        connection.sendError("BAD_MESSAGE", "Message must be valid JSON");
        return;
      }

      if (protocolMismatch(json)) {
        connection.sendError(
          "PROTOCOL_VERSION_MISMATCH",
          `This server speaks protocol v${PROTOCOL_VERSION}`,
        );
        return;
      }

      const parsed = ClientMessage.safeParse(json);
      if (!parsed.success) {
        connection.sendError("BAD_MESSAGE", summarizeIssues(parsed.error));
        return;
      }

      const message = parsed.data;
      if (connection.playerId === null) {
        if (message.type !== "HELLO") {
          connection.sendError("BAD_MESSAGE", "The first message must be HELLO");
          connection.close(CLOSE_HANDSHAKE_FAILED, "expected hello");
          return;
        }
        clearTimeout(handshakeTimer);
        service.handleHello(connection, message.payload.sessionToken);
        return;
      }

      service.handleMessage(connection, message);
    });

    socket.on("close", () => {
      clearTimeout(handshakeTimer);
      service.handleDisconnect(connection);
    });

    socket.on("error", () => {
      // The close handler owns cleanup; ws emits error before close.
    });
  });
}

