"use client";

/**
 * Seam B <-> C Adapter (PLAN.md P5.3).
 * Lives inside `features/hud/` (owned by Dev B) so we never edit `features/aiming/**` (owned by Dev C).
 * Once Dev C merges `apps/web/features/aiming/index.ts`, re-export from `@/features/aiming`.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { AimEvidence } from "@fantom/shared";
import { AIM_UNAVAILABLE_INFO, type AimUnavailableReason } from "@/lib/messages";

export type AimController = {
  status: "idle" | "requesting_permissions" | "calibrating" | "ready" | "unavailable";
  unavailableReason?: AimUnavailableReason;
  target: { markerCode: number; confidence: number } | null;
  start(): Promise<void>;
  stop(): void;
  recalibrate(): void;
  captureEvidence(): AimEvidence | null;
};

/**
 * DEV_ONLY — builds simulated evidence; usable only when config.devMode === true (PLAN.md P5.3).
 */
export function makeDevEvidence(targetMarkerCode: number): AimEvidence {
  return {
    source: "dev_simulated",
    ageMs: 15,
    targetMarkerCode: Math.max(0, Math.min(255, Math.floor(targetMarkerCode))),
    visibleMarkerCodes: [Math.max(0, Math.min(255, Math.floor(targetMarkerCode)))],
    markerConfidence: 0.96,
    markerVisibleFraction: 1,
    markerOffsetDeg: { x: 0, y: 0 },
    markerWidthPx: 140,
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

/**
 * High-contrast 4x4 bit-grid fiducial marker displayed on each active player's phone screen (PLAN.md P5.3 & S9.2).
 * Encodes only the match-scoped `markerCode` (0..255), never session credentials.
 */
export function PlayerMarker({
  markerCode,
  sizePx = 112,
  dimmed = false,
}: {
  markerCode: number;
  sizePx?: number;
  dimmed?: boolean;
}) {
  const code = Math.max(0, Math.min(255, Math.floor(markerCode)));
  // 8 data bits + 4 parity bits + 4 orientation corner bits = 16 cells (4x4 internal grid inside black border)
  const b = (shift: number) => ((code >>> shift) & 1) === 1;
  const rowParity0 = b(7) !== b(6);
  const rowParity1 = b(5) !== b(4);
  const rowParity2 = b(3) !== b(2);
  const rowParity3 = b(1) !== b(0);

  // 4x4 internal payload grid: top-left (true), top-right (false) for orientation disambiguation
  const cells: boolean[][] = [
    [true, b(7), b(6), false],
    [rowParity0, b(5), b(4), rowParity1],
    [rowParity2, b(3), b(2), rowParity3],
    [false, b(1), b(0), true],
  ];

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        opacity: dimmed ? 0.35 : 1,
        transition: "opacity 150ms ease",
      }}
    >
      <svg
        width={sizePx}
        height={sizePx}
        viewBox="0 0 8 8"
        role="img"
        aria-label={`Player target marker #${code}${dimmed ? " (inactive)" : ""}`}
        style={{
          background: "#ffffff",
          borderRadius: 8,
          shapeRendering: "crispEdges",
          display: "block",
          border: "2px solid #ffffff",
        }}
      >
        {/* Quiet zone (outer 1-unit white border) */}
        <rect x={0} y={0} width={8} height={8} fill="#ffffff" />
        {/* Solid black fiducial border (6x6) */}
        <rect x={1} y={1} width={6} height={6} fill="#000000" />
        {/* 4x4 internal cells */}
        {cells.map((row, r) =>
          row.map((dark, c) => (
            <rect
              key={`${r}-${c}`}
              x={c + 2}
              y={r + 2}
              width={1}
              height={1}
              fill={dark ? "#000000" : "#ffffff"}
            />
          ))
        )}
      </svg>
      <span
        style={{
          fontSize: 11,
          fontWeight: 800,
          fontFamily: "monospace",
          color: dimmed ? "#64748b" : "#38bdf8",
        }}
      >
        MARKER #{code} {dimmed ? "(INACTIVE)" : ""}
      </span>
    </div>
  );
}

