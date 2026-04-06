import type { ReactNode } from "react";

type Tone = "default" | "success" | "warning" | "danger" | "info";

type StatCardProps = {
  title: string;
  value: ReactNode;
  hint?: string;
  trend?: string;
  tone?: Tone;
};

function toneClasses(tone: Tone) {
  switch (tone) {
    case "success":
      return "border-emerald-500/20 bg-[linear-gradient(180deg,rgba(34,197,94,0.10),rgba(34,197,94,0.04))]";
    case "warning":
      return "border-amber-500/20 bg-[linear-gradient(180deg,rgba(245,158,11,0.10),rgba(245,158,11,0.04))]";
    case "danger":
      return "border-red-500/20 bg-[linear-gradient(180deg,rgba(239,68,68,0.10),rgba(239,68,68,0.04))]";
    case "info":
      return "border-sky-500/20 bg-[linear-gradient(180deg,rgba(56,189,248,0.10),rgba(56,189,248,0.04))]";
    default:
      return "border-[var(--border)] bg-[var(--card)]";
  }
}

function StatCard({
  title,
  value,
  hint,
  trend,
  tone = "default",
}: StatCardProps) {
  return (
    <div className={`rounded-[24px] border p-4 md:p-5 ${toneClasses(tone)} alamin-shadow`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground-faint)]">
        {title}
      </div>

      <div className="mt-3 text-3xl font-black tracking-[-0.03em] text-[var(--foreground)]">
        {value}
      </div>

      {hint ? <div className="mt-2 text-sm text-[var(--foreground-muted)]">{hint}</div> : null}
      {trend ? (
        <div className="mt-3 text-xs font-medium text-[var(--foreground-faint)]">{trend}</div>
      ) : null}
    </div>
  );
}

export { StatCard };
export default StatCard;