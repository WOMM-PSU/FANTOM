import type { ServerMessage } from "@fantom/shared";
import { WebSocket } from "ws";
import { startFantomServer, type FantomServer, type FantomServerOptions } from "../src/index.js";

export type TestServer = {
  server: FantomServer;
  baseUrl: string;
  endpoints: { httpUrl: string; wsUrl: string };
};

export async function startTestServer(options: Partial<FantomServerOptions> = {}): Promise<TestServer> {
  const server = await startFantomServer({
    port: 0,
    host: "127.0.0.1",
    webBaseUrl: "https://fantom.test",
    broadcastIntervalMs: 5,
    disconnectTimeoutMs: 150,
    ...options,
  });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  return {
    server,
    baseUrl,
    endpoints: { httpUrl: baseUrl, wsUrl: `ws://127.0.0.1:${server.port}/ws` },
  };
}

type Waiter = {
  predicate: (message: ServerMessage) => boolean;
  resolve: (message: ServerMessage) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

/** Test-only raw socket so tests can send malformed/duplicate envelopes. */
export class RawClient {
  readonly socket: WebSocket;
  readonly messages: ServerMessage[] = [];
  closeCode: number | null = null;
  private readonly waiters: Waiter[] = [];

  constructor(wsUrl: string, options: { origin?: string } = {}) {
    this.socket = new WebSocket(wsUrl, options.origin ? { origin: options.origin } : undefined);
    this.socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as ServerMessage;
      this.messages.push(message);
      const index = this.waiters.findIndex((waiter) => waiter.predicate(message));
      if (index >= 0) {
        const waiter = this.waiters.splice(index, 1)[0]!;
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      }
    });
    this.socket.on("close", (code) => {
      this.closeCode = code;
    });
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.once("open", () => resolve());
      this.socket.once("error", (error) => reject(error));
    });
  }

  sendRaw(data: string): void {
    this.socket.send(data);
  }

  send(envelope: { v?: number; id?: string; type: string; payload: unknown }): void {
    this.sendRaw(
      JSON.stringify({
        v: envelope.v ?? 1,
        id: envelope.id ?? `test-${Math.random().toString(16).slice(2)}`,
        type: envelope.type,
        payload: envelope.payload,
      }),
    );
  }

  waitFor(predicate: (message: ServerMessage) => boolean, timeoutMs = 2_000): Promise<ServerMessage> {
    const existing = this.messages.find(predicate);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.findIndex((waiter) => waiter.timer === timer);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error("timed out waiting for server message"));
      }, timeoutMs);
      this.waiters.push({ predicate, resolve, reject, timer });
    });
  }

  waitForClose(timeoutMs = 2_000): Promise<number> {
    if (this.closeCode !== null) return Promise.resolve(this.closeCode);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for close")), timeoutMs);
      this.socket.once("close", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
  }

  close(): void {
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
      this.socket.close();
    }
  }
}

/** Waits until `check` returns true, polling every 10 ms. */
export async function eventually(check: () => boolean, timeoutMs = 2_000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error("condition not met in time");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
