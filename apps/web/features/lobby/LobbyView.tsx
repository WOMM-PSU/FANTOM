"use client";

import React, { useState } from "react";
import type {
  MatchConfigPatch,
  MatchMode,
  MatchState,
  LatLng,
} from "@fantom/shared";
import { MAX_PLAYERS } from "@fantom/shared";
import { QrCodeSvg } from "@/components/QrCodeSvg";
import { buildCircularArenaPolygon } from "@/lib/arena";
import { getTeamBadge, ROLE_INFO } from "@/lib/messages";
import type { GeoPermissionStatus } from "@/hooks/useGeolocation";
import styles from "./LobbyView.module.css";

export type LobbyViewProps = {
  state: MatchState;
  joinUrl: string;
  geoStatus: GeoPermissionStatus;
  lastPosition: LatLng | null;
  geoError: string | null;
  onRequestLocation: () => Promise<boolean>;
  onToggleReady: (ready: boolean) => void;
  onUpdateConfig: (patch: MatchConfigPatch) => void;
  onStartMatch: () => void;
  onLeaveMatch: () => void;
};

const MODE_LABELS: Record<MatchMode, string> = {
  ffa: "Free For All",
  assassin: "Assassin",
  team_deathmatch: "Team Deathmatch",
};

export function LobbyView({
  state,
  joinUrl,
  geoStatus,
  lastPosition,
  geoError,
  onRequestLocation,
  onToggleReady,
  onUpdateConfig,
  onStartMatch,
  onLeaveMatch,
}: LobbyViewProps) {
  const [showQr, setShowQr] = useState<boolean>(true);
  const [arenaRadiusM, setArenaRadiusM] = useState<number>(30);
  const [copied, setCopied] = useState<boolean>(false);

  const selfPlayer = state.players.find((p) => p.id === state.self.playerId);
  const isHost = state.hostPlayerId === state.self.playerId;
  const isReady = selfPlayer?.ready ?? false;

  const startBlockers: string[] = [];
  if (state.players.length < 2) {
    startBlockers.push("Need at least 2 players in the lobby.");
  }
  if (!state.players.every((p) => p.ready)) {
    startBlockers.push("All players must mark themselves READY.");
  }
  if (!state.config.arena && !state.config.devMode) {
    startBlockers.push("Host must set the arena boundary before starting.");
  }

  const handleSetArenaFromGps = async () => {
    let center = lastPosition;
    if (!center) {
      const ok = await onRequestLocation();
      if (!ok) return;
    }
    center = lastPosition;
    if (!center) return;

    const polygon = buildCircularArenaPolygon(center, arenaRadiusM, 24);
    onUpdateConfig({
      arena: {
        polygon,
        boundaryMarginM: 5,
      },
    });
  };

  const handleSetDevDemoArena = () => {
    // DEV_ONLY fallback when config.devMode is true and indoor GPS is unavailable
    const fallbackCenter: LatLng = lastPosition ?? { lat: 40.7982, lng: -77.8599 };
    const polygon = buildCircularArenaPolygon(fallbackCenter, arenaRadiusM, 24);
    onUpdateConfig({
      arena: {
        polygon,
        boundaryMarginM: 5,
      },
    });
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className={styles.container}>
      {state.config.devMode && (
        <div className={styles.devBanner} role="status">
          [DEV_ONLY] Development Simulation Mode Active — Simulated inputs are enabled for testing only.
        </div>
      )}

      {/* Join Code & QR Header */}
      <section className={styles.headerCard} aria-label="Match invite">
        <div className={styles.topRow}>
          <div className={styles.codeBox}>
            <span className={styles.codeLabel}>Join Code</span>
            <span className={styles.codeValue}>{state.joinCode}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className={styles.qrToggleBtn}
              onClick={handleCopyCode}
            >
              {copied ? "Copied Link ✓" : "Copy Join Link"}
            </button>
            <button
              type="button"
              className={styles.qrToggleBtn}
              onClick={() => setShowQr((v) => !v)}
            >
              {showQr ? "Hide QR" : "Show QR"}
            </button>
          </div>
        </div>

        {showQr && (
          <div className={styles.qrPanel}>
            <QrCodeSvg
              value={joinUrl}
              sizePx={176}
              label={`Scan to join match ${state.joinCode}`}
            />
            <span className={styles.urlText}>{joinUrl}</span>
          </div>
        )}
      </section>

      {/* Player List */}
      <section className={styles.card} aria-label="Players in lobby">
        <h2 className={styles.sectionTitle}>
          <span>Players</span>
          <span>
            {state.players.length} / {MAX_PLAYERS}
          </span>
        </h2>

        <ul className={styles.playerList}>
          {state.players.map((player) => {
            const playerIsHost = player.id === state.hostPlayerId;
            const playerIsSelf = player.id === state.self.playerId;
            const teamBadge = getTeamBadge(player.teamId);
            const roleInfo = player.role ? ROLE_INFO[player.role] : null;
            return (
              <li key={player.id} className={styles.playerItem}>
                <div className={styles.playerInfo}>
                  <span className={styles.playerName}>{player.displayName}</span>
                  {playerIsHost && (
                    <span className={`${styles.badge} ${styles.hostBadge}`}>HOST</span>
                  )}
                  {playerIsSelf && (
                    <span className={`${styles.badge} ${styles.selfBadge}`}>YOU</span>
                  )}
                  {teamBadge && (
                    <span
                      className={styles.badge}
                      style={{
                        background: teamBadge.bgColor,
                        color: teamBadge.color,
                        border: `1px solid ${teamBadge.color}`,
                      }}
                    >
                      {teamBadge.symbol} {teamBadge.label}
                    </span>
                  )}
                  {roleInfo && (
                    <span className={styles.badge} style={{ background: "#1e293b", color: "#e2e8f0" }}>
                      {roleInfo.icon} {roleInfo.badge}
                    </span>
                  )}
                  {!player.connected && (
                    <span className={`${styles.badge} ${styles.offlineBadge}`}>
                      OFFLINE !
                    </span>
                  )}
                </div>
                <div className={styles.statusBadges}>
                  <span
                    className={`${styles.readyPill} ${
                      player.ready ? styles.readyYes : styles.readyNo
                    }`}
                  >
                    {player.ready ? "READY ✓" : "NOT READY ○"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Device Permissions & Ready Control */}
      <section className={styles.card} aria-label="Readiness and permissions">
        <h2 className={styles.sectionTitle}>Your Setup & Readiness</h2>

        <div className={styles.permissionRow}>
          <div>
            <strong>GPS Location: </strong>
            <span>
              {geoStatus === "granted"
                ? "Granted ✓"
                : geoStatus === "denied"
                ? "Denied ✕"
                : geoStatus === "unavailable"
                ? "Unavailable"
                : "Not Checked"}
            </span>
            {geoError && (
              <div style={{ color: "#fca5a5", fontSize: 12, marginTop: 4 }}>
                {geoError}
              </div>
            )}
          </div>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => void onRequestLocation()}
          >
            {geoStatus === "granted" ? "Refresh GPS" : "Enable GPS"}
          </button>
        </div>

        <button
          type="button"
          className={`${styles.primaryBtn} ${isReady ? styles.readyActiveBtn : ""}`}
          onClick={() => onToggleReady(!isReady)}
        >
          {isReady ? "READY ✓ (Tap to Unready)" : "MARK READY TO PLAY"}
        </button>
      </section>

      {/* Host Configuration */}
      <section className={styles.card} aria-label="Match configuration">
        <h2 className={styles.sectionTitle}>
          <span>Match Settings</span>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            {isHost ? "Host Controls" : "Host Controlled"}
          </span>
        </h2>

        <div className={styles.fieldGrid}>
          <label className={styles.fieldLabel}>
            Game Mode
            <select
              className={styles.select}
              disabled={!isHost}
              value={state.config.mode}
              onChange={(e) =>
                onUpdateConfig({ mode: e.target.value as MatchMode })
              }
            >
              <option value="ffa">Free For All</option>
              <option value="assassin">Assassin</option>
              <option value="team_deathmatch">Team Deathmatch</option>
            </select>
          </label>

          <label className={styles.fieldLabel}>
            Duration
            <select
              className={styles.select}
              disabled={!isHost}
              value={state.config.durationSec}
              onChange={(e) =>
                onUpdateConfig({ durationSec: Number(e.target.value) })
              }
            >
              <option value={180}>3 Minutes</option>
              <option value={300}>5 Minutes</option>
              <option value={600}>10 Minutes</option>
              <option value={900}>15 Minutes</option>
            </select>
          </label>

          <label className={styles.fieldLabel}>
            Max Weapon Range
            <select
              className={styles.select}
              disabled={!isHost}
              value={state.config.maxRangeM}
              onChange={(e) =>
                onUpdateConfig({ maxRangeM: Number(e.target.value) })
              }
            >
              <option value={15}>15 meters</option>
              <option value={30}>30 meters (Default)</option>
              <option value={50}>50 meters</option>
              <option value={75}>75 meters</option>
            </select>
          </label>

          <label className={styles.fieldLabel}>
            Spawn Lockout
            <select
              className={styles.select}
              disabled={!isHost}
              value={state.config.spawnLockoutSec}
              onChange={(e) =>
                onUpdateConfig({ spawnLockoutSec: Number(e.target.value) })
              }
            >
              <option value={0}>0s (None)</option>
              <option value={5}>5s (FFA/TDM Default)</option>
              <option value={15}>15s (Assassin Default)</option>
              <option value={30}>30s</option>
            </select>
          </label>
        </div>

        {/* Team Deathmatch Specific Settings (M5) */}
        {state.config.mode === "team_deathmatch" && (
          <div className={styles.fieldGrid}>
            <label className={styles.fieldLabel}>
              Number of Teams
              <select
                className={styles.select}
                disabled={!isHost}
                value={state.config.team.teamCount}
                onChange={(e) =>
                  onUpdateConfig({
                    team: {
                      ...state.config.team,
                      teamCount: Number(e.target.value),
                    },
                  })
                }
              >
                <option value={2}>2 Teams</option>
                <option value={3}>3 Teams</option>
                <option value={4}>4 Teams</option>
              </select>
            </label>

            <label className={styles.fieldLabel}>
              Killers per Healer
              <select
                className={styles.select}
                disabled={!isHost}
                value={state.config.team.killersPerHealer}
                onChange={(e) =>
                  onUpdateConfig({
                    team: {
                      ...state.config.team,
                      killersPerHealer: Number(e.target.value),
                    },
                  })
                }
              >
                <option value={1}>1 Killer : 1 Healer</option>
                <option value={2}>2 Killers : 1 Healer</option>
                <option value={3}>3 Killers : 1 Healer</option>
                <option value={4}>4 Killers : 1 Healer</option>
              </select>
            </label>
          </div>
        )}

        {/* Arena Boundary Configuration (PLAN.md P2 #8 & S10.6) */}
        <div className={styles.permissionRow} style={{ flexDirection: "column", alignItems: "stretch" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>Arena Boundary (24-gon):</strong>
            <span style={{ color: state.config.arena ? "#6ee7b7" : "#fcd34d", fontWeight: 700 }}>
              {state.config.arena
                ? `Configured (${state.config.arena.polygon.length} pts) ✓`
                : "Not Set !"}
            </span>
          </div>

          {isHost && (
            <>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                <label className={styles.fieldLabel} style={{ flex: 1 }}>
                  Arena Radius
                  <select
                    className={styles.select}
                    value={arenaRadiusM}
                    onChange={(e) => setArenaRadiusM(Number(e.target.value))}
                  >
                    <option value={15}>15 meters (Small)</option>
                    <option value={30}>30 meters (Standard)</option>
                    <option value={50}>50 meters (Large)</option>
                    <option value={75}>75 meters (Wide)</option>
                  </select>
                </label>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  style={{ alignSelf: "flex-end" }}
                  onClick={() => void handleSetArenaFromGps()}
                >
                  Use My Location
                </button>
              </div>

              {state.config.devMode && (
                <button
                  type="button"
                  className={styles.qrToggleBtn}
                  onClick={handleSetDevDemoArena}
                >
                  [DEV_ONLY] Set Demo Arena Polygon (Indoor Testing)
                </button>
              )}
            </>
          )}
        </div>

        <div className={styles.safetyNote}>
          <strong>Safety First:</strong> Play only in an open, designated area away from roads,
          traffic, stairs, and hazards. Never run while looking at your phone screen.
        </div>

        <div className={styles.checkboxGrid}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              disabled={!isHost}
              checked={state.config.minimap.enabled}
              onChange={(e) =>
                onUpdateConfig({
                  minimap: { ...state.config.minimap, enabled: e.target.checked },
                })
              }
            />
            Minimap Enabled
          </label>

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              disabled={!isHost || !state.config.minimap.enabled}
              checked={state.config.minimap.showAllies}
              onChange={(e) =>
                onUpdateConfig({
                  minimap: { ...state.config.minimap, showAllies: e.target.checked },
                })
              }
            />
            Show Teammates
          </label>

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              disabled={!isHost || !state.config.minimap.enabled}
              checked={state.config.minimap.showPickups}
              onChange={(e) =>
                onUpdateConfig({
                  minimap: { ...state.config.minimap, showPickups: e.target.checked },
                })
              }
            />
            Show Pickups on Map
          </label>

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              disabled={!isHost || state.config.mode === "assassin"}
              checked={state.config.pickups.weapons}
              onChange={(e) =>
                onUpdateConfig({
                  pickups: { ...state.config.pickups, weapons: e.target.checked },
                })
              }
            />
            Weapon Drops
          </label>

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              disabled={!isHost}
              checked={state.config.pickups.health}
              onChange={(e) =>
                onUpdateConfig({
                  pickups: { ...state.config.pickups, health: e.target.checked },
                })
              }
            />
            Health Packs (+25)
          </label>

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              disabled={!isHost}
              checked={state.config.pickups.shields}
              onChange={(e) =>
                onUpdateConfig({
                  pickups: { ...state.config.pickups, shields: e.target.checked },
                })
              }
            />
            Shield Pickups (+50)
          </label>
        </div>

        {isHost ? (
          <>
            {startBlockers.length > 0 && (
              <ul className={styles.blockerList} aria-label="Start requirements">
                {startBlockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={startBlockers.length > 0}
              onClick={onStartMatch}
            >
              START {MODE_LABELS[state.config.mode].toUpperCase()} MATCH
            </button>
          </>
        ) : (
          <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "center" }}>
            Waiting for host to start the {MODE_LABELS[state.config.mode]} match…
          </div>
        )}
      </section>

      {/* Always-reachable Leave Match control (PLAN.md S11.4) */}
      <button type="button" className={styles.leaveBtn} onClick={onLeaveMatch}>
        Leave Match
      </button>
    </div>
  );
}
