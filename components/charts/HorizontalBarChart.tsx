"use client";

// components/charts/HorizontalBarChart.tsx
//
// Ranked horizontal bar chart. Each row has a label, a progress bar,
// and a value. Bars animate on mount.
//
// Used for: department performance ranking in the report detail view.

import { useEffect, useState } from "react";

export type HorizontalBarRow = {
  label: string;
  value: number; // 0-100 (score) or raw, matched to `max`
  subtext?: string;
  color?: string; // override per-row, otherwise auto from band
};

type HorizontalBarChartProps = {
  rows: HorizontalBarRow[];
  max?: number; // default 100
  showValue?: boolean; // default true
  valueSuffix?: string;
};

function bandColor(fraction: number) {
  if (fraction < 0.45) return "#ef4444"; // red
  if (fraction < 0.7) return "#f59e0b"; // amber
  if (fraction < 0.85) return "#10b981"; // emerald
  return "#14b8a6"; // teal
}

export default function HorizontalBarChart({
  rows,
  max = 100,
  showValue = true,
  valueSuffix = "",
}: HorizontalBarChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Trigger transition on mount
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, []);

  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-[var(--foreground-muted)]">
        No data to display.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.map((row, idx) => {
        const fraction = Math.max(0, Math.min(1, row.value / max));
        const color = row.color ?? bandColor(fraction);
        const width = mounted ? `${fraction * 100}%` : "0%";

        return (
          <div key={`${row.label}-${idx}`} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[var(--foreground)]">
                  {row.label}
                </div>
                {row.subtext ? (
                  <div className="mt-0.5 truncate text-xs text-[var(--foreground-muted)]">
                    {row.subtext}
                  </div>
                ) : null}
              </div>
              {showValue ? (
                <div
                  className="shrink-0 text-lg font-bold tabular-nums"
                  style={{ color }}
                >
                  {Math.round(row.value)}
                  {valueSuffix}
                </div>
              ) : null}
            </div>

            <div className="relative h-3 overflow-hidden rounded-full bg-[var(--border)]">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-[900ms] ease-out"
                style={{
                  width,
                  backgroundColor: color,
                  boxShadow: `0 0 12px ${color}40`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
