import {
  CreateMatchRequest,
  JoinRequest,
  JoinResponse,
  MatchSummary,
  ApiError,
  type MatchConfigPatch,
  type ErrorCode,
} from "@fantom/shared";
import type { z } from "zod";

export type JoinResponseType = z.infer<typeof JoinResponse>;
export type MatchSummaryType = z.infer<typeof MatchSummary>;

export class FantomApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string, status: number) {
    super(message);
    this.name = "FantomApiError";
    this.code = code;
    this.status = status;
  }
}

export function getApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");
}

export function getWsUrl(): string {
  return process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080/ws";
}

async function parseResponse<T>(res: Response, schema: z.ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new FantomApiError("BAD_MESSAGE", `Invalid JSON response (HTTP ${res.status})`, res.status);
  }

  if (!res.ok) {
    const errParsed = ApiError.safeParse(json);
    if (errParsed.success) {
      throw new FantomApiError(
        errParsed.data.error.code,
        errParsed.data.error.message,
        res.status
      );
    }
    throw new FantomApiError("INTERNAL", `Request failed with HTTP ${res.status}`, res.status);
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new FantomApiError(
      "BAD_MESSAGE",
      `Server response failed contract validation: ${parsed.error.issues[0]?.message ?? "invalid schema"}`,
      res.status
    );
  }
  return parsed.data;
}

export async function createMatch(
  displayName: string,
  config?: MatchConfigPatch
): Promise<JoinResponseType> {
  const payload = CreateMatchRequest.parse({
    displayName,
    ...(config ? { config } : {}),
  });

  const res = await fetch(`${getApiBaseUrl()}/api/matches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse(res, JoinResponse);
}

export async function getMatchSummary(joinCode: string): Promise<MatchSummaryType> {
  const code = encodeURIComponent(joinCode.trim().toUpperCase());
  const res = await fetch(`${getApiBaseUrl()}/api/matches/${code}`, {
    method: "GET",
    cache: "no-store",
  });

  return parseResponse(res, MatchSummary);
}

export async function joinMatch(
  joinCode: string,
  displayName: string
): Promise<JoinResponseType> {
  const code = encodeURIComponent(joinCode.trim().toUpperCase());
  const payload = JoinRequest.parse({ displayName });

  const res = await fetch(`${getApiBaseUrl()}/api/matches/${code}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse(res, JoinResponse);
}
