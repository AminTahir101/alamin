"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type AppShellProps = {
  slug: string;
  sessionEmail?: string | null;
  topActions?: React.ReactNode;
  children: React.ReactNode;
};

type AppPageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
};

type NavItem = {
  label: string;
  href: string;
  soon?: boolean;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function AppPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: AppPageHeaderProps) {
  return (
    <div className="mb-6 border-b border-white/8 pb-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          {eyebrow ? (
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">
              {eyebrow}
            </div>
          ) : null}

          <h1 className="text-5xl font-black tracking-[-0.04em] text-white">{title}</h1>

          {description ? (
            <p className="mt-3 max-w-4xl text-lg leading-8 text-white/55">{description}</p>
          ) : null}
        </div>

        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </div>
  );
}

export function AppShell({ slug, sessionEmail, topActions, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const navItems = useMemo<NavItem[]>(
    () => [
      { label: "Dashboard", href: `/o/${slug}/dashboard` },
      { label: "Your AI", href: `/o/${slug}/your-ai` },
      { label: "Objectives", href: `/o/${slug}/objectives` },
      { label: "OKRs", href: `/o/${slug}/okrs` },
      { label: "KPIs", href: `/o/${slug}/kpis` },
      { label: "Tasks", href: `/o/${slug}/tasks` },
      { label: "Reports", href: `/o/${slug}/reports` },
      { label: "My Work", href: `/o/${slug}/my-work` },
      { label: "Departments", href: `/o/${slug}/departments` },
      { label: "Trends", href: `/o/${slug}/trends` },
      { label: "Onboarding", href: `/o/${slug}/onboarding` },
      { label: "Settings", href: `/o/${slug}/settings` },
    ],
    [slug]
  );

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/auth");
  };

  const initial = String(sessionEmail ?? "A").trim().slice(0, 1).toUpperCase();

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto flex min-h-screen w-full">
        <aside className="sticky top-0 flex min-h-screen w-72.5 shrink-0 flex-col border-r border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_34%),#050505] px-4 py-5">
          <Link href={`/o/${slug}/dashboard`} className="mb-8 flex items-center gap-3 px-2">
            <span className="h-3 w-3 rounded-full bg-white/90" />
            <span className="text-[20px] font-black tracking-[-0.02em] text-white">ALAMIN</span>
          </Link>

          <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
              Organization
            </div>
            <div className="mt-3 text-2xl font-bold text-white">{slug}</div>
            <div className="mt-2 truncate text-sm text-white/40">
              {sessionEmail ?? "workspace@company.com"}
            </div>
          </div>

          <div className="mt-5">
            <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
              Workspace
            </div>

            <nav className="mt-3 space-y-2">
              {navItems.map((item) => {
                const active = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center justify-between rounded-[18px] px-4 py-3 text-[15px] transition",
                      active
                        ? "border border-white/12 bg-white/12 text-white"
                        : "border border-transparent text-white/72 hover:border-white/8 hover:bg-white/6 hover:text-white"
                    )}
                  >
                    <span>{item.label}</span>
                    {active ? <span className="h-2.5 w-2.5 rounded-full bg-white/90" /> : null}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="mt-auto pt-6">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-[18px] border border-white/10 bg-white/5 px-3 py-3 text-left transition hover:bg-white/8"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/30 text-sm font-bold text-white">
                {initial}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">
                  {sessionEmail ?? "Account"}
                </div>
                <div className="text-xs text-white/40">Sign out</div>
              </div>
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.04),transparent_28%),#050505]">
          <div className="px-7 py-6 xl:px-8">
            <div className="mb-6 flex flex-col gap-4 border-b border-white/8 pb-6 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
                  Performance workspace
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-white/70">
                  <span>/o/{slug}</span>
                  <span>•</span>
                  <span className="truncate">{sessionEmail ?? "workspace member"}</span>
                </div>
              </div>

              {topActions ? <div className="shrink-0">{topActions}</div> : null}
            </div>

            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
