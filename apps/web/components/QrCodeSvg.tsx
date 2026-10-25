"use client";

import React, { useMemo } from "react";
import { generateQrMatrix } from "@/lib/qr";

export type QrCodeSvgProps = {
  value: string;
  sizePx?: number;
  label?: string;
};

export function QrCodeSvg({ value, sizePx = 180, label = "Join match QR code" }: QrCodeSvgProps) {
  const matrix = useMemo(() => {
    try {
      return generateQrMatrix(value);
    } catch {
      return null;
    }
  }, [value]);

  if (!matrix) {
    return (
      <div role="alert" style={{ padding: 12, fontSize: 13, color: "#fca5a5" }}>
        Unable to generate QR for URL. Use join code directly.
      </div>
    );
  }

  const quietZone = 4;
  const gridSize = matrix.length + quietZone * 2;

  return (
    <svg
      width={sizePx}
      height={sizePx}
      viewBox={`0 0 ${gridSize} ${gridSize}`}
      role="img"
      aria-label={label}
      style={{
        background: "#ffffff",
        borderRadius: 12,
        display: "block",
        shapeRendering: "crispEdges",
      }}
    >
      <rect width={gridSize} height={gridSize} fill="#ffffff" />
      {matrix.map((row, r) =>
        row.map((dark, c) =>
          dark ? (
            <rect
              key={`${r}-${c}`}
              x={c + quietZone}
              y={r + quietZone}
              width={1}
              height={1}
              fill="#090d16"
            />
          ) : null
        )
      )}
    </svg>
  );
}
