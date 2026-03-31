import type { ReactNode } from "react";

type SectionCardProps = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
};

function SectionCard({
  title,
  subtitle,
  children,
  actions,
  className = "",
}: SectionCardProps) {
  return (
    <section
      className={`rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[var(--app-shadow)] md:p-6 ${className}`}
    >
      {(title || subtitle || actions) && (
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            {title ? <h2 className="text-lg font-bold text-white">{title}</h2> : null}
            {subtitle ? <p className="mt-1 text-sm text-white/50">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      )}

      {children}
    </section>
  );
}

export { SectionCard };
export default SectionCard;