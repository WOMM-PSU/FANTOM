"use client";

/**
 * Seam B <-> C Adapter (PLAN.md P5.3).
 * Lives inside `features/hud/` (owned by Dev B) so we never edit `features/aiming/**` (owned by Dev C).
 * Once Dev C merges `apps/web/features/aiming/index.ts`, re-export from `@/features/aiming`.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { AimEvidence, LatLng } from "@fantom/shared";
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

const EARTH_RADIUS_M = 6_371_008.8;

function computeGpsBearingAndDistance(
  from: LatLng,
  to: LatLng
): { headingDeg: number; distanceM: number } | null {
  if (
    !Number.isFinite(from.lat) ||
    !Number.isFinite(from.lng) ||
    !Number.isFinite(to.lat) ||
    !Number.isFinite(to.lng)
  ) {
    return null;
  }
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = Math.min(
    1,
    Math.max(0, sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng)
  );
  const distanceM = 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
  if (!Number.isFinite(distanceM) || distanceM <= 0.001) {
    return null;
  }

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const headingDeg = ((toDeg(Math.atan2(y, x)) % 360) + 360) % 360;
  return { headingDeg, distanceM };
}

export function buildFantomMarkerChecksum(code: number): string {
  const clamped = Math.max(0, Math.min(255, Math.floor(code)));
  return ((clamped * 37 + 11) & 0xff).toString(16).padStart(2, "0");
}

export function buildFantomMarkerPayload(code: number): string {
  const clamped = Math.max(0, Math.min(255, Math.floor(code)));
  return `FANTOM:1:${clamped}:${buildFantomMarkerChecksum(clamped)}`;
}

export function parseFantomMarkerPayload(rawValue: string): {
  valid: boolean;
  code: number | null;
  reason: string | null;
} {
  const match = /^FANTOM:1:(\d{1,3}):([0-9a-f]{2})$/i.exec((rawValue ?? "").trim());
  if (!match || !match[1] || !match[2]) {
    return { valid: false, code: null, reason: "not a FANTOM marker payload" };
  }
  const code = Number(match[1]);
  if (!Number.isInteger(code) || code < 0 || code > 255) {
    return { valid: false, code: null, reason: "marker code outside 0-255" };
  }
  const expected = buildFantomMarkerChecksum(code);
  if (match[2].toLowerCase() !== expected) {
    return { valid: false, code: null, reason: "marker checksum mismatch" };
  }
  return { valid: true, code, reason: null };
}

/**
 * DEV_ONLY — builds simulated evidence; usable only when config.devMode === true (PLAN.md P5.3).
 * When `shooterPos` and `targetPos` are supplied, populates `camera.headingDeg` and
 * `estimatedDistanceM` with the true GPS bearing and distance so `evaluateAim` agreement checks pass.
 */
