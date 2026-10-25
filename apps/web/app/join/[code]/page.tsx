"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getMatchSummary,
  joinMatch,
  FantomApiError,
  type MatchSummaryType,
} from "@/lib/api";
import { normalizeJoinCode, saveSession, loadSession } from "@/lib/session";

export default function JoinByCodePage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = normalizeJoinCode(params?.code ?? "");

  const [summary, setSummary] = useState<MatchSummaryType | null>(null);
  const [loadingSummary, setLoadingSummary] = useState<boolean>(true);
  const [joining, setJoining] = useState<boolean>(false);
  const [displayName, setDisplayName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!code) return;
    setLoadingSummary(true);
    setError(null);
    try {
      const data = await getMatchSummary(code);
      setSummary(data);
    } catch (err) {
      if (err instanceof FantomApiError) {
        setError(`${err.message} (${err.code})`);
      } else {
        setError("Failed to look up match. Verify server connection and try again.");
      }
    } finally {
      setLoadingSummary(false);
    }
  }, [code]);

  useEffect(() => {
    const saved = loadSession();
    if (saved?.displayName) {
      setDisplayName(saved.displayName);
    }
    void fetchSummary();
  }, [fetchSummary]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed || trimmed.length > 20) {
      setError("Enter a display name between 1 and 20 characters.");
      return;
    }

    setJoining(true);
    setError(null);
    try {
      const res = await joinMatch(code, trimmed);
      saveSession({
        matchId: res.matchId,
        joinCode: res.joinCode,
        joinUrl: res.joinUrl,
        playerId: res.playerId,
        sessionToken: res.sessionToken,
        displayName: trimmed,
      });
      router.push(`/match/${encodeURIComponent(res.matchId)}`);
    } catch (err) {
      if (err instanceof FantomApiError) {
        setError(`${err.message} (${err.code})`);
      } else {
        setError("Could not join match. Please try again.");
      }
    } finally {
      setJoining(false);
    }
  };

  return (
    <main
      style={{
        maxWidth: 460,
        margin: "0 auto",
        padding: "28px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => router.push("/")}
          style={{
            minHeight: 42,
            padding: "8px 14px",
            borderRadius: 10,
            border: "1px solid #334155",
            background: "#111827",
            color: "#cbd5e1",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ← Back
        </button>
        <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 700 }}>JOIN MATCH</span>
      </div>

      <section
        style={{
          background: "#111827",
          border: "1px solid #1e293b",
          borderRadius: 14,
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>
          Match Code
        </div>
        <div
          style={{
            fontSize: 32,
            fontWeight: 900,
            letterSpacing: "0.14em",
            color: "#38bdf8",
            fontFamily: "monospace",
          }}
        >
          {code || "-----"}
        </div>

        {loadingSummary && (
          <div style={{ fontSize: 14, color: "#cbd5e1" }}>Checking match status…</div>
        )}

        {summary && (
          <div
            style={{
              background: "#0f172a",
              borderRadius: 10,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 14,
            }}
          >
            <div>
              <strong>Mode:</strong> {summary.mode.replace("_", " ").toUpperCase()}
            </div>
            <div>
              <strong>Phase:</strong> {summary.phase.toUpperCase()}
            </div>
            <div>
              <strong>Players:</strong> {summary.playerCount} / {summary.maxPlayers}
            </div>
            <div>
              <strong>Status:</strong>{" "}
              <span style={{ color: summary.joinable ? "#6ee7b7" : "#fca5a5", fontWeight: 700 }}>
                {summary.joinable ? "OPEN TO JOIN ✓" : "CLOSED / IN PROGRESS ✕"}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              background: "#450a0a",
              border: "1px solid #ef4444",
              color: "#fecaca",
              padding: 12,
              borderRadius: 10,
              fontSize: 14,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void fetchSummary()}
              style={{
                alignSelf: "flex-start",
                minHeight: 38,
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid #fca5a5",
                background: "#7f1d1d",
                color: "#ffffff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Retry Lookup
            </button>
          </div>
        )}
      </section>

      <form
        onSubmit={(e) => void handleJoin(e)}
        style={{
          background: "#111827",
          border: "1px solid #1e293b",
          borderRadius: 14,
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#cbd5e1" }}>
          Your Display Name (1–20 chars)
          <input
            type="text"
            required
            maxLength={20}
            placeholder="Enter your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={{
              minHeight: 48,
              borderRadius: 10,
              border: "1px solid #334155",
              background: "#0f172a",
              color: "#f8fafc",
              padding: "10px 12px",
              fontSize: 16,
            }}
          />
        </label>

        <button
          type="submit"
          disabled={joining || Boolean(summary && !summary.joinable)}
          style={{
            minHeight: 52,
            borderRadius: 12,
            border: "none",
            background: summary && !summary.joinable ? "#334155" : "#0284c7",
            color: "#ffffff",
            fontWeight: 800,
            fontSize: 16,
            cursor: joining ? "wait" : "pointer",
          }}
        >
          {joining ? "Joining Lobby…" : "Join Match"}
        </button>
      </form>
    </main>
  );
}
