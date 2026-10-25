"use client";

import React from "react";
import type { MatchState } from "@fantom/shared";

export type ResultsViewProps = {
  state: MatchState;
  onLeaveMatch: () => void;
};

export function ResultsView({ state, onLeaveMatch }: ResultsViewProps) {
  const result = state.result;

  const getWinnerHeadline = (): string => {
    if (!result) return "Match Ended";
    const winner = result.winner;
    switch (winner.kind) {
      case "player": {
        const w = state.players.find((p) => p.id === winner.playerId);
        return `Winner: ${w?.displayName ?? winner.playerId}`;
      }
      case "team":
        return `Winning Team: ${winner.teamId}`;
      case "assassin":
        return "Assassin Wins!";
      case "survivors":
        return "Survivors Win!";
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
          Match Results ({result?.endedReason ?? "finished"})
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#38bdf8", margin: "8px 0 0" }}>
          {getWinnerHeadline()}
        </h1>
      </section>

      {result && result.standings.length > 0 && (
        <section
          style={{
            background: "#111827",
            border: "1px solid #1e293b",
            borderRadius: 14,
            padding: 16,
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>Standings</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {result.standings.map((row, idx) => (
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
                }}
              >
                <div>
                  <strong>
                    #{idx + 1} {row.displayName}
                  </strong>
                  {row.role && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: "#94a3b8" }}>
                      [{row.role.toUpperCase()}]
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: "#cbd5e1" }}>
                  Score: <strong>{row.score}</strong> · Elim: {row.eliminations} · Deaths: {row.deaths}
                </div>
              </div>
            ))}
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
