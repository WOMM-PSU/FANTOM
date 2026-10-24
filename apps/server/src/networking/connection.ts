import { PROTOCOL_VERSION, type ErrorCode, type ServerMessage } from "@fantom/shared";
import { WebSocket } from "ws";

/** Documented close codes (PLAN P4.3). */
export const CLOSE_REPLACED = 4001;
export const CLOSE_HANDSHAKE_FAILED = 4002;

export const MAX_MESSAGES_PER_SECOND = 30;
export const RECENT_REQUEST_IDS = 256;

type ServerMessageOf<K extends ServerMessage["type"]> = Extract<ServerMessage, { type: K }>;

/** A server→client message before seq/serverTime are added. */
export type OutboundMessage = {
  [K in ServerMessage["type"]]: {
    type: K;
    payload: ServerMessageOf<K>["payload"];
    replyTo?: string;
  };
}[ServerMessage["type"]];

export class ClientConnection {
  readonly socket: WebSocket;
  playerId: string | null = null;
  matchId: string | null = null;

  private seq = 0;
  private windowStartMs = Date.now();
  private messagesInWindow = 0;
  private readonly recentIds: string[] = [];
  private readonly recentIdSet = new Set<string>();

  constructor(socket: WebSocket) {
    this.socket = socket;
  }

  get isOpen(): boolean {
    return this.socket.readyState === WebSocket.OPEN;
  }

  send(message: OutboundMessage): void {
    if (!this.isOpen) return;
    const envelope = {
      v: PROTOCOL_VERSION,
      seq: (this.seq += 1),
      serverTime: Date.now(),
      ...message,
    };
    this.socket.send(JSON.stringify(envelope));
  }

  sendError(code: ErrorCode, message: string, replyTo?: string): void {
    this.send({ type: "ERROR", payload: { code, message: message.slice(0, 300) }, replyTo });
  }

  /** Fixed one-second window; matches the ≤30 msgs/s limit in PLAN P4.3. */
  tryConsumeMessage(now: number): boolean {
    if (now - this.windowStartMs >= 1000) {
      this.windowStartMs = now;
      this.messagesInWindow = 0;
    }
    this.messagesInWindow += 1;
    return this.messagesInWindow <= MAX_MESSAGES_PER_SECOND;
  }

  /** Recent 256 request ids are ignored when replayed (PLAN P4.3). */
  isDuplicateRequest(id: string): boolean {
    if (this.recentIdSet.has(id)) return true;
    this.recentIds.push(id);
    this.recentIdSet.add(id);
    if (this.recentIds.length > RECENT_REQUEST_IDS) {
      const oldest = this.recentIds.shift();
      if (oldest !== undefined) this.recentIdSet.delete(oldest);
    }
    return false;
  }

  close(code: number, reason: string): void {
    if (
      this.socket.readyState === WebSocket.OPEN ||
      this.socket.readyState === WebSocket.CONNECTING
    ) {
      this.socket.close(code, reason);
    }
  }
}
