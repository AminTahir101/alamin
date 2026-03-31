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
      return "border-emerald-400/20 bg-emerald-400/10";
    case "warning":
      return "border-amber-400/20 bg-amber-400/10";
    case "danger":
      return "border-red-400/20 bg-red-400/10";
    case "info":
      return "border-sky-400/20 bg-sky-400/10";
    default:
      return "border-white/10 bg-white/5";
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
    <div className={`rounded-[20px] border p-4 md:p-5 ${toneClasses(tone)}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/42">
        {title}
      </div>

      <div className="mt-3 text-3xl font-black tracking-[-0.03em] text-white">
        {value}
      </div>

      {hint ? <div className="mt-2 text-sm text-white/58">{hint}</div> : null}
      {trend ? <div className="mt-3 text-xs font-medium text-white/42">{trend}</div> : null}
    </div>
  );
}

export { StatCard };
export default StatCard;