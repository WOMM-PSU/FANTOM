"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadSession, clearSession, type StoredSession } from "@/lib/session";
import { useServerClock } from "@/hooks/useServerClock";
import { useGameSocket } from "@/hooks/useGameSocket";
import { useGeolocation } from "@/hooks/useGeolocation";
import { LobbyView } from "@/features/lobby/LobbyView";
import { ActiveMatchHud } from "@/features/hud/ActiveMatchHud";
import { ResultsView } from "@/features/results/ResultsView";

export default function MatchPage() {
  const router = useRouter();
  const [session, setSession] = useState<StoredSession | null>(null);
  const [checkedStorage, setCheckedStorage] = useState<boolean>(false);
  const [, setCountdownTick] = useState<number>(0);

  useEffect(() => {
    const saved = loadSession();
    setSession(saved);
    setCheckedStorage(true);
  }, []);

  const clock = useServerClock();
  const socket = useGameSocket(session?.sessionToken ?? null, clock);

  const handleLocationUpdate = useCallback(
    (payload: { position: { lat: number; lng: number }; accuracyM: number; clientTimestamp: number }) => {
      socket.sendMessage("UPDATE_LOCATION", payload);
    },
    [socket]
  );

  const geo = useGeolocation({
    enabled: Boolean(
      socket.matchState &&
        (socket.matchState.phase === "countdown" || socket.matchState.phase === "active")
    ),
    onLocationUpdate: handleLocationUpdate,
  });

  // Update countdown display smoothly using server clock offset
  useEffect(() => {
    if (socket.matchState?.phase !== "countdown") return;
    const id = setInterval(() => setCountdownTick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [socket.matchState?.phase]);

  const handleLeave = useCallback(() => {
    socket.leaveMatch();
    clearSession();
    router.push("/");
  }, [socket, router]);

  if (!checkedStorage) {
    return null;
  }

  if (!session) {
    return (
      <main style={{ maxWidth: 460, margin: "40px auto", padding: 16, textAlign: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>No Active Match Session</h1>
        <p style={{ color: "#94a3b8", fontSize: 14 }}>
          Join a match using a 5-character code or QR link first.
        </p>
        <button
          type="button"
          onClick={() => router.push("/")}
          style={{
            minHeight: 48,
            padding: "12px 20px",
            borderRadius: 12,
            border: "none",
            background: "#0284c7",
            color: "#ffffff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Go to Home Screen
        </button>
      </main>
    );
  }

  const state = socket.matchState;

  return (
    <div>
      {/* Persistent Connection Status / Reconnecting Banner (PLAN.md P4.3) */}
      {socket.status !== "connected" && (
        <div
          role="status"
          style={{
            background: socket.status === "reconnecting" ? "#78350f" : "#1e293b",
            color: "#fef3c7",
            padding: "10px 16px",
            fontSize: 13,
            fontWeight: 700,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid #f59e0b",
          }}
        >
          <span>
            {socket.status === "reconnecting"
              ? "Reconnecting to game server… (stale snapshot discarded)"
              : socket.status === "connecting"
              ? "Connecting to game server…"
              : "Disconnected from game server."}
          </span>
          <button
            type="button"
            onClick={socket.reconnectNow}
            style={{
              minHeight: 34,
              padding: "4px 12px",
              borderRadius: 8,
              border: "1px solid #fde68a",
              background: "#451a03",
              color: "#fef3c7",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Retry Now
          </button>
        </div>
      )}

      {/* Server Error Banner with Dismiss / Retry */}
      {socket.lastError && (
        <div
          role="alert"
          style={{
            background: "#450a0a",
            color: "#fecaca",
            padding: "10px 16px",
            fontSize: 13,
            fontWeight: 700,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid #ef4444",
          }}
        >
          <span>
            [{socket.lastError.code}] {socket.lastError.message}
          </span>
          <button
            type="button"
            onClick={socket.clearError}
            style={{
              minHeight: 32,
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid #fca5a5",
              background: "transparent",
              color: "#fecaca",
              cursor: "pointer",
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {!state ? (
        <div style={{ maxWidth: 460, margin: "48px auto", padding: 16, textAlign: "center" }}>
          <p style={{ fontSize: 15, color: "#cbd5e1" }}>
            Synchronizing authoritative match state for code{" "}
            <strong style={{ fontFamily: "monospace", color: "#38bdf8" }}>{session.joinCode}</strong>…
          </p>
          <button
            type="button"
            onClick={handleLeave}
            style={{
              marginTop: 16,
              minHeight: 44,
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid #ef4444",
              background: "#450a0a",
              color: "#fecaca",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Leave Match
          </button>
        </div>
      ) : state.phase === "lobby" ? (
        <LobbyView
          state={state}
          joinUrl={session.joinUrl}
          geoStatus={geo.status}
          lastPosition={geo.lastPosition}
          geoError={geo.errorMessage}
          onRequestLocation={geo.requestLocationPermission}
          onToggleReady={(ready) =>
            socket.sendMessage("PLAYER_READY", {
              ready,
              permissions: {
                camera: true,
                orientation: true,
                location: geo.status === "granted" || state.config.devMode,
              },
            })
          }
          onUpdateConfig={(config) => socket.sendMessage("UPDATE_CONFIG", { config })}
          onStartMatch={() => socket.sendMessage("REQUEST_MATCH_START", {})}
          onLeaveMatch={handleLeave}
        />
      ) : state.phase === "countdown" ? (
        <main
          style={{
            maxWidth: 480,
            margin: "0 auto",
            padding: 24,
            minHeight: "90dvh",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            textAlign: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: "#38bdf8", fontWeight: 800, textTransform: "uppercase" }}>
              Match Starting Soon
            </div>
            <div style={{ fontSize: 72, fontWeight: 900, color: "#f8fafc", margin: "16px 0" }}>
              {Math.ceil(clock.msUntil(state.countdownEndsAt) / 1000)}s
            </div>
          </div>

          <section
            role="alert"
            style={{
              background: "#172554",
              border: "2px solid #38bdf8",
              borderRadius: 16,
              padding: 18,
              textAlign: "left",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#e0f2fe" }}>
              Physical Safety Warning
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: "#dbeafe", lineHeight: 1.45 }}>
              • Hold your phone in a comfortable, safe position before moving.
              <br />
              • <strong>Never run while looking at your screen.</strong> Look up and watch your
              surroundings at all times.
              <br />• Stay clear of roads, vehicles, stairs, and physical obstacles.
            </p>
          </section>

          <button
            type="button"
            onClick={handleLeave}
            style={{
              minHeight: 48,
              borderRadius: 12,
              border: "1px solid #ef4444",
              background: "#450a0a",
              color: "#fecaca",
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Leave Match
          </button>
        </main>
      ) : state.phase === "active" ? (
        <ActiveMatchHud
          state={state}
          clock={clock}
          lastFeedback={socket.lastFeedback}
          onShoot={(evidence) => socket.sendMessage("REQUEST_SHOT", { evidence })}
          onHeal={(targetMarkerCode, evidence) =>
            socket.sendMessage("REQUEST_HEAL", {
              targetMarkerCode,
              ...(evidence ? { evidence } : {}),
            })
          }
          onPickup={(pickupId) => socket.sendMessage("REQUEST_PICKUP", { pickupId })}
          onLeaveMatch={handleLeave}
        />
      ) : (
        <ResultsView state={state} onLeaveMatch={handleLeave} />
      )}
    </div>
  );
}
