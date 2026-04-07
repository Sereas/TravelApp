"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * TripGradient — unique topographic contour lines for each trip.
 * Seeded by trip name. Subtle, decorative, map-aesthetic.
 */

const LINE_PALETTES = [
  ["#8aaa92", "#a0c0aa", "#b8d4c4"], // sage
  ["#7a9ab0", "#92b0c6", "#aac4d6"], // dusty blue
  ["#aa8a7a", "#c0a494", "#d4baaa"], // clay
  ["#8a9a80", "#a0b098", "#b4c4ae"], // moss
  ["#9a8aaa", "#b0a0be", "#c4b8d0"], // lavender
  ["#7a9494", "#94aeae", "#aac4c4"], // teal
  ["#aa9a7a", "#c0b094", "#d4c8ae"], // sand
  ["#8888a0", "#a0a0b6", "#b8b8cc"], // slate
];

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function derive(hash: number, salt: number, min: number, max: number): number {
  const mixed = Math.abs((hash * (salt + 1) * 2654435761) | 0);
  return min + (mixed % (max - min + 1));
}

function generateContourPaths(
  name: string,
  viewW: number,
  viewH: number
): { d: string; color: string; strokeWidth: number; opacity: number }[] {
  const hash = djb2(name || "trip");
  const paletteIdx = derive(hash, 1, 0, LINE_PALETTES.length - 1);
  const palette = LINE_PALETTES[paletteIdx];

  // Offset center — not dead center, more organic
  const peakX = derive(
    hash,
    2,
    Math.round(viewW * 0.2),
    Math.round(viewW * 0.8)
  );
  const peakY = derive(
    hash,
    3,
    Math.round(viewH * 0.15),
    Math.round(viewH * 0.85)
  );

  // Fewer rings, more spread
  const ringCount = derive(hash, 4, 4, 6);
  const rotDeg = derive(hash, 5, 0, 360);

  // Elongation factor — how elliptical (1.3-2.2 ratio)
  const elongation = derive(hash, 6, 130, 220) / 100;

  const paths: {
    d: string;
    color: string;
    strokeWidth: number;
    opacity: number;
  }[] = [];

  for (let ring = 1; ring <= ringCount; ring++) {
    const t = ring / ringCount;
    // Spread rings wider apart — inner ones small, outer ones large
    const baseR = t * t * viewW * 0.7 + 15;
    const radiusX = baseR * elongation;
    const radiusY = baseR / elongation;

    // 12 control points for smoother curves
    const segments = 12;
    const points: { x: number; y: number }[] = [];
    for (let s = 0; s < segments; s++) {
      const angle = (s / segments) * Math.PI * 2;
      // Gentler deformation — 92% to 108%
      const deform = derive(hash, ring * 30 + s, 92, 108) / 100;
      points.push({
        x: peakX + Math.cos(angle) * radiusX * deform,
        y: peakY + Math.sin(angle) * radiusY * deform,
      });
    }

    // Catmull-Rom spline → cubic bezier
    let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let s = 0; s < segments; s++) {
      const prev = points[(s - 1 + segments) % segments];
      const curr = points[s];
      const next = points[(s + 1) % segments];
      const nextNext = points[(s + 2) % segments];
      const tension = 0.25;
      d += ` C ${(curr.x + (next.x - prev.x) * tension).toFixed(1)} ${(curr.y + (next.y - prev.y) * tension).toFixed(1)}, ${(next.x - (nextNext.x - curr.x) * tension).toFixed(1)} ${(next.y - (nextNext.y - curr.y) * tension).toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`;
    }
    d += " Z";

    const colorIdx = Math.min(
      Math.floor(t * palette.length),
      palette.length - 1
    );
    // Inner rings slightly more visible, outer ones fade
    const opacity = 0.2 + (1 - t) * 0.25;

    paths.push({ d, color: palette[colorIdx], strokeWidth: 0.7, opacity });
  }

  return paths;
}

export function generateTripBackground(name: string): string {
  return generateContourPaths(name, 400, 250)
    .map((p) => p.d)
    .join(" | ");
}

export interface TripGradientProps {
  name: string;
  className?: string;
}

export function TripGradient({ name, className }: TripGradientProps) {
  const viewW = 400;
  const viewH = 250;

  const { paths, rotDeg, peakX, peakY } = useMemo(() => {
    const hash = djb2(name || "trip");
    const p = generateContourPaths(name, viewW, viewH);
    return {
      paths: p,
      rotDeg: derive(hash, 5, 0, 360),
      peakX: derive(hash, 2, Math.round(viewW * 0.2), Math.round(viewW * 0.8)),
      peakY: derive(
        hash,
        3,
        Math.round(viewH * 0.15),
        Math.round(viewH * 0.85)
      ),
    };
  }, [name]);

  return (
    <div
      className={cn("overflow-hidden bg-card", className)}
      aria-hidden="true"
      data-gradient={`topo-${name}`}
    >
      <svg
        viewBox={`0 0 ${viewW} ${viewH}`}
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full animate-[topoFloat_25s_ease-in-out_infinite] motion-reduce:animate-none"
      >
        <g transform={`rotate(${rotDeg} ${peakX} ${peakY})`}>
          {paths.map((path, i) => (
            <path
              key={i}
              d={path.d}
              fill="none"
              stroke={path.color}
              strokeWidth={path.strokeWidth}
              opacity={path.opacity}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
