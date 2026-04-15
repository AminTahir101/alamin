"use client";

// components/charts/RadialGaugeChart.tsx
//
// Semi-circle radial gauge for displaying a 0-100 score.
// Pure SVG, no dependencies. Theme-aware via CSS variables.
//
// Geometry is locked to a 200x130 viewBox so nothing can overflow the
// container, regardless of the rendered size. Text and arcs all fit.

import { useEffect, useState } from "react";

type RadialGaugeChartProps = {
  value: number; // 0-100
  label?: string;
  sublabel?: string;
  size?: number; // pixels (width)
};

function bandColor(value: number) {
  if (value < 45) return "#ef4444"; // red-500
  if (value < 70) return "#f59e0b"; // amber-500
  if (value < 85) return "#10b981"; // emerald-500
  return "#14b8a6"; // teal-500 (exceptional)
}

function bandLabel(value: number) {
  if (value < 45) return "Critical";
  if (value < 70) return "At risk";
  if (value < 85) return "On track";
  return "Strong";
}

export default function RadialGaugeChart({
  value,
  label,
  sublabel,
  size = 280,
}: RadialGaugeChartProps) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  const color = bandColor(safe);
  const autoLabel = bandLabel(safe);

  // Animate the value on mount for a nice reveal.
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const duration = 900;
    const from = 0;
    const to = safe;
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplayed(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [safe]);

  // Fixed viewBox. Everything below lives inside 200x130 units.
  const VB_WIDTH = 200;
  const VB_HEIGHT = 130;
  const cx = 100;
  const cy = 100;
  const r = 78;
  const strokeWidth = 18;

  const startAngle = Math.PI; // left point
  const endAngle = 0; // right point
  const fillFraction = displayed / 100;
  const currentAngle = startAngle - fillFraction * Math.PI;

  function polarToCartesian(angle: number) {
    return {
      x: cx + r * Math.cos(angle),
      y: cy - r * Math.sin(angle),
    };
  }

  const startPoint = polarToCartesian(startAngle);
  const endPoint = polarToCartesian(endAngle);
  const currentPoint = polarToCartesian(currentAngle);

  // Background arc — full semi-circle
  const bgPath = [
    `M ${startPoint.x} ${startPoint.y}`,
    `A ${r} ${r} 0 0 1 ${endPoint.x} ${endPoint.y}`,
  ].join(" ");

  // Foreground arc — partial fill. largeArcFlag is always 0 for ≤180°.
  const fgPath = [
    `M ${startPoint.x} ${startPoint.y}`,
    `A ${r} ${r} 0 0 1 ${currentPoint.x} ${currentPoint.y}`,
  ].join(" ");

  const height = Math.round((size * VB_HEIGHT) / VB_WIDTH);

  return (
    <div
      className="relative flex flex-col items-center"
      style={{ width: size }}
    >
      <svg
        width={size}
        height={height}
        viewBox={`0 0 ${VB_WIDTH} ${VB_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        aria-label={`Score ${safe} out of 100`}
      >
        {/* Background arc — muted */}
        <path
          d={bgPath}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Foreground arc — colored */}
        {fillFraction > 0.005 && (
          <path
            d={fgPath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}

        {/* Tick marks every 25% */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const angle = startAngle - frac * Math.PI;
          const inner = {
            x: cx + (r - strokeWidth / 2 - 5) * Math.cos(angle),
            y: cy - (r - strokeWidth / 2 - 5) * Math.sin(angle),
          };
          const outer = {
            x: cx + (r - strokeWidth / 2 - 10) * Math.cos(angle),
            y: cy - (r - strokeWidth / 2 - 10) * Math.sin(angle),
          };
          return (
            <line
              key={frac}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="var(--foreground-faint)"
              strokeWidth={1}
              opacity={0.5}
            />
          );
        })}

        {/* Center value */}
        <text
          x={cx}
          y={95}
          textAnchor="middle"
          fontSize={38}
          fontWeight={800}
          fill="var(--foreground)"
          style={{ fontFamily: "inherit" }}
        >
          {Math.round(displayed)}
        </text>

        {/* Band label */}
        <text
          x={cx}
          y={118}
          textAnchor="middle"
          fontSize={10}
          fontWeight={700}
          fill={color}
          style={{
            fontFamily: "inherit",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          {label ?? autoLabel}
        </text>
      </svg>

      {sublabel ? (
        <div
          className="mt-3 text-center text-sm text-[var(--foreground-muted)]"
          style={{ maxWidth: size }}
        >
          {sublabel}
        </div>
      ) : null}
    </div>
  );
}
