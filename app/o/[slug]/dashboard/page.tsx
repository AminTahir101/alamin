"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AppPageHeader, AppShell } from "@/components/app/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import ProgressBar from "@/components/ui/ProgressBar";
import SectionCard from "@/components/ui/SectionCard";
import StatCard from "@/components/ui/StatCard";
import StatusBadge from "@/components/ui/StatusBadge";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type Cycle = { id: string; year: number; quarter: number; status: string };
type Company = {
  score: number;
  label: string;
  summary: string;
  total_objectives: number;
  active_okrs: number;
  active_kpis: number;
  open_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  task_completion_rate: number;
};
type DepartmentRow = {
  id: string;
  name: string;
  score: number;
  label: string;
  objectives: number;
  okrs: number;
  kpis: number;
  open_tasks: number;
  completed_tasks: number;
};
type ObjectiveRow = {
  id: string;
  title: string;
  status: string;
  progress: number;
  department_id?: string | null;
  department_name?: string | null;
  okr_count: number;
};
type KpiRow = {
  id: string;
  title: string;
  description?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  current_value: number;
  target_value: number;
  weight: number;
  score: number;
  label: string;
  updated_at: string;
};
type TaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  department_id?: string | null;
  department_name?: string | null;
  assigned_to_user_id?: string | null;
  due_date?: string | null;
};
type DashboardResponse = {
  ok: boolean;
  org?: { id: string; slug: string; name: string };
  cycle?: Cycle | null;
  company?: Company;
  departments?: DepartmentRow[];
  objectives?: ObjectiveRow[];
  kpis?: KpiRow[];
  tasks?: TaskRow[];
  ai_report?: { title: string; summary: string | null; created_at: string } | null;
  role?: string;
  visibility?: string;
  error?: string;
};

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

