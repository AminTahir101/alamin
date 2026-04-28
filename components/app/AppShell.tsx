"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";

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
  icon: React.ReactNode;
};

type NavGroup = {
  label: string;
  items: NavItem[];
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
    <div className="mb-8 border-b border-[var(--border)] pb-7">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          {eyebrow ? (
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--foreground-faint)]">
              {eyebrow}
            </div>
          ) : null}

          <h1 className="text-5xl font-black tracking-[-0.04em] text-[var(--foreground)]">
            {title}
          </h1>

          {description ? (
            <p className="mt-3 max-w-4xl text-lg leading-8 text-[var(--foreground-muted)]">
              {description}
            </p>
          ) : null}
        </div>

        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </div>
  );
}

export function AppShell({
  slug,
  sessionEmail,
  topActions,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const as = t.appShell;

  const navGroups = useMemo<NavGroup[]>(
    () => [
      {
        label: as.nav.groupPerformance,
        items: [
          { label: as.nav.dashboard, href: `/o/${slug}/dashboard`, icon: <DashboardIcon /> },
          { label: as.nav.kpis, href: `/o/${slug}/kpis`, icon: <ChartIcon /> },
          { label: as.nav.objectives, href: `/o/${slug}/objectives`, icon: <TargetIcon /> },
          { label: as.nav.okrs, href: `/o/${slug}/okrs`, icon: <LayersIcon /> },
        ],
      },
      {
        label: as.nav.groupExecution,
        items: [
          { label: as.nav.tasks, href: `/o/${slug}/tasks`, icon: <TaskIcon /> },
          { label: as.nav.myWork, href: `/o/${slug}/my-work`, icon: <UserWorkIcon /> },
          { label: as.nav.reports, href: `/o/${slug}/reports`, icon: <ReportIcon /> },
          { label: as.nav.yourAI, href: `/o/${slug}/your-ai`, icon: <AiIcon /> },
        ],
      },
      {
        label: as.nav.groupOrganization,
        items: [
          { label: as.nav.departments, href: `/o/${slug}/departments`, icon: <DepartmentIcon /> },
          { label: as.nav.settings, href: `/o/${slug}/settings`, icon: <SettingsIcon /> },
        ],
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slug, as]
  );

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/auth");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full">
        <aside
          className="sticky top-0 hidden min-h-screen shrink-0 border-r border-[var(--border)] px-4 py-5 xl:flex xl:w-[var(--sidebar-width)] xl:flex-col"
          style={{ background: "var(--background-sidebar)" }}
        >
          <Link href={`/o/${slug}/dashboard`} className="mb-8 flex items-center gap-3 px-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--card-strong)] alamin-glow">
              <div className="h-5 w-5 rounded-full bg-[linear-gradient(135deg,#6d5efc_0%,#37cfff_100%)]" />
            </div>
            <div>
              <div className="text-[18px] font-black tracking-[-0.03em] text-[var(--foreground)]">
                ALAMIN
              </div>
              <div className="text-xs text-[var(--foreground-faint)]">
                AI Performance Intelligence
              </div>
            </div>
          </Link>

          <div className="rounded-[26px] border border-[var(--border)] bg-[var(--card)] p-4 alamin-shadow">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
              {as.orgLabel}
            </div>
            <div className="mt-3 text-2xl font-bold text-[var(--foreground)]">{slug}</div>
            <div className="mt-2 truncate text-sm text-[var(--foreground-muted)]">
              {sessionEmail ?? "workspace@company.com"}
            </div>
          </div>

          <nav className="mt-6 space-y-5 overflow-y-auto">
            {navGroups.map((group) => (
              <div key={group.label}>
                <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--foreground-faint)]">
                  {group.label}
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "group flex items-center gap-3 rounded-[16px] border px-3 py-2.5 transition",
                          active
                            ? "border-[var(--border-active)] text-[var(--nav-item-active-text)]"
                            : "border-transparent text-[var(--nav-item)] hover:border-[var(--border)] hover:bg-[var(--nav-item-hover-bg)]"
                        )}
                        style={{
                          background: active ? "var(--nav-item-active-bg)" : undefined,
                        }}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--button-secondary-bg)]">
                          {item.icon}
                        </span>
                        <span className="text-[14px] font-medium">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-auto pt-6">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-[20px] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--card-strong)]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] text-sm font-bold text-[var(--foreground)]">
                {String(sessionEmail ?? "A").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[var(--foreground)]">
                  {sessionEmail ?? "Account"}
                </div>
                <div className="text-xs text-[var(--foreground-faint)]">{as.signOut}</div>
              </div>
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="px-5 py-5 md:px-7 xl:px-8">
            <div className="mb-7 flex flex-col gap-4 rounded-[26px] border border-[var(--border)] bg-[var(--background-panel)] px-5 py-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                  {as.performanceWorkspace}
                </div>
                <div className="mt-2 text-[15px] text-[var(--foreground-muted)]">
                  /o/{slug}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <LanguageSwitcher />
                {topActions}
              </div>
            </div>

            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function iconClass() {
  return "h-[18px] w-[18px]";
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass()}>
      <path d="M4 13h6V4H4v9Zm10 7h6V4h-6v16ZM4 20h6v-5H4v5Z" fill="currentColor" />
    </svg>
  );
}

function AiIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass()}>
      <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" fill="currentColor" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass()}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass()}>
      <path d="m12 4 8 4-8 4-8-4 8-4Z" stroke="currentColor" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass()}>
      <path d="M5 19V9m7 10V5m7 14v-7" stroke="currentColor" />
    </svg>
  );
}

function TaskIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass()}>
      <path d="M9 11.5 11 13.5 15.5 9" stroke="currentColor" />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass()}>
      <path d="M7 4h7l5 5v11H7z" stroke="currentColor" />
    </svg>
  );
}

function UserWorkIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass()}>
      <circle cx="9.5" cy="7" r="3.5" stroke="currentColor" />
    </svg>
  );
}

function DepartmentIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass()}>
      <path d="M4 20V8l8-4 8 4v12" stroke="currentColor" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass()}>
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" />
    </svg>
  );
}