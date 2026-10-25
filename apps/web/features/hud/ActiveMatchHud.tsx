"use client";

import React, { useEffect, useState } from "react";
import { WEAPONS, type AimEvidence, type MatchState } from "@fantom/shared";
import { MinimapSvg } from "@/features/minimap/MinimapSvg";
import type { LastServerFeedback } from "@/hooks/useGameSocket";
import type { ServerClockController } from "@/hooks/useServerClock";

export type ActiveMatchHudProps = {
  state: MatchState;
  clock: ServerClockController;
  lastFeedback: LastServerFeedback | null;
  onShoot: (evidence: AimEvidence) => void;
  onLeaveMatch: () => void;
};

/**
 * DEV_ONLY simulated evidence helper for testing combat when `state.config.devMode === true`
 * before or alongside Dev C's camera pipeline (PLAN.md P5.3).
 */
function buildDevSimulatedEvidence(targetMarkerCode: number): AimEvidence {
  return {
    source: "dev_simulated",
    ageMs: 20,
    targetMarkerCode,
    visibleMarkerCodes: [targetMarkerCode],
    markerConfidence: 0.95,
    markerVisibleFraction: 1,
    markerOffsetDeg: { x: 0, y: 0 },
    markerWidthPx: 120,
    frameWidthPx: 1280,
    hfovDeg: 65,
    estimatedDistanceM: 8,
    camera: {
      headingDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      headingAccuracyDeg: 5,
      headingSource: "absolute",
    },
  };
}

