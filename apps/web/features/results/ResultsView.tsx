"use client";

import React from "react";
import type { MatchState } from "@fantom/shared";
import { getTeamBadge, ROLE_INFO } from "@/lib/messages";

export type ResultsViewProps = {
  state: MatchState;
  onLeaveMatch: () => void;
};

export function ResultsView({ state, onLeaveMatch }: ResultsViewProps) {
  const result = state.result;
  const teamScores = Object.entries(state.teamScores);

  const getWinnerHeadline = (): string => {
    if (!result) return "Match Ended";
    const winner = result.winner;
    switch (winner.kind) {
      case "player": {
        const w = state.players.find((p) => p.id === winner.playerId);
        return `Winner: ${w?.displayName ?? winner.playerId}`;
      }
      case "team": {
        const badge = getTeamBadge(winner.teamId);
        return `Winning Team: ${badge ? `${badge.symbol} ${badge.label}` : winner.teamId}`;
      }
      case "assassin":
        return "⚡ Assassin Wins!";
      case "survivors":
        return "⛨ Survivors Win!";
      case "draw":
        return "Match Draw";
      case "invalid":
        return `Match Invalid (${winner.reason})`;
    }
  };

  return (
    <div
      style={{
        maxWidth: 540,
        margin: "0 auto",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <section
        style={{
          background: "#111827",
          border: "1px solid #38bdf8",
          borderRadius: 14,
          padding: 20,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#94a3b8",
            fontWeight: 700,
          }}
        >
          {state.config.mode.replace("_", " ")} Results ({result?.endedReason ?? "finished"})
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#38bdf8", margin: "8px 0 0" }}>
          {getWinnerHeadline()}
        </h1>
      </section>

      {state.config.mode === "team_deathmatch" && teamScores.length > 0 && (
        <section
          style={{
            background: "#111827",
            border: "1px solid #1e293b",
            borderRadius: 14,
            padding: 16,
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 10px" }}>Team Scoreboard</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {teamScores.map(([tId, score]) => {
              const badge = getTeamBadge(tId);
              return (
                <div
                  key={tId}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: badge?.bgColor ?? "#0f172a",
                    border: `1px solid ${badge?.color ?? "#334155"}`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <strong style={{ color: badge?.color ?? "#f8fafc" }}>
                    {badge?.symbol} {badge?.label ?? tId}
                  </strong>
                  <span style={{ fontSize: 18, fontWeight: 900 }}>{score} pts</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {result && result.standings.length > 0 && (
        <section
          style={{
            background: "#111827",
            border: "1px solid #1e293b",
            borderRadius: 14,
            padding: 16,
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>Player Standings</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {result.standings.map((row, idx) => {
              const teamBadge = getTeamBadge(row.teamId);
              const roleInfo = row.role ? ROLE_INFO[row.role] : null;
              return (
                <div
                  key={row.playerId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 12px",
                    background: "#0f172a",
                    borderRadius: 10,
                    border: "1px solid #1e293b",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong>
                      #{idx + 1} {row.displayName}
                    </strong>
                    {teamBadge && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: 6,
                          background: teamBadge.bgColor,
                          color: teamBadge.color,
                        }}
                      >
                        {teamBadge.symbol} {teamBadge.label}
                      </span>
                    )}
                    {roleInfo && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: 6,
                          background: "#1e293b",
                          color: "#cbd5e1",
                        }}
                      >
                        {roleInfo.icon} {roleInfo.badge}
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: row.survived ? "#6ee7b7" : "#fca5a5",
                      }}
                    >
                      {row.survived ? "SURVIVED ✓" : "ELIMINATED ✕"}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "#cbd5e1" }}>
                    Score: <strong>{row.score}</strong> · Elim: {row.eliminations} · Deaths:{" "}
                    {row.deaths}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={onLeaveMatch}
        style={{
          minHeight: 50,
          borderRadius: 12,
          border: "1px solid #38bdf8",
          background: "#0284c7",
          color: "#ffffff",
          fontWeight: 800,
          fontSize: 16,
          cursor: "pointer",
        }}
      >
        Return to Home
      </button>
    </div>
  );
}