export function AimView({
  controller,
  videoRef,
}: {
  controller: AimController;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}) {
  const unavailableInfo = controller.unavailableReason
    ? AIM_UNAVAILABLE_INFO[controller.unavailableReason]
    : null;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        minHeight: 240,
        flex: 1,
        background: "#050811",
        border: "1px solid #1e293b",
        borderRadius: 16,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: controller.status === "ready" ? "block" : "none",
        }}
      />

      {/* Central Reticle Overlay */}
      <div
        aria-hidden="true"
        style={{
          position: "relative",
          zIndex: 2,
          width: 88,
          height: 88,
          borderRadius: "50%",
          border: `3px solid ${
            controller.target ? "#10b981" : controller.status === "ready" ? "#38bdf8" : "#475569"
          }`,
          boxShadow: controller.target ? "0 0 20px rgba(16, 185, 129, 0.6)" : "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: controller.target ? "#10b981" : "#38bdf8",
          }}
        />
      </div>

      {/* Camera / Sensor Permission & Status Overlay */}
      <div
        style={{
          position: "relative",
          zIndex: 3,
          marginTop: 12,
          padding: "8px 14px",
          maxWidth: 340,
          textAlign: "center",
        }}
      >
        {controller.status === "idle" && (
          <button
            type="button"
            onClick={() => void controller.start()}
            style={{
              minHeight: 46,
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid #38bdf8",
              background: "#0284c7",
              color: "#ffffff",
              fontWeight: 800,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Enable Camera & Orientation Aiming
          </button>
        )}

        {controller.status === "requesting_permissions" && (
          <div style={{ fontSize: 13, color: "#bae6fd", fontWeight: 700 }}>
            Requesting camera & device orientation permissions…
          </div>
        )}

        {controller.status === "calibrating" && (
          <div style={{ fontSize: 13, color: "#fde68a", fontWeight: 700 }}>
            Calibrating camera & compass alignment… Hold phone steady.
          </div>
        )}

        {controller.status === "ready" && (
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: controller.target ? "#6ee7b7" : "#cbd5e1",
              background: "rgba(9, 13, 22, 0.78)",
              padding: "4px 10px",
              borderRadius: 999,
            }}
          >
            {controller.target
              ? `TARGET LOCKED: MARKER #${controller.target.markerCode} (${Math.round(
                  controller.target.confidence * 100
                )}%)`
              : "CAMERA ACTIVE — AIM RETICLE AT TARGET MARKER"}
          </div>
        )}

        {controller.status === "unavailable" && unavailableInfo && (
          <div
            role="alert"
            style={{
              background: "rgba(69, 10, 10, 0.92)",
              border: "1px solid #ef4444",
              borderRadius: 12,
              padding: 12,
              color: "#fecaca",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <strong style={{ fontSize: 14 }}>{unavailableInfo.title}</strong>
            <span style={{ fontSize: 12, lineHeight: 1.4 }}>{unavailableInfo.guidance}</span>
            {unavailableInfo.canRetry && (
              <button
                type="button"
                onClick={() => void controller.start()}
                style={{
                  minHeight: 40,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid #fca5a5",
                  background: "#991b1b",
                  color: "#ffffff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Retry Camera & Sensors
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function useAiming(opts: {
  enabled: boolean;
}): AimController & { videoRef: React.RefObject<HTMLVideoElement | null> } {
  const [status, setStatus] = useState<AimController["status"]>("idle");
  const [unavailableReason, setUnavailableReason] = useState<AimUnavailableReason | undefined>(
    undefined
  );
  const [target, setTarget] = useState<{ markerCode: number; confidence: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const headingRef = useRef<{ headingDeg: number; pitchDeg: number; rollDeg: number }>({
    headingDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
  });

  const stop = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTarget(null);
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setStatus("unavailable");
      setUnavailableReason("insecure_context");
      return;
    }
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      setStatus("unavailable");
      setUnavailableReason("unsupported_browser");
      return;
    }

    setStatus("requesting_permissions");
    setUnavailableReason(undefined);

    // iOS 13+ requires DeviceOrientationEvent.requestPermission() inside a user gesture
    try {
      const DevOrient = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
      if (DevOrient && typeof DevOrient.requestPermission === "function") {
        const perm = await DevOrient.requestPermission();
        if (perm !== "granted") {
          setStatus("unavailable");
          setUnavailableReason("orientation_denied");
          return;
        }
      }
    } catch {
      setStatus("unavailable");
      setUnavailableReason("orientation_denied");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setStatus("ready");
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setUnavailableReason("no_camera");
      } else {
        setUnavailableReason("camera_denied");
      }
      setStatus("unavailable");
    }
  }, []);

  const recalibrate = useCallback(() => {
    if (status !== "ready") return;
    setStatus("calibrating");
    setTimeout(() => {
      setStatus("ready");
    }, 600);
  }, [status]);

  const captureEvidence = useCallback((): AimEvidence | null => {
    if (!target) return null;
    return {
      source: "camera",
      ageMs: 25,
      targetMarkerCode: target.markerCode,
      visibleMarkerCodes: [target.markerCode],
      markerConfidence: target.confidence,
      markerVisibleFraction: 0.95,
      markerOffsetDeg: { x: 0, y: 0 },
      markerWidthPx: 110,
      frameWidthPx: 1280,
      hfovDeg: 65,
      estimatedDistanceM: 8,
      camera: {
        headingDeg: headingRef.current.headingDeg,
        pitchDeg: headingRef.current.pitchDeg,
        rollDeg: headingRef.current.rollDeg,
        headingAccuracyDeg: 10,
        headingSource: "absolute",
      },
    };
  }, [target]);

  // Listen to deviceorientation while ready
  useEffect(() => {
    if (status !== "ready" || typeof window === "undefined") return;
    const onOrient = (ev: DeviceOrientationEvent) => {
      const webkitHeading = (ev as unknown as { webkitCompassHeading?: number })
        .webkitCompassHeading;
      const rawHeading =
        typeof webkitHeading === "number"
          ? webkitHeading
          : typeof ev.alpha === "number"
          ? (360 - ev.alpha) % 360
          : 0;
      headingRef.current = {
        headingDeg: ((rawHeading % 360) + 360) % 360,
        pitchDeg: Math.max(-90, Math.min(90, ev.beta ?? 0)),
        rollDeg: Math.max(-180, Math.min(180, ev.gamma ?? 0)),
      };
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
    };
  }, [status]);

  // Always stop all camera tracks when disabled or unmounted (PLAN.md S9.8)
  useEffect(() => {
    if (!opts.enabled) {
      stop();
    }
    return () => {
      stop();
    };
  }, [opts.enabled, stop]);

  return {
    status,
    unavailableReason,
    target,
    start,
    stop,
    recalibrate,
    captureEvidence,
    videoRef,
  };
}