async function safeParseJson(text: string): Promise<unknown> {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function numberFmt(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString() : "—";
}

function toneFromStatus(status?: string | null) {
  const value = String(status ?? "").toLowerCase();
  if (["on track", "on_track", "completed", "done", "active"].includes(value)) return "success" as const;
  if (["at risk", "at_risk", "blocked", "high"].includes(value)) return "warning" as const;
  if (["off track", "off_track", "cancelled", "critical"].includes(value)) return "danger" as const;
  if (["in_progress", "in progress", "todo", "pending_approval"].includes(value)) return "info" as const;
  return "neutral" as const;
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

function cycleLabel(cycle?: Cycle | null, fallback = "No active cycle") {
  if (!cycle) return fallback;
  return `Q${cycle.quarter} ${cycle.year} · ${cycle.status}`;
}

function healthTone(score: number) {
  if (score >= 85) return "success" as const;
  if (score >= 60) return "warning" as const;
  return "danger" as const;
}

function completionFromValues(current: number, target: number) {
  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) return 0;
  return clamp((current / target) * 100);
}

function taskUrgencyTone(priority?: string | null) {
  const value = String(priority ?? "").toLowerCase();
  if (value === "critical") return "danger" as const;
  if (value === "high") return "warning" as const;
  if (value === "medium") return "info" as const;
  return "neutral" as const;
}

function tonePanelClass(tone: "success" | "warning" | "danger" | "info") {
  switch (tone) {
    case "success":
      return "border-emerald-500/20 bg-[linear-gradient(180deg,rgba(34,197,94,0.10),rgba(34,197,94,0.04))]";
    case "warning":
      return "border-amber-500/20 bg-[linear-gradient(180deg,rgba(245,158,11,0.10),rgba(245,158,11,0.04))]";
    case "danger":
      return "border-red-500/20 bg-[linear-gradient(180deg,rgba(239,68,68,0.10),rgba(239,68,68,0.04))]";
    case "info":
      return "border-sky-500/20 bg-[linear-gradient(180deg,rgba(56,189,248,0.10),rgba(56,189,248,0.04))]";
  }
}

export default function DashboardPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const orgSlug = String(params?.slug ?? "").trim();
  const { t } = useLanguage();
  const pg = t.pages.dashboard;

  const ls = (status: string | null | undefined): string => {
    if (!status) return "—";
    const lower = status.toLowerCase().replace(/_/g, " ");
    const c = t.pages.common;
    const m: Record<string, string> = {
      "on track": c.onTrack,
      "off track": c.offTrack,
      "at risk": c.atRisk,
      "blocked": c.blocked,
      "healthy": c.healthy,
      "completed": c.completed,
      "done": c.completed,
      "active": c.active,
      "inactive": c.inactive,
    };
    return m[lower] ?? status;
  };

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [objectives, setObjectives] = useState<ObjectiveRow[]>([]);
  const [kpis, setKpis] = useState<KpiRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [aiReport, setAiReport] = useState<DashboardResponse["ai_report"]>(null);
  const [role, setRole] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<string | null>(null);

  const ensureAuth = useCallback(async (): Promise<Session | null> => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    setSessionEmail(session?.user?.email ?? null);

    if (!session) {
      router.replace("/auth");
      return null;
    }

    return session;
  }, [router]);

  const loadDashboard = useCallback(async () => {
    setMsg(null);
    setLoading(true);

    try {
      const session = await ensureAuth();
      if (!session) return;

      const apiUrl = new URL(
        `/api/o/${encodeURIComponent(orgSlug)}/dashboard`,
        window.location.origin
      ).toString();

      const res = await fetch(apiUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });

      const raw = await res.text();
      const parsed = (await safeParseJson(raw)) as DashboardResponse | null;

      if (!res.ok || !parsed || parsed.ok !== true) {
        throw new Error(parsed?.error || raw || `Failed (HTTP ${res.status})`);
      }

      setCycle(parsed.cycle ?? null);
      setCompany(parsed.company ?? null);
      setDepartments(Array.isArray(parsed.departments) ? parsed.departments : []);
      setObjectives(Array.isArray(parsed.objectives) ? parsed.objectives : []);
      setKpis(Array.isArray(parsed.kpis) ? parsed.kpis : []);
      setTasks(Array.isArray(parsed.tasks) ? parsed.tasks : []);
      setAiReport(parsed.ai_report ?? null);
      setRole(parsed.role ?? null);
      setVisibility(parsed.visibility ?? null);
    } catch (error: unknown) {
      setMsg(getErrorMessage(error, "Failed to load dashboard"));
    } finally {
      setLoading(false);
    }
  }, [ensureAuth, orgSlug]);

  useEffect(() => {
    if (!orgSlug) return;
    void loadDashboard();
  }, [orgSlug, loadDashboard]);

  const stats = useMemo(() => {
    const companyScore = clamp(Number(company?.score ?? 0));
    const activeObjectives = company?.total_objectives ?? objectives.length;
    const activeOkrs = company?.active_okrs ?? 0;
    const activeKpis = company?.active_kpis ?? kpis.length;
    const openTasks =
      company?.open_tasks ??
      tasks.filter((task) => !["done", "cancelled"].includes(task.status)).length;
    const completedTasks =
      company?.completed_tasks ?? tasks.filter((task) => task.status === "done").length;
    const overdueTasks = company?.overdue_tasks ?? 0;
    const taskCompletionRate = clamp(Number(company?.task_completion_rate ?? 0));
    const atRiskKpis = kpis.filter((kpi) => kpi.score < 60).length;
    const onTrackKpis = kpis.filter((kpi) => kpi.score >= 85).length;
    const blockedTasks = tasks.filter((task) => task.status === "blocked").length;
    const completedObjectives = objectives.filter(
      (objective) => objective.progress >= 100 || objective.status === "completed"
    ).length;

    return {
      companyScore,
      activeObjectives,
      activeOkrs,
      activeKpis,
      openTasks,
      completedTasks,
      overdueTasks,
      taskCompletionRate,
      atRiskKpis,
      onTrackKpis,
      blockedTasks,
      completedObjectives,
    };
  }, [company, objectives, kpis, tasks]);

  const topRiskKpis = useMemo(
    () => [...kpis].sort((a, b) => a.score - b.score).slice(0, 5),
    [kpis]
  );

  const topObjectives = useMemo(
    () => [...objectives].sort((a, b) => a.progress - b.progress).slice(0, 5),
    [objectives]
  );

  const executionPulse = useMemo(
    () =>
      [...tasks]
        .filter((task) => task.status !== "done" && task.status !== "cancelled")
        .sort((a, b) => {
          const aCritical = a.priority === "critical" ? 1 : 0;
          const bCritical = b.priority === "critical" ? 1 : 0;
          if (aCritical !== bCritical) return bCritical - aCritical;
          const aDate = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
          const bDate = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
          return aDate - bDate;
        })
        .slice(0, 6),
    [tasks]
  );

  const strongestDepartments = useMemo(
    () => [...departments].sort((a, b) => b.score - a.score).slice(0, 3),
    [departments]
  );

  const weakestDepartments = useMemo(
    () => [...departments].sort((a, b) => a.score - b.score).slice(0, 3),
    [departments]
  );

  const aiHeadline = useMemo(() => {
    if (stats.overdueTasks > 0) {
      return stats.overdueTasks === 1
        ? pg.aiHeadlineOverdueSingle
        : pg.aiHeadlineOverduePlural.replace("{count}", numberFmt(stats.overdueTasks));
    }
    if (stats.atRiskKpis > 0) {
      return stats.atRiskKpis === 1
        ? pg.aiHeadlineKPISingle
        : pg.aiHeadlineKPIPlural.replace("{count}", numberFmt(stats.atRiskKpis));
    }
    if (stats.companyScore >= 85) return pg.aiHeadlineHealthy;
    if (stats.companyScore >= 60) return pg.aiHeadlineMoving;
    return pg.aiHeadlinePressure;
  }, [stats.atRiskKpis, stats.companyScore, stats.overdueTasks, pg]);

  const aiSubtext = useMemo(() => {
    if (aiReport?.summary) return aiReport.summary;
    if (!cycle) return pg.aiSubtextNoCycle;
    return pg.aiSubtextDefault;
  }, [aiReport, cycle, pg]);

  const quickActions = useMemo(
    () => [
      { label: pg.openAI, href: `/o/${orgSlug}/your-ai` },
      { label: pg.qaCreateObjective, href: `/o/${orgSlug}/objectives` },
      { label: pg.qaViewKPIs, href: `/o/${orgSlug}/kpis` },
      { label: pg.qaReviewTasks, href: `/o/${orgSlug}/tasks` },
    ],
    [orgSlug, pg]
  );

  const refreshDashboard = useCallback(async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  }, [loadDashboard]);

  return (
    <AppShell
      slug={orgSlug}
      sessionEmail={sessionEmail}
      topActions={
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/o/${orgSlug}/your-ai`}
            className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-medium text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
          >
            {pg.openAI}
          </Link>
          <button
            type="button"
            onClick={() => void refreshDashboard()}
            disabled={refreshing}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? pg.refreshing : pg.refresh}
          </button>
        </div>
      }
    >
      <AppPageHeader
        eyebrow={cycleLabel(cycle, t.pages.common.noActiveCycle)}
        title={pg.title}
        description={pg.description}
      />

      {loading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-36 animate-pulse rounded-[28px] border border-[var(--border)] bg-[var(--card)]"
            />
          ))}
        </div>
      ) : (
        <>
          {msg ? (
            <div className="mb-6 rounded-[22px] border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-700 dark:text-red-100">
              {msg}
            </div>
          ) : null}

          <section className="mb-6 overflow-hidden rounded-[32px] border border-[var(--border-strong)] bg-[var(--background-elevated)] alamin-glow">
            <div className="grid gap-6 p-6 md:p-7 xl:grid-cols-[1.2fr_0.8fr]">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                  <span className="h-2 w-2 rounded-full bg-[var(--accent-2)]" />
                  {pg.aiCommand}
                </div>

                <h2 className="mt-5 text-3xl font-semibold tracking-tight text-[var(--foreground)] md:text-4xl">
                  {aiHeadline}
                </h2>

                <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--foreground-muted)]">
                  {aiSubtext}
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  {quickActions.map((action) => (
                    <Link
                      key={action.href}
                      href={action.href}
                      className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-semibold text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
                    >
                      {action.label}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="grid gap-3">
                <InsightMetric
                  label={pg.companyHealth}
                  value={`${numberFmt(stats.companyScore)}%`}
                  tone={healthTone(stats.companyScore)}
                  hint={company?.label ? ls(company.label) : t.pages.common.notEnoughData}
                />
                <InsightMetric
                  label={pg.kpisAtRisk}
                  value={numberFmt(stats.atRiskKpis)}
                  tone={stats.atRiskKpis > 0 ? "warning" : "success"}
                  hint={`${numberFmt(stats.onTrackKpis)} ${pg.onTrackSuffix}`}
                />
                <InsightMetric
                  label={pg.openTasks}
                  value={numberFmt(stats.openTasks)}
                  tone={
                    stats.overdueTasks > 0
                      ? "danger"
                      : stats.blockedTasks > 0
                        ? "warning"
                        : "info"
                  }
                  hint={`${numberFmt(stats.overdueTasks)} ${pg.overdueSuffix} · ${numberFmt(stats.blockedTasks)} ${pg.blockedSuffix}`}
                />
              </div>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title={pg.companyScore}
              value={numberFmt(stats.companyScore)}
              hint={company?.label ? ls(company.label) : t.pages.common.notEnoughData}
              trend={pg.currentHealthBlend}
              tone={healthTone(stats.companyScore)}
            />
            <StatCard
              title={pg.objectives}
              value={numberFmt(stats.activeObjectives)}
              hint={`${numberFmt(stats.completedObjectives)} ${pg.completedOrProgressed}`}
              tone="info"
            />
            <StatCard
              title={pg.openTasks}
              value={numberFmt(stats.openTasks)}
              hint={`${numberFmt(stats.completedTasks)} ${pg.completedSuffix} · ${numberFmt(stats.overdueTasks)} ${pg.overdueSuffix}`}
              tone={stats.overdueTasks > 0 ? "warning" : "success"}
            />
            <StatCard
              title={pg.activeOKRsKPIs}
              value={`${numberFmt(stats.activeOkrs)} / ${numberFmt(stats.activeKpis)}`}
              hint={`${pg.taskCompletionPrefix} ${numberFmt(stats.taskCompletionRate)}%`}
              tone="default"
            />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <SectionCard
              title={pg.executiveSummary}
              subtitle={
                visibility
                  ? `${pg.viewScopePrefix} ${visibility} · ${pg.rolePrefix} ${role ?? "member"}`
                  : pg.executiveSummarySubtitle
              }
            >
              <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card-soft)] p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                    {pg.currentHealth}
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-4">
                    <div className="text-5xl font-black tracking-[-0.04em] text-[var(--foreground)]">
                      {numberFmt(stats.companyScore)}
                    </div>
                    <StatusBadge tone={toneFromStatus(company?.label)}>
                      {company?.label ? ls(company.label) : t.pages.common.notEnoughData}
                    </StatusBadge>
                  </div>
                  <div className="mt-5">
                    <ProgressBar value={stats.companyScore} />
                  </div>
                  <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">
                    {company?.summary ??
                      "Performance summary will appear here once snapshots and AI analysis have enough data."}
                  </p>
                </div>

                <div className="grid gap-3">
                  <SummaryStrip label={pg.cycleLabel} value={cycleLabel(cycle, t.pages.common.noActiveCycle)} />
                  <SummaryStrip label={pg.departments} value={numberFmt(departments.length)} />
                  <SummaryStrip
                    label={pg.tasksCompleted}
                    value={`${numberFmt(stats.taskCompletionRate)}%`}
                  />
                  <SummaryStrip label={pg.kpisAtRisk} value={numberFmt(stats.atRiskKpis)} />
                  <SummaryStrip label={pg.blockedTasks} value={numberFmt(stats.blockedTasks)} />
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title={pg.mach3}
              subtitle={pg.mach3Subtitle}
              className="bg-[linear-gradient(180deg,rgba(109,94,252,0.08),rgba(55,207,255,0.03))]"
              actions={
                <Link
                  href={`/o/${orgSlug}/your-ai`}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-sm font-semibold text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
                >
                  {pg.openAIBtn}
                </Link>
              }
            >
              {aiReport ? (
                <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card-soft)] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-[var(--foreground)]">
                        {aiReport.title}
                      </div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[var(--foreground-faint)]">
                        {fmtDate(aiReport.created_at)}
                      </div>
                    </div>
                    <StatusBadge tone="info">Mach3</StatusBadge>
                  </div>

                  <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">
                    {aiReport.summary ?? "No AI summary was stored for the latest report."}
                  </p>

                  <div className="mt-5 grid gap-3">
                    <ActionChip
                      label={pg.aiActionFind}
                      href={`/o/${orgSlug}/your-ai`}
                    />
                    <ActionChip
                      label={pg.aiActionTurnKPIs}
                      href={`/o/${orgSlug}/your-ai`}
                    />
                    <ActionChip
                      label={pg.aiActionBreakOKRs}
                      href={`/o/${orgSlug}/tasks`}
                    />
                  </div>
                </div>
              ) : (
                <EmptyState
                  title={pg.noReportTitle}
                  description={pg.noReportDesc}
                />
              )}
            </SectionCard>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <SectionCard title={pg.departmentPerf} subtitle={pg.departmentPerfSubtitle}>
              {departments.length ? (
                <div className="grid gap-5">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <DepartmentBucket
                      title={pg.leading}
                      subtitle={pg.leadingSubtitle}
                      rows={strongestDepartments}
                    />
                    <DepartmentBucket
                      title={pg.needsAttention}
                      subtitle={pg.needsAttentionSubtitle}
                      rows={weakestDepartments}
                    />
                  </div>

                  <div className="grid gap-4">
                    {departments.map((department) => (
                      <div
                        key={department.id}
                        className="rounded-[22px] border border-[var(--border)] bg-[var(--card-soft)] p-4"
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="text-base font-semibold text-[var(--foreground)]">
                              {department.name}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <StatusBadge tone={toneFromStatus(department.label)}>
                                {ls(department.label)}
                              </StatusBadge>
                              <span className="text-xs text-[var(--foreground-faint)]">
                                {department.objectives} {pg.objectivesSuffix}
                              </span>
                              <span className="text-xs text-[var(--foreground-faint)]">
                                {department.okrs} OKRs
                              </span>
                              <span className="text-xs text-[var(--foreground-faint)]">
                                {department.kpis} KPIs
                              </span>
                            </div>
                            <div className="mt-3 text-sm text-[var(--foreground-muted)]">
                              {department.open_tasks} {pg.openSuffix} · {department.completed_tasks} {pg.completedSuffix}
                            </div>
                          </div>

                          <div className="min-w-[190px]">
                            <div className="mb-2 text-right text-2xl font-black tracking-[-0.03em] text-[var(--foreground)]">
                              {numberFmt(department.score)}
                            </div>
                            <ProgressBar value={department.score} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState
                  title={pg.noDepartmentsTitle}
                  description={pg.noDepartmentsDesc}
                />
              )}
            </SectionCard>

            <SectionCard title={pg.urgentSection} subtitle={pg.urgentSubtitle}>
              <div className="grid gap-3">
                <AlertRow
                  title={pg.overdueTasks}
                  value={numberFmt(stats.overdueTasks)}
                  tone={stats.overdueTasks > 0 ? "danger" : "success"}
                  desc={pg.overdueTasksDesc}
                />
                <AlertRow
                  title={pg.blockedTasks}
                  value={numberFmt(stats.blockedTasks)}
                  tone={stats.blockedTasks > 0 ? "warning" : "success"}
                  desc={pg.blockedTasksDesc}
                />
                <AlertRow
                  title={pg.kpisFalling}
                  value={numberFmt(stats.atRiskKpis)}
                  tone={stats.atRiskKpis > 0 ? "warning" : "success"}
                  desc={pg.kpisFallingDesc}
                />
                <AlertRow
                  title={pg.cycleProgress}
                  value={cycle ? cycle.status : "none"}
                  tone={cycle ? "info" : "danger"}
                  desc={pg.cycleProgressDesc}
                />
              </div>
            </SectionCard>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_1.2fr]">
            <SectionCard
              title={pg.kpisToWatch}
              subtitle={pg.kpisToWatchSubtitle}
            >
              {topRiskKpis.length ? (
                <div className="grid gap-4">
                  {topRiskKpis.map((kpi) => {
                    const completion = completionFromValues(
                      kpi.current_value,
                      kpi.target_value
                    );

                    return (
                      <div
                        key={kpi.id}
                        className="rounded-[22px] border border-[var(--border)] bg-[var(--card-soft)] p-4"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-base font-semibold text-[var(--foreground)]">
                                {kpi.title}
                              </div>
                              <StatusBadge tone={toneFromStatus(kpi.label)}>
                                {ls(kpi.label)}
                              </StatusBadge>
                            </div>

                            {kpi.description ? (
                              <div className="mt-2 text-sm leading-6 text-[var(--foreground-muted)]">
                                {kpi.description}
                              </div>
                            ) : null}

                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--foreground-faint)]">
                              <span>{kpi.department_name ?? "Company-wide"}</span>
                              <span>•</span>
                              <span>
                                {numberFmt(kpi.current_value)} / {numberFmt(kpi.target_value)}
                              </span>
                              <span>•</span>
                              <span>{pg.updatedPrefix} {fmtDate(kpi.updated_at)}</span>
                            </div>
                          </div>

                          <div className="w-full max-w-[220px]">
                            <div className="mb-2 flex items-center justify-between text-sm text-[var(--foreground-muted)]">
                              <span>{pg.scoreLabel}</span>
                              <span className="font-semibold text-[var(--foreground)]">
                                {numberFmt(kpi.score)}%
                              </span>
                            </div>
                            <ProgressBar value={kpi.score} />
                            <div className="mt-4 text-sm text-[var(--foreground-muted)]">
                              {pg.progressToTarget}{" "}
                              <span className="font-semibold text-[var(--foreground)]">
                                {numberFmt(completion)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title={pg.noKPIsTitle}
                  description={pg.noKPIsDesc}
                />
              )}
            </SectionCard>

            <SectionCard
              title={pg.workInMotion}
              subtitle={pg.workInMotionSubtitle}
            >
              {executionPulse.length ? (
                <div className="grid gap-3">
                  {executionPulse.map((task) => (
                    <div
                      key={task.id}
                      className="rounded-[20px] border border-[var(--border)] bg-[var(--card-soft)] p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <div className="font-semibold text-[var(--foreground)]">
                            {task.title}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <StatusBadge tone={toneFromStatus(task.status)}>
                              {ls(task.status)}
                            </StatusBadge>
                            <StatusBadge tone={taskUrgencyTone(task.priority)}>
                              {task.priority}
                            </StatusBadge>
                            <span className="text-xs text-[var(--foreground-faint)]">
                              {task.department_name ?? "Company-wide"}
                            </span>
                          </div>
                        </div>
                        <div className="text-sm text-[var(--foreground-muted)]">
                          {pg.duePrefix} {fmtDate(task.due_date)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title={pg.noTasksTitle}
                  description={pg.noTasksDesc}
                />
              )}
            </SectionCard>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <SectionCard
              title={pg.objectivesInFocus}
              subtitle={pg.objectivesInFocusSubtitle}
            >
              {topObjectives.length ? (
                <div className="grid gap-3">
                  {topObjectives.map((objective) => (
                    <div
                      key={objective.id}
                      className="rounded-[20px] border border-[var(--border)] bg-[var(--card-soft)] p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <div className="font-semibold text-[var(--foreground)]">
                            {objective.title}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <StatusBadge tone={toneFromStatus(objective.status)}>
                              {ls(objective.status)}
                            </StatusBadge>
                            <span className="text-xs text-[var(--foreground-faint)]">
                              {objective.department_name ?? "Company-wide"}
                            </span>
                            <span className="text-xs text-[var(--foreground-faint)]">
                              {objective.okr_count} OKRs
                            </span>
                          </div>
                        </div>
                        <div className="min-w-[190px]">
                          <div className="mb-2 text-right text-xl font-black tracking-[-0.03em] text-[var(--foreground)]">
                            {numberFmt(objective.progress)}%
                          </div>
                          <ProgressBar value={objective.progress} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title={pg.noObjectivesTitle}
                  description={pg.noObjectivesDesc}
                />
              )}
            </SectionCard>

            <SectionCard
              title={pg.jumpInto}
              subtitle={pg.jumpIntoSubtitle}
              className="bg-[linear-gradient(180deg,rgba(109,94,252,0.08),rgba(55,207,255,0.03))]"
            >
              <div className="grid gap-3">
                <QuickLinkCard
                  href={`/o/${orgSlug}/your-ai`}
                  title={pg.diagnose}
                  desc={pg.diagnoseDesc}
                />
                <QuickLinkCard
                  href={`/o/${orgSlug}/objectives`}
                  title={pg.reviewObjectives}
                  desc={pg.reviewObjectivesDesc}
                />
                <QuickLinkCard
                  href={`/o/${orgSlug}/kpis`}
                  title={pg.updateKPIs}
                  desc={pg.updateKPIsDesc}
                />
                <QuickLinkCard
                  href={`/o/${orgSlug}/tasks`}
                  title={pg.resolveBlocked}
                  desc={pg.resolveBlockedDesc}
                />
              </div>
            </SectionCard>
          </div>
        </>
      )}
    </AppShell>
  );
}

function InsightMetric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "success" | "warning" | "danger" | "info";
}) {
  return (
    <div className={`rounded-[22px] border p-4 ${tonePanelClass(tone)}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
        {label}
      </div>
      <div className="mt-3 text-3xl font-black tracking-[-0.03em] text-[var(--foreground)]">
        {value}
      </div>
      <div className="mt-2 text-sm text-[var(--foreground-muted)]">{hint}</div>
    </div>
  );
}

