"use client";

import React from "react";
import type { LatLng, MatchState } from "@fantom/shared";

const EARTH_RADIUS_M = 6_371_000;

/**
 * Projects a LatLng relative to an origin into local East/North meters (PLAN.md P5.2 / dev-b-client.md).
 */
export function projectToLocalMeters(
  origin: LatLng,
  point: LatLng
): { eastM: number; northM: number } {
  const latRad = (origin.lat * Math.PI) / 180;
  const dLatRad = ((point.lat - origin.lat) * Math.PI) / 180;
  const dLngRad = ((point.lng - origin.lng) * Math.PI) / 180;
  return {
    eastM: dLngRad * EARTH_RADIUS_M * Math.cos(latRad),
    northM: dLatRad * EARTH_RADIUS_M,
  };
}

export type MinimapSvgProps = {
  state: MatchState;
  sizePx?: number;
};

export function MinimapSvg({ state, sizePx = 150 }: MinimapSvgProps) {
  if (!state.config.minimap.enabled) {
    return null;
  }

  const selfPlayer = state.players.find((p) => p.id === state.self.playerId);
  const polygon = state.config.arena?.polygon ?? [];

  // Choose local-meters origin: arena centroid if available, else self position, else first visible player
  const origin: LatLng | null =
    polygon.length > 0
      ? {
          lat: polygon.reduce((acc, p) => acc + p.lat, 0) / polygon.length,
          lng: polygon.reduce((acc, p) => acc + p.lng, 0) / polygon.length,
        }
      : selfPlayer?.position ?? state.players.find((p) => p.position !== null)?.position ?? null;

  if (!origin) {
    return (
      <div
        style={{
          width: sizePx,
          height: sizePx,
          borderRadius: 12,
          background: "rgba(15, 23, 42, 0.85)",
          border: "1px solid #334155",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          color: "#94a3b8",
          textAlign: "center",
          padding: 8,
        }}
      >
        Waiting for GPS / Arena
      </div>
    );
  }

  const localPoly = polygon.map((pt) => projectToLocalMeters(origin, pt));
  const maxCoordM = Math.max(
    25,
    ...localPoly.map((p) => Math.max(Math.abs(p.eastM), Math.abs(p.northM)))
  );
  const halfExtentM = maxCoordM * 1.2;

  const polyPointsAttr = localPoly
    .map((p) => `${p.eastM.toFixed(2)},${(-p.northM).toFixed(2)}`)
    .join(" ");

  return (
    <svg
      width={sizePx}
      height={sizePx}
      viewBox={`${-halfExtentM} ${-halfExtentM} ${halfExtentM * 2} ${halfExtentM * 2}`}
      aria-label="Arena minimap"
      style={{
        background: "rgba(9, 13, 22, 0.88)",
        border: "1px solid #38bdf8",
        borderRadius: 12,
        display: "block",
      }}
    >
      {/* Arena polygon */}
      {localPoly.length >= 3 && (
        <polygon
          points={polyPointsAttr}
          fill="rgba(56, 189, 248, 0.08)"
          stroke="#38bdf8"
          strokeWidth={halfExtentM * 0.025}
        />
      )}

      {/* Server-provided pickups */}
      {state.pickups
        .filter((pk) => pk.available)
        .map((pk) => {
          const { eastM, northM } = projectToLocalMeters(origin, pk.position);
          const r = halfExtentM * 0.045;
          return (
            <rect
              key={pk.id}
              x={eastM - r}
              y={-northM - r}
              width={r * 2}
              height={r * 2}
              fill={pk.kind === "weapon" ? "#f59e0b" : pk.kind === "shield" ? "#38bdf8" : "#10b981"}
            />
          );
        })}

      {/* Server-permitted player positions only (never fabricated) */}
      {state.players.map((p) => {
        if (!p.position) return null;
        const { eastM, northM } = projectToLocalMeters(origin, p.position);
        const isSelf = p.id === state.self.playerId;
        const isAlly = selfPlayer?.teamId !== null && selfPlayer?.teamId === p.teamId;
        const fill = isSelf ? "#38bdf8" : isAlly ? "#10b981" : "#f43f5e";
        return (
          <g key={p.id} transform={`translate(${eastM}, ${-northM})`}>
            <circle
              r={isSelf ? halfExtentM * 0.065 : halfExtentM * 0.055}
              fill={fill}
              stroke="#090d16"
              strokeWidth={halfExtentM * 0.015}
            />
          </g>
        );
      })}
    </svg>
  );
}
