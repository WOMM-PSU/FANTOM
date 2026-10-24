import type { WebSocket } from "ws";
import { CLOSE_REPLACED, ClientConnection, type OutboundMessage } from "./connection.js";

/** Owns the two directions of the socket index: socket→connection and player→connection. */
export class ConnectionHub {
  private readonly bySocket = new Map<WebSocket, ClientConnection>();
  private readonly byPlayer = new Map<string, ClientConnection>();

  attach(socket: WebSocket): ClientConnection {
    const connection = new ClientConnection(socket);
    this.bySocket.set(socket, connection);
    return connection;
  }

  connectionForSocket(socket: WebSocket): ClientConnection | undefined {
    return this.bySocket.get(socket);
  }

  connectionForPlayer(playerId: string): ClientConnection | undefined {
    return this.byPlayer.get(playerId);
  }

  /** Binds a player to a socket, replacing (closing) any previous one. */
  bindPlayer(playerId: string, connection: ClientConnection): void {
    const previous = this.byPlayer.get(playerId);
    if (previous && previous !== connection) {
      previous.playerId = null;
      previous.close(CLOSE_REPLACED, "replaced by a newer connection");
    }
    this.byPlayer.set(playerId, connection);
  }

  unbindPlayer(playerId: string, connection: ClientConnection): void {
    if (this.byPlayer.get(playerId) === connection) this.byPlayer.delete(playerId);
  }

  detach(socket: WebSocket): ClientConnection | undefined {
    const connection = this.bySocket.get(socket);
    if (!connection) return undefined;
    this.bySocket.delete(socket);
    if (connection.playerId !== null) this.unbindPlayer(connection.playerId, connection);
    return connection;
  }

  sendToPlayer(playerId: string, message: OutboundMessage): boolean {
    const connection = this.byPlayer.get(playerId);
    if (!connection) return false;
    connection.send(message);
    return true;
  }
}
