"use client";

// components/charts/DonutChart.tsx
//
// Donut/pie chart with segments, center label, and legend below.
// Pure SVG. Theme-aware.

import { useEffect, useState } from "react";

export type DonutSegment = {
  label: string;
  value: number;
  color: string;
};

type DonutChartProps = {
  segments: DonutSegment[];
  size?: number;
  centerLabel?: string;
  centerSublabel?: string;
};

function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= Math.PI ? "0" : "1";
  return [
    "M",
    start.x,
    start.y,
    "A",
    radius,
    radius,
    0,
    largeArcFlag,
    0,
    end.x,
    end.y,
  ].join(" ");
}

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleRadians: number,
) {
  return {
    x: cx + radius * Math.cos(angleRadians),
    y: cy + radius * Math.sin(angleRadians),
  };
}

export default function DonutChart({
  segments,
  size = 240,
  centerLabel,
  centerSublabel,
}: DonutChartProps) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, []);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={size * 0.38}
            fill="none"
            stroke="var(--border)"
            strokeWidth={size * 0.12}
          />
          <text
            x={size / 2}
            y={size / 2 + 6}
            textAnchor="middle"
            fontSize={size * 0.08}
            fill="var(--foreground-muted)"
            style={{ fontFamily: "inherit" }}
          >
            No data
          </text>
        </svg>
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.38;
  const strokeWidth = size * 0.12;

  // Build segments starting at top (angle = -π/2)
  let currentAngle = -Math.PI / 2;
  const arcs = segments.map((segment) => {
    const fraction = Math.max(0, segment.value) / total;
    const angleDelta = fraction * Math.PI * 2;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angleDelta;
    currentAngle = endAngle;

    // For a full 100% single segment, describe with two halves since SVG
    // can't draw a 360° arc with a single command.
    const isFullCircle = fraction >= 0.999;
    const path = isFullCircle
      ? `M ${cx + radius} ${cy} A ${radius} ${radius} 0 1 0 ${cx - radius} ${cy} A ${radius} ${radius} 0 1 0 ${cx + radius} ${cy}`
      : describeArc(cx, cy, radius, startAngle, endAngle);

    return {
      ...segment,
      fraction,
      path,
    };
  });

  const totalLength = 2 * Math.PI * radius;

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ overflow: "visible" }}
      >
        {/* Background ring */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
          opacity={0.4}
        />

        {/* Segments */}
        {arcs.map((arc, i) => {
          const dashLength = arc.fraction * totalLength;
          return (
            <path
              key={`${arc.label}-${i}`}
              d={arc.path}
              fill="none"
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
              strokeDasharray={mounted ? `${dashLength} ${totalLength}` : `0 ${totalLength}`}
              style={{
                transition: "stroke-dasharray 900ms cubic-bezier(0.33, 1, 0.68, 1)",
                filter: `drop-shadow(0 0 8px ${arc.color}30)`,
              }}
            />
          );
        })}

        {/* Center text */}
        {centerLabel ? (
          <>
            <text
              x={cx}
              y={cy + (centerSublabel ? -4 : 8)}
              textAnchor="middle"
              fontSize={size * 0.18}
              fontWeight={800}
              fill="var(--foreground)"
              style={{ fontFamily: "inherit" }}
            >
              {centerLabel}
            </text>
            {centerSublabel ? (
              <text
                x={cx}
                y={cy + size * 0.1}
                textAnchor="middle"
                fontSize={size * 0.055}
                fontWeight={600}
                fill="var(--foreground-muted)"
                style={{
                  fontFamily: "inherit",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {centerSublabel}
              </text>
            ) : null}
          </>
        ) : null}
      </svg>

      {/* Legend */}
      <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2">
        {segments.map((s, i) => {
          const fraction = total > 0 ? s.value / total : 0;
          return (
            <div key={`${s.label}-${i}`} className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-soft)]">
                {s.label}
              </span>
              <span className="text-xs font-bold tabular-nums text-[var(--foreground)]">
                {s.value}
              </span>
              <span className="text-xs text-[var(--foreground-muted)]">
                ({Math.round(fraction * 100)}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
