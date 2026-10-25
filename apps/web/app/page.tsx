"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createMatch, FantomApiError } from "@/lib/api";
import {
  loadSession,
  saveSession,
  clearSession,
  normalizeJoinCode,
  isValidJoinCode,
  type StoredSession,
} from "@/lib/session";

export default function HomePage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState<string>("");
  const [joinCodeInput, setJoinCodeInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [existingSession, setExistingSession] = useState<StoredSession | null>(null);

  useEffect(() => {
    const saved = loadSession();
    if (saved) {
      setExistingSession(saved);
      setDisplayName(saved.displayName);
    }
  }, []);

  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = displayName.trim();
    if (!trimmedName || trimmedName.length > 20) {
      setErrorMessage("Enter a display name between 1 and 20 characters.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await createMatch(trimmedName);
      saveSession({
        matchId: res.matchId,
        joinCode: res.joinCode,
        joinUrl: res.joinUrl,
        playerId: res.playerId,
        sessionToken: res.sessionToken,
        displayName: trimmedName,
      });
      router.push(`/match/${encodeURIComponent(res.matchId)}`);
    } catch (err) {
      if (err instanceof FantomApiError) {
        setErrorMessage(`${err.message} (${err.code})`);
      } else {
        setErrorMessage("Could not connect to the FANTOM server. Check that the server is running.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoToJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const code = normalizeJoinCode(joinCodeInput);
    if (!isValidJoinCode(code)) {
      setErrorMessage("Enter a valid 5-character join code (excludes 0, O, 1, I, L).");
      return;
    }
    setErrorMessage(null);
    router.push(`/join/${code}`);
  };

  return (
    <main
      style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: "28px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <header style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.16em",
            color: "#38bdf8",
            textTransform: "uppercase",
          }}
        >
          Works On My Machine
        </div>
        <h1
          style={{
            fontSize: 38,
            fontWeight: 900,
            letterSpacing: "0.08em",
            margin: "6px 0",
            color: "#f8fafc",
          }}
        >
          FANTOM
        </h1>
        <p style={{ fontSize: 14, color: "#94a3b8", margin: 0 }}>
          Real-world smartphone multiplayer laser tag.
        </p>
      </header>

      {existingSession && (
        <section
          aria-label="Active session"
          style={{
            background: "#0c4a6e",
            border: "1px solid #38bdf8",
            borderRadius: 14,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            Active Session Found — Code <span style={{ fontFamily: "monospace" }}>{existingSession.joinCode}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => router.push(`/match/${encodeURIComponent(existingSession.matchId)}`)}
              style={{
                flex: 1,
                minHeight: 46,
                borderRadius: 10,
                border: "none",
                background: "#38bdf8",
                color: "#090d16",
                fontWeight: 800,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Rejoin Match
            </button>
            <button
              type="button"
              onClick={() => {
                clearSession();
                setExistingSession(null);
              }}
              style={{
                minHeight: 46,
                padding: "0 14px",
                borderRadius: 10,
                border: "1px solid #94a3b8",
                background: "transparent",
                color: "#e2e8f0",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Discard
            </button>
          </div>
        </section>
      )}

      {errorMessage && (
        <div
          role="alert"
          style={{
            background: "#450a0a",
            border: "1px solid #ef4444",
            color: "#fecaca",
            padding: "12px 14px",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Create Match Card */}
      <form
        onSubmit={(e) => void handleCreateMatch(e)}
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
        <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>Create a Match</h2>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#cbd5e1" }}>
          Your Display Name (1–20 chars)
          <input
            type="text"
            required
            maxLength={20}
            placeholder="e.g. Jatin"
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
          disabled={loading}
          style={{
            minHeight: 52,
            borderRadius: 12,
            border: "none",
            background: "#0284c7",
            color: "#ffffff",
            fontWeight: 800,
            fontSize: 16,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "Creating Lobby…" : "Host New Match"}
        </button>
      </form>

      {/* Join Match by Code Card */}
      <form
        onSubmit={handleGoToJoin}
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
        <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>Join with a Code</h2>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#cbd5e1" }}>
          5-Character Join Code
          <input
            type="text"
            required
            maxLength={5}
            placeholder="ABCDE"
            value={joinCodeInput}
            onChange={(e) => setJoinCodeInput(normalizeJoinCode(e.target.value))}
            style={{
              minHeight: 48,
              borderRadius: 10,
              border: "1px solid #334155",
              background: "#0f172a",
              color: "#38bdf8",
              padding: "10px 12px",
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontFamily: "monospace",
            }}
          />
        </label>
        <button
          type="submit"
          style={{
            minHeight: 52,
            borderRadius: 12,
            border: "1px solid #38bdf8",
            background: "#0f172a",
            color: "#e0f2fe",
            fontWeight: 800,
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          Find Match →
        </button>
      </form>
    </main>
  );
}
