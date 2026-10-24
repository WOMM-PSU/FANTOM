import type { IncomingMessage, ServerResponse } from "node:http";
import {
  CreateMatchRequest,
  JoinRequest,
  PROTOCOL_VERSION,
  type ApiError,
  type ErrorCode,
} from "@fantom/shared";
import { GameService } from "../game/service.js";
import { summarizeIssues } from "../validation/issues.js";
import { sanitizeDisplayName } from "../validation/sanitize.js";

const MAX_BODY_BYTES = 16 * 1024;

export type HttpHandlerOptions = {
  service: GameService;
  allowedOrigins: string[];
};

type BodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: number; code: ErrorCode; message: string };

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
  });
  response.end(text);
}

function sendError(
  response: ServerResponse,
  status: number,
  code: ErrorCode,
  message: string,
): void {
  const body: ApiError = { error: { code, message } };
  sendJson(response, status, body);
}

function applyCors(response: ServerResponse, origin: string | undefined, allowed: string[]): void {
  response.setHeader("Vary", "Origin");
  if (origin !== undefined && allowed.includes(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "content-type");
    response.setHeader("Access-Control-Max-Age", "600");
  }
}

async function readJsonBody(request: IncomingMessage): Promise<BodyResult> {
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_BODY_BYTES) {
        return { ok: false, status: 413, code: "BAD_MESSAGE", message: "Request body is too large" };
      }
      chunks.push(buffer);
    }
  } catch {
    return { ok: false, status: 400, code: "BAD_MESSAGE", message: "Could not read request body" };
  }

  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { ok: false, status: 400, code: "BAD_MESSAGE", message: "Body must be valid JSON" };
  }
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function displayNameFrom(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = (body as { displayName?: unknown }).displayName;
  if (typeof raw !== "string") return null;
  return sanitizeDisplayName(raw);
}

export function createHttpHandler(options: HttpHandlerOptions): (request: IncomingMessage, response: ServerResponse) => void {
  const { service, allowedOrigins } = options;

  return (request, response) => {
    void handle(request, response).catch((error: unknown) => {
      console.error("[fantom] unhandled HTTP error", error);
      if (!response.headersSent) {
        sendError(response, 500, "INTERNAL", "Unexpected server error");
      } else {
        response.end();
      }
    });
  };

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    applyCors(response, request.headers.origin, allowedOrigins);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    let url: URL;
    try {
      url = new URL(request.url ?? "/", "http://localhost");
    } catch {
      sendError(response, 400, "BAD_MESSAGE", "Malformed request URL");
      return;
    }

    const segments = url.pathname.split("/").filter((segment) => segment.length > 0);

    if (segments.length === 1 && segments[0] === "health" && request.method === "GET") {
      sendJson(response, 200, { ok: true, protocolVersion: PROTOCOL_VERSION });
      return;
    }

    if (segments[0] === "api" && segments[1] === "matches") {
      if (segments.length === 2 && request.method === "POST") {
        const body = await readJsonBody(request);
        if (!body.ok) {
          sendError(response, body.status, body.code, body.message);
          return;
        }

        const displayName = displayNameFrom(body.value);
        if (displayName === null) {
          sendError(response, 400, "BAD_MESSAGE", "displayName must be 1–20 visible characters");
          return;
        }

        const parsed = CreateMatchRequest.safeParse({
          ...(body.value as Record<string, unknown>),
          displayName,
        });
        if (!parsed.success) {
          sendError(response, 400, "BAD_MESSAGE", summarizeIssues(parsed.error));
          return;
        }

        const result = service.createMatch(parsed.data);
        if (!result.ok) {
          sendError(response, result.status, result.code, result.message);
          return;
        }
        sendJson(response, 201, result.value);
        return;
      }

      if (segments.length === 3 && request.method === "GET") {
        const joinCode = safeDecode(segments[2] ?? "");
        if (joinCode === null) {
          sendError(response, 400, "BAD_MESSAGE", "Malformed join code");
          return;
        }
        const result = service.getMatchSummary(joinCode);
        if (!result.ok) {
          sendError(response, result.status, result.code, result.message);
          return;
        }
        sendJson(response, 200, result.value);
        return;
      }

      if (segments.length === 4 && segments[3] === "join" && request.method === "POST") {
        const body = await readJsonBody(request);
        if (!body.ok) {
          sendError(response, body.status, body.code, body.message);
          return;
        }

        const displayName = displayNameFrom(body.value);
        if (displayName === null) {
          sendError(response, 400, "BAD_MESSAGE", "displayName must be 1–20 visible characters");
          return;
        }

        const parsed = JoinRequest.safeParse({
          ...(body.value as Record<string, unknown>),
          displayName,
        });
        if (!parsed.success) {
          sendError(response, 400, "BAD_MESSAGE", summarizeIssues(parsed.error));
          return;
        }

        const joinCode = safeDecode(segments[2] ?? "");
        if (joinCode === null) {
          sendError(response, 400, "BAD_MESSAGE", "Malformed join code");
          return;
        }
        const result = service.joinMatch(joinCode, parsed.data);
        if (!result.ok) {
          sendError(response, result.status, result.code, result.message);
          return;
        }
        sendJson(response, 200, result.value);
        return;
      }
    }

    sendError(response, 404, "BAD_MESSAGE", "Route not found");
  }
}
