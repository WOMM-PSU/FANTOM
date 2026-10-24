import { randomUUID } from "node:crypto";
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type JoinResponse,
  type MatchState,
  type MatchSummary,
  type ServerMessage,
} from "@fantom/shared";
import WebSocket from "ws";

export type SimEndpoints = { httpUrl: string; wsUrl: string };

export function endpointsFromBase(baseUrl: string): SimEndpoints {
  const url = new URL(baseUrl);
  const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
  return {
    httpUrl: url.toString().replace(/\/$/, ""),
    wsUrl: `${wsProtocol}//${url.host}/ws`,
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`POST ${url} failed: ${response.status} ${JSON.stringify(json)}`);
  }
  return json as T;
}

export async function createMatch(baseUrl: string, displayName: string): Promise<JoinResponse> {
  const { httpUrl } = endpointsFromBase(baseUrl);
  return postJson<JoinResponse>(`${httpUrl}/api/matches`, { displayName });
}

export async function joinMatch(
  baseUrl: string,
  joinCode: string,
  displayName: string,
): Promise<JoinResponse> {
  const { httpUrl } = endpointsFromBase(baseUrl);
  return postJson<JoinResponse>(`${httpUrl}/api/matches/${encodeURIComponent(joinCode)}/join`, {
    displayName,
  });
}

export async function fetchMatchSummary(baseUrl: string, joinCode: string): Promise<MatchSummary> {
  const { httpUrl } = endpointsFromBase(baseUrl);
  const response = await fetch(`${httpUrl}/api/matches/${encodeURIComponent(joinCode)}`);
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`GET summary failed: ${response.status} ${JSON.stringify(json)}`);
  }
  return json as MatchSummary;
}

type Waiter = {
  predicate: (message: ServerMessage) => boolean;
  resolve: (message: ServerMessage) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

/** Minimal typed WS client used by the CLI and by server integration tests. */
export class SimConnection {
  readonly session: JoinResponse;
  readonly socket: WebSocket;
  readonly received: ServerMessage[] = [];
  state: MatchState | null = null;

  private readonly waiters: Waiter[] = [];
  private readonly backlog: ServerMessage[] = [];
  private opened = false;

  constructor(endpoints: SimEndpoints, session: JoinResponse) {
    this.session = session;
    this.socket = new WebSocket(endpoints.wsUrl);
    this.socket.on("message", (raw) => this.onMessage(raw.toString()));
    this.socket.on("close", (code, reason) => {
      this.rejectAll(new Error(`socket closed (${code} ${reason.toString()})`));
    });
    this.socket.on("error", (error) => {
      this.rejectAll(error instanceof Error ? error : new Error(String(error)));
    });
  }

  get playerId(): string {
    return this.session.playerId;
  }

  async connect(timeoutMs = 3_000): Promise<MatchState> {
    if (this.opened && this.state) return this.state;
    this.opened = true;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("socket open timeout")), timeoutMs);
      this.socket.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });

    this.send("HELLO", { sessionToken: this.session.sessionToken });
    await this.waitFor("WELCOME", { timeoutMs });
    if (!this.state) throw new Error("WELCOME did not carry a match state");
    return this.state;
  }

  send<T extends ClientMessage["type"]>(
    type: T,
    payload: Extract<ClientMessage, { type: T }>["payload"],
  ): string {
    const id = randomUUID();
    const message = { v: PROTOCOL_VERSION, id, type, payload };
    this.socket.send(JSON.stringify(message));
    return id;
  }

  waitFor<T extends ServerMessage["type"]>(
    type: T,
    options: {
      timeoutMs?: number;
      predicate?: (message: Extract<ServerMessage, { type: T }>) => boolean;
    } = {},
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const timeoutMs = options.timeoutMs ?? 3_000;
    const predicate = (message: ServerMessage): boolean =>
      message.type === type &&
      (options.predicate?.(message as Extract<ServerMessage, { type: T }>) ?? true);

    const existingIndex = this.backlog.findIndex(predicate);
    if (existingIndex >= 0) {
      const [message] = this.backlog.splice(existingIndex, 1);
      return Promise.resolve(message as Extract<ServerMessage, { type: T }>);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.findIndex((waiter) => waiter.timer === timer);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error(`timed out waiting for ${type}`));
      }, timeoutMs);

      this.waiters.push({
        predicate,
        resolve: (message) => resolve(message as Extract<ServerMessage, { type: T }>),
        reject,
        timer,
      });
    });
  }

  /** Waits for a MATCH_STATE that satisfies the predicate; resolves its state. */
  waitForState(
    predicate: (state: MatchState) => boolean,
    timeoutMs = 3_000,
  ): Promise<MatchState> {
    if (this.state && predicate(this.state)) return Promise.resolve(this.state);
    return this.waitFor("MATCH_STATE", { timeoutMs, predicate: (message) => predicate(message.payload) })
      .then((message) => message.payload);
  }

  close(): void {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("client closed"));
    }
    this.socket.close(1000, "sim client done");
  }

  private onMessage(raw: string): void {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return;
    }

    const message = parsedJson as ServerMessage;
    this.received.push(message);
    if (message.type === "WELCOME") {
      this.state = message.payload.state;
    } else if (message.type === "MATCH_STATE") {
      this.state = message.payload;
    }

    const waiterIndex = this.waiters.findIndex((waiter) => waiter.predicate(message));
    if (waiterIndex >= 0) {
      const waiter = this.waiters.splice(waiterIndex, 1)[0]!;
      clearTimeout(waiter.timer);
      waiter.resolve(message);
      return;
    }

    this.backlog.push(message);
    if (this.backlog.length > 200) this.backlog.shift();
  }

  private rejectAll(error: Error): void {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }
}

export async function connectSim(
  endpoints: SimEndpoints,
  session: JoinResponse,
): Promise<{ client: SimConnection; state: MatchState }> {
  const client = new SimConnection(endpoints, session);
  const state = await client.connect();
  return { client, state };
}
