"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Computes single-sample clock offset (serverTime - estimatedClientMidpoint).
 * Adding this offset to `Date.now()` yields the estimated current server epoch ms.
 */
export function computeClockSampleOffset(
  clientSentAt: number,
  clientReceivedAt: number,
  serverTime: number
): number {
  const rtt = Math.max(0, clientReceivedAt - clientSentAt);
  const clientMidpoint = clientSentAt + rtt / 2;
  return Math.round(serverTime - clientMidpoint);
}

/**
 * Exponential moving average for clock offset smoothing (PLAN.md P4.3).
 */
export function smoothClockOffset(
  previousOffsetMs: number | null,
  sampleOffsetMs: number,
  alpha = 0.3
): number {
  if (previousOffsetMs === null) {
    return sampleOffsetMs;
  }
  return Math.round(previousOffsetMs * (1 - alpha) + sampleOffsetMs * alpha);
}

/**
 * Computes remaining milliseconds until a server timestamp using the server clock offset.
 * Never returns negative values.
 */
export function computeMsUntil(
  targetServerEpochMs: number | null | undefined,
  nowClientEpochMs: number,
  serverClockOffsetMs: number
): number {
  if (!targetServerEpochMs) return 0;
  const estimatedServerNow = nowClientEpochMs + serverClockOffsetMs;
  return Math.max(0, targetServerEpochMs - estimatedServerNow);
}

export type ServerClockController = {
  offsetMs: number;
  recordPong: (clientSentAt: number, serverTime: number) => void;
  recordEnvelopeTime: (serverTime: number) => void;
  serverNow: () => number;
  msUntil: (targetServerEpochMs: number | null | undefined) => number;
};

export function useServerClock(): ServerClockController {
  const [offsetMs, setOffsetMs] = useState<number>(0);
  const offsetRef = useRef<number | null>(null);

  const recordPong = useCallback((clientSentAt: number, serverTime: number) => {
    const sample = computeClockSampleOffset(clientSentAt, Date.now(), serverTime);
    const next = smoothClockOffset(offsetRef.current, sample);
    offsetRef.current = next;
    setOffsetMs(next);
  }, []);

  const recordEnvelopeTime = useCallback((serverTime: number) => {
    if (offsetRef.current === null) {
      const initial = Math.round(serverTime - Date.now());
      offsetRef.current = initial;
      setOffsetMs(initial);
    }
  }, []);

  const serverNow = useCallback(() => {
    return Date.now() + (offsetRef.current ?? 0);
  }, []);

  const msUntil = useCallback((targetServerEpochMs: number | null | undefined) => {
    return computeMsUntil(targetServerEpochMs, Date.now(), offsetRef.current ?? 0);
  }, []);

  return {
    offsetMs,
    recordPong,
    recordEnvelopeTime,
    serverNow,
    msUntil,
  };
}
