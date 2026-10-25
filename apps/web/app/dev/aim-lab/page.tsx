"use client";

/**
 * Unlinked developer testbench route `/dev/aim-lab` (PLAN.md P5.4 & docs/aiming-decisions.md).
 * Owned by Dev B under `apps/web/app/**` to unblock single-origin Next.js phone testing over
 * `pnpm dev:tunnel` without placing spike tools in primary user navigation.
 */
import React, { useEffect, useState } from "react";
import type { AimEvidence } from "@fantom/shared";
import {
  AimView,
  PlayerMarker,
  useAiming,
  makeDevEvidence,
  buildFantomMarkerPayload,
} from "@/features/hud/aimingBridge";
import { QrCodeSvg } from "@/components/QrCodeSvg";

type OrientationSnapshot = {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute: boolean;
  compassHeading: number | null;
  compassAccuracy: number | null;
  screenAngle: number;
};

export default function AimLabPage() {
  const [tab, setTab] = useState<"aim" | "target">("aim");
  const [markerCode, setMarkerCode] = useState<number>(7);
  const [largeMarker, setLargeMarker] = useState<boolean>(false);
  const [capturedEvidence, setCapturedEvidence] = useState<AimEvidence | null>(null);
  const [hasBarcodeDetector, setHasBarcodeDetector] = useState<boolean | null>(null);
  const [orientation, setOrientation] = useState<OrientationSnapshot>({
    alpha: null,
    beta: null,
    gamma: null,
    absolute: false,
    compassHeading: null,
    compassAccuracy: null,
    screenAngle: 0,
  });

  const aiming = useAiming({ enabled: tab === "aim" });

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHasBarcodeDetector("BarcodeDetector" in window);

    const onOrient = (ev: DeviceOrientationEvent) => {
      const webkitEv = ev as unknown as {
        webkitCompassHeading?: number;
        webkitCompassAccuracy?: number;
      };
      setOrientation({
        alpha: typeof ev.alpha === "number" ? Number(ev.alpha.toFixed(1)) : null,
        beta: typeof ev.beta === "number" ? Number(ev.beta.toFixed(1)) : null,
        gamma: typeof ev.gamma === "number" ? Number(ev.gamma.toFixed(1)) : null,
        absolute: Boolean(ev.absolute),
        compassHeading:
          typeof webkitEv.webkitCompassHeading === "number"
            ? Number(webkitEv.webkitCompassHeading.toFixed(1))
            : null,
        compassAccuracy:
          typeof webkitEv.webkitCompassAccuracy === "number"
            ? Number(webkitEv.webkitCompassAccuracy.toFixed(1))
            : null,
        screenAngle:
          typeof window.screen?.orientation?.angle === "number"
            ? window.screen.orientation.angle
            : 0,
      });
    };

    window.addEventListener("deviceorientation", onOrient);
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
    };
  }, []);

  const clampedCode = Math.max(0, Math.min(255, Math.floor(markerCode || 0)));
  const qrPayload = buildFantomMarkerPayload(clampedCode);

  if (tab === "target" && largeMarker) {
    return (
      <main
        style={{
          minHeight: "100dvh",
          background: "#ffffff",
          color: "#000000",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          gap: 16,
        }}
      >
        <button
          type="button"
          onClick={() => setLargeMarker(false)}
          style={{
            minHeight: 44,
            padding: "8px 18px",
            borderRadius: 10,
            border: "2px solid #000000",
            background: "#090d16",
            color: "#ffffff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Exit Large Marker
        </button>

        <QrCodeSvg value={qrPayload} sizePx={320} label={`FANTOM QR marker ${qrPayload}`} />

        <div style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 16 }}>
          {qrPayload}
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        maxWidth: 620,
        margin: "0 auto",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <header
        style={{
          background: "#111827",
          border: "1px solid #1e293b",
          borderRadius: 14,
          padding: 14,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong style={{ fontSize: 18 }}>FANTOM Aim Lab</strong>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                padding: "2px 8px",
                borderRadius: 999,
                background: "#451a03",
                border: "1px solid #f59e0b",
                color: "#fef3c7",
              }}
            >
              SPIKE — NOT GAMEPLAY
            </span>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8" }}>
            Integrated Next.js testbench (`/dev/aim-lab`) for two-phone posture & marker checks over{" "}
            <code>pnpm dev:tunnel</code>.
          </p>
        </div>

        <div style={{ display: "flex", gap: 6 }} role="tablist" aria-label="Aim lab mode">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "aim"}
            onClick={() => {
              setLargeMarker(false);
              setTab("aim");
            }}
            style={{
              minHeight: 40,
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid #38bdf8",
              background: tab === "aim" ? "#0284c7" : "#090d16",
              color: "#ffffff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Aim & Sensors
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "target"}
            onClick={() => {
              aiming.stop();
              setTab("target");
            }}
            style={{
              minHeight: 40,
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid #38bdf8",
              background: tab === "target" ? "#0284c7" : "#090d16",
              color: "#ffffff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Target Marker
          </button>
        </div>
      </header>

      {tab === "aim" ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <AimView controller={aiming} videoRef={aiming.videoRef} />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void aiming.start()}
              style={{
                minHeight: 44,
                padding: "8px 14px",
                borderRadius: 10,
                border: "none",
                background: "#0284c7",
                color: "#ffffff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Start Camera & Sensors
            </button>
            <button
              type="button"
              onClick={aiming.stop}
              style={{
                minHeight: 44,
                padding: "8px 14px",
                borderRadius: 10,
                border: "1px solid #475569",
                background: "#1e293b",
                color: "#e2e8f0",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Stop Camera
            </button>
            <button
              type="button"
              onClick={() => {
                const ev =
                  aiming.captureEvidence() ??
                  makeDevEvidence(
                    clampedCode,
                    { lat: 40.7982, lng: -77.8599 },
                    { lat: 40.7983, lng: -77.8599 }
                  );
                setCapturedEvidence(ev);
              }}
              style={{
                minHeight: 44,
                padding: "8px 14px",
                borderRadius: 10,
                border: "1px solid #10b981",
                background: "#064e3b",
                color: "#d1fae5",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Inspect AimEvidence Snapshot
            </button>
          </div>

          <div
            style={{
              background: "#111827",
              border: "1px solid #1e293b",
              borderRadius: 12,
              padding: 12,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 10,
              fontSize: 12,
            }}
          >
            <div>
              <span style={{ color: "#94a3b8", display: "block" }}>Camera Status</span>
              <strong>{aiming.status}</strong>
            </div>
            <div>
              <span style={{ color: "#94a3b8", display: "block" }}>Native BarcodeDetector</span>
              <strong>
                {hasBarcodeDetector === null
                  ? "Checking…"
                  : hasBarcodeDetector
                  ? "Available"
                  : "Unavailable"}
              </strong>
            </div>
            <div>
              <span style={{ color: "#94a3b8", display: "block" }}>alpha / beta / gamma</span>
              <strong>
                {orientation.alpha ?? "—"}° / {orientation.beta ?? "—"}° /{" "}
                {orientation.gamma ?? "—"}°
              </strong>
            </div>
            <div>
              <span style={{ color: "#94a3b8", display: "block" }}>Compass Heading</span>
              <strong>
                {orientation.compassHeading !== null
                  ? `${orientation.compassHeading}° (±${orientation.compassAccuracy ?? "?"}°)`
                  : orientation.absolute
                  ? "Absolute alpha"
                  : "Relative / uncalibrated"}
              </strong>
            </div>
          </div>

          {capturedEvidence && (
            <div
              style={{
                background: "#090d16",
                border: "1px solid #334155",
                borderRadius: 12,
                padding: 12,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, color: "#38bdf8", marginBottom: 6 }}>
                Last Captured AimEvidence ({capturedEvidence.source})
              </div>
              <pre
                style={{
                  margin: 0,
                  fontSize: 11,
                  overflowX: "auto",
                  color: "#e2e8f0",
                }}
              >
                {JSON.stringify(capturedEvidence, null, 2)}
              </pre>
            </div>
          )}
        </section>
      ) : (
        <section
          style={{
            background: "#111827",
            border: "1px solid #1e293b",
            borderRadius: 14,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 13, fontWeight: 700 }}>
              Marker Code (0–255):
              <input
                type="number"
                min={0}
                max={255}
                value={clampedCode}
                onChange={(e) => setMarkerCode(Number(e.target.value))}
                style={{
                  marginLeft: 8,
                  width: 72,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #334155",
                  background: "#090d16",
                  color: "#f8fafc",
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => setMarkerCode(Math.floor(Math.random() * 256))}
              style={{
                minHeight: 40,
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid #475569",
                background: "#1e293b",
                color: "#f8fafc",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Random Code
            </button>
            <button
              type="button"
              onClick={() => setLargeMarker(true)}
              style={{
                minHeight: 40,
                padding: "6px 14px",
                borderRadius: 8,
                border: "none",
                background: "#0284c7",
                color: "#ffffff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Large Marker (Posture Test)
            </button>
          </div>

          <div
            style={{
              display: "flex",
              gap: 24,
              alignItems: "center",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <QrCodeSvg value={qrPayload} sizePx={220} label={`FANTOM QR marker ${qrPayload}`} />
              <div style={{ marginTop: 8, fontSize: 12, fontFamily: "monospace", color: "#38bdf8" }}>
                QR Candidate: {qrPayload}
              </div>
            </div>

            <div style={{ textAlign: "center" }}>
              <PlayerMarker markerCode={clampedCode} sizePx={160} />
              <div style={{ marginTop: 8, fontSize: 12, color: "#94a3b8" }}>
                HUD 4×4 Fiducial Candidate
              </div>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
            Turn screen brightness up. This marker encodes only the match-scoped code (0–255) and
            checksum — never a session token.
          </p>
        </section>
      )}
    </main>
  );
}
