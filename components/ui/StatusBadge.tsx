type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";

type StatusBadgeProps = {
  children: string;
  tone?: StatusTone;
};

function classes(tone: StatusTone) {
  switch (tone) {
    case "success":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200";
    case "warning":
      return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-200";
    case "danger":
      return "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-200";
    case "info":
      return "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-200";
    default:
      return "border-[var(--border)] bg-[var(--button-secondary-bg)] text-[var(--foreground-soft)]";
  }
}

function StatusBadge({
  children,
  tone = "neutral",
}: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${classes(
        tone
      )}`}
    >
      {children}
    </span>
  );
}

export { StatusBadge };
export default StatusBadge;