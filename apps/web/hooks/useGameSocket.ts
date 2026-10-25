"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PROTOCOL_VERSION,
  ClientMessage,
  ServerMessage,
  type ClientMessage as ClientMessageType,
  type ServerMessage as ServerMessageType,
  type MatchState,
  type ErrorCode,
  type RejectReason,
} from "@fantom/shared";
import { getWsUrl } from "@/lib/api";
import type { ServerClockController } from "./useServerClock";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type LastServerFeedback = {
  kind: "shot_accepted" | "shot_rejected" | "damaged" | "eliminated" | "heal_applied" | "heal_rejected" | "pickup_collected" | "pickup_rejected";
  timestamp: number;
  reason?: RejectReason;
  detail?: string;
};

export type SendClientMessageFn = <T extends ClientMessageType["type"]>(
  type: T,
  payload: Extract<ClientMessageType, { type: T }>["payload"]
) => string | null;

export type UseGameSocketResult = {
  status: ConnectionStatus;
  matchState: MatchState | null;
  playerId: string | null;
  lastError: { code: ErrorCode; message: string } | null;
  lastFeedback: LastServerFeedback | null;
  clearError: () => void;
  sendMessage: SendClientMessageFn;
  leaveMatch: () => void;
  reconnectNow: () => void;
};

function makeRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useGameSocket(
  sessionToken: string | null,
  clock: ServerClockController
): UseGameSocketResult {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<{ code: ErrorCode; message: string } | null>(null);
  const [lastFeedback, setLastFeedback] = useState<LastServerFeedback | null>(null);
  const [reconnectTrigger, setReconnectTrigger] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const intentionalCloseRef = useRef<boolean>(false);
  const retryCountRef = useRef<number>(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendMessage = useCallback<SendClientMessageFn>(
    (type, payload) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return null;
      }
      const id = makeRequestId();
      const rawEnvelope = {
        v: PROTOCOL_VERSION,
        id,
        type,
        payload,
      };
      const parsed = ClientMessage.safeParse(rawEnvelope);
      if (!parsed.success) {
        setLastError({
          code: "BAD_MESSAGE",
          message: `Client message failed local schema check: ${parsed.error.issues[0]?.message ?? "invalid"}`,
        });
        return null;
      }
      ws.send(JSON.stringify(parsed.data));
      return id;
    },
    []
  );

  const leaveMatch = useCallback(() => {
    intentionalCloseRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    sendMessage("LEAVE_MATCH", {});
    if (wsRef.current) {
      wsRef.current.close(1000, "Player left match");
      wsRef.current = null;
    }
    setMatchState(null);
    setStatus("disconnected");
  }, [sendMessage]);

  const reconnectNow = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    retryCountRef.current = 0;
    setReconnectTrigger((n) => n + 1);
  }, []);

  const clearError = useCallback(() => {
    setLastError(null);
  }, []);

  useEffect(() => {
    if (!sessionToken) {
      setStatus("idle");
      setMatchState(null);
      return;
    }

    intentionalCloseRef.current = false;
    const isReconnect = retryCountRef.current > 0;
    setStatus(isReconnect ? "reconnecting" : "connecting");

    // Discard stale local snapshot on reconnect (PLAN.md P4.3)
    if (isReconnect) {
      setMatchState(null);
    }

    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;
    let pingInterval: ReturnType<typeof setInterval> | null = null;

    ws.onopen = () => {
      // First message must be HELLO within 5s (PLAN.md P4.3)
      const helloEnvelope = {
        v: PROTOCOL_VERSION,
        id: makeRequestId(),
        type: "HELLO" as const,
        payload: { sessionToken },
      };
      ws.send(JSON.stringify(helloEnvelope));

      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const pingEnvelope = {
            v: PROTOCOL_VERSION,
            id: makeRequestId(),
            type: "PING" as const,
            payload: { clientSentAt: Date.now() },
          };
          ws.send(JSON.stringify(pingEnvelope));
        }
      }, 5000);
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      let json: unknown;
      try {
        json = JSON.parse(event.data);
      } catch {
        return;
      }

      const parsed = ServerMessage.safeParse(json);
      if (!parsed.success) {
        console.warn("[useGameSocket] Dropped invalid ServerMessage:", parsed.error.issues);
        return;
      }

      const msg: ServerMessageType = parsed.data;
      clock.recordEnvelopeTime(msg.serverTime);

      switch (msg.type) {
        case "WELCOME": {
          retryCountRef.current = 0;
          setStatus("connected");
          setPlayerId(msg.payload.playerId);
          setMatchState(msg.payload.state);
          setLastError(null);
          break;
        }
        case "MATCH_STATE": {
          setStatus("connected");
          setMatchState(msg.payload);
          break;
        }
        case "PONG": {
          clock.recordPong(msg.payload.clientSentAt, msg.serverTime);
          break;
        }
        case "SHOT_ACCEPTED": {
          setLastFeedback({
            kind: "shot_accepted",
            timestamp: Date.now(),
            detail: `Confirmed hit (-${msg.payload.damageDealt} HP)${msg.payload.eliminated ? " — Eliminated!" : ""}`,
          });
          break;
        }
        case "SHOT_REJECTED": {
          setLastFeedback({
            kind: "shot_rejected",
            timestamp: Date.now(),
            reason: msg.payload.reason,
            detail: `Shot rejected: ${msg.payload.reason}`,
          });
          break;
        }
        case "PLAYER_DAMAGED": {
          setLastFeedback({
            kind: "damaged",
            timestamp: Date.now(),
            detail: `Took ${msg.payload.damage} damage (${msg.payload.source})`,
          });
          break;
        }
        case "PLAYER_ELIMINATED": {
          setLastFeedback({
            kind: "eliminated",
            timestamp: Date.now(),
            detail: `Player eliminated (${msg.payload.cause})`,
          });
          break;
        }
        case "HEAL_APPLIED": {
          setLastFeedback({
            kind: "heal_applied",
            timestamp: Date.now(),
            detail: `Healed +${msg.payload.amount} HP`,
          });
          break;
        }
        case "HEAL_REJECTED": {
          setLastFeedback({
            kind: "heal_rejected",
            timestamp: Date.now(),
            reason: msg.payload.reason,
            detail: `Heal rejected: ${msg.payload.reason}`,
          });
          break;
        }
        case "PICKUP_COLLECTED": {
          setLastFeedback({
            kind: "pickup_collected",
            timestamp: Date.now(),
            detail: `Collected ${msg.payload.kind} pickup`,
          });
          break;
        }
        case "PICKUP_REJECTED": {
          setLastFeedback({
            kind: "pickup_rejected",
            timestamp: Date.now(),
            reason: msg.payload.reason,
            detail: `Pickup rejected: ${msg.payload.reason}`,
          });
          break;
        }
        case "MATCH_FINISHED": {
          setMatchState((prev) => (prev ? { ...prev, phase: "finished", result: msg.payload.result } : prev));
          break;
        }
        case "ERROR": {
          setLastError({ code: msg.payload.code, message: msg.payload.message });
          if (msg.payload.code === "UNAUTHENTICATED" || msg.payload.code === "SESSION_EXPIRED") {
            intentionalCloseRef.current = true;
          }
          break;
        }
      }
    };

    ws.onerror = () => {
      // Handled in onclose with retry
    };

    ws.onclose = (ev) => {
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      if (intentionalCloseRef.current || ev.code === 4001) {
        setStatus("disconnected");
        return;
      }

      // Discard stale snapshot while disconnected and schedule reconnect
      setMatchState(null);
      setStatus("reconnecting");
      const delayMs = Math.min(5000, 750 * Math.pow(1.5, retryCountRef.current));
      retryCountRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => {
        setReconnectTrigger((n) => n + 1);
      }, delayMs);
    };

    return () => {
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      ws.onclose = null;
      ws.close();
    };
  }, [sessionToken, reconnectTrigger, clock]);

  return {
    status,
    matchState,
    playerId,
    lastError,
    lastFeedback,
    clearError,
    sendMessage,
    leaveMatch,
    reconnectNow,
  };
}
