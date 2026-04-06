type ProgressBarProps = {
  value: number;
};

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function barColor(value: number) {
  if (value >= 85) return "bg-emerald-500";
  if (value >= 60) return "bg-amber-500";
  return "bg-red-500";
}

function ProgressBar({ value }: ProgressBarProps) {
  const pct = clamp(value);

  return (
    <div className="w-full">
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--card-subtle)]">
        <div
          className={`h-full rounded-full transition-all ${barColor(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 text-xs font-medium text-[var(--foreground-faint)]">
        {pct.toFixed(0)}%
      </div>
    </div>
  );
}

export { ProgressBar };
export default ProgressBar;