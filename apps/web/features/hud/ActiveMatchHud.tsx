"use client";

import React, { useEffect, useState } from "react";
import { WEAPONS, HEAL, type AimEvidence, type MatchState } from "@fantom/shared";
import { MinimapSvg } from "@/features/minimap/MinimapSvg";
import {
  AimView,
  PlayerMarker,
  useAiming,
  makeDevEvidence,
} from "@/features/hud/aimingBridge";
import { formatRejectReason, getTeamBadge, ROLE_INFO } from "@/lib/messages";
import type { LastServerFeedback } from "@/hooks/useGameSocket";
import type { ServerClockController } from "@/hooks/useServerClock";

export type ActiveMatchHudProps = {
  state: MatchState;
  clock: ServerClockController;
  lastFeedback: LastServerFeedback | null;
  onShoot: (evidence: AimEvidence) => void;
  onHeal: (targetMarkerCode: number, evidence?: AimEvidence) => void;
  onPickup: (pickupId: string) => void;
  onLeaveMatch: () => void;
};

export function ActiveMatchHud({
  state,
  clock,
  lastFeedback,
  onShoot,
  onHeal,
  onPickup,
  onLeaveMatch,
}: ActiveMatchHudProps) {
  const [, setTick] = useState<number>(0);
  const [selectedDevMarkerCode, setSelectedDevMarkerCode] = useState<number>(2);
  const [selectedDevTargetPlayerId, setSelectedDevTargetPlayerId] = useState<string>("");
  const [healTargetMarkerCode, setHealTargetMarkerCode] = useState<number>(2);
  const [localHealCooldownUntil, setLocalHealCooldownUntil] = useState<number>(0);

  // Re-render HUD timers at ~10 Hz using server clock offset
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);

  const self = state.self;
  const selfPlayer = state.players.find((p) => p.id === self.playerId);
  const isEliminated = selfPlayer?.status === "eliminated" || self.health <= 0;
  const isOutOfZone = selfPlayer?.status === "out_of_zone" || self.inZone === false;

  const role = selfPlayer?.role ?? null;
  const roleInfo = role ? ROLE_INFO[role] : null;
  const teamBadge = getTeamBadge(selfPlayer?.teamId ?? null);

  const aiming = useAiming({ enabled: !isEliminated && role !== "survivor" });

  const remainingMatchSec = Math.ceil(clock.msUntil(state.endsAt) / 1000);
  const spawnLockRemMs = clock.msUntil(self.spawnLockedUntil);
  const reloadRemMs = clock.msUntil(self.reloadCompleteAt);
  const shotCooldownRemMs = clock.msUntil(self.nextShotAt);
  const healCooldownRemMs = Math.max(0, localHealCooldownUntil - Date.now());

  const weapon = self.weaponId ? WEAPONS[self.weaponId] : null;
  const reloadProgress =
    weapon && self.reloadCompleteAt && reloadRemMs > 0
      ? Math.max(0, Math.min(1, 1 - reloadRemMs / weapon.reloadDurationMs))
      : null;

  const isRecentDamage =
    lastFeedback?.kind === "damaged" && Date.now() - lastFeedback.timestamp < 900;

  const canRoleFire = role === null || roleInfo?.canFire === true;
  const isHealer = role === "healer";

  const fireDisabledReason = isEliminated
    ? "ELIMINATED"
    : isOutOfZone
    ? "OUT OF ZONE — RETURN TO ARENA"
    : !canRoleFire
    ? `${roleInfo?.badge ?? "ROLE"} CANNOT FIRE`
    : spawnLockRemMs > 0
    ? `SPAWN PROTECTED (${(spawnLockRemMs / 1000).toFixed(1)}s)`
    : !weapon
    ? "NO WEAPON — FIND A WEAPON PICKUP"
    : reloadRemMs > 0
    ? `RELOADING (${(reloadRemMs / 1000).toFixed(1)}s)`
    : self.ammo <= 0
    ? "NO AMMO"
    : shotCooldownRemMs > 0
    ? "COOLING DOWN"
    : null;

  const handleCameraShoot = () => {
    if (fireDisabledReason) return;
    const evidence = aiming.captureEvidence();
    if (!evidence) return;
    onShoot(evidence);
  };

  const visibleOpponents = state.players.filter(
    (p) => p.id !== self.playerId && p.position !== null
  );
  const selectedDevOpponent =
    visibleOpponents.find((p) => p.id === selectedDevTargetPlayerId) ??
    visibleOpponents[0] ??
    null;

  const handleDevShoot = () => {
    if (!state.config.devMode || fireDisabledReason) return;
    onShoot(
      makeDevEvidence(
        selectedDevMarkerCode,
        selfPlayer?.position ?? null,
        selectedDevOpponent?.position ?? null
      )
    );
  };

  const handleHealAction = () => {
    if (isEliminated || isOutOfZone || !isHealer || healCooldownRemMs > 0) return;
    const camEvidence = aiming.captureEvidence();
    const targetCode = camEvidence?.targetMarkerCode ?? healTargetMarkerCode;
    setLocalHealCooldownUntil(Date.now() + HEAL.cooldownPerTargetMs);
    onHeal(targetCode, camEvidence ?? undefined);
  };

  const assassinPlayer =
    state.config.mode === "assassin"
      ? state.players.find((p) => p.role === "assassin")
      : null;

  const teamScoreEntries = Object.entries(state.teamScores);

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
      {/* Top Bar: Mode, Role, Team, Timer, PlayerMarker, Minimap */}
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
              gap: 8,
            }}
          >
            <div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 11,
                    color: "#94a3b8",
                    textTransform: "uppercase",
                    fontWeight: 700,
                  }}
                >
                  {state.config.mode.replace("_", " ")}
                </span>
                {teamBadge && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: "2px 6px",
                      borderRadius: 6,
                      background: teamBadge.bgColor,
                      color: teamBadge.color,
                      border: `1px solid ${teamBadge.color}`,
                    }}
                  >
                    {teamBadge.symbol} {teamBadge.label}
                  </span>
                )}
                {roleInfo && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: "2px 6px",
                      borderRadius: 6,
                      background: "#1e293b",
                      color: "#e2e8f0",
                    }}
                  >
                    {roleInfo.icon} {roleInfo.badge}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#f8fafc", marginTop: 2 }}>
                {Math.floor(remainingMatchSec / 60)}:
                {String(remainingMatchSec % 60).padStart(2, "0")}
              </div>
            </div>

            <PlayerMarker
              markerCode={self.markerCode}
              sizePx={76}
              dimmed={isEliminated || isOutOfZone}
            />
          </div>

          {/* Assassin Mode Banner (M5 / S6.2) */}
          {state.config.mode === "assassin" && (
            <div
              role="status"
              style={{
                background: role === "assassin" ? "#450a0a" : "#172554",
                border: `1px solid ${role === "assassin" ? "#ef4444" : "#38bdf8"}`,
                color: "#f8fafc",
                padding: "8px 10px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {role === "assassin"
                ? "⚡ YOU ARE THE ASSASSIN — Eliminate all Survivors before time runs out!"
                : `⛨ SURVIVOR — Evade Assassin (${assassinPlayer?.displayName ?? "Unknown"}) until the timer expires!`}
            </div>
          )}

          {/* Team Deathmatch Scoreboard (M5 / S6.3) */}
          {state.config.mode === "team_deathmatch" && teamScoreEntries.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                background: "#111827",
                border: "1px solid #1e293b",
                padding: "8px 10px",
                borderRadius: 10,
              }}
            >
              {teamScoreEntries.map(([tId, score]) => {
                const badge = getTeamBadge(tId);
                return (
                  <div
                    key={tId}
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: badge?.color ?? "#f8fafc",
                    }}
                  >
                    {badge?.symbol} {badge?.label ?? tId}: {score} pts
                  </div>
                );
              })}
            </div>
          )}

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
              GPS Quality: {self.locationQuality.toUpperCase()} — Boundary/range checks pause when GPS is poor.
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
              WARNING: OUT OF ARENA ZONE! Return inside immediately (-10 HP/s). Actions disabled.
            </div>
          )}
        </div>

        <MinimapSvg state={state} sizePx={128} />
      </div>

      {/* Eliminated Banner (S8.5 / S11.3) */}
      {isEliminated ? (
        <section
          role="alert"
          style={{
            flex: 1,
            background: "#450a0a",
            border: "2px solid #ef4444",
            borderRadius: 16,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            gap: 10,
          }}
        >
          <h2 style={{ fontSize: 28, fontWeight: 900, margin: 0, color: "#fecaca" }}>
            YOU WERE ELIMINATED
          </h2>
          <p style={{ fontSize: 14, color: "#fca5a5", margin: 0 }}>
            Your marker is now inactive. Wait for the match to finish or spectate the standings.
          </p>
        </section>
      ) : (
        /* Camera Aiming Viewport (M3/M4 Seam B <-> C) */
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          <AimView controller={aiming} videoRef={aiming.videoRef} />

          {lastFeedback && Date.now() - lastFeedback.timestamp < 4000 && (
            <div
              role="status"
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                fontWeight: 800,
                fontSize: 13,
                textAlign: "center",
                background:
                  lastFeedback.kind === "shot_accepted" || lastFeedback.kind === "heal_applied"
                    ? "#065f46"
                    : lastFeedback.kind === "shot_rejected" ||
                      lastFeedback.kind === "heal_rejected" ||
                      lastFeedback.kind === "pickup_rejected"
                    ? "#450a0a"
                    : "#1e3a8a",
                color: "#f8fafc",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              {lastFeedback.reason
                ? formatRejectReason(lastFeedback.reason)
                : lastFeedback.detail}
            </div>
          )}
        </div>
      )}

      {/* Nearby / Visible Pickups Panel (M6) */}
      {!isEliminated && state.pickups.length > 0 && (
        <section
          aria-label="Arena pickups"
          style={{
            background: "#111827",
            border: "1px solid #1e293b",
            borderRadius: 12,
            padding: 10,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>
            Arena Pickups (Within 5m to Collect)
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {state.pickups.map((pk) => {
              const respawnSec = Math.ceil(clock.msUntil(pk.respawnAt) / 1000);
              const label =
                pk.kind === "weapon"
                  ? `◆ Weapon: ${(pk.weaponId ?? "pulse").toUpperCase()}`
                  : pk.kind === "shield"
                  ? "⛨ Shield (+50)"
                  : "✚ Health (+25)";
              return (
                <button
                  key={pk.id}
                  type="button"
                  disabled={!pk.available || isOutOfZone}
                  onClick={() => onPickup(pk.id)}
                  style={{
                    minHeight: 40,
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid #38bdf8",
                    background: pk.available ? "#0c4a6e" : "#1f2937",
                    color: pk.available ? "#e0f2fe" : "#64748b",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: pk.available && !isOutOfZone ? "pointer" : "not-allowed",
                  }}
                >
                  {pk.available ? `Collect ${label}` : `${label} (${respawnSec}s)`}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Bottom Combat / Role Controls */}
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

        {/* Healer Controls (M5 / S6.3) vs Weapon/Fire Controls */}
        {isHealer ? (
          <div
            style={{
              background: "#064e3b",
              border: "1px solid #10b981",
              borderRadius: 12,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 14, color: "#d1fae5" }}>
                ✚ HEALER KIT (+{HEAL.amount} HP · {HEAL.rangeM}m Range)
              </strong>
              <label style={{ fontSize: 12, color: "#a7f3d0", fontWeight: 700 }}>
                Teammate Marker #:
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={healTargetMarkerCode}
                  onChange={(e) => setHealTargetMarkerCode(Number(e.target.value))}
                  style={{
                    marginLeft: 6,
                    width: 58,
                    padding: "4px 6px",
                    borderRadius: 6,
                    border: "1px solid #10b981",
                    background: "#090d16",
                    color: "#f8fafc",
                  }}
                />
              </label>
            </div>
            <button
              type="button"
              disabled={isEliminated || isOutOfZone || healCooldownRemMs > 0}
              onClick={handleHealAction}
              style={{
                minHeight: 54,
                borderRadius: 12,
                border: "none",
                background:
                  isEliminated || isOutOfZone || healCooldownRemMs > 0 ? "#334155" : "#10b981",
                color: "#052e16",
                fontWeight: 900,
                fontSize: 17,
                cursor:
                  isEliminated || isOutOfZone || healCooldownRemMs > 0 ? "not-allowed" : "pointer",
              }}
            >
              {healCooldownRemMs > 0
                ? `HEAL COOLDOWN (${(healCooldownRemMs / 1000).toFixed(1)}s)`
                : "✚ HEAL TEAMMATE (+25 HP)"}
            </button>
          </div>
        ) : role === "survivor" ? (
          <div
            style={{
              background: "#111827",
              border: "1px solid #334155",
              borderRadius: 12,
              padding: 14,
              textAlign: "center",
              fontSize: 14,
              fontWeight: 700,
              color: "#cbd5e1",
            }}
          >
            ⛨ Survivors cannot carry or fire weapons. Keep moving safely inside the arena!
          </div>
        ) : (
          <>
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
                  {weapon ? `${weapon.name} (${weapon.damage} DMG)` : "Unarmed"}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>AMMO</div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: "#38bdf8",
                    fontFamily: "monospace",
                  }}
                >
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

            {/* Primary Thumb-Safe Camera SHOOT Button (M3/M4) */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                disabled={Boolean(fireDisabledReason) || !aiming.target}
                onClick={handleCameraShoot}
                style={{
                  flex: 1,
                  minHeight: 58,
                  borderRadius: 14,
                  border: "none",
                  background:
                    fireDisabledReason || !aiming.target ? "#1e293b" : "#0284c7",
                  color: fireDisabledReason || !aiming.target ? "#94a3b8" : "#ffffff",
                  fontWeight: 900,
                  fontSize: 18,
                  letterSpacing: "0.04em",
                  cursor: fireDisabledReason || !aiming.target ? "not-allowed" : "pointer",
                }}
              >
                {fireDisabledReason ??
                  (aiming.target ? `FIRE AT MARKER #${aiming.target.markerCode}` : "AIM AT MARKER TO FIRE")}
              </button>

              {aiming.status === "ready" && (
                <button
                  type="button"
                  onClick={aiming.recalibrate}
                  style={{
                    minHeight: 58,
                    padding: "0 14px",
                    borderRadius: 14,
                    border: "1px solid #334155",
                    background: "#111827",
                    color: "#cbd5e1",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Recalibrate
                </button>
              )}
            </div>

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
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#fde68a" }}>
                    [DEV_ONLY] Target Marker Code:
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
                  {visibleOpponents.length > 0 && (
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#fde68a" }}>
                      Align GPS Bearing:
                      <select
                        value={selectedDevOpponent?.id ?? ""}
                        onChange={(e) => setSelectedDevTargetPlayerId(e.target.value)}
                        style={{
                          marginLeft: 6,
                          padding: "4px 8px",
                          borderRadius: 6,
                          border: "1px solid #f59e0b",
                          background: "#090d16",
                          color: "#f8fafc",
                        }}
                      >
                        {visibleOpponents.map((op) => (
                          <option key={op.id} value={op.id}>
                            {op.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <button
                  type="button"
                  disabled={Boolean(fireDisabledReason)}
                  onClick={handleDevShoot}
                  style={{
                    minHeight: 46,
                    padding: "8px 16px",
                    borderRadius: 10,
                    border: "none",
                    background: fireDisabledReason ? "#334155" : "#d97706",
                    color: "#ffffff",
                    fontWeight: 800,
                    fontSize: 14,
                    cursor: fireDisabledReason ? "not-allowed" : "pointer",
                  }}
                >
                  {fireDisabledReason ?? "[DEV_ONLY] SIMULATED FIRE"}
                </button>
              </div>
            )}
          </>
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