function SummaryStrip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[18px] border border-[var(--border)] bg-[var(--card-soft)] px-4 py-3">
      <span className="text-sm text-[var(--foreground-muted)]">{label}</span>
      <span className="text-sm font-semibold text-[var(--foreground)]">{value}</span>
    </div>
  );
}

function ActionChip({
  label,
  href,
}: {
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-sm font-semibold text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
    >
      {label}
    </Link>
  );
}

function DepartmentBucket({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: DepartmentRow[];
}) {
  const { t } = useLanguage();
  const pg = t.pages.dashboard;
  return (
    <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card-soft)] p-4">
      <div className="text-sm font-semibold text-[var(--foreground)]">{title}</div>
      <div className="mt-1 text-sm text-[var(--foreground-muted)]">{subtitle}</div>

      <div className="mt-4 grid gap-3">
        {rows.length ? (
          rows.map((row) => (
            <div
              key={`${title}-${row.id}`}
              className="flex items-center justify-between gap-4 rounded-[16px] border border-[var(--border)] bg-[var(--card-subtle)] px-4 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[var(--foreground)]">
                  {row.name}
                </div>
                <div className="mt-1 text-xs text-[var(--foreground-faint)]">
                  {row.open_tasks} {pg.openSuffix} · {row.completed_tasks} {pg.completedSuffix}
                </div>
              </div>
              <div className="text-sm font-semibold text-[var(--foreground)]">
                {numberFmt(row.score)}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[16px] border border-[var(--border)] bg-[var(--card-subtle)] px-4 py-3 text-sm text-[var(--foreground-muted)]">
            {pg.noDeptYet}
          </div>
        )}
      </div>
    </div>
  );
}

function AlertRow({
  title,
  value,
  desc,
  tone,
}: {
  title: string;
  value: string;
  desc: string;
  tone: "success" | "warning" | "danger" | "info";
}) {
  return (
    <div className={`rounded-[20px] border p-4 ${tonePanelClass(tone)}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm font-semibold text-[var(--foreground)]">{title}</div>
        <div className="text-lg font-black tracking-[-0.03em] text-[var(--foreground)]">
          {value}
        </div>
      </div>
      <div className="mt-2 text-sm text-[var(--foreground-muted)]">{desc}</div>
    </div>
  );
}

function QuickLinkCard({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-[22px] border border-[var(--border)] bg-[var(--card-soft)] p-4 transition hover:border-[var(--border-strong)] hover:bg-[var(--card-strong)]"
    >
      <div className="text-base font-semibold text-[var(--foreground)]">{title}</div>
      <div className="mt-2 text-sm leading-6 text-[var(--foreground-muted)]">{desc}</div>
    </Link>
  );
}