export function ActiveMatchHud({
  state,
  clock,
  lastFeedback,
  onShoot,
  onLeaveMatch,
}: ActiveMatchHudProps) {
  const [, setTick] = useState<number>(0);
  const [selectedDevMarkerCode, setSelectedDevMarkerCode] = useState<number>(2);

  // Re-render HUD timers at ~10 Hz using server clock offset
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);

  const self = state.self;
  const selfPlayer = state.players.find((p) => p.id === self.playerId);
  const isEliminated = selfPlayer?.status === "eliminated" || self.health <= 0;
  const isOutOfZone = selfPlayer?.status === "out_of_zone" || self.inZone === false;

  const remainingMatchSec = Math.ceil(clock.msUntil(state.endsAt) / 1000);
  const spawnLockRemMs = clock.msUntil(self.spawnLockedUntil);
  const reloadRemMs = clock.msUntil(self.reloadCompleteAt);
  const shotCooldownRemMs = clock.msUntil(self.nextShotAt);

  const weapon = self.weaponId ? WEAPONS[self.weaponId] : null;
  const reloadProgress =
    weapon && self.reloadCompleteAt && reloadRemMs > 0
      ? Math.max(0, Math.min(1, 1 - reloadRemMs / weapon.reloadDurationMs))
      : null;

  const isRecentDamage =
    lastFeedback?.kind === "damaged" && Date.now() - lastFeedback.timestamp < 900;

  const fireDisabledReason = isEliminated
    ? "ELIMINATED"
    : isOutOfZone
    ? "OUT OF ZONE — RETURN TO ARENA"
    : spawnLockRemMs > 0
    ? `SPAWN PROTECTED (${(spawnLockRemMs / 1000).toFixed(1)}s)`
    : !weapon
    ? "NO WEAPON EQUIPPED"
    : reloadRemMs > 0
    ? `RELOADING (${(reloadRemMs / 1000).toFixed(1)}s)`
    : self.ammo <= 0
    ? "NO AMMO"
    : shotCooldownRemMs > 0
    ? "COOLING DOWN"
    : null;

  const handleDevShoot = () => {
    if (!state.config.devMode) return;
    onShoot(buildDevSimulatedEvidence(selectedDevMarkerCode));
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: isOutOfZone ? "#1f2937" : "#090d16",
        filter: isOutOfZone ? "grayscale(0.85)" : "none",
        boxShadow: isRecentDamage ? "inset 0 0 48px rgba(239, 68, 68, 0.75)" : "none",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 12,
        maxWidth: 560,
        margin: "0 auto",
      }}
    >
      {/* Top Bar: Mode, Timer, Marker Code, Minimap */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          {state.config.devMode && (
            <div
              role="status"
              style={{
                background: "#451a03",
                border: "2px solid #f59e0b",
                color: "#fef3c7",
                padding: "6px 10px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              [DEV_ONLY] SIMULATED MODE ACTIVE
            </div>
          )}

          <div
            style={{
              background: "#111827",
              border: "1px solid #1e293b",
              borderRadius: 12,
              padding: "10px 12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>
                {state.config.mode.replace("_", " ")}
                {selfPlayer?.role ? ` · ${selfPlayer.role.toUpperCase()}` : ""}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#f8fafc" }}>
                {Math.floor(remainingMatchSec / 60)}:
                {String(remainingMatchSec % 60).padStart(2, "0")}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>YOUR MARKER ID</div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: "#38bdf8",
                  fontFamily: "monospace",
                }}
              >
                #{self.markerCode}
              </div>
            </div>
          </div>

          {self.locationQuality !== "good" && (
            <div
              role="alert"
              style={{
                background: "#422006",
                border: "1px solid #f59e0b",
                color: "#fde68a",
                padding: "8px 10px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              GPS Quality: {self.locationQuality.toUpperCase()} — Boundary/range checks may pause until GPS improves.
            </div>
          )}

          {isOutOfZone && (
            <div
              role="alert"
              style={{
                background: "#450a0a",
                border: "2px solid #ef4444",
                color: "#fecaca",
                padding: "10px 12px",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 800,
                textAlign: "center",
              }}
            >
              WARNING: OUT OF ARENA ZONE! Return inside immediately (-10 HP/s). Firing disabled.
            </div>
          )}
        </div>

        <MinimapSvg state={state} sizePx={128} />
      </div>

      {/* Center Reticle / Camera Slot (Seam B <-> C: <AimView> mounts here in M3/M4) */}
      <div
        style={{
          flex: 1,
          minHeight: 220,
          background: "#0f172a",
          border: "1px solid #1e293b",
          borderRadius: 16,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          textAlign: "center",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            border: "2px solid #38bdf8",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 12,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#38bdf8" }} />
        </div>

        <div style={{ fontSize: 13, color: "#94a3b8" }}>
          Camera Aiming Viewport (Dev C <code>&lt;AimView /&gt;</code> slot)
        </div>

        {lastFeedback && Date.now() - lastFeedback.timestamp < 3500 && (
          <div
            role="status"
            style={{
              marginTop: 12,
              padding: "8px 14px",
              borderRadius: 999,
              fontWeight: 800,
              fontSize: 13,
              background:
                lastFeedback.kind === "shot_accepted"
                  ? "#065f46"
                  : lastFeedback.kind === "shot_rejected"
                  ? "#450a0a"
                  : "#1e3a8a",
              color: "#f8fafc",
              border: "1px solid rgba(255,255,255,0.2)",
            }}
          >
            {lastFeedback.detail}
          </div>
        )}
      </div>

      {/* Bottom Combat Controls: Health/Shield, Weapon/Ammo/Reload, Shoot Button, Leave Match */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Health & Shield Bars */}
        <div
          style={{
            background: "#111827",
            border: "1px solid #1e293b",
            borderRadius: 12,
            padding: 12,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}>
              <span>HEALTH</span>
              <span>
                {self.health} / {self.maxHealth}
              </span>
            </div>
            <div
              style={{
                height: 10,
                background: "#1f2937",
                borderRadius: 999,
                overflow: "hidden",
                marginTop: 6,
              }}
            >
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, (self.health / self.maxHealth) * 100))}%`,
                  height: "100%",
                  background: self.health > 30 ? "#10b981" : "#ef4444",
                }}
              />
            </div>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}>
              <span>SHIELD</span>
              <span>{self.shield} / 50</span>
            </div>
            <div
              style={{
                height: 10,
                background: "#1f2937",
                borderRadius: 999,
                overflow: "hidden",
                marginTop: 6,
              }}
            >
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, (self.shield / 50) * 100))}%`,
                  height: "100%",
                  background: "#38bdf8",
                }}
              />
            </div>
          </div>
        </div>

        {/* Weapon & Ammo Status */}
        <div
          style={{
            background: "#111827",
            border: "1px solid #1e293b",
            borderRadius: 12,
            padding: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>WEAPON</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#f8fafc" }}>
              {weapon ? weapon.name : "Unarmed"}
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>AMMO</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#38bdf8", fontFamily: "monospace" }}>
              {weapon ? `${self.ammo} / ${weapon.magazineSize}` : "—"}
            </div>
          </div>
        </div>

        {reloadProgress !== null && (
          <div
            style={{
              background: "#1e293b",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 700,
              color: "#38bdf8",
            }}
          >
            AUTO-RELOADING… {Math.round(reloadProgress * 100)}%
          </div>
        )}

        {/* DEV_ONLY Simulated Target Picker (only when config.devMode === true) */}
        {state.config.devMode && (
          <div
            style={{
              background: "#271705",
              border: "1px dashed #f59e0b",
              borderRadius: 12,
              padding: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <label style={{ fontSize: 12, fontWeight: 700, color: "#fde68a" }}>
              [DEV_ONLY] Simulated Target Marker Code:
              <input
                type="number"
                min={0}
                max={255}
                value={selectedDevMarkerCode}
                onChange={(e) => setSelectedDevMarkerCode(Number(e.target.value))}
                style={{
                  marginLeft: 8,
                  width: 64,
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid #f59e0b",
                  background: "#090d16",
                  color: "#f8fafc",
                }}
              />
            </label>
            <button
              type="button"
              disabled={Boolean(fireDisabledReason)}
              onClick={handleDevShoot}
              style={{
                minHeight: 48,
                padding: "10px 18px",
                borderRadius: 10,
                border: "none",
                background: fireDisabledReason ? "#334155" : "#0284c7",
                color: "#ffffff",
                fontWeight: 800,
                fontSize: 15,
                cursor: fireDisabledReason ? "not-allowed" : "pointer",
              }}
            >
              {fireDisabledReason ?? "[DEV_ONLY] FIRE"}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onLeaveMatch}
          style={{
            minHeight: 44,
            borderRadius: 10,
            border: "1px solid #ef4444",
            background: "#450a0a",
            color: "#fecaca",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Leave Match
        </button>
      </div>
    </div>
  );
}
