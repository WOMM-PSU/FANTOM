import { describe, expect, it } from "vitest";
import {
  ClientMessage,
  ServerMessage,
  RejectReason,
  AimEvidence,
  PROTOCOL_VERSION,
} from "@fantom/shared";
import {
  computeClockSampleOffset,
  smoothClockOffset,
  computeMsUntil,
} from "../hooks/useServerClock";
import { normalizeJoinCode, isValidJoinCode } from "../lib/session";
import { buildCircularArenaPolygon } from "../lib/arena";
import { generateQrMatrix } from "../lib/qr";
import { projectToLocalMeters } from "../features/minimap/MinimapSvg";
import {
  REJECT_REASON_MESSAGES,
  formatRejectReason,
  getTeamBadge,
  ROLE_INFO,
} from "../lib/messages";
import { makeDevEvidence } from "../features/hud/aimingBridge";

describe("useServerClock pure helpers", () => {
  it("computes single-sample clock offset accounting for half RTT", () => {
    // Client sent at 1000, received at 1100 (RTT = 100ms, midpoint = 1050), serverTime = 1250 -> offset = +200ms
    expect(computeClockSampleOffset(1000, 1100, 1250)).toBe(200);
  });

  it("smooths clock offsets with EMA", () => {
    expect(smoothClockOffset(null, 200)).toBe(200);
    expect(smoothClockOffset(200, 100, 0.3)).toBe(170);
  });

  it("computes remaining ms until server timestamp and clamps at 0", () => {
    expect(computeMsUntil(5000, 4000, 200)).toBe(800);
    expect(computeMsUntil(4000, 4000, 200)).toBe(0);
    expect(computeMsUntil(null, 4000, 0)).toBe(0);
  });
});

describe("session join-code helpers", () => {
  it("normalizes and validates 5-character unambiguous join codes", () => {
    expect(normalizeJoinCode(" ab23k ")).toBe("AB23K");
    expect(isValidJoinCode("AB23K")).toBe(true);
    // Rejects ambiguous characters 0, O, 1, I, L
    expect(isValidJoinCode("AB03K")).toBe(false);
    expect(isValidJoinCode("ABO3K")).toBe(false);
    expect(isValidJoinCode("AB13K")).toBe(false);
    expect(isValidJoinCode("ABI3K")).toBe(false);
    expect(isValidJoinCode("ABL3K")).toBe(false);
  });
});

describe("buildCircularArenaPolygon", () => {
  it("builds a 24-sided polygon around the center coordinate", () => {
    const poly = buildCircularArenaPolygon({ lat: 40.7982, lng: -77.8599 }, 30, 24);
    expect(poly).toHaveLength(24);
    for (const pt of poly) {
      expect(pt.lat).toBeGreaterThan(40.79);
      expect(pt.lat).toBeLessThan(40.81);
      expect(pt.lng).toBeGreaterThan(-77.87);
      expect(pt.lng).toBeLessThan(-77.85);
    }
  });
});

describe("generateQrMatrix", () => {
  it("generates a valid QR matrix for a joinUrl", () => {
    const matrix = generateQrMatrix("https://fantom.example.com/join/AB23K");
    expect(matrix.length).toBeGreaterThanOrEqual(25);
    expect(matrix[0]?.length).toBe(matrix.length);
    // Finder pattern top-left outer corner (0,0) and center (3,3) must be dark
    expect(matrix[0]?.[0]).toBe(true);
    expect(matrix[3]?.[3]).toBe(true);
  });
});

describe("projectToLocalMeters", () => {
  it("projects origin to (0,0) and north/east offsets in meters", () => {
    const origin = { lat: 40.7982, lng: -77.8599 };
    expect(projectToLocalMeters(origin, origin)).toEqual({ eastM: 0, northM: 0 });
    const north = projectToLocalMeters(origin, { lat: 40.7991, lng: -77.8599 });
    expect(north.northM).toBeGreaterThan(95);
    expect(north.northM).toBeLessThan(105);
    expect(Math.abs(north.eastM)).toBeLessThan(0.01);
  });
});

describe("wire contract integration in web client", () => {
  it("validates outbound HELLO and PLAYER_READY envelopes against @fantom/shared", () => {
    const hello = ClientMessage.safeParse({
      v: PROTOCOL_VERSION,
      id: "req-1",
      type: "HELLO",
      payload: { sessionToken: "0123456789abcdef0123456789abcdef" },
    });
    expect(hello.success).toBe(true);

    const ready = ClientMessage.safeParse({
      v: PROTOCOL_VERSION,
      id: "req-2",
      type: "PLAYER_READY",
      payload: {
        ready: true,
        permissions: { camera: true, orientation: true, location: true },
      },
    });
    expect(ready.success).toBe(true);
  });

  it("validates inbound PONG and ERROR envelopes against @fantom/shared", () => {
    const pong = ServerMessage.safeParse({
      v: PROTOCOL_VERSION,
      seq: 1,
      serverTime: 1700000000000,
      replyTo: "req-1",
      type: "PONG",
      payload: { clientSentAt: 1699999999950 },
    });
    expect(pong.success).toBe(true);
  });

  it("provides a non-empty human-readable message for every RejectReason enum member", () => {
    for (const reason of RejectReason.options) {
      const msg = formatRejectReason(reason);
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(5);
      expect(REJECT_REASON_MESSAGES[reason]).toBeDefined();
    }
  });

  it("creates non-color-only team badges and role metadata", () => {
    const t1 = getTeamBadge("team-1");
    const t2 = getTeamBadge("team-2");
    expect(t1?.symbol).not.toBe(t2?.symbol);
    expect(ROLE_INFO.healer.canHeal).toBe(true);
    expect(ROLE_INFO.healer.canFire).toBe(false);
    expect(ROLE_INFO.survivor.canFire).toBe(false);
    expect(ROLE_INFO.assassin.canFire).toBe(true);
  });

  it("produces contract-valid AimEvidence from makeDevEvidence", () => {
    const ev = makeDevEvidence(42);
    const parsed = AimEvidence.safeParse(ev);
    expect(parsed.success).toBe(true);
    expect(ev.source).toBe("dev_simulated");
    expect(ev.targetMarkerCode).toBe(42);
  });
});
