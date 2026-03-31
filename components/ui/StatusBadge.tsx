type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";

type StatusBadgeProps = {
  children: string;
  tone?: StatusTone;
};

function classes(tone: StatusTone) {
  switch (tone) {
    case "success":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
    case "warning":
      return "border-amber-400/20 bg-amber-400/10 text-amber-200";
    case "danger":
      return "border-red-400/20 bg-red-400/10 text-red-200";
    case "info":
      return "border-sky-400/20 bg-sky-400/10 text-sky-200";
    default:
      return "border-white/12 bg-white/10 text-white/70";
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