export function makeDevEvidence(
  targetMarkerCode: number,
  shooterPos?: LatLng | null,
  targetPos?: LatLng | null
): AimEvidence {
  const clampedCode = Math.max(0, Math.min(255, Math.floor(targetMarkerCode)));
  const geo =
    shooterPos && targetPos ? computeGpsBearingAndDistance(shooterPos, targetPos) : null;

  return {
    source: "dev_simulated",
    ageMs: 15,
    targetMarkerCode: clampedCode,
    visibleMarkerCodes: [clampedCode],
    markerConfidence: 0.96,
    markerVisibleFraction: 1,
    markerOffsetDeg: { x: 0, y: 0 },
    markerWidthPx: 140,
    frameWidthPx: 1280,
    hfovDeg: 65,
    estimatedDistanceM: geo ? Math.max(0.5, Math.min(29, Number(geo.distanceM.toFixed(2)))) : 8,
    camera: {
      headingDeg: geo ? Number(geo.headingDeg.toFixed(2)) : 0,
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
  const lastObservationRef = useRef<{
    targetMarkerCode: number;
    visibleMarkerCodes: number[];
    confidence: number;
    markerOffsetDeg: { x: number; y: number };
    markerWidthPx: number;
    frameWidthPx: number;
    hfovDeg: number;
    estimatedDistanceM: number | null;
    observedAtMs: number;
  } | null>(null);

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
    const obs = lastObservationRef.current;
    const ageMs = obs ? Math.max(1, Math.round(performance.now() - obs.observedAtMs)) : 25;
    return {
      source: "camera",
      ageMs,
      targetMarkerCode: target.markerCode,
      visibleMarkerCodes: obs?.visibleMarkerCodes ?? [target.markerCode],
      markerConfidence: target.confidence,
      markerVisibleFraction: 0.95,
      markerOffsetDeg: obs?.markerOffsetDeg ?? { x: 0, y: 0 },
      markerWidthPx: obs?.markerWidthPx ?? 110,
      frameWidthPx: obs?.frameWidthPx ?? 1280,
      hfovDeg: obs?.hfovDeg ?? 60,
      estimatedDistanceM: obs ? obs.estimatedDistanceM : 8,
      camera: {
        headingDeg: headingRef.current.headingDeg,
        pitchDeg: headingRef.current.pitchDeg,
        rollDeg: headingRef.current.rollDeg,
        headingAccuracyDeg: 10,
        headingSource: "absolute",
      },
    };
  }, [target]);

  // Run native BarcodeDetector (when supported) at 10 Hz while camera is ready
  useEffect(() => {
    if (status !== "ready" || typeof window === "undefined") return;
    const BarcodeDetectorCtor = (
      window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => {
          detect(source: HTMLVideoElement): Promise<
            Array<{
              rawValue?: string;
              boundingBox?: { x: number; y: number; width: number; height: number };
            }>
          >;
        };
      }
    ).BarcodeDetector;

    if (!BarcodeDetectorCtor) return;
    let detector: InstanceType<typeof BarcodeDetectorCtor> | null = null;
    try {
      detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });
    } catch {
      return;
    }

    let cancelled = false;
    const timer = setInterval(() => {
      const video = videoRef.current;
      if (cancelled || !detector || !video || !video.videoWidth || !video.videoHeight) return;
      void detector
        .detect(video)
        .then((rawList) => {
          if (cancelled) return;
          const validCodes: number[] = [];
          let primaryBox: { x: number; y: number; width: number; height: number } | undefined;
          let primaryCode: number | null = null;

          for (const item of rawList) {
            const parsed = parseFantomMarkerPayload(item.rawValue ?? "");
            if (parsed.valid && parsed.code !== null) {
              validCodes.push(parsed.code);
              if (primaryCode === null) {
                primaryCode = parsed.code;
                primaryBox = item.boundingBox;
              }
            }
          }

          if (primaryCode !== null) {
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            const hfovDeg = 60;
            const vfovDeg =
              (2 * Math.atan(Math.tan((hfovDeg * Math.PI) / 360) * (vh / vw)) * 180) / Math.PI;
            const focalPx = vw / 2 / Math.tan((hfovDeg * Math.PI) / 360);
            const bw = primaryBox?.width ?? 110;
            const bh = primaryBox?.height ?? 110;
            const cx = (primaryBox?.x ?? vw / 2 - bw / 2) + bw / 2;
            const cy = (primaryBox?.y ?? vh / 2 - bh / 2) + bh / 2;
            const offsetX = ((cx - vw / 2) / vw) * hfovDeg;
            const offsetY = ((vh / 2 - cy) / vh) * vfovDeg;
            const estDist = bw > 0 ? (focalPx * 0.065) / bw : null;

            lastObservationRef.current = {
              targetMarkerCode: primaryCode,
              visibleMarkerCodes: validCodes,
              confidence: 0.9,
              markerOffsetDeg: {
                x: Number(offsetX.toFixed(2)),
                y: Number(offsetY.toFixed(2)),
              },
              markerWidthPx: Math.max(1, Math.round(bw)),
              frameWidthPx: vw,
              hfovDeg,
              estimatedDistanceM:
                estDist !== null && Number.isFinite(estDist)
                  ? Number(estDist.toFixed(2))
                  : null,
              observedAtMs: performance.now(),
            };
            setTarget({ markerCode: primaryCode, confidence: 0.9 });
          } else if (
            lastObservationRef.current &&
            performance.now() - lastObservationRef.current.observedAtMs > 500
          ) {
            lastObservationRef.current = null;
            setTarget(null);
          }
        })
        .catch(() => {
          // Ignore transient frame detection errors
        });
    }, 100);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [status]);

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
